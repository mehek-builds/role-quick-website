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
  /** True when the board had to be widened past the student's stated preferences to find this.
   *  The copy has to say so: a row found this way is a near miss, not the thing they asked for. */
  widened: boolean;
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

/* The floor, asked as a question, so the two places that consult it cannot drift.
 *
 * A null score is NOT strong, and that is the same answer for both callers even though they want
 * it for different reasons: pickOnboardingMatch is choosing which row to prefer, matchHeadline is
 * deciding whether the screen may claim a fit. The scorer returns null for postings listing too
 * few real requirements, which is a fact about the posting's text - never a reason to skip a row
 * (see pickOnboardingMatch, which still shows it), and never evidence for an absolute claim. */
export function isStrongMatch(job: Pick<MonitoredJob, "match_score">): boolean {
  return (job.match_score ?? 0) >= STRONG_MATCH_SCORE;
}

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
export function pickOnboardingMatch(
  jobs: readonly MonitoredJob[],
  now: number = Date.now(),
  widened = false,
): OnboardingMatch | null {
  const usable = jobs.filter((job) => job.is_active !== false);
  if (usable.length === 0) return null;

  for (const rung of ["today", "this_week", "open"] as const) {
    const onRung = usable.filter((job) => freshnessOf(job, now) === rung);
    if (onRung.length === 0) continue;
    const strong = onRung.find(isStrongMatch);
    const job = strong ?? onRung[0];
    return { job, freshness: rung, hoursSinceSeen: hoursSinceSeen(job.first_seen_at, now), widened };
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
  /* A WIDENED ROW GETS ITS OWN SENTENCE, and it is checked first.
     The board was asked again without the student's own filters to find it, so every other line
     here would be false about it: it is not what they asked for, and saying it is the closest fit
     "to what you asked for" would be the specific untruth. Naming the widening is also the more
     useful sentence, because the fix is one they can act on. */
  if (match.widened) return "Nothing open matches your filters exactly right now, so here is the closest thing.";

  /* THE FIT HALF OF THESE SENTENCES IS NOW EARNED, and it was not before.
   *
   * STRONG_MATCH_SCORE was declared for exactly this sentence - its own comment says a row below
   * the floor "simply does not get that sentence" - but nothing ever read it here. The floor was
   * used only by pickOnboardingMatch to PREFER a strong row within a rung, and that function falls
   * back to `onRung[0]` when no row on the rung clears it. So the moment a student's board had
   * nothing strong on the top rung, the weakest posting on it was still introduced as the one "we
   * think is a perfect fit", and pressing "Show me a different one" served another and said it
   * again. The claim was a function of the clock, not of the match.
   *
   * Recency stays asserted either way, because Litos does know when it saw the row. Only the fit
   * clause is withheld, which is the half the score is evidence for.
   *
   * A NULL SCORE READS AS UNPROVEN, NOT AS WEAK, and it lands on the same side. The scorer returns
   * null for postings listing too few real requirements, which pickOnboardingMatch is right to
   * treat as no reason to skip a row - that is a fact about the posting's text. It is equally a
   * reason not to make an absolute claim about fit, because there is nothing here to stand behind.
   * The bottom rung is untouched: "the closest fit to what you asked for" is a statement about
   * rank within what the board returned, which is true by construction at any score. */
  const earnedFitClaim = isStrongMatch(match.job);

  if (match.freshness === "today") {
    return earnedFitClaim
      ? "We just detected this one, and we think it is a perfect fit."
      : "We just detected this one.";
  }
  if (match.freshness === "this_week") {
    return earnedFitClaim
      ? "We found this one for you this week, and it is a strong fit."
      : "We found this one for you this week.";
  }
  return "This one is open now, and it is the closest fit to what you asked for.";
}

/**
 * The match to show, guaranteed to be a real posting whenever the board has one at all.
 *
 * Two requests at most, and the second only happens when the first came back empty:
 *
 *  1. the student's own board, exactly as their preferences describe it;
 *  2. the same board with `relax_targeting=true`, which drops saved locations, remote_only,
 *     role_types and desired title terms and NOTHING else. The portal-family, freshness, active
 *     and sponsor-only constraints all survive, so a widened row is still one Litos can actually
 *     submit to and one the student is eligible for. See the backend's boardConditions.
 *
 * `fetchJobs` is injected rather than imported so this stays a pure decision that can be tested
 * without a network, and so the caller owns auth and error handling.
 *
 * A failed FIRST request is not swallowed - it propagates, because a student whose board could not
 * be read has a problem worth showing rather than a silently widened result. A failed SECOND
 * request resolves to null: the widening is a fallback, and a fallback that throws would turn a
 * merely empty board into a broken screen.
 */
export async function fetchOnboardingMatch(
  fetchJobs: (params: { limit: number; relaxTargeting: boolean }) => Promise<{ jobs: MonitoredJob[] }>,
  options: { limit?: number; now?: number } = {},
): Promise<OnboardingMatch | null> {
  const limit = options.limit ?? 20;
  const now = options.now ?? Date.now();

  const targeted = await fetchJobs({ limit, relaxTargeting: false });
  const onTarget = pickOnboardingMatch(targeted.jobs ?? [], now, false);
  if (onTarget) return onTarget;

  try {
    const relaxed = await fetchJobs({ limit, relaxTargeting: true });
    return pickOnboardingMatch(relaxed.jobs ?? [], now, true);
  } catch {
    return null;
  }
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
