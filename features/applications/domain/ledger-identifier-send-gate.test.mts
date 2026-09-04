import assert from "node:assert/strict";
import { test } from "node:test";

import { authoritativeSubmissionProjectionFromUnknown } from "./submission-projection.ts";
import {
  submissionRetrySafetyAllowsRetry,
  submissionRetrySafetyFromUnknown,
} from "./submission-state.ts";
import { submissionAuthorityEnvelopeFromUnknown } from "./submission-authority-envelope.ts";
import { applicationPacketAuthorityState } from "./application-packet-authority.ts";
import {
  UNVERIFIED_EVIDENCE_REFUSAL,
  employerActionRefusalMessage,
} from "./employer-action-refusal.ts";

/* A BLOCK THAT CITES EVIDENCE NOBODY HAS.
 *
 * Measured live 2026-09-04 on mehekmandal05@gmail.com: pressing "Approve packet and fill form" on
 * Mercari packet 4a586b1c refused with "Litos cannot start another employer attempt until the exact
 * prior submission evidence is verified", while all three packets for that posting recorded no
 * attempt, no claim and an empty alias inbox. The refusal is raised entirely client-side, in
 * prepareApplication, which returns before issuing any request - which is exactly why the server
 * rows show nothing.
 *
 * The identifiers below are the shape the ledger actually mints. `attempt_id` is a Postgres `uuid`
 * column that appendSubmissionAttemptEvent never version-checks, so its version and variant nibbles
 * are uniformly distributed. The backend's own census of this account (submissionAuthorityEnvelope
 * .ts:65-88) found version nibbles 1,1,1,3,4,4,4,4,5 with variants 8,8,9,a,a,b,b,b,b among the ids
 * that PASSED, and 162 of 163 refusals landing on `projection.attempt_id` alone.
 */
const PACKET = "4a586b1c-14b3-4dd4-ac59-0cdaf27fb197";
/** version nibble 7 - outside the old `[1-5]` projection rule. */
const V7_ATTEMPT = "a3578398-c4cc-714d-9a44-c7943d8effb9";
/** variant nibble 4 - outside the old `[89ab]` rule shared by both old regexes. */
const VARIANT4_ATTEMPT = "a3578398-c4cc-414d-4a44-c7943d8effb9";
const OBSERVED_AT = "2026-08-28T08:02:00.000Z";

test("a ledger attempt id outside the RFC version nibble still parses", () => {
  const projection = authoritativeSubmissionProjectionFromUnknown({
    state: "unverified",
    attempt_id: V7_ATTEMPT,
    observed_at: OBSERVED_AT,
    reason: "pressed",
  });
  assert.equal(projection?.state, "unverified");
});

test("a ledger attempt id outside the RFC variant nibble still parses", () => {
  const projection = authoritativeSubmissionProjectionFromUnknown({
    state: "unverified",
    attempt_id: VARIANT4_ATTEMPT,
    observed_at: OBSERVED_AT,
    reason: "pressed",
  });
  assert.equal(projection?.state, "unverified");
});

test("a retry verdict carrying such an id parses instead of being discarded", () => {
  const safety = submissionRetrySafetyFromUnknown({
    kind: "blocked_unverified",
    attemptId: VARIANT4_ATTEMPT,
    at: OBSERVED_AT,
    reason: "pressed",
  });
  assert.equal(safety?.kind, "blocked_unverified");
  assert.equal(submissionRetrySafetyAllowsRetry(safety), false);
});

/* THE DEFECT ITSELF, end to end through the real parsers.
 *
 * A held attempt whose only defect is an unnameable internal id. Before the fix the envelope was
 * discarded, the packet was quarantined, and the send gate refused with the "prior submission
 * evidence" sentence - the same sentence, and the same dead end, as a packet with no history at
 * all. The two cases must be distinguishable, and BOTH must still refuse. */
test("an unverified envelope with a ledger-shaped id is READ, and still refuses the send", () => {
  const authority = {
    schema_version: "submission-authority-v1",
    revision: "1624",
    state: "unverified",
    application_id: PACKET,
    packet_id: PACKET,
    projection: {
      state: "unverified",
      attempt_id: V7_ATTEMPT,
      observed_at: OBSERVED_AT,
      reason: "pressed",
    },
    retry_safety: {
      kind: "blocked_unverified",
      attemptId: V7_ATTEMPT,
      at: OBSERVED_AT,
      reason: "pressed",
    },
  };
  const parsed = submissionAuthorityEnvelopeFromUnknown(
    { application_id: PACKET, submission_authority: authority },
    { applicationId: PACKET, packetId: PACKET },
  );
  assert.notEqual(parsed, null, "the envelope must parse rather than be quarantined");
  assert.equal(parsed?.projection.state, "unverified");

  const state = applicationPacketAuthorityState(
    parsed?.projection ?? null,
    { packetId: PACKET },
    undefined,
    parsed?.retrySafety ?? null,
    parsed === null,
  );
  // SAFETY: real attempt evidence must keep refusing. This is the case the guard exists for.
  assert.equal(state.state, "uncertain");
  assert.equal(
    employerActionRefusalMessage(state.state, "needs_attention"),
    UNVERIFIED_EVIDENCE_REFUSAL,
  );
});

/* THE OTHER HALF: a packet the ledger proves was never attempted must be sendable. This is the
 * verdict submissionAuthorityEnvelopeForUnattemptedPacket already treats as proof that nothing
 * reached an employer, and it is what packet 4a586b1c actually carries. */
test("a no_evidence packet is authorized, not refused", () => {
  const authority = {
    schema_version: "submission-authority-v1",
    revision: "1624",
    state: "none",
    application_id: PACKET,
    packet_id: PACKET,
    projection: { state: "none" },
    retry_safety: { kind: "no_evidence" },
  };
  const parsed = submissionAuthorityEnvelopeFromUnknown(
    { application_id: PACKET, submission_authority: authority },
    { applicationId: PACKET, packetId: PACKET },
  );
  const state = applicationPacketAuthorityState(
    parsed?.projection ?? null,
    { packetId: PACKET },
    undefined,
    parsed?.retrySafety ?? null,
    parsed === null,
  );
  assert.equal(state.state, "safe_not_sent");
  assert.equal(employerActionRefusalMessage(state.state, "ready_to_submit"), null);
});

/* A `safe_not_sent` proof whose attempt id has a non-RFC nibble is the shape that reaches the send
 * gate after repairExpiredAttendedHandoffClaim releases a phantom attempt. It is STRONGER evidence
 * of safety than no evidence, and it must not be thrown away for its id's alphabet. */
test("a safe_not_sent proof with a ledger-shaped id authorizes the send", () => {
  const authority = {
    schema_version: "submission-authority-v1",
    revision: "1624",
    state: "none",
    application_id: PACKET,
    packet_id: PACKET,
    projection: { state: "none" },
    retry_safety: {
      kind: "safe_not_sent",
      attemptId: VARIANT4_ATTEMPT,
      proofKind: "typed_pre_click_stop",
      resolvedAt: OBSERVED_AT,
    },
  };
  const parsed = submissionAuthorityEnvelopeFromUnknown(
    { application_id: PACKET, submission_authority: authority },
    { applicationId: PACKET, packetId: PACKET },
  );
  assert.notEqual(parsed, null);
  const state = applicationPacketAuthorityState(
    parsed?.projection ?? null,
    { packetId: PACKET },
    undefined,
    parsed?.retrySafety ?? null,
    parsed === null,
  );
  assert.equal(state.state, "safe_not_sent");
  assert.equal(employerActionRefusalMessage(state.state, "ready_to_submit"), null);
});

/* SAFETY, pinned as its own case: a CONFIRMED projection must never become sendable, whatever its
 * identifiers look like. Relaxing an id alphabet must not touch the receipt contract. */
test("a confirmed projection is never sendable", () => {
  const state = applicationPacketAuthorityState(
    {
      state: "confirmed",
      attempt_id: V7_ATTEMPT,
      canonical_application_id: "c9ea060c-ec99-469a-8d19-4eabac66bd89",
      packet_id: PACKET,
      submitted_at: "2026-08-28T08:00:00.000Z",
      source: "managed_browser",
      tracker_stage: "applied",
      receipt: {
        confirmation_text: "Thank you for applying.",
        final_url: "https://job-boards.greenhouse.io/example/jobs/1/application_confirmation",
        captured_at: OBSERVED_AT,
        source: "managed_browser",
      },
    },
    { packetId: PACKET },
    undefined,
    { kind: "blocked_confirmed", attemptId: V7_ATTEMPT, confirmedAt: OBSERVED_AT },
    false,
  );
  assert.notEqual(state.state, "safe_not_sent");
  assert.equal(
    employerActionRefusalMessage(state.state, "needs_attention"),
    UNVERIFIED_EVIDENCE_REFUSAL,
  );
});

/* A malformed identifier is still refused. Widening the nibbles is not the same as removing the
 * check, and a value that is not a 128-bit identifier at all must stay quarantined. */
test("a malformed identifier is still quarantined", () => {
  assert.equal(
    authoritativeSubmissionProjectionFromUnknown({
      state: "unverified",
      attempt_id: "not-a-uuid",
      observed_at: OBSERVED_AT,
      reason: "pressed",
    }),
    null,
  );
  assert.equal(
    submissionRetrySafetyFromUnknown({
      kind: "safe_not_sent",
      attemptId: "a3578398c4cc414d4a44c7943d8effb9",
      proofKind: "typed_pre_click_stop",
      resolvedAt: OBSERVED_AT,
    }),
    null,
  );
});
