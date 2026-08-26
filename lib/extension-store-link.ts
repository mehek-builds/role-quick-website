import { STORE_URL } from "./config";

/* THE DEAD END THIS CLOSES. A fill refused for a missing or stale extension told the applicant to
 * "Update the Litos extension from the Chrome Web Store, then try again." and then left her to find
 * it herself. The listing is addressed by a 32-character extension id nobody can guess or search
 * for, so the sentence named a destination the screen would not take her to, on the one screen she
 * was already stuck on. Measured live on the applications composer, 2026-08-26: pressing "Fill
 * application" refused with exactly that sentence and offered no way forward anywhere on the page.
 *
 * SCOPED TO THE MESSAGES THE STORE ACTUALLY ANSWERS, which is why this tests for an install/update
 * verb rather than for the words "Litos extension" alone. An extension signed in to a DIFFERENT
 * account ("The Litos extension is signed in to another account. Sign out there, then try again.")
 * is already installed and already current - sending her to the store would be the wrong
 * instruction, and a link that contradicts the sentence beside it is worse than no link. That
 * message names no install or update verb, so it is excluded by construction rather than by a
 * hand-maintained list of strings that would drift the first time the copy is reworded.
 */
const NAMES_THE_EXTENSION = /\bLitos extension\b/i;
const ASKS_TO_INSTALL_OR_UPDATE = /\b(install|update|reinstall)\b/i;

/** The Chrome Web Store listing. One source, shared with the rest of the site's install links. */
export const EXTENSION_STORE_URL = STORE_URL;

/**
 * Whether this refusal is one the applicant can act on by opening the Chrome Web Store.
 *
 * Undefined and empty read as "no", so a caller may pass an error state straight through without
 * guarding first - the link simply does not render when there is nothing to answer.
 */
export function messageAsksForTheExtension(message: string | null | undefined): boolean {
  const text = (message ?? "").trim();
  if (!text) return false;
  return NAMES_THE_EXTENSION.test(text) && ASKS_TO_INSTALL_OR_UPDATE.test(text);
}
