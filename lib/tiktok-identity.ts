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
  /* Something before the @ and a dotted domain after it: a bare includes("@") let
     "@" itself through to be hashed and sent, matching nobody. */
  return normalized && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? normalized : null;
}

/* Countries whose national numbers this is willing to complete to +1.
   address_country is a FREE-TEXT input, so this matches the spellings people
   actually type rather than an ISO enum. Anything not listed drops the phone,
   which is the safe direction. */
const NANP_COUNTRIES = new Set([
  "US", "USA", "U.S.", "U.S.A.", "UNITED STATES", "UNITED STATES OF AMERICA", "AMERICA",
  "CA", "CAN", "CANADA",
]);

function isNanpCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  // Strip punctuation and collapse whitespace so "u.s." and "United  States" both land.
  const cleaned = country.trim().toUpperCase().replace(/\s+/g, " ");
  return NANP_COUNTRIES.has(cleaned) || NANP_COUNTRIES.has(cleaned.replace(/[.\s]/g, ""));
}

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
  /* Reject anything not already phone-shaped BEFORE stripping. On the backend the same
     rule stops an encrypted application_profile.phone (base64 of iv/tag/ciphertext) from
     having its letters stripped away until the surviving "+" and digits pass the E.164
     test below, which fabricates a number that gets hashed as a real customer's identity
     ~2.4% of the time. This copy has no ciphertext to fear -- the API decrypts before it
     answers -- but the two rules must stay identical or one person hashes two ways. */
  if (/[A-Za-z/=]/.test(phone)) return null;
  // "00" is how much of the world writes a leading "+"; treat it as one.
  const cleaned = phone.replace(/[^\d+]/g, "").replace(/^00(?=\d)/, "+");
  // A "+" is only meaningful leading the number; embedded ones mean this was not a phone.
  if (cleaned.lastIndexOf("+") > 0) return null;
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
  }
  /* BOTH bare-national branches are country-gated, and the eleven-digit one has to
     be: "1" + ten digits is NOT unambiguously NANP. Every mainland-China mobile is
     exactly eleven digits starting with 1 (13x-19x), so 13812345678 would read as
     NANP area code 381 and hash as a different real person -- the precise collision
     this function exists to refuse. Litos's users are international students, so
     that is a live case, not a hypothetical. */
  if (!isNanpCountry(country)) return null;
  if (/^1\d{10}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\d{10}$/.test(cleaned)) return `+1${cleaned}`;
  return null;
}

/* BillingReceipt.interval carries both the canonical cadences and two legacy
   aliases ("weekly"/"monthly"). volley-backend's webhook builds its content_id from
   pricing_offers.term_code, which is only ever the canonical form, so sending the
   alias here would report ONE purchase as "litos_plus_monthly" from the browser and
   "litos_plus_month" from the webhook -- same event_id, contradictory content. */
const CANONICAL_INTERVAL: Record<string, string> = {
  weekly: "week",
  monthly: "month",
  week: "week",
  month: "month",
  quarter: "quarter",
};

/** Purchase content_id, e.g. "litos_plus_month". Mirrors volley-backend's construction. */
export function tiktokPurchaseContentId(
  plan: string | null | undefined,
  interval: string | null | undefined,
): string | undefined {
  if (!plan || !interval) return undefined;
  const term = CANONICAL_INTERVAL[interval.trim().toLowerCase()];
  // An unrecognized cadence is omitted rather than guessed: a content_id the other
  // reporter cannot produce is worse than no content_id at all.
  return term ? `${plan}_${term}` : undefined;
}
