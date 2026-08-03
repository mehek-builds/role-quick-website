/**
 * The one definition of "today" for anything a student reads as a day.
 *
 * Every user-facing day boundary used to be `new Date().toISOString().slice(0, 10)`, which is the
 * UTC calendar day. UTC midnight is 4 PM ET and 1 PM PT, so for the primary market the day rolled
 * over in the middle of a working afternoon: jobs skipped under "Skipped for today" came back,
 * applications sent that same morning stopped counting toward "no matches left for the day", and
 * the prewarm lock key rotated. None of that had anything to do with the student's day ending.
 *
 * Derived from the local getters rather than Intl.DateTimeFormat so it does not depend on ICU
 * data being compiled in, and so it is trivially the same arithmetic everywhere it is called.
 */
export function localDayKey(when: Date = new Date()): string {
  const year = String(when.getFullYear()).padStart(4, "0");
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The local day a stored instant fell on, or null when the value is missing or unparseable.
 *
 * Exists so that anything comparing a stored UTC timestamp against a key from localDayKey does the
 * conversion instead of slicing the ISO string. Slicing reads the UTC day, and comparing a UTC day
 * to a local day is a worse bug than the one this module fixes: it would be wrong for part of
 * every day in every timezone that is not UTC, in both directions.
 */
export function localDayKeyOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? null : localDayKey(when);
}
