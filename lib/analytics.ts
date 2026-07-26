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

/* Onboarding funnel (/start).
 *
 * This exists to answer ONE question that cannot be answered by looking at the code: where do
 * students actually stop? The flow was designed against drop-off - it is skippable, four of the
 * five targeting answers arrive pre-filled, and the hardest screen carries a note explaining
 * itself - but "designed against" is a hypothesis, not a result. Without these events the honest
 * answer to "will retention hold?" is "nobody can know", which is not an answer.
 *
 * Every event carries `step`, so the funnel is just step_view -> step_done per step. The
 * difference between those two counts at any step IS the drop-off at that step. Two specific
 * things this is here to catch:
 *
 *   1. Step 03. It asks for ~12 minutes on someone else's form. Drop-off will concentrate here
 *      and it is the only step whose cost we cannot reduce, only justify. If it bleeds, the
 *      founder note is the thing to change first.
 *   2. Whether "Finish later" is an escape hatch or an exit. It is deliberately visible on every
 *      screen (the Guardrails forbid burying it), so the risk is real and worth measuring rather
 *      than assuming.
 *
 * step_skip vs step_later are distinct on purpose: skipping gaps means "I don't have a GPA handy"
 * and the student stays; Finish later means they left the flow. Collapsing them would hide which
 * one is happening. */
type OnboardingEvent =
  | "onboarding_step_view"
  | "onboarding_step_done"
  | "onboarding_step_skip"
  | "onboarding_step_later"
  | "onboarding_complete";

type PricingEvent =
  | "pricing_quote_viewed"
  | "pricing_country_changed"
  | "pricing_interval_changed"
  | "pricing_checkout_started"
  | "pricing_checkout_failed";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

function device(): "desktop" | "mobile" {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 640 ? "mobile" : "desktop";
}

export function track(
  event: TryEvent | OnboardingEvent | PricingEvent,
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
