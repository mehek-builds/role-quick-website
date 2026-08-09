import type { ApplicationProfile } from "@/lib/api";

/* ---- when an internship could actually run ----
 *
 * THE BIGGEST SINGLE GAP IN THE CORPUS. Counted across all 112 stored packets, one fact asked five
 * ways leads every other blocker: "what dates are you available for an internship" (holding a live
 * truveta packet), "when do you plan on ending your internship" (6 postings), and the start date
 * pair. The profile has had an "Available from" box the whole time and the backend has always
 * refused to read it, correctly: a bare date carries no recruiting cycle and no expiry, so a date
 * typed for one summer would go on answering the next summer's forms, and that is a commitment to
 * an employer the student never made and could be held to.
 *
 * WHY FOUR VALUES FOR ONE ANSWER. Each is a check the old box could not pass, and the backend
 * answers nothing at all unless every one of them is stored:
 *   the two dates   the window itself, both ends, so "when does it end" is answerable
 *   the cycle       the SCOPE. A window may only answer a posting whose own description names this
 *                   same season and year; a posting that names none is left for the student.
 *   valid through   the EXPIRY, hers to set. A student who accepts an offer in March wants her
 *                   summer answer to stop being given, and only she knows that date.
 *
 * Shared by /start and Settings so the two screens cannot describe the same rule differently.
 */

const AVAILABILITY_SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;

/** Season and year pairs from this year forward, which is the whole range a student applies into. */
export function availabilityCycleOptions(now: Date = new Date()): string[] {
  const first = now.getUTCFullYear();
  const cycles: string[] = [];
  for (let year = first; year <= first + 2; year += 1) {
    for (const season of AVAILABILITY_SEASONS) cycles.push(`${season} ${year}`);
  }
  return cycles;
}

export type AvailabilityWindowInput = {
  start: string;
  end: string;
  cycle: string;
  validThrough: string;
};

/**
 * Whether the four values amount to something the backend will ever answer from.
 *
 * Mirrors readAvailabilityWindow in the backend deliberately, and is used ONLY to tell the student
 * what will happen. It is not a gate on the save: her typing is hers, a partial record is stored as
 * a partial record, and the backend refuses on it exactly as it refuses on nothing at all.
 */
export function availabilityWindowStatus(
  input: AvailabilityWindowInput,
): "empty" | "incomplete" | "incoherent" | "ready" {
  const filled = [input.start, input.end, input.cycle, input.validThrough].filter((value) => value.trim());
  if (filled.length === 0) return "empty";
  if (filled.length < 4) return "incomplete";
  if (input.start > input.end) return "incoherent";
  const cycleYear = input.cycle.trim().split(" ")[1];
  if (cycleYear !== input.start.slice(0, 4) && cycleYear !== input.end.slice(0, 4)) return "incoherent";
  return "ready";
}

/**
 * The profile patch for the availability window.
 *
 * Kept out of applicationFactPatch on purpose: that builder's contract is one text box per column,
 * and these four are one answer split across four controls with a shape the server validates. A
 * blank is omitted here for the same reason it is omitted there, so nothing on the /start card can
 * overwrite an answer given in Settings with an empty box.
 */
export function availabilityWindowPatch(input: AvailabilityWindowInput): Partial<ApplicationProfile> {
  const patch: Partial<ApplicationProfile> = {};
  const start = input.start.trim();
  const end = input.end.trim();
  const cycle = input.cycle.trim();
  const validThrough = input.validThrough.trim();
  if (start) patch.availability_window_start = start;
  if (end) patch.availability_window_end = end;
  if (cycle) patch.availability_cycle = cycle;
  if (validThrough) patch.availability_valid_through = validThrough;
  return patch;
}
