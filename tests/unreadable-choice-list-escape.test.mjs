/**
 * THE ONE SCREEN WITH NO CORRECT PRESS ON IT, and the control that ends that.
 *
 * MEASURED on the Zeus Fire and Security breezy packet (application 31ff26a8 / packet f04623c3,
 * 2026-09-03). Its veteran control was stored with ONE option, the claim itself, while her answer
 * is "No", so `choiceMissing` is true and stays true: Save disabled under "Choose one of the
 * employer's current options before saving", no Skip because the question is required, and the
 * only selectable thing on screen a protected-veteran claim she does not make. Saving cannot end
 * it, because a save moves questions_reviewed_at, the pass resets, and the plan selects the same
 * question again.
 *
 * The recovery has always existed and has always been somewhere else: the answers screen's own
 * metadata panel, which on that packet is occluded by four standing attention rows until each is
 * acknowledged. This puts the same run, under the same gating, on the screen she is stuck on.
 *
 * WHY A SOURCE PIN AND NOT A BEHAVIOURAL TEST. The behaviour is asserted for real in
 * tests/e2e/question-blocker.spec.mjs against the `unreadable-choice-list` fixture, which renders
 * this component in a browser, counts its controls and clicks the re-read. That suite runs only in
 * CI's browser job (`npm test` does not run tests/e2e/*.spec.mjs), so these three assertions are
 * what fails a local run if the control, its binding or its trigger is dropped.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* Comments stripped first, the same way tests/application-submission-gate.test.mjs does it: the
   note beside this control necessarily quotes the condition being asserted. */
function shippedCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const dashboard = shippedCode(await readFile(
  new URL("../app/dashboard/applications/page.tsx", import.meta.url),
  "utf8",
));

test("the trigger is the shared answered rule read off the SAVED answer", () => {
  /* Not a fourth membership test, and not the live `answer`: the prompt is about what Litos is
     holding, so it has to say the same thing the badge and the send gate say about it. */
  assert.match(
    dashboard,
    /const savedAnswerNamesNoOption = Boolean\(savedAnswer\.trim\(\)\) && !questionReadsAsAnswered\(task\.question\);/,
    "the unreadable-list prompt must read questionReadsAsAnswered off the stored answer",
  );
});

test("the re-read is offered on the question screen and is bound to the run", () => {
  const start = dashboard.indexOf("{savedAnswerNamesNoOption && (");
  assert.ok(start > 0, "the unreadable-list block must remain discoverable");
  const block = dashboard.slice(start, start + 2200);
  assert.match(block, /onClick=\{onRefreshMetadata\}/, "the control must start the managed re-read");
  assert.match(
    block,
    /disabled=\{busy \|\| refreshingMetadata \|\| metadataRefreshDisabled\}/,
    "same gating as the answers screen panel, or the two controls disagree about when the run is available",
  );
  assert.match(block, /metadataRefreshNeedsPacketReview\s*\n?\s*\? "Review packet first"/);
});

test("the question screen receives the same four facts the answers panel renders with", () => {
  const start = dashboard.indexOf("<DirectApplicationQuestion");
  assert.ok(start > 0);
  const call = dashboard.slice(start, dashboard.indexOf("/>", start));
  for (const wiring of [
    /onRefreshMetadata=\{onRefreshQuestionMetadata\}/,
    /refreshingMetadata=\{questionMetadataRefreshing\}/,
    /metadataRefreshDisabled=\{questionMetadataRefreshDisabled\}/,
    /metadataRefreshNeedsPacketReview=\{questionMetadataNeedsPacketReview\}/,
    /metadataRefreshError=\{questionMetadataRefreshError\}/,
  ]) assert.match(call, wiring);
});

test("nothing is selected, blanked or exempted for her", () => {
  /* The three things this fix must NOT do, and each is a repair that was tried and rejected in
     review on this same packet: exempt her answer at the shared membership rule, tick the sole
     claim, or blank what she stored. */
  const start = dashboard.indexOf("{savedAnswerNamesNoOption && (");
  const block = dashboard.slice(start, start + 2200);
  assert.doesNotMatch(block, /updateAnswer\(/, "the prompt must not write an answer");
  assert.doesNotMatch(block, /checked=/, "the prompt must not select anything");
  assert.match(block, /savedAnswer\.trim\(\)/, "her stored answer is quoted, not replaced");
});
