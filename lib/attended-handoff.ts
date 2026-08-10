import type { ApplicationReview } from "./api.ts";

export const MANAGED_NETWORK_ACCESS_RESTRICTION_REASON =
  "The application site temporarily blocked Litos's secure browser because of its network activity. This is not a CAPTCHA, and nothing was sent. Open this application in Chrome and Litos will refill the exact saved packet there.";
export const CAPTCHA_BLOCKER = "CAPTCHA requires your attention";

/**
 * Return the exact server-recorded SmartRecruiters form only for the network-restriction state
 * that authorizes an attended extension retry. A posting URL, another tenant route, or a generic
 * needs-attention state must never be armed as if it were this frozen application.
 */
export function exactAttendedHandoffUrl(review: Pick<ApplicationReview,
  "status" | "ats_name" | "attention_reason" | "extension_handoff_url">): string | null {
  if (review.status !== "needs_attention" || review.ats_name !== "smartrecruiters") return null;
  const reasons = review.attention_reason?.split("\n") ?? [];
  if (!reasons.includes(MANAGED_NETWORK_ACCESS_RESTRICTION_REASON) && !reasons.includes(CAPTCHA_BLOCKER)) return null;
  if (!review.extension_handoff_url) return null;

  try {
    const url = new URL(review.extension_handoff_url);
    if (url.protocol !== "https:" || url.hostname !== "jobs.smartrecruiters.com") return null;
    if (url.username || url.password || url.hash) return null;
    if (!/^\/oneclick-ui\/company\/[a-z0-9._-]+\/publication\/[0-9a-f-]{36}\/?$/i.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
