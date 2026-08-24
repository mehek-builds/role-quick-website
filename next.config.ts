import type { NextConfig } from "next";

/* The one timestamp the footer is allowed to read.
 *
 * Resolved once, here, at module scope, so a single `next build` compiles the
 * same literal into the server bundle and the browser bundle. That is the whole
 * point of it living in `env` rather than being read at render: `env` keys are
 * INLINED at compile time, so `process.env.BUILD_TIME` in components/SiteFooter
 * is a string constant in both places and the two cannot disagree.
 *
 * Why this and not "keep /contact a server component". /contact is the only
 * route carrying "use client" that renders the footer, and pushing the
 * directive down into a child would fix that one page while leaving the trap
 * armed: the next page converted to a client component, or the next client
 * component that renders the footer, silently reintroduces the same split. The
 * defect is not that /contact is a client component, it is that the footer read
 * a variable that existed on the server and nowhere in the browser. Fixing the
 * variable fixes every route at once, including the ones not written yet.
 *
 * Measured before the fix, building with BUILD_TIME=2026-07-01: every
 * prerendered page said "Built July 2026" in its server HTML, and /contact's
 * rendered DOM said "Built August 2026" because the browser re-evaluated
 * `process.env.BUILD_TIME ?? Date.now()` with BUILD_TIME undefined. Two
 * contradicting build dates on one deploy, plus a silent hydration mismatch,
 * and /contact would have shown every visitor their own current month forever.
 * That is the manufactured freshness the Guardrails ban, which the comment
 * beside that line already said, wrongly, was handled.
 *
 * CI should set BUILD_TIME explicitly. The fallback is one clock read per build
 * process, which is deterministic within a build but not reproducible across
 * two builds of the same commit. Pinned by tests/build-date-provenance.test.mjs.
 *
 * Side effect of inlining a timestamp into a CLIENT chunk, worth knowing before
 * someone reports it as a caching bug: two builds of the same commit now emit
 * different content for the chunk carrying the footer, so its hashed filename
 * changes and returning visitors re-download it. Main's client bundle carried no
 * date at all, so this is new. Setting BUILD_TIME from something commit-derived
 * in CI removes it entirely, which is the same recommendation as above for a
 * second reason.
 *
 * ---- why the validation below exists ----
 *
 * `??` is NULLISH-only. Deleting the runtime fallback in SiteFooter moved the
 * failure from "quietly plausible" to "loudly wrong", which was the intent, but
 * an empty or unparseable BUILD_TIME sails straight through `??` and the
 * loudness lands on the VISITOR rather than on the build. Measured, all three
 * exiting 0 before this guard:
 *
 *   BUILD_TIME unset      -> "Built August 2026"        (correct, clock fallback)
 *   BUILD_TIME=""         -> "Built Invalid Date" / "(c) NaN Litos"
 *   BUILD_TIME=latest     -> "Built Invalid Date" / "(c) NaN Litos"
 *
 * Site-wide, every page, and `npm test` stays green because the assertions that
 * guard the footer are static shape checks. This repo auto-deploys on merge, so
 * the first observer would have been someone on trylitos.com. A CI line reading
 * BUILD_TIME=$(some command that failed), or a Vercel dashboard variable saved
 * blank, produces exactly the empty-string case.
 *
 * So the check is here rather than in the component: set-but-unparseable is a
 * configuration mistake, and a configuration mistake should fail the build. An
 * ABSENT variable is still legitimate (a local `npm run build` has no CI to set
 * it) and still falls back to the clock. Empty is not treated as absent, because
 * an explicitly empty variable is far more likely a broken expression than a
 * request for the current time.
 *
 * The value is normalised to a canonical ISO instant so the inlined literal
 * depends on the instant and not on how CI spelled it: BUILD_TIME=2026-07-01 and
 * BUILD_TIME=2026-07-01T00:00:00Z produce byte-identical bundles.
 */
const rawBuildTime = process.env.BUILD_TIME;
if (rawBuildTime !== undefined && Number.isNaN(Date.parse(rawBuildTime))) {
  throw new Error(
    `BUILD_TIME is set but unparseable: ${JSON.stringify(rawBuildTime)}. ` +
      `Leave it unset to use the build clock, or set a date Date.parse can ` +
      `read. It is rendered in the site footer on every page, so an ` +
      `unparseable value ships "Invalid Date" to visitors.`,
  );
}
const BUILD_TIME = new Date(rawBuildTime ?? Date.now()).toISOString();

export const CONTROLLED_PORTAL_ORIGIN_ENV = "LITOS_TEST_PORTAL_PUBLIC_ORIGIN";

type Environment = Record<string, string | undefined>;

/**
 * Next development mode validates the browser Origin on its HMR WebSocket.
 * The controlled runner reaches this local server through one short-lived
 * Cloudflare tunnel, so that exact configured hostname has to be present in
 * allowedDevOrigins or React never hydrates the server-rendered fixture.
 *
 * This does not make a wildcard trust decision. The backend signs the exact
 * controlled portal URL separately. Here we accept one exact origin from the
 * same environment key, validate it even in production, and expose its hostname
 * only when this process is a local development server.
 */
export function controlledPortalDevOrigin(env: Environment = process.env): string | null {
  const raw = env[CONTROLLED_PORTAL_ORIGIN_ENV]?.trim();
  if (!raw) return null;

  let origin: URL;
  try {
    origin = new URL(raw);
  } catch {
    throw new Error(`${CONTROLLED_PORTAL_ORIGIN_ENV} must be an absolute URL.`);
  }

  if (
    origin.username
    || origin.password
    || origin.pathname !== "/"
    || origin.search
    || origin.hash
  ) {
    throw new Error(`${CONTROLLED_PORTAL_ORIGIN_ENV} must contain only an origin, without credentials, path, query, or fragment.`);
  }

  const hostname = origin.hostname.toLowerCase();
  if (hostname === "trylitos.com" || hostname === "www.trylitos.com") {
    throw new Error(`${CONTROLLED_PORTAL_ORIGIN_ENV} must never name a Litos production host.`);
  }

  const loopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
  if (loopback) {
    if (origin.protocol !== "http:" && origin.protocol !== "https:") {
      throw new Error(`${CONTROLLED_PORTAL_ORIGIN_ENV} loopback origins must use HTTP or HTTPS.`);
    }
  } else {
    if (origin.protocol !== "https:" || origin.port) {
      throw new Error(`${CONTROLLED_PORTAL_ORIGIN_ENV} public origins must use HTTPS with no custom port.`);
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/.test(hostname)) {
      throw new Error(`${CONTROLLED_PORTAL_ORIGIN_ENV} public origins must be one exact trycloudflare.com tunnel host.`);
    }
  }

  return env.NODE_ENV === "development" ? hostname : null;
}

const controlledPortalOrigin = controlledPortalDevOrigin();
const extraControlledDevOrigins = controlledPortalOrigin
  && controlledPortalOrigin !== "127.0.0.1"
  && controlledPortalOrigin !== "localhost"
  ? [controlledPortalOrigin]
  : [];

const nextConfig: NextConfig = {
  /* Dashboard navigation uses React's ViewTransition boundary so the old page can leave before
   * the next one settles in. The browser API is progressive enhancement: unsupported browsers
   * keep the same instant navigation, and globals.css removes every duration for reduced motion. */
  experimental: {
    viewTransition: true,
  },
  /* The controlled end-to-end harness opens the local development server through
   * 127.0.0.1 so its API, website, portal, and disposable database all use an
   * explicit loopback address. Next blocks development assets when that origin
   * differs from its default localhost origin. The server HTML still arrives,
   * but React never hydrates, so Guest mode and every other client interaction
   * silently disappear. A controlled tunnel host is admitted only after the
   * exact-origin validation above, and only in development. */
  allowedDevOrigins: ["127.0.0.1", ...extraControlledDevOrigins],
  env: { BUILD_TIME },
  async redirects() {
    return [
      {
        source: "/dashboard/resume",
        destination: "/dashboard/documents?tab=base-resume",
        permanent: false,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.trylitos.com" }],
        destination: "https://trylitos.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
