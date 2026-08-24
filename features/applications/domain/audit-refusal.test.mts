import test from "node:test";
import assert from "node:assert/strict";
import {
  auditRefusalCode,
  historicalPacketAuditStaleMessage,
  packetAuditReviewRecoveryCode,
  packetAuditReviewRecoveryRequired,
  withoutHistoricalPacketAuditStaleAttention,
} from "./audit-refusal.ts";

/* The autopilot jammed on the first un-sendable row: NextMatchCard fires a match once, so a refused
   send left the pill reading "Sending" forever and the same packet still chosen as next. One row
   stopped every other ready application on the account. Measured 2026-08-19 on a Five Rings packet
   answering packet_stale, with "0 applied today" beside it. */

class FakeApiError extends Error {
  data: unknown;
  constructor(message: string, data: unknown) {
    super(message);
    this.data = data;
  }
}

test("an audit refusal is recognised from the body, not the sentence", () => {
  const refusal = new FakeApiError(
    "This application changed after you approved the exact packet Litos prepared, so it was not sent.",
    { error: "...", code: "PACKET_AUDIT_STALE" },
  );
  assert.equal(auditRefusalCode(refusal), "PACKET_AUDIT_STALE");
});

test("every refusal the autopilot cannot clear parks the row", () => {
  for (const code of [
    "PACKET_AUDIT_STALE",
    "PACKET_AUDIT_ACK_REQUIRED",
    "PACKET_AUDIT_REQUIRED",
    "PACKET_PDF_INVALID",
    "PACKET_RESUME_EXPIRED",
  ]) {
    assert.equal(auditRefusalCode(new FakeApiError("refused", { code })), code);
  }
});

test("only stale or missing acknowledgement enters canonical packet review recovery", () => {
  for (const code of ["PACKET_AUDIT_STALE", "PACKET_AUDIT_ACK_REQUIRED"]) {
    assert.equal(packetAuditReviewRecoveryCode(new FakeApiError("wording is irrelevant", { code })), code);
  }
  for (const code of ["PACKET_AUDIT_REQUIRED", "PACKET_PDF_INVALID", "PACKET_RESUME_EXPIRED"]) {
    assert.equal(packetAuditReviewRecoveryCode(new FakeApiError("wording is irrelevant", { code })), null);
  }
});

/* Parking is not the answer to everything. A blank required answer, a quota, a portal that is
   momentarily down: those are the loop's ordinary business and the row must stay in the queue. */
test("an ordinary refusal is not parked", () => {
  assert.equal(auditRefusalCode(new FakeApiError("Sensitive question requires your attention", { code: "SENSITIVE_QUESTION" })), null);
  assert.equal(auditRefusalCode(new FakeApiError("rate limited", { code: "RATE_LIMITED" })), null);
  assert.equal(auditRefusalCode(new FakeApiError("no code at all", { error: "something" })), null);
});

/* The wording must never be load-bearing: this is the exact shape that put `packet_stale` on
   screen, and matching on it is how that mistake repeats. */
test("the message alone never parks a row", () => {
  assert.equal(auditRefusalCode(new FakeApiError("packet_stale", null)), null);
  assert.equal(auditRefusalCode(new FakeApiError("packet_stale", {})), null);
});

test("a non-error rejection does not throw", () => {
  assert.equal(auditRefusalCode(null), null);
  assert.equal(auditRefusalCode(undefined), null);
  assert.equal(auditRefusalCode("packet_stale"), null);
  assert.equal(auditRefusalCode({ data: "not an object" }), null);
});

test("the exact historical stale report enters review recovery without becoming a user task", () => {
  const forbidden = "This application changed after you approved the exact packet Litos prepared, so it was not sent. Open it to review the current one and send from there.";
  const review = {
    attention_reason: forbidden,
    attention_acknowledgements: { old: true },
  };

  assert.equal(historicalPacketAuditStaleMessage(review), true);
  assert.equal(packetAuditReviewRecoveryRequired(review), true);
  assert.deepEqual(withoutHistoricalPacketAuditStaleAttention(review), {
    attention_reason: undefined,
    attention_acknowledgements: undefined,
  });
});

test("a persisted employer-delivery drift failure returns to exact packet review", () => {
  const review = {
    status: "failed",
    submission_error: "The employer-bound packet changed after approval: browser employer-delivery payload changed after packet approval",
  };

  assert.equal(historicalPacketAuditStaleMessage(review), true);
  assert.equal(packetAuditReviewRecoveryRequired(review), true);
  assert.equal(
    historicalPacketAuditStaleMessage({
      submission_error: "The employer page failed after approval: browser employer-delivery payload changed",
    }),
    false,
  );
});

test("historical compatibility is exact and preserves unrelated employer blockers", () => {
  const forbidden = "This application changed after you approved the exact packet Litos prepared, so it was not sent.";
  const employerBlocker = "\"Phone number\" is required and is still empty";
  const combined = {
    attention_reason: `${forbidden}\n${employerBlocker}`,
    attention_acknowledgements: { phone: true },
  };

  assert.deepEqual(withoutHistoricalPacketAuditStaleAttention(combined), {
    attention_reason: employerBlocker,
    attention_acknowledgements: { phone: true },
  });
  assert.equal(historicalPacketAuditStaleMessage("The packet changed after you approved it."), false);
  assert.equal(historicalPacketAuditStaleMessage(new FakeApiError(forbidden, { code: "SENSITIVE_QUESTION" })), false);
  assert.equal(packetAuditReviewRecoveryRequired(new FakeApiError(forbidden, { code: "SENSITIVE_QUESTION" })), false);
  assert.equal(packetAuditReviewRecoveryRequired(new FakeApiError("same words", { code: "SENSITIVE_QUESTION" })), false);
});
