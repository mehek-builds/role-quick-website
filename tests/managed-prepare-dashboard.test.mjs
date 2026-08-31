import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/dashboard/applications/page.tsx", "utf8");
const managedStart = source.indexOf("async function prepareMonitoredApplication");
const fillStart = source.indexOf("async function fillApplication");
const createStart = source.indexOf("async function createApplication");
const fill = source.slice(fillStart, managedStart);
const managed = source.slice(managedStart, createStart);

test("a monitored job prepares with the main resume through the dashboard endpoint", () => {
  assert.ok(fillStart >= 0 && managedStart > fillStart, "the managed preparation handler must exist");
  assert.match(managed, /api<unknown>\("\/applications\/managed-prepare"/);
  assert.match(managed, /job_id: jobId, resume_source: "main_resume"/);
  assert.match(fill, /if \(draft\.jobId\) \{\s*await prepareMonitoredApplication\(draft, errorSurface\);\s*return;/);
});

test("managed preparation proves canonical, packet, and stored review identity before overlay", () => {
  const parse = managed.indexOf("managedPrepareAuthorityEnvelopeFromUnknown(rawPrepared)");
  const expectedApplication = managed.indexOf("prepared.application_id !== draft.canonicalApplicationId");
  const loadHistory = managed.indexOf("await Promise.all([");
  const canonical = managed.indexOf("application.id === prepared.application_id");
  const packet = managed.indexOf("packet.id === prepared.packet_id");
  const bind = managed.indexOf("managedPrepareAuthorityMatchesPacket(");
  const overlay = managed.indexOf("const exactReview = reviewWithLists(prepared.review)");

  assert.ok(parse >= 0, "the response must be parsed from unknown wire data");
  assert.ok(expectedApplication > parse, "an existing tracker application must be checked before loading a packet");
  assert.ok(loadHistory > expectedApplication, "a mismatched expected application must fail before follow-up reads");
  assert.ok(canonical > loadHistory && packet > loadHistory, "the exact canonical row and packet must be selected");
  assert.ok(bind > canonical && bind > packet, "all returned identities must enter one authority check");
  assert.ok(overlay > bind, "the server review must not replace stored packet data before identity proof");
  assert.match(managed, /draft\.canonicalApplicationId,[\s\S]*preparedCanonical,[\s\S]*storedPacket/);
});

test("managed preparation never opens or navigates an employer tab", () => {
  assert.doesNotMatch(managed, /window\.open|location\.replace|startFreeFillThroughExtension|ensureCurrentExtensionSession|handoff/);
  assert.match(managed, /openApplication\(preparedPacket, \{ history: "replace" \}\)/);
  assert.match(managed, /moveToScreen\("review"\)/);
});

test("the monitored-job action is named and described as an in-Litos preparation", () => {
  assert.match(source, /managedPrepare \? "Prepare in Litos" : "Open and fill employer form"/);
  assert.match(source, /review the exact packet here before anything can be sent/);
  assert.match(source, /Nothing has been sent/);
});
