import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { findRetired, formatHits } from "./vocabulary.js";

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

  test("the three steps carry one name each", () => {
    const home = readFileSync("app/page.tsx", "utf8");
    const film = readFileSync("components/cinema/CinematicHero.tsx", "utf8");
    const rail = readFileSync("components/cinema/CinematicPage.tsx", "utf8");
    /* The film, the section chips and the scroll rail are three separate copies
       of the same three step names. They drifted apart once already: the film
       said Documents / Autofill / Outreach while the sections said Documents /
       Forms / Emails, on the same scroll. */
    for (const [name, src] of [["film", film], ["rail", rail]]) {
      assert.match(src, /01 · Resume/, `${name} should name step 1 "Resume"`);
      assert.match(src, /02 · Forms/, `${name} should name step 2 "Forms"`);
      assert.match(src, /03 · Emails/, `${name} should name step 3 "Emails"`);
    }
    assert.match(home, /01 · Resume/, "the section chips should name step 1 \"Resume\"");
  });

  test("the audience is named one way", () => {
    /* Who Litos is for was named three ways at once: the hero said "students",
       the store listing said "students and new grads", the old backend policy
       said "job seekers". It was fixed, then drifted straight back when a later
       commit renamed only the hero. Mehek's call, 2026-07-27: JOB SEEKERS.
       The store listing description is not in this repo, so it cannot be
       asserted here; it is the one copy a human still has to keep in step. */
    const AUDIENCE = "job seekers";
    const hero = readFileSync("components/cinema/CinematicHero.tsx", "utf8");
    assert.match(
      hero,
      new RegExp(`Free Chrome extension for ${AUDIENCE}`, "i"),
      `the hero must say "${AUDIENCE}". Changing it means changing the store listing description in the same breath.`
    );
    const everywhere = FILES.map((p) => readFileSync(p, "utf8")).join("\n");
    for (const name of ["students and new grads", "students", "college students"]) {
      assert.ok(
        !new RegExp(`extension for ${name}\\b`, "i").test(everywhere),
        `"extension for ${name}" is a second name for the audience. It is "${AUDIENCE}" everywhere.`
      );
    }
  });
});
