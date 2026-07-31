import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeJobSearchTerm,
  zeroResultSearchProperties,
} from "./job-search-demand.ts";

test("zero-result role demand is normalized into stable reporting properties", () => {
  assert.deepEqual(
    zeroResultSearchProperties({
      targetRole: "  Investment   Banking  ",
      location: " New York ",
      remoteOnly: false,
      sponsorOnly: true,
      surface: "public_board",
      totalResults: 0,
    }),
    {
      target_role: "investment banking",
      location: "new york",
      remote_only: false,
      sponsor_only: true,
      surface: "public_board",
      result_count: 0,
    },
  );
});

test("a search with results is never reported as unmet demand", () => {
  assert.equal(
    zeroResultSearchProperties({
      targetRole: "Software Engineer",
      surface: "dashboard",
      totalResults: 1,
    }),
    null,
  );
});

test("empty and potentially sensitive search values are not sent to analytics", () => {
  for (const value of [
    "",
    "me@example.com",
    "https://example.com/private",
    "example.com/private",
    "+1 (415) 555-0199",
  ]) {
    assert.equal(normalizeJobSearchTerm(value), null);
  }
});

test("PII that begins beyond the reporting limit still suppresses the entire value", () => {
  assert.equal(normalizeJobSearchTerm(`${"x".repeat(79)} me@example.com`), null);
  assert.equal(normalizeJobSearchTerm(`${"x".repeat(79)} +1 415 555 0199`), null);
});

test("a sensitive supplied location suppresses the entire demand event", () => {
  assert.equal(
    zeroResultSearchProperties({
      targetRole: "Product Manager",
      location: "me@example.com",
      surface: "dashboard",
      totalResults: 0,
    }),
    null,
  );
});

test("control characters and oversized terms are bounded before reporting", () => {
  const normalized = normalizeJobSearchTerm(`Product\u0000 Manager ${"x".repeat(100)}`);
  assert.ok(normalized);
  assert.equal(normalized.length, 80);
  assert.doesNotMatch(normalized, /\u0000/);
});
