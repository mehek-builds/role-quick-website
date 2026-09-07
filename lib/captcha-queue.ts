/**
 * The home human-verification notice queue.
 *
 * A legacy needs-attention status plus an unresolved human-verification stall is a discovery signal.
 * It does not establish what the employer requested, whether anything was submitted, or whether a
 * retry is safe. This queue surfaces the application and links to its current Litos screen. That
 * screen owns action eligibility because it has the latest evidence for the exact application.
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
 * Legacy status and stall are both required to discover an unresolved human-verification notice.
 *
 * Status alone sweeps in every other reason an application needs attention. An open stall alone can
 * resurrect finished work. Neither field is submission authority or proof that retrying is safe.
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
 * Where to inspect the application without claiming what the earlier attempt did.
 *
 * An unresolved legacy stall does not establish whether the earlier attempt filled or submitted the
 * application, and it does not establish retry eligibility. The exact application screen owns those
 * decisions using its current evidence. This copy only identifies where to inspect that status.
 */
export function describeRemainingWork(): string {
  return "Open this application in Litos to see its current status and available steps.";
}
