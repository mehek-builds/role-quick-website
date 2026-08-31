import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationPacketAuthorityState,
  managedPrepareAuthorityEnvelopeFromUnknown,
  managedPrepareAuthorityMatchesPacket,
  submissionMutationResponseMatchesApplication,
} from "./application-packet-authority.ts";
import type { ApplicationReview, PacketAudit } from "../../../lib/api.ts";

const PACKET_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PACKET_ID = "22222222-2222-4222-8222-222222222222";
const APPLICATION_ID = "33333333-3333-4333-8333-333333333333";
const ATTEMPT_ID = "44444444-4444-4444-8444-444444444444";

const receipt = {
  confirmation_text: "Application received",
  final_url: "https://jobs.example.com/application/complete",
  captured_at: "2026-08-28T10:00:01.000Z",
  source: "managed_browser",
} as const;

const confirmed = {
  state: "confirmed",
  attempt_id: ATTEMPT_ID,
  canonical_application_id: APPLICATION_ID,
  packet_id: PACKET_ID,
  submitted_at: "2026-08-28T10:00:00.000Z",
  receipt,
  source: "managed_browser",
  tracker_stage: "applied",
} as const;
const confirmedSafety = {
  kind: "blocked_confirmed",
  attemptId: ATTEMPT_ID,
  confirmedAt: receipt.captured_at,
} as const;

function review(overrides: Partial<ApplicationReview> = {}): ApplicationReview {
  return {
    jd_text: "",
    status: "ready_for_final_approval",
    edited_terms: [],
    questions: [],
    skipped_reasons: [],
    updated_at: "2026-08-28T09:59:00.000Z",
    ...overrides,
  };
}

function packetAudit(applicationId = PACKET_ID, digest = "a".repeat(64)): PacketAudit {
  return {
    version: "packet_audit_v2",
    status: "passed",
    complete: true,
    degraded: false,
    rejectedCount: 0,
    packet_version: "b".repeat(64),
    audit_digest: digest,
    bindings: {
      ownerSha256: "c".repeat(64),
      applicationId,
      jdSha256: "d".repeat(64),
      specSha256: "e".repeat(64),
      jobContextSha256: "f".repeat(64),
      questionsSha256: "1".repeat(64),
      applicantSnapshotSha256: "2".repeat(64),
      resumeContactEmailSha256: "3".repeat(64),
      applicantEmailSha256: "4".repeat(64),
      pdf: { objectKey: "packets/resume.pdf", sha256: "5".repeat(64), sizeBytes: 512 },
      employerDelivery: {
        version: "employer_delivery_v1",
        mode: "full",
        sha256: "6".repeat(64),
      },
    },
    identities: {
      resume_email: "resume@example.com",
      applicant_email: "applicant@example.com",
    },
    clauses: [],
    editedTerms: [],
    terms: { covered: [], missing: [], edited: [] },
  };
}

function preparedResponse() {
  return {
    application_id: APPLICATION_ID,
    packet_id: PACKET_ID,
    state: "ready_for_review",
    reused: false,
    review: review({
      status: "ready_to_submit",
      packet_audit: packetAudit(),
      questions: [{
        id: "question-1",
        question: "Are you authorized to work here?",
        answer: "Yes",
        kind: "required",
        required: true,
        portal_input_type: "select",
      }],
    }),
  } as const;
}

test("the packet modal authorizes receipt proof only for the exact bound confirmation", () => {
  const state = applicationPacketAuthorityState(confirmed, {
    canonicalApplicationId: APPLICATION_ID,
    packetId: PACKET_ID,
  }, undefined, confirmedSafety);
  assert.equal(state.state, "confirmed");
  if (state.state !== "confirmed") return;
  assert.deepEqual(state.projection.receipt, receipt);
});

test("a confirmed packet without its exact retry fold remains uncertain", () => {
  assert.deepEqual(
    applicationPacketAuthorityState(confirmed, {
      canonicalApplicationId: APPLICATION_ID,
      packetId: PACKET_ID,
    }),
    { state: "uncertain", receiptNeedsRepair: false },
  );
  assert.deepEqual(
    applicationPacketAuthorityState(confirmed, {
      canonicalApplicationId: APPLICATION_ID,
      packetId: PACKET_ID,
    }, undefined, { ...confirmedSafety, confirmedAt: "2026-08-28T10:00:02.000Z" }),
    { state: "uncertain", receiptNeedsRepair: false },
  );
});

test("the packet modal treats only an explicit valid none projection as safely not sent", () => {
  assert.deepEqual(
    applicationPacketAuthorityState(
      { state: "none" },
      { packetId: PACKET_ID },
      undefined,
      { kind: "no_evidence" },
    ),
    { state: "safe_not_sent" },
  );
  for (const retrySafety of [
    undefined,
    { kind: "malformed" },
    { kind: "blocked_unverified", attemptId: ATTEMPT_ID, at: receipt.captured_at, reason: "pressed" },
    confirmedSafety,
  ]) {
    assert.deepEqual(
      applicationPacketAuthorityState(
        { state: "none" },
        { packetId: PACKET_ID },
        undefined,
        retrySafety,
      ),
      { state: "uncertain", receiptNeedsRepair: false },
    );
  }
  assert.deepEqual(applicationPacketAuthorityState(
    undefined,
    { packetId: PACKET_ID },
    undefined,
    { kind: "no_evidence" },
  ), { state: "uncertain", receiptNeedsRepair: false });
});

test("a mutable Sent marker makes an otherwise none packet uncertain", () => {
  const variants: ApplicationReview[] = [
    review({ status: "submitted" }),
    review({ submitted_at: "2026-08-28T10:00:00.000Z" }),
    review({ receipt }),
    review({
      unverified_submission: {
        at: "2026-08-28T10:00:00.000Z",
        cause: "no_confirmation_state",
        resolution: "sent",
      },
    }),
  ];
  for (const mutableReview of variants) {
    assert.deepEqual(
      applicationPacketAuthorityState(
        { state: "none" },
        { packetId: PACKET_ID },
        mutableReview,
        { kind: "no_evidence" },
      ),
      { state: "uncertain", receiptNeedsRepair: false },
    );
  }
  assert.deepEqual(
    applicationPacketAuthorityState(
      { state: "none" },
      { packetId: PACKET_ID },
      review({ status: "needs_attention", attention_reason: "A required answer is missing." }),
      { kind: "no_evidence" },
    ),
    { state: "safe_not_sent" },
  );
});

test("a persisted mutable-Sent quarantine cannot reopen after review normalization", () => {
  assert.deepEqual(
    applicationPacketAuthorityState(
      { state: "none" },
      { packetId: PACKET_ID },
      review({ status: "needs_attention" }),
      { kind: "no_evidence" },
      true,
    ),
    { state: "uncertain", receiptNeedsRepair: false },
  );
});

test("the packet modal keeps unverified and repair-required outcomes uncertain", () => {
  assert.deepEqual(
    applicationPacketAuthorityState({
      state: "unverified",
      attempt_id: ATTEMPT_ID,
      observed_at: "2026-08-28T10:00:00.000Z",
      reason: "pressed",
    }, { packetId: PACKET_ID }),
    { state: "uncertain", receiptNeedsRepair: false },
  );
  assert.deepEqual(
    applicationPacketAuthorityState({
      state: "repair_required",
      attempt_id: ATTEMPT_ID,
      canonical_application_id: APPLICATION_ID,
      packet_id: PACKET_ID,
      reasons: ["receipt_missing"],
    }, { canonicalApplicationId: APPLICATION_ID, packetId: PACKET_ID }),
    { state: "uncertain", receiptNeedsRepair: true },
  );
});

test("the packet modal keeps malformed and identity-mismatched confirmations uncertain", () => {
  assert.deepEqual(
    applicationPacketAuthorityState({
      ...confirmed,
      receipt: { ...receipt, final_url: "http://jobs.example.com/application/complete" },
    }, { canonicalApplicationId: APPLICATION_ID, packetId: PACKET_ID }, undefined, confirmedSafety),
    { state: "uncertain", receiptNeedsRepair: false },
  );
  assert.deepEqual(
    applicationPacketAuthorityState(confirmed, {
      canonicalApplicationId: APPLICATION_ID,
      packetId: OTHER_PACKET_ID,
    }, undefined, confirmedSafety),
    { state: "uncertain", receiptNeedsRepair: false },
  );
});

test("a submission mutation response has to carry the requested application and a valid review shape", () => {
  const exact = { application_id: PACKET_ID, review: review() };
  assert.equal(submissionMutationResponseMatchesApplication(exact, PACKET_ID), true);
  assert.equal(submissionMutationResponseMatchesApplication({ ...exact, application_id: OTHER_PACKET_ID }, PACKET_ID), false);
  assert.equal(submissionMutationResponseMatchesApplication({ application_id: PACKET_ID }, PACKET_ID), false);
  assert.equal(submissionMutationResponseMatchesApplication({ ...exact, review: { ...exact.review, status: "mystery" } }, PACKET_ID), false);
});

test("managed prepare parses only a review whose packet audit binds to the returned packet", () => {
  const exact = preparedResponse();
  assert.deepEqual(managedPrepareAuthorityEnvelopeFromUnknown(exact), exact);
  assert.equal(managedPrepareAuthorityEnvelopeFromUnknown({ ...exact, application_id: "not-an-id" }), null);
  assert.equal(managedPrepareAuthorityEnvelopeFromUnknown({ ...exact, reused: "false" }), null);
  assert.equal(managedPrepareAuthorityEnvelopeFromUnknown({
    ...exact,
    review: { ...exact.review, packet_audit: packetAudit(OTHER_PACKET_ID) },
  }), null);
});

test("managed prepare proves the complete canonical, packet, and stored-review identity chain", () => {
  const exact = managedPrepareAuthorityEnvelopeFromUnknown(preparedResponse());
  assert.ok(exact);
  const canonical = { id: APPLICATION_ID, legacy_generated_resume_id: PACKET_ID };
  const packet = { id: PACKET_ID, spec: { _review: exact.review } };
  assert.equal(managedPrepareAuthorityMatchesPacket(exact, null, canonical, packet), true);
  assert.equal(managedPrepareAuthorityMatchesPacket(exact, OTHER_PACKET_ID, canonical, packet), false);
  assert.equal(managedPrepareAuthorityMatchesPacket(exact, null, {
    ...canonical,
    legacy_generated_resume_id: OTHER_PACKET_ID,
  }, packet), false);
  assert.equal(managedPrepareAuthorityMatchesPacket(exact, null, canonical, {
    ...packet,
    spec: { _review: { ...exact.review, packet_audit: packetAudit(PACKET_ID, "7".repeat(64)) } },
  }), false);
  assert.equal(managedPrepareAuthorityMatchesPacket(exact, null, canonical, {
    ...packet,
    spec: { _review: { ...exact.review, questions: [] } },
  }), false);
});
