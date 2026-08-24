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
  assert.ok(end > start, `${endSignature} must follow ${startSignature}`);
  return page.slice(start, end);
}

function requiredIndex(source, needle, label = needle, fromIndex = 0) {
  const index = source.indexOf(needle, fromIndex);
  assert.ok(index >= 0, `${label} is missing`);
  return index;
}

function assertOrdered(indices, message) {
  assert.ok(indices.every((index) => index >= 0), `${message}: every source marker must exist`);
  for (let index = 1; index < indices.length; index += 1) {
    assert.ok(indices[index] > indices[index - 1], message);
  }
}

test("Applications asks one trusted employer question with one explicit save", () => {
  const prompt = sourceSection("function DirectApplicationQuestion(", "function SubmissionScreen(");

  assert.match(prompt, /const \[promptFingerprint\] = useState\(\(\) => directQuestionPromptFingerprint\(task\)\)/);
  assert.match(prompt, /const \[taskFingerprint\] = useState\(\(\) => directQuestionTaskFingerprint\(task\)\)/);
  assert.match(prompt, /preservedDraft\?\.promptFingerprint === promptFingerprint/);
  assert.match(prompt, /onDraftChange\(promptFingerprint, taskFingerprint, next\)/);
  assert.match(prompt, /task\.question\.options && task\.question\.options\.length > 0/);
  assert.match(prompt, /<fieldset aria-labelledby=\{headingId\}/);
  assert.match(prompt, /<select/);
  assert.match(prompt, /<textarea/);
  assert.match(prompt, /Save to application/);
  assert.match(prompt, /Confirm and save/);
  assert.match(prompt, /Saved to this application\./);
  assert.doesNotMatch(prompt, /bg-warn|border-warn|text-warn/);
});

test("drafts and refusals follow immutable prompt identity across a raced review", () => {
  const identityTypes = sourceSection("type DirectAnswerFailure = {", "function directAnswerPassKey(");
  const prompt = sourceSection("function DirectApplicationQuestion(", "function SubmissionScreen(");
  const save = functionBody("  async function saveReviewedAnswers(");

  assert.match(identityTypes, /type DirectAnswerFailure = \{[\s\S]*?promptFingerprint: string;/);
  assert.match(identityTypes, /type DirectAnswerDraft = \{[\s\S]*?promptFingerprint: string;[\s\S]*?answer: string;/);
  assert.match(save, /promptFingerprint: string;[\s\S]*?taskFingerprint: string;/);
  assert.match(save, /promptFingerprint: direct\.promptFingerprint/);
  assert.match(save, /safeDirectPromptFingerprint !== direct\.promptFingerprint/);
  assert.match(prompt, /preservedDraft\?\.promptFingerprint === promptFingerprint[\s\S]*?preservedDraft\.answer/);
  assert.match(prompt, /externalFailure\?\.promptFingerprint === promptFingerprint \? externalFailure\.message : null/);
  assert.match(prompt, /onClearFailure\(promptFingerprint\)/);
  assert.match(prompt, /onSave\(task\.question\.id, answer, task\.intent, promptFingerprint, taskFingerprint\)/);
  assert.match(page, /onDirectAnswerDraftChange=\{\(promptFingerprint, taskFingerprint, answer\) => \{[\s\S]*?next\.set\(selected\.id, \{ promptFingerprint, taskFingerprint, answer \}\)/);
  assert.match(page, /onClearDirectAnswerFailure=\{\(promptFingerprint\) => \{[\s\S]*?current\.get\(selected\.id\)\?\.promptFingerprint !== promptFingerprint/);

  const refusalStart = requiredIndex(save, "if (!result.saved) {", "refused save branch");
  const refusedFailure = requiredIndex(save, "if (direct) rememberDirectFailure(result.message)", "prompt-keyed refused failure", refusalStart);
  const refusalReturn = requiredIndex(save, "return { saved: false, message: result.message", "refused save return", refusedFailure);
  const draftClear = requiredIndex(save, "setDirectAnswerDrafts((current)", "accepted draft clear", refusalReturn);
  const failureClear = requiredIndex(save, "setDirectAnswerFailures((current)", "accepted failure clear", draftClear);
  assertOrdered(
    [refusalStart, refusedFailure, refusalReturn, draftClear, failureClear],
    "a 202 must preserve the prompt-keyed draft and failure until an answer is accepted",
  );
});

test("a genuinely changed employer prompt shows the held answer as recovery", () => {
  const screen = sourceSection("function SubmissionScreen(", "function SubmissionReceipt(");
  const currentPrompt = requiredIndex(screen, "const currentDirectPromptFingerprint", "current prompt fingerprint");
  const draftMatch = requiredIndex(
    screen,
    "directAnswerDraft.promptFingerprint === currentDirectPromptFingerprint",
    "draft prompt comparison",
    currentPrompt,
  );
  const recoveryNeeded = requiredIndex(screen, "const directRecoveryNeeded", "changed-prompt recovery state", draftMatch);
  const recoveryRender = requiredIndex(screen, "{directRecoveryNeeded && (", "changed-prompt recovery render", recoveryNeeded);
  const recoveryAlert = requiredIndex(screen, '<div role="alert"', "changed-prompt recovery alert", recoveryRender);
  const heldAnswer = requiredIndex(screen, "{directAnswerDraft.answer", "held draft answer", recoveryAlert);
  const promptBranch = requiredIndex(screen, "{directAnswerActive ? (", "current direct prompt", heldAnswer);

  assertOrdered(
    [currentPrompt, draftMatch, recoveryNeeded, recoveryRender, recoveryAlert, heldAnswer, promptBranch],
    "the changed-prompt recovery and held answer must appear before the current prompt",
  );
  assert.match(
    screen.slice(recoveryRender, promptBranch),
    /This employer field changed before your answer was saved\.[\s\S]*?Unsaved answer/,
  );
});

test("direct answer passes always expire on a real review version", () => {
  const passKey = sourceSection("function directAnswerPassKey(", "function submissionPublicationGeneration(");

  assert.match(
    passKey,
    /return review\.questions_reviewed_at \?\? review\.submission_run_id \?\? review\.updated_at;/,
  );
  assert.doesNotMatch(passKey, /unversioned/);
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
  const savedGuard = requiredIndex(save, "if (!result.saved)", "refused answer guard");
  const evidenceClear = requiredIndex(save, "packetEvidenceRef.current = null", "accepted answer evidence clear", savedGuard);
  const publish = requiredIndex(save, 'publishSubmissionEnvelope(submissionRef, saved, "direct")', "accepted answer publication", savedGuard);

  assertOrdered(
    [savedGuard, publish, evidenceClear],
    "authoritative state and packet evidence may only publish after the server accepts the answer",
  );
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

test("a raced refusal cannot publish over a newer selection or submission snapshot", () => {
  const poll = functionBody("  const refreshSubmission = useCallback(async () => {");
  const save = functionBody("  async function saveReviewedAnswers(");

  assert.match(page, /const submissionPublicationGenerationsRef = useRef<Map<string, number>>\(new Map\(\)\)/);
  assert.match(page, /function submissionPublicationGeneration\([\s\S]*?return generations\.get\(applicationId\) \?\? 0;/);
  assert.match(page, /function advanceSubmissionPublicationGeneration\([\s\S]*?generations\.set\(applicationId, submissionPublicationGeneration\(generations, applicationId\) \+ 1\);/);

  const capture = requiredIndex(save, "const requestedPublicationGeneration = submissionPublicationGeneration(", "save publication generation capture");
  const request = requiredIndex(save, "const result = await saveReviewAnswers", "review answer request", capture);
  const refusalStart = requiredIndex(save, "if (!result.saved) {", "refused save branch", request);
  const refusalReturn = requiredIndex(
    save,
    "return { saved: false, message: result.message",
    "refused save return",
    refusalStart,
  );
  const acceptedStart = requiredIndex(
    save,
    "submissionMutationGenerationRef.current += 1;",
    "accepted save publication",
    refusalReturn,
  );
  assertOrdered(
    [capture, request, refusalStart, refusalReturn, acceptedStart],
    "the publication generation must be captured before the request and its refusal branch",
  );

  const refusal = save.slice(refusalStart, acceptedStart);
  const ownership = requiredIndex(refusal, "const refusalStillOwnsApplication", "refusal ownership guard");
  const mounted = requiredIndex(refusal, "applicationsMountedRef.current", "mounted ownership", ownership);
  const selected = requiredIndex(refusal, "selectedIdRef.current === applicationId", "selected application ownership", mounted);
  const revision = requiredIndex(refusal, "editorRevisionRef.current === selectionRevision", "selection revision ownership", selected);
  const generation = requiredIndex(refusal, "submissionPublicationGeneration(", "per-application publication generation", revision);
  const generationMatch = requiredIndex(refusal, ") === requestedPublicationGeneration", "publication generation comparison", generation);
  const guardedReview = requiredIndex(refusal, "if (result.review && refusalStillOwnsApplication)", "guarded refused review", generationMatch);
  const packetPublish = requiredIndex(refusal, "setPackets((current)", "guarded packet publication", guardedReview);
  const visiblePublish = requiredIndex(refusal, 'publishSubmissionEnvelope(submissionRef, reconciled, "direct")', "guarded visible publication", packetPublish);
  assertOrdered(
    [ownership, mounted, selected, revision, generation, generationMatch, guardedReview, packetPublish, visiblePublish],
    "a refused review must prove selection and snapshot ownership before any publication",
  );

  const pollPublish = requiredIndex(poll, 'result = publishSubmissionEnvelope(submissionRef, result, "poll")', "poll publication");
  const pollAdvance = requiredIndex(
    poll,
    "advanceSubmissionPublicationGeneration(submissionPublicationGenerationsRef.current, requestedId)",
    "poll publication generation advance",
    pollPublish,
  );
  assertOrdered(
    [pollPublish, pollAdvance],
    "a newer poll publication must advance the per-application recency token",
  );
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
  assert.match(save, /if \(!result\.saved\)[\s\S]*?const refusalStillOwnsApplication[\s\S]*?if \(result\.review && refusalStillOwnsApplication\) \{[\s\S]*?submissionMutationGenerationRef\.current \+= 1;[\s\S]*?publishSubmissionEnvelope\(submissionRef, reconciled, "direct"\)/);
  assert.match(save, /submissionMutationGenerationRef\.current \+= 1;[\s\S]*?const saved: SubmissionResponse/);
  assert.match(screen, /const directAnswerActive = needsAttention && !awaitingUnverifiedSubmission && currentDirectQuestion !== null/);
  assert.match(screen, /\{!directAnswerActive && <>[\s\S]*?<Button onClick=\{onReviewPacket\}>Open packet review<\/Button>[\s\S]*?<Button onClick=\{onRetry\} variant="secondary">Try again<\/Button>/);
  assert.match(screen, /!awaitingUnverifiedSubmission && !directAnswerActive && filledFormEvidence/);
});
