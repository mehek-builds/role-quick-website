/* The /start step rail's data and its one rule, kept out of the component that draws it.
 *
 * This is a plain .ts module rather than part of components/start/ui.tsx because `npm test` runs
 * node with --experimental-strip-types, which can load .ts but not .tsx. Living here is what lets
 * the denominator be pinned by tests/start-rail-denominator.test.mjs in the suite that runs on
 * every push, instead of only by the two browser specs in the e2e job. components/start/ui.tsx
 * re-exports both names, so every existing import site is unchanged.
 */

import type { OnboardingState, OnboardingStep } from "@/lib/api";

/* Step names a student can read. "Gaps", "Target" and "Focus" were the backend's words for these
   screens, and the resume step was the only place in the product that accented the word. It is
   "resume" everywhere we write it, in every surface, with no exceptions. */
/* `weight` is roughly how much of the student's time the step costs. Resume upload and one-page
   review get more space than the short choice screens, so the rail reflects effort instead of
   pretending every click is equal. */
export const STEPS: { key: OnboardingStep; label: string; weight: number; conditional?: boolean }[] = [
  /* ROLES LEADS. The backend derives 'focus' before 'resume' as of flow version 3, and this list
     is the rail's render order, so the two have to move together: a rail still opening on "Your
     resume" would number every screen one place off from the screen actually drawn.
     Weight 1 because the screen is now three taps - field, stage, titles - and the rail is a map
     of TIME, not of importance. */
  { key: "focus", label: "Your roles", weight: 1 },
  { key: "resume", label: "Your resume", weight: 2 },
  /* Weight 1, same as focus: four radio buttons and a short explanation. It is the cheapest screen
     in the flow in time and the most consequential in effect, and the rail is a map of TIME. */
  /* THE APPLICATION SEQUENCE. All seven are conditional on the same server-owned signal
     (`includes_application_steps`), for the same reason the gaps screen is conditional on its own:
     the flow does not always contain them, and counting them for everybody would make the rail's
     denominator a permanent overcount for the accounts that never walk them.
     Weights are a map of TIME, so the build gets 2 (it waits on a real generation) and the rest
     get 1: a match is one tap, a few questions are a few taps, and the trial screen only asks the
     student to accept something they already hold. */
  /* One screen, two phases: the posting, then it building. `build` was a separate step and is
     folded in here, because two step numbers for one continuous action was the rail counting a
     transition rather than a decision. Weight 2 now: it waits on a real generation. */
  { key: "match", label: "Your match", weight: 2, conditional: true },
  { key: "questions", label: "What the job asks", weight: 1, conditional: true },
  /* The work-visa screen, moved here from setup and now CONDITIONAL.
     39.9% of first applications ask both halves themselves (measured, 318 packets) and the answer
     becomes the account's declaration, so those students never see this. The other ~60% do, because
     sponsorship_required_at_onboarding is what turns the sponsor-only board filter on and nothing
     else can answer it. Its own signal, never inherited: includes_sponsorship_step. */
  { key: "sponsorship", label: "Work visa", weight: 1, conditional: true },
  { key: "review", label: "Review and send", weight: 1, conditional: true },
  { key: "trial", label: "Your trial", weight: 1, conditional: true },
  /* NO "notifications" ENTRY ANY MORE (10 -> 9). The two switches and their sentence moved onto
     the trial screen, whose own rationale already placed them there: permission is cheapest to
     give right after being handed the seven days. The step name still exists in the ledger and in
     OnboardingStep - an account that acked trial before the fold still gets a screen for it - but
     that screen stands on "trial", so the rail never needs the key. */
  { key: "plan", label: "Your plan", weight: 1, conditional: true },
  { key: "done", label: "Done", weight: 0 },
];

/** The seven steps gated by `includes_application_steps`. */
const APPLICATION_KEYS = new Set<OnboardingStep>(["match", "questions", "review", "trial", "plan"]);

/** The steps this particular student's flow contains, which is the rail's denominator.
 *
 * A CONDITIONAL step counts when the SERVER says the flow contains it, or when the flow is standing
 * on it. `includes_gaps_step` is the server's answer and is the load-bearing half.
 *
 * WHY THE SERVER ANSWERS THIS AND THIS MODULE DOES NOT. The obvious client-side rule - count the
 * screen while `state.gaps` is non-empty - is wrong in both directions, and the wrongness is the
 * whole reason #285 existed:
 *
 *  1. `gaps` is what is STILL OUTSTANDING, so it empties as the screen is answered. A denominator
 *     read from its length counts the screen while a student stands on it and stops counting it the
 *     moment they finish, so the printed total drops from seven to six on the last screen of setup.
 *  2. It lists fields the screen does not gate on. The server routes to this screen for a missing
 *     gpa, gpa_scale or major only (routes/onboarding.ts SETUP_GAP_FIELDS); desired_salary is
 *     optional and languages and referral_source_default are collected one screen earlier, on base.
 *     Counting a screen because `desired_salary` is blank would add a seventh step to nearly every
 *     flow and then show six.
 *  3. Whether the screen was already SHOWN is not in the gap list at all, and it decides the
 *     answer: a student who skipped it still has every field outstanding and must not be counted
 *     as about to walk it again.
 *
 * So `includes_gaps_step` is read, never re-derived. An older backend omits it, which is correct
 * for an older backend: it does not route to that screen, so the flow is six steps.
 *
 * `current` and `state.step` are consulted alongside it so that the step being RENDERED is always
 * in the result. That is the invariant #285 needed - `StepRail` locates itself with `findIndex`,
 * and a rendered screen missing from the list cannot say where it is - and it is what keeps the
 * rail honest on the paths that reach a screen without the server deriving it: the localhost QA
 * bypass (?qa=1&step=gaps), and a legacy step name mid-rolling-deploy. The two DO diverge in this
 * flow (an older backend's `state.step: "targeting"` renders as `current: "done"`), so both sides
 * are checked. All three branches are pinned in tests/start-rail-denominator.test.mjs. */
export function flowSteps(current: OnboardingStep | undefined, state: OnboardingState | null) {
  // Keyed to "gaps" rather than to `conditional` in general: `includes_gaps_step` answers for that
  // screen and no other, so a second conditional step added later must bring its own signal instead
  // of silently inheriting this one.
  /* Each conditional step reads its OWN server signal. Keyed rather than generic on purpose: a
     later conditional screen must bring its own flag instead of silently inheriting one of these
     two, which is the trap #285 recorded when a screen was counted for everybody. */
  const inFlow = (s: (typeof STEPS)[number]) =>
    (s.key === "gaps" && state?.includes_gaps_step === true)
    || (APPLICATION_KEYS.has(s.key) && state?.includes_application_steps === true)
    /* Its OWN flag, never inherited from includes_application_steps: this screen is skipped for the
       ~40% whose first employer asked, and counting it for them would print a step nobody walks. */
    || (s.key === "sponsorship" && state?.includes_sponsorship_step === true);
  return STEPS.filter((s) => !s.conditional || inFlow(s) || s.key === current || s.key === state?.step);
}
