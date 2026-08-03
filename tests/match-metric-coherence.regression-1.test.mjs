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

// ISSUE-023: the caption under the number, which is the only place the denominator is stated.
//
// The backend caps the requirement set at EMPHASIS_LIMIT (engine/jdMatch.ts), because scoring
// against every term a 6k posting mentions measured the employer's word count rather than the
// student's fit. `term_count` is therefore the number of requirements Litos COUNTED, and on 353 of
// the 400 newest active postings that is fewer than the posting lists.
//
// These bite because nothing else does: the caption is plain JSX in a component with no render
// test, so reverting the wording to "N of M requirements" left the whole suite green while the
// screen went back to claiming M is everything the posting asks for.
describe("the match caption states which requirements it counted", () => {
  // Comments are stripped before matching, so quoting a caption literal in a code comment can
  // neither satisfy nor break these. The earlier version matched raw source, which meant the
  // doesNotMatch below would have failed the moment anyone quoted the old wording to explain why it
  // was replaced, and the positive assertions could have been satisfied by a comment alone.
  const raw = readFileSync("components/app/MatchScore.tsx", "utf8");
  const matchScore = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  test("the visible caption does not present term_count as the posting's whole list", () => {
    // Asserted as a PROPERTY of the rendered string rather than as one blessed wording, so a future
    // rewording passes as long as it does not go back to claiming the full list. The cap means
    // term_count is what Litos counted, and on 27% of postings it is ranked body prose rather than
    // anything the employer marked as a requirement.
    const caption = matchScore.match(/\{result\.matched\.length\} of \{result\.term_count\}([^<]*)/);
    assert.ok(caption, "the caption must still render matched.length of term_count");
    const qualifier = caption[1].trim();
    assert.notEqual(qualifier, "requirements", "a bare 'requirements' claims the posting's full list");
    assert.ok(qualifier.length > "requirements".length, `unqualified caption: "${qualifier}"`);
  });

  test("the accessible label carries the same qualifier the caption does", () => {
    // A screen reader user gets ONLY this string, so it is the one that must not overclaim.
    const aria = matchScore.match(/aria-label=\{`([^`]*)`\}/);
    assert.ok(aria, "the ring must keep an aria-label");
    assert.doesNotMatch(aria[1], /requirements this job posting lists/);
    assert.match(aria[1], /requirements Litos counted/);
  });

  test("the refusal state is still a sentence, not a zero", () => {
    // Unchanged by ISSUE-023 and asserted here so a caption edit cannot quietly take it out: a
    // posting that stated nothing scorable gets the explanation, never a confident 0. Asserted on
    // BEHAVIOUR (an unscorable result returns before any number is rendered) rather than on the
    // literal expression, which a no-op refactor would break.
    const guard = matchScore.indexOf("result.reason");
    const ring = matchScore.indexOf("strokeDasharray");
    assert.ok(guard !== -1 && ring !== -1, "both the refusal branch and the ring must exist");
    assert.ok(guard < ring, "the refusal branch must return before the ring is ever rendered");
    assert.match(matchScore, /!result\.scorable/);
  });
});
