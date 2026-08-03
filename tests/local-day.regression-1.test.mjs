import assert from "node:assert/strict";
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
