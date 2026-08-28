export type AttendedHandoffCapabilityLike = {
  version: "attended_handoff_v1";
  kind: "manual_handoff" | "self_submit";
  capability_sha256: string;
  url_sha256: string;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function attendedHandoffCapabilityFromUnknown(value: unknown): AttendedHandoffCapabilityLike | null {
  if (!value || typeof value !== "object") return null;
  const capability = value as Record<string, unknown>;
  if (capability.version !== "attended_handoff_v1"
    || (capability.kind !== "manual_handoff" && capability.kind !== "self_submit")
    || typeof capability.capability_sha256 !== "string"
    || !SHA256_HEX.test(capability.capability_sha256)
    || typeof capability.url_sha256 !== "string"
    || !SHA256_HEX.test(capability.url_sha256)) return null;
  return capability as AttendedHandoffCapabilityLike;
}

export function attendedHandoffCapabilitiesEqual(left: unknown, right: unknown): boolean {
  const a = attendedHandoffCapabilityFromUnknown(left);
  const b = attendedHandoffCapabilityFromUnknown(right);
  return Boolean(a && b
    && a.kind === b.kind
    && a.capability_sha256 === b.capability_sha256
    && a.url_sha256 === b.url_sha256);
}

export function canonicalAttendedCapabilityUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() !== value || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function sha256Hex(value: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function attendedHandoffCapabilityMatchesUrl(
  capabilityValue: unknown,
  expectedKind: AttendedHandoffCapabilityLike["kind"],
  urlValue: unknown,
): Promise<boolean> {
  const capability = attendedHandoffCapabilityFromUnknown(capabilityValue);
  const url = canonicalAttendedCapabilityUrl(urlValue);
  if (!capability || capability.kind !== expectedKind || !url) return false;
  return await sha256Hex(url) === capability.url_sha256;
}
