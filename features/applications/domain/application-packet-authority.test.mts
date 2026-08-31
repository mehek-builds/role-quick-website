import assert from "node:assert/strict";
import test from "node:test";
import { applicationPacketAuthorityState } from "./application-packet-authority.ts";
import type { ApplicationReview } from "../../../lib/api.ts";

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
