import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Imported lazily, not at module scope. A top-level import of a name the module does not export
   throws before any test runs, so the pre-fix state failed as ONE unresolved import and every
   per-surface assertion below was silently never evaluated. This way each test fails on its own
   merits, which is what makes the mutation runs below meaningful. */
const weightingNote = async () =>
  (await import("../features/applications/domain/match-model.ts")).MATCH_WEIGHTING_NOTE;

// Regression: ISSUE-041, the caption is a COUNT and the badge beside it is WEIGHTED coverage, and
// nothing on any surface said so. Found by a live production audit on 2026-08-04.
//
// Databricks' "Product Management Intern (Summer 2027)" rendered a `54% match` badge whose own
// tooltip read "your resume covers 2 of the 4 requirements Litos counted in this posting". Two of
// four is fifty. That posting extracts four terms of total weight 3.7 (1, 1, 1, 0.7), so two
// weight-1 terms give 2 / 3.7 = 54 next to a caption of 2 of 4.
//
// WHY THIS IS NOT COSMETIC, which is the reading it has to survive. Section weights run 1 (under a
// requirements heading) down to 0.4 (unlabelled prose) and the kept term set runs 4 to 12, so the
// gap is bounded by every covered term at 1 against every missed one at 0.4 and its reverse: "5 of
// 12" reads 42% beside a badge of 64, "7 of 12" reads 58% beside a badge of 36. Around 22 points
// either way, and wide enough to straddle a band line - the backend scorer records "5 of 12"
// scoring 46 or 32 on its own SWE fixture, Strong or Solid on identical caption text.
//
// THE FIX IS THE CLAUSE, NOT A SECOND NUMBER. Restating the weighted share in words would print
// the badge twice, and the count is the fact the student acts on: it is the size of the gap list.
// So both facts stay and the relationship stops being left to a reader's division.
//
// WHAT THESE HOLD, and why each is here rather than covered by the ISSUE-023 suite next door:
// match-metric-coherence pins the SENTENCE each surface prints and would stay green with the
// weighting clause deleted from all four (verified by mutation, 2026-08-04). What is unheld
// without this file is that the clause exists at all, that it is ONE string rather than four
// copies free to drift, and that it does not smuggle back ISSUE-023's banned wording.

/** Comments are stripped before scanning, so the record of WHY may quote the thing it checks for. */
const code = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

/** Every surface that prints the count and the score in one breath. */
const SURFACES = [
  ["Jobs", "app/dashboard/jobs/page.tsx"],
  ["Home", "app/dashboard/page.tsx"],
  ["Tracker next-best-match row", "components/app/Autopilot.tsx"],
  ["the review screen", "components/app/MatchScore.tsx"],
];

describe("the weighting note is one string, and it says the right thing", () => {
  test("it explains that the score is weighted rather than the printed fraction", async () => {
    // Asserted as PROPERTIES of the sentence, not as one blessed wording, so a rewrite passes as
    // long as it still names weighting and still denies the division. A student who can divide is
    // the whole reason this exists.
    const note = await weightingNote();
    assert.ok(typeof note === "string", "the shared clause must exist and be a string");
    assert.match(note, /weigh/i, "it must name the weighting");
    assert.match(note, /requirements?/i, "it must be about the requirement terms");
    assert.ok(note.trim().length > 40, `too short to explain anything: "${note}"`);
  });

  test("it does not revive the ISSUE-023 overclaim", async () => {
    // The extractor's set is capped at EMPHASIS_LIMIT and is NOT the employer's stated set. This
    // clause is allowed to talk about how the counted set is weighted and never about whether it
    // is complete.
    const note = await weightingNote();
    assert.doesNotMatch(note ?? "", /requirements this (posting|job posting) lists/);
    assert.doesNotMatch(note ?? "", /\ball (of the )?requirements\b/i);
  });

  test("it does not restate the score as a second number", async () => {
    // "THESE ARE NOT A CURVE, and the number is never restated" (backend scoreBand). A percentage
    // in this clause would print the badge twice and invite the same comparison again.
    assert.doesNotMatch((await weightingNote()) ?? "", /\d+\s*%/);
  });
});

describe("every surface that prints the count beside the score carries the note", () => {
  for (const [name, path] of SURFACES) {
    test(`${name} appends it to the string that states the count`, () => {
      const src = code(readFileSync(path, "utf8"));
      assert.match(
        src,
        /MATCH_WEIGHTING_NOTE/,
        `${name} must carry the weighting clause, not leave the division to the student`,
      );
      // In the SAME template literal as the count, not parked in some unrelated string: a student
      // reading the caption has to be reading the qualifier too.
      const carriers = [...src.matchAll(/`[^`]*`/g)]
        .map((m) => m[0])
        .filter((lit) => /requirements (Litos counted|we counted)/.test(lit));
      assert.ok(carriers.length > 0, `${name} no longer states the counted denominator at all`);
      assert.ok(
        carriers.some((lit) => lit.includes("${MATCH_WEIGHTING_NOTE}")) ||
          /title=\{MATCH_WEIGHTING_NOTE\}/.test(src),
        `${name} states the count without the qualifier beside it`,
      );
    });

    test(`${name} imports the note rather than copying its words`, () => {
      const src = code(readFileSync(path, "utf8"));
      assert.match(
        src,
        /import\s*\{[^}]*MATCH_WEIGHTING_NOTE[^}]*\}\s*from\s*"@\/features\/applications"/,
        `${name} must import the shared clause`,
      );
      // Four hand-written copies is how the caption drifted onto four surfaces in the first place.
      assert.doesNotMatch(
        src,
        /weigh more than ones it only mentions/,
        `${name} has an inlined copy of the clause`,
      );
    });
  }
});

describe("the ISSUE-023 wording the note sits next to is untouched", () => {
  // Appending must not have edited the pinned sentence underneath it. These duplicate assertions
  // that live in match-metric-coherence and preference-score-copy ON PURPOSE: this change appends
  // to exactly those literals, so the file doing the appending is the one that should fail if a
  // future edit folds the clause in and rewrites them.
  test("no surface says the posting's full list", () => {
    for (const [name, path] of SURFACES) {
      const src = code(readFileSync(path, "utf8"));
      assert.doesNotMatch(src, /requirements this posting lists/, `${name} overclaims`);
      assert.doesNotMatch(src, /requirements this job posting lists/, `${name} overclaims`);
    }
  });
});
