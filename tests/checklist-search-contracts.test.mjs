import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public job search shows progress while it is running", () => {
  assert.match(read("components/browse/SearchSubmitButton.tsx"), /Searching\.\.\./);
  assert.match(read("app/browse-jobs/loading.tsx"), /Loading job results/);
});

test("the board has ONE order, and no control offering a second", () => {
  /* The order picker was removed on 2026-08-26. It is asserted absent rather than simply
     untested, because the version that existed only re-sorted the 24 rows of the CURRENT page:
     "newest" on page 3 meant newest of those 24, not of the board, and a reader has no way to
     tell those apart. If a real board-wide ordering is ever wanted it has to be the API's ORDER
     BY, not a re-shuffle of one page, and this line is what makes that a deliberate decision. */
  const page = read("app/browse-jobs/page.tsx");
  assert.doesNotMatch(page, /name="sort"/);
  assert.doesNotMatch(page, /params\.set\("sort"/);
});

test("matched search terms use semantic mark without replacing accessible text", () => {
  const page = read("app/browse-jobs/page.tsx");
  assert.match(page, /function Highlight/);
  assert.match(page, /<mark/);
  assert.match(page, /text=\{job\.title\}/);
  assert.match(page, /text=\{job\.company_name\}/);
});

test("dashboard recent searches are short, local, rerunnable, and clearable", () => {
  const page = read("app/dashboard/jobs/page.tsx");
  assert.match(page, /RECENT_SEARCHES_KEY/);
  assert.match(page, /\.slice\(0, 5\)/);
  assert.match(page, /setQuery\(title\)/);
  assert.match(page, /removeItem\(RECENT_SEARCHES_KEY\)/);
  assert.match(read("app/cookies/page.tsx"), /Recent job-title searches/);
});
