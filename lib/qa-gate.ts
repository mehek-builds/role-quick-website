import { createHash, timingSafeEqual } from "node:crypto";

/**
 * THE SHARED SECRET THAT KEEPS THE QA FIXTURES OFF THE PUBLIC INTERNET.
 *
 * Measured on 2026-08-09: https://trylitos.com/qa/portal-submission?board=ashby&shape=security-code
 * returned 200 to anonymous traffic and rendered a complete fake job application headed "Software
 * Engineering Intern, Summer 2027", with working fields and, on one shape, a large "Thank you for
 * submitting your application" panel. Nothing gated it. The only thing pointing the other way was
 * app/robots.ts disallowing /qa/, and a robots rule is a request made of crawlers, not access
 * control: it does not stop a person, a link, a screenshot, or a competitor.
 *
 * That is a credibility problem before it is a security one. Litos sells trustworthy handling of
 * real job applications, and it was serving fabricated job postings from its own marketing domain.
 *
 * WHY THIS IS A SECRET IN THE URL AND NOT AN AUTH WALL. The fixtures have to stay reachable from
 * the public internet, because the trial harness (student-outreach-backend,
 * scripts/trial-portal-shapes.mts) drives them through Stratus, a managed browser running in a
 * Vercel sandbox. A remote browser cannot reach localhost, and it navigates to a URL rather than
 * issuing a crafted request, so anything that needs a custom header or a cookie handshake cannot be
 * used by the one caller these pages exist for. A query parameter survives a plain navigation. The
 * header is accepted too, for curl and for anything that can set one.
 *
 * WHAT THIS DOES NOT CLAIM. A secret in a query string lands in access logs and in the referrer of
 * any off-site request the page makes. It is a gate against the open internet, not a credential.
 * Nothing behind it can contact an employer, hold user data, or spend money: the fixture forms have
 * no action attribute and make no network write. Rotate it by changing the environment variable in
 * both projects, which is the whole rotation procedure.
 */

/** The environment variable, identical in this project and in the backend that drives the harness. */
export const QA_GATE_ENV = "LITOS_QA_PORTAL_SECRET";

/** Query parameter. The one form that survives a plain browser navigation by the managed runner. */
export const QA_GATE_PARAM = "litos_qa_key";

/** Header form, for callers that can set one. */
export const QA_GATE_HEADER = "x-litos-qa-key";

/* Same shape the backend already requires of LITOS_TEST_PORTAL_BINDING_SECRET, so the two secrets
   in this system are generated the same way: `openssl rand -base64 48 | tr -d '=+/' | cut -c1-48`.
   A value outside this shape is treated as UNSET rather than accepted, which is what stops
   LITOS_QA_PORTAL_SECRET=1 from looking like protection. */
const SECRET_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

type Env = Record<string, string | undefined>;

export function configuredQaSecret(env: Env = process.env): string | null {
  const raw = env[QA_GATE_ENV]?.trim();
  return raw && SECRET_SHAPE.test(raw) ? raw : null;
}

/**
 * The unset-secret fallback, and it fails CLOSED everywhere except a local dev server.
 *
 * Open only when this is Next's development mode AND the process is not a Vercel deployment.
 * VERCEL_ENV is set to production, preview or development on every Vercel runtime, so a preview
 * build with no secret configured is shut, not open: a preview URL is public too, and "it is only
 * a preview" is how the fixtures ended up public in the first place.
 *
 * The NODE_ENV half is the belt to that braces. If this app is ever run somewhere Vercel is not,
 * or in a container that drops VERCEL_ENV, a production build still refuses. The cost is that the
 * local production-build launch config (README: litos-website-prod on :3501) needs
 * LITOS_QA_PORTAL_SECRET in .env.local to reach /qa/, which is a five-second fix and the right
 * direction to be wrong in.
 */
export function qaGateOpenWithoutSecret(env: Env = process.env): boolean {
  return !env.VERCEL_ENV && env.NODE_ENV === "development";
}

/* Hash both sides before comparing. timingSafeEqual throws on a length mismatch, so the usual
   `a.length === b.length && timingSafeEqual(...)` guard answers "is your guess the right length?"
   in variable time before it answers anything else. Comparing two SHA-256 digests is fixed width
   by construction, so the comparison is constant time for every input including the empty string. */
function constantTimeEquals(left: string, right: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(left, "utf8").digest(),
    createHash("sha256").update(right, "utf8").digest(),
  );
}

/**
 * The whole decision, pure and testable. `supplied` is the query parameter or the header, whichever
 * the caller found; a route that finds neither passes null and gets the unset-secret fallback.
 */
export function qaAccessAllowed(supplied: string | null | undefined, env: Env = process.env): boolean {
  const secret = configuredQaSecret(env);
  if (!secret) return qaGateOpenWithoutSecret(env);
  if (typeof supplied !== "string" || supplied.length === 0) return false;
  return constantTimeEquals(supplied, secret);
}

/** Pulls the parameter out of a resolved searchParams object, tolerating the repeated-key array. */
export function suppliedQaKey(searchParams: Record<string, unknown> | undefined): string | null {
  const raw = searchParams?.[QA_GATE_PARAM];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return null;
}
