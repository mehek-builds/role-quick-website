import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const PAGE = readFileSync("app/dashboard/applications/page.tsx", "utf8");

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `could not find ${signature}`);
  const next = source.indexOf("\n  async function ", start + signature.length);
  const nextSync = source.indexOf("\n  function ", start + signature.length);
  const nextTopLevel = source.indexOf("\nfunction ", start + signature.length);
  const ends = [next, nextSync, nextTopLevel].filter((index) => index > start);
  return source.slice(start, ends.length > 0 ? Math.min(...ends) : source.length);
}

test("stale employer metadata can start one fresh managed read with only saved answers", () => {
  const start = PAGE.indexOf("async function refreshEmployerQuestionMetadata()");
  const end = PAGE.indexOf("\n  const visiblePageError", start);
  assert.ok(start >= 0 && end > start, "could not isolate refreshEmployerQuestionMetadata");
  const refresh = PAGE.slice(start, end);

  assert.match(refresh, /metadataRefreshRef\.current === applicationId/);
  assert.match(refresh, /packetQuestionsSnapshot\(questions\) !== packetQuestionsSnapshot\(selectedSubmission\.review\.questions\)/);
  assert.match(refresh, /prepareApplication\(selectedSubmission\.review\.questions, \{/);
  assert.match(refresh, /allowServerAnswerRefresh: true/);
  assert.match(refresh, /failureScreen: "questions"/);
  assert.match(refresh, /source: "metadata_refresh"/);
  assert.doesNotMatch(refresh, /api<|submit-request/,
    "metadata refresh must reuse the single guarded preparation path");
});

test("the metadata recovery action is explicit, accessible, and stays beside its failure", () => {
  const screen = functionBody(PAGE, "function QuestionsScreen(");
  const metadata = screen.slice(
    screen.indexOf("{effectiveMetadataBlockers.length > 0 && ("),
    screen.indexOf("{visibleQuestions.map"),
  );

  assert.ok(metadata.length > 0, "could not isolate the metadata blocker panel");
  assert.match(metadata, /"Review and fill again"/);
  assert.match(metadata, /Litos opens the employer form, reads its current fields, and fills only your saved answers\./);
  assert.match(metadata, /disabled=\{refreshingMetadata \|\| metadataRefreshDisabled\}/);
  assert.match(metadata, /aria-busy=\{refreshingMetadata\}/);
  assert.match(metadata, /aria-describedby="question-metadata-refresh-help"/);
  assert.match(metadata, /role="alert"/);
  assert.match(metadata, /metadataRefreshError/);
});

test("unsaved edits cannot ride a metadata refresh and the refresh is the blocker screen primary", () => {
  assert.match(PAGE, /metadataRefreshDisabled=\{questionEditsUnsaved\}/);
  assert.match(PAGE, /currentQuestionsSnapshot !== packetQuestionsSnapshot\(selectedSubmission\.review\.questions\)/);

  const screen = functionBody(PAGE, "function QuestionsScreen(");
  assert.match(screen, /Save or go Back to discard your edits before refreshing\./);
  assert.match(screen, /Unsaved edits on this page are not used\./);
  assert.match(screen, /variant=\{requiredMetadataBlocked \? "secondary" : "primary"\}/,
    "saving partial answers must not visually outrank the action that can clear the blocker");
  assert.match(screen, /disabled=\{saving \|\| refreshingMetadata/,
    "answer save and metadata refresh must not race");
});

test("metadata refresh failures return to the question screen instead of hiding behind it", () => {
  const prepare = functionBody(PAGE, "async function prepareApplication(");

  assert.match(prepare, /moveToScreen\(options\.failureScreen \?\? \(options\.restart \? "portal" : "review"\)\)/);
  assert.match(prepare, /options\.failureScreen === "questions"/);
  assert.match(prepare, /setMetadataRefreshError\(\{ applicationId, message \}\)/);
});
