import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/dashboard/applications/page.tsx"),
  "utf8",
);

const saveStart = source.indexOf("async function saveResume()");
const continueStart = source.indexOf("async function continueFromResume()", saveStart);
const verifiedStart = source.indexOf("async function continueFromVerifiedPacket(", continueStart);
const saveResume = source.slice(saveStart, continueStart);
const continueFromResume = source.slice(continueStart, verifiedStart);
const coverLetterStart = source.indexOf("async function saveCoverLetter()");
const patchEntryStart = source.indexOf("function patchEntry(", coverLetterStart);
const saveCoverLetter = source.slice(coverLetterStart, patchEntryStart);
const selectPacketStart = source.indexOf("const selectPacket = useCallback(");
const openApplicationStart = source.indexOf("const openApplication = useCallback(", selectPacketStart);
const selectPacket = source.slice(selectPacketStart, openApplicationStart);
const resetWorkflowStart = source.indexOf("const resetApplicationWorkflow = useCallback(", openApplicationStart);
const closeApplicationStart = source.indexOf("const closeApplication = useCallback(", resetWorkflowStart);
const resetApplicationWorkflow = source.slice(resetWorkflowStart, closeApplicationStart);

test("a successful save adopts the server canonical spec only for the application still selected", () => {
  assert.ok(saveStart >= 0 && continueStart > saveStart, "save and audit functions must remain discoverable");
  assert.match(saveResume, /const applicationId = selected\.id;/);
  assert.match(saveResume, /const savedSpec = stripMetadata\(updated\.spec\);/);
  assert.match(saveResume, /const savedReview = updated\.spec\._review \? reviewWithLists\(updated\.spec\._review\) : null;/);
  assert.match(saveResume, /const editorRevision = editorRevisionRef\.current;/);
  assert.match(saveResume, /if \(selectedIdRef\.current !== applicationId \|\| editorRevisionRef\.current !== editorRevision\) return null;\s*setSpec\(savedSpec\);/s);
  assert.match(saveResume, /return \{ spec: savedSpec, review: savedReview \};/);
});

test("newer same-packet edits and A to B to A switches invalidate an in-flight save", () => {
  assert.match(source, /const editorRevisionRef = useRef\(0\);/);
  assert.match(source, /const editResumeSpec = useCallback\(\(next: ResumeSpec\) => \{\s*editorRevisionRef\.current \+= 1;\s*setSpec\(next\);/s);
  assert.match(source, /selectedIdRef\.current = packet\.id;\s*editorRevisionRef\.current \+= 1;/s);
  assert.match(source, /function patchEntry[\s\S]+?editorRevisionRef\.current \+= 1;\s*setSpec/);
  assert.match(source, /onChange=\{editResumeSpec\}/);
  assert.doesNotMatch(source, /<ResumeEditor[\s\S]+?onChange=\{setSpec\}/);
});

test("the audit binds the exact saved spec and canonical review instead of stale request state", () => {
  assert.ok(continueStart >= 0 && verifiedStart > continueStart, "audit function must remain discoverable");
  assert.match(continueFromResume, /const resumeSaveRequired = packetDraftChanged \|\| resumeEditSaveApplicationRef\.current === applicationId;/);
  assert.match(continueFromResume, /const savedResume = resumeSaveRequired \? await saveResume\(\) : \{ spec, review \};/);
  assert.match(continueFromResume, /if \(!savedResume \|\| selectedIdRef\.current !== applicationId\) return;/);
  assert.match(continueFromResume, /const auditedSpec = savedResume\.spec;\s*const canonicalReview = savedResume\.review;/s);
  assert.match(continueFromResume, /let savedReview = canonicalReview;/);
  /* WHICH STATUS THE PRE-AUDIT WRITE IS DECIDED FROM, which is the fact this file exists to hold.
     It has to be the canonical review the server just returned, never the component's `review`
     state, or the audit is routed by a status the save may already have moved. The decision used to
     be an inline `[...].includes(...)`; it is now auditAnswerWrite, because a stalled packet has to
     write through a route that does not relabel it. Same value read, so the assertion follows the
     value rather than the shape of the call around it. */
  assert.match(continueFromResume, /auditAnswerWrite\(canonicalReview\.status\)/);
  assert.match(continueFromResume, /answerWrite === "answers_only" && reviewAnswersNeedSave\(canonicalReview\.questions, questions\)/);
  assert.doesNotMatch(continueFromResume, /auditAnswerWrite\(review\.status\)/);
  assert.doesNotMatch(continueFromResume, /let savedReview = review;/);
  assert.match(continueFromResume, /specJson: JSON\.stringify\(auditedSpec\)/);
  assert.doesNotMatch(continueFromResume, /specJson: JSON\.stringify\(spec\)/);
});

test("a ready packet with a real edit is saved, while an unchanged packet avoids a no-op PATCH", () => {
  assert.match(continueFromResume, /const resumeSaveRequired = packetDraftChanged \|\| resumeEditSaveApplicationRef\.current === applicationId;/);
  assert.match(continueFromResume, /const savedResume = resumeSaveRequired \? await saveResume\(\) : \{ spec, review \};/);
  assert.doesNotMatch(continueFromResume, /alreadyFilled \? spec : await saveResume\(\)/);
  assert.match(continueFromResume, /const alreadyFilled = canonicalReview\.status === "ready_for_final_approval";/);
});

test("explicitly editing an unchanged resume still refreshes its server-rendered contact", () => {
  assert.match(source, /const resumeEditSaveApplicationRef = useRef<string \| null>\(null\);/);
  assert.match(
    source,
    /onClick=\{\(\) => \{\s*resumeEditSaveApplicationRef\.current = selected\.id;\s*packetEvidenceRef\.current = null;\s*setPacketEvidence\(null\);\s*\}\}[\s\S]{0,80}>\s*Edit resume/,
  );
  assert.match(continueFromResume, /resumeEditSaveApplicationRef\.current === applicationId/);
  assert.match(
    saveResume,
    /if \(resumeEditSaveApplicationRef\.current === applicationId\) resumeEditSaveApplicationRef\.current = null;\s*setNotice\("Resume saved and rechecked\."\);\s*return \{ spec: savedSpec, review: savedReview \};/s,
    "the explicit-save intent must survive failures and be consumed only after the regenerated resume is adopted",
  );
});

test("same-packet reselection preserves the explicit save while workflow changes clear it", () => {
  assert.ok(selectPacketStart >= 0 && openApplicationStart > selectPacketStart, "packet selection must remain discoverable");
  assert.match(
    selectPacket,
    /if \(canonical \|\| selectedIdRef\.current !== packet\.id\) resumeEditSaveApplicationRef\.current = null;/,
    "reselecting the currently selected packet must preserve its pending contact refresh",
  );
  assert.doesNotMatch(
    selectPacket,
    /const packet = sendable \?\? incoming;\s*resumeEditSaveApplicationRef\.current = null;/,
    "selection must not clear the intent before checking whether the packet actually changed",
  );
  assert.match(
    resetApplicationWorkflow,
    /selectedIdRef\.current = null;\s*resumeEditSaveApplicationRef\.current = null;/,
    "closing or resetting the application workflow must abandon the pending edit session",
  );
  assert.match(
    source,
    /if \(requestedCanonicalApplication && requestedApplicationIntent === "detail"\) \{\s*selectedIdRef\.current = null;\s*resumeEditSaveApplicationRef\.current = null;/s,
    "direct navigation away from packet editing to canonical detail must also clear the intent",
  );
});

test("a selection change stops every post-save route from installing the wrong packet", () => {
  const guards = continueFromResume.match(/selectedIdRef\.current !== applicationId/g) ?? [];
  assert.ok(guards.length >= 3, "save, review, and audit awaits must each re-check the selected application");
  /* setQuestions(auditedQuestions) rides between the guard and auditedReview: the audit refreshes
     the questions server-side, and adopting them here (rather than after the guard has already let a
     stale selection through) is what keeps a later submit-request from resubmitting a packet the
     audit above never produced. See packetAuditService.test.ts's "a packet the audit blanked stays
     blank" for the deadlock this closes. auditedQuestions falls back to the local `questions` when
     the response carries none, so a caller talking to a backend that predates this field degrades
     to the old behaviour instead of crashing on every question-reading render. */
  assert.match(
    continueFromResume,
    /const response = await api<PacketAuditResponse>[\s\S]+?if \(selectedIdRef\.current !== applicationId\) return;\s*[\s\S]*?const auditedQuestions = Array\.isArray\(response\.questions\) \? response\.questions : questions;\s*setQuestions\(auditedQuestions\);\s*const auditedReview/,
  );
  assert.match(saveResume, /catch \(reason\) \{\s*if \(selectedIdRef\.current === applicationId\)/s);
  assert.match(continueFromResume, /catch \(reason\) \{\s*if \(selectedIdRef\.current !== applicationId\) return;/s);
});

test("a stale cover-letter save cannot publish editor state, errors, notices, or busy cleanup", () => {
  assert.ok(coverLetterStart >= 0 && patchEntryStart > coverLetterStart, "cover-letter save must remain discoverable");
  assert.match(saveCoverLetter, /const applicationId = selected\.id;/);
  assert.match(saveCoverLetter, /const requestScope = beginPacketCoverLetterRequest\(applicationId\);/);
  assert.match(saveCoverLetter, /const submittedBody = coverLetterBody;/);
  assert.match(saveCoverLetter, /body: JSON\.stringify\(\{ body: submittedBody \}\)/);
  assert.ok(
    (saveCoverLetter.match(/if \(!packetCoverLetterRequestMayPublish\(requestScope\)\) return false;/g) ?? []).length >= 3,
    "delete, save, and failure callbacks must each prove editor ownership",
  );
  assert.match(saveCoverLetter, /catch \(reason\) \{\s*if \(!packetCoverLetterRequestMayPublish\(requestScope\)\) return false;\s*setError/s);
  assert.match(saveCoverLetter, /finally \{\s*if \(packetCoverLetterRequestOwnsLifecycle\(requestScope\)\) setCoverLetterBusy\(false\);/);
});
