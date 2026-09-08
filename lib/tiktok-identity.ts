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
 * (normalizeEmailForTikTok there): the two repos cannot share a module, and a
 * rule that drifts between them silently splits one person into two unmatched
 * identities. Both repos assert the same pinned vectors so drift fails a test
 * rather than quietly costing match quality.
 */

export function normalizeEmailForTikTok(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  /* Something before the @ and a dotted domain after it: a bare includes("@") let
     "@" itself through to be hashed and sent, matching nobody. */
  return normalized && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? normalized : null;
}

/* PHONE IS DELIBERATELY NOT SENT (Mehek's call, 2026-09-08, after two review rounds).
   The only available phone was ApplicationProfile.phone, the job-application contact
   number, and gating its "+1" completion on the profile country did not make it safe:
   address_country says where a student LIVES, not where their number is from. Litos's
   users are international students in the US, so address_country "United States" plus
   a home mobile turned 13812345678 into +13812345678 -- a real stranger's US number,
   structurally valid, undetectable. A missing identifier costs a little match quality;
   a wrong one attributes a purchase to somebody else. Email carries the matching. */

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
