/* THE THIRD PARTIES THE NETWORK GUARDS TOLERATE, in one place for every spec that has one.
 *
 * Several e2e specs assert that a surface makes NO request nobody sanctioned - the audited-state
 * contracts around billing and account deletion, and the dashboard click path, which requires that
 * "nothing leaves this machine". Those guards are the reason a tracker landing in the root layout
 * is visible at all.
 *
 * `app/layout.tsx` loads the TikTok pixel from the root, so it fires on every page in the product,
 * audited ones included: it requests events.js and calls ttq.page(). When that merged (#389) it
 * turned every one of those guards red at once.
 *
 * MEHEK'S CALL 2026-08-20, taken with the alternatives on the table. The pixel stays everywhere,
 * including the billing return, because that is where a purchase completes and where ad attribution
 * is measured. The privacy cost is real and was named rather than discovered - a cookie-setting
 * tracker now loads on billing and account-management surfaces - and this file exists so that trade
 * stays legible. A guard relaxed without its reason recorded reads later as one that was quietly
 * bent to go green.
 *
 * ONE LIST, because the alternative is each spec deciding for itself and the guards disagreeing
 * about what the product is allowed to do. A second tracker has to be added HERE, deliberately,
 * with this comment in front of whoever adds it.
 *
 * NARROW BY CONSTRUCTION: matched on ORIGIN via the URL constructor, never a substring. Callers
 * abort these rather than fulfilling them - the suites must not make a real call to a real
 * analytics endpoint.
 */
export const SANCTIONED_THIRD_PARTY_ORIGINS = new Set(['https://analytics.tiktok.com']);

export function isSanctionedThirdParty(url) {
  try {
    return SANCTIONED_THIRD_PARTY_ORIGINS.has(new URL(url).origin);
  } catch {
    return false;
  }
}
