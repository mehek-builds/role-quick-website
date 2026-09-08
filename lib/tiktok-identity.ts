/* Advanced Matching identifiers for TikTok (Event Match Quality).
 *
 * Pure string normalization only, so this is safe to import from both client
 * and server code. The actual SHA-256 hashing lives in lib/tiktok-events.ts
 * (server-only, node:crypto): the browser pixel must NOT hash by hand, because
 * ttq.identify() hashes internally and hashing twice matches nothing.
 *
 * Normalization has to happen before the hash on both sides, or our digest
 * will not equal the one TikTok derived from the same person.
 *
 * Kept in sync BY HAND with volley-backend's src/lib/tiktokEvents.ts
 * (normalizeEmailForTikTok / normalizePhoneE164ForTikTok there): the two repos
 * cannot share a module, and a rule that drifts between them silently splits
 * one person into two unmatched identities.
 */

export function normalizeEmailForTikTok(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

/* Countries whose national numbers this is willing to complete to +1. */
const NANP_COUNTRIES = new Set(["US", "USA", "UNITED STATES", "CA", "CAN", "CANADA"]);

/**
 * E.164 ("+" then country code then subscriber digits), or null when the country
 * cannot be established.
 *
 * `country` is the applicant's stated country (ApplicationProfile.address_country).
 * A bare national number is only completed when that country is a known NANP one:
 * ten digits is NOT self-evidently American (a London number minus its trunk 0 is
 * also ten digits), and stamping +1 on one yields a hash that can collide with a
 * different real person. A wrong identity is worse than no identity.
 */
export function normalizePhoneE164ForTikTok(
  phone: string | null | undefined,
  country?: string | null,
): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
  }
  // "1" + ten digits is unambiguous NANP whatever the profile says.
  if (/^1\d{10}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\d{10}$/.test(cleaned)) {
    const declared = country?.trim().toUpperCase();
    return declared && NANP_COUNTRIES.has(declared) ? `+1${cleaned}` : null;
  }
  return null;
}

/** Purchase content_id, e.g. "litos_plus_month". Mirrors volley-backend's construction. */
export function tiktokPurchaseContentId(
  plan: string | null | undefined,
  interval: string | null | undefined,
): string | undefined {
  if (!plan || !interval) return undefined;
  return `${plan}_${interval}`;
}
