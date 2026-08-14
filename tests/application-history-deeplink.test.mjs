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
      /reviewable\.find\(\(packet\) => packet\.id === requestedApplicationId\)/,
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
});
