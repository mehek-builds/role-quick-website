import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HOME_MATCH_WINDOW, visibleMatches } from "./daily-matches.ts";

/* Home shows three matches, and keeps showing three.
 *
 * These exercise the behaviour rather than asserting on the source text: the window has to REFILL,
 * and the only way to know it does is to finish a match and look at what comes back. */

const day = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `job-${i + 1}` }));
const ids = (jobs: { id: string }[]) => jobs.map((job) => job.id);

describe("visibleMatches", () => {
  test("shows the window size when the day has more than enough", () => {
    assert.equal(HOME_MATCH_WINDOW, 3);
    assert.deepEqual(ids(visibleMatches(day(5))), ["job-1", "job-2", "job-3"]);
  });

  test("refills from the rest of the set when a match is submitted", () => {
    const jobs = day(5);
    const submitted = new Set(["job-2"]);
    // job-2 leaves, job-4 arrives. The window stays full rather than dropping to two.
    assert.deepEqual(ids(visibleMatches(jobs, { submitted })), ["job-1", "job-3", "job-4"]);
  });

  test("refills when a match is skipped, the same as when one is submitted", () => {
    const jobs = day(5);
    assert.deepEqual(ids(visibleMatches(jobs, { dismissed: ["job-1"] })), ["job-2", "job-3", "job-4"]);
  });

  test("keeps refilling as matches are finished one at a time", () => {
    const jobs = day(6);
    const submitted = new Set<string>();
    const seen: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const window = visibleMatches(jobs, { submitted });
      seen.push(ids(window));
      submitted.add(window[0].id); // finish the first card, as a student would
    }
    assert.deepEqual(seen, [
      ["job-1", "job-2", "job-3"],
      ["job-2", "job-3", "job-4"],
      ["job-3", "job-4", "job-5"],
    ]);
  });

  test("shows what is left when the day's set is smaller than the window", () => {
    // The real constraint, and the one no windowing change can fix: two matches means two cards.
    assert.deepEqual(ids(visibleMatches(day(2))), ["job-1", "job-2"]);
    assert.deepEqual(ids(visibleMatches(day(2), { dismissed: ["job-1"] })), ["job-2"]);
  });

  test("empties only when every match is finished, by either route", () => {
    const jobs = day(3);
    assert.deepEqual(visibleMatches(jobs, { submitted: new Set(["job-1", "job-2", "job-3"]) }), []);
    assert.deepEqual(visibleMatches(jobs, { dismissed: ["job-1", "job-2", "job-3"] }), []);
    // Mixed: two skipped, one submitted. Finished is finished.
    assert.deepEqual(visibleMatches(jobs, { dismissed: ["job-1", "job-2"], submitted: new Set(["job-3"]) }), []);
  });

  test("preserves rank order, so the next card up is the next best match", () => {
    const jobs = day(5);
    assert.deepEqual(ids(visibleMatches(jobs, { dismissed: ["job-2"] })), ["job-1", "job-3", "job-4"]);
  });
});
