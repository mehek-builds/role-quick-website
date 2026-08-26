import assert from "node:assert/strict";
import test from "node:test";
import {
  postingDistinctionResolutionOutcome,
  postingDistinctionRiskKey,
  postingDistinctionRiskFromUnknown,
  postingDistinctionRisksEqual,
} from "./posting-distinction.ts";

const priorAttemptId = "11111111-1111-4111-8111-111111111111";
const priorPacketId = "22222222-2222-4222-8222-222222222222";
const candidateApplicationId = "33333333-3333-4333-8333-333333333333";
const candidatePacketId = "44444444-4444-4444-8444-444444444444";
const relationId = "55555555-5555-4555-8555-555555555555";
const digest = "a".repeat(64);

const payload = {
  code: "DUPLICATE_RISK_UNIDENTIFIABLE",
  resolution: {
    prior_attempt_id: priorAttemptId,
    prior_application_id: null,
    prior_packet_id: priorPacketId,
    prior_company: "Earlier Co",
    prior_role: "Earlier role",
    prior_portal_url: "https://jobs.example.com/openings/101",
    prior_identity_exact: true,
    candidate_application_id: candidateApplicationId,
    candidate_packet_id: candidatePacketId,
    candidate_company: "Current Co",
    candidate_role: "Current role",
    candidate_portal_url: "https://jobs.example.com/openings/202",
    candidate_identity_version: "posting-distinction-candidate-v1",
    candidate_identity_digest: digest,
  },
};

test("only a complete server-owned exact pair exposes distinction controls", () => {
  const risk = postingDistinctionRiskFromUnknown(payload);
  assert.ok(risk);
  assert.equal(risk.prior_portal_url, "https://jobs.example.com/openings/101");
  assert.equal(risk.candidate_portal_url, "https://jobs.example.com/openings/202");
  for (const patch of [
    { prior_identity_exact: false },
    { prior_attempt_id: null },
    { prior_portal_url: "http://jobs.example.com/openings/101" },
    { candidate_portal_url: "javascript:alert(1)" },
    { candidate_identity_digest: "short" },
  ]) {
    assert.equal(postingDistinctionRiskFromUnknown({
      ...payload,
      resolution: { ...payload.resolution, ...patch },
    }), null);
  }
});

test("clear is accepted only for the exact current candidate snapshot", () => {
  const risk = postingDistinctionRiskFromUnknown(payload)!;
  const response = {
    relation_id: relationId,
    replay: false,
    candidate_application_id: candidateApplicationId,
    candidate_packet_id: candidatePacketId,
    candidate_identity_version: "posting-distinction-candidate-v1" as const,
    candidate_identity_digest: digest,
    duplicate_guard: "clear" as const,
    remaining_risk: null,
  };
  assert.deepEqual(postingDistinctionResolutionOutcome(risk, relationId, response), { kind: "clear" });
  assert.deepEqual(postingDistinctionResolutionOutcome(risk, relationId, {
    ...response,
    candidate_identity_digest: "b".repeat(64),
  }), { kind: "invalid" });
  assert.deepEqual(postingDistinctionResolutionOutcome(risk, relationId, {
    ...response,
    remaining_risk: payload,
  }), { kind: "invalid" });
  assert.deepEqual(postingDistinctionResolutionOutcome(risk, relationId, {
    ...response,
    relation_id: "66666666-6666-4666-8666-666666666666",
  }), { kind: "invalid" });
});

test("a delayed clear compares the complete refusal snapshot", () => {
  const risk = postingDistinctionRiskFromUnknown(payload)!;
  assert.equal(postingDistinctionRisksEqual(risk, { ...risk }), true);
  for (const changed of [
    { ...risk, prior_attempt_id: "66666666-6666-4666-8666-666666666666" },
    { ...risk, prior_portal_url: "https://jobs.example.com/openings/102" },
    { ...risk, candidate_packet_id: "77777777-7777-4777-8777-777777777777" },
    { ...risk, candidate_portal_url: "https://jobs.example.com/openings/203" },
    { ...risk, candidate_identity_digest: "b".repeat(64) },
  ]) assert.equal(postingDistinctionRisksEqual(risk, changed), false);
  assert.notEqual(postingDistinctionRiskKey(risk), postingDistinctionRiskKey({
    ...risk,
    candidate_packet_id: "77777777-7777-4777-8777-777777777777",
  }));
});

test("another exact risk remains visible and strong duplicates remain blocked", () => {
  const risk = postingDistinctionRiskFromUnknown(payload)!;
  const base = {
    relation_id: relationId,
    replay: false,
    candidate_application_id: candidateApplicationId,
    candidate_packet_id: candidatePacketId,
    candidate_identity_version: "posting-distinction-candidate-v1" as const,
    candidate_identity_digest: digest,
  };
  const next = postingDistinctionResolutionOutcome(risk, relationId, {
    ...base,
    duplicate_guard: "unidentifiable",
    remaining_risk: payload,
  });
  assert.equal(next.kind, "next_risk");
  assert.deepEqual(postingDistinctionResolutionOutcome(risk, relationId, {
    ...base,
    duplicate_guard: "unidentifiable",
    remaining_risk: {
      ...payload,
      resolution: {
        ...payload.resolution,
        candidate_application_id: "77777777-7777-4777-8777-777777777777",
      },
    },
  }), { kind: "invalid" });
  assert.deepEqual(postingDistinctionResolutionOutcome(risk, relationId, {
    ...base,
    duplicate_guard: "duplicate",
    remaining_risk: { error: "Not sent: these records are the same exact posting." },
  }), { kind: "blocked", message: "Not sent: these records are the same exact posting." });
});
