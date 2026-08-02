import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression: ranked guest feeds were described as resume-ranked even without a resume.
test("Jobs describes preference-driven ranking accurately", () => {
  const page = readFileSync(new URL("../app/dashboard/jobs/page.tsx", import.meta.url), "utf8");

  assert.match(page, /sorted by your preferences/);
  assert.match(page, /best preference matches/);
  assert.doesNotMatch(page, /sorted by fit to your resume/);
});
