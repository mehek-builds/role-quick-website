import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  blankCountryEligibility,
  countryEligibilityProblem,
  eligibilitySeed,
  legacySponsorshipAnswer,
  normalizedCountryEligibility,
} from "./work-eligibility.ts";

describe("country work eligibility form model", () => {
  test("seeds only a scoped list or the one unambiguous old US answer", () => {
    const scoped = [blankCountryEligibility("AE")];
    assert.deepEqual(eligibilitySeed({ work_eligibility_by_country: scoped }), scoped);
    assert.deepEqual(eligibilitySeed({ work_authorized: true, needs_sponsorship: false }), [{
      country_code: "US",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: false,
      authorization_type: null,
      authorization_expiry: null,
    }]);
    assert.equal(eligibilitySeed({ work_authorized: true, needs_sponsorship: true })[0]?.country_code, "");
    assert.equal(eligibilitySeed({ work_authorized: true, needs_sponsorship: true })[0]?.authorized_now, null);
  });

  test("requires complete unique country rows", () => {
    assert.equal(countryEligibilityProblem([]), "Add at least one country.");
    assert.equal(countryEligibilityProblem([blankCountryEligibility()]), "Choose a country for every row.");
    assert.equal(
      countryEligibilityProblem([blankCountryEligibility("US")]),
      "Answer all three work eligibility questions for every country.",
    );
    const completeUs = {
      ...blankCountryEligibility("US"),
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: true,
    };
    assert.equal(countryEligibilityProblem([completeUs, completeUs]), "Each country can appear only once.");
    assert.equal(countryEligibilityProblem([{
      ...completeUs,
    }]), null);
  });

  test("normalizes optional strings and derives the old US filter answer only from the US row", () => {
    const normalized = normalizedCountryEligibility([{
      ...blankCountryEligibility("us"),
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: true,
      authorization_type: "  F-1 CPT  ",
      authorization_expiry: "",
    }]);
    assert.deepEqual(normalized[0], {
      country_code: "US",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: true,
      authorization_type: "F-1 CPT",
      authorization_expiry: null,
    });
    assert.equal(legacySponsorshipAnswer(normalized), "needs_future");
    assert.equal(legacySponsorshipAnswer([blankCountryEligibility("AE")]), null);
  });
});
