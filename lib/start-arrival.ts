import type { OnboardingState } from "./api";

/* What /start does with each onboarding state it reads, and the one piece of bookkeeping that
 * decision needs.
 *
 * A pure module with no imports but a type, so the rule can be tested for what it DOES rather than
 * pinned as source text in the component. That distinction is the reason this file exists: the
 * first version of this fix lived entirely inside app/start/page.tsx, its tests could only assert
 * that certain lines appeared there, and they passed 4/4 against a version that still shipped the
 * bug. See startArrival's second case.
 */

/** The account has finished onboarding, as both the mount read and every later refresh judge it.
 *
 * One definition, consulted twice, rather than the same comparison written out in two places in
 * opposite polarity. `requires_onboarding` is optional on the wire - a backend predating the field
 * sends nothing - and a strict `=== false` is what keeps a missing field reading as "not finished"
 * instead of as "finished", which is the safe direction: it renders the flow rather than ejecting
 * someone mid-onboarding. */
export function isFinishedAccount(state: Pick<OnboardingState, "step"> & { requires_onboarding?: boolean }): boolean {
  return state.step === "done" && state.requires_onboarding === false;
}

export type StartArrival = {
  /** Leave /start for the dashboard instead of rendering this state. */
  leave: boolean;
  /** What `advancedHere` should be after this state is handled. */
  advanced: boolean;
};

/**
 * Whether a freshly read state should be rendered or should send the student to the dashboard.
 *
 * /start refuses to show a finished account the receipt screen and sends it to the dashboard. That
 * is right on a fresh load and equally right on the tenth refresh, because `refresh()` is called
 * from every screen's Continue, the install poll and both halves of a revisit - and any of those
 * answering `done` used to re-render the default arm, DoneStep, in place. That is what let a
 * student standing on "Your match" at STEP 3 OF 10 press "Done, take me back" and land on STEP
 * 3 OF 3 "Setup complete.", holding a receipt for seven screens they had never seen.
 *
 * The one account that must still see the receipt is the student who WALKED to it, so `advanced`
 * carries whether they got here by finishing a step rather than by being moved.
 *
 * WHY `advanced` IS CLEARED BY EVERY NON-TERMINAL STATE, which is the half the first version of
 * this fix got wrong. A flag that is only ever set turns true on the student's first Continue and
 * stays true for the rest of the sitting, so the redirect is suppressed from then on and the bug
 * returns for anyone who advanced even one screen before revisiting - which is very nearly
 * everyone. Clearing here bounds the flag to the single advance-to-done transition it exists to
 * describe: a forward step sets it, the very next state either IS `done` (and spends it on the
 * receipt) or is not (and clears it).
 */
export function startArrival(
  state: Pick<OnboardingState, "step"> & { requires_onboarding?: boolean },
  advanced: boolean,
): StartArrival {
  if (!isFinishedAccount(state)) return { leave: false, advanced: false };
  if (advanced) return { leave: false, advanced: true };
  return { leave: true, advanced: false };
}
