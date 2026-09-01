import type { CanonicalApplication } from "@/lib/api";

/**
 * Whether a Tracker row may be taken off the Tracker, asked on the client so the control is not
 * offered where the server would refuse it.
 *
 * THE SERVER IS THE AUTHORITY, and it checks more than this can: it reads the submission attempt
 * ledger, which the dashboard never sees. This is the presentation half of the same rule, and it is
 * deliberately no stricter than the server, so the two cannot disagree in the direction that
 * matters. A row this permits and the server refuses shows the server's reason, which is correct.
 * A row this hides is one the server would certainly refuse.
 *
 * WHY HIDE RATHER THAN DISABLE. A control that is always refused is worse than no control: offering
 * Remove on a sent application implies the student could un-send it, and the honest answer is that
 * the employer has it and the record of that stays.
 *
 * NO CANONICAL ROW MEANS NO CONTROL. Removal addresses a canonical application by id; a packet
 * without one has nothing to send the request to. That is a real state for older packets and for
 * extension builds, not a defensive branch.
 */
export const TRACKER_REMOVAL_BLOCKING_STATES = new Set(["applied", "interview", "offer", "closed"]);

export function canRemoveFromTracker(canonical: Pick<CanonicalApplication, "submission_state" | "tracker_state"> | null | undefined): boolean {
  if (!canonical) return false;
  if (canonical.submission_state !== "not_started") return false;
  return !TRACKER_REMOVAL_BLOCKING_STATES.has(canonical.tracker_state);
}
