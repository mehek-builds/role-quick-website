import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { rankJobs } from "../features/applications/domain/daily-matches.ts";

// Regression: ISSUE-014, one card asserted two contradictory things about the same posting.
// Found by a live production audit on 2026-08-03.
//
// Databricks' "Product Management Intern (Summer 2027)" rendered fit 40 on Home and "0% match" on
// Jobs in the same session, and on Jobs the 0% sat directly above "Matches your product, San
// Francisco, CA, internship". The badge was resume-to-JD coverage (`match_score`) and the sentence
// under it was preference fit (`preference_score`): two metrics, two denominators, one card.
//
// THIS FILE HAS HELD TWO DIFFERENT ANSWERS, and the second one is what ships.
//
//   1. Show PREFERENCE FIT on both screens. Coherent, and it did fix the contradiction, but it
//      meant the number beside a job described OUR RANKING rather than the student.
//   2. Show RESUME-TO-JD COVERAGE on both screens. Mehek's call, 2026-08-03: the number a student
//      reads next to a job is how much of what that job asks for is already on their resume.
//
// The rule that survives both answers, and the reason the original was a bug: a score and the words
// printed beneath it must come from the same metric, and Home and Jobs must answer the same
// question about the same posting.

/** Comments are stripped before scanning, so the record of WHY may name the thing it bans. */
const code = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

describe("the score on a card is resume-to-JD coverage, on every surface", () => {
  const jobsPage = readFileSync("app/dashboard/jobs/page.tsx", "utf8");
  const homePage = readFileSync("app/dashboard/page.tsx", "utf8");

  test("both screens read the same hook", () => {
    for (const [name, src] of [["Jobs", jobsPage], ["Home", homePage]]) {
      assert.match(src, /useJobMatchScores\(/, `${name} must score via the shared hook`);
    }
  });

  test("no list surface renders preference_score as a number", () => {
    // preference_score never opens the resume. It may order the feed and it may name reasons; it
    // may not be the number a student reads as a match.
    for (const [name, src] of [["Jobs", jobsPage], ["Home", homePage]]) {
      assert.doesNotMatch(code(src), /\bpreference_score\b/, `${name} must not render preference_score`);
    }
  });

  test("the badge says match, and its tooltip names the denominator", () => {
    assert.match(jobsPage, /\{pct\}% match/);
    assert.doesNotMatch(code(jobsPage), /\{pct\}% fit/);
    // The objection that retired the first version of this badge was that a bare percentage in a
    // list carries no band, no denominator and no refusal state. All three ride along now.
    assert.match(jobsPage, /requirements this posting lists/);
  });

  test("the preference sentence does not borrow the score's word", () => {
    // "0% match" over "Matches your product, San Francisco, CA, internship" is the original defect.
    // Both facts are worth showing; they just cannot both be called matching.
    for (const [name, src] of [["Jobs", jobsPage], ["Home", homePage]]) {
      assert.match(src, /You asked for \{/, `${name} must caption preference reasons as an ask`);
      assert.doesNotMatch(code(src), /Matches your \{/, `${name} must not caption them as a match`);
    }
  });

  test("an unscored posting prints nothing, never a zero", () => {
    // `undefined` (still fetching) and `null` (backend declined to score) must both render nothing.
    // A zero is a claim that the resume matched no requirement, which is not what either means.
    assert.match(jobsPage, /if \(!match\) return null;/);
    assert.match(homePage, /\{match && \(/);
  });
});

describe("rankJobs carries preference evidence and no score at all", () => {
  const job = {
    id: "1",
    company_name: "Databricks",
    title: "Product Management Intern (Summer 2027)",
    preference_score: 40,
    preference_reasons: ["product", "San Francisco, CA", "internship"],
    match_score: 0,
  };

  test("no score field reaches a card", () => {
    // This type carried a score twice and lost it twice. It cannot supply resume coverage, which
    // needs the resume and a network round trip, so it offers no score rather than a convenient
    // wrong one. That is what stops a third `?? 0` being added in a hurry.
    const [ranked] = rankJobs([job]);
    assert.equal("match" in ranked, false);
    assert.deepEqual(ranked.reasons, ["product", "San Francisco, CA", "internship"]);
  });

  test("backend order is preserved", () => {
    // GET /jobs is still the single ranking authority and preference_score is still what it sorts
    // by. That is the job preference fit is good at; it just never becomes a number on screen.
    const second = { ...job, id: "2", preference_score: 96 };
    assert.deepEqual(rankJobs([job, second]).map((r) => r.id), ["1", "2"]);
  });

  test("absent preference reasons rank fine, with an empty list", () => {
    for (const shape of [
      { preference_reasons: undefined },
      { preference_score: null, preference_reasons: [] },
      { preference_score: 0, preference_reasons: [] },
    ]) {
      assert.deepEqual(rankJobs([{ ...job, ...shape }])[0].reasons, [], JSON.stringify(shape));
    }
  });
});
