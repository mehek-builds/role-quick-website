/**
 * What Litos costs, in one place.
 *
 * These MIRROR the server, which is the only thing that actually enforces
 * them: `LIMITS` and `TRIAL_DAYS` in the backend's `src/middleware/quota.ts`.
 * The website cannot import across repos, so this file is the seam, and the
 * rule for it is: never edit a number here without changing the backend in the
 * same breath, and never quote a number on a page without importing it from
 * here.
 *
 * Why the seam exists at all: until 2026-07-28 the marketing site published no
 * price and no cap while the Chrome Web Store listing published both, and the
 * two had already drifted (the listing counts "20 applications" AND "20
 * resumes" as separate allowances; there is one meter, monthlyResumes, and an
 * application spends it once). A number that lives in three places has already
 * chosen which copy will be wrong.
 *
 * The backend reads each of these from an env var with these as the fallbacks,
 * so they are tunable there without a deploy. If one is ever tuned in
 * production, this file is what has to follow it.
 */

/** Days of full Pro access at signup, no card. Backend: TRIAL_DAYS. */
export const TRIAL_DAYS = 7;

/** Backend: LIMITS.free. */
export const FREE_LIMITS = {
  resumes: 20,
  contacts: 30,
  drafts: 60,
} as const;

/** Backend: LIMITS.pro. */
export const PRO_LIMITS = {
  resumes: 1000,
  contacts: 500,
  drafts: 1000,
} as const;

/** Stripe, billed weekly. */
export const PRO_WEEKLY_PRICE = "19.99";

/** Stripe, billed monthly. */
export const PRO_MONTHLY_PRICE = "39.99";
