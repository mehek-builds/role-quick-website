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
// 12" reads 42% beside a badge of 64, "7 of 12" reads 58% beside a badge of 36. Brute-forced over
// every n from 4 to 12 the maximum is 22.67 points, at n of 6, 9 and 12. "4 of 12" beside a badge
// of 56 is reachable and can carry the label Strong match, since four covered `required` terms put
// required_coverage at 1 and 56 clears BAND_STRONG.
//
// Under the commoner 1-against-0.7 mix the badge-versus-caption gap maxes at 9.3 points, still
// worth copy. That is NOT the backend docblock's "5 of 12 is 46 or 35" figure, which measures the
// spread between two possible badges for one caption rather than badge against caption. (The
// docblock says 32; on its own fixture of eight terms at 1 and four at 0.7, total 10.8, the lowest
// "5 of 12" is 3.8/10.8 = 35. Pre-existing inaccuracy over there, not repeated here.)
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

/** Every surface that prints the count and the score in one breath.
 *
 *  `extraCarriers` is for a surface that hands the clause to more than one audience. The review
 *  screen is the only one: its ring's accessible name is the ONLY route a screen-reader user has to
 *  the correction, and its visible caption's tooltip is the only route a mouse user has. An
 *  either-or assertion let the aria-label be emptied with the suite green, which would have taken
 *  the clause away from exactly the audience that cannot see the ring at all. Both are required. */
const SURFACES = [
  { name: "Jobs", path: "app/dashboard/jobs/page.tsx", extraCarriers: [] },
  { name: "Home", path: "app/dashboard/page.tsx", extraCarriers: [] },
  { name: "Tracker next-best-match row", path: "components/app/Autopilot.tsx", extraCarriers: [] },
  {
    name: "the review screen",
    path: "components/app/MatchScore.tsx",
    extraCarriers: [
      [/title=\{MATCH_WEIGHTING_NOTE\}/, "the visible caption's tooltip, the only route for a mouse user"],
    ],
  },
];

describe("the weighting note is one string, and it says the right thing", () => {
  test("it explains that the score is weighted rather than the printed fraction", async () => {
    // Asserted as PROPERTIES of the sentence, not as one blessed wording, so a rewrite passes as
    // long as it still says some requirements matter more and still denies the division. A student
    // who can divide is the whole reason this exists.
    //
    // NOT asserted on the word "weigh". The first draft used it and was reworded to "count for
    // more" against tests/vocabulary.js's bar, so pinning the engineering verb would have pushed
    // the next author back up the reading level to keep this green.
    const note = await weightingNote();
    assert.ok(typeof note === "string", "the shared clause must exist and be a string");
    assert.match(note, /more than/i, "it must say some requirements matter more than others");
    assert.match(note, /requirements?/i, "it must be about the requirement terms");
    assert.match(note, /not that fraction/i, "it must deny that the score is the printed fraction");
    assert.ok(note.trim().length > 40, `too short to explain anything: "${note}"`);
  });

  test("it does not revive the ISSUE-023 overclaim", async () => {
    // The extractor's set is capped at EMPHASIS_LIMIT and is NOT the employer's stated set. This
    // clause is allowed to talk about how the counted set is weighted and never about whether it
    // is complete.
    //
    // CASE-INSENSITIVE, and that flag is the whole assertion. Without it this guard only caught
    // mid-sentence phrasings: "Requirements this posting lists as required count for more..." is
    // the NATURAL sentence-initial form of the banned ISSUE-023 wording, and it passed a
    // case-sensitive version of this line while the guard on the line below it, which always
    // carried /i, bit correctly. One test, two conventions, one hole.
    const note = await weightingNote();
    assert.doesNotMatch(note ?? "", /requirements this (posting|job posting) lists/i);
    assert.doesNotMatch(note ?? "", /\ball (of the )?requirements\b/i);
  });

  test("it does not restate the score as a second number", async () => {
    // "THESE ARE NOT A CURVE, and the number is never restated" (backend scoreBand). A percentage
    // in this clause would print the badge twice and invite the same comparison again.
    assert.doesNotMatch((await weightingNote()) ?? "", /\d+\s*%/);
  });
});

describe("every surface that prints the count beside the score carries the note", () => {
  for (const { name, path, extraCarriers } of SURFACES) {
    test(`${name} appends it to EVERY string that states the count`, () => {
      const src = code(readFileSync(path, "utf8"));
      assert.match(
        src,
        /MATCH_WEIGHTING_NOTE/,
        `${name} must carry the weighting clause, not leave the division to the student`,
      );
      // In the SAME template literal as the count, not parked in some unrelated string: a student
      // reading the caption has to be reading the qualifier too. `every`, not `some`: a surface
      // with two of these must not be allowed to correct one audience and not the other.
      const carriers = [...src.matchAll(/`[^`]*`/g)]
        .map((m) => m[0])
        .filter((lit) => /requirements (Litos counted|we counted)/.test(lit));
      assert.ok(carriers.length > 0, `${name} no longer states the counted denominator at all`);
      for (const lit of carriers) {
        assert.ok(
          lit.includes("${MATCH_WEIGHTING_NOTE}"),
          `${name} states the count without the qualifier beside it: ${lit}`,
        );
      }
    });

    for (const [pattern, why] of extraCarriers) {
      test(`${name} also carries it in ${why}`, () => {
        assert.match(code(readFileSync(path, "utf8")), pattern);
      });
    }

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
        /count for more than ones it only mentions/,
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
    for (const { name, path } of SURFACES) {
      const src = code(readFileSync(path, "utf8"));
      // Case-insensitive for the same reason the clause's own guard is: the sentence-initial form
      // is the one an author would naturally write, and a case-sensitive ban misses it.
      assert.doesNotMatch(src, /\brequirements this posting lists/i, `${name} overclaims`);
      assert.doesNotMatch(src, /\brequirements this job posting lists/i, `${name} overclaims`);
    }
  });
});
