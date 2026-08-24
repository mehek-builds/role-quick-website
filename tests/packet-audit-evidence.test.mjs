import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  acknowledgePacketEvidence,
  packetQuestionsSnapshot,
  reconcilePacketPdfVerification,
  reconcileUnacknowledgedPacketPoll,
  revalidateAcknowledgedPacketEvidence,
} from "../features/applications/domain/packet-evidence-session.ts";
import {
  exactPacketAuditRanges,
  packetAuditIdentityMatches,
  packetAuditResponseMatchesApplication,
} from "../features/applications/domain/packet-audit-display.ts";
import { PACKET_AUDIT_VERSION } from "../lib/packet-audit-version.ts";

const componentUrl = new URL("../components/app/PacketAuditEvidence.tsx", import.meta.url);
const displayDomainUrl = new URL("../features/applications/domain/packet-audit-display.ts", import.meta.url);
const dashboardUrl = new URL("../app/dashboard/applications/page.tsx", import.meta.url);
const evidenceSessionUrl = new URL("../features/applications/domain/packet-evidence-session.ts", import.meta.url);
const digest = "a".repeat(64);
const otherDigest = "b".repeat(64);
const applicationId = "application-1";
const haizeQuestions = [
  { id: "start-month", question: "Start month", answer: "August", kind: "required", required: true, options: ["August", "September"] },
  { id: "start-year", question: "Start year", answer: "2023", kind: "required", required: true },
  { id: "end-year", question: "End year", answer: "2028", kind: "required", required: true },
  { id: "linkedin", question: "LinkedIn", answer: "https://www.linkedin.com/in/fixture", kind: "required", required: true },
  { id: "website", question: "Website", answer: "https://example.invalid", kind: "required", required: false },
];

function packetAuditResponse(overrides = {}) {
  const auditDigest = overrides.digest ?? digest;
  return {
    packet_audit: {
      version: PACKET_AUDIT_VERSION,
      status: "passed",
      complete: true,
      degraded: false,
      rejectedCount: 0,
      clauses: [],
      editedTerms: [],
      terms: { covered: [], missing: [], edited: [] },
      audit_digest: auditDigest,
      packet_version: auditDigest,
      bindings: {
        ownerSha256: digest,
        applicationId,
        jdSha256: digest,
        specSha256: digest,
        jobContextSha256: digest,
        questionsSha256: digest,
        applicantSnapshotSha256: digest,
        resumeContactEmailSha256: digest,
        applicantEmailSha256: digest,
        pdf: { objectKey: "resumes/exact.pdf", sha256: digest, sizeBytes: 42 },
        employerDelivery: {
          version: "employer_delivery_v1",
          mode: "browser",
          sha256: digest,
        },
      },
      identities: {
        resume_email: "student@example.edu",
        applicant_email: "route@apply.litos.example",
      },
    },
    pdf: {
      object_key: "resumes/exact.pdf",
      sha256: digest,
      size_bytes: 42,
      download_url: "https://student-outreach-backend.vercel.app/resume/download?token=fixture",
    },
  };
}

test("a backend-shaped v2 audit binds the exact employer delivery envelope", () => {
  const response = packetAuditResponse();
  assert.equal(packetAuditResponseMatchesApplication(applicationId, response), true);
  assert.equal(
    packetAuditIdentityMatches(response.packet_audit, structuredClone(response.packet_audit)),
    true,
  );

  for (const mutate of [
    (candidate) => { candidate.packet_audit.version = "packet_audit_v1"; },
    (candidate) => { candidate.packet_audit.bindings.employerDelivery.version = "employer_delivery_v0"; },
    (candidate) => { candidate.packet_audit.bindings.employerDelivery.mode = "email"; },
    (candidate) => { candidate.packet_audit.bindings.employerDelivery.sha256 = "not-a-digest"; },
  ]) {
    const candidate = structuredClone(response);
    mutate(candidate);
    assert.equal(packetAuditResponseMatchesApplication(applicationId, candidate), false);
  }

  const changedDelivery = structuredClone(response.packet_audit);
  changedDelivery.bindings.employerDelivery.sha256 = otherDigest;
  assert.equal(packetAuditIdentityMatches(response.packet_audit, changedDelivery), false);
});

test("v2 requirement ranges render while v1 and unknown versions fail closed", () => {
  const jdText = "Build reliable systems";
  const audit = packetAuditResponse().packet_audit;
  audit.clauses = [{
    text: jdText,
    start: 0,
    end: jdText.length,
    verdict: "missing",
    highlight_terms: [{
      text: "reliable",
      key: "reliable",
      start: 6,
      end: 14,
      clauseIndex: 0,
      tone: "missing",
    }],
  }];
  assert.equal(exactPacketAuditRanges(jdText, audit)?.length, 1);
  assert.equal(exactPacketAuditRanges(jdText, { ...audit, version: "packet_audit_v1" }), null);
  assert.equal(exactPacketAuditRanges(jdText, { ...audit, version: "packet_audit_v99" }), null);
});

function packetEvidence(overrides = {}) {
  return {
    applicationId,
    response: packetAuditResponse(),
    specJson: JSON.stringify({ skills: ["TypeScript"] }),
    questionsSnapshot: packetQuestionsSnapshot(haizeQuestions),
    pdfVerified: true,
    acknowledged: false,
    serverRevalidatedAt: null,
    ...overrides,
  };
}

test("Haize question snapshots ignore payload order and display-only metadata", () => {
  const reordered = [...haizeQuestions].reverse().map((question) => ({
    ...question,
    explanation: "Display-only poll copy",
    remembered: true,
  }));
  assert.equal(packetQuestionsSnapshot(reordered), packetQuestionsSnapshot(haizeQuestions));
});

test("Haize question snapshots bind id, normalized prompt, required, kind, options, and exact answer", () => {
  const whitespaceOnly = haizeQuestions.map((question) => (
    question.id === "start-month" ? { ...question, question: "  Start   month  ", options: ["September", "August"] } : question
  ));
  assert.equal(packetQuestionsSnapshot(whitespaceOnly), packetQuestionsSnapshot(haizeQuestions));

  for (const mutation of [
    (question) => ({ ...question, id: `${question.id}-changed` }),
    (question) => ({ ...question, question: `${question.question}?` }),
    (question) => ({ ...question, required: !question.required }),
    (question) => ({ ...question, kind: question.kind === "required" ? "essay" : "required" }),
    (question) => ({ ...question, options: [...(question.options ?? []), "October"] }),
    (question) => ({ ...question, answer: `${question.answer} ` }),
  ]) {
    const changed = haizeQuestions.map((question) => question.id === "start-month" ? mutation(question) : question);
    assert.notEqual(packetQuestionsSnapshot(changed), packetQuestionsSnapshot(haizeQuestions));
  }
});

test("an exact rendered packet becomes acknowledged", () => {
  const current = packetEvidence();
  assert.deepEqual(acknowledgePacketEvidence(current, structuredClone(current)), { ...current, acknowledged: true });
});

test("ACK fails closed when the audit or question snapshot changed in flight", () => {
  const expected = packetEvidence();
  const staleAudit = packetEvidence({ response: packetAuditResponse({ digest: otherDigest }) });
  const changedQuestions = haizeQuestions.map((question) => (
    question.id === "end-year" ? { ...question, answer: "2027" } : question
  ));
  const staleQuestions = packetEvidence({ questionsSnapshot: packetQuestionsSnapshot(changedQuestions) });

  assert.equal(acknowledgePacketEvidence(staleAudit, expected), null);
  assert.equal(acknowledgePacketEvidence(staleQuestions, expected), null);
});

test("a stale poll branch cannot erase evidence acknowledged after that branch was selected", () => {
  let state = packetEvidence();
  let pollRef = state;
  const expected = structuredClone(state);
  const stalePolledAudit = packetAuditResponse({ digest: otherDigest }).packet_audit;
  assert.equal(pollRef.acknowledged, false, "the stale poll must select the old branch before ACK commits");
  const queuedPollUpdate = (current) => reconcileUnacknowledgedPacketPoll(current, applicationId, stalePolledAudit);

  const acknowledged = acknowledgePacketEvidence(pollRef, expected);
  assert.ok(acknowledged);
  pollRef = acknowledged;
  state = acknowledged;
  state = queuedPollUpdate(state);

  assert.equal(pollRef.acknowledged, true);
  assert.equal(state, acknowledged, "the queued updater must preserve the exact state ACK already committed");
});

test("portal navigation preserves verified ACK while real PDF invalidation still clears it", () => {
  let state = packetEvidence({ pdfVerified: false });
  state = reconcilePacketPdfVerification(state, {
    auditDigest: digest,
    sha256: digest,
    sizeBytes: 42,
  });
  assert.ok(state?.pdfVerified);
  const acknowledged = acknowledgePacketEvidence(state, structuredClone(state));
  assert.ok(acknowledged?.acknowledged);

  // Review-to-portal navigation unmounts the viewer but publishes no verification event.
  const afterPortalUnmount = acknowledged;
  assert.equal(afterPortalUnmount.pdfVerified, true);
  assert.equal(afterPortalUnmount.acknowledged, true);
  assert.ok(revalidateAcknowledgedPacketEvidence(
    afterPortalUnmount,
    applicationId,
    structuredClone(afterPortalUnmount.response),
    456,
  )?.acknowledged);

  const changedBinding = reconcilePacketPdfVerification(afterPortalUnmount, {
    auditDigest: digest,
    sha256: otherDigest,
    sizeBytes: 42,
  });
  assert.equal(changedBinding?.pdfVerified, false);
  assert.equal(changedBinding?.acknowledged, false);

  const failedVerification = reconcilePacketPdfVerification(afterPortalUnmount, null);
  assert.equal(failedVerification?.pdfVerified, false);
  assert.equal(failedVerification?.acknowledged, false);
});

test("an unacknowledged poll retains only the exact audit", () => {
  const current = packetEvidence({ serverRevalidatedAt: 123 });
  assert.deepEqual(
    reconcileUnacknowledgedPacketPoll(current, applicationId, structuredClone(current.response.packet_audit)),
    { ...current, serverRevalidatedAt: null },
  );
  assert.equal(
    reconcileUnacknowledgedPacketPoll(current, applicationId, packetAuditResponse({ digest: otherDigest }).packet_audit),
    null,
  );
});

test("the next acknowledged poll requires an exact action-time server audit", () => {
  const acknowledged = packetEvidence({ acknowledged: true });
  const exactServerResponse = structuredClone(acknowledged.response);
  assert.deepEqual(
    revalidateAcknowledgedPacketEvidence(acknowledged, applicationId, exactServerResponse, 456),
    { ...acknowledged, response: exactServerResponse, serverRevalidatedAt: 456 },
  );
  assert.equal(
    revalidateAcknowledgedPacketEvidence(acknowledged, applicationId, packetAuditResponse({ digest: otherDigest }), 456),
    null,
  );
});

test("the ACK continuation commits the poll ref before state and portal routing", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  const start = source.indexOf("async function continueFromVerifiedPacket(");
  const end = source.indexOf("async function prepareApplication(", start);
  const continuation = source.slice(start, end);
  const refWrite = continuation.indexOf("packetEvidenceRef.current = acknowledgedEvidence");
  const stateWrite = continuation.indexOf("setPacketEvidence(acknowledgedEvidence)");
  const portalMove = continuation.indexOf('moveToScreen("portal")');

  assert.ok(refWrite >= 0, "the ACK continuation must synchronously update the ref read by the poll");
  assert.ok(stateWrite > refWrite, "the ref must be updated before React queues the state commit");
  assert.ok(portalMove > stateWrite, "the exact acknowledged evidence must be committed before opening final review");
});

test("prepare and poll responses hydrate the generated cover letter into review state", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  const pollStart = source.indexOf("const refreshSubmission = useCallback(async () =>");
  const pollEnd = source.indexOf("const sendWithoutAsking = useCallback", pollStart);
  const poll = source.slice(pollStart, pollEnd);
  const prepareStart = source.indexOf("async function prepareApplication(");
  const prepareEnd = source.indexOf("async function saveQuestions", prepareStart);
  const prepare = source.slice(prepareStart, prepareEnd);

  assert.match(source, /function packetWithSubmission\(packet: GeneratedResume, submission: SubmissionResponse\)/);
  assert.match(source, /submissionReviewPacketIdentity\(packet\.spec\._review\) === submissionReviewPacketIdentity\(submission\.review\)/);
  assert.match(source, /const nextCoverLetter = nextCoverLetterValue\(packet\.spec\._cover_letter, submission\)/);
  assert.match(source, /_cover_letter: nextCoverLetter/);
  assert.match(source, /coverLetterField\.included && !coverLetterField\.value[\s\S]{0,100}\? undefined/);
  assert.match(poll, /const incomingCoverLetter = submissionCoverLetterField\(result\)/);
  assert.match(poll, /setCoverLetterBody\(incomingCoverLetter\.value\?\.body \?\? ""\)/);
  assert.match(poll, /if \(!incomingCoverLetter\.value\) setCoverLetterDownloadUrl\(null\)/);
  assert.match(poll, /packetWithSubmission\(packet, result\)/);
  assert.match(prepare, /packetWithDirectSubmission\(packet, published\)/);
  assert.match(prepare, /const incomingCoverLetter = submissionCoverLetterField\(published\)/);
  assert.match(prepare, /setCoverLetterBody\(incomingCoverLetter\.value\?\.body \?\? ""\)/);
  assert.match(prepare, /if \(!incomingCoverLetter\.value\) setCoverLetterDownloadUrl\(null\)/);
  const directPublish = prepare.indexOf('publishSubmissionEnvelope(submissionRef, result, "direct")');
  const currentPacketWrite = prepare.indexOf("packetWithDirectSubmission(packet, published)");
  const submissionWrite = prepare.indexOf("setSubmission(published)");
  assert.ok(directPublish >= 0, "the submit response must synchronously publish its envelope");
  assert.ok(currentPacketWrite > directPublish, "the current packet write must follow ref publication");
  assert.ok(submissionWrite > directPublish, "the React submission write must follow ref publication");
  assert.ok(
    prepare.indexOf("if (selectedIdRef.current !== applicationId)")
      < prepare.indexOf("const incomingCoverLetter = submissionCoverLetterField(published)"),
    "a response for a packet the student left must not overwrite the current review editor",
  );
});

test("handoff completion and self-submission publish only to the packet that started them", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  for (const [name, endMarker] of [
    ["completeHandoff", "recordSelfSubmitted"],
    ["recordSelfSubmitted", "reviewPortalQuestions"],
  ]) {
    const start = source.indexOf(`async function ${name}`);
    const end = source.indexOf(`function ${endMarker}`, start);
    const action = source.slice(start, end);
    assert.match(action, /const requestedId = selected\.id;/);
    const selectionGuard = action.indexOf("if (selectedIdRef.current !== requestedId)");
    const directPublish = action.indexOf('publishSubmissionEnvelope(submissionRef, result, "direct")');
    const evidenceWrite = action.indexOf("packetEvidenceRef.current = nextEvidence");
    const questionWrite = action.indexOf("setQuestions(published.review.questions)");
    const submissionWrite = action.indexOf("setSubmission(published)");
    assert.ok(selectionGuard >= 0, `${name} must discard selected-screen writes after a packet switch`);
    assert.ok(directPublish > selectionGuard, `${name} must publish only after its selection guard`);
    assert.ok(evidenceWrite > directPublish, `${name} evidence must follow synchronous envelope publication`);
    assert.ok(questionWrite > directPublish, `${name} questions must follow synchronous envelope publication`);
    assert.ok(submissionWrite > directPublish, `${name} React submission state must follow synchronous envelope publication`);
    assert.match(action, /reconcilePacketEvidenceWithSubmission\([\s\S]{0,260}published\.review\.packet_audit/);
    assert.match(action, /packetWithDirectSubmission\(packet, published\)/);
  }
});

test("the dashboard renders only exact server-owned JD ranges and clause evidence", async () => {
  const source = await readFile(componentUrl, "utf8");
  const domain = await readFile(displayDomainUrl, "utf8");
  assert.match(domain, /Array\.isArray\(clause\.highlight_terms\)/);
  assert.match(domain, /jdText\.slice\(termStart, termEnd\) !== term\.text/);
  assert.match(domain, /termStart < start \|\| termEnd <= termStart \|\| termEnd > end/);
  assert.match(domain, /term\.clauseIndex !== clauseIndex/);
  assert.match(domain, /term\.tone === "missing" \? term\.evidence !== undefined : !isEvidence\(term\.evidence\)/);
  assert.match(domain, /jdText\.slice\(start, end\) !== clause\.text/);
  assert.match(source, /<TermMark[\s\S]*tone=\{range\.tone\}/);
  assert.match(domain, /Array\.isArray\(clause\.evidence\)/);
  assert.match(source, /clause\.evidence\.map\(\(evidence\)/);
  assert.match(source, /evidence\.source === "resume_spec" \? "Resume evidence" : "Profile evidence"/);
  assert.match(source, /PacketAuditBreakdown\(\{ jdText, audit \}/);
  assert.match(source, /if \(!packetAuditDisplayIsExact\(jdText, audit\)\)/);
});

test("unsupported or overlapping audit colors fail closed", async () => {
  const source = await readFile(componentUrl, "utf8");
  const domain = await readFile(displayDomainUrl, "utf8");
  assert.match(domain, /ranges\[index\]\.start < ranges\[index - 1\]\.end/);
  assert.doesNotMatch(source, /role="alert"/);
  assert.match(source, /return <div className="whitespace-pre-line">\{jdText\}<\/div>/);
  assert.match(source, /return null/);
  assert.match(domain, /auditValue\.status !== "passed"/);
  assert.match(domain, /auditValue\.rejectedCount !== 0/);
  assert.match(domain, /isHighlightTone\(term\.tone\)/);
  assert.match(domain, /auditValue\.clauses\.length === 0/);
});

test("a poll invalidates local proof when the audit digest or PDF binding changes", async () => {
  const [source, evidenceSession] = await Promise.all([
    readFile(dashboardUrl, "utf8"),
    readFile(evidenceSessionUrl, "utf8"),
  ]);
  assert.match(source, /reconcileUnacknowledgedPacketPoll\(current, requestedId, result\.review\.packet_audit\)/);
  assert.match(evidenceSession, /packetAuditIdentityMatches\(current\.response\.packet_audit, polledAudit\)/);
});

test("the browser binds the audit to this application and exact stored PDF", async () => {
  const domain = await readFile(displayDomainUrl, "utf8");
  assert.match(domain, /bindings\.applicationId === applicationId/);
  assert.match(domain, /pdf\.object_key === binding\.objectKey/);
  assert.match(domain, /pdf\.sha256 === binding\.sha256/);
  assert.match(domain, /pdf\.size_bytes === binding\.sizeBytes/);
  assert.match(domain, /bindings\.ownerSha256/);
  assert.match(domain, /bindings\.applicantSnapshotSha256/);
  assert.match(domain, /bindings\.resumeContactEmailSha256/);
  assert.match(domain, /bindings\.applicantEmailSha256/);
  assert.match(domain, /identities\.resume_email/);
  assert.match(domain, /identities\.applicant_email/);
  assert.match(domain, /audit\.packet_version/);
  assert.match(domain, /audit\.audit_digest/);
  assert.match(domain, /typeof pdf\.download_url === "string"/);
  assert.match(domain, /isEmployerDeliveryBinding\(bindingsValue\.employerDelivery\)/);
  assert.match(domain, /currentBindings\.employerDelivery\.sha256 === nextBindings\.employerDelivery\.sha256/);
});

test("the active audit owns the legend and replaces the live score and gap list", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  assert.match(source, /authoritativeMissingCount = activePacketEvidence[\s\S]{0,240}clause\.verdict === "missing"/);
  assert.match(source, /authoritativeEditedCount = activePacketEvidence[\s\S]{0,300}term\.tone === "edited"/);
  assert.match(source, /activePacketEvidence[\s\S]{0,180}Exact packet checked[\s\S]{0,180}<MatchScore/);
  assert.match(source, /<MatchLegend missingCount=\{authoritativeMissingCount\} editedCount=\{authoritativeEditedCount\}/);
  assert.match(source, /!activePacketEvidence && matchResult && matchResult\.missing\.length > 0/);
});
