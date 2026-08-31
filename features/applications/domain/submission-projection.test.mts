import assert from "node:assert/strict";
import test from "node:test";
import type { ApplicationReview, AuthoritativeSubmissionProjection } from "../../../lib/api.ts";
import {
  authoritativeSubmissionProjectionFromUnknown,
  confirmedProjectionForCanonical,
  confirmedProjectionForPacket,
  reviewForSubmissionProjection,
  sameConfirmedSubmissionProjection,
  submissionProjectionIdentity,
  submissionProjectionIsConfirmed,
  submissionProjectionNeedsRepair,
} from "./submission-projection.ts";

const ATTEMPT_ID = "cb071b9b-6d53-44ec-89f5-19a06dc64a01";
const APPLICATION_ID = "cb071b9b-6d53-44ec-89f5-19a06dc64a02";
const PACKET_ID = "cb071b9b-6d53-44ec-89f5-19a06dc64a03";

function review(status: ApplicationReview["status"] = "submitted"): ApplicationReview {
  return {
    jd_text: "",
    status,
    edited_terms: [],
    questions: [],
    skipped_reasons: [],
    updated_at: "2026-08-28T08:00:02.000Z",
    submitted_at: "2026-08-28T08:00:01.000Z",
    receipt: {
      confirmation_text: "Mutable receipt",
      final_url: "https://example.test/confirmation",
      captured_at: "2026-08-28T08:00:01.000Z",
    },
  };
}

const confirmed: AuthoritativeSubmissionProjection = {
  state: "confirmed",
  attempt_id: ATTEMPT_ID,
  canonical_application_id: APPLICATION_ID,
  packet_id: PACKET_ID,
  submitted_at: "2026-08-28T09:00:01.000Z",
  receipt: {
    confirmation_text: "Application received",
    final_url: "https://boards.greenhouse.io/acme/jobs/1234567/confirmation",
    captured_at: "2026-08-28T09:00:01.000Z",
    source: "managed_browser",
  },
  source: "managed_browser",
  tracker_stage: "applied",
};

test("confirmed replacement equality includes provenance, stage, and every receipt field", () => {
  assert.equal(sameConfirmedSubmissionProjection(
    confirmed,
    { ...confirmed, receipt: { ...confirmed.receipt } },
  ), true);
  assert.equal(sameConfirmedSubmissionProjection(
    confirmed,
    { ...confirmed, source: "direct_browser" },
  ), false);
  assert.equal(sameConfirmedSubmissionProjection(
    confirmed,
    { ...confirmed, tracker_stage: "interview" },
  ), false);
  assert.equal(sameConfirmedSubmissionProjection(
    confirmed,
    { ...confirmed, receipt: { ...confirmed.receipt, confirmation_text: "Different receipt" } },
  ), false);
});

test("only an exact confirmed projection can display Sent", () => {
  assert.equal(submissionProjectionIsConfirmed(confirmed, { packetId: PACKET_ID }), true);
  assert.equal(submissionProjectionIsConfirmed(confirmed, {
    canonicalApplicationId: APPLICATION_ID,
    packetId: PACKET_ID,
    attemptId: ATTEMPT_ID,
  }), true);
  assert.equal(submissionProjectionIsConfirmed(confirmed, {
    packetId: "cb071b9b-6d53-44ec-89f5-19a06dc64a04",
  }), false);
  assert.equal(submissionProjectionIsConfirmed({ state: "none" }, { packetId: PACKET_ID }), false);
  assert.equal(submissionProjectionNeedsRepair({
    state: "repair_required",
    packet_id: PACKET_ID,
    reasons: ["receipt_missing"],
  }, { packetId: PACKET_ID }), true);
});

test("malformed and misbound confirmed labels fail closed", () => {
  for (const projection of [
    { ...confirmed, attempt_id: "" },
    { ...confirmed, packet_id: "cb071b9b-6d53-44ec-89f5-19a06dc64a04" },
    { ...confirmed, submitted_at: "not-a-time" },
    { ...confirmed, submitted_at: "2026-08-28" },
    { ...confirmed, receipt: { ...confirmed.receipt, final_url: "javascript:alert(1)" } },
    { ...confirmed, receipt: { ...confirmed.receipt, final_url: "http://localhost/confirmation" } },
    { ...confirmed, receipt: { ...confirmed.receipt, confirmation_text: "" } },
    { ...confirmed, source: "unsupported_email", receipt: { ...confirmed.receipt, source: "attended_handoff" } },
  ]) {
    assert.equal(submissionProjectionIsConfirmed(
      projection as AuthoritativeSubmissionProjection,
      { packetId: PACKET_ID },
    ), false);
  }
  assert.equal(authoritativeSubmissionProjectionFromUnknown({ state: "confirmed" }), null);
  assert.equal(authoritativeSubmissionProjectionFromUnknown({
    state: "repair_required",
    reasons: ["invented_repair_reason"],
  }), null);
  assert.match(
    submissionProjectionIdentity(
      { ...confirmed, packet_id: "cb071b9b-6d53-44ec-89f5-19a06dc64a04" },
      { packetId: PACKET_ID },
    ),
    /^misbound:/,
  );
});

test("the receipt source matrix matches the backend authority contract", () => {
  assert.equal(submissionProjectionIsConfirmed({
    ...confirmed,
    source: "direct_browser",
    receipt: { ...confirmed.receipt, source: "managed_browser" },
  }, { packetId: PACKET_ID }), true);
  assert.equal(submissionProjectionIsConfirmed({
    ...confirmed,
    source: "direct_browser",
    receipt: { ...confirmed.receipt, source: "direct_browser" },
  }, { packetId: PACKET_ID }), false);
  assert.equal(submissionProjectionIsConfirmed({
    ...confirmed,
    source: "legacy_backfill",
    receipt: { ...confirmed.receipt, source: "direct_browser" },
  }, { packetId: PACKET_ID }), false, "legacy backfill excludes the direct-browser receipt label");
  assert.equal(submissionProjectionIsConfirmed({
    ...confirmed,
    source: "legacy_backfill",
    receipt: { ...confirmed.receipt, source: "managed_browser" },
  }, { packetId: PACKET_ID }), true);
  assert.equal(submissionProjectionIsConfirmed({
    ...confirmed,
    source: "attended_handoff",
    receipt: { ...confirmed.receipt, source: undefined },
  }, { packetId: PACKET_ID }), false, "a packet-backed applicant receipt names its attended source");
  assert.equal(submissionProjectionIsConfirmed({
    ...confirmed,
    packet_id: null,
    source: "attended_handoff",
    receipt: { ...confirmed.receipt, source: undefined },
  }, { canonicalApplicationId: APPLICATION_ID, packetId: null }), true,
  "only a canonical-only derived applicant receipt may omit its receipt source");
});

test("packet and canonical binders require exact row, retry, stage, and receipt time identity", () => {
  const retrySafety = {
    kind: "blocked_confirmed",
    attemptId: ATTEMPT_ID,
    confirmedAt: confirmed.receipt.captured_at,
  };
  assert.equal(confirmedProjectionForPacket(confirmed, {
    packetId: PACKET_ID,
    canonicalApplicationId: APPLICATION_ID,
    retrySafety,
    trackerStage: "applied",
  }), confirmed);
  assert.equal(confirmedProjectionForCanonical(confirmed, {
    canonicalApplicationId: APPLICATION_ID,
    legacyPacketId: PACKET_ID,
    retrySafety,
    trackerStage: "applied",
  }), confirmed);
  assert.equal(confirmedProjectionForPacket(confirmed, {
    packetId: "cb071b9b-6d53-44ec-89f5-19a06dc64a04",
    retrySafety,
  }), null);
  assert.equal(confirmedProjectionForPacket(confirmed, {
    packetId: PACKET_ID,
    retrySafety: { ...retrySafety, confirmedAt: "2026-08-28T09:00:02.000Z" },
  }), null);
});

test("confirmed display bytes come from authority rather than mutable review JSON", () => {
  const projected = reviewForSubmissionProjection(review(), confirmed, { packetId: PACKET_ID });
  assert.equal(projected.status, "submitted");
  assert.equal(projected.submitted_at, confirmed.submitted_at);
  assert.equal(projected.submission_claim_id, confirmed.attempt_id);
  assert.equal(projected.attention_reason, undefined);
  assert.equal(projected.submission_error, undefined);
  assert.deepEqual(projected.receipt, {
    confirmation_text: confirmed.receipt.confirmation_text,
    final_url: confirmed.receipt.final_url,
    captured_at: confirmed.receipt.captured_at,
  });
});

test("a confirmed label for another packet strips mutable Sent state", () => {
  const projected = reviewForSubmissionProjection(review(), confirmed, {
    packetId: "cb071b9b-6d53-44ec-89f5-19a06dc64a04",
  });
  assert.equal(projected.status, "needs_attention");
  assert.equal(projected.submitted_at, undefined);
  assert.equal(projected.receipt, undefined);
});

test("a confirmed projection for another identity blocks every operational status", () => {
  const statuses: ApplicationReview["status"][] = [
    "resume_ready", "questions_ready", "ready_to_submit", "submit_requested", "preparing",
    "filling", "needs_attention", "ready_for_final_approval", "awaiting_security_code",
    "submitting", "submission_claimed", "failed",
  ];
  for (const status of statuses) {
    const operational = { ...review(status), submitted_at: undefined, receipt: undefined };
    for (const expected of [
      { packetId: "cb071b9b-6d53-44ec-89f5-19a06dc64a04" },
      { packetId: PACKET_ID, canonicalApplicationId: "cb071b9b-6d53-44ec-89f5-19a06dc64a04" },
      { packetId: PACKET_ID, attemptId: "cb071b9b-6d53-44ec-89f5-19a06dc64a04" },
    ]) {
      const projected = reviewForSubmissionProjection(operational, confirmed, expected);
      assert.equal(projected.status, "needs_attention", `${status} must not expose an employer action`);
      assert.equal(projected.submitted_at, undefined);
      assert.equal(projected.receipt, undefined);
    }
  }
});

test("unverified and repair projections move operational ready states to needs attention", () => {
  const ready = {
    ...review("ready_to_submit"),
    submitted_at: undefined,
    receipt: undefined,
  };
  for (const projection of [
    {
      state: "unverified" as const,
      attempt_id: ATTEMPT_ID,
      observed_at: "2026-08-28T09:00:01.000Z",
      reason: "pressed" as const,
    },
    {
      state: "repair_required" as const,
      attempt_id: ATTEMPT_ID,
      reasons: ["receipt_missing"],
    },
  ]) {
    assert.equal(reviewForSubmissionProjection(ready, projection, { packetId: PACKET_ID }).status, "needs_attention");
  }
});

test("projection normalization removes contradictory mutable resolution markers", () => {
  const torn = {
    ...review(),
    attention_reason: "stale failure",
    submission_error: "stale error",
    submission_claim_id: "wrong-attempt",
    submission_claimed_at: "2026-08-28T08:00:30.000Z",
    submission_run_id: "stale-run",
    unverified_submission: {
      at: "2026-08-28T08:00:00.000Z",
      cause: "no_confirmation_state" as const,
      resolution: "not_sent" as const,
      resolved_at: "2026-08-28T08:01:00.000Z",
    },
  };
  const projected = reviewForSubmissionProjection(torn, confirmed, { packetId: PACKET_ID });
  assert.equal(projected.submission_claim_id, confirmed.attempt_id);
  assert.equal(projected.submission_claimed_at, undefined);
  assert.equal(projected.submission_run_id, undefined);
  assert.equal(projected.unverified_submission?.resolution, undefined);
  assert.equal(projected.unverified_submission?.resolved_at, undefined);
  assert.equal(projected.attention_reason, undefined);
  assert.equal(projected.submission_error, undefined);

  const rawSentResolution = reviewForSubmissionProjection({
    ...review("needs_attention"),
    unverified_submission: {
      at: "2026-08-28T08:00:00.000Z",
      cause: "no_confirmation_state",
      resolution: "sent",
      resolved_at: "2026-08-28T08:01:00.000Z",
    },
  }, { state: "none" }, { packetId: PACKET_ID });
  assert.equal(rawSentResolution.unverified_submission?.resolution, undefined);
  assert.equal(rawSentResolution.submitted_at, undefined);
  assert.equal(rawSentResolution.receipt, undefined);
});

test("status-only and repair-required rows never display Sent or a mutable receipt", () => {
  for (const projection of [
    undefined,
    { state: "none" } as const,
    { state: "repair_required", reasons: ["receipt_missing"] } as const,
    { state: "unverified", attempt_id: "attempt-a", observed_at: "2026-08-28T09:00:01.000Z", reason: "pressed" } as const,
  ]) {
    const projected = reviewForSubmissionProjection(review(), projection, { packetId: PACKET_ID });
    assert.equal(projected.status, "needs_attention");
    assert.equal(projected.submitted_at, undefined);
    assert.equal(projected.receipt, undefined);
  }
});

test("every isolated mutable positive marker blocks every operational status without confirmed authority", () => {
  const statuses: ApplicationReview["status"][] = [
    "resume_ready",
    "questions_ready",
    "ready_to_submit",
    "submit_requested",
    "preparing",
    "filling",
    "needs_attention",
    "ready_for_final_approval",
    "awaiting_security_code",
    "submitting",
    "submission_claimed",
    "failed",
  ];
  const projections: unknown[] = [
    undefined,
    { state: "none" },
    { state: "unknown" },
    { ...confirmed, packet_id: "cb071b9b-6d53-44ec-89f5-19a06dc64a04" },
    { state: "unverified", attempt_id: ATTEMPT_ID, observed_at: "2026-08-28T09:00:01.000Z", reason: "pressed" },
    { state: "repair_required", attempt_id: ATTEMPT_ID, packet_id: PACKET_ID, reasons: ["receipt_missing"] },
  ];
  const markers: Array<(value: ApplicationReview) => ApplicationReview> = [
    (value) => ({ ...value, submitted_at: "2026-08-28T09:00:01.000Z" }),
    (value) => ({
      ...value,
      receipt: {
        confirmation_text: confirmed.receipt.confirmation_text,
        final_url: confirmed.receipt.final_url,
        captured_at: confirmed.receipt.captured_at,
      },
    }),
    (value) => ({
      ...value,
      unverified_submission: {
        at: "2026-08-28T09:00:00.000Z",
        cause: "no_confirmation_state",
        resolution: "sent",
        resolved_at: "2026-08-28T09:00:01.000Z",
      },
    }),
  ];
  for (const status of statuses) {
    for (const projection of projections) {
      for (const marker of markers) {
        const raw = marker({ ...review(status), submitted_at: undefined, receipt: undefined });
        const projected = reviewForSubmissionProjection(
          raw,
          projection as AuthoritativeSubmissionProjection | undefined,
          { packetId: PACKET_ID },
        );
        assert.equal(projected.status, "needs_attention", `${status} with a positive marker must block`);
        assert.equal(projected.submitted_at, undefined);
        assert.equal(projected.receipt, undefined);
        assert.notEqual(projected.unverified_submission?.resolution, "sent");
      }
    }
  }
});

test("nonterminal operational review state is preserved", () => {
  const original = {
    ...review("ready_to_submit"),
    submitted_at: undefined,
    receipt: undefined,
  };
  assert.equal(reviewForSubmissionProjection(original, { state: "none" }, { packetId: PACKET_ID }), original);
});
