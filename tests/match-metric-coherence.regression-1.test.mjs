import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { rankJobs } from "../features/applications/domain/daily-matches.ts";

// Regression: ISSUE-014, one card asserted two contradictory metrics about the same posting.
// Found by a live production audit on 2026-08-03.
//
// Databricks' "Product Management Intern (Summer 2027)" rendered fit 40 on Home and "0% match" on
// Jobs in the same session, and on Jobs the 0% sat directly above "Matches your product, San
// Francisco, CA, internship". The badge was resume-to-JD coverage (`match_score`) and the sentence
// under it was preference fit (`preference_score`): two metrics, two denominators, one card.
//
// The rule these tests hold: a score and the reasons printed beneath it come from the SAME metric,
// and Home and Jobs answer the same question about the same posting.

describe("a card never pairs one metric's score with another metric's reasons", () => {
  const jobsPage = readFileSync("app/dashboard/jobs/page.tsx", "utf8");

  test("the Jobs badge reads preference fit, the same field Home reads", () => {
    assert.match(jobsPage, /<FitBadge score={job\.preference_score} reasons={job\.preference_reasons} \/>/);
  });

  test("no surface renders match_score as a bare percentage in a list", () => {
    // Resume coverage keeps its home on the review screen, in MatchScore, where it arrives with a
    // band label, an "N of M requirements" denominator, and a refusal state for postings that
    // listed nothing to score. A bare percentage in a list has none of that, and on real postings
    // it lands an order of magnitude below where a reader assumes a percentage sits.
    assert.doesNotMatch(jobsPage, /score={job\.match_score}/);
  });

  test("the badge says fit, not match, because that is the question it answers", () => {
    assert.match(jobsPage, /\{pct\}% fit/);
    assert.doesNotMatch(jobsPage, /\{pct\}% match/);
  });

  test("the badge tooltip says it does not read the resume", () => {
    // The word "match" beside a job posting reads as "how much of this job is you". Anyone who
    // assumes this number saw their resume will draw exactly the wrong conclusion from a low one.
    assert.match(jobsPage, /It does not read your resume\./);
  });
});

describe("rankJobs carries preference fit and nothing else", () => {
  const job = {
    id: "1",
    company_name: "Databricks",
    title: "Product Management Intern (Summer 2027)",
    preference_score: 40,
    preference_reasons: ["product", "San Francisco, CA", "internship"],
    match_score: 0,
  };

  test("match is the preference score even when a resume coverage score exists", () => {
    const [ranked] = rankJobs([job]);
    assert.equal(ranked.match, 40);
    assert.deepEqual(ranked.reasons, ["product", "San Francisco, CA", "internship"]);
  });

  test("match never falls back to match_score, which is a different question", () => {
    // The old expression was `preference_score ?? match_score ?? 0`. It silently swapped the ring
    // on Home from "fits what you asked for" to "your resume is a poor match" with nothing on
    // screen saying so.
    const [ranked] = rankJobs([{ ...job, preference_score: undefined, match_score: 87 }]);
    assert.equal(ranked.match, null, "an absent preference score is not a resume score");
  });

  test("an account with no preferences saved gets null, never a confident zero", () => {
    // The backend sends preference_score: null for this, because preferenceFit floors at 0 and
    // only GET /jobs can see the targeting row.
    const [ranked] = rankJobs([{ ...job, preference_score: null, preference_reasons: [] }]);
    assert.equal(ranked.match, null);
  });

  test("a real zero with preferences saved is also suppressed, so Home cannot draw a 0 ring", () => {
    // This is the case that reintroduced ISSUE-014 in a second shape: Jobs rendered no badge while
    // Home rendered a "0" ring labelled "fit", for the same posting in the same session.
    const [ranked] = rankJobs([{ ...job, preference_score: 0, preference_reasons: [] }]);
    assert.equal(ranked.match, null, "a number with no reason behind it is a number with no caption");
  });

  test("Home and Jobs suppress on exactly the same conditions", () => {
    // One rule, asserted against both implementations rather than described in two comments.
    const jobsPage = readFileSync("app/dashboard/jobs/page.tsx", "utf8");
    const badge = jobsPage.slice(jobsPage.indexOf("function FitBadge"), jobsPage.indexOf("{pct}% fit"));
    assert.match(badge, /if \(score === null \|\| score === undefined\) return null;/);
    assert.match(badge, /if \(!reasons \|\| reasons\.length === 0\) return null;/);

    for (const shape of [
      { preference_score: null, preference_reasons: [] },
      { preference_score: 0, preference_reasons: [] },
      { preference_score: undefined, preference_reasons: undefined },
    ]) {
      assert.equal(rankJobs([{ ...job, ...shape }])[0].match, null, JSON.stringify(shape));
    }
    // ...and both render when there IS a reason.
    assert.equal(rankJobs([job])[0].match, 40);
  });

  test("Home draws no ring at all when there is nothing to draw", () => {
    const home = readFileSync("app/dashboard/page.tsx", "utf8");
    assert.equal(home.match(/\{job\.match !== null && \(/g)?.length, 2);
  });
});

// B3: the review screen is the only surface still showing resume coverage, so it is the one that
// most needs the posting's offices out of its denominator and its missing list. A packet stores no
// location, so the id is what lets the backend read it off the live job row.
describe("the review screen sends what the backend needs to exclude the posting's offices", () => {
  test("the next-match score request carries the job id", () => {
    const applications = readFileSync("app/dashboard/applications/page.tsx", "utf8");
    assert.match(applications, /job_id: nextPacket\.job_context\.job_id/);
  });

  test("MatchScore passes the whole stored job_context through, id included", () => {
    const applications = readFileSync("app/dashboard/applications/page.tsx", "utf8");
    assert.match(applications, /jobContext=\{selected\.job_context\}/);
    const matchScore = readFileSync("components/app/MatchScore.tsx", "utf8");
    assert.match(matchScore, /jobContext\?: JobContext;/);
    // The id has to be a dependency, or a packet swap reuses the previous posting's exclusions.
    assert.match(matchScore, /jobContext\?\.job_id\]\);/);
  });

  test("JobContext carries the id for every caller of it", () => {
    const apiFile = readFileSync("features/applications/infrastructure/applications-api.ts", "utf8");
    assert.match(apiFile, /export type JobContext = \{ company\?: string; role\?: string; job_id\?: string \| null \};/);
  });
});
