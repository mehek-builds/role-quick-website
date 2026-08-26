import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/app/PostingDistinctionResolution.tsx", "utf8");
const dashboard = readFileSync("app/dashboard/applications/page.tsx", "utf8");

test("posting distinction requires an explicit exact-pair attestation", () => {
  assert.match(source, /I opened both exact posting pages and confirmed they are different jobs/);
  assert.match(source, /disabled=\{!confirmed \|\| busy\}/);
  assert.match(source, /confirmed_distinct_postings: true/);
  assert.match(source, /prior_portal_url/);
  assert.match(source, /candidate_portal_url/);
});

test("saving a distinction never calls a send or retry route", () => {
  assert.match(source, /resolvePostingDistinction/);
  assert.doesNotMatch(source, /submit-request|submission\/approve|extension-start|onApprove|onRetry/);
  assert.match(source, /does not retry or submit the application/);
  assert.match(source, /press Send application again separately/);
});

test("a success response must echo the exact relation id generated for that request", () => {
  assert.match(source, /const relationId = window\.crypto\.randomUUID\(\)/);
  assert.match(source, /relation_id: relationId/);
  assert.match(source, /const requestedRisk = currentRisk/);
  assert.match(source, /postingDistinctionResolutionOutcome\(requestedRisk, relationId, result\)/);
  assert.match(source, /onCleared\(requestedRisk\)/);
  assert.match(source, /onRiskChanged\(requestedRisk, outcome\.risk\)/);
});

test("clear display and chained risks commit only against the exact current refusal", () => {
  assert.doesNotMatch(source, /setCleared|if \(cleared\)/);
  assert.match(dashboard, /postingDistinctionRisksEqual\(current\.postingDistinctionRisk, resolvedRisk\)/);
  assert.match(dashboard, /postingDistinctionRisksEqual\(current\.risk, resolvedRisk\)/);
  assert.match(dashboard, /postingDistinctionRisksEqual\(current\.risk, previousRisk\)/);
  assert.match(dashboard, /key=\{postingDistinctionRiskKey\(state\.risk\)\}/);
  assert.match(dashboard, /key=\{postingDistinctionRiskKey\(sendRefusal\.postingDistinctionRisk\)\}/);
});

test("fill refusal publication is fenced by request, selection, and composer identity generations", () => {
  const fill = dashboard.slice(
    dashboard.indexOf("async function fillApplication("),
    dashboard.indexOf("async function resolveCanonicalManualSubmission("),
  );
  assert.match(fill, /const requestGeneration = \+\+fillRequestGenerationRef\.current/);
  assert.match(fill, /const contextGeneration = fillContextGenerationRef\.current/);
  assert.match(fill, /selectedIdRef\.current === requestedPacketId/);
  assert.match(fill, /canonicalSelectedIdRef\.current === requestedCanonicalApplicationId/);
  assert.match(fill, /if \(!requestMayPublish\(\)\) \{[\s\S]{0,120}companyTab\?\.close\(\)/);
  assert.match(dashboard, /function visibleFillPostingDistinction\([\s\S]{0,650}state\.risk\.candidate_packet_id !== packetId/);
  assert.match(dashboard, /const replaceNewApplicationDraft = useCallback[\s\S]{0,320}fillContextGenerationRef\.current \+= 1/);
  assert.match(dashboard, /if \(restored\) replaceNewApplicationDraft\(restored\)/);
  assert.match(dashboard, /replaceNewApplicationDraft\(draft\)/);
  assert.doesNotMatch(dashboard, /setNewApplication\(draft\)/);
});
