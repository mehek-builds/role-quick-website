import assert from "node:assert/strict";
import test from "node:test";

import { exactPacketAuditRanges, manualHandoffMatchesPacket, manualTrialPacketEvidenceIsFresh, packetAuditIdentityMatches, packetAuditResponseMatchesApplication } from "./packet-audit-display.ts";

const jdText = "Build reliable APIs. Improve deployment safety.";
const evidence = { source: "resume_spec", path: "/experience/0/bullets/0", quote: "Built reliable APIs", sha256: "a".repeat(64) };

function validAudit(): Record<string, unknown> {
  return {
    version: "packet_audit_v1",
    status: "passed",
    complete: true,
    degraded: false,
    rejectedCount: 0,
    clauses: [
      {
        text: "Build reliable APIs.",
        start: 0,
        end: 20,
        verdict: "covered",
        evidence: [evidence],
        highlight_terms: [
          { text: "reliable APIs", key: "reliable apis", start: 6, end: 19, clauseIndex: 0, tone: "covered", evidence },
        ],
      },
      {
        text: "Improve deployment safety.",
        start: 21,
        end: jdText.length,
        verdict: "missing",
        highlight_terms: [
          { text: "deployment safety", key: "deployment safety", start: 29, end: 46, clauseIndex: 1, tone: "missing" },
        ],
      },
    ],
  };
}

test("returns only exact, enumerated server highlight ranges", () => {
  assert.deepEqual(exactPacketAuditRanges(jdText, validAudit())?.map((term) => term.tone), ["covered", "missing"]);
});

test("rejects an unknown highlight tone instead of treating it as covered", () => {
  const audit = validAudit();
  const clauses = audit.clauses as Array<Record<string, unknown>>;
  const terms = clauses[0].highlight_terms as Array<Record<string, unknown>>;
  terms[0].tone = "purple";
  assert.equal(exactPacketAuditRanges(jdText, audit), null);
});

test("rejects malformed highlight maps without throwing", () => {
  const audit = validAudit();
  const clauses = audit.clauses as Array<Record<string, unknown>>;
  clauses[0].highlight_terms = null;
  assert.doesNotThrow(() => exactPacketAuditRanges(jdText, audit));
  assert.equal(exactPacketAuditRanges(jdText, audit), null);
});

test("rejects empty, unknown-verdict, and overlapping clauses", () => {
  const empty = validAudit();
  empty.clauses = [];
  assert.equal(exactPacketAuditRanges(jdText, empty), null);

  const unknown = validAudit();
  (unknown.clauses as Array<Record<string, unknown>>)[0].verdict = "partial";
  assert.equal(exactPacketAuditRanges(jdText, unknown), null);

  const overlapping = validAudit();
  const clauses = overlapping.clauses as Array<Record<string, unknown>>;
  clauses[1] = { ...clauses[1], text: jdText.slice(19), start: 19 };
  assert.equal(exactPacketAuditRanges(jdText, overlapping), null);
});

test("retains local render proof only for the exact audit and PDF identity", () => {
  const identity = {
    packet_version: "b".repeat(64),
    audit_digest: "c".repeat(64),
    identities: { resume_email: "me@usc.edu", applicant_email: "app@apply.litos.test" },
    bindings: {
      resumeContactEmailSha256: "a".repeat(64),
      applicantEmailSha256: "e".repeat(64),
      pdf: { objectKey: "resumes/exact.pdf", sha256: "d".repeat(64), sizeBytes: 42 },
    },
  };
  assert.equal(packetAuditIdentityMatches(identity, structuredClone(identity)), true);
  for (const mutate of [
    (copy: typeof identity) => { copy.packet_version = "e".repeat(64); },
    (copy: typeof identity) => { copy.audit_digest = "e".repeat(64); },
    (copy: typeof identity) => { copy.bindings.resumeContactEmailSha256 = "f".repeat(64); },
    (copy: typeof identity) => { copy.bindings.applicantEmailSha256 = "f".repeat(64); },
    (copy: typeof identity) => { copy.identities.resume_email = "other@usc.edu"; },
    (copy: typeof identity) => { copy.identities.applicant_email = "other@apply.litos.test"; },
    (copy: typeof identity) => { copy.bindings.pdf.objectKey = "resumes/other.pdf"; },
    (copy: typeof identity) => { copy.bindings.pdf.sha256 = "e".repeat(64); },
    (copy: typeof identity) => { copy.bindings.pdf.sizeBytes = 43; },
  ]) {
    const changed = structuredClone(identity);
    mutate(changed);
    assert.equal(packetAuditIdentityMatches(identity, changed), false);
  }
  assert.equal(packetAuditIdentityMatches(identity, null), false);
});

test("matches one application to an exact packet envelope without trusting response JSON", () => {
  const digest = "f".repeat(64);
  const response = {
    packet_audit: {
      audit_digest: digest,
      packet_version: digest,
      bindings: {
        ownerSha256: digest,
        applicationId: "application-1",
        jdSha256: digest,
        specSha256: digest,
        jobContextSha256: digest,
        questionsSha256: digest,
        applicantSnapshotSha256: digest,
        resumeContactEmailSha256: digest,
        applicantEmailSha256: digest,
        pdf: { objectKey: "resumes/exact.pdf", sha256: digest, sizeBytes: 42 },
      },
      identities: { resume_email: "me@usc.edu", applicant_email: "app@apply.litos.test" },
    },
    pdf: { object_key: "resumes/exact.pdf", sha256: digest, size_bytes: 42, download_url: "https://api.example/resume/download?t=token" },
  };
  assert.equal(packetAuditResponseMatchesApplication("application-1", response), true);
  assert.equal(packetAuditResponseMatchesApplication("application-2", response), false);

  const missingSnapshotBinding = structuredClone(response);
  delete (missingSnapshotBinding.packet_audit.bindings as Partial<typeof response.packet_audit.bindings>).applicantSnapshotSha256;
  assert.equal(packetAuditResponseMatchesApplication("application-1", missingSnapshotBinding), false);

  for (const mutate of [
    (copy: typeof response) => { delete (copy.packet_audit.bindings as Partial<typeof copy.packet_audit.bindings>).resumeContactEmailSha256; },
    (copy: typeof response) => { delete (copy.packet_audit.bindings as Partial<typeof copy.packet_audit.bindings>).applicantEmailSha256; },
    (copy: typeof response) => { copy.packet_audit.identities.applicant_email = copy.packet_audit.identities.resume_email; },
  ]) {
    const changed = structuredClone(response);
    mutate(changed);
    assert.equal(packetAuditResponseMatchesApplication("application-1", changed), false);
  }

  for (const malformed of [
    { packet_audit: null, pdf: response.pdf },
    { packet_audit: { bindings: null }, pdf: response.pdf },
    { packet_audit: response.packet_audit, pdf: { ...response.pdf, download_url: null } },
  ]) {
    assert.doesNotThrow(() => packetAuditResponseMatchesApplication("application-1", malformed));
    assert.equal(packetAuditResponseMatchesApplication("application-1", malformed), false);
  }

  const revalidated = {
    acknowledged: true,
    pdfVerified: true,
    serverRevalidatedAt: 10_000,
    response,
  };
  assert.equal(manualTrialPacketEvidenceIsFresh("application-1", revalidated, 12_500), true);
  assert.equal(manualTrialPacketEvidenceIsFresh("application-1", { ...revalidated, acknowledged: false }, 12_500), false);
  assert.equal(manualTrialPacketEvidenceIsFresh("application-1", { ...revalidated, pdfVerified: false }, 12_500), false);
  assert.equal(manualTrialPacketEvidenceIsFresh("application-1", revalidated, 15_000), false);
  assert.equal(manualTrialPacketEvidenceIsFresh("application-1", revalidated, 9_999), false);
  assert.equal(manualTrialPacketEvidenceIsFresh("application-2", revalidated, 12_500), false);
});

test("opens only the action-time server URL for the exact displayed packet", () => {
  const digest = "f".repeat(64);
  const packet = {
    packet_audit: { audit_digest: digest, packet_version: digest },
    pdf: { sha256: digest, size_bytes: 42 },
  };
  const url = "https://jobs.jobvite.com/acme/job/Ab12Cd/apply";
  const response = {
    manual_handoff: {
      url,
      audit_digest: digest,
      packet_version: digest,
      pdf_sha256: digest,
      size_bytes: 42,
    },
  };
  assert.equal(manualHandoffMatchesPacket(response, url, packet), true);

  for (const mutate of [
    (copy: typeof response) => { copy.manual_handoff.url = "https://jobs.jobvite.com/acme/job/Different/apply"; },
    (copy: typeof response) => { copy.manual_handoff.url = "https://jobs.jobvite.com/other/job/Ab12Cd/apply"; },
    (copy: typeof response) => { copy.manual_handoff.audit_digest = "a".repeat(64); },
    (copy: typeof response) => { copy.manual_handoff.packet_version = "a".repeat(64); },
    (copy: typeof response) => { copy.manual_handoff.pdf_sha256 = "a".repeat(64); },
    (copy: typeof response) => { copy.manual_handoff.size_bytes = 43; },
  ]) {
    const changed = structuredClone(response);
    mutate(changed);
    assert.equal(manualHandoffMatchesPacket(changed, url, packet), false);
  }
  assert.equal(manualHandoffMatchesPacket({ manual_handoff: null }, url, packet), false);
});
