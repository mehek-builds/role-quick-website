import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { existsSync, readFileSync } from "node:fs";

/* The board's two pure helpers. Both look trivial and both have a way of being
   quietly wrong: agoLabel decides whether the page states a fact about the
   EMPLOYER (posted) or about us (found), and pageWindow is the only thing
   standing between a 300-page board and a nav bar with 300 links in it. */

const { agoLabel, pageWindow, pageCount, locationList, locationSummary, countLabel, PER_PAGE } =
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

describe("locationList", () => {
  test("splits a posting whose location is already a list", () => {
    /* Employers pack several cities into one location string. MongoDB posts
       "Boston; New York City; Pennsylvania" as a single posting, so grouping
       alone leaves an array of lists. */
    assert.deepEqual(
      locationList({ locations: ["Boston; New York City; Pennsylvania"], remote: false }),
      ["Boston", "New York City", "Pennsylvania"],
    );
  });

  test("dedupes across postings, case-insensitively, keeping first-seen order", () => {
    assert.deepEqual(
      locationList({ locations: ["London", "london", "Berlin; London"], remote: false }),
      ["London", "Berlin"],
    );
  });

  test("does not print an employer's leftover template text", () => {
    /* Stripe publishes live postings whose location is the literal word
       "LOCATION". Rendering it makes our page look broken for a mistake made on
       theirs. */
    assert.deepEqual(locationList({ locations: ["LOCATION"], remote: false }), ["Location not given"]);
    assert.deepEqual(locationList({ locations: ["TBD"], remote: true }), ["Remote"]);
    assert.deepEqual(locationList({ locations: [], remote: true }), ["Remote"]);
    assert.deepEqual(locationList({ locations: ["  "], remote: false }), ["Location not given"]);
  });

  test("a placeholder mixed in with real cities is dropped, not kept", () => {
    assert.deepEqual(
      locationList({ locations: ["New York, NY", "LOCATION"], remote: false }),
      ["New York, NY"],
    );
  });
});

describe("locationSummary", () => {
  test("names a few cities and counts the rest", () => {
    /* MongoDB posts one role in 23 places. Listing all of them buries the job
       title, and silently cutting the list would misstate where the job is, so
       the remainder is counted rather than dropped. */
    const many = Array.from({ length: 23 }, (_, i) => `City ${i + 1}`);
    const { shown, extra } = locationSummary({ locations: many, remote: false });
    assert.equal(shown.length, 3);
    assert.equal(extra, 20);
    assert.equal(shown.length + extra, 23);
  });

  test("no remainder when everything fits", () => {
    const { shown, extra } = locationSummary({ locations: ["London", "Berlin"], remote: false });
    assert.deepEqual(shown, ["London", "Berlin"]);
    assert.equal(extra, 0);
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

describe("company marks", () => {
  test("every mapped company has its file committed", async () => {
    /* The map and the image files are two halves of one thing, and only one of
       them shows up in a diff. A name added to the map without running
       scripts/fetch-company-logos.mjs ships a broken <img> to production, which
       renders as an empty box on every one of that company's tiles. */
    const { COMPANY_DOMAINS, logoSlug } = await import("../lib/company-logos.ts");
    const dir = new URL("../public/company/", import.meta.url);
    const missing = Object.keys(COMPANY_DOMAINS).filter(
      (c) => !existsSync(new URL(`${logoSlug(c)}.png`, dir)),
    );
    assert.deepEqual(
      missing,
      [],
      `no mark on disk for: ${missing.join(", ")}. Run: node --experimental-strip-types scripts/fetch-company-logos.mjs`,
    );
  });

  test("a company with no mark falls back instead of breaking", async () => {
    const { logoPath, monogram } = await import("../lib/company-logos.ts");
    /* Chime and Gusto are deliberately unmapped (they 403 every asset request),
       and the backend's source list can add a company at any time. Either way
       the board must degrade to an initial, not to an empty image box. */
    assert.equal(logoPath("Chime"), null);
    assert.equal(monogram("Chime"), "C");
    assert.equal(logoPath("Stripe"), "/company/stripe.png");
  });
});

describe("the three search fields", () => {
  const page = readFileSync(new URL("../app/browse-jobs/page.tsx", import.meta.url), "utf8");

  test("all three exist and are named what the API expects", () => {
    /* The field names ARE the API's query parameters and the shareable URL. A
       rename on either side silently returns the whole board instead of a
       search, which looks like a working page. */
    for (const name of ["title", "company", "location"]) {
      assert.match(page, new RegExp(`name="${name}"`), `no field named "${name}"`);
    }
  });

  test("each field offers suggestions without demanding one", () => {
    /* The datalist is what makes a field both a dropdown and a free-text box.
       Swapping it for a <select> would silently forbid searching for anything
       we had not already indexed. */
    assert.match(page, /<datalist/, "fields must offer a datalist");
    assert.doesNotMatch(page, /<select\b/, "a select would reject free text");
  });

  test("filters survive pagination", () => {
    /* Page 2 of a search must still be that search. hrefFor takes the whole
       filter set for exactly this reason. */
    assert.match(page, /hrefFor\(filters, /);
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
