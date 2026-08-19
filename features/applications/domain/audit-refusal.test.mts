import test from "node:test";
import assert from "node:assert/strict";
import { auditRefusalCode } from "./audit-refusal.ts";

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
