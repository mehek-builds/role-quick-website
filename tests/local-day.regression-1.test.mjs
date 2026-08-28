import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { localDayKey, localDayKeyOf } from "../lib/local-day.ts";
import { jobSubmittedOnDay } from "../features/applications/domain/daily-matches.ts";

/* ISSUE-035. "Today" on the dashboard was `new Date().toISOString().slice(0, 10)`, the UTC day.
 *
 * The screen says "Your top jobs today" and the skip toast says "Skipped for today", so the day it
 * means is the student's day. UTC midnight is 4 PM ET and 1 PM PT: mid-afternoon, skipped jobs
 * reappeared, that morning's submissions stopped counting as done, and the prewarm key rotated.
 *
 * These assertions are pinned to instants that fall on DIFFERENT UTC and local days, which is the
 * only place the two implementations disagree. Each block sets TZ first (Node re-reads it), so the
 * file proves the behaviour in a timezone behind UTC and one ahead of it rather than whichever one
 * the machine running the suite happens to be in.
 *
 * The second half is the trap this fix could have walked into: making the key local while
 * jobSubmittedOnDay still sliced the UTC day off the stored timestamp would compare a local day to
 * a UTC day, which is wrong on BOTH sides of local midnight instead of one. The two must be
 * produced by the same function, and that is what these assert. */

describe("the day a student sees is their local day", () => {
  test("a timezone behind UTC: 8 PM Tuesday in Los Angeles is still Tuesday", () => {
    process.env.TZ = "America/Los_Angeles";
    const evening = new Date("2026-08-05T03:00:00.000Z");

    assert.equal(evening.toISOString().slice(0, 10), "2026-08-05", "fixture must straddle the UTC boundary");
    assert.equal(localDayKey(evening), "2026-08-04");
  });

  test("a timezone ahead of UTC: 1 AM Tuesday in Dubai is already Tuesday", () => {
    process.env.TZ = "Asia/Dubai";
    const smallHours = new Date("2026-08-03T21:00:00.000Z");

    assert.equal(smallHours.toISOString().slice(0, 10), "2026-08-03", "fixture must straddle the UTC boundary");
    assert.equal(localDayKey(smallHours), "2026-08-04");
  });

  test("single digit months and days are padded", () => {
    process.env.TZ = "UTC";
    assert.equal(localDayKey(new Date("2026-01-02T12:00:00.000Z")), "2026-01-02");
  });

  test("an unusable stored timestamp is not silently some other day", () => {
    assert.equal(localDayKeyOf(null), null);
    assert.equal(localDayKeyOf(undefined), null);
    assert.equal(localDayKeyOf(""), null);
    assert.equal(localDayKeyOf("not a date"), null);
  });
});

describe("submitted-today and today are the same timezone", () => {
  const job = { id: "job-1", company_name: "Acme Labs", title: "Product Engineer" };
  const packetSubmittedAt = (submitted_at) => [{
    job_context: { company: "Acme Labs", role: "Product Engineer", job_id: "job-1" },
    spec: { _review: { status: "submitted", submitted_at } },
  }];

  test("an evening submission counts against that same local day in Los Angeles", () => {
    process.env.TZ = "America/Los_Angeles";
    const todayKey = localDayKey(new Date("2026-08-05T03:00:00.000Z")); // 8 PM local
    const submittedAnHourEarlier = "2026-08-05T02:00:00.000Z"; // 7 PM local, same local day

    assert.equal(todayKey, "2026-08-04");
    assert.equal(jobSubmittedOnDay(job, packetSubmittedAt(submittedAnHourEarlier), todayKey), true);
  });

  test("a small-hours submission counts against that same local day in Dubai", () => {
    process.env.TZ = "Asia/Dubai";
    const todayKey = localDayKey(new Date("2026-08-03T21:00:00.000Z")); // 1 AM local
    const submittedHalfAnHourEarlier = "2026-08-03T20:30:00.000Z"; // 00:30 local, same local day

    assert.equal(todayKey, "2026-08-04");
    assert.equal(jobSubmittedOnDay(job, packetSubmittedAt(submittedHalfAnHourEarlier), todayKey), true);
  });

  test("a submission from the previous local day does not count", () => {
    process.env.TZ = "America/Los_Angeles";
    const todayKey = localDayKey(new Date("2026-08-05T03:00:00.000Z"));
    const yesterdayEvening = "2026-08-04T02:00:00.000Z"; // 7 PM local on the 3rd

    assert.equal(jobSubmittedOnDay(job, packetSubmittedAt(yesterdayEvening), todayKey), false);
  });
});

/* The three call sites that ARE the filed defect.
 *
 * Everything above tests the helper and the domain function, and all of it stayed green when the
 * dashboard's own three keys were reverted to the UTC slice, which means it was guarding the fix
 * and not the bug. These are source-text assertions against app/dashboard/page.tsx because that
 * file is a client component the node runner cannot load. tests/home-match-window.test.mjs already
 * reads and regex-matches the same file for the same reason. */
describe("the dashboard's day keys are the local day", () => {
  const homeUrl = new URL("../app/dashboard/page.tsx", import.meta.url);

  test("all three keys derive from localDayKey", async () => {
    const home = readFileSync(homeUrl, "utf8");

    // "Skipped for today" has to survive until the student's own midnight.
    assert.match(home, /litos-dismissed-\$\{localDayKey\(\)\}/);
    // The build-ahead lock rotates with the day it belongs to.
    assert.match(home, /litos-prewarm-\$\{localDayKey\(\)\}-\$\{jobId\}/);
    // Feeds submittedToday, and through it dayQueueFinished.
    assert.match(home, /const todayKey = localDayKey\(\);/);
    assert.match(home, /import \{ localDayKey \} from "@\/lib\/local-day";/);
  });

  test("no UTC day survives in the file", () => {
    const home = readFileSync(homeUrl, "utf8");

    assert.doesNotMatch(home, /toISOString\(\)\.slice\(0, ?10\)/);
  });
});

/* The allowlist. A UTC calendar day is occasionally the right answer, so this does not ban it; it
 * makes the next person who wants one say why, here, instead of quietly reintroducing ISSUE-035.
 *
 * Keyed by path, valued by the reason that path is exempt. Both entries were examined for this
 * issue and deliberately left alone. */
const UTC_DAY_ALLOWED = new Map([
  [
    "app/dashboard/settings/page.tsx",
    "The export FILENAME. Cosmetic, never read back, and no part of the 'today' the student is "
      + "promised on the dashboard.",
  ],
  [
    "app/api/tiktok-event/route.ts",
    "Server-side rate-limit bucket. The server has no user timezone to work "
      + "from, and the in-memory counter is shared per warm instance, so one fixed reference is the "
      + "only coherent choice.",
  ],
]);

describe("a UTC calendar day is allowlisted, never incidental", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scanned = ["app", "components", "features", "lib"];

  function sourceFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      if (!/\.[cm]?[jt]sx?$/.test(entry.name)) return [];
      return /\.test\.[cm]?[jt]sx?$/.test(entry.name) ? [] : [path];
    });
  }

  test("every UTC day key outside the allowlist is gone", () => {
    const offenders = scanned
      .flatMap((directory) => sourceFiles(`${root}${directory}`))
      .filter((path) => /toISOString\(\)\.slice\(0, ?10\)/.test(readFileSync(path, "utf8")))
      .map((path) => relative(root, path))
      .filter((path) => !UTC_DAY_ALLOWED.has(path));

    assert.deepEqual(offenders, [], `use localDayKey, or add the file to UTC_DAY_ALLOWED with a reason: ${offenders.join(", ")}`);
  });

  test("the allowlist does not outlive what it excuses", () => {
    // A stale exemption is a licence nobody meant to grant. If the line goes, so does the entry.
    for (const [path, reason] of UTC_DAY_ALLOWED) {
      assert.match(readFileSync(`${root}${path}`, "utf8"), /toISOString\(\)\.slice\(0, ?10\)/, `${path} no longer needs its exemption: ${reason}`);
    }
  });
});
