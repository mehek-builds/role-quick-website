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
  assert.match(prompt, /const \[choiceTouched, setChoiceTouched\] = useState\(false\);/);
  assert.match(prompt, /const requiredBlank = task\.question\.required && !answer\.trim\(\);/);
  assert.match(prompt, /const choiceMissing = exactOptions\.length > 0 && !exactOptions\.includes\(answer\);/);
  assert.match(prompt, /const choiceErrorVisible = choiceMissing && \(choiceTouched \|\| Boolean\(answer\.trim\(\)\)\);/);
  assert.match(prompt, /const answerBlocked = requiredBlank \|\| choiceMissing/);
  assert.doesNotMatch(prompt, /const answerBlocked[^;]*choiceErrorVisible/);
  assert.match(prompt, /const errorId = `\$\{headingId\}-error`/);
  assert.match(prompt, /const answerDescribedBy = `\$\{progressId\} \$\{helperId\}\$\{visibleError \? ` \$\{errorId\}` : ""\}`/);
  assert.equal(
    [...prompt.matchAll(/aria-labelledby=\{headingId\}\s+aria-describedby=\{answerDescribedBy\}\s+aria-invalid=\{visibleError \? true : undefined\}/g)].length,
    3,
    "radio groups, selects, and textareas must all expose their helper and error relationship",
  );
  assert.match(prompt, /<p id=\{errorId\} role="alert"/);
  assert.match(prompt, /choiceErrorVisible \? "Choose one of the employer's current options before saving\." : null/);
  assert.match(prompt, /<form onSubmit=\{submitAnswer\} aria-busy=\{busy\}/);
  assert.match(prompt, /if \(busy \|\| answerBlocked\) return;/);
  assert.match(prompt, /function updateAnswer\(next: string\) \{[\s\S]*?if \(busy\) return;/);
  assert.match(prompt, /checked=\{answer === option\}\s+disabled=\{busy\}\s+aria-disabled=\{busy\}/);
  assert.match(prompt, /<select\s+value=\{answer\}\s+disabled=\{busy\}\s+aria-disabled=\{busy\}[\s\S]*?onBlur=\{\(\) => setChoiceTouched\(true\)\}/);
  assert.match(prompt, /<option value="" disabled>Choose an answer<\/option>/);
  assert.match(prompt, /<textarea\s+value=\{answer\}\s+readOnly=\{busy\}\s+aria-disabled=\{busy\}/);
  assert.match(prompt, /disabled=\{answerBlocked\} aria-disabled=\{busy \|\| answerBlocked\}/);
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

  assert.match(save, /const activeSubmission = submissionSnapshotsRef\.current\.get\(applicationId\)[\s\S]*?\?\? \(submissionRef\.current\?\.application_id === applicationId \? submissionRef\.current : submission\)/);
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

test("accepted answer writes stay owned by their application and latest submission snapshot", () => {
  assert.match(page, /const savingAnswersRef = useRef<Set<string>>\(new Set\(\)\)/);
  assert.match(page, /const submissionSnapshotsRef = useRef<Map<string, SubmissionResponse>>\(new Map\(\)\)/);
  const save = functionBody("  async function saveReviewedAnswers(");
  const poll = functionBody("  const refreshSubmission = useCallback(async () => {");
  const selectPacket = sourceSection("  const selectPacket = useCallback((incoming: GeneratedResume) => {", "  const openApplication = useCallback(");
  assert.match(save, /savingAnswersRef\.current\.has\(applicationId\)/);
  assert.match(save, /savingAnswersRef\.current\.add\(applicationId\)/);
  assert.match(save, /const selectionRevision = editorRevisionRef\.current/);
  assert.match(save, /selectedIdRef\.current !== applicationId/);
  assert.match(save, /packetWithDirectSubmission\(packet, saved\)/);
  assert.match(save, /setDirectAnswerPasses/);
  assert.match(save, /directAnswerPassKey\(saved\.review\)/);
  assert.match(save, /mayAdvance: false/);
  assert.match(save, /setDirectAnswerDrafts/);
  assert.match(save, /setDirectAnswerFailures/);

  const rememberedSelection = requiredIndex(selectPacket, "const rememberedSubmission = submissionSnapshotsRef.current.get(packet.id) ?? null", "remembered application snapshot");
  const rememberedReview = requiredIndex(selectPacket, "const selectedReview = rememberedSubmission?.review ?? packet.spec._review", "remembered application review", rememberedSelection);
  const restoredSubmission = requiredIndex(selectPacket, "setSubmission(rememberedSubmission ?? (status", "remembered application restoration", rememberedReview);
  assertOrdered(
    [rememberedSelection, rememberedReview, restoredSubmission],
    "switching back to an application must restore its full remembered snapshot before falling back to the partial row seed",
  );

  const normalizedPoll = requiredIndex(poll, "let result: SubmissionResponse = { ...raw, review: reviewWithLists(raw.review) }", "normalized full poll response");
  const mutationGuard = requiredIndex(poll, "if (submissionMutationGenerationRef.current !== requestedMutationGeneration) return", "nonvisual poll mutation guard", normalizedPoll);
  const rememberedBeforeRead = requiredIndex(poll, "const rememberedBeforeRead = submissionSnapshotsRef.current.get(requestedId)", "remembered snapshot before poll read", mutationGuard);
  const rememberedAfterRead = requiredIndex(poll, "const rememberedAfterRead = nextSubmissionState(rememberedBeforeRead, result)", "poll snapshot reconciliation", rememberedBeforeRead);
  const changedRead = requiredIndex(poll, "if (rememberedAfterRead !== rememberedBeforeRead)", "changed poll snapshot guard", rememberedAfterRead);
  const storedRead = requiredIndex(poll, "submissionSnapshotsRef.current.set(requestedId, rememberedAfterRead)", "early nonvisual poll storage", changedRead);
  const advancedRead = requiredIndex(poll, "advanceSubmissionPublicationGeneration(submissionPublicationGenerationsRef.current, requestedId)", "early poll publication generation", storedRead);
  const selectedVisualGuard = requiredIndex(poll, "selectedIdRef.current !== requestedId", "selected poll visual guard", advancedRead);
  const revisionVisualGuard = requiredIndex(poll, "editorRevisionRef.current !== requestedSelectionRevision", "poll selection revision guard", selectedVisualGuard);
  assertOrdered(
    [
      normalizedPoll,
      mutationGuard,
      rememberedBeforeRead,
      rememberedAfterRead,
      changedRead,
      storedRead,
      advancedRead,
      selectedVisualGuard,
      revisionVisualGuard,
    ],
    "a full poll must retain and version its per-application snapshot before selection can suppress visual publication",
  );
  assert.doesNotMatch(
    poll.slice(mutationGuard, advancedRead),
    /selectedIdRef|editorRevisionRef/,
    "selection must not suppress the nonvisual per-application snapshot store",
  );

  const request = requiredIndex(save, "const result = await saveReviewAnswers", "accepted answer request");
  const latest = requiredIndex(save, "const latestSubmission = submissionSnapshotsRef.current.get(applicationId)", "latest per-application answer snapshot", request);
  const selectedFallback = requiredIndex(save, "submissionRef.current?.application_id === applicationId ? submissionRef.current : activeSubmission", "selected snapshot fallback", latest);
  const candidate = requiredIndex(save, "const acceptedCandidate: SubmissionResponse", "accepted answer candidate", selectedFallback);
  const generation = requiredIndex(save, "const acceptedPublicationChanged", "accepted response generation", candidate);
  const generationChanged = requiredIndex(save, ") !== requestedPublicationGeneration", "accepted generation comparison", generation);
  const older = requiredIndex(save, "submissionSnapshotIsOlder(latestSubmission, acceptedCandidate)", "accepted response recency", generationChanged);
  const latestTask = requiredIndex(save, "const latestDirectTask = direct", "latest direct task", older);
  const latestPlan = requiredIndex(save, "directInputTaskPlan(latestSubmission.review", "latest direct task plan", latestTask);
  const latestQuestion = requiredIndex(save, ".questionTasks.find((task) => task.question.id === direct.questionId) ?? null", "latest direct question", latestPlan);
  const exactTask = requiredIndex(save, "const latestStillHasSubmittedTask = direct && latestDirectTask", "exact submitted task guard", latestQuestion);
  const exactPrompt = requiredIndex(save, "directQuestionPromptFingerprint(latestDirectTask) === direct.promptFingerprint", "immutable prompt ownership", exactTask);
  const exactFingerprint = requiredIndex(save, "directQuestionTaskFingerprint(latestDirectTask) === direct.taskFingerprint", "immutable task ownership", exactPrompt);
  const acceptedOwnership = requiredIndex(save, "const acceptedResponseOwnsSnapshot", "accepted response ownership", exactFingerprint);
  const changedOwnership = requiredIndex(save, "!acceptedPublicationChanged", "unchanged publication ownership", acceptedOwnership);
  const recencyOwnership = requiredIndex(save, "!acceptedResponseIsOlder", "strict recency ownership", changedOwnership);
  const timestampOwnership = requiredIndex(save, "latestSubmission.review.updated_at !== acceptedCandidate.review.updated_at", "different timestamp ownership", recencyOwnership);
  const equalTimestampTaskOwnership = requiredIndex(save, "|| latestStillHasSubmittedTask", "equal timestamp task ownership", timestampOwnership);
  const savedChoice = requiredIndex(save, "const saved = acceptedResponseOwnsSnapshot", "owned snapshot selection", equalTimestampTaskOwnership);
  const changedChoice = requiredIndex(save, "? acceptedPublicationChanged", "changed publication reconciliation choice", savedChoice);
  const reconcile = requiredIndex(save, "? nextSubmissionState(latestSubmission, acceptedCandidate)", "accepted response reconciliation", changedChoice);
  const latestChoice = requiredIndex(save, ": latestSubmission", "latest snapshot fallback", reconcile);
  const packetGuard = requiredIndex(save, "if (acceptedResponseOwnsSnapshot)", "accepted packet guard", latestChoice);
  const changedAccepted = requiredIndex(save, "if (saved !== latestSubmission)", "changed accepted snapshot guard", packetGuard);
  const advancedAccepted = requiredIndex(save, "advanceSubmissionPublicationGeneration(submissionPublicationGenerationsRef.current, applicationId)", "accepted publication generation", changedAccepted);
  const storedAccepted = requiredIndex(save, "submissionSnapshotsRef.current.set(applicationId, saved)", "accepted snapshot storage", advancedAccepted);
  const packetPublish = requiredIndex(save, "setPackets((current)", "accepted packet publication", storedAccepted);
  const visibleGuard = requiredIndex(save, "!acceptedResponseOwnsSnapshot", "accepted visible ownership", packetPublish);
  const selectedGuard = requiredIndex(save, "selectedIdRef.current !== applicationId", "selected application guard", visibleGuard);
  const visiblePublish = requiredIndex(save, 'publishSubmissionEnvelope(submissionRef, saved, "direct")', "accepted visible publication", selectedGuard);
  const returnedReview = requiredIndex(save, "review: saved.review", "reconciled accepted review return", visiblePublish);
  assertOrdered(
    [
      request,
      latest,
      selectedFallback,
      candidate,
      generation,
      generationChanged,
      older,
      latestTask,
      latestPlan,
      latestQuestion,
      exactTask,
      exactPrompt,
      exactFingerprint,
      acceptedOwnership,
      changedOwnership,
      recencyOwnership,
      timestampOwnership,
      equalTimestampTaskOwnership,
      savedChoice,
      changedChoice,
      reconcile,
      latestChoice,
      packetGuard,
      changedAccepted,
      advancedAccepted,
      storedAccepted,
      packetPublish,
      visibleGuard,
      selectedGuard,
      visiblePublish,
      returnedReview,
    ],
    "an accepted answer must beat an older A hydration, preserve newer A, and never navigate B",
  );
  assert.match(
    save,
    /const latestStillHasSubmittedTask = direct && latestDirectTask\s+\? directQuestionPromptFingerprint\(latestDirectTask\) === direct\.promptFingerprint\s+&& directQuestionTaskFingerprint\(latestDirectTask\) === direct\.taskFingerprint\s+: false;/,
  );
  assert.match(
    save,
    /const acceptedResponseOwnsSnapshot = !direct\s+\|\| !acceptedPublicationChanged\s+\|\| \(!acceptedResponseIsOlder && \(\s+latestSubmission\.review\.updated_at !== acceptedCandidate\.review\.updated_at\s+\|\| latestStillHasSubmittedTask\s+\)\);/,
  );
  assert.match(
    save,
    /const saved = acceptedResponseOwnsSnapshot\s+\? acceptedPublicationChanged\s+\? nextSubmissionState\(latestSubmission, acceptedCandidate\)\s+: acceptedCandidate\s+: latestSubmission;/,
  );
  assert.doesNotMatch(
    save.slice(acceptedOwnership, visiblePublish),
    /editorRevisionRef\.current !== selectionRevision/,
  );
});

test("each accepted direct save emits one repeatable polite announcement", () => {
  const prompt = sourceSection("function DirectApplicationQuestion(", "function SubmissionScreen(");
  const save = functionBody("  async function saveReviewedAnswers(");

  assert.match(page, /const \[directAnswerAnnouncement, setDirectAnswerAnnouncement\] = useState<\{ token: number; message: string \} \| null>\(null\)/);
  assert.match(page, /if \(!directAnswerAnnouncement\) return;[\s\S]*?window\.setTimeout\(\(\) => setDirectAnswerAnnouncement\(null\), 1_200\)[\s\S]*?window\.clearTimeout\(timer\)/);
  assert.match(
    page,
    /<p[^>]*key=\{directAnswerAnnouncement\?\.token(?: \?\? [^}]*)?\}[^>]*className="sr-only"[^>]*role="status" aria-live="polite" aria-atomic="true">[\s\S]*?\{directAnswerAnnouncement\?\.message \?\? ""\}[\s\S]*?<\/p>/,
  );
  assert.equal(
    [...page.matchAll(/setDirectAnswerAnnouncement\(\{ token: Date\.now\(\), message: "Saved to this application\." \}\)/g)].length,
    1,
    "the direct save receipt must have one announcement writer",
  );

  const refusal = requiredIndex(save, "if (!result.saved) {", "refused answer branch");
  const refusalReturn = requiredIndex(save, "return { saved: false, message: result.message", "refused answer return", refusal);
  const ownershipGuard = requiredIndex(save, "!acceptedResponseOwnsSnapshot", "accepted answer ownership guard", refusalReturn);
  const selectedGuard = requiredIndex(save, "selectedIdRef.current !== applicationId", "accepted answer selection guard", ownershipGuard);
  const publish = requiredIndex(save, "const publishSavedAnswer = () => {", "accepted answer publisher", selectedGuard);
  const directOnly = requiredIndex(save, "if (direct) {", "direct answer announcement guard", publish);
  const announcement = requiredIndex(save, "setDirectAnswerAnnouncement({ token: Date.now(), message: \"Saved to this application.\" })", "accepted answer announcement", directOnly);
  assertOrdered(
    [refusal, refusalReturn, ownershipGuard, selectedGuard, publish, directOnly, announcement],
    "only an accepted, owned, selected direct save may announce success",
  );
  assert.doesNotMatch(save.slice(refusal, refusalReturn), /setDirectAnswerAnnouncement/);

  const visibleReceipt = requiredIndex(prompt, "{savedRecently && (", "visible saved receipt");
  const questionHeading = requiredIndex(prompt, "<h2 id={headingId}", "question heading", visibleReceipt);
  assert.doesNotMatch(
    prompt.slice(visibleReceipt, questionHeading),
    /role="status"|aria-live=/,
    "the visible receipt must not duplicate the page live announcement",
  );
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
  assert.match(saveCurrent, /!anotherQuestionRemains && nextTaskPlan\.nonQuestionTasks\.length === 0 && nextTaskPlan\.metadataBlockers\.length === 0/);
  assert.match(saveCurrent, /onQuestionsFinished\(\)/);
  assert.doesNotMatch(saveCurrent, /prepareApplication|submit-request|approveFinalSubmission/);
});

test("unsafe multi-value fields reuse the managed handoff routes", () => {
  const screen = sourceSection("function SubmissionScreen(", "function SubmissionReceipt(");
  const branch = sourceSection(
    'currentMetadataBlocker?.kind === "unsupported_multi_value"',
    ') : (\n                    <>',
  );

  assert.match(branch, /canFinishInDashboard \? \(/);
  assert.match(branch, /<ButtonLink href="#live-company-page" block className="sm:w-auto">/);
  assert.match(branch, /attendedHandoffUrl \? \(/);
  assert.match(branch, /openAttendedHandoff\(\)/);
  assert.match(branch, /!staysInsideLitos && \(handoffUrl \?\? portalUrl\)/);
  assert.match(branch, /Answer on company page/);
  assert.match(branch, /onClick=\{onReviewPacket\}/);
  assert.doesNotMatch(branch, /ButtonLink href=\{\(handoffUrl \?\? portalUrl\)!\}[\s\S]*?attendedHandoffUrl \? \(/);
  assert.match(screen, /currentNonQuestionTask \? \([\s\S]*?directTaskPlan\.metadataBlockers\.length > 0/);
  assert.equal(
    [...screen.matchAll(/<ButtonLink href="#live-company-page"/g)].length,
    2,
    "both in-dashboard live-form routes must use the shared button link",
  );
});

test("direct answer progress survives application switches without double-counting tasks", () => {
  const save = functionBody("  async function saveReviewedAnswers(");
  const screen = sourceSection("function SubmissionScreen(", "function SubmissionReceipt(");

  assert.match(page, /type DirectAnswerProgress = \{[\s\S]*?key: string;[\s\S]*?lastSavedQuestionId: string \| null;[\s\S]*?savedCount: number;[\s\S]*?total: number;/);
  assert.match(page, /const \[directAnswerProgresses, setDirectAnswerProgresses\] = useState<ReadonlyMap<string, DirectAnswerProgress>>/);
  assert.match(page, /const selectedDirectAnswerProgress = selected \? directAnswerProgresses\.get\(selected\.id\) \?\? null : null;/);
  assert.match(page, /directAnswerProgress=\{selectedDirectAnswerProgress\}/);
  assert.doesNotMatch(screen, /storedDirectProgress|setStoredDirectProgress/);

  const activePass = requiredIndex(save, "const activeDirectPassKey = direct ? directAnswerPassKey(activeSubmission.review) : null", "active answer pass");
  const completed = requiredIndex(save, "const completedDirectPromptFingerprints = new Set(", "completed prompt snapshot", activePass);
  const accepted = requiredIndex(save, "completedDirectPromptFingerprints.add(safeDirectPromptFingerprint)", "accepted prompt", completed);
  const remaining = requiredIndex(save, "const remainingDirectQuestionCount = savedDirectTaskPlan.questionTasks.filter", "filtered remaining prompts", accepted);
  const remainingFilter = requiredIndex(save, "!completedDirectPromptFingerprints.has(directQuestionPromptFingerprint(task))", "completed prompt exclusion", remaining);
  const progressPublish = requiredIndex(save, "setDirectAnswerProgresses((current)", "parent progress publication", remainingFilter);
  const progressApplication = requiredIndex(save, "next.set(applicationId, {", "application-keyed progress", progressPublish);
  const progressKey = requiredIndex(save, "key: savedPassKey", "review-keyed progress", progressApplication);
  const progressReceipt = requiredIndex(save, "lastSavedQuestionId: direct.questionId", "saved question receipt", progressKey);
  const progressCount = requiredIndex(save, "savedCount: completedDirectPromptFingerprints.size", "deduplicated saved count", progressReceipt);
  const totalMax = requiredIndex(save, "total: Math.max(", "stable progress total", progressCount);
  const priorTotal = requiredIndex(save, "activeDirectQuestionTotal", "prior progress total", totalMax);
  const filteredTotal = requiredIndex(save, "completedDirectPromptFingerprints.size + remainingDirectQuestionCount", "filtered progress total", priorTotal);
  const selectionGuard = requiredIndex(save, "selectedIdRef.current !== applicationId", "selection publication guard", filteredTotal);
  assertOrdered(
    [
      activePass,
      completed,
      accepted,
      remaining,
      remainingFilter,
      progressPublish,
      progressApplication,
      progressKey,
      progressReceipt,
      progressCount,
      totalMax,
      priorTotal,
      filteredTotal,
      selectionGuard,
    ],
    "accepted progress must publish by application before a switch can suppress visible state",
  );

  const key = requiredIndex(screen, "const directProgressKey = directAnswerPassKey(review)", "direct progress pass key");
  const scoped = requiredIndex(screen, "directAnswerProgress?.key === directProgressKey", "pass-scoped progress read", key);
  const resetReceipt = requiredIndex(screen, "lastSavedQuestionId: null", "fresh-pass receipt reset", scoped);
  const resetCount = requiredIndex(screen, "savedCount: 0", "fresh-pass count reset", resetReceipt);
  const resetTotal = requiredIndex(screen, "total: directTaskPlan.questionTasks.length", "fresh-pass total", resetCount);
  const remainingQuestions = requiredIndex(screen, "const remainingDirectQuestions = directTaskPlan.questionTasks.filter", "remaining direct questions", resetTotal);
  const remainingExclusion = requiredIndex(screen, "!answeredQuestionFingerprints.has(directQuestionPromptFingerprint(task))", "answered prompt exclusion", remainingQuestions);
  const totalStart = requiredIndex(screen, "const directQuestionTotal = Math.max(", "display total", remainingExclusion);
  const preservedTotal = requiredIndex(screen, "directProgress.total", "preserved display total", totalStart);
  const stableTotal = requiredIndex(screen, "directProgress.savedCount + remainingDirectQuestions.length", "filtered display total", preservedTotal);
  const positionStart = requiredIndex(screen, "const directQuestionPosition = Math.min(", "display position", stableTotal);
  const boundedPosition = requiredIndex(screen, "Math.max(1, directQuestionTotal)", "bounded display position", positionStart);
  const nextPosition = requiredIndex(screen, "directProgress.savedCount + 1", "next display position", boundedPosition);
  const positionProp = requiredIndex(screen, "position={directQuestionPosition}", "prompt position prop", nextPosition);
  const totalProp = requiredIndex(screen, "total={Math.max(1, directQuestionTotal)}", "prompt total prop", positionProp);
  assertOrdered(
    [
      key,
      scoped,
      resetReceipt,
      resetCount,
      resetTotal,
      remainingQuestions,
      remainingExclusion,
      totalStart,
      preservedTotal,
      stableTotal,
      positionStart,
      boundedPosition,
      nextPosition,
      positionProp,
      totalProp,
    ],
    "a new review pass resets progress while the same pass preserves its saved count and total",
  );
});

test("a direct answer owns the screen and invalidates an older poll snapshot", () => {
  const poll = functionBody("  const refreshSubmission = useCallback(async () => {");
  const save = functionBody("  async function saveReviewedAnswers(");
  const screen = sourceSection("function SubmissionScreen(", "function SubmissionReceipt(");

  assert.match(page, /const submissionMutationGenerationRef = useRef\(0\)/);
  assert.match(poll, /const requestedSelectionRevision = editorRevisionRef\.current/);
  assert.match(poll, /const requestedMutationGeneration = submissionMutationGenerationRef\.current/);
  const firstRevisionGuard = poll.indexOf("editorRevisionRef.current !== requestedSelectionRevision");
  const secondRevisionGuard = poll.indexOf("editorRevisionRef.current !== requestedSelectionRevision", firstRevisionGuard + 1);
  assert.ok(firstRevisionGuard >= 0, "the first poll publication boundary must guard the selection revision");
  assert.ok(secondRevisionGuard > firstRevisionGuard, "the post-revalidation poll boundary must guard the selection revision again");
  assert.match(poll, /submissionMutationGenerationRef\.current !== requestedMutationGeneration/);
  assert.match(save, /if \(!result\.saved\)[\s\S]*?const refusalStillOwnsApplication[\s\S]*?if \(result\.review && refusalStillOwnsApplication\) \{[\s\S]*?submissionMutationGenerationRef\.current \+= 1;[\s\S]*?publishSubmissionEnvelope\(submissionRef, reconciled, "direct"\)/);
  assert.match(save, /submissionMutationGenerationRef\.current \+= 1;[\s\S]*?const acceptedCandidate: SubmissionResponse/);
  assert.match(screen, /const directAnswerActive = needsAttention && !awaitingUnverifiedSubmission && currentDirectQuestion !== null/);
  assert.match(screen, /\{!directAnswerActive && <>[\s\S]*?<Button onClick=\{onReviewPacket\}>Open packet review<\/Button>[\s\S]*?<Button onClick=\{onRetry\} variant="secondary">Try again<\/Button>/);
  assert.match(screen, /!awaitingUnverifiedSubmission && !directAnswerActive && filledFormEvidence/);
});
