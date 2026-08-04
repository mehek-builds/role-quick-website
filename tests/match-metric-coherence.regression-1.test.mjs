import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { rankJobs } from "../features/applications/domain/daily-matches.ts";
import { nextMatchScoreRequest } from "../features/applications/domain/match-model.ts";

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
  /* Stripped for POSITIVE assertions too, not just the negative ones. These two files now carry a
     lot of explanatory prose, and a positive assertion that matches raw source can be satisfied by
     a comment quoting the string it is supposed to be checking for. */
  const jobsPage = code(readFileSync("app/dashboard/jobs/page.tsx", "utf8"));
  const homePage = code(readFileSync("app/dashboard/page.tsx", "utf8"));
  /* ISSUE-038 added this third file. "Every surface" was in this describe's title and only Jobs and
     Home were ever in the list, which is how the Tracker's next-best-match row went on printing a
     different number for the same posting (33 on Home, 42% here) through the whole of the one-number
     work on 2026-08-04. A title is not an assertion. Behaviour for this row is asserted in
     tests/next-match-score-source.regression-1.test.mjs; what belongs HERE is that it is in the
     list at all. */
  const trackerPage = code(readFileSync("app/dashboard/applications/page.tsx", "utf8"));

  test("both screens read the same hook", () => {
    for (const [name, src] of [["Jobs", jobsPage], ["Home", homePage]]) {
      assert.match(src, /useJobMatchScores\(/, `${name} must score via the shared hook`);
    }
  });

  test("the Tracker's next-best-match row reads the same metric the hook does", () => {
    // Not the hook itself: this is ONE packet, not a list of postings, so it makes the same request
    // by hand. What has to be shared is the SUBJECT and the endpoint, which is what these check.
    assert.match(trackerPage, /getBaseResume\(\)/, "the Tracker row must score the base resume");
    assert.match(trackerPage, /fetchJdMatch\(request\.jdText, request\.resumeText, request\.jobContext\)/);
    assert.doesNotMatch(trackerPage, /resumeSpecText\(nextPacket\.spec\)/, "the tailored packet is not the subject of this row");
  });

  test("no list surface renders preference_score as a number", () => {
    // preference_score never opens the resume. It may order the feed and it may name reasons; it
    // may not be the number a student reads as a match.
    for (const [name, src] of [["Jobs", jobsPage], ["Home", homePage], ["Tracker", trackerPage]]) {
      assert.doesNotMatch(src, /\bpreference_score\b/, `${name} must not render preference_score`);
    }
  });

  test("the badge says match, and its tooltip names the denominator", () => {
    assert.match(jobsPage, /\{pct\}% match/);
    assert.doesNotMatch(jobsPage, /\{pct\}% fit/);
    // The objection that retired the first version of this badge was that a bare percentage in a
    // list carries no band, no denominator and no refusal state. All three ride along now.
    //
    // The qualifier is ISSUE-023's, and it is not decoration: term_count is capped at
    // EMPHASIS_LIMIT, so it is what Litos COUNTED, not everything the posting lists. The caption
    // suite below holds the same rule for MatchScore; a list badge may not overclaim where the
    // review screen is forbidden to.
    assert.match(jobsPage, /requirements Litos counted in this posting/);
    // Either number, either case. The plural-only spelling of this ban is how the singular form
    // shipped live in the review screen's zero-gaps line: a ban that holds in one grammatical
    // number bans a spelling, not the claim.
    assert.doesNotMatch(jobsPage, /\brequirements? this (job )?posting lists/i);
  });

  test("the Tracker row's badge carries the same band and denominator", () => {
    // ISSUE-038 put this badge on a third surface and left it unheld, which is the SAME omission
    // ISSUE-038 was about: "every surface" enumerated two. Verified 2026-08-04 by mutation, with
    // the band dropped and with the denominator dropped; both left the suite green before this.
    const nextMatchRow = code(readFileSync("components/app/Autopilot.tsx", "utf8"));
    assert.match(nextMatchRow, /match\.match\.band \?\? "Match"/, "the row must name the band");
    assert.match(nextMatchRow, /\$\{match\.match\.matched\} of the \$\{match\.match\.total\} requirements Litos counted/);
    // Singular included for the same reason as the Jobs badge above.
    assert.doesNotMatch(nextMatchRow, /\brequirements? this (job )?posting lists/i);
  });

  test("the preference sentence does not borrow the score's word", () => {
    // "0% match" over "Matches your product, San Francisco, CA, internship" is the original defect.
    // Both facts are worth showing; they just cannot both be called matching.
    for (const [name, src] of [["Jobs", jobsPage], ["Home", homePage]]) {
      assert.match(src, /You asked for \{/, `${name} must caption preference reasons as an ask`);
      assert.doesNotMatch(src, /Matches your \{/, `${name} must not caption them as a match`);
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

  test("backend order is preserved even when the scores disagree with it", () => {
    // Asserted against an input where document order and score order CONFLICT. Against an already
    // sorted list this passes for any implementation that does not deliberately re-sort, which is
    // no assertion at all. GET /jobs is the single ranking authority: a higher preference_score
    // further down the list must not be hoisted.
    const lowerScoreFirst = { ...job, id: "1", preference_score: 12 };
    const higherScoreSecond = { ...job, id: "2", preference_score: 96 };
    assert.deepEqual(
      rankJobs([lowerScoreFirst, higherScoreSecond]).map((r) => r.id),
      ["1", "2"],
      "rankJobs must not re-sort by preference_score",
    );
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


// B3: the review screen is the only surface still showing resume coverage, so it is the one that
// most needs the posting's offices out of its denominator and its missing list. A packet stores no
// location, so the id is what lets the backend read it off the live job row.
describe("the review screen sends what the backend needs to exclude the posting's offices", () => {
  test("the next-match score request carries the job id", () => {
    // The invariant is unchanged. Its subject moved: ISSUE-038 lifted the request out of the effect
    // and into nextMatchScoreRequest, so this is asserted on the value that function produces
    // rather than on the literal that used to sit in the page. A regex over page source could not
    // follow it, and deleting the test rather than moving it is how this invariant got broken once
    // already.
    const request = nextMatchScoreRequest(
      { id: "p1", job_context: { company: "PsiQuantum", role: "Intern", job_id: "job-1" }, spec: { _review: { jd_text: "text" } } },
      "base resume",
    );
    assert.equal(request.jobContext.job_id, "job-1");
    const applications = code(readFileSync("app/dashboard/applications/page.tsx", "utf8"));
    assert.match(applications, /nextMatchScoreRequest\(nextPacket, baseResumeText\)/, "the page must build the request through it");
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

  // Walks to the end of one JSX opening tag from its "<", stepping over `{...}` expressions and
  // template literals so an attribute value containing ">" cannot end the tag early.
  const tagEnd = (source, start) => {
    let depth = 0;
    let inTemplate = false;
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (inTemplate) {
        if (c === "`") inTemplate = false;
      } else if (c === "`") inTemplate = true;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) return i + 1;
    }
    return source.length;
  };

  // The score ring's aria-label, selected by ANCHORING to the element that renders it rather than
  // by position in the file. The earlier version read `matchScore.match(/aria-label=\{`(...)`\}/)`,
  // and `String.match` without /g returns the FIRST hit only: it was the ring's label purely
  // because the ring happened to own the file's first template-literal aria-label. Add one above it
  // and the ban AND the positive assertion below would both have silently retargeted to the new
  // string, leaving the ring's real label unasserted while the suite stayed green. It also never
  // saw plain-string labels like the evidence dot's at all. strokeDasharray is the ring's
  // structural marker (the refusal test below anchors to the same one), and the ring's wrapper is
  // the last role="img" opened before it.
  const ringAriaLabel = (source) => {
    const ringAt = source.indexOf("strokeDasharray");
    assert.notEqual(ringAt, -1, "the ring must still be rendered");
    let tagStart = -1;
    for (const m of source.matchAll(/\srole="img"/g)) {
      if (m.index > ringAt) break;
      const open = source.lastIndexOf("<", m.index);
      if (open !== -1) tagStart = open;
    }
    assert.notEqual(tagStart, -1, 'the ring must keep its role="img" wrapper');
    const tag = source.slice(tagStart, tagEnd(source, tagStart));
    // Both quoting forms, so moving the label off a template literal cannot drop it out of scope.
    const label = tag.match(/aria-label=(?:\{`([^`]*)`\}|"([^"]*)")/);
    assert.ok(label, "the ring must keep an aria-label");
    return label[1] ?? label[2];
  };

  test("the accessible label carries the same qualifier the caption does", () => {
    // A screen reader user gets ONLY this string, so it is the one that must not overclaim.
    const aria = ringAriaLabel(matchScore);
    // Singular included: the same file shipped "Every requirement this posting lists" in visible
    // copy while every plural-only ban in this suite read straight past it.
    assert.doesNotMatch(aria, /\brequirements? this (job )?posting lists/i);
    assert.match(aria, /requirements Litos counted/);
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
