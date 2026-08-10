import type { ApplicationReview } from "./api.ts";

export const MANAGED_NETWORK_ACCESS_RESTRICTION_REASON =
  "The application site temporarily blocked Litos's secure browser because of its network activity. This is not a CAPTCHA, and nothing was sent. Open this application in Chrome and Litos will refill the exact saved packet there.";
export const CAPTCHA_BLOCKER = "CAPTCHA requires your attention";
export const JOBVITE_ATTENDED_GATE_REASON =
  "This company asks you to agree to their privacy notice before the application form opens. That choice is yours to make, so Litos stops here. Open the page and pick your country, and the form appears.";
export const ICIMS_ATTENDED_GATE_REASON =
  "This company asks you to make an account and prove you are human before the application form opens. Litos cannot do either of those for you, so this one needs your hands.";
export const ICIMS_SECURITY_CODE_GATE_REASON =
  "This iCIMS account page is waiting for a security code sent to the stored Litos application email. Litos did not enter the code or submit the application. Open the page and finish the account check in Chrome.";
export const BAMBOOHR_ATTENDED_GATE_REASON =
  "This company’s application page asks you to prove you are human. Litos filled everything in, so all that is left is that check and the send button.";

function exactManagedAccountGateUrl(atsName: string, rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
    if (atsName === "jobvite") {
      if (url.hostname !== "jobs.jobvite.com") return null;
      return /^\/[a-z0-9._-]+\/job\/[a-z0-9]+\/apply$/i.test(url.pathname) ? url.toString() : null;
    }
    if (atsName === "icims") {
      if (!/^(?!(?:www|community|login|api)\.)[a-z0-9-]+\.icims\.com$/i.test(url.hostname)) return null;
      return /^\/jobs\/\d+\/[a-z0-9%._~-]+\/login$/i.test(url.pathname) ? url.toString() : null;
    }
    if (atsName === "bamboohr") {
      if (!/^(?!(?:www|app|api|support)\.)[a-z0-9-]+\.bamboohr\.com$/i.test(url.hostname)) return null;
      return /^\/careers\/\d+\/?$/.test(url.pathname) ? url.toString() : null;
    }
    return null;
  } catch {
    return null;
  }
}

function managedAccountGateIdentity(atsName: string, rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (atsName === "jobvite" && url.hostname === "jobs.jobvite.com") {
      const match = /^\/([a-z0-9._-]+)\/job\/([a-z0-9]+)(?:\/apply)?\/?$/i.exec(url.pathname);
      return match ? `${url.origin}/${match[1]}/job/${match[2]}` : null;
    }
    if (atsName === "icims" && /^(?!(?:www|community|login|api)\.)[a-z0-9-]+\.icims\.com$/i.test(url.hostname)) {
      const match = /^\/jobs\/(\d+)\/[a-z0-9%._~-]+\/(?:job|login)\/?$/i.exec(url.pathname);
      return match ? `${url.origin}/jobs/${match[1]}` : null;
    }
    if (atsName === "bamboohr" && /^(?!(?:www|app|api|support)\.)[a-z0-9-]+\.bamboohr\.com$/i.test(url.hostname)) {
      const match = /^\/careers\/(\d+)\/?$/.exec(url.pathname);
      return match ? `${url.origin}/careers/${match[1]}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Return only the exact server-recorded form for a typed attended extension recovery. A posting
 * URL, a generic account wall, or another needs-attention state must never be armed as if it were
 * this frozen application.
 */
export function exactAttendedHandoffUrl(review: Pick<ApplicationReview,
  "status" | "ats_name" | "attention_reason" | "extension_handoff_url" | "portal_url">): string | null {
  if (review.status !== "needs_attention") return null;
  const reasons = review.attention_reason?.split("\n") ?? [];
  if (!review.extension_handoff_url) return null;

  if (review.ats_name === "jobvite") {
    if (!reasons.includes(JOBVITE_ATTENDED_GATE_REASON)) return null;
    const handoffUrl = exactManagedAccountGateUrl(review.ats_name, review.extension_handoff_url);
    return handoffUrl
      && review.portal_url
      && managedAccountGateIdentity(review.ats_name, review.portal_url) === managedAccountGateIdentity(review.ats_name, handoffUrl)
      ? handoffUrl
      : null;
  }
  if (review.ats_name === "icims") {
    if (!reasons.includes(ICIMS_ATTENDED_GATE_REASON) && !reasons.includes(ICIMS_SECURITY_CODE_GATE_REASON)) return null;
    const handoffUrl = exactManagedAccountGateUrl(review.ats_name, review.extension_handoff_url);
    return handoffUrl
      && review.portal_url
      && managedAccountGateIdentity(review.ats_name, review.portal_url) === managedAccountGateIdentity(review.ats_name, handoffUrl)
      ? handoffUrl
      : null;
  }
  if (review.ats_name === "bamboohr") {
    if (!reasons.includes(BAMBOOHR_ATTENDED_GATE_REASON)) return null;
    const handoffUrl = exactManagedAccountGateUrl(review.ats_name, review.extension_handoff_url);
    return handoffUrl
      && review.portal_url
      && managedAccountGateIdentity(review.ats_name, review.portal_url) === managedAccountGateIdentity(review.ats_name, handoffUrl)
      ? handoffUrl
      : null;
  }
  if (review.ats_name !== "smartrecruiters") return null;
  if (!reasons.includes(MANAGED_NETWORK_ACCESS_RESTRICTION_REASON) && !reasons.includes(CAPTCHA_BLOCKER)) return null;

  try {
    const url = new URL(review.extension_handoff_url);
    if (url.protocol !== "https:" || url.hostname !== "jobs.smartrecruiters.com" || url.port) return null;
    if (url.username || url.password || url.hash) return null;
    if (!/^\/oneclick-ui\/company\/[a-z0-9._-]+\/publication\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
