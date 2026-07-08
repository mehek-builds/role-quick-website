/* Funnel events for /try (design doc 2026-07-08). One metric matters:
   install click-through. Events log to console in dev and POST to PostHog
   when NEXT_PUBLIC_POSTHOG_KEY is set; every event carries a device
   property so the real-vs-canned CTR comparison stays desktop-only. */

type TryEvent =
  | "try_start"
  | "path_chosen"
  | "packet_complete"
  | "install_click"
  | "send_link_submit";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

function device(): "desktop" | "mobile" {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 640 ? "mobile" : "desktop";
}

export function track(
  event: TryEvent,
  props: Record<string, string | number | boolean> = {},
) {
  const payload = { ...props, device: device(), path: window.location.pathname };
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[rq:${event}]`, payload);
  }
  if (!POSTHOG_KEY) return;
  try {
    const body = JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      properties: { ...payload, distinct_id: anonId() },
    });
    navigator.sendBeacon?.(`${POSTHOG_HOST}/capture/`, body) ||
      fetch(`${POSTHOG_HOST}/capture/`, { method: "POST", body, keepalive: true });
  } catch {
    /* analytics must never break the funnel */
  }
}

function anonId(): string {
  const KEY = "rq_anon_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
