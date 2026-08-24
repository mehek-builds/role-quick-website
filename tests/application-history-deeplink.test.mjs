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
      /else if \(requested && \(requestedApplicationIntent === null \|\| requestedApplicationIntent === "apply"\)\)[\s\S]{0,1100}if \(!alreadySelectedLocally \|\| localOpen\.revision !== applicationWorkflowRevision\(requested\)\) \{\s*selectPacket\(requested\);\s*\}/,
      "only apply and historical bare links enter the actionable flow, and fresh server workflow state supersedes a stale local selection",
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
      // The lookup list may be wrapped (withRestoredLinkedPackets) so an envelope's restored
      // legacy id resolves; what the pin protects is that selection still flows through the URL
      // mismatch gate with all three request guards.
      /const selected = selectedPacketForRequest\(\s*(?:withRestoredLinkedPackets\()?packets(?: \?\? \[\])?\)?,\s*selectedId,\s*requestedApplicationId,\s*requestedApplicationIntent,\s*resolvedActionableRequestId,\s*\);/,
      "every actionable screen must derive selection through the URL mismatch gate",
    );
    assert.doesNotMatch(
      applications,
      /const selected = packets\?\.find\(\(packet\) => packet\.id === selectedId\)/,
      "a bare local lookup leaves packet A live while the URL and request already name packet B",
    );
    assert.match(
      applications,
      /setResolvedActionableRequestId\(requestedApplicationId\);\s*setOpeningApplicationId\(null\);[\s\S]{0,500}if \(!alreadySelectedLocally \|\| localOpen\.revision !== applicationWorkflowRevision\(requested\)\) \{\s*selectPacket\(requested\);\s*\}/,
      // NOT `requested.id`: a canonical row can carry its own id, distinct from the legacy id the
      // URL named (Databricks, measured live 2026-08-20: legacy f9a270b7 resolved through canonical
      // 2d5e38f6). Pinning requested.id here made the gate compare requestedApplicationId against a
      // value it could never equal, so the deep link failed closed permanently instead of only
      // during the in-flight window this gate exists for.
      "the gate opens only when the exact requested packet is selected",
    );
  });

  test("a ledger selection writes the same application into local state and the URL", () => {
    assert.match(
      applications,
      /const openApplication = useCallback\(\(packet: GeneratedResume[\s\S]{0,700}setResolvedActionableRequestId\(packet\.id\);\s*selectPacket\(packet\);[\s\S]{0,800}const nextPath = applicationSelectionPath\(window\.location, packet\.id\);[\s\S]{0,800}if \(options\.history === "replace"\) window\.history\.replaceState\(null, "", nextPath\);\s*else window\.history\.pushState\(null, "", nextPath\)/,
      "one callback must bind the selected packet and route synchronously, while normal row opens create usable browser history",
    );
    assert.match(applications, /onClick=\{\(\) => openApplication\(packet\)\}/, "ledger rows must use the URL-bound selection callback");
  });

  test("browser history retires a mismatched canonical workflow before it can paint", () => {
    assert.match(
      applications,
      /useLayoutEffect\(\(\) => \{[\s\S]{0,1000}const canonicalMatchesRequest =[\s\S]{0,900}if \(!canonicalMatchesRequest && !pendingLocalCanonical\) \{[\s\S]{0,300}resetApplicationWorkflow\(\);\s*setOpeningApplicationId\(requestedApplicationId\);/,
      "a canonical-only application has to be route-gated before its Fill and Tailor controls render under another id",
    );
  });

  test("a settled canonical request can resolve through its restored packet id", () => {
    assert.match(
      applications,
      /const \[resolvedActionableRequestId, setResolvedActionableRequestId\] = useState<string \| null>\(null\)/,
    );
    assert.doesNotMatch(
      applications,
      /requestedApplicationId && requestedApplicationId !== selectedId/,
      "raw id equality would reject a canonical request whose actionable packet uses its restored legacy id",
    );
  });
});
