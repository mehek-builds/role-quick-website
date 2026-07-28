import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* The board's two pure helpers. Both look trivial and both have a way of being
   quietly wrong: agoLabel decides whether the page states a fact about the
   EMPLOYER (posted) or about us (found), and pageWindow is the only thing
   standing between a 300-page board and a nav bar with 300 links in it. */

const { agoLabel, pageWindow, pageCount, PER_PAGE } = await import(
  "../lib/browse-jobs.ts"
);

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-28T12:00:00Z");
const at = (days) => new Date(NOW - days * DAY).toISOString();

describe("agoLabel", () => {
  test("says POSTED only when the employer gave us a date", () => {
    assert.equal(
      agoLabel({ posted_at: at(3), first_seen_at: at(1) }, NOW),
      "POSTED 3 DAYS AGO",
    );
    /* The competitor stamps every row "Just now" regardless. When the board
       gives no date, the honest sentence is about when we saw it. */
    assert.equal(
      agoLabel({ posted_at: null, first_seen_at: at(3) }, NOW),
      "FOUND 3 DAYS AGO",
    );
  });

  test("reads naturally at the edges", () => {
    assert.equal(agoLabel({ posted_at: at(0), first_seen_at: at(0) }, NOW), "POSTED TODAY");
    assert.equal(agoLabel({ posted_at: at(1), first_seen_at: at(1) }, NOW), "POSTED YESTERDAY");
    assert.equal(agoLabel({ posted_at: at(45), first_seen_at: at(45) }, NOW), "POSTED 1 MONTH AGO");
    assert.equal(agoLabel({ posted_at: at(90), first_seen_at: at(90) }, NOW), "POSTED 3 MONTHS AGO");
  });

  test("a future timestamp does not render as a negative age", () => {
    /* Boards do publish tomorrow-dated postings. "POSTED -1 DAYS AGO" is the
       kind of thing that ships because nobody thinks to try it. */
    assert.equal(agoLabel({ posted_at: at(-2), first_seen_at: at(-2) }, NOW), "POSTED TODAY");
  });

  test("an unparseable timestamp renders nothing rather than NaN", () => {
    assert.equal(agoLabel({ posted_at: "not a date", first_seen_at: "also not" }, NOW), null);
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
