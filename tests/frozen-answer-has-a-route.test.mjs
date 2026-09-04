/* THE EDIT CONTROL THAT COULD NEVER LAND ITS EDIT.
 *
 * MEASURED LIVE 2026-09-04, account mehekmandal05@gmail.com. Flow Traders packet
 * 8dc65cd0-cab5-4af2-a1d8-2583766fd2d4 (greenhouse), status `ready_for_final_approval`. The Tracker
 * card drew "Answer 1 question". The press opened the per-question editor with the essay pre-filled
 * and a "Save and next" button. The box took her typing. Save returned
 *
 *   409 {"error":"These answers can no longer be edited from this application's current submission
 *        state","code":"REVIEW_ANSWERS_NOT_EDITABLE"}
 *
 * The essay contained a factual error that had to be fixed before the application went out, and
 * there was no press anywhere on either screen that could fix it.
 *
 * THE SERVER IS RIGHT AND IS NOT WHAT THIS FILE CHANGES. reviewAnswerSaveDisposition
 * (student-outreach-backend src/lib/submissionSafety.ts:308) refuses this status because the form is
 * already filled and there is a preview screenshot of it: PUT /review/answers writes answers "and
 * nothing else", so a save through it leaves the picture the applicant approves describing a
 * different form. This dashboard was posting a request that could not be granted and had no other
 * plan.
 *
 * WHAT IS ASSERTED HERE. That the client asks reviewAnswerEditRoute BEFORE it posts; that the
 * `reopen` answer is carried by submit-request with `restart: true` and the CORRECTED answer list,
 * which is the one request that moves the answers and the preview together; and that the packet
 * screen draws a control for the required-answer blocker it has always printed, which it did not,
 * because "Check the answers" is gated on needs_attention and never rendered on this status.
 *
 * SOURCE ASSERTIONS, deliberately. The behaviour lives inside an 800-line handler in a client
 * component with no render harness in this repo; what can be pinned without one is that the decision
 * is asked, that the reopen request is the restart, and that the control exists. Every one of these
 * fails on the build that shipped the defect.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PAGE = new URL("../app/dashboard/applications/page.tsx", import.meta.url);

/* Comments stripped before every assertion, the same way tests/application-submission-gate.test.mjs
   does it. This fix necessarily explains itself in prose that names the very identifiers being
   asserted on, and a bare grep would count the explanation as the code. */
function shippedCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

test("the answer save asks where the answer can land before it posts", async () => {
  const code = shippedCode(await readFile(PAGE, "utf8"));
  assert.match(code, /const editRoute = reviewAnswerEditRoute\(activeSubmission\.review\)/,
    "the decision is read off the live review, not guessed from the screen the press came from");
  const seam = code.indexOf("const editRoute = reviewAnswerEditRoute");
  const save = code.indexOf("await saveReviewAnswers<SubmissionResponse[\"review\"]>");
  assert.ok(seam > 0 && save > 0, "both the decision and the ordinary save must still exist");
  assert.ok(seam < save,
    "asked BEFORE the post: a route decided after the 409 has already lost the applicant's press");
});

test("a frozen-but-unclaimed packet's correction rides the restart, which retakes the preview", async () => {
  const code = shippedCode(await readFile(PAGE, "utf8"));
  assert.match(
    code,
    /if \(editRoute === "reopen"\)[\s\S]{0,600}?prepareApplication\(answerDraftQuestions, \{[^}]*restart: true/,
    "the reopen posts submit-request with restart:true - the one route that discards the filled form,"
    + " refills it from these answers and takes a fresh preview, so the two cannot diverge",
  );
  assert.match(
    code,
    /if \(editRoute === "reopen"\)[\s\S]{0,600}?prepareApplication\(answerDraftQuestions/,
    "and it carries answerDraftQuestions - the stored list with HER correction merged in. Posting the"
    + " stored questions instead would refill the form with the same wrong answer, which is a restart"
    + " and not a correction",
  );
});

test("a packet that may already be at the employer is refused locally, with the reason", async () => {
  const code = shippedCode(await readFile(PAGE, "utf8"));
  assert.match(
    code,
    /if \(editRoute === "frozen"\)[\s\S]{0,300}?return \{ saved: false, message: REVIEW_ANSWERS_FROZEN_NOTICE \}/,
    "no reopen may be offered for a row a refill would turn into a second application",
  );
});

test("the required-answer blocker on a filled packet has a control on the screen that prints it", async () => {
  const code = shippedCode(await readFile(PAGE, "utf8"));
  assert.match(
    code,
    /review\.status === "ready_for_final_approval" && requiredAnswerMissing && \(\s*<Button onClick=\{onReviewQuestions\}[^>]*>Fix an answer<\/Button>/,
    "before this, the greyed Send named 'Required answer missing.' and nothing on that screen opened"
    + " the question it meant: hasQuestionsToReview, which draws 'Check the answers', is gated on"
    + " needs_attention",
  );
  assert.match(code, /Press Fix an answer, next to Send application/,
    "and the sentence names the button, the way the document-ask sentence beside it already does");
});

/* THE SAME CLASS OF DEAD END, ONE STATUS OVER. Measured live 2026-09-04, Exa "Software Engineer,
 * Intern" (Ashby) packet 73768339: every answer present, status ready_for_final_approval, and the
 * Review screen's own "Not confirmed" section named the resume - Litos's own record had no resume
 * linked to it either - beside a picture of Ashby's own "...Resume.pdf failed to upload" toast.
 * Start it again is gated on handoffExpired and Fix an answer on a missing required answer; neither
 * held, so nothing on the screen could start the fresh fill the resume needed. See
 * fillAgainFromReviewControl in features/applications/domain/submission-checklist.ts for the pure
 * decision, unit-tested there; this file's job is only to pin that the Review screen actually wires
 * it, and wires it to the SAME restart Start it again uses. */
test("an unconfirmed document on a filled packet has a control on the screen that prints it", async () => {
  const code = shippedCode(await readFile(PAGE, "utf8"));
  assert.match(
    code,
    /const fillAgainControl = fillAgainFromReviewControl\(review, unconfirmedDocuments, handoffExpired\)/,
    "visibility must be decided off the exact array this screen already renders as Not confirmed,"
    + " never a second derivation that could disagree with it",
  );
  assert.match(
    code,
    /\{fillAgainControl !== "hidden" && \(\s*<Button onClick=\{onRestart\} disabled=\{restarting \|\| resumeContactRefreshBusy\} variant="secondary">/,
    "Fill the form again must call the SAME onRestart handler and restarting flag Start it again uses"
    + " - one caller, the existing submit-request {restart:true} contract, no new backend route."
    + " resumeContactRefreshBusy joined restarting later (tests/resume-contact-refresh-control.test.mjs)"
    + " so a restart cannot race a resume regeneration for the same packet either",
  );
});

/* THE INVARIANT, ASSERTED AS AN ABSENCE. The fix must never have been "post the frozen save anyway
 * and hope", nor a second answer-writing route. There is exactly one PUT of reviewed answers in this
 * page's shipped code path for a direct save, and the reopen does not add another. */
test("no second answer-writing route was added to get past the refusal", async () => {
  const code = shippedCode(await readFile(PAGE, "utf8"));
  const puts = code.match(/\/review\/answers/g) ?? [];
  assert.equal(puts.length, 0,
    "the answers path is still named only inside features/applications/domain/review-answer-save.ts,"
    + " which is what stops this page pointing a second request at it");
});

/* THE SCREEN THE CONTROL OPENS, AND THE SAVE THAT NEVER LEFT THE TAB.
 *
 * "Fix an answer" opens the questions screen, whose onSubmit routed everything that was not
 * needs_attention to saveApplyAnswers - a LOCAL save that keeps the answers in component state and
 * prints "Saved." The premise is written above it: from Apply the very next press is the
 * submit-request that carries them. On `ready_for_final_approval` the next press is Send, which
 * posts no questions, so the correction was announced as saved and then dropped. A dead control and
 * a lying one are the same defect measured at different points.
 */
test("a filled packet's questions screen saves to the server instead of carrying answers locally", async () => {
  const code = shippedCode(await readFile(PAGE, "utf8"));
  assert.match(
    code,
    /if \(selectedSubmission\?\.review\.status === "needs_attention"\s*\|\|\s*\(selectedSubmission && reviewAnswerEditRoute\(selectedSubmission\.review\) !== "save"\)\)\s*\{\s*void saveReviewedAnswers\(\);/,
    "a packet whose answers cannot ride in on the next press must be written through the guarded"
    + " save, not kept in local state under a 'Saved.' banner",
  );
});

/* THE OTHER HALF OF THE SAME PROMISE. The press on a filled packet refills a company's form, so
 * "Save and continue" describes neither what it does nor where it goes. This screen's whole history
 * is controls that said one thing and did another; the fix is not allowed to add one. */
test("the questions screen's own button says the save will refill the company's form", async () => {
  const code = shippedCode(await readFile(PAGE, "utf8"));
  assert.match(code, /refillsFormOnSave = false/,
    "defaulted, so every Apply-time and stopped-run packet keeps the wording it has");
  assert.match(code, /: refillsFormOnSave\s*\?\s*"Save and fill the form again"\s*:\s*"Save and continue"/,
    "and the wording changes only for the packet whose save really does refill a form");
  assert.match(
    code,
    /refillsFormOnSave=\{Boolean\(selectedSubmission\) && reviewAnswerEditRoute\(selectedSubmission!\.review\) === "reopen"\}/,
    "bound to the SAME predicate the save branches on, so the label and the request cannot disagree",
  );
});

/* THE LAW THIS MODULE WAS WRITTEN TO ENFORCE, APPLIED TO THE NEW PATH. review-answer-save.ts: "A
 * success message rendered before the write is a message about nothing, and that is the exact shape
 * of the defect." A restart the server refuses leaves the packet where it was; announcing a refill
 * over that would be the same lie in a new place. */
test("the reopen announces itself only after the packet actually moved", async () => {
  const code = shippedCode(await readFile(PAGE, "utf8"));
  const branch = code.slice(code.indexOf('if (editRoute === "reopen")'));
  const notice = branch.indexOf("setNotice(REVIEW_ANSWERS_REOPEN_NOTICE)");
  const request = branch.indexOf("await prepareApplication(answerDraftQuestions");
  assert.ok(request >= 0 && notice > request,
    "the banner is built from the outcome, never fired before the request");
  assert.match(
    branch.slice(0, notice),
    /if \(reopened\.review\.status === "ready_for_final_approval"\)[\s\S]{0,200}?saved: false, message: REVIEW_ANSWERS_REOPEN_REFUSED/,
    "a packet still sitting at ready_for_final_approval is a restart that did not land, and it must"
    + " report a refusal rather than a refill",
  );
});
