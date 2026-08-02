import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression: ISSUE-004, Home described preference fit as resume-word coverage
// Found by /qa on 2026-08-02
// Report: .gstack/qa-reports/qa-report-trylitos-com-2026-08-02.md
test("Home gives preference scores an accurate accessible label", () => {
  const home = readFileSync("app/dashboard/page.tsx", "utf8");
  const scoreRing = readFileSync("components/app/ui.tsx", "utf8");

  assert.equal(home.match(/metricLabel="preference fit for this job"/g)?.length, 2);
  assert.match(scoreRing, /aria-label={`\$\{pct\} out of 100 \$\{metricLabel\}`}/);
});
