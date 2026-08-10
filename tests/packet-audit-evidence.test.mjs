import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("../components/app/PacketAuditEvidence.tsx", import.meta.url);
const displayDomainUrl = new URL("../features/applications/domain/packet-audit-display.ts", import.meta.url);
const dashboardUrl = new URL("../app/dashboard/applications/page.tsx", import.meta.url);

test("the dashboard renders only exact server-owned JD ranges and clause evidence", async () => {
  const source = await readFile(componentUrl, "utf8");
  const domain = await readFile(displayDomainUrl, "utf8");
  assert.match(domain, /Array\.isArray\(clause\.highlight_terms\)/);
  assert.match(domain, /jdText\.slice\(termStart, termEnd\) !== term\.text/);
  assert.match(domain, /termStart < start \|\| termEnd <= termStart \|\| termEnd > end/);
  assert.match(domain, /term\.clauseIndex !== clauseIndex/);
  assert.match(domain, /term\.tone === "missing" \? term\.evidence !== undefined : !isEvidence\(term\.evidence\)/);
  assert.match(domain, /jdText\.slice\(start, end\) !== clause\.text/);
  assert.match(source, /<TermMark[\s\S]*tone=\{range\.tone\}/);
  assert.match(source, /Resume evidence: \{clause\.evidence\.quote\}/);
  assert.match(source, /PacketAuditBreakdown\(\{ jdText, audit \}/);
  assert.match(source, /if \(!packetAuditDisplayIsExact\(jdText, audit\)\)/);
});

test("unsupported or overlapping audit colors fail closed", async () => {
  const source = await readFile(componentUrl, "utf8");
  const domain = await readFile(displayDomainUrl, "utf8");
  assert.match(domain, /ranges\[index\]\.start < ranges\[index - 1\]\.end/);
  assert.match(source, /The requirement evidence does not match this saved job description/);
  assert.match(domain, /auditValue\.status !== "passed"/);
  assert.match(domain, /auditValue\.rejectedCount !== 0/);
  assert.match(domain, /isHighlightTone\(term\.tone\)/);
  assert.match(domain, /auditValue\.clauses\.length === 0/);
});

test("a poll invalidates local proof when the audit digest or PDF binding changes", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  assert.match(source, /packetAuditIdentityMatches\(current\.response\.packet_audit, result\.review\.packet_audit\)/);
});

test("the browser binds the audit to this application and exact stored PDF", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /audit\.bindings\.applicationId === applicationId/);
  assert.match(source, /response\.pdf\.object_key === binding\.objectKey/);
  assert.match(source, /response\.pdf\.sha256 === binding\.sha256/);
  assert.match(source, /response\.pdf\.size_bytes === binding\.sizeBytes/);
  assert.match(source, /audit\.bindings\.ownerSha256/);
  assert.match(source, /audit\.packet_version/);
  assert.match(source, /audit\.audit_digest/);
});

test("the active audit owns the legend and replaces the live score and gap list", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  assert.match(source, /authoritativeMissingCount = activePacketEvidence[\s\S]{0,240}clause\.verdict === "missing"/);
  assert.match(source, /authoritativeEditedCount = activePacketEvidence[\s\S]{0,300}term\.tone === "edited"/);
  assert.match(source, /activePacketEvidence[\s\S]{0,180}Exact packet checked[\s\S]{0,180}<MatchScore/);
  assert.match(source, /<MatchLegend missingCount=\{authoritativeMissingCount\} editedCount=\{authoritativeEditedCount\}/);
  assert.match(source, /!activePacketEvidence && matchResult && matchResult\.missing\.length > 0/);
});
