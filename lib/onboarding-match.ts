import type { MonitoredJob } from "./api";

/* Choosing the ONE posting the match screen shows, and saying honestly how fresh it is.
 *
 * Most of the hard filtering is already done by the time a row reaches this module. GET /jobs in
 * ranked mode restricts to AUTONOMOUS_PORTAL_FAMILIES (the families portalCanAutoSubmit allows, so
 * a row here is one Litos can carry to a confirmation rather than fill and then stop on), applies
 * the account's saved targeting, applies the sponsor-only rule, applies its own freshness window,
 * and returns `match_score` for each row. None of that is re-derived here.
 *
 * What is left is the part the board cannot answer, and it is the part the deck flagged as the
 * risk: the screen wants to say "we just detected this", and that sentence is only true for some
 * rows. Internship supply is the board's thinnest tier, so a student can easily have nothing found
 * in the last day. The answer is a ladder with a different sentence at each rung, never the top
 * rung's sentence over a lower rung's row.
 */

/** How recently Litos SAW the posting. Not how recently the employer published it. */
export type MatchFreshness = "today" | "this_week" | "open";

export type OnboardingMatch = {
  job: MonitoredJob;
  freshness: MatchFreshness;
  /** Hours since Litos first saw it, floored. Null when `first_seen_at` is unusable. */
  hoursSinceSeen: number | null;
};

const HOUR_MS = 3_600_000;
const DAY_HOURS = 24;
const WEEK_HOURS = 24 * 7;

/* THE MINIMUM THE SCREEN WILL CALL "a perfect fit".
 *
 * The screen's own copy makes a claim ("we think it is a perfect fit"), so it needs a floor it can
 * stand behind rather than showing whatever happened to rank first. Rows scoring below this are
 * still perfectly good postings; they simply do not get that sentence, and the caller falls back
 * to the quieter framing. */
export const STRONG_MATCH_SCORE = 70;

/**
 * Hours since Litos first saw the posting, or null if the timestamp cannot be read.
 *
 * `first_seen_at` is the field, deliberately, and `posted_at` is not. `posted_at` is nullable on
 * the row and is absent for most of the board, so a screen built on it would either say nothing
 * for most postings or quietly substitute the other field and call it a publishing date. What
 * Litos actually knows is when it first saw the row, and that is what the copy says.
 *
 * A future timestamp returns 0 rather than a negative number: clock skew between the ingest host
 * and the reader should read as "just now", never as "in 3 hours".
 */
export function hoursSinceSeen(firstSeenAt: string | null | undefined, now: number = Date.now()): number | null {
  if (!firstSeenAt) return null;
  const seen = Date.parse(firstSeenAt);
  if (!Number.isFinite(seen)) return null;
  return Math.max(0, Math.floor((now - seen) / HOUR_MS));
}

/** Which rung of the ladder this row sits on. An unreadable timestamp falls to the bottom rung,
 *  because "open" is the one claim that is true of every row on the board. */
export function freshnessOf(job: MonitoredJob, now: number = Date.now()): MatchFreshness {
  const hours = hoursSinceSeen(job.first_seen_at, now);
  if (hours === null) return "open";
  if (hours < DAY_HOURS) return "today";
  if (hours < WEEK_HOURS) return "this_week";
  return "open";
}

/**
 * The single posting to put on the match screen, or null when the board returned nothing usable.
 *
 * The ladder is walked in order and the FIRST rung with a candidate wins, so a student with a
 * posting found four hours ago sees that one, and a student whose field has been quiet for a
 * fortnight still gets a real match instead of an empty screen. Within a rung the caller's order
 * is preserved: GET /jobs already ranked the pool, and re-sorting here would throw that away.
 *
 * `match_score` is only used to prefer a strong row WITHIN a rung, never to skip a rung. Freshness
 * is what the screen's headline claims, so it has to be the outer key; a 92-scoring posting from
 * last month must not be presented under a sentence about having just detected something.
 * A null score never blocks a row - the scorer returns null for postings that list too few real
 * requirements, and that is a fact about the posting's text, not about its fit.
 */
export function pickOnboardingMatch(jobs: readonly MonitoredJob[], now: number = Date.now()): OnboardingMatch | null {
  const usable = jobs.filter((job) => job.is_active !== false);
  if (usable.length === 0) return null;

  for (const rung of ["today", "this_week", "open"] as const) {
    const onRung = usable.filter((job) => freshnessOf(job, now) === rung);
    if (onRung.length === 0) continue;
    const strong = onRung.find((job) => (job.match_score ?? 0) >= STRONG_MATCH_SCORE);
    const job = strong ?? onRung[0];
    return { job, freshness: rung, hoursSinceSeen: hoursSinceSeen(job.first_seen_at, now) };
  }
  return null;
}

/**
 * The sentence above the posting. One per rung, and none of them borrows another's claim.
 *
 * The top rung is the only one allowed to say Litos just found it. The middle rung says the week,
 * which is still a real recency statement. The bottom rung makes no recency claim at all, because
 * for those rows there is none to make - it says the posting is open, which is the thing the
 * freshness predicate on the board already guarantees.
 */
export function matchHeadline(match: OnboardingMatch): string {
  if (match.freshness === "today") return "We just detected this one, and we think it is a perfect fit.";
  if (match.freshness === "this_week") return "We found this one for you this week, and it is a strong fit.";
  return "This one is open now, and it is the closest fit to what you asked for.";
}

/**
 * The mono meta line. "Found", never "Posted", for the reason stated on hoursSinceSeen.
 *
 * Under an hour reads "Found less than an hour ago" rather than "Found 0 hours ago", which is the
 * same number said in a way a person would say it.
 */
export function foundLabel(match: OnboardingMatch): string {
  const hours = match.hoursSinceSeen;
  if (hours === null) return "On the board now";
  if (hours < 1) return "Found less than an hour ago";
  if (hours < 2) return "Found 1 hour ago";
  if (hours < DAY_HOURS) return `Found ${hours} hours ago`;
  const days = Math.floor(hours / DAY_HOURS);
  return days < 2 ? "Found yesterday" : `Found ${days} days ago`;
}
