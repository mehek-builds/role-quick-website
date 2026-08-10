import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const editor = fs.readFileSync(new URL("../components/app/CountryEligibilityEditor.tsx", import.meta.url), "utf8");
const onboarding = fs.readFileSync(new URL("../components/start/SponsorshipStep.tsx", import.meta.url), "utf8");
const settings = fs.readFileSync(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

describe("country work eligibility UI contract", () => {
  test("the shared repeater collects every backend field and supports add and remove", () => {
    for (const field of [
      "country_code",
      "authorized_now",
      "needs_sponsorship_now",
      "needs_sponsorship_future",
      "authorization_type",
      "authorization_expiry",
    ]) {
      assert.match(editor, new RegExp(field));
    }
    assert.match(editor, /Add another country/);
    assert.match(editor, /Remove country/);
  });

  test("onboarding writes the scoped endpoint and explains the exact-country boundary", () => {
    assert.match(onboarding, /putOnboardingWorkEligibility\(normalizedCountryEligibility\(records\)\)/);
    assert.match(onboarding, /never copies an answer across borders/);
    assert.match(onboarding, /question names a country or the job has one exact/);
    assert.match(onboarding, /Expired or contradictory records are not saved or used/);
    assert.match(settings, /Expired or contradictory records are not/);
    assert.match(api, /"\/onboarding\/work-eligibility"/);
  });

  test("settings edits the same list and no longer offers global scalar controls", () => {
    assert.match(settings, /rows=\{eligibilityDraft\}/);
    assert.match(settings, /body\.work_eligibility_by_country = normalizedCountryEligibility\(eligibilityDraft\)/);
    assert.doesNotMatch(settings, /patch\(\{ work_authorized:/);
    assert.doesNotMatch(settings, /patch\(\{ needs_sponsorship:/);
  });
});
