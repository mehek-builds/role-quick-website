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

/** Days of Litos+ access at signup. */
export const TRIAL_DAYS = 7;

/* WHAT AN ACCOUNT WITH NO PLAN MAY DO. Not an offer and not a tier on sale anywhere: Free is
   where an account lands by cancelling, and nothing in the product sells it. This is enforcement
   copy for grandfathered accounts, which is why it survived the 2026-09-08 removal of every Free
   surface. Application filling is unlimited separately and is not metered here. */
export const FREE_LIMITS = {
  resumes: 0,
  contacts: 0,
  drafts: 0,
} as const;

/* ONE GIFT OF 20 JOBS, taken inside the seven days, once per account. A job that needs a tailored
   resume, a cover letter and application answers spends ONE of the 20, not three.

   These were three separate 5s until 2026-09-08, and the backend had already moved to 10s without
   them: the exact drift the header above warns about, live for weeks.

   The outreach allowances that sat here are gone from the OFFER, not from the server: contact
   discovery and outreach drafts are still metered per company by entitlements.ts, and the
   snapshot still publishes outreach_companies_*, but no plan advertises them any more (Mehek's
   call 2026-09-08). Nothing should quote them to a student. */
export const TRIAL_LIMITS = {
  generations: 20,
} as const;

/** Paid Litos+ has no user-facing generation quota. Null means unmetered in UI copy. */
export const PLUS_LIMITS = { resumes: null, contacts: null, drafts: null } as const;
/** Compatibility name for code deployed before the Litos+ rename. */
export const PRO_LIMITS = PLUS_LIMITS;

export const PRO_WEEKLY_PRICE = "29.99";
export const PRO_MONTHLY_PRICE = "59.99";
export const PLUS_QUARTER_PRICE = "119.99";
/** The undiscounted quarterly rate the "70% off" badge is struck through against. */
export const PLUS_QUARTER_LIST_PRICE = "359.99";
