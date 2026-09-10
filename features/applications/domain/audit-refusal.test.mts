import test from "node:test";
import assert from "node:assert/strict";
import {
  auditRefusalCode,
  historicalPacketAuditStaleMessage,
  packetAuditRefusalIsRetryable,
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
    "COURSEWORK_PACKET_REBUILT",
  ]) {
    assert.equal(auditRefusalCode(new FakeApiError("refused", { code })), code);
  }
});

test("stale, missing acknowledgement, or a coursework rebuild enters canonical packet review recovery", () => {
  for (const code of ["PACKET_AUDIT_STALE", "PACKET_AUDIT_ACK_REQUIRED", "COURSEWORK_PACKET_REBUILT"]) {
    assert.equal(packetAuditReviewRecoveryCode(new FakeApiError("wording is irrelevant", { code })), code);
  }
  for (const code of ["PACKET_AUDIT_REQUIRED", "PACKET_PDF_INVALID", "PACKET_RESUME_EXPIRED"]) {
    assert.equal(packetAuditReviewRecoveryCode(new FakeApiError("wording is irrelevant", { code })), null);
  }
});

/* THE COURSEWORK REBUILD 409 IS A RECOVERY SIGNAL, NOT A DEAD BANNER.
 *
 * Measured 2026-09-10 on a Neuralink packet (application 4c42ea73) built before the account's CS
 * resume was re-uploaded: its education block printed finance coursework the current uploaded resume
 * no longer lists. The send guard rebuilt the coursework in place and answered 409
 * COURSEWORK_PACKET_REBUILT, but that code was in neither set, so recoverPacketAuditReview never
 * fired: the client showed the sentence as a refusal on the restart screen and every subsequent
 * "Try again" bounced back there without re-fetching the repaired packet. The rebuild persisted a
 * clean PDF that nobody could reach. This is the regression the two additions above prevent, held
 * here as its own case so a future edit to either set has to look at it. */
test("a coursework-rebuild 409 reaches manual review recovery", () => {
  const rebuilt = new FakeApiError(
    "Litos rebuilt this resume from the coursework on your current uploaded resume. Review the refreshed packet before filling the company form.",
    { code: "COURSEWORK_PACKET_REBUILT", application_id: "4c42ea73" },
  );
  assert.equal(auditRefusalCode(rebuilt), "COURSEWORK_PACKET_REBUILT");
  assert.equal(packetAuditReviewRecoveryCode(rebuilt), "COURSEWORK_PACKET_REBUILT");
  assert.equal(packetAuditReviewRecoveryRequired(rebuilt), true);
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
    attention_reason: "Litos could not finish this application, and it stopped before anything was sent.",
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

/* THE RETRY BOOLEAN ON A REFUSED PACKET AUDIT.
 *
 * Both directions are a real failure the /start review screen has already shipped once: a retry
 * control over a refusal that answers identically forever is a broken button, and no retry over the
 * one 409 that asks for another call is a dead end with no way out. */
test("a 409 carrying PACKET_AUDIT_STALE is the one the route asks to be retried", () => {
  assert.equal(
    packetAuditRefusalIsRetryable({ status: 409, data: { code: "PACKET_AUDIT_STALE" } }),
    true,
  );
});

test("a 409 with no code is terminal: the packet has moved past auditing", () => {
  assert.equal(packetAuditRefusalIsRetryable({ status: 409, data: {} }), false);
  assert.equal(packetAuditRefusalIsRetryable({ status: 409, data: null }), false);
  assert.equal(packetAuditRefusalIsRetryable({ status: 409 }), false);
});

test("a 409 naming a different code stays terminal", () => {
  assert.equal(packetAuditRefusalIsRetryable({ status: 409, data: { code: "job_not_available" } }), false);
});

test("everything that is not a 409 can change on the next request", () => {
  assert.equal(packetAuditRefusalIsRetryable({ status: 500, data: {} }), true);
  assert.equal(packetAuditRefusalIsRetryable({ status: 429, data: {} }), true);
  assert.equal(packetAuditRefusalIsRetryable({ status: 422, data: { code: "PACKET_AUDIT_FAILED" } }), true);
  assert.equal(packetAuditRefusalIsRetryable(new Error("network")), true);
  assert.equal(packetAuditRefusalIsRetryable(null), true);
});
