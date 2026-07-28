import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* The board's two pure helpers. Both look trivial and both have a way of being
   quietly wrong: agoLabel decides whether the page states a fact about the
   EMPLOYER (posted) or about us (found), and pageWindow is the only thing
   standing between a 300-page board and a nav bar with 300 links in it. */

const { agoLabel, pageWindow, pageCount, locationLabel, countLabel, PER_PAGE } =
  await import("../lib/browse-jobs.ts");

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-28T12:00:00Z");
const at = (days) => new Date(NOW - days * DAY).toISOString();
const job = (over) => ({ posted_at: null, first_seen_at: at(1), ats_name: "lever", ...over });

describe("agoLabel", () => {
  test("says POSTED where the board gave a real publish date", () => {
    for (const ats of ["lever", "ashby"]) {
      assert.equal(
        agoLabel(job({ posted_at: at(3), ats_name: ats }), NOW),
        "POSTED 3 DAYS AGO",
      );
    }
  });

  test("says UPDATED on Greenhouse, whose date is not a publish date", () => {
    /* Greenhouse's board API exposes only updated_at, which moves every time
       anyone edits the posting: 620 of 5,920 Greenhouse rows carried today's
       date on the day they were first pulled. Calling that POSTED would print
       "POSTED TODAY" down the whole page, which is the competitor's "Just now"
       with our name on it. */
    assert.equal(
      agoLabel(job({ posted_at: at(3), ats_name: "greenhouse" }), NOW),
      "UPDATED 3 DAYS AGO",
    );
  });

  test("says FOUND when there is no employer date at all", () => {
    assert.equal(agoLabel(job({ posted_at: null, first_seen_at: at(3) }), NOW), "FOUND 3 DAYS AGO");
  });

  test("reads naturally at the edges", () => {
    assert.equal(agoLabel(job({ posted_at: at(0) }), NOW), "POSTED TODAY");
    assert.equal(agoLabel(job({ posted_at: at(1) }), NOW), "POSTED YESTERDAY");
    assert.equal(agoLabel(job({ posted_at: at(45) }), NOW), "POSTED 1 MONTH AGO");
    assert.equal(agoLabel(job({ posted_at: at(90) }), NOW), "POSTED 3 MONTHS AGO");
  });

  test("a future timestamp does not render as a negative age", () => {
    /* Boards do publish tomorrow-dated postings. "POSTED -1 DAYS AGO" is the
       kind of thing that ships because nobody thinks to try it. */
    assert.equal(agoLabel(job({ posted_at: at(-2) }), NOW), "POSTED TODAY");
  });

  test("an unparseable timestamp renders nothing rather than NaN", () => {
    assert.equal(agoLabel(job({ posted_at: "not a date" }), NOW), null);
  });
});

describe("locationLabel", () => {
  test("passes a real location straight through", () => {
    assert.equal(locationLabel({ location: "New York, NY", remote: false }), "New York, NY");
  });

  test("does not print an employer's leftover template text", () => {
    /* Stripe publishes three live postings whose location is the literal word
       "LOCATION". Rendering it verbatim makes our page look broken for a
       mistake made on theirs. */
    assert.equal(locationLabel({ location: "LOCATION", remote: false }), "Location not given");
    assert.equal(locationLabel({ location: "TBD", remote: true }), "Remote");
    assert.equal(locationLabel({ location: null, remote: true }), "Remote");
    assert.equal(locationLabel({ location: "  ", remote: false }), "Location not given");
  });
});

describe("countLabel", () => {
  test("prints a bare numeral, because a mono comma reads as a typo", () => {
    /* In Azeret Mono every glyph gets the same advance, so "7,106" renders on
       the page as "7 , 106" — in the one number the whole page is judged on. */
    assert.equal(countLabel(7106), "7106");
    assert.ok(!countLabel(7106).includes(","));
  });
});

describe("pageWindow", () => {
  test("a 300-page board never prints 300 links", () => {
    const w = pageWindow(150, 300);
    assert.ok(w.length <= 9, `window was ${w.length} wide: ${w.join(",")}`);
    assert.deepEqual(w, [1, "gap", 148, 149, 150, 151, 152, "gap", 300]);
  });

  test("keeps first and last reachable from anywhere", () => {
    for (const current of [1, 2, 7, 299, 300]) {
      const w = pageWindow(current, 300);
      assert.equal(w[0], 1);
      assert.equal(w[w.length - 1], 300);
      assert.ok(w.includes(current), `page ${current} missing from its own window`);
    }
  });

  test("no gap marker where the pages are already contiguous", () => {
    assert.deepEqual(pageWindow(2, 4), [1, 2, 3, 4]);
    assert.deepEqual(pageWindow(1, 1), [1]);
  });
});

describe("pageCount", () => {
  test("counts partial pages and never returns zero", () => {
    assert.equal(pageCount(0), 1);
    assert.equal(pageCount(1), 1);
    assert.equal(pageCount(PER_PAGE), 1);
    assert.equal(pageCount(PER_PAGE + 1), 2);
    assert.equal(pageCount(7106), Math.ceil(7106 / PER_PAGE));
  });
});

describe("the board's layout", () => {
  test("a tile can shrink below its own nowrap content", () => {
    /* The location line is `truncate`, which is white-space: nowrap, and a grid
       item defaults to min-width: auto — so the track grew to fit the longest
       unwrapped location instead of clipping it. On a 375px phone the document
       came out 809px wide and the whole page scrolled sideways, while desktop
       looked perfect and review showed nothing. min-w-0 is what lets truncate
       do its job. Asserted rather than eyeballed because the failure is
       invisible everywhere except on a phone. */
    const page = readFileSync(new URL("../app/browse-jobs/page.tsx", import.meta.url), "utf8");
    const tile = page.match(/className="group flex[^"]*"/);
    assert.ok(tile, "could not find the tile's className");
    assert.match(tile[0], /\bmin-w-0\b/, "the tile needs min-w-0 or the board scrolls sideways on mobile");
  });
});

describe("the board's honesty", () => {
  test("the page does not describe a crawled board as hand-checked", () => {
    /* It shipped that way for one commit: the copy was written for a 47-row
       file in the repo and the data source changed underneath it. A crawl that
       calls itself hand-checked is the exact claim this site exists to not
       make. */
    const page = readFileSync(new URL("../app/browse-jobs/page.tsx", import.meta.url), "utf8");
    for (const claim of ["checked by hand", "hand-checked", "curated", "verified by hand"]) {
      assert.ok(
        !page.toLowerCase().includes(claim),
        `browse-jobs still claims "${claim}", but the board is a daily crawl`,
      );
    }
  });
});
