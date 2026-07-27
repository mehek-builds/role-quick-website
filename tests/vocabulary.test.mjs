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
});
