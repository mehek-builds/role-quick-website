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

/** Does this application's submission status belong in the chosen view? */
export function statusMatchesApplicationFilter(status: string | undefined, filter: ApplicationFilter): boolean {
  if (filter === "action") return ACTION_STATUSES.includes(status ?? "");
  if (filter === "ready") return READY_STATUSES.includes(status ?? "");
  if (filter === "submitted") return status === "submitted";
  return true;
}

/**
 * Does the Tracker owe the student a filtered list, with no packet open?
 *
 * This is the gate ISSUE-037 was: the ledger used to render only beside an open packet, so every
 * ?state= arrival applied its filter to nothing and showed no control to change it. It is a named
 * predicate rather than an inline condition because the two ways to get it wrong are silent on the
 * page and invisible to a source-level test. Inverting it hides the list on exactly the arrivals
 * that need it and shows a duplicate of the board on the ones that do not; raising the count
 * threshold makes every deep link inert again for every real account. Both survived an earlier
 * version of the test that only checked this condition MENTIONED the filter. The truth table sits
 * beside this in tests/application-state-deeplink.regression-1.test.mjs.
 *
 * Not on "all": on the unfiltered board view the list would only restate the board below it, and
 * setting the select back to Everything is how the student clears the filter.
 * Not on an empty history: the empty state speaks for that page instead.
 */
export function ledgerRendersOnLanding(filter: ApplicationFilter, reviewableCount: number): boolean {
  return filter !== "all" && reviewableCount > 0;
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
