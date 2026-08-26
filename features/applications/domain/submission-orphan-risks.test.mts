import assert from "node:assert/strict";
import test from "node:test";
import {
  submissionOrphanResolutionControlsAvailable,
  submissionOrphanResolutionMatches,
  submissionOrphanRisksFromUnknown,
  withoutResolvedSubmissionOrphanRisk,
} from "./submission-orphan-risks.ts";

const one = {
  attempt_id: "cb071b9b-6d53-44ec-89f5-19a06dc64a03",
  packet_id: "cb071b9b-6d53-44ec-89f5-19a06dc64a02",
  company: "Example",
  role: "Engineer",
  observed_at: "2026-08-24T12:00:00.000Z",
  reason: "pressed" as const,
  scope: "posting" as const,
  blocks_sends: true,
  resolution_available: true,
};
const two = {
  ...one,
  attempt_id: "cb071b9b-6d53-44ec-89f5-19a06dc64a04",
  packet_id: "cb071b9b-6d53-44ec-89f5-19a06dc64a05",
};

test("malformed risk history fails closed instead of becoming an empty list", () => {
  assert.equal(submissionOrphanRisksFromUnknown({}), null);
  assert.equal(submissionOrphanRisksFromUnknown({ risks: [{ ...one, attempt_id: "not-a-uuid" }] }), null);
  assert.deepEqual(submissionOrphanRisksFromUnknown({ risks: [one, two] }), [one, two]);
});

test("a stale resolution response cannot remove a different risk", () => {
  assert.equal(submissionOrphanResolutionMatches(one.attempt_id, true, { attempt_id: two.attempt_id }), false);
  assert.equal(submissionOrphanResolutionMatches(one.attempt_id, true, {
    attempt_id: one.attempt_id,
    resolution: "not_found",
    retry_safety: { kind: "safe_not_sent", attemptId: one.attempt_id, proofKind: "applicant_checked_not_sent" },
  }), false);
  assert.equal(submissionOrphanResolutionMatches(one.attempt_id, true, {
    attempt_id: one.attempt_id,
    resolution: "found",
    retry_safety: { kind: "blocked_confirmed", attemptId: two.attempt_id },
  }), false);
  assert.equal(submissionOrphanResolutionMatches(one.attempt_id, true, {
    attempt_id: one.attempt_id,
    resolution: "found",
    retry_safety: { kind: "blocked_confirmed", attemptId: one.attempt_id },
  }), true);
  assert.equal(submissionOrphanResolutionMatches(one.attempt_id, false, {
    attempt_id: one.attempt_id,
    resolution: "not_found",
    retry_safety: {
      kind: "safe_not_sent",
      attemptId: one.attempt_id,
      proofKind: "applicant_checked_all_possible_destinations_not_sent",
    },
  }), true);
  assert.deepEqual(withoutResolvedSubmissionOrphanRisk([one, two], one.attempt_id), [two]);
  assert.deepEqual(withoutResolvedSubmissionOrphanRisk([one, two], "cb071b9b-6d53-44ec-89f5-19a06dc64aff"), [one, two]);
});

test("identityless invalid-sequence history never renders resolution controls without server authorization", () => {
  assert.equal(submissionOrphanResolutionControlsAvailable({
    ...one,
    reason: "invalid_sequence",
    scope: "user",
    resolution_available: false,
  }), false);
  assert.equal(submissionOrphanResolutionControlsAvailable({
    ...one,
    reason: "invalid_sequence",
    scope: "user",
    resolution_available: true,
  }), true);
  assert.equal(submissionOrphanResolutionControlsAvailable({
    ...one,
    reason: "attributed_confirmed",
    scope: "user",
    resolution_available: true,
  }), false);
});
