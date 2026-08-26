/**
 * The "waiting on you" queue.
 *
 * When an application stops on a human-verification check, the check can only be answered by the
 * person whose application it is. That used to mean sending them to the employer's own site in a
 * fresh tab, refilled only if the browser extension happened to be installed and signed in there.
 * It now means reopening the application inside Litos's own dashboard first: the review screen it
 * lands on (`SubmissionScreen`, `app/dashboard/applications/page.tsx`) owns the actual decision of
 * how to finish - a live in-dashboard fill where the infrastructure supports it, the extension where
 * an ATS family still requires it, or a plain retry otherwise - so this queue's only job is to get
 * the applicant to that screen and let it decide, not to promise a specific mechanism itself.
 *
 * So this is not a work queue anyone else can drain: it is a list pointed at its owner, and the only
 * useful thing it can do is get them back to the right screen quickly.
 *
 * Ordered oldest first, which is the whole promise. The application nobody has dealt with is exactly
 * the one that keeps getting re-observed, so any ordering that responds to recent activity would
 * bury the worst case under the newest one.
 */

export type StallInfo = {
  kind: "human_verification";
  stalled_at: string;
  surface: "server_run" | "extension";
  provider: "recaptcha_v2" | "recaptcha_v3" | "hcaptcha" | "turnstile" | "arkose" | "unknown";
  stage: "before_fill" | "at_submit";
  source: "observed" | "assumed";
  resolved_at?: string;
};

export type WaitingApplication = {
  id: string;
  company: string;
  role: string;
  stalledAt: string;
  stage: "before_fill" | "at_submit";
};

type ReviewLike = {
  status?: string;
  stall?: StallInfo;
};

type PacketLike = {
  id: string;
  job_context?: { company?: string; role?: string } | null;
  spec?: { _review?: ReviewLike } | null;
};

/**
 * Status is the authority on whether the applicant still owes something; the stall only says the
 * reason is a human-verification check.
 *
 * Both halves are required. Status alone sweeps in every other reason an application needs
 * attention - a missing field, an unanswered attestation - and this queue promises something
 * narrower than that. An open stall alone would resurrect finished work.
 */
export function isWaitingOnHuman(review: ReviewLike | null | undefined): boolean {
  return review?.status === "needs_attention" && !!review.stall && !review.stall.resolved_at;
}

export function waitingApplications(packets: readonly PacketLike[]): WaitingApplication[] {
  return packets
    .filter((packet) => isWaitingOnHuman(packet.spec?._review))
    .map((packet) => ({
      id: packet.id,
      company: packet.job_context?.company?.trim() || "This company",
      role: packet.job_context?.role?.trim() || "this role",
      stalledAt: packet.spec!._review!.stall!.stalled_at,
      stage: packet.spec!._review!.stall!.stage,
    }))
    .sort((left, right) => (left.stalledAt < right.stalledAt ? -1 : left.stalledAt > right.stalledAt ? 1 : 0));
}

/** The queue can only reopen the exact application inside Litos. */
export function waitingApplicationHref(applicationId: string): string {
  return `/dashboard/applications?application=${encodeURIComponent(applicationId)}&intent=apply`;
}

/**
 * How long it has been waiting, in the roughest unit that is still true.
 *
 * Deliberately coarse. A precise duration on something the applicant has not done reads as a
 * reprimand, and the number is not decision-relevant below about an hour: what matters is "today"
 * versus "you have forgotten about this one".
 */
export function describeWait(stalledAt: string, now: number): string {
  const started = Date.parse(stalledAt);
  if (Number.isNaN(started)) return "Waiting";
  const minutes = Math.max(0, Math.floor((now - started) / 60_000));
  if (minutes < 60) return "Waiting since today";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Waiting ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * What is actually left to do, which must not overstate it.
 *
 * This used to depend on whether the browser extension was installed and signed in, because the
 * only place that could refill the form was the employer's own page in the applicant's own browser.
 * That dependency is gone, but nothing has taken its place as a promise this function can make. What
 * happens on arrival is decided by SubmissionScreen (app/dashboard/applications/page.tsx), and it
 * genuinely varies: a live in-dashboard fill needs a browser session the current infrastructure does
 * not keep (measured against production: no packet has ever carried one), and some ATS families
 * still route through the extension regardless (exactAttendedHandoffUrl, lib/attended-handoff.ts).
 * Promising a specific mechanism here would be exactly the overstatement the previous version of
 * this function was written to remove, just relocated rather than fixed. So this says only what is
 * true unconditionally: where to go, and how far the earlier run got.
 */
export function describeRemainingWork(stage: "before_fill" | "at_submit"): string {
  return stage === "at_submit"
    ? "Litos filled it in the run that stopped. Continue in Litos to review it and try again."
    : "Nothing is filled in yet. Continue in Litos to try the fill again.";
}
