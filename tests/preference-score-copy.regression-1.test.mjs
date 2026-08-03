import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression: ISSUE-004, Home described its ring with the wrong metric's words.
// Found by /qa on 2026-08-02
// Report: .gstack/qa-reports/qa-report-trylitos-com-2026-08-02.md
//
// The original defect was a ring showing PREFERENCE FIT under a label describing resume-word
// coverage. ISSUE-014 then moved the ring itself: it now shows resume-to-JD coverage, so the label
// that is accurate is the other one. The invariant this test has always held is unchanged - the
// accessible name must describe the metric the ring is actually drawing - so it is the expected
// string that moves, not the rule.
test("Home's ring is labelled with the metric it actually shows", () => {
  const home = readFileSync("app/dashboard/page.tsx", "utf8");
  const scoreRing = readFileSync("components/app/ui.tsx", "utf8");

  assert.match(home, /of what this job asks for is on your resume/);
  assert.doesNotMatch(home, /metricLabel="preference fit for this job"/);
  // The denominator travels with it, so the number can be interrogated by a screen reader too.
  assert.match(home, /\$\{match\.matched\} of the \$\{match\.total\} requirements Litos counted/);
  // ISSUE-023's qualifier: term_count is capped, so a bare "requirements" claims the posting's
  // whole list. A screen reader user gets only this string.
  assert.doesNotMatch(home, /requirements this job posting lists/);
  assert.match(scoreRing, /aria-label={`\$\{pct\} out of 100 \$\{metricLabel\}`}/);
});
