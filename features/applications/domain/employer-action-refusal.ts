/* WHY AN EMPLOYER ACTION CANNOT START, said accurately, and said ONCE.
 *
 * MEASURED LIVE 2026-09-04, Palantir (lever) packet f1cfb841-7a59-4314-9ef1-84581ccb373a. Its
 * server review status was `filling` - a managed fill run had died mid-flight - and its submission
 * authority was `state: none` with `retry_safety: { kind: 'no_evidence' }`: the immutable ledger
 * saying, in as many words, that not one attempt had ever been opened and nothing had ever reached
 * an employer. The review screen said:
 *
 *   "Litos cannot start another employer attempt until the exact prior submission evidence is
 *    verified."
 *
 * No clause of that is true here. There is no prior submission, so there is no evidence, so there
 * is nothing to verify, and the wait it asks for has no end. What was actually true is much
 * simpler: the server still believed a run held the packet.
 *
 * AND ONE MISSING FIELD PRODUCED BOTH HALVES OF THE DEFECT.
 * `/applications/:id/submission` attaches the authority envelope only for the statuses in the
 * backend's FIRST_SEND_REVIEW_STATUSES, and `filling` is not one of them, so the response arrived
 * with no envelope at all. submissionResponseForDisplay quarantines an absent envelope;
 * reviewForSubmissionProjection rewrites a quarantined packet's status to "needs_attention"; and
 * the review screen's retry controls are gated on that rewritten status. So the missing envelope
 * BOTH rendered "Try again" and guaranteed the handler behind it would return before firing a
 * request. The control was pressable and inert, which is the worst of the three possible states.
 *
 * The rule lives here rather than in the page so it can be asserted directly. A refusal sentence
 * written inline in a click handler is only reachable by mirroring it, and a mirror keeps passing
 * after the real one has changed.
 */

/**
 * The statuses that mean A RUN HOLDS THIS PACKET RIGHT NOW, in the server's own words.
 *
 * These must be read from the status the server sent, never from the displayed review: the display
 * rewrite is exactly what turns one of these into "needs_attention", so asking the rewritten copy
 * would always answer no and this rule would never fire on the case it exists for.
 *
 * The same five the backend treats as in flight - submitRequestDisposition answers `in_flight` for
 * all of them, and applicationStall.ts's IN_FLIGHT set is the same list.
 */
export const SERVER_RUN_IN_FLIGHT_STATUSES: ReadonlySet<string> = new Set([
  "submit_requested",
  "preparing",
  "filling",
  "submitting",
  "submission_claimed",
]);

/**
 * The sentence for a packet a run is already holding.
 *
 * It says what happens next WITHOUT the applicant, because that is now true: a fill run that stops
 * without writing a terminal state is bounded server-side and the packet returns to a state she can
 * act on by itself. The old sentence sent her to verify submission evidence, which for this packet
 * means checking an employer's page for an application that was never filed.
 */
export const RUN_IN_FLIGHT_REFUSAL =
  "Litos still has a fill running on this application, so it will not start a second one."
  + " Nothing has been sent to the employer. If the run has stopped, Litos releases it on its"
  + " own and this application becomes startable again - no need to check the company's page.";

/**
 * The sentence for a packet whose submission history really is uncertain.
 *
 * UNCHANGED, and it must stay that way. A packet whose ledger holds a boundary authorization, an
 * observed press or a confirmation genuinely does need its evidence verified before a second
 * employer attempt, and this is the one refusal that names that correctly. The defect was never
 * this sentence; it was this sentence being used for every refusal.
 */
export const UNVERIFIED_EVIDENCE_REFUSAL =
  "Litos cannot start another employer attempt until the exact prior submission evidence is verified.";

/**
 * Null when an employer action may start, otherwise the reason it may not.
 *
 * ONE value for the message AND for whether the control that triggers it is rendered at all. That
 * is the whole point: the page derives the presence of "Try again" from this, so a button that
 * renders can no longer reach a handler that refuses.
 *
 * `authorityState` is applicationPacketAuthorityState's verdict, which stays the authority on
 * whether an action is permitted - this function never widens it, and answers null for exactly the
 * one state that already permitted the action. `serverReviewStatus` only chooses BETWEEN refusals.
 */
export function employerActionRefusalMessage(
  authorityState: "confirmed" | "safe_not_sent" | "uncertain",
  serverReviewStatus: string | null | undefined,
): string | null {
  if (authorityState === "safe_not_sent") return null;
  if (serverReviewStatus && SERVER_RUN_IN_FLIGHT_STATUSES.has(serverReviewStatus)) {
    return RUN_IN_FLIGHT_REFUSAL;
  }
  return UNVERIFIED_EVIDENCE_REFUSAL;
}
