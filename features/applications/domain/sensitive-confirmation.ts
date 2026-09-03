import type { ApplicationQuestion, ApplicationReview } from "../../../lib/api.ts";

/**
 * THE QUESTIONS THE SERVER WILL NOT LET LITOS ANSWER FOR HER, AND THE SCREEN NEVER SAID SO.
 *
 * MEASURED on the Hudson River Trading Greenhouse packet (4a79eec1, 2026-09-03). The packet reached
 * ready_for_final_approval with the server audit passed, 27 of 27 questions answered, 46 fields
 * filled and the resume verified on the employer's own form. Every press of Send application
 * returned 422:
 *
 *   "Sensitive question requires your attention: will you now, or in the future, require visa
 *    sponsorship to legally work in the country specified for this position?"
 *
 * THE REFUSAL IS CORRECT. R-004 is a logged incident in this repo where a false legal declaration
 * reached an employer. That posting spans Austin, Chicago, New York, London and Singapore, so no
 * single Yes/No can be truthfully derived by machine: she needs no sponsorship in the US today on
 * F-1 CPT/OPT and would need it in the UK and Singapore. A declaration with that shape is hers to
 * make or not make, and Litos making it is the harm.
 *
 * WHAT WAS WRONG IS THAT SHE WAS NEVER TOLD. The requirement existed only as a paragraph of error
 * text AFTER the press. Nothing on the review-answers screen, the one-question queue or the
 * checklist named it, which is why three prior sessions failed to diagnose it: the screen showed a
 * finished application and the button was green.
 *
 * WHAT THIS MODULE IS. The backend (volley #906) ships
 * `sensitive_questions_requiring_confirmation` on the GET /applications/:id/submission ENVELOPE, a
 * sibling of `review` and never a field on it: the list is derived on every read from the stored
 * questions and her profile, the way `documents` is derived from the row. This module is the one
 * place that reads it, so the badge, the queue, the checklist, the send gate and the 422 route all
 * decide from a single rule rather than five.
 *
 * IT IS ABSENT TODAY AND MUST STAY HARMLESS. #906 is not merged, so every live response omits it,
 * and so does every envelope the dashboard installs that is not a GET /submission response. Absent
 * means NONE, everywhere: no row, no badge, no gate term, no route. Nothing here may invent a
 * confirmation requirement out of a label it recognises. The client heuristic
 * `isHumanOnlyChecklistLabel` already exists for the checklist's own CONFIRM row and is untouched;
 * the server is the only authority for THIS list.
 */

/** The labels the server says are waiting on her explicit confirmation before a send may proceed. */
export function sensitiveConfirmationLabels(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  return labels.filter((label): label is string => typeof label === "string" && label.trim().length > 0);
}

/**
 * How a server label is matched to a stored question.
 *
 * The SAME normalization `blockerMatchesQuestion` already uses to match a server-supplied
 * question_metadata_blocker to a question: collapse whitespace, trim, fold case. Not byte equality,
 * because a label that survived a round trip through a form read can differ by a non-breaking space
 * or a trailing newline and still be the same employer prompt, and the cost of missing the match is
 * the exact silence this module exists to end.
 *
 * MATCHING LOOSELY HERE CANNOT LAUNDER ANYTHING. This decides only WHICH CARD gets marked and which
 * row gets a Confirm control. The bytes that travel back are the question's own
 * (`reviewAnswersRequest` posts `question.question` verbatim), so the backend's byte-exact record
 * identity is unaffected by anything decided here.
 */
function matchKey(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * SHE ALREADY CONFIRMED THIS ONE, says the server, and only the server may say it.
 *
 * Moved here from submission-checklist.ts, unchanged, because this module and that one now both
 * need it and a second copy is a copy that stops agreeing.
 *
 * The CONFIRM row used to be decided by the label class alone, which cannot change: confirm, save,
 * "Saved.", and the same amber ask again, indefinitely - driven four full cycles on the DV Trading
 * packet on 2026-08-17. What a confirmation actually leaves behind is the backend's applicant-claim
 * (`answer_source: 'applicant_review'`, minted by the save when the request carries her explicit
 * `confirmed` flag), so that claim is what this reads.
 *
 * THE ROUND CHECK MATCHES THE SERVER'S OWN. A claim is only checkable beside the review round it
 * was minted against; the backend's refreshKnownQuestionAnswers discards a mismatched one, and a
 * looser client test would show "confirmed" for a claim every server reader is about to throw away.
 * A review that carries no round cannot have minted any claim, so a claim without a round to match
 * reads as unconfirmed rather than trusted.
 */
export function applicantConfirmedAnswer(
  question: Pick<ApplicationQuestion, "answer" | "answer_source" | "answer_reviewed_at">,
  questionsReviewedAt: string | undefined,
): boolean {
  return Boolean(
    (question.answer ?? "").trim()
    && question.answer_source === "applicant_review"
    && typeof question.answer_reviewed_at === "string"
    && questionsReviewedAt
    && question.answer_reviewed_at === questionsReviewedAt,
  );
}

type ConfirmationReview = Pick<ApplicationReview, "questions" | "questions_reviewed_at">;

/**
 * The stored questions the envelope names AND she has not confirmed in this review round.
 *
 * THE SERVER'S LIST IS THE AUTHORITY and it clears itself: #906 recomputes it from the record on
 * every read, so a landed confirmation drops out of it without this file doing anything.
 *
 * THE LOCAL STANDDOWN IS THE SAFETY NET UNDER THAT, and it is what keeps this from becoming a trap.
 * The list rides on GET /submission and NOT on the save response, so between a successful confirm
 * and the next poll tick the page is holding a list that still names the question she just
 * confirmed. Without the standdown the send gate would sit grey through that window over a row she
 * has already answered, with no press left that changes anything - the DV Trading loop with a
 * disabled button attached, which is worse than the loop.
 *
 * It is deliberately the LOOSER of the two rules, so it can only ever open the gate early, never
 * hold it shut late. If it opens early and the server has not in fact cleared the requirement, the
 * send is refused - and `sensitiveConfirmationSendRoute` turns that refusal into a route back to
 * this exact question rather than a paragraph.
 */
export function sensitiveConfirmationQuestions(
  review: ConfirmationReview,
  labels: unknown,
): ApplicationQuestion[] {
  const wanted = new Set(sensitiveConfirmationLabels(labels).map(matchKey));
  if (wanted.size === 0) return [];
  return (review.questions ?? []).filter((question) => (
    wanted.has(matchKey(question.question))
    && !applicantConfirmedAnswer(question, review.questions_reviewed_at)
  ));
}

/** The ids of those questions, for a screen that only needs to mark the cards it is already drawing. */
export function sensitiveConfirmationQuestionIds(review: ConfirmationReview, labels: unknown): string[] {
  return sensitiveConfirmationQuestions(review, labels).map((question) => question.id);
}

/**
 * Whether this packet has a confirmation outstanding that the applicant can actually resolve here.
 *
 * A label matching NO stored question is deliberately NOT counted. She would have no card to read
 * and no control to press, so gating the send on it would be a wall; the server still refuses that
 * send, and the refusal still carries its own sentence. Only a requirement with a question behind
 * it, and therefore a Confirm control behind that, may grey the button.
 */
export function sensitiveConfirmationPending(review: ConfirmationReview, labels: unknown): boolean {
  return sensitiveConfirmationQuestions(review, labels).length > 0;
}

/**
 * The backend's machine code for the refused send. Copy is reworded; codes are not.
 *
 * TWO CODES, BECAUSE THERE ARE TWO REFUSALS AND ONLY ONE OF THEM IS TYPED.
 *
 * `SENSITIVE_QUESTION_CONFIRMATION_REQUIRED` is the typed one #906 added, on POST /submit-request
 * and on the unsupported-portal email refusal, carrying `questions: [label]`.
 *
 * `FINAL_APPROVAL_VERIFICATION_FAILED` is the one the DASHBOARD'S OWN Send application button
 * actually gets, from POST /applications/:id/submission/approve - and #906 did not touch it. That
 * route collects every reason into an `issues` array of authored sentences, so the sensitive
 * question arrives there as prose inside a list, with no label field of its own. Read the backend's
 * approve handler before assuming otherwise: it is the route the measured 422 came from.
 */
export const SENSITIVE_QUESTION_CONFIRMATION_REQUIRED = "SENSITIVE_QUESTION_CONFIRMATION_REQUIRED";
export const FINAL_APPROVAL_VERIFICATION_FAILED = "FINAL_APPROVAL_VERIFICATION_FAILED";

/* The approve route's authored prefix, and the ONLY place in this repo that reads a refusal's prose.
 *
 * MATCHING COPY IS NORMALLY THE BUG, not the fix: it is how a raw `packet_stale` reached a screen,
 * and audit-refusal.ts says so in capitals. This is the narrow, bounded exception the same file
 * already carries for its own uncoded historical refusals, and it is bounded three ways: it runs
 * only inside a body whose `code` is FINAL_APPROVAL_VERIFICATION_FAILED, only over that body's
 * `issues` array, and it must still resolve the text after the prefix to a real stored question
 * before it routes anywhere. It moves nothing and sends nothing; the worst a reworded sentence can
 * do is return this arm to today's behaviour, which is the paragraph under the button.
 *
 * DELETE THIS ARM the day the approve route carries the code. It exists because that route does
 * not, and for no other reason. */
const APPROVE_ISSUE_PREFIX = "Sensitive question requires your attention:";

function refusalBody(reason: unknown): Record<string, unknown> | null {
  if (typeof reason !== "object" || reason === null) return null;
  const data = (reason as { data?: unknown }).data;
  return typeof data === "object" && data !== null ? data as Record<string, unknown> : null;
}

/** The labels a refusal names, in the order the server named them, or none when it names none. */
export function sensitiveConfirmationRefusalLabels(reason: unknown): string[] {
  const data = refusalBody(reason);
  if (!data) return [];
  if (data.code === SENSITIVE_QUESTION_CONFIRMATION_REQUIRED) {
    return sensitiveConfirmationLabels(data.questions);
  }
  if (data.code === FINAL_APPROVAL_VERIFICATION_FAILED) {
    return sensitiveConfirmationLabels(data.issues)
      .filter((issue) => issue.startsWith(APPROVE_ISSUE_PREFIX))
      .map((issue) => issue.slice(APPROVE_ISSUE_PREFIX.length).trim())
      .filter((label) => label.length > 0);
  }
  return [];
}

/**
 * The question a refused send is about, or null when this refusal is not that one.
 *
 * KEYED ON `code`, NEVER ON THE STATUS OR THE MESSAGE, exactly as auditRefusalCode is. Reads the
 * parsed body rather than the Error, because that is where the backend puts `code`; a thrown
 * Error's `message` is the applicant-facing sentence by design.
 *
 * THE APPROVE ROUTE TRUNCATES ITS SENTENCE at 120 characters, so a long employer prompt arrives cut
 * off. The prefix match below therefore resolves by PREFIX against the stored questions rather than
 * by equality, and only when exactly one question starts with what the refusal carried: two
 * candidates means the truncation lost the thing that told them apart, and routing to a guess about
 * a legal declaration is worse than routing nowhere.
 *
 * Returns null when nothing resolves. That is the honest fallback rather than a guess: with nothing
 * to route to, the caller keeps the server's own sentence beside the button, which is what it does
 * today.
 */
export function sensitiveConfirmationSendRouteQuestionId(
  reason: unknown,
  questions: readonly ApplicationQuestion[],
): string | null {
  for (const label of sensitiveConfirmationRefusalLabels(reason)) {
    const key = matchKey(label);
    const exact = questions.filter((question) => matchKey(question.question) === key);
    if (exact.length === 1 && exact[0].id.trim()) return exact[0].id;
    const truncated = questions.filter((question) => matchKey(question.question).startsWith(key));
    if (truncated.length === 1 && truncated[0].id.trim()) return truncated[0].id;
  }
  return null;
}

/* ---- the words, in one place, because five screens say them ----
 *
 * THE COPY MUST SAY WHY, AND MUST NOT SAY SHE FAILED TO ANSWER. On the packet this was measured on
 * she had answered "Yes". What is being asked for is her confirmation of a declaration, not an
 * answer she forgot: "this needs attention" or "required answer missing" over an answered question
 * is the screen accusing her of the product's own caution.
 *
 * "Litos will not ... for you" is the load-bearing half. It is the reason the send stopped, it is
 * true of every question on this list, and it is the only part that tells her why a finished-looking
 * application is not going anywhere.
 */

/** The checklist row under a question whose answer already stands. */
export const SENSITIVE_CONFIRMATION_ANSWERED_DETAIL =
  "Your answer is saved. Litos will not make this declaration to an employer for you, so read it and confirm it.";

/** The checklist row under a question with no usable answer on it yet. */
export const SENSITIVE_CONFIRMATION_UNANSWERED_DETAIL =
  "Only you can answer this one. Litos will not make this declaration to an employer for you, so answer it and confirm it.";

/** The pill beside those rows. Short, and about the row's state rather than about her. */
export const SENSITIVE_CONFIRMATION_BADGE = "Needs you";

/** The heading over the block on the packet screen, and the line the send gate prints. */
export const SENSITIVE_CONFIRMATION_BLOCK_HEADING = "Waiting on your confirmation";
export const SENSITIVE_CONFIRMATION_BLOCK_CAPTION = "Litos will not answer these for you";

/** Said beside the greyed-out Send application button, in the same shape as the other reasons. */
export function sensitiveConfirmationSendGateLine(count: number): string {
  return count === 1
    ? "One answer is a declaration only you can make, so Litos will not send it until you confirm it. Press Confirm on it above."
    : `${count} answers are declarations only you can make, so Litos will not send them until you confirm them. Press Confirm on each one above.`;
}

/** Said once at the top of the review-answers screen, so the marked cards below have a reason. */
export function sensitiveConfirmationScreenLine(count: number): string {
  return count === 1
    ? "One answer below is a declaration only you can make. Litos will not send it for you, so it is waiting on your confirmation."
    : `${count} answers below are declarations only you can make. Litos will not send them for you, so they are waiting on your confirmation.`;
}

/** Said on the card itself, beside the answer it is about. */
export const SENSITIVE_CONFIRMATION_CARD_NOTE =
  "Litos will not make this declaration to an employer for you. The answer below is the one it would send: read it, change it if it is wrong, then save to confirm it.";

/** Said on the one-question screen, above the Confirm control that resolves it. */
export const SENSITIVE_CONFIRMATION_QUESTION_NOTE =
  "This one is a declaration only you can make, so Litos will not answer it for you. Check the answer below, then confirm it.";
