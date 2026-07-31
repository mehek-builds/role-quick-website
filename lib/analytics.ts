import posthog from "posthog-js";

/* Funnel events for /try (design doc 2026-07-08). One metric matters:
   install click-through. Events log to console in dev and use the initialized
   PostHog browser client; every event carries a device property so the
   real-vs-canned CTR comparison stays desktop-only. */

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
  // The moment on the base step where the student picks the rebuilt resume over their upload.
  // Measured separately from onboarding_step_done: choosing and finishing are different acts, and
  // the gap between them is how long they spent editing.
  | "onboarding_base_chosen"
  // The metrics ask on the base step. Added and skipped are tracked apart because they answer
  // different questions: whether students have the numbers, and whether the ask is worth its place.
  | "base_resume_metrics_added"
  | "base_resume_metrics_skipped"
  | "onboarding_complete";

type CoreEvent =
  | "authentication_completed"
  | "contact_form_submitted"
  | "application_generation_completed"
  | "application_submission_requested"
  | "application_submission_completed"
  | "checkout_started"
  | "account_data_exported"
  | "account_deleted";

function device(): "desktop" | "mobile" {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 640 ? "mobile" : "desktop";
}

export function track(
  event: TryEvent | OnboardingEvent | CoreEvent,
  props: Record<string, string | number | boolean> = {},
) {
  if (typeof window === "undefined") return;
  const payload = { ...props, device: device(), path: window.location.pathname };
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[rq:${event}]`, payload);
  }
  try {
    posthog.capture(event, payload);
  } catch {
    /* analytics must never break the funnel */
  }
}
