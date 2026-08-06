import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression: the footer must name the score family that actually ordered the server payload.
test("Jobs describes resume-match and preference fallback ranking accurately", () => {
  const page = readFileSync(new URL("../app/dashboard/jobs/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function hasServerMatchScores/);
  assert.match(page, /const rankedByResume = useMemo\(\(\) => hasServerMatchScores\(jobs\), \[jobs\]\)/);
  assert.match(page, /sorted by resume match/);
  assert.match(page, /best resume matches/);
  assert.match(page, /sorted by your preferences/);
  assert.match(page, /best preference matches/);
  assert.doesNotMatch(page, /sorted by fit to your resume/);
});
