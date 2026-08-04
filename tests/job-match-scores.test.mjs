import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/*
 * ISSUE-014: the hook that decides the number beside every job.
 *
 * These are source assertions rather than a render harness, which is what the rest of this suite
 * uses and what the repo has tooling for. That is a real limit and it is worth naming: they pin the
 * rules that were argued over and that a future edit would plausibly undo, not the runtime.
 *
 * Each one corresponds to a defect this hook actually shipped with and had caught in review:
 * duplicate POSTs from overlapping loops, scoring after unmount, a dropped job_id that scored
 * students against the employer's own cities, and real network calls from QA fixture renders.
 */

const src = readFileSync("features/applications/application/use-job-match-scores.ts", "utf8");
/** Comments stripped, so the record of WHY cannot satisfy an assertion about the code. */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("useJobMatchScores never prints a number it did not measure", () => {
  test("an unscorable posting resolves to null, not zero", () => {
    // The backend returns scorable:false for a posting that listed nothing to score against. A 0
    // would claim the resume matched none of the requirements; those are different statements, and
    // conflating them is the ISSUE-014 defect in miniature.
    assert.match(code, /result\.scorable && result\.score !== null/);
    assert.match(code, /:\s*null,/);
  });

  test("a failed request resolves to null too", () => {
    assert.match(code, /catch \{[\s\S]*?\[job\.id\]: null/);
  });

  test("a posting with no description is never requested", () => {
    assert.match(code, /&& job\.description,/);
  });
});

describe("the hook does not amplify requests or outlive its component", () => {
  test("in-flight ids are tracked separately from settled scores", () => {
    // `scores` is only written when a request SETTLES, so two overlapping loops both read "not
    // scored yet" and both POST. The job list gets a new identity on every committed keystroke on
    // Jobs and on every dismissal on Home, so overlapping loops are the normal case.
    assert.match(code, /const inFlight = useRef<Set<string>>\(new Set\(\)\);/);
    assert.match(code, /!inFlight\.current\.has\(job\.id\)/);
    assert.match(code, /finally \{[\s\S]*?inFlight\.current\.delete\(job\.id\)/);
  });

  test("the sequential loop is cancellable and checks before every write", () => {
    assert.match(code, /if \(!alive\(\)\) return;/);
    assert.match(code, /return \(\) => \{\s*alive = false;/);
    // Checked after the await as well as before it, or an unmount mid-request still writes state.
    const body = code.slice(code.indexOf("const scoreJobs"), code.indexOf("}, [scores]);"));
    assert.ok(
      (body.match(/if \(!alive\(\)\) return;/g) ?? []).length >= 3,
      "alive must be checked before the request, after it, and in the catch",
    );
  });

  test("QA fixture renders make no network calls", () => {
    // Fixture pages have no session, so every request can only fail, and every row would render a
    // null badge that reads as "unscorable" rather than "not wired up".
    assert.match(code, /enabled: boolean = true/);
    assert.match(code, /if \(!enabled \|\| !jobs \|\| !resumeText\) return;/);
    assert.match(code, /if \(!enabled\) return;/);
  });
});

describe("the list scores the posting, not the preview of it", () => {
  test("the list sends no jd_text, so the route reads the full description", () => {
    /* The defect this closes, found on a real account 2026-08-04: GET /jobs sends
       `left(description, 600)`, and scoring that preview yields two or three requirement terms, so
       every posting fell under MIN_SCORABLE_TERMS and the dashboard drew no number at all. The
       suite was green throughout, because nothing tied the text the client sends to the text the
       job row holds. */
    assert.match(code, /fetchJdMatch\(null, resume, \{/);
    assert.doesNotMatch(code, /fetchJdMatch\(job\.description/);
  });

  test("the review screen still sends its own text", () => {
    // Its packet holds the JD captured when the resume was tailored to it. The live row may have
    // been edited since, and that screen's number must be about the document on the page.
    const matchScore = readFileSync("components/app/MatchScore.tsx", "utf8");
    assert.match(matchScore, /fetchJdMatch\(jdText,/);
  });

  test("the list request carries job_id", () => {
    // Without it the backend cannot read the posting's offices off the live job row, so the
    // employer's own cities land in the denominator and on the missing list. The review screen
    // sends it (see match-metric-coherence.regression-1), so a list that did not would be a second
    // number for the same posting, which is the thing ISSUE-014 exists to prevent.
    assert.match(code, /job_id: job\.id,/);
  });

  /* Was "Home's review drawer passes the whole stored job_context". The drawer is gone: reviewing a
     packet is one screen now, /dashboard/applications, so that is where the invariant lives.

     The invariant itself has not changed. `job_id` inside the stored job_context is what lets the
     backend read the posting's offices off the live job row and keep them out of the denominator.
     Picking company and role out of the object drops the id and scores the student against the
     employer's cities. */
  test("the review screen passes the whole stored job_context", () => {
    const applications = readFileSync("app/dashboard/applications/page.tsx", "utf8");
    assert.match(applications, /jobContext=\{selected\.job_context\}/);
    assert.doesNotMatch(applications, /jobContext=\{\{ company: selected\.job_context\.company/);
  });

  /* The other half, and the reason the drawer could drift at all: Home must not score a packet
     against a posting. It used to, in the drawer, which meant one packet had two review surfaces
     each computing its own number. Home ranks jobs and shows the already-fetched list score; the
     packet-vs-JD comparison belongs to the screen that can also explain it. */
  test("Home does not score a packet against a posting", () => {
    const home = readFileSync("app/dashboard/page.tsx", "utf8");
    assert.doesNotMatch(home, /<MatchScore/, "MatchScore belongs to the review screen, not to Home");
    assert.doesNotMatch(home, /jobContext=\{/, "Home passes no job_context: it scores no packet");
  });
});
