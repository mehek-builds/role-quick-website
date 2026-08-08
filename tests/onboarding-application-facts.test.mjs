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
 * These pin the two properties that make asking them safe rather than merely useful:
 *
 *   - A BLANK WRITES NOTHING. Every one of these is a declaration about a person or a consent
 *     given to an employer. A skipped question that saved "No" would be Litos putting a sentence
 *     in the applicant's mouth on a live application, so an untouched field is omitted from the
 *     patch entirely and the column stays null, which the runner reads as "never asked".
 *   - ONLY TWO BOXES MAY BE TICKED FOR HER. A truthfulness certification and a candidate privacy
 *     notice. The screen says which two and says what it will not do, because the alternative is
 *     finding out afterwards that a machine agreed to something on your behalf.
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
  if (input.onsiteCommitment === "anywhere" || input.onsiteCommitment === "no") {
    patch.onsite_commitment = input.onsiteCommitment;
  } else if (input.onsiteCommitment === "listed_locations") {
    const places = input.onsiteLocations.split(",").map((place) => place.trim()).filter(Boolean);
    if (places.length > 0) {
      patch.onsite_commitment = "listed_locations";
      patch.onsite_locations = places;
    }
  }
  if (input.relocation === "yes" || input.relocation === "no") {
    patch.relocation_willingness = input.relocation;
  }
  const referral = input.referralSource.trim();
  if (referral) patch.referral_source_default = referral;
  patch.attest_truthful_information = input.attestTruthful;
  patch.accept_privacy_notices = input.acceptPrivacy;
  return patch;
}

const UNTOUCHED = {
  facts: {},
  priorEmployers: "",
  offers: "",
  offerDetails: "",
  advancedStudy: "",
  onsiteCommitment: "",
  onsiteLocations: "",
  relocation: "",
  referralSource: "",
  attestTruthful: false,
  acceptPrivacy: false,
};

describe("the application facts asked on the base resume step", () => {
  test("a student who skips the card declares nothing", () => {
    const patch = applicationFactPatch(UNTOUCHED);
    // The two consent booleans are always sent, so unticking one actually withdraws it. Nothing
    // else may appear: every other key here would be a claim she never made.
    assert.deepEqual(patch, { attest_truthful_information: false, accept_privacy_notices: false });
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
      'patch.onsite_commitment = "listed_locations";',
      'if (referral) patch.referral_source_default = referral;',
      'patch.attest_truthful_information = input.attestTruthful;',
      'patch.accept_privacy_notices = input.acceptPrivacy;',
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
      "base-fact-onsite",
      "base-fact-onsite-locations",
      "base-fact-relocation",
      "base-fact-referral",
    ]) {
      assert.ok(STEP.includes(id), `missing control ${id}`);
    }
  });

  test("the card promises exactly the two boxes the runner will tick", () => {
    assert.match(RAW, /Boxes we may tick for you/);
    assert.match(RAW, /true, complete and accurate/);
    assert.match(RAW, /candidate privacy notice/i);
    // And it names the thing it refuses, in the applicant's own example.
    assert.match(RAW, /this role is my top preference/);
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
    ]) {
      assert.ok(new RegExp(`\\n  ${column}\\?:`).test(API), `ApplicationProfile is missing ${column}`);
    }
  });
});

/* ---------------------------------------------------------------------------------------------
 * WHERE SHE WILL WORK FROM, added 2026-08-09.
 *
 * A Redwood Materials packet was ready to send with "Are you available to work from our office in
 * San Francisco?" answered YES, for an applicant who lives in Dubai and studies in Los Angeles.
 * The backend had `case 'onsite_commitment': return { value: 'Yes' }` - a constant, no column.
 *
 * The question is asked 15 different ways by 12 employers in the stored corpus, so it belongs in
 * onboarding rather than at every Apply. These pin the two things that make the column an answer
 * rather than a nicer-looking default: an untouched control writes NOTHING, and a half-answer
 * ("only in certain places", no places) writes nothing either.
 * ------------------------------------------------------------------------------------------- */
describe("where you will work from", () => {
  test("an untouched control declares nothing, so the employer's field stays blank and is raised", () => {
    const patch = applicationFactPatch(UNTOUCHED);
    assert.equal("onsite_commitment" in patch, false);
    assert.equal("onsite_locations" in patch, false);
    assert.equal("relocation_willingness" in patch, false);
    assert.equal("referral_source_default" in patch, false);
  });

  test("an existing user who has not answered is asked, never defaulted", () => {
    // The seed reads only what is stored. Nothing here derives an onsite answer from address_city:
    // where she lives is not a statement about which offices she will work from, and seeding it
    // from her address would put the guess back in with a human's hand on it.
    assert.ok(STEP.includes('useState<string>(() => profile?.onsite_commitment ?? "")'));
    assert.equal(/onsite_commitment[^\n]*address_city/.test(STEP), false);
    // And "Prefer not to answer now" is the first option, so the control opens unanswered.
    assert.match(RAW, /value: "", label: "Prefer not to answer now" \},\n  \{ value: "anywhere"/);
  });

  test("the location list is the answer, so a commitment without one is not written", () => {
    // "Only in certain places" and no places is a half-answer, and the half that is missing is the
    // half that decides whether an employer hears yes or no.
    const halfAnswer = applicationFactPatch({ ...UNTOUCHED, onsiteCommitment: "listed_locations", onsiteLocations: "  ," });
    assert.equal("onsite_commitment" in halfAnswer, false);

    const answered = applicationFactPatch({
      ...UNTOUCHED,
      onsiteCommitment: "listed_locations",
      onsiteLocations: "Los Angeles, New York",
    });
    assert.equal(answered.onsite_commitment, "listed_locations");
    assert.deepEqual(answered.onsite_locations, ["Los Angeles", "New York"]);

    // The two whole-answer options need no list.
    assert.equal(applicationFactPatch({ ...UNTOUCHED, onsiteCommitment: "anywhere" }).onsite_commitment, "anywhere");
    assert.equal(applicationFactPatch({ ...UNTOUCHED, onsiteCommitment: "no" }).onsite_commitment, "no");
  });

  test("relocating is asked separately from commuting to an office", () => {
    // Agreeing to sit in an office in the city you already live in says nothing about moving.
    const onsiteOnly = applicationFactPatch({ ...UNTOUCHED, onsiteCommitment: "anywhere" });
    assert.equal("relocation_willingness" in onsiteOnly, false);
    assert.equal(applicationFactPatch({ ...UNTOUCHED, relocation: "no" }).relocation_willingness, "no");
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

  test("the screen names the question it is closing", () => {
    assert.match(RAW, /are you available to work from our office in San Francisco/i);
    assert.match(RAW, /how did you hear about this job/i);
  });
});
