import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../app/dashboard/settings/page.tsx", import.meta.url),
  "utf8",
);

function code(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const settingsCode = code(source);

test("settings edits work eligibility only as country-scoped declarations", () => {
  assert.match(source, /Work authorization by country/);
  assert.match(source, /<CountryEligibilityEditor/);
  assert.match(
    source,
    /eligibilitySeed\(profileRes, onboardingRes\.sponsorship_answer\)/,
  );
  assert.doesNotMatch(source, /Authorized to work\? \(saved reference only\)/);
  assert.doesNotMatch(source, /Need sponsorship\? \(saved reference only\)/);
});

test("saved voluntary self-identification answers are visible and editable", () => {
  for (const field of [
    "gender",
    "transgender_status",
    "sexual_orientation",
    "disability_status",
    "veteran_status",
    "race",
  ]) {
    assert.match(source, new RegExp(`profile\\.eeo_prefs\\?\\.${field}`));
    assert.match(source, new RegExp(`patchRaceAndGender\\("${field}", v\\)`));
  }

  assert.match(source, /const nextPrefs = \{ \.\.\.\(current\.eeo_prefs \?\? \{\}\) \}/);
  assert.match(source, /if \(value\) nextPrefs\[key\] = value/);
  assert.match(source, /else delete nextPrefs\[key\]/);
  assert.match(source, /eeo_prefs: Object\.keys\(nextPrefs\)\.length > 0 \? nextPrefs : null/);

  const stringSelect = source.match(/function StringSelect\([\s\S]*?function EditableBooleanSelect/)?.[0];
  assert.ok(stringSelect, "StringSelect implementation was not found");
  assert.match(stringSelect, /<select/);
  assert.doesNotMatch(stringSelect, /disabled/);
});

test("per-application commitments and applicant attestations remain excluded", () => {
  for (const field of [
    "onsite_commitment",
    "onsite_locations",
    "relocation_willingness",
    "attest_truthful_information",
    "accept_privacy_notices",
  ]) {
    assert.doesNotMatch(
      settingsCode,
      new RegExp(`\\b${field}\\b`),
      `${field} must not be collected or edited as a reusable setting`,
    );
  }
});
