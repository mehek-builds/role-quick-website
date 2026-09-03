import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* R: THE APPLICATION THAT WAS FINISHED, GREEN, AND REFUSED EVERY TIME SHE PRESSED SEND.
 *
 * Hudson River Trading, Greenhouse, application 4a79eec1, measured live on 2026-09-03. The packet
 * reached ready_for_final_approval with the server audit passed, 27 of 27 questions answered, 46
 * fields filled and the resume verified attached on the employer's own form. Every press of "Send
 * application" returned HTTP 422:
 *
 *   "Sensitive question requires your attention: will you now, or in the future, require visa
 *    sponsorship to legally work in the country specified for this position?"
 *
 * THE REFUSAL IS CORRECT AND MUST STAY. R-004 is a logged incident in this repo where a false legal
 * declaration reached an employer. That posting spans Austin, Chicago, New York, London and
 * Singapore, so no single Yes/No is machine-derivable: she needs no sponsorship in the US today on
 * F-1 CPT/OPT and would need it in the UK and Singapore. Litos declining to declare that for her is
 * the product working.
 *
 * WHAT WAS WRONG IS THAT NOTHING TOLD HER. The requirement existed only in the 422 body, after the
 * press. The review-answers screen, the one-question queue and the checklist all said nothing, the
 * Send button rendered green, and three prior sessions failed to diagnose it because every surface
 * she could reach showed a finished application.
 *
 * These assertions guard the shape of the fix and the two things it must not become: a badge that
 * accuses her of not answering, and a grey button with no control beside it.
 */

function shippedCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const dashboardUrl = new URL("../app/dashboard/applications/page.tsx", import.meta.url);
const readDashboard = async () => shippedCode(await readFile(dashboardUrl, "utf8"));

test("the greyed-out Send names this reason too, and the control that clears it is on the same screen", async () => {
  const dashboard = await readDashboard();

  /* APPENDED AT THE TAIL, never inserted. Two other suites read this expression as a literal
     prefix, and appending is the one edit that cannot reorder a pinned neighbour. */
  assert.match(dashboard, /const finalApprovalBlocked = [^;]*\|\| transcriptPending \|\| sensitiveConfirmationPending;/);

  /* THE GATE READS THE ROWS, NOT THE PREDICATE UNDER THEM. This is what stops the button greying
     over a requirement with no control beside it: it can only close while a Confirm pill is on
     screen, and it opens again the moment her confirmation lands. */
  assert.match(dashboard, /const sensitiveConfirmationPending = sensitiveConfirmations\.length > 0;/);

  /* A term in finalApprovalBlocked with no sentence here is a greyed Send that names every reason
     except the one actually blocking it - the failure this whole change exists to end. */
  assert.match(
    dashboard,
    /review\.status === "ready_for_final_approval" && sensitiveConfirmationPending && \(\s*<p className="mt-3 text-xs leading-5 text-warn">\s*\{sensitiveConfirmationSendGateLine\(sensitiveConfirmations\.length\)\}/,
  );

  /* It is NOT the same fact as the label heuristic two terms to its left, and collapsing them would
     silently drop one of the two. */
  assert.match(dashboard, /const sensitiveQuestionPresent = review\.questions\.some/);
});

test("the block on the packet screen keeps its control, so the row is not a wall", async () => {
  const dashboard = await readDashboard();

  assert.match(
    dashboard,
    /const sensitiveConfirmations = sensitiveConfirmationItems\(attentionReview, \{[\s\S]{0,200}sensitiveConfirmations: submission\.sensitive_questions_requiring_confirmation,/,
    "the block must read the same sanitized review the one-question queue does, and the labels off the envelope",
  );
  /* THE RENDER CONDITION IS PART OF THE FIX, not scenery around it: the whole defect was a screen
     that drew nothing, so a guard that can never be true is the defect restored with the code left
     in place to look like it was fixed. */
  assert.match(dashboard, /\{sensitiveConfirmations\.length > 0 && \(\s*<div className="mt-6">/);
  /* onOpenQuestion is what makes checklistRowControl's Confirm pill a real button here. Without it
     ChecklistRow draws the caption and binds nothing, which is the styled-span defect that produced
     79 prepared resumes and 0 sent applications. */
  assert.match(
    dashboard,
    /\{sensitiveConfirmations\.map\(\(item\) => \(\s*<ChecklistRow key=\{item\.id\} item=\{item\} checked=\{false\} onOpenQuestion=\{onOpenQuestion\} \/>/,
  );
  /* Its own heading, above the two blocks below it, because "Not confirmed" and "Done" both
     describe states this is not. */
  assert.ok(
    dashboard.indexOf("SENSITIVE_CONFIRMATION_BLOCK_HEADING") < dashboard.indexOf("Not confirmed"),
    "the outstanding block must render above the two settled ones",
  );
});

test("a refused send is a route to the question, not a paragraph under the button", async () => {
  const dashboard = await readDashboard();

  /* Ahead of moveToScreen("portal") and ahead of refuseSend, so a handled refusal never also prints
     the sentence it replaced. Behind recoverPacketAuditReview, which owns a different code. */
  assert.match(
    dashboard,
    /if \(await recoverPacketAuditReview\(requestedId, reason\)\) return;\s*if \(routeToSensitiveConfirmation\(requestedId, reason\)\) return;\s*moveToScreen\("portal"\);/,
  );

  /* "confirm", not "answer": the intent word is the only thing that records the per-question
     confirm press, and without it her save on the screen this opens posts the same bytes with no
     claim attached and the send is refused again. */
  assert.match(dashboard, /reviewPortalQuestions\(questionId, "confirm"\);/);
  assert.match(dashboard, /const questionId = sensitiveConfirmationSendRouteQuestionId\(reason, submission\.review\.questions\);/);
  assert.match(dashboard, /if \(!questionId\) return false;/, "an unresolvable label must fall back to the server's own sentence");

  /* Every guard the approve handler applies to its success path, applied before any write, because
     a refusal for packet A can arrive after the switcher moved to B. */
  assert.match(dashboard, /if \(selectedIdRef\.current !== applicationId\) return false;\s*if \(submission\.application_id !== applicationId\) return false;/);

  /* The refusal alert this replaces is still the fallback for everything else. */
  assert.match(dashboard, /refuseSend\(\s*requestedId,/);
});

test("the answers screen marks the card and says why, without touching what the badge claims", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /confirmationRequiredQuestionIds=\{sensitiveConfirmationIds\}/);
  /* THE LIST IS A SIBLING OF `review`, NEVER A FIELD ON IT. #906 derives it on each read of the
     GET /submission envelope, so a reader that went looking on the review would be reading a key
     that is never present and would be permanently, silently dark. */
  assert.match(
    dashboard,
    /sensitiveConfirmationQuestionIds\(selectedSubmission\.review, selectedSubmission\.sensitive_questions_requiring_confirmation\)/,
  );
  assert.doesNotMatch(dashboard, /review\.sensitive_questions_requiring_confirmation/, "the labels never ride on the review");
  assert.match(dashboard, /\{confirmationRequiredIds\.has\(question\.id\) && \(/);
  assert.match(dashboard, /\{SENSITIVE_CONFIRMATION_CARD_NOTE\}/);
  /* Same rule as the block on the packet screen: the render condition is the fix. A guard that can
     never be true leaves this screen exactly as silent as it was. */
  assert.match(dashboard, /\{confirmationRequiredIds\.size > 0 && \(\s*<p className="mt-3 rounded-inner border border-warn\/20 bg-warn-soft/);
  assert.match(dashboard, /\{sensitiveConfirmationScreenLine\(confirmationRequiredIds\.size\)\}/);

  /* THE #526 BADGE IS UNTOUCHED, and that is a decision rather than an omission. On the packet this
     was measured on she answered "Yes" and the control below the badge holds "Yes", so ANSWERED is
     a TRUE claim about that control. Overwriting it to get her attention would make the badge lie
     about the control and tell her she failed to answer something she answered. */
  assert.match(dashboard, /\? questionReadsAsAnswered\(question\) \? "Answered" : "Required"/);
  assert.doesNotMatch(
    dashboard,
    /confirmationRequiredIds\.has\(question\.id\) \? "(?:Required|Needs you|Unconfirmed|Not confirmed)"/,
    "the badge is a claim about the control below it, never a way to raise an alarm",
  );

  /* Only questions this screen is actually drawing a control for. A blocked one has no card to
     mark, so counting it in the line at the top would promise a marked card that is not below it. */
  assert.match(dashboard, /const confirmationRequiredIds = new Set\(\s*editableQuestions\.filter/);
});

test("the one-question screen says why above the Confirm control, in this screen's own voice", async () => {
  const dashboard = await readDashboard();

  assert.match(dashboard, /confirmationRequired=\{sensitiveConfirmationQuestionIds\(review, submission\.sensitive_questions_requiring_confirmation\)\.includes\(currentDirectQuestion\.question\.id\)\}/);
  assert.match(dashboard, /\{confirmationRequired && \(/);
  assert.match(dashboard, /\{SENSITIVE_CONFIRMATION_QUESTION_NOTE\}/);
  /* The caption on the control that resolves it already reads "Confirm answer" on this intent, so
     the sentence and the button say one thing in one place. */
  assert.match(dashboard, /task\.intent === "confirm"\s*\?\s*hasNext \? "Confirm and next" : "Confirm answer"/);
});

test("the copy says why Litos stopped, and never says she failed to answer", async () => {
  const copy = await import("../features/applications/domain/sensitive-confirmation.ts");
  const sentences = [
    copy.SENSITIVE_CONFIRMATION_ANSWERED_DETAIL,
    copy.SENSITIVE_CONFIRMATION_UNANSWERED_DETAIL,
    copy.SENSITIVE_CONFIRMATION_BLOCK_CAPTION,
    copy.SENSITIVE_CONFIRMATION_CARD_NOTE,
    copy.SENSITIVE_CONFIRMATION_QUESTION_NOTE,
    copy.sensitiveConfirmationSendGateLine(1),
    copy.sensitiveConfirmationSendGateLine(3),
    copy.sensitiveConfirmationScreenLine(1),
    copy.sensitiveConfirmationScreenLine(3),
  ];
  assert.equal(sentences.filter((sentence) => typeof sentence === "string" && sentence.length > 20).length, sentences.length);

  for (const sentence of sentences) {
    /* THE LOAD-BEARING HALF. "This needs attention" names a state and explains nothing; the reason
       the send stopped is that Litos will not speak for her, and that is the only part that turns a
       finished-looking application into an action she can take. */
    assert.match(
      sentence,
      /Litos will not|only you can answer/i,
      `a sentence that does not say why Litos stopped: ${sentence}`,
    );
    /* She ANSWERED the question this was measured on. Copy implying otherwise would be the screen
       accusing her of the product's own caution. */
    assert.doesNotMatch(sentence, /\b(?:missing|forgot|failed|incomplete|you did not answer)\b/i, sentence);
  }
});

test("a confirmation is never saved locally and called saved", async () => {
  const dashboard = await readDashboard();

  /* THE `else` ARM IS THE APPLY-TIME LOCAL SAVE, and it is correct there: those answers ride into
     the packet on the submit-request she is about to press, so keeping them locally IS keeping
     them. A CONFIRMATION rides on nothing - it exists only as the `confirmed: true` flag on one
     PUT - so a confirmation that took that arm would print "Saved.", clear nothing, and leave the
     send refusing while the screen said otherwise. That is the shape of the original defect this
     whole route was written to fix, reached one door further along. */
  assert.match(
    dashboard,
    /if \(selectedSubmission\?\.review\.status === "needs_attention" \|\| sensitiveConfirmationIds\.length > 0\) \{\s*void saveReviewedAnswers\(\);/,
  );

  /* Ordering pinned by tests/your-turn-actions.test.mjs for its own reason, and it still holds:
     the server write comes before the blanket audit-void. */
  const element = dashboard.slice(dashboard.indexOf("<QuestionsScreen"));
  assert.ok(
    element.indexOf("void saveReviewedAnswers()") < element.indexOf("setPacketEvidence(null)"),
    "the stalled save must not blanket-void the audit before the server has said what it stored",
  );
});
