import assert from "node:assert/strict";
import test from "node:test";

import { packetAuditAcknowledgementAccepted } from "./packet-audit-acknowledgement.ts";

test("accepts the exact backend acknowledgement response", () => {
  assert.equal(packetAuditAcknowledgementAccepted({ acknowledged: true }), true);
});

test("rejects the superseded nested response and every non-acknowledgement", () => {
  assert.equal(packetAuditAcknowledgementAccepted({ packet_audit_acknowledgement: { acknowledged: true } }), false);
  assert.equal(packetAuditAcknowledgementAccepted({ acknowledged: false }), false);
  assert.equal(packetAuditAcknowledgementAccepted(null), false);
});
