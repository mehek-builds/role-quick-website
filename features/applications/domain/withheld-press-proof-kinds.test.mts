import assert from "node:assert/strict";
import test from "node:test";
import { submissionRetrySafetyAllowsRetry, submissionRetrySafetyFromUnknown } from "./submission-state.ts";
import { applicationPacketAuthorityState } from "./application-packet-authority.ts";
import { employerActionRefusalMessage } from "./employer-action-refusal.ts";

/* THE VERDICT THE BROWSER THREW AWAY.
 *
 * Measured live 2026-09-09 on Neuralink packet 65586e22. The server published a clean verdict that
 * nothing had been sent:
 *
 *   {"state":"none","retry_safety":{"kind":"safe_not_sent",
 *    "attemptId":"aa06654c-9b39-487a-b862-ec27b5d839db",
 *    "proofKind":"required_field_gate_proven_not_pressed",
 *    "resolvedAt":"2026-09-08T20:47:08.221Z"}}
 *
 * retryProofKind did not list that kind, so the strict validator discarded the whole envelope,
 * retry_safety became undefined, the authority state fell to `uncertain`, and the packet screen
 * refused the send with "Litos cannot start another employer attempt until the exact prior
 * submission evidence is verified" - about evidence that WAS verified, and that no control could
 * clear. volley-backend #1055 added the kind and the ledger's CHECK constraint learned it; this
 * list was the copy left behind.
 */

const ATTEMPT = "aa06654c-9b39-487a-b862-ec27b5d839db";
const RESOLVED = "2026-09-08T20:47:08.221Z";
const safety = (proofKind: string) => ({ kind: "safe_not_sent", attemptId: ATTEMPT, proofKind, resolvedAt: RESOLVED });

const WITHHELD_PRESS_KINDS = [
  "required_field_gate_proven_not_pressed",
  "run_progress_proven_not_pressed",
  "plan_position_proven_not_pressed",
] as const;

test("the withheld-press proofs are read, not discarded", () => {
  for (const kind of WITHHELD_PRESS_KINDS) {
    assert.notEqual(submissionRetrySafetyFromUnknown(safety(kind)), null, kind);
    assert.equal(submissionRetrySafetyAllowsRetry(safety(kind)), true, kind);
  }
});

test("the kinds that already worked still work", () => {
  for (const kind of [
    "typed_pre_click_stop",
    "applicant_checked_not_sent",
    "applicant_checked_all_possible_destinations_not_sent",
    "employer_rejected_not_filed",
    "employer_verification_pending_not_filed",
    "provider_definitive_rejection",
    "extension_cancelled_before_press",
  ]) {
    assert.equal(submissionRetrySafetyAllowsRetry(safety(kind)), true, kind);
  }
});

test("an unknown proof kind is still refused", () => {
  /* The allow-list is the point. A kind this build cannot name is an envelope it cannot vouch for,
     and the safe reading of that is still "do not send". */
  for (const kind of ["", "something_new", "REQUIRED_FIELD_GATE_PROVEN_NOT_PRESSED", "not_sent"]) {
    assert.equal(submissionRetrySafetyFromUnknown(safety(kind)), null, JSON.stringify(kind));
    assert.equal(submissionRetrySafetyAllowsRetry(safety(kind)), false, JSON.stringify(kind));
  }
  // And the rest of the envelope is still checked exactly as before.
  assert.equal(submissionRetrySafetyFromUnknown({ ...safety("required_field_gate_proven_not_pressed"), attemptId: "not-a-uuid" }), null);
  assert.equal(submissionRetrySafetyFromUnknown({ ...safety("required_field_gate_proven_not_pressed"), resolvedAt: "yesterday" }), null);
  assert.equal(submissionRetrySafetyFromUnknown({ ...safety("required_field_gate_proven_not_pressed"), extra: 1 }), null);
});

test("end to end: the packet the server cleared is no longer refused", () => {
  /* The exact envelope from the live packet, through the two rules the screen actually asks. */
  const identity = { canonicalApplicationId: null, packetId: "65586e22-f98b-4e29-b8ef-6c2686a07868" };
  const authority = applicationPacketAuthorityState(
    { state: "none" },
    identity as never,
    { status: "needs_attention" } as never,
    safety("required_field_gate_proven_not_pressed"),
  );
  assert.equal(authority.state, "safe_not_sent");
  assert.equal(employerActionRefusalMessage(authority.state, "needs_attention"), null);
});

test("and a packet with no such proof is still refused, with the right sentence", () => {
  const identity = { canonicalApplicationId: null, packetId: "65586e22-f98b-4e29-b8ef-6c2686a07868" };
  const authority = applicationPacketAuthorityState(
    { state: "none" },
    identity as never,
    { status: "needs_attention" } as never,
    { kind: "blocked_unverified", attemptId: ATTEMPT, at: RESOLVED, reason: "opened" },
  );
  assert.equal(authority.state, "uncertain");
  assert.match(
    employerActionRefusalMessage(authority.state, "needs_attention") ?? "",
    /cannot start another employer attempt/,
  );
});
