import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { activeJobFilters, emptyJobsBody } from "../features/jobs/domain/job-filters.ts";

// Regression: ISSUE-041, /dashboard/jobs empty state named the wrong filter.
// Found by a live production audit on 2026-08-04.
//
// The board has four filters: a job-title search box, a location box, a job-type select and a
// Remote only checkbox. The empty state kept ONE boolean for all four and, whenever it was true,
// printed "Try a shorter search, or clear the location."
//
// Measured live: with both boxes empty, picking the job type "Full-time" correctly returned zero
// results (every job on the account was an internship), and the student was told to shorten a
// search they had not typed and clear a location they had not set. The one control excluding every
// posting was never named. That is worse than saying nothing, because it spends the student's next
// move on a box that is already empty.
//
// The fix names the filters that are actually set, and offers one control that clears all four.

const NEVER_FILTERED = { query: "", location: "", remoteOnly: false, employmentType: "" };

describe("the empty state names the filters that are actually set", () => {
  test("a job type on its own is named, and the two empty boxes are not", () => {
    const body = emptyJobsBody({ ...NEVER_FILTERED, employmentType: "Full-time" });
    assert.match(body, /the Full-time job type/);
    assert.doesNotMatch(body, /search/i);
    assert.doesNotMatch(body, /location/i);
  });

  test("Remote only on its own is named, and the two empty boxes are not", () => {
    const body = emptyJobsBody({ ...NEVER_FILTERED, remoteOnly: true });
    assert.match(body, /Remote only/);
    assert.doesNotMatch(body, /search/i);
    assert.doesNotMatch(body, /location/i);
  });

  test("a search on its own is named, and nothing else is", () => {
    const body = emptyJobsBody({ ...NEVER_FILTERED, query: "product" });
    assert.match(body, /your search/);
    assert.doesNotMatch(body, /location/i);
    assert.doesNotMatch(body, /job type/i);
    assert.doesNotMatch(body, /Remote only/);
  });

  test("a location on its own is named, and nothing else is", () => {
    const body = emptyJobsBody({ ...NEVER_FILTERED, location: "Dubai" });
    assert.match(body, /the location/);
    assert.doesNotMatch(body, /your search/);
    assert.doesNotMatch(body, /job type/i);
    assert.doesNotMatch(body, /Remote only/);
  });

  test("two set filters are joined plainly, and the two unset ones stay unmentioned", () => {
    const body = emptyJobsBody({ ...NEVER_FILTERED, query: "analyst", employmentType: "Internship" });
    assert.match(body, /No jobs match your search and the Internship job type right now\./);
    assert.doesNotMatch(body, /location/i);
    assert.doesNotMatch(body, /Remote only/);
  });

  test("all four set reads as one list, in control order", () => {
    const body = emptyJobsBody({ query: "analyst", location: "Dubai", remoteOnly: true, employmentType: "Contract" });
    assert.match(
      body,
      /No jobs match your search, the location, the Contract job type and Remote only right now\./,
    );
  });

  test("the sentence that is true in every branch survives every branch", () => {
    const always = "New jobs show up here as Litos finds them.";
    assert.equal(emptyJobsBody(NEVER_FILTERED), always);
    for (const filters of [
      { ...NEVER_FILTERED, query: "product" },
      { ...NEVER_FILTERED, location: "Dubai" },
      { ...NEVER_FILTERED, remoteOnly: true },
      { ...NEVER_FILTERED, employmentType: "Part-time" },
    ]) {
      assert.ok(emptyJobsBody(filters).endsWith(always));
    }
  });

  test("whitespace in a box is not a filter, so it cannot be blamed for an empty board", () => {
    assert.deepEqual(activeJobFilters({ ...NEVER_FILTERED, query: "   ", location: "  " }), []);
    assert.equal(emptyJobsBody({ ...NEVER_FILTERED, query: "   " }), "New jobs show up here as Litos finds them.");
  });
});

describe("every one of the four filters counts as filtering", () => {
  // The other half of the same defect: a filter missing from the "is this list filtered" test would
  // show the unfiltered copy over a filtered list, claiming there are simply no jobs when the
  // student had filtered them away.
  for (const [name, filters] of [
    ["the search box", { ...NEVER_FILTERED, query: "product" }],
    ["the location box", { ...NEVER_FILTERED, location: "Dubai" }],
    ["the Remote only checkbox", { ...NEVER_FILTERED, remoteOnly: true }],
    ["the job type select", { ...NEVER_FILTERED, employmentType: "Apprenticeship" }],
  ]) {
    test(`${name} alone counts`, () => {
      assert.equal(activeJobFilters(filters).length, 1);
    });
  }
});

describe("the jobs page uses that one reading, and offers a way out", () => {
  const page = readFileSync("app/dashboard/jobs/page.tsx", "utf8");

  test("the old sentence that named two filters for all four is gone", () => {
    assert.doesNotMatch(page, /Try a shorter search, or clear the location/);
  });

  test("the body comes from the shared builder rather than an inline ternary", () => {
    assert.match(page, /body=\{emptyJobsBody\(filters\)\}/);
  });

  test("the recovery action reads from the same list of active filters", () => {
    assert.match(page, /const activeFilters = useMemo\(\(\) => activeJobFilters\(filters\), \[filters\]\)/);
    assert.match(page, /\{activeFilters\.length > 0 \? \(/);
    assert.match(page, /Change job preferences/);
  });

  test("Clear filters clears all four, including the select and the checkbox", () => {
    const start = page.indexOf("const clearFilters");
    assert.notEqual(start, -1, "there is no clearFilters callback at all");
    const clear = page.slice(start, page.indexOf("}, []);", start));
    assert.match(clear, /setQuery\(""\)/);
    assert.match(clear, /setLocation\(""\)/);
    assert.match(clear, /setRemoteOnly\(false\)/);
    assert.match(clear, /setEmploymentType\(""\)/);
  });

  test("the control is reachable at every width", () => {
    // ISSUE-028 filed a HIGH defect for a recovery control hidden below the large breakpoint.
    const empty = page.slice(page.indexOf("<EmptyState title="), page.indexOf("</EmptyState>"));
    assert.match(empty, /Clear filters/);
    assert.doesNotMatch(empty, /hidden\s+(?:sm|md|lg|xl):/);
  });
});
