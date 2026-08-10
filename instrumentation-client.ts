import posthog from "posthog-js/dist/module.slim";
import { identifyUser } from "@/lib/analytics";
import { sanitizePostHogEvent } from "@/lib/posthog-privacy";
import { SESSION_TOKEN_KEY, userIdFromToken } from "@/lib/session-identity";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

/* localStorage is not always reachable: Safari with storage blocked, a
 * sandboxed iframe without allow-same-origin, and partitioned third-party
 * embeds all throw SecurityError on access rather than returning null. Its own
 * try/catch, because folding it into the init block below would report a
 * storage failure under the message "PostHog initialization failed", which
 * would send the next person debugging it to the wrong place entirely. */
function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

if (token && host) {
  try {
    posthog.init(token, {
      api_host: host,
      defaults: "2026-01-30",
      autocapture: false,
      capture_exceptions: false,
      capture_pageview: "history_change",
      disable_external_dependency_loading: true,
      disable_session_recording: true,
      before_send: sanitizePostHogEvent,
      debug: process.env.NODE_ENV === "development",
    });
    /* Re-attach the identity on every boot, not only at sign-in.
     *
     * identifyUser runs inside setSession, which only fires the moment someone
     * signs in. Anyone who already has a session, which is every returning
     * user, stayed anonymous forever: measured on 2026-08-09, the two most
     * active accounts on the site had authenticated on 04 August and had been
     * browsing as unidentified cookies ever since, because the only three
     * "sign-in clicks" after that were the app bouncing an existing session
     * straight through to the dashboard without re-authenticating.
     *
     * posthog.identify is idempotent for an unchanged id, so calling it on
     * every load costs nothing and closes the gap without touching the
     * sign-in path.
     *
     * It goes through identifyUser rather than posthog.identify directly so
     * there stays exactly ONE identify call site in the codebase, the one that
     * carries the "no properties, never the email address" invariant.
     * tests/posthog.test.mjs enforces that this file does not call
     * posthog.identify itself.
     *
     * The token is read here rather than through lib/api because lib/api is a
     * large client module and this is the boot entry point; session-identity
     * has no imports of its own, so SESSION_TOKEN_KEY lives there and both
     * sides read the same constant. */
    const stored = readStoredToken();
    identifyUser(userIdFromToken(stored));
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("PostHog initialization failed", error);
    }
  }
} else if (process.env.NODE_ENV === "development") {
  console.warn("PostHog is disabled because its public project token or host is missing.");
}
