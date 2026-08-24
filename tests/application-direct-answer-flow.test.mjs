import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");

function functionBody(signature) {
  const start = page.indexOf(signature);
  assert.notEqual(start, -1, `${signature} is missing`);
  const candidates = [
    page.indexOf("\nfunction ", start + signature.length),
    page.indexOf("\n  function ", start + signature.length),
    page.indexOf("\n  async function ", start + signature.length),
  ].filter((index) => index > start);
  return page.slice(start, candidates.length > 0 ? Math.min(...candidates) : page.length);
}

function sourceSection(startSignature, endSignature) {
  const start = page.indexOf(startSignature);
  const end = page.indexOf(endSignature, start + startSignature.length);
  assert.notEqual(start, -1, `${startSignature} is missing`);
  assert.notEqual(end, -1, `${endSignature} is missing`);
  return page.slice(start, end);
}

test("Applications asks one trusted employer question with one explicit save", () => {
  const prompt = sourceSection("function DirectApplicationQuestion(", "function SubmissionScreen(");

  assert.match(prompt, /const \[taskFingerprint\] = useState\(\(\) => directQuestionTaskFingerprint\(task\)\)/);
  assert.match(prompt, /preservedDraft\?\.taskFingerprint === taskFingerprint/);
  assert.match(prompt, /onDraftChange\(taskFingerprint, next\)/);
  assert.match(prompt, /task\.question\.options && task\.question\.options\.length > 0/);
  assert.match(prompt, /<fieldset aria-labelledby=\{headingId\}/);
  assert.match(prompt, /<select/);
  assert.match(prompt, /<textarea/);
  assert.match(prompt, /Save to application/);
  assert.match(prompt, /Confirm and save/);
  assert.match(prompt, /Saved to this application\./);
  assert.doesNotMatch(prompt, /bg-warn|border-warn|text-warn/);
});

test("direct answer saves revalidate the latest server question and exact choices", () => {
  const save = functionBody("  async function saveReviewedAnswers(");

  assert.match(save, /const activeSubmission = submissionRef\.current\?\.application_id === applicationId/);
  assert.match(save, /directInputTaskPlan\(activeSubmission\.review/);
  assert.match(save, /safeDirectTask\.intent !== direct\.intent/);
  assert.match(save, /directQuestionTaskFingerprint\(safeDirectTask\) !== direct\.taskFingerprint/);
  assert.match(save, /!safeDirectTask\.question\.options\.includes\(direct\.answer\)/);
  assert.match(save, /activeSubmission\.review\.questions\.map/);
  assert.doesNotMatch(save, /mergeDiscoveredQuestions\(questions, activeSubmission\.review\.questions\)/);
});

test("a refused answer keeps evidence and only an accepted answer publishes", () => {
  const save = functionBody("  async function saveReviewedAnswers(");
  const savedGuard = save.indexOf("if (!result.saved)");
  const evidenceClear = save.indexOf("packetEvidenceRef.current = null");
  const publish = save.indexOf('publishSubmissionEnvelope(submissionRef, saved, "direct")');

  assert.ok(savedGuard >= 0, "the saved false branch must exist");
  assert.ok(evidenceClear > savedGuard, "packet evidence can only clear after the server accepted the answer");
  assert.ok(publish > savedGuard, "authoritative state can only publish after the server accepted the answer");
  assert.match(save, /runDashboardTransition\(publishSavedAnswer\)/);
});

test("answer writes stay owned by their application and selection generation", () => {
  assert.match(page, /const savingAnswersRef = useRef<Set<string>>\(new Set\(\)\)/);
  const save = functionBody("  async function saveReviewedAnswers(");
  assert.match(save, /savingAnswersRef\.current\.has\(applicationId\)/);
  assert.match(save, /savingAnswersRef\.current\.add\(applicationId\)/);
  assert.match(save, /const selectionRevision = editorRevisionRef\.current/);
  assert.match(save, /selectedIdRef\.current !== applicationId/);
  assert.match(save, /editorRevisionRef\.current !== selectionRevision/);
  assert.match(save, /packetWithDirectSubmission\(packet, saved\)/);
  assert.match(save, /setDirectAnswerPasses/);
  assert.match(save, /directAnswerPassKey\(result\.review\)/);
  assert.match(save, /mayAdvance: false/);
  assert.match(save, /setDirectAnswerDrafts/);
  assert.match(save, /setDirectAnswerFailures/);
});

test("a landed answer advances the local prompt queue without starting a submission", () => {
  const submissionScreen = sourceSection("function SubmissionScreen(", "function SubmissionReceipt(");
  const saveCurrentStart = submissionScreen.indexOf("  async function saveCurrentDirectQuestion(");
  const saveCurrentEnd = submissionScreen.indexOf("\n  const completedItems", saveCurrentStart);
  assert.ok(saveCurrentStart >= 0, "the direct prompt save handler must exist");
  assert.ok(saveCurrentEnd > saveCurrentStart, "the direct prompt save handler must have a stable boundary");
  const saveCurrent = submissionScreen.slice(saveCurrentStart, saveCurrentEnd);

  assert.match(submissionScreen, /remainingDirectQuestions = directTaskPlan\.questionTasks\.filter/);
  assert.match(submissionScreen, /answeredQuestionFingerprints\.has\(directQuestionPromptFingerprint\(task\)\)/);
  assert.match(submissionScreen, /const nextTaskPlan = directInputTaskPlan\(\{ \.\.\.result\.review/);
  assert.match(submissionScreen, /savedQuestionFingerprints = new Set\(answeredQuestionFingerprints\)\.add\(result\.promptFingerprint\)/);
  assert.match(submissionScreen, /nextTaskPlan\.questionTasks\.some/);
  assert.match(submissionScreen, /key=\{directQuestionTaskFingerprint\(currentDirectQuestion\)\}/);
  assert.match(saveCurrent, /if \(!result\.mayAdvance\) return result/);
  assert.match(saveCurrent, /onQuestionsFinished\(\)/);
  assert.doesNotMatch(saveCurrent, /prepareApplication|submit-request|approveFinalSubmission/);
});

test("a direct answer owns the screen and invalidates an older poll snapshot", () => {
  const poll = functionBody("  const refreshSubmission = useCallback(async () => {");
  const save = functionBody("  async function saveReviewedAnswers(");
  const screen = sourceSection("function SubmissionScreen(", "function SubmissionReceipt(");

  assert.match(page, /const submissionMutationGenerationRef = useRef\(0\)/);
  assert.match(poll, /const requestedMutationGeneration = submissionMutationGenerationRef\.current/);
  assert.match(poll, /submissionMutationGenerationRef\.current !== requestedMutationGeneration/);
  assert.match(save, /if \(!result\.saved\)[\s\S]*?if \(result\.review\) \{[\s\S]*?submissionMutationGenerationRef\.current \+= 1;[\s\S]*?publishSubmissionEnvelope\(submissionRef, refreshed, "direct"\)/);
  assert.match(save, /submissionMutationGenerationRef\.current \+= 1;[\s\S]*?const saved: SubmissionResponse/);
  assert.match(screen, /const directAnswerActive = needsAttention && !awaitingUnverifiedSubmission && currentDirectQuestion !== null/);
  assert.match(screen, /\{!directAnswerActive && <>[\s\S]*?<Button onClick=\{onReviewPacket\}>Open packet review<\/Button>[\s\S]*?<Button onClick=\{onRetry\} variant="secondary">Try again<\/Button>/);
  assert.match(screen, /!awaitingUnverifiedSubmission && !directAnswerActive && filledFormEvidence/);
});
