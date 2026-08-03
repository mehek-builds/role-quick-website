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
