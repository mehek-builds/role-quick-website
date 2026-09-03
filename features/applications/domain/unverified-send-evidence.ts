/* WHAT THE CARD IS ALLOWED TO SAY HAPPENED, READ FROM THE LEDGER THE DASHBOARD ALREADY RECEIVES.
 *
 * UnverifiedSubmissionCard renders the backend's `attention_reason` verbatim, on purpose: the server
 * owns the account of what happened. But it carries a FALLBACK for the case where that sentence is
 * absent, and the fallback asserted a press with nothing behind it at all:
 *
 *   "Litos pressed Send and could not confirm what came back. Check the filled-form proof shown in
 *    this dashboard, then choose what it shows."
 *
 * Measured 2026-09-02, attempt 22b9663a: an attempt whose ledger held one `attempt_opened` and no
 * boundary authorization and no press was described to the applicant as a press, and she was told
 * to go and look. A fallback fires exactly when the server said nothing, which is the moment the
 * client knows least and must claim least.
 *
 * The evidence needed to say it honestly is already on the wire. `retry_safety` is the ledger's own
 * fold, and its `reason` separates the three cases in one word - the same reduction
 * duplicateApplication.ts makes on the backend for the same distinction. Nothing new is fetched.
 *
 * WHAT THIS DOES NOT DO. It does not override the server's sentence. A genuinely pressed and
 * unconfirmed submission keeps its copy, its controls and its refusal to send again, and a fold this
 * module cannot read ('pressed', 'boundary_authorized', 'invalid_sequence', or no evidence at all)
 * keeps the cautious wording. Only a fold that positively says 'opened' gets the honest sentence.
 */

import type { SubmissionRetrySafetyLike } from "./submission-state.ts";

/** Whether the ledger positively records a press, positively records none, or cannot say. */
export function unverifiedSendEvidence(
  retrySafety: SubmissionRetrySafetyLike | null | undefined,
): "pressed" | "opened" | null {
  if (!retrySafety || retrySafety.kind !== "blocked_unverified") return null;
  if (retrySafety.reason === "opened") return "opened";
  if (retrySafety.reason === "pressed" || retrySafety.reason === "boundary_authorized") return "pressed";
  /* 'invalid_sequence' is a ledger that contradicts itself. It is the one fold that must not be
     reduced to either answer: saying "pressed" invents a press and saying "opened" excuses one. */
  return null;
}

/** The card's sentence when the server sent none. Never claims more than the ledger records. */
export function unverifiedCardFallbackCopy(
  retrySafety: SubmissionRetrySafetyLike | null | undefined,
): string {
  if (unverifiedSendEvidence(retrySafety) === "opened") {
    return "Litos opened an attempt on this application and stopped before pressing Send, so nothing "
      + "was submitted. There is nothing to check on the employer’s page. Choose “It is not there” to "
      + "record that nothing was sent and release this application.";
  }
  /* Cause-neutral where the ledger cannot say. The old sentence asserted a press here too; this one
     describes only what is certain, which is that the outcome is unknown and she is being asked. */
  return "Litos could not confirm what came back from this submission, so it does not know whether "
    + "this application went through. Check the filled-form proof shown in this dashboard, then "
    + "choose what it shows.";
}
