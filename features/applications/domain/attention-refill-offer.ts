import type { ApplicationPacketAuthorityState } from "./application-packet-authority.ts";

export type AttentionRefillOfferInput = {
  /** The row is stopped and waiting on the applicant. */
  needsAttention: boolean;
  /** Litos pressed Send and does not yet know whether the employer has it. */
  awaitingUnverifiedSubmission: boolean;
  /** No current exact-packet evidence, so the handler would route to packet review, not re-fill. */
  packetReviewRequired: boolean;
  /** The packet's own authority verdict for starting another employer attempt. */
  authorityState: ApplicationPacketAuthorityState["state"];
};

/**
 * WHETHER THE STOPPED ROW MAY OFFER THE AUDITED RE-FILL, as a truth table rather than a chain of
 * conjunctions buried in JSX. Two surfaces read it (the action row's control and the Restart inside
 * Litos help line that names that control), and a help line naming a control the row is not
 * rendering is the exact defect this predicate was written to end.
 *
 * WHAT THE RE-FILL IS. refreshEmployerQuestionMetadata: it refuses unsaved answer edits, requires the
 * exact packet to have been audited, acknowledges that audit, and only then posts
 * POST /applications/:id/submit-request through continueFromVerifiedPacket. That request is a real
 * re-fill, not a replay: submitRequestDisposition answers 'start' for a needs_attention row that is
 * unclaimed, that the applicant answered "it is not there" on, or that the row itself proves never
 * reached the employer, and the run then re-navigates, rebuilds the packet and re-discovers the form
 * against whatever resolver code is live.
 *
 * EVERY TERM IS A MEASURED REFUSAL, not a precaution:
 *
 *   needsAttention - the only status whose exit this control is. Other statuses have their own.
 *
 *   !awaitingUnverifiedSubmission - while an unresolved unverified_submission sits on the row, the
 *   employer may already hold this application. submitRequestDisposition refuses it, and it must:
 *   the yes/no card releases the row first.
 *
 *   !packetReviewRequired - without current exact-packet evidence the handler fills NOTHING. It
 *   calls reviewPacketAgain and routes to packet review, which is what the Open packet review button
 *   beside it already does and says. A second control that only repeats a neighbour is the defect,
 *   not the fix.
 *
 *   authorityState === "safe_not_sent" - prepareApplication refuses any other verdict before a
 *   request is made ("Litos cannot start another employer attempt until the exact prior submission
 *   evidence is verified"). PR #522 offered this same handler without consulting the authority and
 *   its recovery arm was dead 100% of the time.
 *
 * IT SAYS NOTHING ABOUT WHAT REACHES THE EMPLOYER, and no caller may infer that it does. A run
 * started from here can end in a send: standing consent turns the same request into one, and an
 * unsupported portal emails the packet inside it.
 */
export function attentionRefillOffered(input: AttentionRefillOfferInput): boolean {
  return input.needsAttention
    && !input.awaitingUnverifiedSubmission
    && !input.packetReviewRequired
    && input.authorityState === "safe_not_sent";
}
