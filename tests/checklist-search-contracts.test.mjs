import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public job search exposes progress and URL-preserved ordering", () => {
  const page = read("app/browse-jobs/page.tsx");
  assert.match(page, /name="sort"/);
  assert.match(page, /Newest on this page/);
  assert.match(page, /params\.set\("sort", sort\)/);
  assert.match(read("components/browse/SearchSubmitButton.tsx"), /Searching\.\.\./);
  assert.match(read("app/browse-jobs/loading.tsx"), /Loading job results/);
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
