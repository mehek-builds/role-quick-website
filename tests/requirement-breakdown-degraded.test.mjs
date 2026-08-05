import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/*
 * A model outage must not be described to the student as a fact about the job.
 *
 * `unscoreable` means two different things and the breakdown rendered one of them for both. "You
 * stay curious" is a disposition no resume can answer, which is what "about attitude rather than
 * experience" was written for. A rate limit also leaves clauses uncounted, and that copy then tells
 * a student the posting asked about attitude when the truth is that we never asked at all.
 *
 * Backed by volley-backend's `degraded` flag: TOLD, not inferred. A null score also occurs on a
 * healthy posting whose every clause is a disposition, so deducing it from the count would fire the
 * outage message when nothing failed - the same lie pointed the other way.
 */
const component = readFileSync("components/app/RequirementBreakdown.tsx", "utf8");
const api = readFileSync("features/applications/infrastructure/applications-api.ts", "utf8");

describe("the breakdown tells an outage apart from a disposition", () => {
  test("the response type carries the flag", () => {
    assert.match(api, /degraded\?: boolean;/);
  });

  test("the response type carries the clause weight", () => {
    assert.match(api, /weight\?: number;/);
    assert.match(component, /const priority = typeof clause\.weight === "number"/);
  });

  test("the attitude sentence is behind the not-degraded branch", () => {
    /* Comments are stripped first. The explanation of this bug necessarily quotes the copy it is
       about, so an index comparison against the raw file compared the COMMENT's mention, not the
       rendered one, and ran backwards. */
    const code = component.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    assert.match(code, /result\.degraded \?/);
    assert.ok(code.indexOf("result.degraded ?") < code.indexOf("about attitude rather than"));
  });

  test("the outage message blames us, not the student or the posting", () => {
    assert.match(component, /problem on our side, not something about you or this job/);
  });

  test("the discarded-judgements line is suppressed during an outage", () => {
    // `rejected` now also carries "judge unavailable", and printing "could not be traced to a line
    // on your resume" for that blames the resume for a rate limit.
    assert.match(component, /!result\.degraded && result\.rejected\.length > 0/);
  });
});
