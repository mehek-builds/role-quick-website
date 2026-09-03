// Chrome Web Store listing. The 32-char extension ID is assigned by Google and
// immutable; the backend also serves /install as a redirect to this same URL.
export const STORE_URL =
  "https://chromewebstore.google.com/detail/bdbedbmkjpfioknfpmhookefabipjaad";

const DEFAULT_SITE_URL = "https://trylitos.com";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL
).replace(/\/+$/, "");

// The extension's backend (repo: mehek-builds/volley-backend, still named
// Volley internally). The website calls it directly: same API, same JWT, so a
// signed-in extension user and a signed-in website user are the same account.
//
// THE DEFAULT WAS LOAD-BEARING IN PRODUCTION UNTIL 2026-09-04, which is why it
// mattered so much that it was wrong. The Dockerfile declared no build ARG for
// NEXT_PUBLIC_API_URL, so Railway's service variable never reached
// `npm run build` and the literal below was the API origin every visitor got.
// Measured against the live bundle on 2026-09-03: the deployed chunk carried
// the whole `?? "<default>"` expression instead of an inlined literal, which is
// exactly what an undefined build-time variable compiles to.
//
// The Dockerfile now declares that ARG, so on Railway this line is a fallback
// again rather than the configuration. KEEP IT ANYWAY. It is what a build with
// no variable set compiles in, which is every local build, every CI build in
// the `check` job, and production on the day someone clears the Railway field.
// The build args and this literal are checked against each other by
// tests/next-public-build-args.test.mjs; the value here is pinned by
// tests/api-origin-default.test.mjs and asserted against the emitted bundle by
// the "built bundle carries the live API origin" step in CI.
//
// It defaulted to student-outreach-backend.vercel.app, the transitional name
// used while the DNS cutover ran. That cutover is complete and the Vercel
// project is being retired, so the old default aimed production at a host that
// disappears the day that project is deleted. Both names served the identical
// Railway service while both existed (service "litos-api", same revision, same
// revision_source "railway-git"), so this is a hop being removed, not a backend
// being changed. Pinned by tests/api-origin-default.test.mjs.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.trylitos.com";

export const EXTENSION_ID = "bdbedbmkjpfioknfpmhookefabipjaad";
