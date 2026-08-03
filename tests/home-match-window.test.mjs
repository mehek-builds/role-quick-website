import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeUrl = new URL("../app/dashboard/page.tsx", import.meta.url);

/* Home's two end states.
 *
 * The window itself is behaviour, not source text, and is covered properly in
 * features/applications/domain/home-match-window.test.mts, which finishes matches one at a time and
 * checks what refills. What is left here is the JSX those results are rendered into: which screen a
 * student sees when the window comes back empty. */

test("Home windows through the tested domain helper rather than its own inline slice", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /visibleMatches\(todayJobs, \{ dismissed, submitted: submittedToday \}\)/);
  // One implementation, one place it can drift.
  assert.doesNotMatch(home, /\.slice\(0, HOME_MATCH_WINDOW\)/);
  assert.doesNotMatch(home, /const HOME_MATCH_WINDOW/);
});

test("the window recomputes when a match is finished", async () => {
  const home = await readFile(homeUrl, "utf8");

  // submittedToday derives from packets, so a submit that updates packets re-runs the window and
  // refills without a reload. If packets left this dependency list the list would go stale.
  assert.match(home, /submittedToday = useMemo\(\s*\(\) =>[\s\S]*?\[packets, todayJobs, todayKey\]/);
  assert.match(home, /visibleJobs = useMemo\(\s*\(\) =>[\s\S]*?\[dismissed, submittedToday, todayJobs\]/);
});

test("a finished day says so, however it was finished", async () => {
  const home = await readFile(homeUrl, "utf8");

  // Was submittedToday.size === todayJobs.length, which only fired when every match was SUBMITTED.
  // Skipping them emptied the queue into a different screen for the same fact.
  assert.match(home, /const dayQueueFinished = todayJobs\.length > 0 && visibleJobs\.length === 0;/);
  assert.doesNotMatch(home, /allTodaySubmitted/);
  assert.match(home, /dayQueueFinished \? \(\s*<DailyMatchesComplete \/>/);
});

test("only a day that never had a match gets the profile prompt", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /title="No matches yet"/);
  /* "Today's queue is clear" and its "Browse all jobs" link are gone from the RENDER: that branch
     now belongs to DailyMatchesComplete, and browsing pointed at a list empty for the same reason.
     Matched against JSX rather than the whole file, because the comment above dayQueueFinished
     quotes the old copy on purpose and should not have to stop doing that to keep this green. */
  assert.doesNotMatch(home, /dismissed\.length \? "Today's queue is clear"/);
  assert.doesNotMatch(home, />\s*Browse all jobs\s*</);
});

test("DailyMatchesComplete is the screen that carries the wording", async () => {
  const complete = await readFile(new URL("../components/app/DailyMatchesComplete.tsx", import.meta.url), "utf8");

  assert.match(complete, /No matches left for the day\./);
  assert.match(complete, /role="status"/);
});
