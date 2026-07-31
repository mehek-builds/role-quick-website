import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (token && host) {
  try {
    posthog.init(token, {
      api_host: host,
      defaults: "2026-01-30",
      autocapture: false,
      capture_exceptions: false,
      capture_pageview: true,
      disable_external_dependency_loading: true,
      disable_session_recording: true,
      debug: process.env.NODE_ENV === "development",
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("PostHog initialization failed", error);
    }
  }
} else if (process.env.NODE_ENV === "development") {
  console.warn("PostHog is disabled because its public project token or host is missing.");
}
