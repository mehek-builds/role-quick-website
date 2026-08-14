import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const source = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
const applications = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("an application deep link loads the exact packet", () => {
  test("the requested packet comes from the router's reactive query", () => {
    assert.match(
      applications,
      /const requestedApplicationId = searchParams\.get\("application"\);/,
      "the packet id must update when the App Router changes only the query",
    );
    assert.doesNotMatch(
      applications,
      /requestedApplicationId = new URLSearchParams\(window\.location\.search\)/,
      "window.location can still hold the previous query during an App Router transition",
    );
    assert.match(
      applications,
      /const requestedApplicationIntent = searchParams\.get\("intent"\);/,
      "the action must update when the App Router changes only the intent",
    );
  });

  test("a query-only packet change cancels the old load and starts history for the new id", () => {
    const historyPathAt = applications.indexOf("const historyPath = requestedApplicationId");
    assert.notEqual(historyPathAt, -1, "expected the exact-packet history request");
    const effectStart = applications.lastIndexOf("useEffect(() => {", historyPathAt);
    const nextEffect = applications.indexOf("\n  useEffect(() => {", historyPathAt);
    assert.notEqual(effectStart, -1, "expected history loading to live in an effect");
    assert.notEqual(nextEffect, -1, "expected a boundary after the history-loading effect");
    const historyEffect = applications.slice(effectStart, nextEffect);

    assert.match(
      historyEffect,
      /`\/resume\/history\?application=\$\{encodeURIComponent\(requestedApplicationId\)\}`/,
      "the request path must carry the current router value",
    );
    assert.match(
      historyEffect,
      /api<\{ resumes: GeneratedResume\[\] \}>\(historyPath\)/,
    );
    assert.match(
      historyEffect,
      /const requestedPacketId = requestedCanonicalApplication\?\.id \?\? requestedApplicationId;[\s\S]*reviewable\.find\(\(packet\) => packet\.id === requestedPacketId\)/,
      "a linked packet resolves through its canonical visible id after the histories merge",
    );
    assert.match(
      historyEffect,
      /return \(\) => \{\s*cancelled = true;/,
      "packet B must retire packet A's in-flight response before it can select stale data",
    );
    assert.match(
      historyEffect,
      /}, \[(?=[^\]]*requestedApplicationId)(?=[^\]]*selectPacket)[^\]]*\]\);/,
      "changing only ?application= must rerun this effect",
    );
  });

  test("detail and apply remain separate, non-mutating and actionable intents", () => {
    const historyPathAt = applications.indexOf("const historyPath = requestedApplicationId");
    const effectStart = applications.lastIndexOf("useEffect(() => {", historyPathAt);
    const nextEffect = applications.indexOf("\n  useEffect(() => {", historyPathAt);
    const historyEffect = applications.slice(effectStart, nextEffect);

    assert.match(
      historyEffect,
      /requestedApplicationIntent === "detail"[\s\S]{0,520}setRevisitingId\(requested\.id\)/,
      "detail opens the read-only packet viewer",
    );
    assert.match(
      historyEffect,
      /else if \(requested && \(requestedApplicationIntent === null \|\| requestedApplicationIntent === "apply"\)\)[\s\S]{0,180}selectPacket\(requested\)/,
      "only apply and historical bare links enter the actionable flow through the normal packet selection gate",
    );
    assert.match(
      historyEffect,
      /else \{\s*setResolvedActionableRequestId\(null\);/,
      "an unknown intent must leave the requested packet non-actionable",
    );
    assert.match(
      historyEffect,
      /}, \[(?=[^\]]*requestedApplicationId)(?=[^\]]*requestedApplicationIntent)(?=[^\]]*selectPacket)[^\]]*\]\);/,
      "changing only ?intent= must rerun this effect",
    );
    assert.doesNotMatch(historyEffect, /submit-request|submission\/approve/, "opening either intent must not send anything");
  });

  test("a query-only packet change hides the prior packet before the new history resolves", () => {
    assert.match(
      applications,
      /const selected = selectedPacketForRequest\(\s*packets,\s*selectedId,\s*requestedApplicationId,\s*requestedApplicationIntent,\s*resolvedActionableRequestId,\s*\);/,
      "every actionable screen must derive selection through the URL mismatch gate",
    );
    assert.doesNotMatch(
      applications,
      /const selected = packets\?\.find\(\(packet\) => packet\.id === selectedId\)/,
      "a bare local lookup leaves packet A live while the URL and request already name packet B",
    );
    assert.match(
      applications,
      /setResolvedActionableRequestId\(requested\.id\);\s*selectPacket\(requested\);/,
      "the gate opens only when the exact requested packet is selected",
    );
  });

  test("a settled direct link does not permanently pin ledger selection to its URL", () => {
    assert.match(
      applications,
      /const \[resolvedActionableRequestId, setResolvedActionableRequestId\] = useState<string \| null>\(null\)/,
    );
    assert.doesNotMatch(
      applications,
      /requestedApplicationId && requestedApplicationId !== selectedId/,
      "strict permanent id equality would make every later ledger row disappear",
    );
  });
});
