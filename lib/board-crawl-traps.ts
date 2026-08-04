/**
 * The /browse-jobs query parameters a crawler must not follow, and the matcher that decides.
 *
 * WHY THIS IS ITS OWN MODULE. It lives here rather than inside app/robots.ts so it can be tested:
 * robots.ts imports SITE_URL through the `@/` alias, which the repo's test runner
 * (`node --experimental-strip-types`) cannot resolve, so nothing importing robots.ts is testable.
 * This file deliberately has NO imports at all.
 *
 * WHY IT NEEDS A TEST. robots.txt matching is PREFIX matching with `*` wildcards, which does not
 * behave the way a regex reader expects, and the first version of these rules got it wrong in a way
 * that was invisible on inspection: an attempt to allow pages 1-9 and block 10 upward was written
 * as `page=1`, `page=2`, and so on, and prefix matching meant `page=1` also matched `page=10` and
 * `page=15`. The rules blocked precisely the pages they were meant to protect.
 */

/**
 * The three unbounded filters.
 *
 * /browse-jobs is server-rendered from its searchParams, so every distinct combination is a
 * distinct URL a crawler will fetch, and each cache miss goes through to the backend and then to
 * Neon. Neon's free tier suspends the compute when the monthly transfer allowance runs out, which
 * is not hypothetical: it happened on 2026-08-04.
 *
 * `q`, `company` and `location` are whatever a visitor typed, so they generate URLs without limit
 * and rank for nothing. The curated facets are deliberately NOT here: `title` comes from the
 * JOB_TITLES list and `employment_type` from a five-value enum, so both are bounded, small, and
 * describe searches a person actually makes. Those are landing pages worth indexing.
 *
 * The `*` sits immediately after the `?` so that parameter ORDER does not decide the match:
 * `?title=X&q=y` has to be caught as surely as `?q=y`.
 */
export const BOARD_CRAWL_TRAPS = [
  "/browse-jobs?*q=",
  "/browse-jobs?*company=",
  "/browse-jobs?*location=",
] as const;

/**
 * Does this robots.txt pattern block this path? Prefix match, `*` meaning "any sequence".
 *
 * Exported for the test rather than for production, because production never runs this: the
 * patterns are handed to crawlers as text and Google and Bing do the matching. That is exactly why
 * the matcher has to exist somewhere we can assert against, or the rules ship unverified.
 */
export function robotsPatternBlocks(pattern: string, url: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + escaped).test(url);
}

/** Whether any of the board trap rules would stop a crawler fetching this URL. */
export function isCrawlTrapped(url: string): boolean {
  return BOARD_CRAWL_TRAPS.some((pattern) => robotsPatternBlocks(pattern, url));
}
