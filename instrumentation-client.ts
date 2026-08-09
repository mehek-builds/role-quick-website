import posthog from "posthog-js/dist/module.slim";
import { sanitizePostHogEvent } from "@/lib/posthog-privacy";
import { SESSION_TOKEN_KEY, userIdFromToken } from "@/lib/session-identity";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

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
     * Reading the token directly rather than importing lib/api keeps this file
     * a leaf: lib/api imports lib/analytics, and pulling that chain into the
     * instrumentation entry point risks an import cycle at boot, which is the
     * worst possible place to have one. */
    const stored = window.localStorage.getItem(SESSION_TOKEN_KEY);
    const userId = userIdFromToken(stored);
    if (userId) posthog.identify(userId);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("PostHog initialization failed", error);
    }
  }
} else if (process.env.NODE_ENV === "development") {
  console.warn("PostHog is disabled because its public project token or host is missing.");
}
