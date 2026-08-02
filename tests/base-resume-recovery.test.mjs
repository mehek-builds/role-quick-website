import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../components/start/BaseResumeStep.tsx", import.meta.url),
  "utf8",
);

test("the compare phase shows the build error and a retry control", () => {
  const compareStart = source.indexOf('{phase === "compare" && (');
  const detailStart = source.indexOf('{phase === "detail" && (', compareStart);
  assert.ok(compareStart >= 0 && detailStart > compareStart, "could not isolate compare UI");

  const compareUi = source.slice(compareStart, detailStart);
  assert.match(compareUi, /error && <ErrorNote message=\{error\}/);
  assert.match(compareUi, /error \? \([\s\S]*onClick=\{run\}>Try again/);
});
