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
  assert.match(refresh, /continueFromVerifiedPacket\(\{/);
  assert.match(refresh, /allowServerAnswerRefresh: true/);
  assert.match(refresh, /failureScreen: "questions"/);
  assert.match(refresh, /source: "metadata_refresh"/);
  assert.doesNotMatch(refresh, /api<|submit-request/,
    "metadata refresh must reuse the exact-packet approval and guarded preparation path");
});

test("metadata recovery spends the exact packet acknowledgement before preparation", () => {
  const continuation = functionBody(PAGE, "async function continueFromVerifiedPacket(");
  const acknowledgement = continuation.indexOf("/packet-audit/acknowledge");
  const preparation = continuation.indexOf("prepareApplication(questions, options)");

  assert.match(continuation, /!options\.allowServerAnswerRefresh && routeMissingRequiredAnswers\(questions\)/);
  assert.ok(acknowledgement >= 0, "the exact packet acknowledgement is missing");
  assert.ok(preparation > acknowledgement, "preparation started before exact packet acknowledgement");
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
  assert.match(metadata, /"Review packet first"/);
  assert.match(metadata, /Litos needs your exact packet review before it can fill the employer form\./);
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

  assert.match(prepare, /moveToScreen\(distinctionRisk[\s\S]*?\? "portal"[\s\S]*?: options\.failureScreen \?\? \(options\.restart \? "portal" : "review"\)\)/);
  assert.match(prepare, /options\.failureScreen === "questions"/);
  assert.match(prepare, /setMetadataRefreshError\(\{ applicationId, message \}\)/);
});

test("the first packet audit ignores only unread employer metadata", () => {
  const routeStart = PAGE.indexOf("function routeMissingRequiredAnswers(");
  const routeEnd = PAGE.indexOf("async function continueFromResume(", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, "could not isolate the required-answer router");
  const route = PAGE.slice(routeStart, routeEnd);
  const continuation = functionBody(PAGE, "async function continueFromResume(");

  assert.match(route, /const firstMissingId = nextRoute\.kind === "answer" \? nextRoute\.questionId : null/,
    "the pure route's applicant-answer decision must remain an unconditional blocker");
  assert.match(route, /const requiredMetadataMissing = nextRoute\.kind === "metadata_refresh"/);
  assert.match(continuation, /const nextQuestionRoute = requiredQuestionReviewRoute\(/);
  assert.match(continuation, /nextQuestionRoute\.kind !== "metadata_refresh" && routeMissingRequiredAnswers\(questions\)/,
    "the first audit must defer only employer metadata, never an applicant answer");
});

test("review creates evidence and then starts the scoped employer metadata read", () => {
  const actionStart = PAGE.indexOf("const reviewPrimaryAction =");
  const actionEnd = PAGE.indexOf("const recordPacketPdfVerification", actionStart);
  assert.ok(actionStart >= 0 && actionEnd > actionStart, "could not isolate the review primary action");
  const action = PAGE.slice(actionStart, actionEnd);

  assert.match(action, /canRefreshRequiredMetadataFromReview/);
  assert.match(action, /packetEvidenceNeedsFreshAudit \? auditPacketAgain : continueFromResume/,
    "the ordinary first and stale audit actions must retain their no-argument handlers");
  assert.match(action, /continueFromVerifiedPacket\(\{[\s\S]*?allowServerAnswerRefresh: true,[\s\S]*?failureScreen: "questions",[\s\S]*?source: "metadata_refresh"/,
    "reviewed packet evidence must lead to the one guarded metadata refresh path");
});

test("metadata-only eligibility is recalculated from the current audited question snapshot", () => {
  assert.match(PAGE, /const canRefreshRequiredMetadataFromReview = requiredQuestionReviewRoute\([\s\S]*?questions,[\s\S]*?selectedSubmission\?\.review\.question_metadata_blockers \?\? \[\],[\s\S]*?\)\.kind === "metadata_refresh"/);
  assert.match(PAGE, /const auditedQuestions = Array\.isArray\(response\.questions\) \? response\.questions : questions;[\s\S]*?setQuestions\(auditedQuestions\)/,
    "packet-audit questions must publish before review can recompute the special action");
});

test("audit again clears stale evidence before using the same guarded continuation", () => {
  const audit = functionBody(PAGE, "async function auditPacketAgain()");

  assert.match(audit, /packetEvidenceRef\.current = null/);
  assert.match(audit, /setPacketEvidence\(null\)/);
  assert.match(audit, /await continueFromResume\(\)/);
});
