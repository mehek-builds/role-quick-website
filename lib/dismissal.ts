import { localDayKey } from "@/lib/local-day";

/**
 * Same-day "not interested" list for a matched job.
 *
 * Shared by Home and the Jobs list so a job dismissed on one screen stays hidden on the other for
 * the rest of the day, and comes back for both tomorrow. One key format, read from one place, is
 * what keeps the two screens from silently disagreeing about what "skipped" means for the same
 * posting.
 *
 * Keyed on the LOCAL day, so "skipped for today" lasts until the student's own midnight. No legacy
 * read of an old UTC-dated key: where the two disagree (the hours between local and UTC midnight) a
 * student can see one day's skip list reset once, and that is the whole cost. The list is same-day
 * only, it holds nothing but "not this one", and re-skipping is one click on a card that is already
 * on screen. A fallback read would have to merge two keys, decide which one wins when both exist,
 * and then be deleted later anyway. That is more moving parts, permanently, to avoid one cheap
 * click, once. Take the reset.
 */
export function dailyDismissalKey(): string {
  return `litos-dismissed-${localDayKey()}`;
}

export function readDismissed(key: string): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
