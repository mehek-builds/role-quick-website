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

test("Applications asks one trusted employer question at a time with explicit save and navigation", () => {
  const prompt = sourceSection("function DirectApplicationQuestion(", "function SubmissionScreen(");

  assert.match(prompt, /const \[promptFingerprint\] = useState\(\(\) => directQuestionPromptFingerprint\(task\)\)/);
  assert.match(prompt, /const \[taskFingerprint\] = useState\(\(\) => directQuestionTaskFingerprint\(task\)\)/);
  assert.match(prompt, /preservedDraft\?\.promptFingerprint === promptFingerprint/);
  assert.match(prompt, /onDraftChange\(task\.question\.id, promptFingerprint, taskFingerprint, next\)/);
  assert.match(prompt, /task\.question\.options && task\.question\.options\.length > 0/);
  assert.match(prompt, /<fieldset aria-labelledby=\{headingId\}/);
  assert.match(prompt, /<select/);
  assert.match(prompt, /<textarea/);
  assert.match(prompt, /hasPrevious: boolean;/);
  assert.match(prompt, /hasNext: boolean;/);
  assert.match(prompt, /onPrevious: \(\) => void;/);
  assert.match(prompt, /onNext: \(\) => void;/);
  assert.match(prompt, /Save and next/);
  assert.match(prompt, /Confirm and next/);
  assert.match(prompt, /Save answer/);
  assert.match(prompt, /Confirm answer/);
  assert.match(prompt, /Saved to this application\./);
  assert.match(prompt, /const \[choiceTouched, setChoiceTouched\] = useState\(false\);/);
  assert.match(prompt, /const requiredBlank = task\.question\.required && !answer\.trim\(\);/);
  assert.match(prompt, /const acceptsMultipleOptions = questionAcceptsMultipleOptions\(task\.question\);/);
  assert.match(prompt, /const selectedExactOptions = acceptsMultipleOptions[\s\S]*?exactSelectedQuestionOptions\(answer, exactOptions\)/);
  /* Single-choice membership resolves through exactQuestionOption, the fill path's own trimmed
     case-insensitive equivalence: a stored, server-accepted answer whose bytes differ from the
     offered label by edge whitespace or case is a choice, not a missing answer (the Mytos degree
     classification, 2026-08-28). An answer naming no option is still missing. */
  assert.match(prompt, /const selectedExactOption = !acceptsMultipleOptions && exactOptions\.length > 0[\s\S]*?exactQuestionOption\(answer, exactOptions\)[\s\S]*?: null;/);
  assert.match(prompt, /const choiceMissing = exactOptions\.length > 0 && \(acceptsMultipleOptions[\s\S]*?selectedExactOptions === null[\s\S]*?: selectedExactOption === null\);/);
  assert.match(prompt, /const choiceErrorVisible = choiceMissing && \(choiceTouched \|\| Boolean\(answer\.trim\(\)\)\);/);
  assert.match(prompt, /const answerBlocked = requiredBlank \|\| choiceMissing/);
  assert.doesNotMatch(prompt, /const answerBlocked[^;]*choiceErrorVisible/);
  assert.match(prompt, /const errorId = `\$\{headingId\}-error`/);
  assert.match(prompt, /const answerDescribedBy = `\$\{progressId\} \$\{helperId\}\$\{visibleError \? ` \$\{errorId\}` : ""\}`/);
  assert.equal(
    [...prompt.matchAll(/aria-labelledby=\{headingId\}\s+aria-describedby=\{answerDescribedBy\}\s+aria-invalid=\{visibleError \? true : undefined\}/g)].length,
    4,
    "checkbox groups, radio groups, selects, and textareas must all expose their helper and error relationship",
  );
  assert.match(prompt, /<p id=\{errorId\} role="alert"/);
  assert.match(prompt, /choiceErrorVisible[\s\S]*?acceptsMultipleOptions[\s\S]*?"Choose only the employer's current options before saving\."[\s\S]*?: "Choose one of the employer's current options before saving\."/);
  assert.match(prompt, /<form onSubmit=\{submitAnswer\} aria-busy=\{busy\}/);
  assert.match(prompt, /if \(busy \|\| answerBlocked\) return;/);
  assert.match(prompt, /function updateAnswer\(next: string\) \{[\s\S]*?if \(busy\) return;/);
  assert.match(prompt, /checked=\{selectedExactOption === option\}\s+disabled=\{busy\}\s+aria-disabled=\{busy\}/);
  assert.match(prompt, /type="checkbox"[\s\S]*?checked=\{selectedExactOptions\?\.includes\(option\) === true\}[\s\S]*?answerWithExactOptionToggled\(answer, exactOptions, option, event\.target\.checked\)/);
  /* The select stays controlled, disabled by `busy`, and blurs to setChoiceTouched - all of which
     this line has always been about. What is pinned is the resolved binding, not `value={answer}`
     BARE: an answer that is on no employer option list must render as the placeholder, because
     a <select> with an unmatched value silently selects its first option and reports that as
     its value (measured on Five Rings, 2026-08-27: stored "Job board" displayed and submitted
     as "Coffee Chat"), while a stored answer that NAMES an option under the fill path's own
     trim-plus-case equivalence must render as that option (measured on Mytos, 2026-08-28:
     stored "GPA 3.5-3.8" opened on the placeholder and re-picking it voided the audit). See
     tests/off-list-answer-reads-as-unanswered.test.mjs, which owns both rules; the wiring this
     test is about is unchanged. */
  assert.match(prompt, /<select[\s\S]{0,2400}?value=\{selectedExactOption \?\? ""\}\s+disabled=\{busy\}\s+aria-disabled=\{busy\}[\s\S]*?onBlur=\{\(\) => setChoiceTouched\(true\)\}/);
  assert.match(prompt, /<option value="" disabled>Choose an answer<\/option>/);
  assert.match(prompt, /<textarea\s+value=\{answer\}\s+readOnly=\{busy\}\s+aria-disabled=\{busy\}/);
  assert.match(prompt, /<Button type="submit" block className="sm:w-auto" disabled=\{busy \|\| answerBlocked\}>/);
  assert.equal(
    [...prompt.matchAll(/type="button"/g)].length,
    3,
    "Previous, Next, and optional Skip must be non-submit controls",
  );
  assert.match(prompt, /\? "Saving\.\.\." : "Skip"/);
  assert.match(prompt, /aria-label="Previous question"[\s\S]*?disabled=\{busy\}[\s\S]*?onClick=\{\(\) => navigate\(onPrevious\)\}/);
  assert.match(prompt, /\{saved && !answerDirty \? \([\s\S]*?type="button"[\s\S]*?aria-label=\{hasNext \? "Next question" : "Review application"\}[\s\S]*?disabled=\{busy\}[\s\S]*?onClick=\{\(\) => hasNext \? navigate\(onNext\) : onReviewApplication\(\)\}/);
  assert.match(prompt, /\{hasNext \? "Next question" : "Review application"\}/);
  assert.match(prompt, /const headingRef = useRef<HTMLHeadingElement>\(null\)/);
  assert.match(prompt, /if \(focusToken <= 0\) return;[\s\S]*?heading\?\.focus\(\{ preventScroll: true \}\)[\s\S]*?heading\?\.scrollIntoView\(\{ block: "nearest", behavior: "auto" \}\)/);
  assert.match(prompt, /<h2 ref=\{headingRef\} id=\{headingId\} tabIndex=\{-1\}/);
  assert.doesNotMatch(prompt, /bg-warn|border-warn|text-warn/);
});

test("drafts and refusals follow immutable prompt identity across a raced review", () => {
  const identityTypes = sourceSection("type DirectAnswerFailure = {", "function directAnswerPassKey(");
  const prompt = sourceSection("function DirectApplicationQuestion(", "function SubmissionScreen(");
  const save = functionBody("  async function saveReviewedAnswers(");

  assert.match(identityTypes, /type DirectAnswerFailure = \{[\s\S]*?promptFingerprint: string;/);
  assert.match(identityTypes, /type DirectAnswerDraft = \{[\s\S]*?questionId: string;[\s\S]*?promptFingerprint: string;[\s\S]*?answer: string;/);
  assert.match(save, /promptFingerprint: string;[\s\S]*?taskFingerprint: string;/);
  assert.match(save, /promptFingerprint: direct\.promptFingerprint/);
  assert.match(save, /safeDirectPromptFingerprint !== direct\.promptFingerprint/);
  assert.match(prompt, /preservedDraft\?\.promptFingerprint === promptFingerprint[\s\S]*?preservedDraft\.answer/);
  assert.match(prompt, /externalFailure\?\.promptFingerprint === promptFingerprint \? externalFailure\.message : null/);
  assert.match(prompt, /onClearFailure\(promptFingerprint\)/);
  assert.match(prompt, /onSave\(task\.question\.id, answer, task\.intent, promptFingerprint, taskFingerprint, task\)/);
  assert.match(page, /const \[directAnswerDrafts, setDirectAnswerDrafts\] = useState<ReadonlyMap<string, ReadonlyMap<string, DirectAnswerDraft>>>/);
  assert.match(page, /onDirectAnswerDraftChange=\{\(questionId, promptFingerprint, taskFingerprint, answer\) => \{[\s\S]*?const applicationDrafts = new Map\(current\.get\(selected\.id\) \?\? EMPTY_DIRECT_ANSWER_DRAFTS\);[\s\S]*?applicationDrafts\.set\(promptFingerprint, \{ questionId, promptFingerprint, taskFingerprint, answer \}\);[\s\S]*?next\.set\(selected\.id, applicationDrafts\)/);
  assert.match(page, /onClearDirectAnswerDraft=\{\(promptFingerprint\) => \{[\s\S]*?const applicationDrafts = current\.get\(selected\.id\);[\s\S]*?nextApplicationDrafts\.delete\(promptFingerprint\);[\s\S]*?if \(nextApplicationDrafts\.size > 0\) next\.set\(selected\.id, nextApplicationDrafts\)/);
  assert.match(prompt, /function navigate\(navigateToQuestion: \(\) => void\) \{[\s\S]*?if \(busy\) return;[\s\S]*?if \(answerDirty\) onDraftChange\(task\.question\.id, promptFingerprint, taskFingerprint, answer\);[\s\S]*?else onClearDraft\(promptFingerprint\);[\s\S]*?navigateToQuestion\(\);/);
  assert.match(save, /for \(const \[promptFingerprint, draft\] of nextApplicationDrafts\) \{[\s\S]*?promptFingerprint === safeDirectPromptFingerprint \|\| draft\.questionId === direct\.questionId[\s\S]*?nextApplicationDrafts\.delete\(promptFingerprint\)/);
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
  const currentDraft = requiredIndex(
    screen,
    "directAnswerDrafts.get(currentDirectPromptFingerprint) ?? null",
    "current prompt draft lookup",
    currentPrompt,
  );
  const recoveryDraft = requiredIndex(
    screen,
    "const directRecoveryDraft = [...directAnswerDrafts.values()].find",
    "orphaned draft lookup",
    currentDraft,
  );
  const recoveryScope = requiredIndex(
    screen,
    "!directQuestionFingerprints.has(draft.promptFingerprint)",
    "current review prompt exclusion",
    recoveryDraft,
  );
  const recoveryNeeded = requiredIndex(screen, "const directRecoveryNeeded", "changed-prompt recovery state", recoveryScope);
  const recoveryRender = requiredIndex(screen, "{directRecoveryNeeded && (", "changed-prompt recovery render", recoveryNeeded);
  const recoveryAlert = requiredIndex(screen, '<div role="alert"', "changed-prompt recovery alert", recoveryRender);
  const heldAnswer = requiredIndex(screen, "{directRecoveryDraft?.answer", "held draft answer", recoveryAlert);
  const promptBranch = requiredIndex(screen, "{directAnswerActive ? (", "current direct prompt", heldAnswer);

  assertOrdered(
    [currentPrompt, currentDraft, recoveryDraft, recoveryScope, recoveryNeeded, recoveryRender, recoveryAlert, heldAnswer, promptBranch],
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
  assert.match(
    passKey,
    /function directAnswerPassesAreCompatible\([\s\S]*?current\.questions_reviewed_at\?\.trim\(\)[\s\S]*?accepted\.questions_reviewed_at\?\.trim\(\)[\s\S]*?return currentQuestionPass !== null && currentQuestionPass === acceptedQuestionPass;/,
  );
  assert.match(
    passKey,
    /current\.submission_run_id\?\.trim\(\)[\s\S]*?accepted\.submission_run_id\?\.trim\(\)[\s\S]*?return currentRunPass !== null && currentRunPass === acceptedRunPass;/,
  );
  assert.match(passKey, /Older review payloads have no explicit question-pass identity[\s\S]*?return true;/);
});

test("question navigation is the domain module's export, not a page-local reimplementation", () => {
  /* directAnswerNavigationTasks used to be defined here and was verified by pinning its body
     against this same source text - a check that could only ever prove the text existed, never
     that the union it builds behaves correctly. It now lives in
     features/applications/domain/submission-checklist.ts, imported like directInputTaskPlan beside
     it, and features/applications/domain/submission-checklist.test.mts exercises its behaviour
     directly: the plan and the navigator the page actually calls, not a copy of either. This test
     keeps only what a source read can honestly promise - that the page imports the real function
     and has not grown a second, page-local one that could quietly drift from it. */
  assert.match(
    page,
    /import \{[^}]*\bdirectAnswerNavigationTasks\b[^}]*\} from "@\/features\/applications";/,
    "page.tsx must import directAnswerNavigationTasks rather than redefine it",
  );
  assert.doesNotMatch(
    page,
    /\nfunction directAnswerNavigationTasks\(/,
    "a page-local redefinition would silently stop using the tested domain function",
  );
});

test("direct answer saves revalidate the latest server question and exact choices", () => {
  const save = functionBody("  async function saveReviewedAnswers(");

  assert.match(save, /const activeSubmission = submissionSnapshotsRef\.current\.get\(applicationId\)[\s\S]*?\?\? \(submissionRef\.current\?\.application_id === applicationId \? submissionRef\.current : submission\)/);
  assert.match(save, /directInputTaskPlan\(activeSubmission\.review/);
  assert.match(save, /safeDirectTask\.intent !== direct\.intent/);
  assert.match(save, /directQuestionTaskFingerprint\(safeDirectTask\) !== direct\.taskFingerprint/);
  assert.match(save, /exactQuestionOption\(direct\.answer, safeDirectTask\.question\.options\) === null/);
  assert.match(save, /activeSubmission\.review\.questions\.map/);
  assert.doesNotMatch(save, /mergeDiscoveredQuestions\(questions, activeSubmission\.review\.questions\)/);
});

test("a refused answer keeps evidence and only an accepted answer publishes", () => {
  const save = functionBody("  async function saveReviewedAnswers(");
  const savedGuard = requiredIndex(save, "if (!result.saved)", "refused answer guard");
  const publish = requiredIndex(save, 'publishSubmissionEnvelope(submissionRef, saved, "direct")', "accepted answer publication", savedGuard);
  /* The evidence write is a RECONCILIATION, not a wipe: standing exact-packet evidence survives
     only while the stored answers still byte-match the audited snapshot, which is what lets a
     byte-identical save keep the acknowledged audit the metadata-refresh launch decision needs
     (the Mytos loop, application 55de7c9e) while any real edit still voids it. */
  const evidenceReconcile = requiredIndex(save, "const nextEvidence = reconcilePacketEvidenceWithSubmission(", "accepted answer evidence reconciliation", publish);
  const evidenceWrite = requiredIndex(save, "packetEvidenceRef.current = nextEvidence", "accepted answer evidence write", evidenceReconcile);

  assertOrdered(
    [savedGuard, publish, evidenceReconcile, evidenceWrite],
    "authoritative state and packet evidence may only publish after the server accepts the answer",
  );
  assert.doesNotMatch(save, /packetEvidenceRef\.current = null/, "no save outcome may blanket-void the audit any more");
  /* The refused branch that carries a review is a run having written under the request, so its
     evidence write must also be the reconciliation, measured against the review that run stored. */
  const refusalReconcile = requiredIndex(save, "const evidenceAfterRefusal = reconcilePacketEvidenceWithSubmission(", "refused answer evidence reconciliation", savedGuard);
  assert.ok(refusalReconcile < publish, "the refusal branch reconciles before the accepted path publishes");
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

  const normalizedPoll = requiredIndex(poll, "let result = submissionResponseForDisplay(raw, { packetId: requestedId })", "authority-normalized full poll response");
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
  const latestPlanDeclaration = requiredIndex(save, "const latestDirectTaskPlan = direct", "latest direct task plan declaration", older);
  const latestPlan = requiredIndex(save, "directInputTaskPlan(latestSubmission.review", "latest direct task plan", latestPlanDeclaration);
  const latestTask = requiredIndex(save, "const latestDirectTask = direct", "latest direct task", latestPlan);
  const latestNavigation = requiredIndex(save, "directAnswerNavigationTasks(", "latest direct navigation re-resolution", latestTask);
  const latestQuestion = requiredIndex(save, ".find((task) => task.question.id === direct.questionId) ?? null", "latest direct question", latestNavigation);
  const exactTask = requiredIndex(save, "const latestStillHasSubmittedTask = direct && latestDirectTask", "exact submitted task guard", latestQuestion);
  const exactPrompt = requiredIndex(save, "directQuestionPromptFingerprint(latestDirectTask) === direct.promptFingerprint", "immutable prompt ownership", exactTask);
  const exactFingerprint = requiredIndex(save, "directQuestionTaskFingerprint(latestDirectTask) === direct.taskFingerprint", "immutable task ownership", exactPrompt);
  const compatiblePass = requiredIndex(save, "const latestSnapshotMatchesAcceptedPass = !direct || directAnswerPassesAreCompatible(", "accepted pass compatibility", exactFingerprint);
  const currentPass = requiredIndex(save, "latestSubmission.review", "latest accepted pass", compatiblePass);
  const responsePass = requiredIndex(save, "acceptedCandidate.review", "response accepted pass", currentPass);
  const pollAnswerDeclaration = requiredIndex(save, "const latestSubmittedAnswerQuestion = direct", "poll-first accepted answer declaration", responsePass);
  const pollApplication = requiredIndex(save, "latestSubmission.application_id === applicationId", "poll-first application ownership", pollAnswerDeclaration);
  const pollPresentation = requiredIndex(save, "questionReviewPresentation(", "safe poll-first question presentation", pollApplication);
  const pollQuestion = requiredIndex(save, "question.id === direct.questionId", "poll-first question ownership", pollPresentation);
  const pollPrompt = requiredIndex(save, "directQuestionPromptFingerprint({ question }) === direct.promptFingerprint", "poll-first prompt ownership", pollQuestion);
  const pollAnswer = requiredIndex(save, "question.answer === direct.answer", "poll-first answer ownership", pollPrompt);
  const pollConfirmation = requiredIndex(save, "const latestSnapshotHasSubmittedAnswer = latestSnapshotMatchesAcceptedPass", "poll-first answer confirmation", pollAnswer);
  const pollExactAnswer = requiredIndex(save, "&& latestSubmittedAnswerQuestion !== null", "poll-first exact answer confirmation", pollConfirmation);
  const acceptedOwnership = requiredIndex(save, "const acceptedResponseOwnsSnapshot", "accepted response ownership", pollConfirmation);
  const changedOwnership = requiredIndex(save, "!acceptedPublicationChanged", "unchanged publication ownership", acceptedOwnership);
  const acceptedPassOwnership = requiredIndex(save, "latestSnapshotMatchesAcceptedPass && !acceptedResponseIsOlder", "accepted pass ownership", changedOwnership);
  const recencyOwnership = requiredIndex(save, "!acceptedResponseIsOlder", "strict recency ownership", acceptedPassOwnership);
  const timestampOwnership = requiredIndex(save, "latestSubmission.review.updated_at !== acceptedCandidate.review.updated_at", "different timestamp ownership", recencyOwnership);
  const equalTimestampTaskOwnership = requiredIndex(save, "|| latestStillHasSubmittedTask", "equal timestamp task ownership", timestampOwnership);
  const progressOwnership = requiredIndex(save, "const acceptedAnswerOwnsProgress = acceptedResponseOwnsSnapshot || latestSnapshotHasSubmittedAnswer", "accepted progress ownership", equalTimestampTaskOwnership);
  const savedChoice = requiredIndex(save, "const saved = acceptedResponseOwnsSnapshot", "owned snapshot selection", progressOwnership);
  const changedChoice = requiredIndex(save, "? acceptedPublicationChanged", "changed publication reconciliation choice", savedChoice);
  const reconcile = requiredIndex(save, "? nextSubmissionState(latestSubmission, acceptedCandidate)", "accepted response reconciliation", changedChoice);
  const latestChoice = requiredIndex(save, ": latestSubmission", "latest snapshot fallback", reconcile);
  const packetGuard = requiredIndex(save, "if (acceptedResponseOwnsSnapshot)", "accepted packet guard", latestChoice);
  const changedAccepted = requiredIndex(save, "if (saved !== latestSubmission)", "changed accepted snapshot guard", packetGuard);
  const advancedAccepted = requiredIndex(save, "advanceSubmissionPublicationGeneration(submissionPublicationGenerationsRef.current, applicationId)", "accepted publication generation", changedAccepted);
  const storedAccepted = requiredIndex(save, "submissionSnapshotsRef.current.set(applicationId, saved)", "accepted snapshot storage", advancedAccepted);
  const packetPublish = requiredIndex(save, "setPackets((current)", "accepted packet publication", storedAccepted);
  const progressGuard = requiredIndex(save, "acceptedAnswerOwnsProgress", "accepted progress publication guard", packetPublish);
  const visibleGuard = requiredIndex(save, "!acceptedAnswerOwnsProgress", "accepted visible ownership", progressGuard);
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
      latestPlanDeclaration,
      latestPlan,
      latestTask,
      latestNavigation,
      latestQuestion,
      exactTask,
      exactPrompt,
      exactFingerprint,
      compatiblePass,
      currentPass,
      responsePass,
      pollAnswerDeclaration,
      pollApplication,
      pollPresentation,
      pollQuestion,
      pollPrompt,
      pollAnswer,
      pollConfirmation,
      pollExactAnswer,
      acceptedOwnership,
      changedOwnership,
      acceptedPassOwnership,
      recencyOwnership,
      timestampOwnership,
      equalTimestampTaskOwnership,
      progressOwnership,
      savedChoice,
      changedChoice,
      reconcile,
      latestChoice,
      packetGuard,
      changedAccepted,
      advancedAccepted,
      storedAccepted,
      packetPublish,
      progressGuard,
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
    /const acceptedResponseOwnsSnapshot = !direct\s+\|\| !acceptedPublicationChanged\s+\|\| \(latestSnapshotMatchesAcceptedPass && !acceptedResponseIsOlder && \(\s+latestSubmission\.review\.updated_at !== acceptedCandidate\.review\.updated_at\s+\|\| latestStillHasSubmittedTask\s+\)\);/,
  );
  assert.match(
    save,
    /const latestSnapshotMatchesAcceptedPass = !direct \|\| directAnswerPassesAreCompatible\(\s+latestSubmission\.review,\s+acceptedCandidate\.review,\s+\);[\s\S]*?const latestSubmittedAnswerQuestion = direct\s+&& latestSubmission\.application_id === applicationId\s+\? questionReviewPresentation\([\s\S]*?question\.id === direct\.questionId\s+&& directQuestionPromptFingerprint\(\{ question \}\) === direct\.promptFingerprint\s+&& question\.answer === direct\.answer[\s\S]*?const latestSnapshotHasSubmittedAnswer = latestSnapshotMatchesAcceptedPass\s+&& latestSubmittedAnswerQuestion !== null;/,
  );
  assert.match(save, /const acceptedAnswerOwnsProgress = acceptedResponseOwnsSnapshot \|\| latestSnapshotHasSubmittedAnswer;/);
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
  const ownershipGuard = requiredIndex(save, "!acceptedAnswerOwnsProgress", "accepted answer ownership guard", refusalReturn);
  const selectedGuard = requiredIndex(save, "selectedIdRef.current !== applicationId", "accepted answer selection guard", ownershipGuard);
  const publish = requiredIndex(save, "const publishSavedAnswer = () => {", "accepted answer publisher", selectedGuard);
  const directOnly = requiredIndex(save, "if (direct) {", "direct answer announcement guard", publish);
  const announcement = requiredIndex(save, "setDirectAnswerAnnouncement({ token: Date.now(), message: \"Saved to this application.\" })", "accepted answer announcement", directOnly);
  assertOrdered(
    [refusal, refusalReturn, ownershipGuard, selectedGuard, publish, directOnly, announcement],
    "only an accepted, owned, selected direct save may announce success",
  );
  assert.doesNotMatch(save.slice(refusal, refusalReturn), /setDirectAnswerAnnouncement/);

  const visibleReceipt = requiredIndex(prompt, "{saved && !answerDirty && (", "visible saved receipt");
  const questionHeading = requiredIndex(prompt, "<h2 ref={headingRef} id={headingId}", "question heading", visibleReceipt);
  assert.doesNotMatch(
    prompt.slice(visibleReceipt, questionHeading),
    /role="status"|aria-live=/,
    "the visible receipt must not duplicate the page live announcement",
  );
});

test("an accepted answer from an older direct pass asks visibly for a truthful retry", () => {
  const prompt = sourceSection("function DirectApplicationQuestion(", "function SubmissionScreen(");
  const save = functionBody("  async function saveReviewedAnswers(");

  assert.match(page, /type DirectAnswerSaveResult = \{[\s\S]*?saved: true;[\s\S]*?mayAdvance: boolean;[\s\S]*?retryMessage\?: string;/);
  assert.match(
    page,
    /function directAnswerPassRetryMessage\(intent: DirectQuestionTaskIntent\): string \{[\s\S]*?intent === "confirm"[\s\S]*?Confirm it again for the latest check\.[\s\S]*?Save it again for the latest check\./,
  );
  assert.match(
    save,
    /direct && !latestSnapshotMatchesAcceptedPass[\s\S]*?retryMessage: directAnswerPassRetryMessage\(direct\.intent\)/,
  );
  assert.match(
    prompt,
    /if \(!result\.saved\) \{\s+setSaveError\(result\.message\);\s+\} else if \(!result\.mayAdvance && result\.retryMessage\) \{\s+setSaveError\(result\.retryMessage\);\s+\}/,
  );
  assert.match(prompt, /\{visibleError && \(\s+<p id=\{errorId\} role="alert"[\s\S]*?\{visibleError\}/);
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

test("a landed answer keeps the final question reviewable without starting a submission", () => {
  const submissionScreen = sourceSection("function SubmissionScreen(", "function SubmissionReceipt(");
  const prompt = sourceSection("function DirectApplicationQuestion(", "function SubmissionScreen(");
  const saveCurrentStart = submissionScreen.indexOf("  async function saveCurrentDirectQuestion(");
  const saveCurrentEnd = submissionScreen.indexOf("\n  const completedItems", saveCurrentStart);
  assert.ok(saveCurrentStart >= 0, "the direct prompt save handler must exist");
  assert.ok(saveCurrentEnd > saveCurrentStart, "the direct prompt save handler must have a stable boundary");
  const saveCurrent = submissionScreen.slice(saveCurrentStart, saveCurrentEnd);

  assert.match(submissionScreen, /remainingDirectQuestions = directTaskPlan\.questionTasks\.filter/);
  assert.match(submissionScreen, /answeredQuestionFingerprints\.has\(directQuestionPromptFingerprint\(task\)\)/);
  assert.match(submissionScreen, /const defaultDirectPromptFingerprint = remainingDirectQuestions\[0\][\s\S]*?: directQuestionTasks\.at\(-1\)[\s\S]*?directQuestionPromptFingerprint\(directQuestionTasks\.at\(-1\)!\)/);
  assert.match(submissionScreen, /const currentDirectQuestion = directQuestionTasks\[currentDirectQuestionIndex\] \?\? null/);
  assert.doesNotMatch(submissionScreen, /directFollowUpTaskExists|questionsComplete/);
  assert.match(submissionScreen, /key=\{directQuestionTaskFingerprint\(currentDirectQuestion\)\}/);
  assert.match(submissionScreen, /hasPrevious=\{currentDirectQuestionIndex > 0\}/);
  assert.match(submissionScreen, /hasNext=\{currentDirectQuestionIndex >= 0 && currentDirectQuestionIndex < directQuestionTasks\.length - 1\}/);
  assert.match(submissionScreen, /onReviewApplication=\{onQuestionsFinished\}/);
  assert.match(saveCurrent, /if \(!result\.mayAdvance\) return result/);
  assert.doesNotMatch(saveCurrent, /onQuestionsFinished|nextTaskPlan|anotherQuestionRemains/);
  assert.match(prompt, /\{saved && !answerDirty \? \([\s\S]*?aria-label=\{hasNext \? "Next question" : "Review application"\}[\s\S]*?onClick=\{\(\) => hasNext \? navigate\(onNext\) : onReviewApplication\(\)\}/);
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

  assert.match(page, /type DirectAnswerProgress = \{[\s\S]*?key: string;[\s\S]*?answeredTasks: readonly DirectQuestionTask\[\];[\s\S]*?cursorPromptFingerprint: string \| null;[\s\S]*?lastSavedPromptFingerprint: string \| null;[\s\S]*?navigationToken: number;[\s\S]*?total: number;/);
  assert.match(page, /const \[directAnswerProgresses, setDirectAnswerProgresses\] = useState<ReadonlyMap<string, DirectAnswerProgress>>/);
  assert.match(page, /const selectedDirectAnswerProgress = selected \? directAnswerProgresses\.get\(selected\.id\) \?\? null : null;/);
  assert.match(page, /directAnswerProgress=\{selectedDirectAnswerProgress\}/);
  assert.doesNotMatch(screen, /storedDirectProgress|setStoredDirectProgress/);

  const activePass = requiredIndex(save, "const activeDirectPassKey = direct ? directAnswerPassKey(activeSubmission.review) : null", "active answer pass");
  const activeProgress = requiredIndex(save, "const activeDirectProgress = direct ? directAnswerProgresses.get(applicationId) : null", "application-scoped progress", activePass);
  const activeHistory = requiredIndex(save, "const activeAnsweredTasks = direct", "answered task history", activeProgress);
  const historyPassGuard = requiredIndex(save, "activeDirectProgress?.key === activeDirectPassKey", "answered history pass guard", activeHistory);
  const historyRead = requiredIndex(save, "? activeDirectProgress.answeredTasks", "answered history read", historyPassGuard);
  const safeNavigation = requiredIndex(save, "directAnswerNavigationTasks(", "active review task re-resolution", historyRead);
  const safeReview = requiredIndex(save, "activeSubmission.review", "active review source", safeNavigation);
  const safePromptMatch = requiredIndex(save, "directQuestionPromptFingerprint(task) === direct.promptFingerprint", "active prompt identity", safeReview);
  const completed = requiredIndex(save, "const completedDirectPromptFingerprints = new Set(", "completed prompt snapshot", safePromptMatch);
  const accepted = requiredIndex(save, "completedDirectPromptFingerprints.add(safeDirectPromptFingerprint)", "accepted prompt", completed);
  const remaining = requiredIndex(save, "const remainingDirectQuestions = savedDirectTaskPlan.questionTasks.filter", "filtered remaining prompts", accepted);
  const remainingFilter = requiredIndex(save, "!completedDirectPromptFingerprints.has(directQuestionPromptFingerprint(task))", "completed prompt exclusion", remaining);
  const answeredQuestion = requiredIndex(save, "const answeredQuestion = saved.review.questions.find", "saved review question lookup", remainingFilter);
  const answeredPromptMatch = requiredIndex(save, "directQuestionPromptFingerprint({ question }) === safeDirectPromptFingerprint", "saved prompt identity", answeredQuestion);
  const answeredFallback = requiredIndex(save, "?? { ...safeDirectTask.question, answer: direct.answer, answer_state: direct.answerState }", "submitted answer fallback with optional decision state", answeredPromptMatch);
  const answeredTask = requiredIndex(save, "const answeredTask = { ...safeDirectTask, question: answeredQuestion }", "resolved answered task", answeredFallback);
  const historyDedupe = requiredIndex(save, "activeAnsweredTasks.some((task)", "answered history dedupe", answeredTask);
  const historyReplace = requiredIndex(save, "? activeAnsweredTasks.map((task)", "answered history replacement", historyDedupe);
  const historyAppend = requiredIndex(save, ": [...activeAnsweredTasks, answeredTask]", "answered history append", historyReplace);
  const navigationOrder = requiredIndex(save, "const savedDirectNavigationTasks = directAnswerNavigationTasks(", "saved review navigation order", historyAppend);
  const currentNavigationIndex = requiredIndex(save, "const savedDirectQuestionIndex = savedDirectNavigationTasks.findIndex", "saved question navigation index", navigationOrder);
  const adjacentQuestion = requiredIndex(save, "savedDirectNavigationTasks[savedDirectQuestionIndex + 1] ?? null", "immediately adjacent question", currentNavigationIndex);
  const savedPass = requiredIndex(save, "const savedPassKey = directAnswerPassKey(saved.review)", "saved review pass", adjacentQuestion);
  const progressPublish = requiredIndex(save, "setDirectAnswerProgresses((current)", "parent progress publication", savedPass);
  const progressApplication = requiredIndex(save, "next.set(applicationId, {", "application-keyed progress", progressPublish);
  const progressKey = requiredIndex(save, "key: savedPassKey", "review-keyed progress", progressApplication);
  const publishedHistory = requiredIndex(save, "answeredTasks,", "published answered history", progressKey);
  const cursor = requiredIndex(save, "cursorPromptFingerprint: nextSavedDirectQuestion", "next prompt cursor", adjacentQuestion);
  const cursorFallback = requiredIndex(save, ": safeDirectPromptFingerprint", "final prompt cursor", cursor);
  const progressReceipt = requiredIndex(save, "lastSavedPromptFingerprint: safeDirectPromptFingerprint", "saved prompt receipt", cursorFallback);
  const navigationToken = requiredIndex(save, "navigationToken: (activeDirectProgress?.key === activeDirectPassKey", "navigation focus token", progressReceipt);
  const totalMax = requiredIndex(save, "total: Math.max(", "stable progress total", navigationToken);
  const priorTotal = requiredIndex(save, "activeDirectQuestionTotal", "prior progress total", totalMax);
  const filteredTotal = requiredIndex(save, "completedDirectPromptFingerprints.size + remainingDirectQuestions.length", "filtered progress total", priorTotal);
  const selectionGuard = requiredIndex(save, "selectedIdRef.current !== applicationId", "selection publication guard", filteredTotal);
  assertOrdered(
    [
      activePass,
      activeProgress,
      activeHistory,
      historyPassGuard,
      historyRead,
      safeNavigation,
      safeReview,
      safePromptMatch,
      completed,
      accepted,
      remaining,
      remainingFilter,
      answeredQuestion,
      answeredPromptMatch,
      answeredFallback,
      answeredTask,
      historyDedupe,
      historyReplace,
      historyAppend,
      navigationOrder,
      currentNavigationIndex,
      adjacentQuestion,
      savedPass,
      progressPublish,
      progressApplication,
      progressKey,
      publishedHistory,
      cursor,
      cursorFallback,
      progressReceipt,
      navigationToken,
      totalMax,
      priorTotal,
      filteredTotal,
      selectionGuard,
    ],
    "accepted progress must publish by application before a switch can suppress visible state",
  );

  const key = requiredIndex(screen, "const directProgressKey = directAnswerPassKey(review)", "direct progress pass key");
  const scoped = requiredIndex(screen, "directAnswerProgress?.key === directProgressKey", "pass-scoped progress read", key);
  const resetHistory = requiredIndex(screen, "answeredTasks: []", "fresh-pass history reset", scoped);
  const resetCursor = requiredIndex(screen, "cursorPromptFingerprint: null", "fresh-pass cursor reset", resetHistory);
  const resetReceipt = requiredIndex(screen, "lastSavedPromptFingerprint: null", "fresh-pass receipt reset", resetCursor);
  const resetNavigation = requiredIndex(screen, "navigationToken: 0", "fresh-pass focus reset", resetReceipt);
  const resetTotal = requiredIndex(screen, "total: directTaskPlan.questionTasks.length", "fresh-pass total", resetNavigation);
  const remainingQuestions = requiredIndex(screen, "const remainingDirectQuestions = directTaskPlan.questionTasks.filter", "remaining direct questions", resetTotal);
  const remainingExclusion = requiredIndex(screen, "!answeredQuestionFingerprints.has(directQuestionPromptFingerprint(task))", "answered prompt exclusion", remainingQuestions);
  const navigationTasks = requiredIndex(screen, "const directQuestionTasks = directAnswerNavigationTasks(", "review-ordered navigation tasks", remainingExclusion);
  const navigationReview = requiredIndex(screen, "review,", "current review navigation source", navigationTasks);
  const navigationHistory = requiredIndex(screen, "directProgress.answeredTasks", "pass-scoped navigation history", navigationReview);
  const defaultCursor = requiredIndex(screen, "const defaultDirectPromptFingerprint = remainingDirectQuestions[0]", "default outstanding cursor", navigationHistory);
  const storedCursor = requiredIndex(screen, "const requestedDirectPromptFingerprint = directProgress.cursorPromptFingerprint", "stored cursor read", defaultCursor);
  const currentPromptGuard = requiredIndex(screen, "directQuestionFingerprints.has(directProgress.cursorPromptFingerprint)", "current review cursor guard", storedCursor);
  const currentIndex = requiredIndex(screen, "const currentDirectQuestionIndex = directQuestionTasks.findIndex", "current question index", currentPromptGuard);
  const totalStart = requiredIndex(screen, "const directQuestionTotal = Math.max(", "display total", currentIndex);
  const preservedTotal = requiredIndex(screen, "directProgress.total", "preserved display total", totalStart);
  const stableTotal = requiredIndex(screen, "directQuestionTasks.length", "navigation display total", preservedTotal);
  const positionStart = requiredIndex(screen, "const directQuestionPosition = currentDirectQuestionIndex >= 0 ? currentDirectQuestionIndex + 1 : 1", "cursor display position", stableTotal);
  const positionProp = requiredIndex(screen, "position={directQuestionPosition}", "prompt position prop", positionStart);
  const totalProp = requiredIndex(screen, "total={Math.max(1, directQuestionTotal)}", "prompt total prop", positionProp);
  assertOrdered(
    [
      key,
      scoped,
      resetHistory,
      resetCursor,
      resetReceipt,
      resetNavigation,
      resetTotal,
      remainingQuestions,
      remainingExclusion,
      navigationTasks,
      navigationReview,
      navigationHistory,
      defaultCursor,
      storedCursor,
      currentPromptGuard,
      currentIndex,
      totalStart,
      preservedTotal,
      stableTotal,
      positionStart,
      positionProp,
      totalProp,
    ],
    "a new review pass resets history while the same pass preserves its cursor and total",
  );

  assert.match(page, /onNavigateDirectQuestion=\{\(promptFingerprint\) => \{[\s\S]*?const expectedKey = directAnswerPassKey\(selectedSubmission\.review\);[\s\S]*?storedProgress\?\.key === expectedKey[\s\S]*?answeredTasks: \[\],[\s\S]*?next\.set\(selected\.id, \{[\s\S]*?cursorPromptFingerprint: promptFingerprint,[\s\S]*?navigationToken: progress\.navigationToken \+ 1/);
  assert.doesNotMatch(page, /if \(!progress \|\| progress\.key !== directAnswerPassKey\(selectedSubmission\.review\)\) return current;/);
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
  assert.match(screen, /\{!directAnswerActive && <>[\s\S]*?<Button onClick=\{onReviewPacket\}[^>]*>Open packet review<\/Button>[\s\S]*?<Button onClick=\{onRetry\} variant="secondary">Try again<\/Button>/);
  assert.match(screen, /!awaitingUnverifiedSubmission && !directAnswerActive && filledFormEvidence/);
});

/* EVERY CALLER OF directInputTaskPlan MUST HAND IT THE SERVER'S OWN LIST, not only the packet
 * screen's confirmation block that reads humanInputItems directly.
 *
 * directInputTaskPlan's own domain test (submission-checklist.test.mts) proves the function is
 * correct once handed a list; it cannot prove any of these six call sites still HAND it one, because
 * a call site is not a body a unit test's fixtures can exercise. That gap is exactly how this
 * shipped: humanInputItems already read the server's list correctly at the packet screen's own call
 * site, while every one of these six built its context from `{ company, role, documents }` alone and
 * so fell back to the label guess regardless of what the server said. Measured live 2026-09-04,
 * Hudson River Trading application 4a79eec1-5c65-4dd4-8e72-e119fbfbd733: an empty
 * sensitive_questions_requiring_confirmation list did not stop the one-question queue from asking
 * about the sponsorship question a second time. Deleting `sensitiveConfirmations:` back out of any
 * one of these six call sites reopens that exact dead end without ever touching the function body a
 * plain unit test would still pass against. */
test("every direct-plan call site hands the server's own confirmation list forward", () => {
  const actionable = page.slice(
    page.indexOf("const actionableQuestionIds = useMemo("),
    page.indexOf(".filter((item) => item.settled !== true && item.questionId)"),
  );
  assert.match(
    actionable,
    /humanInputItems\(selectedSubmission\.review, \{[\s\S]*?sensitiveConfirmations: selectedSubmission\.sensitive_questions_requiring_confirmation,/,
    "actionableQuestionIds must read the server's list, not just company/role/documents",
  );

  const save = functionBody("  async function saveReviewedAnswers(");
  assert.match(
    save,
    /const activeDirectTaskPlan = direct\s*\? directInputTaskPlan\(activeSubmission\.review, \{[\s\S]{0,200}?sensitiveConfirmations: activeSubmission\.sensitive_questions_requiring_confirmation,/,
    "the pre-flight revalidation plan must agree with the server's list, or a save the server already refused looks locally legitimate",
  );
  assert.match(
    save,
    /const latestDirectTaskPlan = direct\s*\? directInputTaskPlan\(latestSubmission\.review, \{[\s\S]{0,200}?sensitiveConfirmations: latestSubmission\.sensitive_questions_requiring_confirmation,/,
    "the post-response plan must agree with the server's list",
  );
  assert.match(
    save,
    /const savedDirectTaskPlan = directInputTaskPlan\(saved\.review, \{[\s\S]{0,200}?sensitiveConfirmations: saved\.sensitive_questions_requiring_confirmation,/,
    "the accepted-answer plan must agree with the server's list, or the next question in the queue can be one the server already cleared",
  );

  assert.match(
    page,
    /total: directInputTaskPlan\(selectedSubmission\.review, \{[\s\S]{0,300}?sensitiveConfirmations: selectedSubmission\.sensitive_questions_requiring_confirmation,/,
    "the navigator's own total must agree with the server's list, or the position counter promises a question the queue will never draw",
  );

  const screen = sourceSection("function SubmissionScreen(", "function SubmissionReceipt(");
  assert.match(
    screen,
    /const directTaskPlan = directInputTaskPlan\(attentionReview, \{[\s\S]{0,200}?sensitiveConfirmations: submission\.sensitive_questions_requiring_confirmation,/,
    "the screen's own plan - the one that decides whether DirectApplicationQuestion renders at all - must agree with the server's list",
  );
});
