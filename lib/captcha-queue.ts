/**
 * The "waiting on you" queue.
 *
 * When an application stops on a human-verification check, the check can only be answered by the
 * person whose application it is, in their own browser. So this is not a work queue anyone else can
 * drain: it is a list pointed at its owner, and the only useful thing it can do is get them back to
 * the right page quickly.
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
  portalUrl?: string;
  stalledAt: string;
  stage: "before_fill" | "at_submit";
};

type ReviewLike = {
  status?: string;
  portal_url?: string;
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

/**
 * Only an https URL is allowed to become a link.
 *
 * portal_url arrives from backend data that ultimately traces back to an employer's posting or a
 * pasted link, and the backend's own guard is zod .url(), which happily accepts
 * `javascript:alert(1)`. This block puts a button in front of the applicant and tells them to click
 * it, which makes it precisely the wrong place to trust a URL. Anything that is not https is
 * dropped, and the row falls through to its "open it from your applications list" branch rather
 * than disappearing - the application still needs finishing either way.
 */
export function safePortalUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw).protocol === "https:" ? raw : undefined;
  } catch {
    return undefined;
  }
}

export function waitingApplications(packets: readonly PacketLike[]): WaitingApplication[] {
  return packets
    .filter((packet) => isWaitingOnHuman(packet.spec?._review))
    .map((packet) => ({
      id: packet.id,
      company: packet.job_context?.company?.trim() || "This company",
      role: packet.job_context?.role?.trim() || "this role",
      portalUrl: safePortalUrl(packet.spec?._review?.portal_url),
      stalledAt: packet.spec!._review!.stall!.stalled_at,
      stage: packet.spec!._review!.stall!.stage,
    }))
    .sort((left, right) => (left.stalledAt < right.stalledAt ? -1 : left.stalledAt > right.stalledAt ? 1 : 0));
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
 * Whether anything will actually fill the form once the applicant gets there.
 *
 * "extension" means the Litos extension is installed and signed in to this account, so it will
 * refill the application on arrival. "none" means nothing will: no extension, or an extension that
 * is not signed in as this person. This is the only honest input to the sentence below, and it has
 * to be measured rather than assumed.
 */
export type HandoffFill = "extension" | "none";

/**
 * What is actually left to do, which must not overstate it.
 *
 * This block used to tell an 'at_submit' applicant "Everything else is filled in. Solve the check
 * and send it." That was true of the run that stalled and false of the page they were about to
 * open. The fill happened inside a managed browser session on a server; clicking through opens a
 * fresh load of the employer's own site in the applicant's own browser, where none of it exists.
 * Three applications sat behind that sentence, and every one of them opened blank under a promise
 * that they would not.
 *
 * So the stage is no longer the whole story. The stage says what the earlier run reached; `fill`
 * says what will happen next, which is the thing the applicant is actually being told. When the
 * extension is there, it refills and the promise is kept by construction. When it is not, the honest
 * thing is to say the form opens blank, and why.
 */
export function describeRemainingWork(stage: "before_fill" | "at_submit", fill: HandoffFill): string {
  if (fill === "extension") return "Litos fills it in again in your browser. Solve the check and send it.";
  return stage === "at_submit"
    ? "Litos filled it in the run that stopped, but that ran in a different browser, so the form opens blank. Fill it in, solve the check, and send it."
    : "Nothing is filled in yet, so the form opens blank. Fill it in, solve the check, and send it.";
}
