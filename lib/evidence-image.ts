const QA_EVIDENCE_IMAGE_PATHS = new Set([
  "/qa/portal-preview.svg",
  "/qa/portal-receipt.svg",
]);

const VERCEL_BLOB_ROOT_HOST = "blob.vercel-storage.com";
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

type DataImageKind = "png" | "jpeg" | "webp";

function hasCanonicalBase64Encoding(payload: string): boolean {
  if (payload.length === 0
    || payload.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return false;

  const paddingLength = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  if (paddingLength === 0) return true;

  const finalDataCharacter = payload[payload.length - paddingLength - 1];
  const finalSextet = BASE64_ALPHABET.indexOf(finalDataCharacter);
  if (finalSextet < 0) return false;

  return paddingLength === 2
    ? (finalSextet & 0b1111) === 0
    : (finalSextet & 0b11) === 0;
}

function dataImageSignatureMatches(kind: DataImageKind, payload: string): boolean {
  try {
    const header = atob(payload.slice(0, 16));
    const byte = (index: number) => header.charCodeAt(index);

    if (kind === "png") {
      return header.length >= 8
        && byte(0) === 0x89
        && byte(1) === 0x50
        && byte(2) === 0x4e
        && byte(3) === 0x47
        && byte(4) === 0x0d
        && byte(5) === 0x0a
        && byte(6) === 0x1a
        && byte(7) === 0x0a;
    }

    if (kind === "jpeg") {
      return header.length >= 3
        && byte(0) === 0xff
        && byte(1) === 0xd8
        && byte(2) === 0xff;
    }

    return header.length >= 12
      && header.slice(0, 4) === "RIFF"
      && header.slice(8, 12) === "WEBP";
  } catch {
    return false;
  }
}

function safeDataImageUrl(value: string): string | null {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;

  const kind = match[1] as DataImageKind;
  const payload = match[2];
  return hasCanonicalBase64Encoding(payload) && dataImageSignatureMatches(kind, payload)
    ? value
    : null;
}

function isVercelBlobHost(hostname: string): boolean {
  if (hostname.length > 253) return false;
  if (hostname === VERCEL_BLOB_ROOT_HOST) return true;
  if (!hostname.endsWith(`.${VERCEL_BLOB_ROOT_HOST}`)) return false;

  const prefix = hostname.slice(0, -(VERCEL_BLOB_ROOT_HOST.length + 1));
  return prefix.split(".").every((label) => (
    label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ));
}

function safeVercelBlobImageUrl(value: string): string | null {
  const absoluteMatch = /^https:\/\/([^/?#]+)(\/[^?#]*)$/.exec(value);
  if (!absoluteMatch || absoluteMatch[1].includes("@") || absoluteMatch[1].includes(":")) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:"
      || url.username
      || url.password
      || url.port
      || !isVercelBlobHost(hostname)
      || !/\.(?:png|jpe?g|webp)$/i.test(url.pathname)) return null;
    return value;
  } catch {
    return null;
  }
}

/** Return only image sources owned by the passive evidence contract. */
export function safeEvidenceImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || /\s/.test(value)) return null;
  if (QA_EVIDENCE_IMAGE_PATHS.has(value)) return value;
  if (value.startsWith("data:")) return safeDataImageUrl(value);
  return safeVercelBlobImageUrl(value);
}
