import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  blankCountryEligibility,
  countryEligibilityProblem,
  eligibilitySeed,
  ISO_COUNTRY_CODES,
  legacySponsorshipAnswer,
  normalizedCountryEligibility,
} from "./work-eligibility.ts";

describe("country work eligibility form model", () => {
  test("explicit country records are authoritative over every legacy seed", () => {
    const scoped = [{
      country_code: "AE",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: false,
      authorization_type: null,
      authorization_expiry: null,
    }];
    assert.deepEqual(eligibilitySeed({
      work_eligibility_by_country: scoped,
      work_authorized: true,
      needs_sponsorship: false,
    }, "needs_future"), scoped);
    assert.deepEqual(eligibilitySeed({ work_eligibility_by_country: [] }, "no"), []);
  });

  test("matches the backend's conservative US bridge for old onboarding answers", () => {
    assert.deepEqual(eligibilitySeed({ work_authorized: true, needs_sponsorship: false }), [{
      country_code: "US",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: false,
      authorization_type: null,
      authorization_expiry: null,
    }]);
    assert.deepEqual(eligibilitySeed({}, "needs_future"), [{
      country_code: "US",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: true,
      authorization_type: null,
      authorization_expiry: null,
    }]);
    assert.deepEqual(eligibilitySeed({ work_authorized: true }, "no"), [{
      country_code: "US",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: false,
      authorization_type: null,
      authorization_expiry: null,
    }]);
    assert.equal(eligibilitySeed({ work_authorized: false }, "needs_future")[0]?.country_code, "");
    assert.equal(eligibilitySeed({ needs_sponsorship: true }, "no")[0]?.country_code, "");
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

  test("accepts 64 unique valid rows and rejects 65 before submission", () => {
    const rows = ISO_COUNTRY_CODES.slice(0, 65).map((country_code) => ({
      country_code,
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: false,
      authorization_type: null,
      authorization_expiry: null,
    }));
    assert.equal(countryEligibilityProblem(rows.slice(0, 64)), null);
    assert.equal(countryEligibilityProblem(rows), "Add no more than 64 countries.");
  });

  test("rejects contradictory, impossible, and expired declarations", () => {
    const notAuthorizedWithoutSupport = {
      ...blankCountryEligibility("US"),
      authorized_now: false,
      needs_sponsorship_now: false,
      needs_sponsorship_future: true,
    };
    assert.equal(
      countryEligibilityProblem([notAuthorizedWithoutSupport], new Date("2026-08-10T00:00:00Z")),
      "If you are not authorized now, say whether you need sponsorship before starting.",
    );
    const active = {
      ...notAuthorizedWithoutSupport,
      authorized_now: true,
    };
    assert.equal(
      countryEligibilityProblem([{ ...active, authorization_expiry: "2026-02-30" }], new Date("2026-08-10T00:00:00Z")),
      "Use a real YYYY-MM-DD authorization expiry date.",
    );
    assert.equal(
      countryEligibilityProblem([{ ...active, authorization_expiry: "2026-08-09" }], new Date("2026-08-10T00:00:00Z")),
      "Authorization expiry cannot be in the past.",
    );
    assert.equal(
      countryEligibilityProblem([{ ...active, authorization_expiry: "2026-08-10" }], new Date("2026-08-10T23:59:59Z")),
      null,
    );
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
    assert.equal(legacySponsorshipAnswer([{
      country_code: "AE",
      authorized_now: true,
      needs_sponsorship_now: false,
      needs_sponsorship_future: false,
      authorization_type: null,
      authorization_expiry: null,
    }]), null);
  });
});
