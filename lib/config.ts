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
// THE DEFAULT IS LOAD-BEARING IN PRODUCTION, which is not obvious and is why it
// was wrong. This repo's Dockerfile declares no build ARG for
// NEXT_PUBLIC_API_URL, so Railway's service variable never reaches
// `npm run build`, and the literal below is the API origin every visitor gets.
// Measured against the live bundle on 2026-09-03: the deployed chunk still
// carried the whole `?? "<default>"` expression instead of an inlined literal,
// which is exactly what an undefined build-time variable compiles to.
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
