// Chrome Web Store listing. The 32-char extension ID is assigned by Google and
// immutable; the backend also serves /install as a redirect to this same URL.
export const STORE_URL =
  "https://chromewebstore.google.com/detail/bdbedbmkjpfioknfpmhookefabipjaad";

// The legacy repository and deployment names remain stable during the Litos migration.
// The website calls it directly: same API, same JWT, so a
// signed-in extension user and a signed-in website user are the same account.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://student-outreach-backend.vercel.app";
