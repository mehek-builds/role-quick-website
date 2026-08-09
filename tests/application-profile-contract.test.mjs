import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const API = readFileSync("lib/api.ts", "utf8");
const SETTINGS = readFileSync("app/dashboard/settings/page.tsx", "utf8");
const ONBOARDING = readFileSync("components/start/BaseResumeStep.tsx", "utf8");

/* Snapshot of bodySchema in student-outreach-backend at 8a99fbb. Keeping the complete writable
 * contract here makes a website type deletion fail loudly instead of silently dropping a value
 * when Settings sends the fetched profile back. The server-owned consent timestamp is omitted. */
const BACKEND_WRITABLE_FIELDS = [
  "phone",
  "address_city",
  "address_state",
  "address_zip",
  "address_country",
  "linkedin_url",
  "github_url",
  "portfolio_url",
  "citizenship",
  "work_authorized",
  "needs_sponsorship",
  "availability_date",
  "availability_term",
  "desired_salary",
  "desired_salary_currency",
  "date_of_birth",
  "gpa",
  "gpa_scale",
  "major",
  "languages",
  "eeo_prefs",
  "referral_source_default",
  "pronouns",
  "legal_first_name",
  "preferred_first_name",
  "high_school_grad_date",
  "education_start_date",
  "prior_application_employers",
  "has_outstanding_offers",
  "outstanding_offer_details",
  "military_service",
  "politically_exposed",
  "politically_exposed_family",
  "advanced_study_plan",
  "attest_truthful_information",
  "accept_privacy_notices",
  "onsite_commitment",
  "onsite_locations",
  "relocation_willingness",
];

function applicationProfileBody() {
  const match = API.match(/export type ApplicationProfile = \{([\s\S]*?)\n\};\n\n\/\/ ---- onboarding/);
  assert.ok(match, "ApplicationProfile type was not found");
  return match[1];
}

describe("website and backend application profile contract", () => {
  test("the website type carries every backend-writable field as optional", () => {
    const profile = applicationProfileBody();
    for (const field of BACKEND_WRITABLE_FIELDS) {
      assert.match(profile, new RegExp(`\\n  ${field}\\?:`), `missing optional field ${field}`);
    }
  });

  test("new global facts retain backend null semantics", () => {
    const profile = applicationProfileBody();
    for (const field of [
      "availability_term",
      "date_of_birth",
      "education_start_date",
      "onsite_commitment",
      "onsite_locations",
      "relocation_willingness",
    ]) {
      const line = profile.split("\n").find((candidate) => candidate.trimStart().startsWith(`${field}?:`));
      assert.ok(line?.includes("null"), `${field} must remain nullable`);
    }
  });

  test("safe added facts are editable and sent under their exact backend key", () => {
    for (const field of [
      "date_of_birth",
      "education_start_date",
    ]) {
      assert.match(SETTINGS, new RegExp(`profile\\.${field}`), `settings does not read ${field}`);
      assert.match(SETTINGS, new RegExp(`\\{ ${field}:`), `settings does not write ${field}`);
    }
    assert.match(SETTINGS, /const body: Record<string, unknown> = \{ \.\.\.profile \}/);
    assert.match(SETTINGS, /api<ApplicationProfile>\("\/profile\/application"/);
  });

  test("application-scoped availability is round-tripped but not newly collected", () => {
    assert.match(applicationProfileBody(), /\n  availability_term\?: string \| null;/);
    assert.doesNotMatch(SETTINGS, /profile\.availability_term|patch\(\{ availability_term:/);
    assert.doesNotMatch(ONBOARDING, /key: "availability_term"|availability_term:\s*"/);
    assert.match(SETTINGS, /const body: Record<string, unknown> = \{ \.\.\.profile \}/);
  });

  test("global location commitments remain round-trip-only, not editable defaults", () => {
    for (const field of ["onsite_commitment", "onsite_locations", "relocation_willingness"]) {
      assert.doesNotMatch(SETTINGS, new RegExp(`profile\\.${field}`), `settings must not expose ${field}`);
      assert.doesNotMatch(SETTINGS, new RegExp(`patch\\(\\{ ${field}:`), `settings must not write ${field}`);
    }
    assert.match(SETTINGS, /const body: Record<string, unknown> = \{ \.\.\.profile \}/);
  });

  test("onboarding omits blank applicant facts instead of clearing stored answers", () => {
    for (const field of ["education_start_date", "date_of_birth"]) {
      assert.match(ONBOARDING, new RegExp(`key: "${field}"`));
    }
    assert.match(ONBOARDING, /if \(typed\) \(patch as Record<string, unknown>\)\[field\.key\] = typed/);
    assert.doesNotMatch(ONBOARDING, /availability_term:\s*"/);
    assert.doesNotMatch(ONBOARDING, /key: "availability_term"/);
    assert.doesNotMatch(ONBOARDING, /date_of_birth:\s*"/);
  });

  test("school location is not invented outside the backend contract", () => {
    assert.doesNotMatch(applicationProfileBody(), /school_(?:country|location)\?:/);
    assert.doesNotMatch(SETTINGS, /patch\(\{ school_(?:country|location):/);
  });
});
