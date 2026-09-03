import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* THE QUESTION SCREEN HAD NO WAY BACK TO A RUN.
 *
 * MEASURED, prod, 2026-09-03. xolife on Personio, packet 29c73b37, confirmed on six more. With a
 * required question pending, the dashboard routes the row straight to "Application answer 1 of N",
 * whose whole control set was Skip, Save and next, All applications and Switch applications. None
 * of them re-reads the employer's form, so:
 *
 *   - a packet whose questions were discovered BEFORE a resolver fix shipped could never benefit
 *     from that fix. Seven of the ten boards in the 2026-09-02 campaign were frozen this way (bloc
 *     work permit, language level, tenure bands, available-from, EEO option lists, crelate and
 *     pinpoint label reads);
 *   - a required essay Litos now drafts at prepare time (PR #859) never got its draft, because the
 *     draft is produced by a run.
 *
 * The "One thing to finish" card, shown only when NO required question is pending, already offered
 * Try again and Open packet review. This screen was the one with no door.
 *
 * Everything below is that door: one secondary control, reusing the ONE guarded prepare path, with
 * the render decision in a unit-tested domain function rather than in JSX. */
const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
const control = readFileSync(
  new URL("../features/applications/domain/fill-again-control.ts", import.meta.url), "utf8");

function directPrompt() {
  const start = page.indexOf("export function DirectApplicationQuestion(");
  const end = page.indexOf("\nfunction SubmissionScreen(", start);
  assert.ok(start !== -1 && end > start, "DirectApplicationQuestion must still be findable");
  return page.slice(start, end);
}

describe("the question screen can start the same managed run the packet review starts", () => {
  const prompt = directPrompt();

  test("the press reuses refreshEmployerQuestionMetadata, never a second submit-request caller", () => {
    assert.match(page, /onFillAgain: onRefreshQuestionMetadata,/);
    assert.match(prompt, /onClick=\{fillAgain\.onFillAgain\}/);
    assert.doesNotMatch(prompt, /api<|submit-request/,
      "the question screen must not grow its own path to the employer");
  });

  test("the render decision is the domain function, not a condition written into JSX", () => {
    assert.match(prompt, /const fillAgainState = fillAgainControlState\(\{[\s\S]*?status: fillAgain\.status,[\s\S]*?submissionClaimed: fillAgain\.claimed,[\s\S]*?unverifiedResolution: fillAgain\.unverifiedResolution,[\s\S]*?running: fillAgain\.running,[\s\S]*?unsavedAnswer: fillAgain\.editsUnsaved \|\| answerDirty,[\s\S]*?needsPacketReview: fillAgain\.needsPacketReview,/);
    assert.match(prompt, /\{fillAgainState\.available && \(/);
  });

  test("the guard is read off the review the same way the server reads it", () => {
    assert.match(page, /status: review\.status,[\s\S]*?claimed: Boolean\(review\.submission_claimed_at\),[\s\S]*?unverifiedResolution: review\.unverified_submission\?\.resolution,/);
    assert.match(control, /status !== "needs_attention"/);
    assert.match(control, /submissionClaimed && input\.unverifiedResolution !== "not_sent"/);
  });

  test("an unsaved answer of her own cannot ride the run", () => {
    assert.match(prompt, /unsavedAnswer: fillAgain\.editsUnsaved \|\| answerDirty/);
    assert.match(prompt, /disabled=\{fillAgainState\.disabled\}/);
    assert.match(prompt, /Save this answer first\. Litos fills the form again from your saved answers only\./);
  });

  test("it says plainly that nothing saved is discarded and nothing is sent", () => {
    assert.match(prompt, /Litos opens the company form again with your saved resume and the answers already on file\. Nothing you have saved is discarded, and nothing goes to the employer\./);
    assert.match(prompt, /Litos needs your exact packet review before it can fill the employer form again\./);
  });

  test("it has a loading state and its own accessible description", () => {
    assert.match(prompt, /aria-busy=\{fillAgainState\.busy\}/);
    assert.match(prompt, /aria-describedby=\{fillAgainHelpId\}/);
    assert.match(prompt, /fillAgainState\.busy \? <PendingLabel>\{fillAgainState\.label\}<\/PendingLabel> : fillAgainState\.label/);
  });

  test("a refusal lands beside the control, filtered, never as a raw server string", () => {
    assert.match(prompt, /\{fillAgain\.error && \(\s*<p role="alert" className="mt-3 text-small leading-6 text-danger">\{fillAgain\.error\}<\/p>/);
    assert.match(page, /error: questionMetadataRefreshError,/);
    assert.match(page, /const message = userFacingError\(reason, "We could not open the company's application page\."\);/,
      "the one refusal both this control and the portal screen show must go through the filter");
  });

  test("the run's own answer set replaces the screen's when it returns", () => {
    const prepare = page.slice(
      page.indexOf("async function prepareApplication("),
      page.indexOf("async function completeHandoff("),
    );
    assert.ok(prepare.length > 0, "prepareApplication must still be findable");
    assert.match(prepare, /setQuestions\(published\.review\.questions\)/);
    assert.match(prepare, /setSubmission\(published\)/);
    assert.match(prepare, /moveToScreen\(screenForStatus\(published\.review\.status, "submitting"\)\)/);
  });

  test("the QA question harness renders no control it cannot run", () => {
    const harness = readFileSync(
      new URL("../app/qa/question-blocker/harness.tsx", import.meta.url), "utf8");
    assert.match(harness, /fillAgain=\{\{[\s\S]*?status: "questions_ready",/,
      "a harness with no packet behind it must not paint a run control");
  });
});
