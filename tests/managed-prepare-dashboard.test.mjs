import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/dashboard/applications/page.tsx", "utf8");
const managedStart = source.indexOf("async function prepareMonitoredApplication");
const fillStart = source.indexOf("async function fillApplication");
const readStart = source.indexOf("async function fetchJobDescription");
const createStart = source.indexOf("async function createApplication");
const fill = source.slice(fillStart, managedStart);
const managed = source.slice(managedStart, createStart);
const readJob = source.slice(readStart, fillStart);

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
  assert.match(source, /\{managedPrepare && \([\s\S]*"Prepare in Litos"[\s\S]*\)\}/);
  assert.doesNotMatch(source, /Open and fill employer form|extension fallback/);
  assert.match(source, /review the exact packet here before anything can be sent/);
  assert.match(source, /Nothing has been sent/);
});

test("a manual draft can only continue through internal tailoring", () => {
  assert.match(fill, /if \(draft\.jobId\)[\s\S]*prepareMonitoredApplication/);
  assert.match(fill, /choose Tailor resume first to prepare this application in Litos/);
  assert.doesNotMatch(fill, /window\.open|location\.replace|startFreeFillThroughExtension|\/applications\/[^\s]*\/fill/);
  assert.match(source, /Add or read the job description, then tailor the packet in Litos/);
});

test("Read job accepts only an exact current monitored identity", () => {
  assert.match(readJob, /job_id\?: unknown/);
  assert.match(readJob, /jobReadRevisionRef\.current !== readRevision/);
  assert.match(readJob, /current\.portalUrl\.trim\(\) !== portalUrl/);
  assert.match(readJob, /MONITORED_JOB_ID\.test\(extracted\.job_id\)/);
  assert.equal((readJob.match(/sameIdentityField\(current\.(company|role), extracted\.(company|role)\)/g) ?? []).length, 2);
  assert.match(readJob, /jobId: extractedJobId \?\? current\.jobId/);
  assert.match(source, /next\.company !== newApplication\.company[\s\S]*next\.role !== newApplication\.role[\s\S]*next\.portalUrl !== newApplication\.portalUrl[\s\S]*jobReadRevisionRef\.current \+= 1/);
});
