import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Product decision, 2026-09-12 (Mehek): the board used to hide every posting under a 25% resume
// match by default. New behaviour, built in the backend in parallel: GET /jobs shows everything,
// ranked best fit first, and only applies the 25%+ floor when the request carries
// `strong_only=true`. Until that backend ships, it ignores the param and keeps hiding, so this
// suite pins that the frontend is correct against both: the param is always sent when the toggle
// is on, and the footer never claims a floor that was not asked for.

const PAGE = readFileSync(new URL("../app/dashboard/jobs/page.tsx", import.meta.url), "utf8");
const API = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

test("a Strong matches only checkbox exists, named for a screen reader, defaulting off", () => {
  assert.match(PAGE, /const \[strongOnly, setStrongOnly\] = useState\(false\)/);
  assert.match(
    PAGE,
    /<input aria-label="Strong matches only" type="checkbox" checked=\{strongOnly\} onChange=\{\(event\) => setStrongOnly\(event\.target\.checked\)\}/,
  );
  assert.match(PAGE, />\s*Strong matches only\s*<\/label>/);
});

test("jobParams sends strong_only=true only when the toggle is on", () => {
  const start = PAGE.indexOf("function jobParams");
  const body = PAGE.slice(start, PAGE.indexOf("\n}", start));
  assert.match(body, /strongOnly: boolean/);
  assert.match(body, /if \(strongOnly\) params\.set\("strong_only", "true"\)/);
});

test("a strong_only change starts a new filter key, so a stale response cannot land on top of it", () => {
  const start = PAGE.indexOf("function filterKey");
  const body = PAGE.slice(start, PAGE.indexOf("\n}", start));
  assert.match(body, /strongOnly: boolean/);
  assert.match(body, /\$\{strongOnly\}/);
});

test("both fetches (initial and load-more) and the tracking call pass strongOnly through", () => {
  assert.match(
    PAGE,
    /jobParams\(query, location, remoteOnly, employmentType, strongOnly, 0\)/,
  );
  assert.match(
    PAGE,
    /jobParams\(query, location, remoteOnly, employmentType, strongOnly, jobs\.length\)/,
  );
});

test("the footer never claims a 25%+ floor while the toggle is off", () => {
  // The two branches that can mention a percentage floor must each be gated on strongOnly, not
  // on whatever the response happened to carry: an old backend ignores the param and keeps
  // filtering regardless, but the UI's own claim about itself must match the switch it is showing.
  const footerStart = PAGE.indexOf("{ranked");
  const footer = PAGE.slice(footerStart, PAGE.indexOf("newest first", footerStart));
  assert.match(footer, /strongOnly\s*\n?\s*\?\s*` · best \$\{minimumMatchScore \?\? 25\}%\+ resume matches/);
  assert.match(footer, /: ` · best resume matches from \$\{rankedPool\} recently matched roles`/);
  assert.match(footer, /strongOnly\s*\n?\s*\?\s*` · sorted by resume match/);
  assert.match(footer, /: " · sorted by resume match"/);
});

test("JobsPage's type carries the optional strong_only the response can now return", () => {
  assert.match(API, /strong_only\?: boolean/);
});
