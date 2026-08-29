import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/*
 * The Jobs fixture has to read the same at 00:07 as it does at 14:00.
 *
 * Two readers bucket by CALENDAR DAY rather than by elapsed hours: countNewToday counts postings
 * first seen since LOCAL MIDNIGHT, and formatRelativeDate floors elapsed time into whole days. An
 * offset counted back from Date.now() therefore changes which bucket a fixture row lands in as the
 * clock crosses midnight - a job stamped three hours ago is "new today" in the afternoon and was
 * yesterday just after midnight.
 *
 * That made tests/visual-baselines' jobs-320.png valid only for part of the day. It failed at 00:07
 * on 2026-08-29 with a missing "3 new today" badge shifting the whole page, and a whitespace-only
 * control run off main reproduced it exactly - which is the only reason it was not written off as
 * the fault of the unrelated branch that happened to be running.
 */
const fixture = await readFile(new URL("../app/dashboard/jobs/qa-data.ts", import.meta.url), "utf8");

test("fixture timestamps are anchored to the local day, not to the moment of load", () => {
  assert.match(fixture, /function daysAgo\(day: number\): string \{/);
  assert.match(fixture, /at\.setHours\(9, 0, 0, 0\);/, "a fixed hour, so the calendar day is what varies");
  assert.match(fixture, /at\.setDate\(at\.getDate\(\) - day\);/);
  assert.doesNotMatch(fixture, /Date\.now\(\) - hours \* 3_600_000/, "elapsed-hours offsets cross midnight");
  assert.doesNotMatch(fixture, /hoursAgo\(/);
});

test("a fixture row is never stamped in the future", () => {
  /* At 00:07, "09:00 today" has not happened yet, and a posting the board has not seen is not a
     fixture, it is a bug. */
  assert.match(fixture, /Math\.min\(at\.getTime\(\), Date\.now\(\) - 60_000\)/);
});

test("the day buckets the fixture intends still exist", () => {
  /* Three rows reading as today (the "3 new today" badge), then older ones spread across distinct
     days so the relative-date formatting is exercised. */
  const days = [...fixture.matchAll(/first_seen_at: daysAgo\((\d+)\)/g)].map((m) => Number(m[1]));
  assert.equal(days.filter((d) => d === 0).length, 3, "three postings read as new today");
  assert.deepEqual([...new Set(days)].sort((a, b) => a - b), [0, 2, 3, 4]);
});
