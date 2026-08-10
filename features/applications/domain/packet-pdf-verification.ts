export type PacketPdfBinding = {
  sha256: string;
  size_bytes: number;
};

export type PacketPdfVerification =
  | { ok: true; sha256: string; size_bytes: number }
  | { ok: false; reason: "invalid_binding" | "invalid_pdf" | "size_mismatch" | "digest_mismatch" };

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies the bytes the browser is about to render against the server-owned PDF binding.
 * A download URL alone proves only that a URL exists. It does not prove that the file at that URL
 * is the PDF the packet audit approved.
 */
export async function verifyPacketPdfBytes(
  bytes: ArrayBuffer,
  binding: PacketPdfBinding,
): Promise<PacketPdfVerification> {
  const expectedSha256 = binding.sha256.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedSha256) || !Number.isSafeInteger(binding.size_bytes) || binding.size_bytes <= 0) {
    return { ok: false, reason: "invalid_binding" };
  }
  if (bytes.byteLength !== binding.size_bytes) return { ok: false, reason: "size_mismatch" };
  const signature = new TextDecoder("ascii", { fatal: true }).decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") return { ok: false, reason: "invalid_pdf" };

  const actualSha256 = hex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  if (actualSha256 !== expectedSha256) return { ok: false, reason: "digest_mismatch" };
  return { ok: true, sha256: actualSha256, size_bytes: bytes.byteLength };
}
