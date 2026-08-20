import posthog from "posthog-js/dist/module.slim";

/* Funnel events for /try (design doc 2026-07-08). One metric matters:
   install click-through. Events log to console in dev and use the initialized
   PostHog browser client; every event carries a device property so the
   real-vs-canned CTR comparison stays desktop-only. */

type TryEvent =
  | "try_start"
  | "path_chosen"
  | "try_clarifications_queued"
  | "try_clarifications_answered"
  | "packet_complete"
  | "install_click"
  /* The site's primary ask is now the account, not the store: every marketing
     CTA outside the #packet demo points at /login. install_click still exists
     and is still the store's number, but it is now earned only by the one
     button that sits under the demo, so the two are no longer measuring the
     same click under different names. */
  | "signin_click"
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
  | "recent_experience_enrichment_added"
  | "recent_experience_enrichment_skipped"
  // The metrics ask on the base step. Added and skipped are tracked apart because they answer
  // different questions: whether students have the numbers, and whether the ask is worth its place.
  | "base_resume_metrics_added"
  | "base_resume_metrics_skipped"
  // The fluency declaration, asked on the base step. `prefilled` separates the two cases that
  // matter: a student confirming what their resume already printed, and one typing it from
  // nothing. If the second dominates, the parser is missing languages it should be reading.
  | "onboarding_languages_declared"
  | "onboarding_complete"
  /* The match screen. `shown` carries which rung of the freshness ladder produced the row and
     whether the board had to be widened past the student's filters to find it, because those two
     decide what the screen is allowed to claim - and a flow that widens for most students is a
     targeting problem, not a copy problem. */
  | "onboarding_match_shown"
  | "onboarding_match_accepted"
  | "onboarding_match_reshuffled"
  /* The build. `outstanding` is the count that decides whether the questions screen is shown at
     all, and `fixable` separates a one-line profile gap from a genuine build failure - two very
     different things to see rising in a funnel. */
  | "onboarding_build_completed"
  | "onboarding_build_failed"
  /* The questions screen. `asked` versus `already_answered` is the ratio that says whether the
     pre-script is doing its job: a screen that asks eight of seventeen is a profile gap, not a
     UI problem. */
  | "onboarding_questions_saved"
  /* The irreversible one. Separated from the save path because the difference between them is the
     single most important number in this flow. */
  | "onboarding_application_sent"
  | "onboarding_application_saved_for_later"
  | "onboarding_trial_shown"
  | "onboarding_plan_declined"
  // A gated GUEST reached the plan screen and cannot pay yet: checkout needs an email
  // and a guest has none, so they are sent to claim one. Worth its own event because it
  // is the one exit from the payment gate, and a spike here means the gate is sending
  // people down a path they are not completing.
  | "onboarding_plan_claim_required"
  | "onboarding_plan_already_paid"
  /* Somebody went back to change an answer. A step that shows up here often is a step that asked
     the question badly the first time. */
  | "onboarding_revisit_opened"
  | "onboarding_revisit_saved"
  | "onboarding_build_claim_required";

type CoreEvent =
  | "authentication_completed"
  | "contact_form_submitted"
  | "application_generation_completed"
  | "application_submission_requested"
  | "application_submission_completed"
  | "application_fill_prepared"
  | "application_fill_handoff_armed"
  | "pricing_viewed"
  | "paywall_impression"
  | "paywall_dismissed"
  | "plan_selected"
  | "checkout_opened"
  | "checkout_started"
  | "account_data_exported"
  | "account_deleted"
  | "job_search_zero_results"
  /* A React error boundary caught a render-time throw and put its recovery
     screen up instead of the page.

     This is NOT the automatic exception capture that instrumentation-client.ts
     turns off and the privacy policy says is off. That feature ships the error
     message, the stack and the surrounding page state. This is one named
     product event carrying two fields: which surface blanked, and Next's
     `digest`, a server-generated hash of the error with no message in it. No
     message, no stack, nothing the student typed.

     It exists because the boundary is the only place that knows a page failed
     to render, and a boundary nobody can count is a boundary that hides the bug
     it caught: the screen says "try again", the student does, and the incident
     leaves no trace anywhere. */
  | "render_error"
  /* A backend response parsed as JSON and was not the shape its endpoint
     promises, so features/applications/infrastructure/response-shape.ts
     rejected it rather than letting the presentation layer map over a missing
     collection.

     This is the ONLY signal that the manually deployed backend and the
     automatically deployed frontend have drifted. Without it a drift is
     invisible from this side: the student sees a panel saying it could not
     load, retries, sees the same, and gives up, while every request in the log
     is a 200. Two fields, both from the client's own source: the endpoint path
     and the comma-joined NAMES of the offending fields. No values, no message,
     no stack, nothing the student typed, matching render_error above. */
  | "api_payload_incomplete";

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

/* Attach the anonymous browsing history to the account that just signed in.
 *
 * Until this existed, every PostHog person was a cookie and nothing else. The
 * site could show that eight people asked Litos to apply to a job and that one
 * submission ever completed, but not whether those were the same eight people
 * who had accounts, because there was no shared key between PostHog and the
 * database. Measured 2026-08-05: 36 identified visitors, 38 real accounts, and
 * no way to say how those two sets overlap.
 *
 * The id is the backend's user UUID, which is the same key the database uses,
 * so a person can now be followed from their first pageview through to their
 * first application.
 *
 * DELIBERATELY NO PROPERTIES. posthog.identify accepts a property bag and the
 * obvious thing to put in it is the email address, which is exactly what the
 * privacy posture here forbids: sanitizePostHogEvent already strips referrers,
 * UTM tags and full URLs, and an email sent at identify time would walk around
 * all of it. The UUID is opaque, already in PostHog's own person index, and
 * enough to do the join. */
export function identifyUser(userId: string | null | undefined) {
  if (typeof window === "undefined") return;
  if (!userId) return;
  try {
    posthog.identify(userId);
  } catch {
    /* analytics must never break authentication */
  }
}

export function resetAnalytics() {
  try {
    posthog.reset();
  } catch {
    /* analytics must never break authentication */
  }
}
