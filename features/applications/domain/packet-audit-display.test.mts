import assert from "node:assert/strict";
import test from "node:test";

import { exactPacketAuditRanges, packetAuditIdentityMatches } from "./packet-audit-display.ts";

const jdText = "Build reliable APIs. Improve deployment safety.";
const evidence = { path: "/experience/0/bullets/0", quote: "Built reliable APIs", sha256: "a".repeat(64) };

function validAudit(): Record<string, unknown> {
  return {
    version: "packet_audit_v1",
    status: "passed",
    complete: true,
    degraded: false,
    rejectedCount: 0,
    clauses: [
      {
        text: "Build reliable APIs.",
        start: 0,
        end: 20,
        verdict: "covered",
        evidence,
        highlight_terms: [
          { text: "reliable APIs", key: "reliable apis", start: 6, end: 19, clauseIndex: 0, tone: "covered", evidence },
        ],
      },
      {
        text: "Improve deployment safety.",
        start: 21,
        end: jdText.length,
        verdict: "missing",
        highlight_terms: [
          { text: "deployment safety", key: "deployment safety", start: 29, end: 46, clauseIndex: 1, tone: "missing" },
        ],
      },
    ],
  };
}

test("returns only exact, enumerated server highlight ranges", () => {
  assert.deepEqual(exactPacketAuditRanges(jdText, validAudit())?.map((term) => term.tone), ["covered", "missing"]);
});

test("rejects an unknown highlight tone instead of treating it as covered", () => {
  const audit = validAudit();
  const clauses = audit.clauses as Array<Record<string, unknown>>;
  const terms = clauses[0].highlight_terms as Array<Record<string, unknown>>;
  terms[0].tone = "purple";
  assert.equal(exactPacketAuditRanges(jdText, audit), null);
});

test("rejects malformed highlight maps without throwing", () => {
  const audit = validAudit();
  const clauses = audit.clauses as Array<Record<string, unknown>>;
  clauses[0].highlight_terms = null;
  assert.doesNotThrow(() => exactPacketAuditRanges(jdText, audit));
  assert.equal(exactPacketAuditRanges(jdText, audit), null);
});

test("rejects empty, unknown-verdict, and overlapping clauses", () => {
  const empty = validAudit();
  empty.clauses = [];
  assert.equal(exactPacketAuditRanges(jdText, empty), null);

  const unknown = validAudit();
  (unknown.clauses as Array<Record<string, unknown>>)[0].verdict = "partial";
  assert.equal(exactPacketAuditRanges(jdText, unknown), null);

  const overlapping = validAudit();
  const clauses = overlapping.clauses as Array<Record<string, unknown>>;
  clauses[1] = { ...clauses[1], text: jdText.slice(19), start: 19 };
  assert.equal(exactPacketAuditRanges(jdText, overlapping), null);
});

test("retains local render proof only for the exact audit and PDF identity", () => {
  const identity = {
    packet_version: "b".repeat(64),
    audit_digest: "c".repeat(64),
    bindings: { pdf: { objectKey: "resumes/exact.pdf", sha256: "d".repeat(64), sizeBytes: 42 } },
  };
  assert.equal(packetAuditIdentityMatches(identity, structuredClone(identity)), true);
  for (const mutate of [
    (copy: typeof identity) => { copy.packet_version = "e".repeat(64); },
    (copy: typeof identity) => { copy.audit_digest = "e".repeat(64); },
    (copy: typeof identity) => { copy.bindings.pdf.objectKey = "resumes/other.pdf"; },
    (copy: typeof identity) => { copy.bindings.pdf.sha256 = "e".repeat(64); },
    (copy: typeof identity) => { copy.bindings.pdf.sizeBytes = 43; },
  ]) {
    const changed = structuredClone(identity);
    mutate(changed);
    assert.equal(packetAuditIdentityMatches(identity, changed), false);
  }
  assert.equal(packetAuditIdentityMatches(identity, null), false);
});
