import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public job search shows progress while it is running", () => {
  assert.match(read("components/browse/SearchSubmitButton.tsx"), /Searching\.\.\./);
  assert.match(read("app/browse-jobs/loading.tsx"), /Loading job results/);
});

test("the search button never disables itself, because that cancels its own submit", () => {
  /* THE REGRESSION THIS EXISTS FOR, live on trylitos.com until 2026-08-27: the button carried
     `disabled={pending}` alongside `onClick={() => setPending(true)}`. React flushes a trusted
     click synchronously, so the submitter was disabled before the browser performed the form's
     default action, and a form is not submitted when its submitter is disabled. Every search on
     the public board silently did nothing while the button read "Searching..." forever - `pending`
     clears only on `pageshow`, which needs the navigation that was just cancelled.

     Asserted on the SOURCE because it cannot be caught by driving the button from a test:
     `button.click()` is untrusted and submits the form correctly. Only a real user click fails. */
  /* Comments stripped first. That file's own header quotes the broken shape verbatim so the next
     reader knows exactly what not to write, and matching the documentation of a bug as though it
     were the bug would make the honest comment impossible to keep. What the component RENDERS is
     the thing under test. */
  const code = read("components/browse/SearchSubmitButton.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\bdisabled[=}]/,
    "a disabled submitter cannot submit; use a style hook for the waiting state");
  // And the waiting state still has to exist, or this would pass by deleting the feature.
  assert.match(code, /data-pending/);
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
