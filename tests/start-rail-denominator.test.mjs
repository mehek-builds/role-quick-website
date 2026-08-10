/**
 * The step rail's denominator, pinned in the suite that runs on every push.
 *
 * WHY THIS EXISTS ALONGSIDE THE TWO BROWSER SPECS
 * ===============================================
 * The arithmetic is covered end to end by tests/e2e/start-onboarding-checklist.spec.mjs and
 * tests/e2e/onboarding-empty-states.spec.mjs, and those prove the thing that actually matters: a
 * student walking the real flow reads a count that matches the screens they are shown. But both
 * need `npm run build` and a Chromium binary, so they run in the e2e job. `npm test` is what runs
 * on every push, and until this file it could not observe the denominator at all: nothing in it
 * referenced STEPS, StepRail or the rail's count.
 *
 * `flowSteps` is a pure function over a seven-element array, so the cheapest possible guard is a
 * direct call. This file is that guard, and it is deliberately about the RULE rather than about
 * any one screen: the browser specs assert what a student sees, this asserts why.
 *
 * It also covers the two branches the e2e specs cannot reach independently, both of which a
 * reviewer flagged as deletable-with-all-tests-green:
 *   - the `s.key === state?.step` half of the conditional test, which no live path exercises
 *     because the only screen rendering `current: "gaps"` is reached only when state.step is
 *     already "gaps";
 *   - the shape of the result when `current` is undefined, which is the loading rail.
 */

import test from "node:test";
import assert from "node:assert/strict";

/* The module, not the feature's index: node resolves this path literally and needs the extension,
   while `features/onboarding/index.ts` re-exports extensionless for the bundler. Same shape as
   every other test here (`../features/jobs/domain/pay.ts`), and tests are exempt from the
   entry-point rule in tests/architecture-boundaries.test.mjs for exactly this reason. */
import { STEPS, flowSteps } from "../features/onboarding/domain/rail.ts";

/** Minimal OnboardingState. Only `step` and `gaps` are read by anything under test. */
const stateAt = (step, gaps = []) => ({ step, gaps });

const keys = (steps) => steps.map((s) => s.key);

/* The six screens the backend can actually derive. routes/onboarding.ts `onboardingStepFrom`
   returns 'focus' | 'sponsorship' | 'resume' | 'impact' | 'base' | 'done' and nothing else, so
   this is the whole flow for every student. */
const DERIVABLE = ["resume", "impact", "focus", "sponsorship", "base", "done"];

test("STEPS marks exactly one step conditional, and it is the one the backend cannot derive", () => {
  const conditional = STEPS.filter((s) => s.conditional).map((s) => s.key);
  assert.deepEqual(conditional, ["gaps"]);
  assert.ok(
    !DERIVABLE.includes("gaps"),
    "a step the backend can derive must not be conditional: every student would see it",
  );
});

test("every derivable step reads a denominator of six, gaps outstanding or not", () => {
  for (const step of DERIVABLE) {
    for (const gaps of [[], ["gpa", "gpa_scale", "major"]]) {
      const steps = flowSteps(step, stateAt(step, gaps));
      assert.equal(
        steps.length,
        6,
        `${step} with ${gaps.length} outstanding gaps claims ${steps.length} steps`,
      );
      assert.ok(!keys(steps).includes("gaps"), `${step} counted a screen the flow never routes to`);
    }
  }
});

/* The regression the whole change exists for. A denominator keyed off `state.gaps.length` reads 7
   here and then shows the student six screens, which is the miscount, not the fix. */
test("outstanding gaps do not add a step", () => {
  const withGaps = flowSteps("base", stateAt("base", ["gpa", "major"]));
  const without = flowSteps("base", stateAt("base", []));
  assert.equal(withGaps.length, without.length);
  assert.deepEqual(keys(withGaps), keys(without));
});

/* ...and the other direction, which is what stops a future fix from keying off `gaps` inverted:
   the count must not shrink under a student as they answer things. */
test("the denominator does not move as gaps empty", () => {
  const before = flowSteps("base", stateAt("base", ["gpa", "gpa_scale", "major"])).length;
  const during = flowSteps("base", stateAt("base", ["gpa"])).length;
  const after = flowSteps("done", stateAt("done", [])).length;
  assert.equal(before, during);
  assert.equal(during, after);
});

test("the rendered step is always in the result, which is what lets the rail locate itself", () => {
  for (const step of [...DERIVABLE, "gaps"]) {
    const steps = flowSteps(step, stateAt(step, ["gpa"]));
    assert.ok(
      keys(steps).includes(step),
      `${step} renders but is absent from its own flow, so the rail cannot say where it is`,
    );
    assert.ok(steps.findIndex((s) => s.key === step) >= 0);
  }
});

test("a flow standing on the conditional screen counts it, and counts it in place", () => {
  const steps = flowSteps("gaps", stateAt("gaps", ["gpa", "gpa_scale", "major"]));
  assert.equal(steps.length, 7);
  // Second from last: after the one-page review, before Done. This is the position #285 fixed.
  assert.equal(steps.findIndex((s) => s.key === "gaps"), 5);
});

/* The disjunct a reviewer correctly identified as unreachable today. Kept because `current` and
   `state.step` genuinely diverge elsewhere in this flow (a legacy step name from an older backend
   has state.step "targeting" rendered as current "done"), so either side alone would be a gap for
   a future conditional screen reached that way. Pinned so the dead branch cannot rot unnoticed. */
test("the conditional step counts from either side when current and state.step diverge", () => {
  assert.equal(flowSteps("done", stateAt("gaps", ["gpa"])).length, 7, "state.step alone did not count it");
  assert.equal(flowSteps("gaps", stateAt("done", [])).length, 7, "current alone did not count it");
});

/* The loading rail. `current` is undefined because the step is genuinely unknown, and the result is
   the shape of the flow with no conditional screen assumed into it. */
test("with no current step the result is the unconditional flow", () => {
  const steps = flowSteps(undefined, null);
  assert.equal(steps.length, 6);
  assert.deepEqual(keys(steps), ["resume", "impact", "focus", "sponsorship", "base", "done"]);
  assert.equal(
    steps.findIndex((s) => s.key === undefined),
    -1,
    "an undefined current must not resolve to a position",
  );
});

test("a null state never throws and never invents the conditional screen", () => {
  for (const step of [...DERIVABLE, "gaps"]) {
    const steps = flowSteps(step, null);
    assert.ok(keys(steps).includes(step), `${step} is missing from its own flow when state is null`);
  }
  assert.equal(flowSteps("base", null).length, 6);
  // Only because `current` says so; there is no state to corroborate it.
  assert.equal(flowSteps("gaps", null).length, 7);
});
