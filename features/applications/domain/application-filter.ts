/**
 * Which applications the Tracker is showing, and where that choice comes from.
 *
 * Home's Overview links into this page with `?state=`: the amber "N stopped for you" banner and the
 * Ready / Needs you / Sent tiles are all deep links, not decoration. The seeding used to happen
 * inline on the page and fed one hidden select that only mounted once a packet was open, so a
 * student who clicked "Finish the missing answers" landed on an unfiltered board and had no way to
 * see, change, or clear the filter they had just asked for.
 *
 * The parsing, the predicate and the wording live here so the deep link, the visible heading and
 * the list are one definition rather than three that can drift apart. The status groups are the
 * same three Home counts its tiles with, which is what makes "Needs you 5" and the five rows the
 * link lands on the same five applications.
 */

export type ApplicationFilter = "all" | "action" | "ready" | "submitted";

/** Statuses where Litos has stopped and is waiting on the student. */
const ACTION_STATUSES = ["needs_attention", "ready_for_final_approval", "failed"];
/** Built and waiting to go out. */
const READY_STATUSES = ["resume_ready", "questions_ready", "ready_to_submit"];
type FilterableReview = { status?: string; portal_supported?: boolean } | null | undefined;

const FILTERS: readonly ApplicationFilter[] = ["all", "action", "ready", "submitted"];

export function isApplicationFilter(value: string | null | undefined): value is ApplicationFilter {
  return value !== null && value !== undefined && (FILTERS as readonly string[]).includes(value);
}

/**
 * Read the requested view off a location search string.
 *
 * Anything unrecognised, absent or malformed falls back to "all": an unknown value must show the
 * whole tracker rather than an empty one, because an empty board reads as "you have nothing" and
 * that is a lie about the student's own history.
 */
export function applicationFilterFromSearch(search: string): ApplicationFilter {
  const requested = new URLSearchParams(search).get("state");
  return isApplicationFilter(requested) ? requested : "all";
}

export function reviewCanBeSent(review: FilterableReview): boolean {
  return READY_STATUSES.includes(review?.status ?? "") && review?.portal_supported !== false;
}

function reviewNeedsAction(review: FilterableReview): boolean {
  return ACTION_STATUSES.includes(review?.status ?? "")
    || (READY_STATUSES.includes(review?.status ?? "") && review?.portal_supported === false);
}

/** Does this application's review belong in the chosen view? */
export function statusMatchesApplicationFilter(review: string | FilterableReview, filter: ApplicationFilter): boolean {
  const normalized = typeof review === "string" ? { status: review } : review;
  if (filter === "action") return reviewNeedsAction(normalized);
  if (filter === "ready") return reviewCanBeSent(normalized);
  if (filter === "submitted") return normalized?.status === "submitted";
  return true;
}

/**
 * Does the Tracker owe the student a list, with no packet open?
 *
 * This is the gate ISSUE-037 was: the ledger used to render only beside an open packet, so every
 * ?state= arrival applied its filter to nothing and showed no control to change it. It is a named
 * predicate rather than an inline condition because the ways to get it wrong are silent on the page
 * and invisible to a source-level test. Raising the count threshold makes every deep link inert
 * again for every real account, and that survived an earlier version of the test that only checked
 * this condition MENTIONED the filter. The truth table sits beside this in
 * tests/application-state-deeplink.regression-1.test.mjs.
 *
 * THE "all" EXCLUSION IS GONE, and the reason it gave for itself turned out to be false in
 * production.
 *
 * It read: "on the unfiltered board view the list would only restate the board below it".
 * MEASURED on 2026-08-08 against the owner account (a18f774b, mehekmandal05@gmail.com): GET
 * /applications/board answered 200 with 83 cards and every one of them at stage "saved", because
 * generated_resumes.pipeline_stage is NULL on all 83 rows and none has ever reached "submitted", so
 * deriveStage sends the lot to "saved". The board draws applied/interview/offer only, per
 * ACTIVE_BOARD_STAGES, so it restated nothing: three empty columns over 83 applications, 49 of them
 * stopped on a question the applicant could have answered in seconds, and "0 applied today".
 *
 * The consequence was a routing accident rather than a missing feature. Everything the student
 * needed already existed and rendered only beside a SELECTED packet: this list, its status badges,
 * its "Needs you" filter, and the blocker panel on the submission screen. The one link that selects
 * a packet on arrival is /dashboard/applications?job=<uuid>, which is where the Jobs page's Apply
 * button points. The sidebar's own Tracker link goes to the bare path, so the primary route into
 * the product's main screen was the only route that showed nothing.
 *
 * So the list renders whenever there is a history to list. On "all" beside a board that does have
 * cards on it the two now overlap, and that is the right trade: the board carries the stage the
 * STUDENT put a card in, the list carries what LITOS is doing with it, and the list is the only
 * surface from which a stopped application can be reached at all.
 *
 * The filter argument stays in the signature. Every caller passes it, the select still narrows the
 * rows, and a future view that genuinely should hide the list would be expressed here rather than
 * inline on the page.
 *
 * Still not on an empty history: the empty state speaks for that page instead.
 */
export function ledgerRendersOnLanding(_filter: ApplicationFilter, reviewableCount: number): boolean {
  return reviewableCount > 0;
}

/**
 * What the list is called while a filter is on.
 *
 * Printed above the rows, so the current value is readable as words and not only as the selected
 * option of a select. Plain language, in the register of the rest of the dashboard: the student is
 * told what they are looking at, not which enum member is set.
 */
export function applicationFilterHeading(filter: ApplicationFilter): string {
  if (filter === "action") return "Applications that need you";
  if (filter === "ready") return "Applications ready to send";
  if (filter === "submitted") return "Applications you have sent";
  return "Your applications";
}
