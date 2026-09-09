/* THE DEVELOPER TOKEN THE "STOPPED" CARD PRINTED TO AN APPLICANT.
 *
 * MEASURED LIVE 2026-09-09, 3M (workday) packet ec26aae7-1fe1-411b-81cc-9cc929fca063, review
 * status `failed`. The card under the heading "Stopped" read, verbatim:
 *
 *   Error: A non-submit action attempted employer transport without exact final authority
 *   (ping transport: POST https://3m.wd1.myworkdayjobs.com/Search/job/US-Texas-Angleton/undefined
 *   body=json{message:str2109,tenant:str2,user_agent:str109})
 *
 * A thrown Error's own message: an internal authority assertion, an employer hostname, and a
 * serialised request body, on a student's dashboard, with nothing in it naming what to do next.
 *
 * THE ROW ALREADY CARRIED THE RIGHT SENTENCE, and that is what makes this a display defect rather
 * than a missing-copy one. volley-backend never intended that string for a screen. Every arm of
 * submissionFailureReview writes the same PAIR:
 *
 *   submission_error: the raw thrown message, for whoever maintains the runner
 *   attention_reason: a sentence written for the applicant
 *
 * and withTerminalCause makes the authored half non-optional - a terminal row with a blank
 * attention_reason cannot be persisted, by construction rather than by convention. This packet's
 * authored half was already correct and already on the row: "Litos could not finish this
 * application, and it stopped before anything was sent. Nothing has gone to the employer. You can
 * try this one again from your dashboard." The card was reading the other half of the pair.
 *
 * WHY A FILTER IS NOT THE FIX. The line this module replaces was
 * `userFacingError(review.submission_error, "Try again in a minute.")`, and userFacingError is a
 * DENYLIST: stack frames, chromium and filesystem paths, 5xx text, a few credential shapes. The
 * measured string contains none of those, so it passed through untouched and reached the card
 * whole. Adding an arm for it would only move the boundary until the next throw finds the next
 * gap. A raw thrown message is not a bounded vocabulary, so no pattern can be written for one.
 *
 * This is the rule volley-backend's own packetAuditClientError already enforces on its side of the
 * wire, for the same reason and after the same kind of incident - the dashboard printing the bare
 * word `packet_stale` on the live Moburst packet on 2026-08-20. Its comment states the principle
 * this module applies to the failed card: the screen may only print a string IT CHOSE.
 *
 * So the choice here is made on the FIELD, never on the CONTENT. The authored field is displayable
 * because of where it came from; the raw field is not, whatever any particular value of it happens
 * to look like.
 */

import { userFacingError } from "../../../lib/user-facing-error.ts";

/** The two halves of the pair volley-backend writes on a stopped run. */
export type FailedRunFields = {
  /** Authored for the applicant. The only half this screen may print. */
  attention_reason?: string;
  /**
   * The raw thrown message. It stays on the row and in the runner's log line, where a diagnosis is
   * worth having, and it is never rendered.
   *
   * Declared here ON PURPOSE even though nothing in this module reads it. The defect was never that
   * the right field was hard to find - it was that at the call site the two fields looked
   * interchangeable. Naming both, and documenting which one is displayable, is what turns a future
   * edit that reaches for the raw one back into a visible choice.
   */
  submission_error?: string;
};

/**
 * The sentence shown when a failed run left no authored reason.
 *
 * DELIBERATELY SAYS NOTHING ABOUT THE EMPLOYER, and it is worth saying why, because the backend's
 * own fallback for this state does say "Nothing has gone to the employer". The backend has standing
 * to say that: `failed` requires the submission claim to be absent, so it knows no press can have
 * landed. This fallback fires only when the authored half is missing or was itself filtered - the
 * one situation where this screen knows least - so making a safety claim from here would be
 * inventing the reassurance rather than relaying it. Unchanged from the copy this line already
 * shipped, under a heading that already reads "Stopped".
 */
export const FAILED_RUN_FALLBACK_SENTENCE = "Try again in a minute.";

/**
 * What the "Stopped" card says about a failed run.
 *
 * Still routed through userFacingError, which is belt-and-braces rather than the mechanism: the
 * authored field is displayable because of the field it is, and this only catches the case where
 * something upstream has written a technical string into the authored half too.
 */
export function failedRunSentence(review: FailedRunFields): string {
  return userFacingError(review.attention_reason, FAILED_RUN_FALLBACK_SENTENCE);
}
