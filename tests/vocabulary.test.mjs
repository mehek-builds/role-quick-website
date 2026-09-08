import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { findRetired, formatHits, userFacingStrings } from "./vocabulary.js";

/* Every surface a stranger or a signed-in user can read. QA fixtures are
   excluded: they exist to drive the portal-submission harness and are never
   shown to a user. */
const FILES = globSync(["app/**/*.tsx", "app/**/*.ts", "components/**/*.tsx", "lib/**/*.ts"], {
  exclude: (p) =>
    p.includes("node_modules") ||
    p.includes("/qa/") ||
    p.endsWith("qa-data.ts") ||
    p.includes(".test."),
});

describe("Litos vocabulary", () => {
  test("no user-facing copy uses a retired word", () => {
    assert.ok(FILES.length > 40, `expected the whole app, globbed only ${FILES.length} files`);
    const hits = findRetired(
      FILES.map((path) => ({ path, source: readFileSync(path, "utf8") }))
    );
    assert.equal(
      hits.length,
      0,
      `\n\nThe terminology audit retired these words. Reword, or add a \`vocab-allow\` comment on the line if you are certain.\n\n${formatHits(hits)}\n`
    );
  });

  test("the steps carry one name each", () => {
    const home = readFileSync("app/page.tsx", "utf8");
    const film = readFileSync("components/cinema/CinematicHero.tsx", "utf8");
    /* The film chapters and the section chips are two separate copies of the
       same step names. They drifted apart once already: the film said
       Documents / Autofill / Outreach while the sections said Documents /
       Forms / Emails, on the same scroll.

       There used to be a THIRD copy, in the scroll rail's SECTIONS table
       (components/cinema/CinematicPage.tsx). The rail was deleted on
       2026-07-28 in the deletion pass, so that copy is gone and this test no
       longer reads that file. Deleting a duplicate is the strongest possible
       fix for a drift guard: one fewer place to disagree. If a rail or any
       other third listing of the step names ever comes back, add it here.

       The two copies are no longer the same LENGTH, which is why this reads
       them as tables rather than asserting six fixed strings. #593
       (2026-09-08) removed the "03 · Emails" pillar section from the homepage
       and deliberately left the film's "03 · Emails" chapter alone, because
       that label is tied to actual video frames and renumbering it needs the
       film re-cut. The homepage therefore names a SUBSET of the film's steps.
       What must still hold, and what this checks, is that the steps the two
       DO share are named the same, and that neither table quietly renames a
       step behind the other's back. */

    /* Scoped to the CHAPTERS array so a comment discussing a label is not read
       as declaring one: the file also says "00 · Job found" in prose. */
    const chapters = film.match(/const CHAPTERS = \[([\s\S]*?)\];/);
    assert.ok(chapters, "could not find the film's CHAPTERS table");
    const filmSteps = new Map(
      [...chapters[1].matchAll(/"(\d\d) · ([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );
    const homeSteps = new Map(
      [...home.matchAll(/<PillarChip[^>]*>(\d\d) · ([^<]+)</g)].map((m) => [m[1], m[2]]),
    );

    /* The vocabulary itself, pinned. RETIRED in vocabulary.js retires
       "· documents", "· autofill" and "· outreach" in favour of exactly these
       three, so renaming the film without touching that list would leave the
       retired-word gate above and this table contradicting each other. */
    for (const [n, name] of [["01", "Resume"], ["02", "Forms"], ["03", "Emails"]]) {
      assert.equal(filmSteps.get(n), name, `film should name step ${n} "${name}"`);
    }

    /* The pillars the homepage ships today, listed by hand so that dropping
       another one fails here instead of shrinking what is checked. */
    for (const [n, name] of [["01", "Resume"], ["02", "Forms"]]) {
      assert.equal(
        homeSteps.get(n),
        name,
        `the section chips should name step ${n} "${name}"`,
      );
    }

    /* The drift guard proper, and the half that survives the two tables
       changing length: every step the homepage names carries the film's name
       for that number. A fourth pillar, or Emails coming back on the page
       under a new word, fails here. */
    for (const [n, name] of homeSteps) {
      assert.ok(
        filmSteps.has(n),
        `the section chips name step ${n}, which the film does not`,
      );
      assert.equal(
        name,
        filmSteps.get(n),
        `step ${n} is "${name}" on the page and "${filmSteps.get(n)}" in the film`,
      );
    }
  });

  test("the audience is named one way", () => {
    /* Who Litos is for was named three ways at once: the hero said "students",
       the store listing said "students and new grads", the old backend policy
       said "job seekers". It was fixed, then drifted straight back when a later
       commit renamed only the hero. Mehek's call, 2026-07-27: JOB SEEKERS.
       The store listing description is not in this repo, so it cannot be
       asserted here; it is the one copy a human still has to keep in step.

       This used to pin the hero eyebrow ("Free Chrome extension for job
       seekers, with a full web dashboard") as the one place the audience was
       named. #593 (2026-09-08) deleted that eyebrow deliberately and nothing
       replaced it, so right now no user-facing copy names the audience at all.
       Whether the audience SHOULD be named above the fold is a positioning
       call and Mehek's to make; this test only ever guarded consistency, which
       is what its name says: named one way, not named.

       So the pin is gone, and what replaces it is wider than the three-string
       blocklist it also replaces: wherever copy does name the audience, it has
       to say job seekers. That covers "students and new grads" and "college
       students", which were listed by hand before, plus whatever nobody has
       thought of yet, and it starts biting again on its own the moment an
       audience line comes back. */
    const AUDIENCE = /^job seekers\b/;

    /* Positioning frames only, and deliberately narrow. /for-career-centres
       says "students" legitimately, because it addresses career centres about
       the people they advise, and a looser pattern would fail that page for
       saying the true thing. Verified to produce no hits on the current tree,
       and to catch all three historical spellings of the drift. */
    const NAMES_AUDIENCE =
      /\b(?:extension|Litos)\s+(?:is\s+)?(?:for|built for|made for|designed for)\s+([a-z][a-z' -]*)/gi;

    /* userFacingStrings, not the raw source, so this history can be written
       down in a comment without the comment failing the test it explains. */
    for (const path of FILES) {
      for (const text of userFacingStrings(readFileSync(path, "utf8"))) {
        for (const m of text.matchAll(NAMES_AUDIENCE)) {
          const named = m[1].trim();
          assert.ok(
            AUDIENCE.test(named.toLowerCase()),
            `${path} says "${m[0].trim()}". The audience is "job seekers" everywhere, and it is named once here and once in the store listing description, which is not in this repo. Changing it means changing both in the same breath.`,
          );
        }
      }
    }
  });
});
