import assert from "node:assert/strict";
import test from "node:test";
import {
  STRONG_MATCH_SCORE,
  foundLabel,
  freshnessOf,
  hoursSinceSeen,
  matchHeadline,
  pickOnboardingMatch,
} from "./onboarding-match.ts";
import type { MonitoredJob } from "./api.ts";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function job(overrides: Partial<MonitoredJob> & { id: string }): MonitoredJob {
  return {
    company_name: "Ramp",
    title: "Software Engineer Intern",
    location: "New York",
    department: null,
    employment_type: "Internship",
    description: "",
    apply_url: "https://boards.greenhouse.io/ramp/jobs/1",
    posting_url: "https://boards.greenhouse.io/ramp/jobs/1",
    remote: false,
    posted_at: null,
    first_seen_at: hoursAgo(4),
    ats_name: "greenhouse",
    ...overrides,
  } as MonitoredJob;
}

test("hours are counted from first_seen_at, the only recency Litos actually knows", () => {
  assert.equal(hoursSinceSeen(hoursAgo(4), NOW), 4);
  assert.equal(hoursSinceSeen(hoursAgo(0.5), NOW), 0);
  assert.equal(hoursSinceSeen(null, NOW), null);
  assert.equal(hoursSinceSeen("not a date", NOW), null);
});

test("a future timestamp reads as just now, never as negative hours", () => {
  // Clock skew between the ingest host and the reader must not print "in 3 hours".
  assert.equal(hoursSinceSeen(new Date(NOW + 3 * 3_600_000).toISOString(), NOW), 0);
});

test("the ladder has three rungs and an unreadable timestamp falls to the bottom", () => {
  assert.equal(freshnessOf(job({ id: "a", first_seen_at: hoursAgo(4) }), NOW), "today");
  assert.equal(freshnessOf(job({ id: "b", first_seen_at: hoursAgo(23) }), NOW), "today");
  assert.equal(freshnessOf(job({ id: "c", first_seen_at: hoursAgo(25) }), NOW), "this_week");
  assert.equal(freshnessOf(job({ id: "d", first_seen_at: hoursAgo(24 * 8) }), NOW), "open");
  assert.equal(freshnessOf(job({ id: "e", first_seen_at: null as unknown as string }), NOW), "open");
});

test("a fresher rung always wins, even against a much stronger older posting", () => {
  // The headline claims recency, so freshness is the outer key. A 99-scoring posting from last
  // month must never appear under "we just detected this one".
  const picked = pickOnboardingMatch([
    job({ id: "old-strong", first_seen_at: hoursAgo(24 * 20), match_score: 99 }),
    job({ id: "new-weak", first_seen_at: hoursAgo(3), match_score: 41 }),
  ], NOW);
  assert.equal(picked?.job.id, "new-weak");
  assert.equal(picked?.freshness, "today");
});

test("within a rung a strong score is preferred, and the ranked order breaks ties", () => {
  const picked = pickOnboardingMatch([
    job({ id: "first", first_seen_at: hoursAgo(2), match_score: 40 }),
    job({ id: "strong", first_seen_at: hoursAgo(6), match_score: STRONG_MATCH_SCORE }),
  ], NOW);
  assert.equal(picked?.job.id, "strong");

  const tied = pickOnboardingMatch([
    job({ id: "ranked-first", first_seen_at: hoursAgo(2), match_score: 40 }),
    job({ id: "ranked-second", first_seen_at: hoursAgo(6), match_score: 41 }),
  ], NOW);
  // Neither clears the floor, so GET /jobs' own ranking stands rather than being re-sorted here.
  assert.equal(tied?.job.id, "ranked-first");
});

test("a null score never blocks a row", () => {
  // The scorer returns null for postings listing too few real requirements. That is a fact about
  // the posting's text, not about its fit, so it must not remove the only candidate on a rung.
  const picked = pickOnboardingMatch([job({ id: "unscored", first_seen_at: hoursAgo(2), match_score: null })], NOW);
  assert.equal(picked?.job.id, "unscored");
  assert.equal(picked?.freshness, "today");
});

test("a quiet week still produces a match rather than an empty screen", () => {
  // Internship supply is the board's thinnest tier, so this is the common case, not the edge.
  const picked = pickOnboardingMatch([job({ id: "older", first_seen_at: hoursAgo(24 * 30), match_score: 88 })], NOW);
  assert.equal(picked?.job.id, "older");
  assert.equal(picked?.freshness, "open");
});

test("inactive rows are not offered, and an empty board returns null", () => {
  assert.equal(pickOnboardingMatch([job({ id: "gone", is_active: false })], NOW), null);
  assert.equal(pickOnboardingMatch([], NOW), null);
});

test("each rung gets its own sentence and none borrows another's claim", () => {
  const today = pickOnboardingMatch([job({ id: "a", first_seen_at: hoursAgo(4) })], NOW)!;
  const week = pickOnboardingMatch([job({ id: "b", first_seen_at: hoursAgo(48) })], NOW)!;
  const open = pickOnboardingMatch([job({ id: "c", first_seen_at: hoursAgo(24 * 20) })], NOW)!;

  assert.match(matchHeadline(today), /just detected/i);
  assert.doesNotMatch(matchHeadline(week), /just detected/i);
  assert.doesNotMatch(matchHeadline(open), /just detected/i);
  // The bottom rung makes no recency claim at all, because for those rows there is none to make.
  assert.doesNotMatch(matchHeadline(open), /today|week|hour|just/i);
});

test("the meta line says Found, never Posted, and reads like a person", () => {
  const label = (h: number) => foundLabel(pickOnboardingMatch([job({ id: "x", first_seen_at: hoursAgo(h) })], NOW)!);
  assert.equal(label(0.4), "Found less than an hour ago");
  assert.equal(label(1.5), "Found 1 hour ago");
  assert.equal(label(4), "Found 4 hours ago");
  assert.equal(label(30), "Found yesterday");
  assert.equal(label(24 * 5), "Found 5 days ago");
  for (const h of [0.4, 4, 30, 24 * 5]) assert.doesNotMatch(label(h), /posted/i);
});

test("an unreadable timestamp makes no recency claim in the meta line either", () => {
  const picked = pickOnboardingMatch([job({ id: "x", first_seen_at: null as unknown as string })], NOW)!;
  assert.equal(foundLabel(picked), "On the board now");
});
