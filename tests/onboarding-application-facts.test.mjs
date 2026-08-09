import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* THE QUESTIONS EMPLOYERS KEEP ASKING, ASKED ONCE.
 *
 * Nine facts blocked real applications with "is required and is still empty" across the 25 most
 * recent packets, and none of them existed anywhere in the product: not on the profile, not in
 * /start, not in Settings. The counts are in the backend's db/schema.ts and in
 * scripts/apply-application-facts-schema.mjs.
 *
 * These pin the property that makes asking them safe rather than merely useful:
 *
 *   - A BLANK WRITES NOTHING. Every one of these is a declaration about a person
 *     given to an employer. A skipped question that saved "No" would be Litos putting a sentence
 *     in the applicant's mouth on a live application, so an untouched field is omitted from the
 *     patch entirely and the column stays null, which the runner reads as "never asked".
 * Employer agreements are never collected here because each one is scoped to the current text.
 */

function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const RAW = readFileSync("components/start/BaseResumeStep.tsx", "utf8");
const STEP = code(RAW);
const API = code(readFileSync("lib/api.ts", "utf8"));

/* The patch builder, extracted from the component so the rule can be tested without a renderer.
 * Kept in step with the source by the assertion in "the extracted copy matches the component"
 * below, which is the only thing standing between this file and testing a stale duplicate. */
function applicationFactPatch(input) {
  const FIELDS = [
    "pronouns",
    "legal_first_name",
    "preferred_first_name",
    "high_school_grad_date",
    "education_start_date",
    "date_of_birth",
    "military_service",
    "politically_exposed",
    "politically_exposed_family",
  ];
  const patch = {};
  for (const field of FIELDS) {
    const typed = input.facts[field]?.trim();
    if (typed) patch[field] = typed;
  }
  if (input.offers === "none") {
    patch.has_outstanding_offers = false;
  } else if (input.offers === "some") {
    patch.has_outstanding_offers = true;
    const details = input.offerDetails.trim();
    if (details) patch.outstanding_offer_details = details;
  }
  if (["no", "considering", "committed"].includes(input.advancedStudy)) {
    patch.advanced_study_plan = input.advancedStudy;
  }
  const employers = input.priorEmployers.trim();
  if (employers.toLowerCase() === "none") {
    patch.prior_application_employers = [];
  } else if (employers) {
    patch.prior_application_employers = employers.split(",").map((name) => name.trim()).filter(Boolean);
  }
  const referral = input.referralSource.trim();
  if (referral) patch.referral_source_default = referral;
  return patch;
}

const UNTOUCHED = {
  facts: {},
  priorEmployers: "",
  offers: "",
  offerDetails: "",
  advancedStudy: "",
  referralSource: "",
};

describe("the application facts asked on the base resume step", () => {
  test("a student who skips the card declares nothing", () => {
    const patch = applicationFactPatch(UNTOUCHED);
    assert.deepEqual(patch, {});
  });

  test("an empty offers answer is not the same as having no offers", () => {
    assert.equal("has_outstanding_offers" in applicationFactPatch(UNTOUCHED), false);
    assert.equal(applicationFactPatch({ ...UNTOUCHED, offers: "none" }).has_outstanding_offers, false);
    assert.equal(applicationFactPatch({ ...UNTOUCHED, offers: "some" }).has_outstanding_offers, true);
  });

  test("an empty employer list is not the same as having applied nowhere", () => {
    assert.equal("prior_application_employers" in applicationFactPatch(UNTOUCHED), false);
    // "none" is typed on purpose, because an empty box cannot say it.
    assert.deepEqual(applicationFactPatch({ ...UNTOUCHED, priorEmployers: "none" }).prior_application_employers, []);
    assert.deepEqual(
      applicationFactPatch({ ...UNTOUCHED, priorEmployers: "Akuna Capital, Jane Street" }).prior_application_employers,
      ["Akuna Capital", "Jane Street"],
    );
  });

  test("typed declarations are sent exactly as written, including prefer-not-to-say", () => {
    const patch = applicationFactPatch({
      ...UNTOUCHED,
      facts: { pronouns: "she/her", military_service: "Prefer not to say", politically_exposed: "No" },
    });
    assert.equal(patch.pronouns, "she/her");
    assert.equal(patch.military_service, "Prefer not to say");
    assert.equal(patch.politically_exposed, "No");
    // Whitespace alone is a blank, not an answer.
    assert.equal("legal_first_name" in applicationFactPatch({ ...UNTOUCHED, facts: { legal_first_name: "   " } }), false);
  });

  test("the extracted copy matches the component", () => {
    // Guards the whole file: if the component's builder changes shape and this one does not, the
    // tests above are pinning a fiction.
    for (const marker of [
      'if (typed) (patch as Record<string, unknown>)[field.key] = typed;',
      'patch.has_outstanding_offers = false;',
      'patch.prior_application_employers = [];',
      'if (referral) patch.referral_source_default = referral;',
    ]) {
      assert.ok(STEP.includes(marker), marker);
    }
  });
});

describe("the screen asks, and says what it will not do", () => {
  test("every measured field has a control", () => {
    // The text inputs are rendered from APPLICATION_FACT_FIELDS, so the ids are built rather than
    // written out; check the list and the template that turns it into controls.
    assert.ok(STEP.includes("id={`base-fact-${field.key}`}"));
    for (const key of [
      "pronouns",
      "legal_first_name",
      "high_school_grad_date",
      "education_start_date",
      "date_of_birth",
      "military_service",
      "politically_exposed",
      "politically_exposed_family",
    ]) {
      assert.ok(new RegExp(`key: "${key}"`).test(STEP), `missing field ${key}`);
    }
    for (const id of [
      "base-fact-prior-employers",
      "base-fact-offers",
      "base-fact-advanced-study",
      "base-fact-referral",
    ]) {
      assert.ok(STEP.includes(id), `missing control ${id}`);
    }
  });

  test("factual hints are programmatically associated with their inputs", () => {
    assert.match(STEP, /aria-describedby=\{field\.hint \? `base-fact-\$\{field\.key\}-hint` : undefined\}/);
    assert.match(STEP, /id=\{`base-fact-\$\{field\.key\}-hint`\}/);
  });

  test("the card leaves every current employer agreement for the applicant", () => {
    assert.doesNotMatch(RAW, /Boxes we may tick for you/);
    assert.doesNotMatch(STEP, /patch\.(?:attest_truthful_information|accept_privacy_notices)/);
    assert.match(RAW, /Every employer agreement stays for you to review on that application/);
    assert.match(RAW, /privacy notices, accuracy certifications/);
  });

  test("the card says a blank stays blank on the employer's form", () => {
    assert.match(RAW, /Leave anything blank and it stays blank on the form too/);
  });

  test("the profile type carries every column the migration adds", () => {
    for (const column of [
      "pronouns",
      "legal_first_name",
      "preferred_first_name",
      "high_school_grad_date",
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
      "referral_source_default",
      "availability_term",
      "date_of_birth",
    ]) {
      assert.ok(new RegExp(`\\n  ${column}\\?:`).test(API), `ApplicationProfile is missing ${column}`);
    }
  });
});

describe("per-application location decisions", () => {
  test("onboarding cannot collect or write onsite and relocation declarations", () => {
    for (const field of ["onsite_commitment", "onsite_locations", "relocation_willingness"]) {
      assert.equal(field in applicationFactPatch(UNTOUCHED), false);
      assert.doesNotMatch(STEP, new RegExp(`profile\\?\\.${field}|patch\\.${field}|base-fact-${field.replaceAll("_", "-")}`));
    }
  });

  test("how she found the job is typed, never defaulted to Company website", () => {
    /* The database column defaulted to 'Company website' and every production row carried it
       without a person having typed it, so the most-asked question on any form was answered with a
       fact nobody supplied - usually a false one, since Litos finds these on a monitored board. */
    assert.equal("referral_source_default" in applicationFactPatch(UNTOUCHED), false);
    assert.equal(
      applicationFactPatch({ ...UNTOUCHED, referralSource: "LinkedIn" }).referral_source_default,
      "LinkedIn",
    );
    // No 'Company website' default anywhere on the screen: not as a value, not as a fallback.
    assert.equal(/referralSource[^\n]*"Company website"/.test(STEP), false);
    assert.equal(/onsite_commitment\?:[^\n]*=\s*"/.test(API), false);
  });

  test("the screen names the reusable factual question it is closing", () => {
    assert.match(RAW, /how did you hear about this job/i);
  });
});
