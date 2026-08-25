import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { existsSync, readFileSync } from "node:fs";

/* The board's two pure helpers. Both look trivial and both have a way of being
   quietly wrong: agoLabel decides whether the page states a fact about the
   EMPLOYER (posted) or about us (found), and pageWindow is the only thing
   standing between a 300-page board and a nav bar with 300 links in it. */

const {
  agoLabel,
  pageWindow,
  pageCount,
  locationList,
  locationSummary,
  countLabel,
  parseJobsPageBody,
  PER_PAGE,
} =
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
  test("uses thousands separators so roles and openings are scannable", () => {
    assert.equal(countLabel(7106), "7,106");
    assert.equal(countLabel(10246), "10,246");
  });
});

describe("parseJobsPageBody", () => {
  test("keeps grouped roles and raw openings as separate counts", () => {
    assert.deepEqual(
      parseJobsPageBody({
        jobs: [{ id: "one", locations: null }],
        total: 8_221,
        postings_total: 10_246,
      }),
      {
        jobs: [{ id: "one", locations: [] }],
        total: 8_221,
        postingsTotal: 10_246,
        ok: true,
      },
    );
  });

  test("supports an older backend that has not deployed postings_total yet", () => {
    assert.deepEqual(parseJobsPageBody({ jobs: [], total: 0 }), {
      jobs: [],
      total: 0,
      postingsTotal: null,
      ok: true,
    });
  });

  test("treats malformed inventory as an API fault instead of false zero demand", () => {
    const malformed = [
      {},
      { jobs: "not-an-array", total: 0 },
      { jobs: [null], total: 1 },
      { jobs: [], total: "many" },
      { jobs: [], total: -1 },
      { jobs: [{ id: "one" }], total: 0 },
      { jobs: [], total: 4, postings_total: 3 },
      { jobs: [], total: 0, postings_total: -1 },
    ];
    for (const body of malformed) {
      assert.deepEqual(parseJobsPageBody(body), {
        jobs: [],
        total: 0,
        postingsTotal: null,
        ok: false,
      });
    }
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
       item defaults to min-width: auto, so the track grew to fit the longest
       unwrapped location instead of clipping it. On a 375px phone the document
       came out 809px wide and the whole page scrolled sideways, while desktop
       looked perfect and review showed nothing. min-w-0 is what lets truncate
       do its job. Asserted rather than eyeballed because the failure is
       invisible everywhere except on a phone. */
    const page = readFileSync(new URL("../app/browse-jobs/page.tsx", import.meta.url), "utf8");
    const tile = page.match(/className="group relative flex[^"]*"/);
    assert.ok(tile, "could not find the tile's className");
    assert.match(tile[0], /\bmin-w-0\b/, "the tile needs min-w-0 or the board scrolls sideways on mobile");
  });

  test("the headline distinguishes grouped roles from raw openings", () => {
    const page = readFileSync(new URL("../app/browse-jobs/page.tsx", import.meta.url), "utf8");
    assert.match(page, /postingsTotal === null/);
    assert.match(page, /\{" "\}across\{" "\}/);
    assert.match(page, /"opening" : "openings"/);
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
    /* Was an assertion that a <datalist> existed. The datalist is gone: the
       page draws its own list now, because a browser-drawn popup cannot be made
       to sit under its field or wear the page's type. What must not change is
       the property the datalist was there for: suggestions are offered, never
       required. A <select> would silently forbid searching for anything we had
       not already indexed.

       SCOPED TO THE THREE SEARCH FIELDS, not to the page. It used to ban <select>
       anywhere in the file, which read as the same rule and is not: the Job type
       filter added later IS a select, deliberately, because employment type is a
       closed vocabulary of four words the backend will accept and a text box
       there invites "intern", "Interns" and "INTERNSHIP", three spellings that
       all return nothing while looking like an honest empty result. The invariant
       is about title, company and location, which are open sets. A test that
       cannot tell an open set from a closed one blocks the right change and
       reads like a real failure while doing it. */
    const combo = readFileSync(new URL("../components/browse/ComboField.tsx", import.meta.url), "utf8");
    assert.match(combo, /role="listbox"/, "fields must offer a list");
    assert.match(combo, /type="text"/, "and the field itself must stay free text");
    assert.doesNotMatch(combo, /<select\b/, "a search field must never become a select");

    /* Each of the three is rendered by ComboField, which is what makes it free
       text. Asserted per field rather than by counting selects, so replacing one
       of them with a select fails here whatever else the page grows. */
    for (const name of ["title", "company", "location"]) {
      assert.match(
        page,
        new RegExp(`<ComboField\\s+name="${name}"`),
        `"${name}" is an open set and must stay a free-text combo`,
      );
    }
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

describe("the three dropdowns", () => {
  const page = readFileSync(new URL("../app/browse-jobs/page.tsx", import.meta.url), "utf8");

  test("the title field offers fifty role families, not raw postings", async () => {
    /* Mehek, 2026-07-29: fifty common titles, nothing more. The suggestions
       used to be the board's most common RAW titles, so the field opened on
       "Senior Product Manager - Network Path", a real posting, and not a thing
       anyone types into a box labelled Job title. */
    const { JOB_TITLES } = await import("../lib/job-titles.ts");
    assert.equal(JOB_TITLES.length, 50, `expected 50 titles, got ${JOB_TITLES.length}`);
    assert.equal(new Set(JOB_TITLES).size, 50, "the list must not repeat a title");
    for (const t of JOB_TITLES) {
      assert.ok(t.length < 40, `"${t}" reads like a posting, not a role family`);
      assert.ok(!/[-–\u2014(]/.test(t), `"${t}" carries posting punctuation`);
    }
  });

  test("every field ends with Other", async () => {
    const { withOther, OTHER } = await import("../lib/job-titles.ts");
    assert.equal(withOther(["A", "B"]).at(-1), OTHER);
    /* All three lists are wrapped, not just the curated one. */
    assert.equal((page.match(/withOther\(/g) ?? []).length, 3, "all three fields need Other");
  });

  test("choosing Other means no filter, not a search for the word", async () => {
    /* Searching the literal word would return the few postings with "other" in
       the title, which is the opposite of what someone picking it wants. */
    const { isOther } = await import("../lib/job-titles.ts");
    for (const v of ["Other", "other", "  OTHER  "]) assert.ok(isOther(v), v);
    for (const v of ["Software Engineer", "", undefined, "Otherworldly Inc"]) {
      assert.ok(!isOther(v), String(v));
    }
    assert.match(page, /isOther\(value\) \? "" : value/, "clean() must drop an Other value");
  });

  test("the page no longer asks the API for titles", async () => {
    /* The endpoint stopped returning them; reading a field that is gone would
       silently leave the dropdown empty. */
    const lib = readFileSync(new URL("../lib/browse-jobs.ts", import.meta.url), "utf8");
    assert.ok(!/facets\.titles/.test(page), "the page must use the curated list");
    assert.ok(!/titles: string\[\]/.test(lib), "Facets must not still declare titles");
  });
});

describe("the search fields are the page's own, not the browser's", () => {
  const combo = readFileSync(new URL("../components/browse/ComboField.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/browse-jobs/page.tsx", import.meta.url), "utf8");

  test("no datalist anywhere", () => {
    /* A <datalist> popup is browser chrome: it renders in the system font at
       the system size, sets its own width and places itself where it likes.
       None of that is reachable from CSS, which is why it read as borrowed from
       another application and sat off the field it belonged to. */
    /* Matched on the JSX tag, not the word: both files explain in prose WHY
       there is no datalist, and an over-broad regex failed on its own comments. */
    assert.ok(!/<datalist[\s>]/.test(page.replace(/\/\*[\s\S]*?\*\//g, "")), "the page must not fall back to a datalist");
    assert.ok(!/<datalist[\s>]/.test(combo.replace(/\/\*[\s\S]*?\*\//g, "")), "the field must not fall back to a datalist");
  });

  test("the list is positioned against the field, not the page", () => {
    /* top-full + inset-x-0 is what puts it directly under the field at exactly
       the field's width. Losing either is how it drifts again. */
    assert.match(combo, /top-full/);
    assert.match(combo, /inset-x-0/);
    assert.match(combo, /className="relative/, "the wrapper must be the positioning context");
  });

  test("choosing with the keyboard does not submit the half-typed text", () => {
    /* Enter picks the highlighted row and must preventDefault, or the form
       searches for whatever was typed instead of what was chosen. */
    assert.match(combo, /event\.key === "Enter" && open && active >= 0/);
    assert.match(combo, /event\.preventDefault\(\);\s*\n\s*choose\(matches\[active\]\)/);
  });

  test("options commit on pointerdown, because click comes after blur", () => {
    assert.match(combo, /onPointerDown=\{\(event\) => \{/);
    assert.ok(!/onClick=\{\(\) => choose/.test(combo), "click fires too late to catch the choice");
  });

  test("it is a real form field and a real combobox", () => {
    /* The value has to submit with the surrounding GET form, so a search stays
       a shareable URL, and the roles are what make it usable without a mouse. */
    assert.match(combo, /name=\{name\}/);
    assert.match(combo, /role="combobox"/);
    assert.match(combo, /role="listbox"/);
    assert.match(combo, /role="option"/);
    assert.match(combo, /aria-activedescendant/);
  });

  test("matching is substring, not prefix", () => {
    /* Someone typing "engineer" means to find "Machine Learning Engineer". */
    assert.match(combo, /\.toLowerCase\(\)\.includes\(needle\)/);
  });
});

describe("the dropdowns read A to Z", () => {
  test("options are alphabetical, case-insensitively", async () => {
    /* The board carries "onemedical", "iHerb" and "tebra" next to "Stripe". A
       plain sort puts every lower-case name after every capitalised one, which
       is not what alphabetical means to a reader. */
    const { alphabetical } = await import("../lib/job-titles.ts");
    assert.deepEqual(
      alphabetical(["Stripe", "onemedical", "Adyen", "iHerb", "tebra"]),
      ["Adyen", "iHerb", "onemedical", "Stripe", "tebra"],
    );
  });

  test("it sorts a copy, leaving the source list alone", async () => {
    /* JOB_TITLES is stored in measured order so the counts beside each entry
       stay meaningful. Sorting in place would quietly destroy that record. */
    const { alphabetical, JOB_TITLES } = await import("../lib/job-titles.ts");
    const before = [...JOB_TITLES];
    alphabetical(JOB_TITLES);
    assert.deepEqual(JOB_TITLES, before, "the stored order must survive");
  });

  test("every field is sorted, and Other is always last", async () => {
    /* Other is not one of the options, it is the sentence telling you the box is
       yours to type in, so it must not sort in among the O's. */
    const { withOther, OTHER } = await import("../lib/job-titles.ts");
    const out = withOther(["Zebra", "Other-Worldly Inc", "apple", "Mango"]);
    assert.equal(out.at(-1), OTHER);
    const body = out.slice(0, -1);
    assert.deepEqual(body, [...body].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    assert.deepEqual(body, ["apple", "Mango", "Other-Worldly Inc", "Zebra"]);
  });

  test("the offered titles come out A to Z", async () => {
    const { withOther, JOB_TITLES } = await import("../lib/job-titles.ts");
    const shown = withOther(JOB_TITLES).slice(0, -1);
    assert.equal(shown[0], "Account Executive");
    assert.equal(shown.length, 50);
  });
});

describe("the board's cache windows", () => {
  /* Comments are stripped first. The previous version of this test matched the
     raw file, so a commented-out option counted as a real one. */
  const lib = readFileSync(new URL("../lib/browse-jobs.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  test("every fetch sets a window, and only from a named constant", () => {
    /* The version this replaced matched /revalidate:\s*([A-Za-z_0-9]+)/ against
       the file text, which went GREEN on all of these:
         next: { revalidate: BOARD_REVALIDATE * 5 }   <- the exact divergence
                                                         the test existed to stop
         next: { revalidate: X }, cache: "no-store"   <- Next then forces 0 and
                                                         the board stops caching
         a commented-out option, and a new fetch with no window at all.
       Capturing the whole expression, and counting windows against fetch call
       sites, closes all four. */
    const windows = [...lib.matchAll(/next:\s*\{\s*revalidate:\s*([^}]+?)\s*\}/g)].map((m) =>
      m[1].trim(),
    );
    const fetches = [...lib.matchAll(/\bfetch\(/g)].length;
    assert.equal(
      windows.length,
      fetches,
      `${fetches} fetch call(s) but ${windows.length} cache window(s), one is unwindowed`,
    );
    for (const w of windows) {
      assert.match(
        w,
        /^(LISTINGS_REVALIDATE|SUGGESTIONS_REVALIDATE)$/,
        `"${w}" is not a bare named constant: an expression here re-splits the windows`,
      );
    }
  });

  test("no fetch pairs a window with an option that cancels it", () => {
    /* `cache: "no-store"` next to `next.revalidate` makes Next discard both and
       force revalidate: 0, so the board would silently stop caching entirely
       while every assertion above still passed. */
    assert.ok(!/cache:\s*["']no-store["']/.test(lib), "no-store cancels the revalidate window");
    assert.ok(!/cache:\s*["']force-cache["']/.test(lib), "force-cache overrides the window");
  });

  test("the suggestions refresh quickly and the listings stay cheap", async () => {
    /* Exact values, because the comment in lib/browse-jobs.ts argues for these
       specific numbers. A range let 30 pass while the prose said 60.
       The split is the point: the suggestions are 2 cache keys and one query,
       the listings key on free-text filters and are effectively unbounded, so
       they must NOT share a window. */
    const { SUGGESTIONS_REVALIDATE, LISTINGS_REVALIDATE } = await import("../lib/browse-jobs.ts");
    assert.equal(SUGGESTIONS_REVALIDATE, 60);
    assert.equal(LISTINGS_REVALIDATE, 300);
    assert.ok(
      SUGGESTIONS_REVALIDATE < LISTINGS_REVALIDATE,
      "the cheap fetch is the one allowed to be aggressive",
    );
  });
});
