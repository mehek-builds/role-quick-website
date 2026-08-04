/**
 * robots.txt matching is PREFIX matching with `*` wildcards, which does not behave the way a regex
 * reader expects, and these rules shipped wrong once already: an attempt to allow board pages 1-9
 * and block 10 upward was written as `page=1`, `page=2`, and so on, and prefix matching meant
 * `page=1` also matched `page=10` and `page=15`. It blocked precisely the pages it was protecting,
 * and it looked correct on the page. Only evaluating the patterns against real URLs catches that.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { BOARD_CRAWL_TRAPS, isCrawlTrapped, robotsPatternBlocks } from "./board-crawl-traps.ts";

describe("the indexable board stays indexable", () => {
  /* Disallowing /browse-jobs outright would have been the easy answer and the wrong one: it is a
     real landing page, and the curated facets are real searches worth ranking for. */
  test("the bare board is crawlable", () => {
    assert.equal(isCrawlTrapped("/browse-jobs"), false);
  });

  test("the curated, bounded facets are crawlable", () => {
    assert.equal(isCrawlTrapped("/browse-jobs?title=Software%20Engineer"), false);
    assert.equal(isCrawlTrapped("/browse-jobs?employment_type=Internship"), false);
    assert.equal(isCrawlTrapped("/browse-jobs?title=Data%20Analyst&employment_type=Internship"), false);
  });

  test("pagination is crawlable at every depth, which is the bug that shipped once", () => {
    for (const page of [1, 2, 9, 10, 15, 100]) {
      assert.equal(isCrawlTrapped(`/browse-jobs?page=${page}`), false, `page ${page}`);
    }
  });

  test("the sponsorship checkbox is crawlable", () => {
    // Bounded (it is a checkbox) and it describes a search students genuinely make.
    assert.equal(isCrawlTrapped("/browse-jobs?sponsor_only=true"), false);
  });
});

describe("the unbounded filters are not crawlable", () => {
  test("free-text search, company and location are each blocked", () => {
    assert.equal(isCrawlTrapped("/browse-jobs?q=anything"), true);
    assert.equal(isCrawlTrapped("/browse-jobs?company=Datadog"), true);
    assert.equal(isCrawlTrapped("/browse-jobs?location=Dubai"), true);
  });

  test("a free-text parameter is blocked wherever it sits in the query string", () => {
    // The `*` sits right after the `?` precisely so parameter ORDER does not decide this.
    assert.equal(isCrawlTrapped("/browse-jobs?title=X&q=anything"), true);
    assert.equal(isCrawlTrapped("/browse-jobs?employment_type=Internship&company=Stripe"), true);
    assert.equal(isCrawlTrapped("/browse-jobs?page=3&location=Boston"), true);
    assert.equal(isCrawlTrapped("/browse-jobs?sponsor_only=true&title=X&q=y"), true);
  });

  test("an empty free-text value is still blocked, since it is still a distinct URL", () => {
    assert.equal(isCrawlTrapped("/browse-jobs?q="), true);
  });
});

describe("the matcher itself", () => {
  test("a bare prefix matches anything extending it", () => {
    assert.equal(robotsPatternBlocks("/dashboard/", "/dashboard/jobs"), true);
    assert.equal(robotsPatternBlocks("/start", "/start"), true);
  });

  test("it anchors at the start, so a pattern cannot match mid-path", () => {
    assert.equal(robotsPatternBlocks("/browse-jobs", "/app/browse-jobs"), false);
  });

  test("a path that merely shares a prefix with the board is untouched", () => {
    // Worth pinning: these rules must not spill onto a future sibling route.
    for (const pattern of BOARD_CRAWL_TRAPS) {
      assert.equal(robotsPatternBlocks(pattern, "/browse-jobsearch?q=x"), false, pattern);
    }
  });

  test("every rule targets the board and nothing else", () => {
    for (const pattern of BOARD_CRAWL_TRAPS) {
      assert.ok(pattern.startsWith("/browse-jobs?"), `${pattern} escapes the board`);
    }
  });
});
