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
  { key: "resume", label: "Your resume", weight: 2 },
  { key: "impact", label: "Your impact", weight: 2 },
  { key: "focus", label: "Your roles", weight: 1 },
  /* Weight 1, same as focus: four radio buttons and a short explanation. It is the cheapest screen
     in the flow in time and the most consequential in effect, and the rail is a map of TIME. */
  { key: "sponsorship", label: "Work visa", weight: 1 },
  { key: "base", label: "Your one page", weight: 2 },
  /* Reinstated as a real screen by #279 ("Make referral onboarding gap reachable") and NOT added
     here at the time, which is the whole reason this entry exists.
     `StepRail` used to resolve an unknown key through `Math.max(0, findIndex(...))`, so a rendered
     screen whose key was missing from this list did not fail loudly: it silently reported itself as
     index 0. The gaps screen was therefore telling every student it was "Step 1 of 6, Your resume"
     while sitting second from last. A wayfinding device that points backwards is worse than none.
     That clamp is gone now, so the symptom changed: an unrecognised key leaves `i` at -1 and the
     rail draws itself with no position at all. Quieter, still wrong, and still a reason to keep
     every rendered screen in this list.

     Weight 1, alongside focus and sponsorship: it is a handful of short inputs, and the rail is a
     map of TIME.

     `conditional` is the rest of that fix. This is the one screen in the list the flow does not
     always contain, so it is the one entry that must not be counted by default: see `flowSteps`
     below for when it is. Left in STEPS unconditionally it made the denominator a permanent
     overcount, which was accepted in #285 as the cheaper of two errors and is what this flag
     removes without giving back the misreporting screen that #285 was fixing. */
  { key: "gaps", label: "A few details", weight: 1, conditional: true },
  { key: "done", label: "Done", weight: 0 },
];

/** The steps this particular student's flow contains, which is the rail's denominator.
 *
 * A CONDITIONAL step counts when the flow is ON it, and not otherwise. Two reasons it is that and
 * not "when the server reports outstanding gaps":
 *
 *  1. Outstanding gaps do not put the gaps screen in anyone's flow. The step is DERIVED server-side
 *     (routes/onboarding.ts) and backend #116 removed 'gaps' from the union `onboardingStepFrom`
 *     returns, so GET /onboarding/state cannot answer with it: 'base' is followed by 'done' for
 *     every student, whether or not their profile has holes in it. Counting the screen because the
 *     gaps exist would keep telling a student with outstanding details that setup is seven screens
 *     long and then show them six, which is the miscount this is here to remove.
 *  2. `gaps` is what is STILL outstanding, so it empties as the screen is answered. A denominator
 *     read from its length would count the screen while a student stood on it and stop counting it
 *     the moment they finished, so the total would shrink under them at the last screen.
 *
 * The step being rendered is always in the result, which is the invariant #285 needed: `StepRail`
 * locates itself with `findIndex`, and a rendered screen missing from the list cannot say where it
 * is.
 *
 * `state.step` is consulted ALONGSIDE `current`, and today that disjunct catches nothing: the only
 * screen that renders with `current: "gaps"` is GapsStep, which app/start/page.tsx reaches only
 * when `state.step` is already "gaps", so the two agree wherever it matters. It is kept as the
 * cheaper half of the invariant, not because a live path needs it: the two DO diverge elsewhere in
 * this flow (a legacy step name from an older backend has `state.step: "targeting"` rendered as
 * `current: "done"`), so a future conditional screen reached the same way would be counted from
 * either side. Both branches are pinned in tests/start-rail-denominator.test.mjs so the dead one
 * cannot rot unnoticed. */
export function flowSteps(current: OnboardingStep | undefined, state: OnboardingState | null) {
  return STEPS.filter((s) => !s.conditional || s.key === current || s.key === state?.step);
}
