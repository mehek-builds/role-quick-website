import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../app/dashboard/settings/page.tsx", import.meta.url),
  "utf8",
);

test("settings edits work eligibility only as country-scoped declarations", () => {
  assert.match(source, /Work authorization by country/);
  assert.match(source, /<CountryEligibilityEditor/);
  assert.match(
    source,
    /eligibilitySeed\(profileRes, onboardingRes\.sponsorship_answer\)/,
  );
  assert.doesNotMatch(source, /Authorized to work\? \(saved reference only\)/);
  assert.doesNotMatch(source, /Need sponsorship\? \(saved reference only\)/);
  // Self-identification preferences remain applicant-owned reference data.
  assert.match(source, /function StringSelect[\s\S]*?<select[\s\S]*?disabled/);
});

test("settings never promises to answer or auto-decline applicant-owned questions", () => {
  assert.doesNotMatch(source, /Litos uses these exact answers/);
  assert.doesNotMatch(source, /it will choose decline/);
  assert.doesNotMatch(source, /or declined when possible/);
  assert.match(source, /Litos does not use them to answer a form/);
  assert.match(source, /never inferred, automatically declined, or reused/);
});
