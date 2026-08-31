import assert from "node:assert/strict";
import test from "node:test";

import {
  attendedBoundaryAuthorityEnvelopeFromUnknown,
  quarantinedSubmissionAuthority,
  submissionAuthorityCollectionRevisionFromUnknown,
  submissionAuthorityEnvelopeFromUnknown,
  submissionAuthorityMatchesCollectionRevision,
} from "./submission-authority-envelope.ts";

const packetId = "11111111-1111-4111-8111-111111111111";
const canonicalApplicationId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const leaseId = "44444444-4444-4444-8444-444444444444";
const activationId = "55555555-5555-4555-8555-555555555555";
const observedAt = "2026-08-28T08:00:00.000Z";
const expiresAt = "2026-08-28T08:10:00.000Z";
const capability = {
  version: "attended_handoff_v1",
  kind: "manual_handoff",
  capability_sha256: "a".repeat(64),
  url_sha256: "b".repeat(64),
} as const;

const unverifiedEnvelope = () => {
  const retrySafety = {
    kind: "blocked_unverified",
    attemptId,
    at: observedAt,
    reason: "boundary_authorized",
    leaseId,
    expiresAt,
  } as const;
  const projection = {
    state: "unverified",
    attempt_id: attemptId,
    observed_at: observedAt,
    reason: "boundary_authorized",
  } as const;
  return {
  application_id: packetId,
  manual_attempt_id: attemptId,
  boundary_lease_id: leaseId,
  boundary_activation_id: activationId,
  manual_handoff_resume_available: true,
  attended_handoff_capability: capability,
  review: { submission_claim_id: attemptId },
  retry_safety: retrySafety,
  submission_projection: projection,
  submission_authority: {
    schema_version: "submission-authority-v1",
    revision: "12",
    state: "boundary_authorized",
    application_id: packetId,
    packet_id: packetId,
    projection,
    retry_safety: retrySafety,
    attempt_id: attemptId,
    observed_at: observedAt,
    lease_id: leaseId,
    expires_at: expiresAt,
    activation_id: activationId,
    capability,
  },
};
};

test("accepts one exact packet authority envelope", () => {
  const parsed = submissionAuthorityEnvelopeFromUnknown(unverifiedEnvelope(), {
    applicationId: packetId,
    packetId,
    attemptId,
  });
  assert.equal(parsed?.schemaVersion, "submission-authority-v1");
  assert.equal(parsed?.revision, "12");
  assert.equal(parsed?.state, "boundary_authorized");
  assert.deepEqual(parsed?.projection, unverifiedEnvelope().submission_projection);
  assert.deepEqual(parsed?.retrySafety, unverifiedEnvelope().retry_safety);
});

test("accepts an exact canonical confirmation and rejects a different canonical target", () => {
  const confirmedAt = "2026-08-28T08:02:00.000Z";
  const response = {
    application_id: canonicalApplicationId,
    retry_safety: {
      kind: "blocked_confirmed",
      attemptId,
      confirmedAt,
    },
    submission_projection: {
      state: "confirmed",
      attempt_id: attemptId,
      canonical_application_id: canonicalApplicationId,
      packet_id: packetId,
      submitted_at: observedAt,
      receipt: {
        confirmation_text: "Application received",
        final_url: "https://jobs.example.test/applications/received",
        captured_at: confirmedAt,
        source: "attended_handoff",
      },
      source: "attended_handoff",
      tracker_stage: "applied",
    },
  };
  const exactResponse = {
    ...response,
    submission_authority: {
      schema_version: "submission-authority-v1",
      revision: "0",
      state: "confirmed",
      application_id: canonicalApplicationId,
      packet_id: packetId,
      projection: response.submission_projection,
      retry_safety: response.retry_safety,
    },
  };
  assert.ok(submissionAuthorityEnvelopeFromUnknown(exactResponse, {
    applicationId: canonicalApplicationId,
    canonicalApplicationId,
    packetId,
  }));
  assert.equal(submissionAuthorityEnvelopeFromUnknown(exactResponse, {
    applicationId: canonicalApplicationId,
    canonicalApplicationId: packetId,
    packetId,
  }), null);
});

test("canonical alias responses bind the route alias separately from the live survivor", () => {
  const requestedAliasId = "66666666-6666-4666-8666-666666666666";
  const confirmedAt = "2026-08-28T08:02:00.000Z";
  const projection = {
    state: "confirmed",
    attempt_id: attemptId,
    canonical_application_id: canonicalApplicationId,
    packet_id: packetId,
    submitted_at: observedAt,
    receipt: {
      confirmation_text: "Application received",
      final_url: "https://jobs.example.test/applications/received",
      captured_at: confirmedAt,
      source: "attended_handoff",
    },
    source: "attended_handoff",
    tracker_stage: "applied",
  } as const;
  const retrySafety = { kind: "blocked_confirmed", attemptId, confirmedAt } as const;
  const authority = {
    schema_version: "submission-authority-v1",
    revision: "8",
    state: "confirmed",
    application_id: canonicalApplicationId,
    packet_id: packetId,
    projection,
    retry_safety: retrySafety,
  } as const;
  const response = {
    requested_application_id: requestedAliasId,
    application_id: requestedAliasId,
    canonical_application_id: canonicalApplicationId,
    submission_authority: authority,
    submission_projection: projection,
    retry_safety: retrySafety,
  };
  const context = {
    applicationId: canonicalApplicationId,
    requestedApplicationId: requestedAliasId,
    canonicalApplicationId,
    packetId,
    attemptId,
  };
  assert.ok(submissionAuthorityEnvelopeFromUnknown(response, context));
  assert.equal(submissionAuthorityEnvelopeFromUnknown({
    ...response,
    application_id: canonicalApplicationId,
  }, context), null);
  assert.equal(submissionAuthorityEnvelopeFromUnknown({
    ...response,
    canonical_application_id: requestedAliasId,
  }, context), null);
});

test("passive collection revisions are canonical and must match every nested item", () => {
  const envelope = unverifiedEnvelope();
  assert.equal(submissionAuthorityCollectionRevisionFromUnknown({
    schema_version: "submission-authority-v1",
    submission_authority_revision: "12",
    build_revision: "deploy-sha",
  }), "12");
  assert.equal(submissionAuthorityCollectionRevisionFromUnknown({
    schema_version: "submission-authority-v1",
    submission_authority_revision: "01",
  }), null);
  assert.equal(submissionAuthorityMatchesCollectionRevision(envelope, "12"), true);
  assert.equal(submissionAuthorityMatchesCollectionRevision(envelope, "11"), false);
});

test("rejects incomplete and cross-attempt failure authority instead of mixing siblings", () => {
  const exact = unverifiedEnvelope();
  for (const candidate of [
    { ...exact, submission_authority: undefined },
    { ...exact, submission_projection: undefined },
    { ...exact, retry_safety: undefined },
    { ...exact, application_id: canonicalApplicationId },
    {
      ...exact,
      submission_authority: {
        ...exact.submission_authority,
        projection: {
          ...exact.submission_projection,
          attempt_id: canonicalApplicationId,
        },
      },
    },
    {
      ...exact,
      submission_authority: {
        ...exact.submission_authority,
        retry_safety: {
          ...exact.retry_safety,
          at: "2026-08-28T08:00:01.000Z",
        },
      },
    },
  ]) {
    assert.equal(submissionAuthorityEnvelopeFromUnknown(candidate, {
      applicationId: packetId,
      packetId,
      attemptId,
    }), null);
  }
});

test("quarantine binds repair to the requested packet and canonical target", () => {
  assert.deepEqual(quarantinedSubmissionAuthority({
    applicationId: packetId,
    packetId,
    canonicalApplicationId,
    attemptId,
  }), {
    projection: {
      state: "repair_required",
      attempt_id: attemptId,
      canonical_application_id: canonicalApplicationId,
      packet_id: packetId,
      reasons: ["canonical_projection_incomplete"],
    },
    retrySafety: null,
  });
});

test("attended capability requires exact projection, retry time, lease, activation, and claim", () => {
  assert.ok(attendedBoundaryAuthorityEnvelopeFromUnknown(
    unverifiedEnvelope(),
    packetId,
    Date.parse("2026-08-28T08:01:00.000Z"),
  ));
  const exact = unverifiedEnvelope();
  for (const candidate of [
    { ...exact, submission_authority: undefined },
    { ...exact, boundary_activation_id: "not-a-uuid" },
    { ...exact, review: { submission_claim_id: canonicalApplicationId } },
    {
      ...exact,
      submission_authority: {
        ...exact.submission_authority,
        observed_at: "2026-08-28T08:00:01.000Z",
      },
    },
    {
      ...exact,
      submission_authority: {
        ...exact.submission_authority,
        projection: {
          ...exact.submission_projection,
          reason: "opened",
        },
      },
    },
    {
      ...exact,
      submission_authority: {
        ...exact.submission_authority,
        lease_id: canonicalApplicationId,
      },
    },
  ]) {
    assert.equal(attendedBoundaryAuthorityEnvelopeFromUnknown(
      candidate,
      packetId,
      Date.parse("2026-08-28T08:01:00.000Z"),
    ), null);
  }
  assert.equal(attendedBoundaryAuthorityEnvelopeFromUnknown(
    exact,
    packetId,
    Date.parse("2026-08-28T08:10:00.000Z"),
  ), null);
});

test("rejects top-level-only, malformed revision, and compatibility sibling disagreement", () => {
  const exact = unverifiedEnvelope();
  const { submission_authority: _discarded, ...topLevelOnly } = exact;
  assert.equal(submissionAuthorityEnvelopeFromUnknown(topLevelOnly, {
    applicationId: packetId,
    packetId,
    attemptId,
  }), null);
  for (const revision of [
    "",
    "00",
    "01",
    "+1",
    "1.0",
    " 1",
    "9223372036854775808",
    "10000000000000000000",
    1,
  ]) {
    assert.equal(submissionAuthorityEnvelopeFromUnknown({
      ...exact,
      submission_authority: { ...exact.submission_authority, revision },
    }, {
      applicationId: packetId,
      packetId,
      attemptId,
    }), null);
  }
  assert.equal(submissionAuthorityEnvelopeFromUnknown({
    ...exact,
    retry_safety: { ...exact.retry_safety, at: "2026-08-28T08:00:01.000Z" },
  }, {
    applicationId: packetId,
    packetId,
    attemptId,
  }), null);
  assert.equal(submissionAuthorityEnvelopeFromUnknown({
    ...exact,
    resolved_attempt_retry_safety: exact.retry_safety,
    retry_safety: { ...exact.retry_safety, at: "2026-08-28T08:00:01.000Z" },
  }, {
    applicationId: packetId,
    packetId,
    attemptId,
  }), null, "both compatibility retry siblings must match the nested fold");
});

test("repair authority may carry a null retry fold while retaining exact context", () => {
  const projection = {
    state: "repair_required",
    attempt_id: attemptId,
    canonical_application_id: canonicalApplicationId,
    packet_id: packetId,
    reasons: ["receipt_missing"],
  } as const;
  const response = {
    application_id: packetId,
    submission_projection: projection,
    retry_safety: null,
    submission_authority: {
      schema_version: "submission-authority-v1",
      revision: "9223372036854775807",
      state: "repair_required",
      application_id: packetId,
      packet_id: packetId,
      projection,
      retry_safety: null,
    },
  };
  const parsed = submissionAuthorityEnvelopeFromUnknown(response, {
    applicationId: packetId,
    canonicalApplicationId,
    packetId,
    attemptId,
  });
  assert.equal(parsed?.state, "repair_required");
  assert.equal(parsed?.retrySafety, null);
});

test("boundary authority requires byte-matching top-level capability and tuple", () => {
  const exact = unverifiedEnvelope();
  for (const candidate of [
    { ...exact, manual_attempt_id: canonicalApplicationId },
    { ...exact, boundary_lease_id: canonicalApplicationId },
    { ...exact, boundary_activation_id: canonicalApplicationId },
    { ...exact, manual_handoff_resume_available: false },
    {
      ...exact,
      attended_handoff_capability: { ...capability, url_sha256: "c".repeat(64) },
    },
  ]) {
    assert.equal(attendedBoundaryAuthorityEnvelopeFromUnknown(
      candidate,
      packetId,
      Date.parse("2026-08-28T08:01:00.000Z"),
    ), null);
  }
});
