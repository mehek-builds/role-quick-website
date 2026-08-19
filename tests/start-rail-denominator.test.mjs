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
 * WHAT CHANGED, AND WHY MOST OF THIS FILE STAYED
 * ==============================================
 * The gaps screen is reachable again. Backend #116 had removed 'gaps' from the step union
 * `onboardingStepFrom` returns, so for a while no student could be routed to it and this file's
 * conditional test was about a screen only QA ever saw. It is now derived once, for a student whose
 * resume printed no GPA, GPA scale or major, and it sits immediately before Done.
 *
 * That makes the denominator matter MORE, not less, and it moves where the answer comes from: the
 * flow's shape is now the server's `includes_gaps_step`, not anything this module can compute. The
 * two failure modes below are unchanged and are still the whole point - a total that grows under a
 * student, and a total that shrinks under them.
 */

import test from "node:test";
import assert from "node:assert/strict";

/* The module, not the feature's index: node resolves this path literally and needs the extension,
   while `features/onboarding/index.ts` re-exports extensionless for the bundler. Same shape as
   every other test here (`../features/jobs/domain/pay.ts`), and tests are exempt from the
   entry-point rule in tests/architecture-boundaries.test.mjs for exactly this reason. */
import { STEPS, flowSteps } from "../features/onboarding/domain/rail.ts";

/** Minimal OnboardingState. Only these three fields are read by anything under test. */
const stateAt = (step, gaps = [], includes_gaps_step = false) => ({ step, gaps, includes_gaps_step });

const keys = (steps) => steps.map((s) => s.key);

/* The six steps every student walks. The backend derives 'gaps' as a SEVENTH for some of them, but
   never in place of one of these, so this is the spine of the flow and the base denominator. */
const ALWAYS = ["resume", "impact", "focus", "sponsorship", "base", "done"];

test("STEPS marks exactly one step conditional, and it is the one not every flow contains", () => {
  const conditional = STEPS.filter((s) => s.conditional).map((s) => s.key);
  assert.deepEqual(
    conditional,
    ["gaps"],
    "a second conditional step needs its own server signal in features/onboarding/domain/rail.ts "
      + "`flowSteps`: it cannot inherit `includes_gaps_step`, which answers for the gaps screen and "
      + "no other. Inheriting it would leave the new screen counted only while standing on it, which "
      + "is the count-grows-underneath-them defect this rule exists to remove.",
  );
  assert.ok(
    !ALWAYS.includes("gaps"),
    "a step every flow contains must not be conditional: it would be missing from its own count",
  );
});

test("a flow the server says has no gaps screen reads a denominator of six throughout", () => {
  for (const step of ALWAYS) {
    for (const gaps of [[], ["gpa", "gpa_scale", "major"]]) {
      const steps = flowSteps(step, stateAt(step, gaps, false));
      assert.equal(
        steps.length,
        6,
        `${step} with ${gaps.length} outstanding gaps claims ${steps.length} steps`,
      );
      assert.ok(!keys(steps).includes("gaps"), `${step} counted a screen its flow never routes to`);
    }
  }
});

test("a flow the server says has one reads seven throughout, on every step", () => {
  for (const step of ALWAYS) {
    const steps = flowSteps(step, stateAt(step, [], true));
    assert.equal(steps.length, 7, `${step} claims ${steps.length} steps`);
    assert.ok(keys(steps).includes("gaps"));
  }
});

/* THE FIRST FAILURE MODE, and the one #285 was opened for: the printed total growing underneath a
   student. It happens whenever the screen is counted only once they are standing on it, because the
   step before it then reads one lower. `includes_gaps_step` is true from the start of the flow. */
test("the count does not grow as the student walks into the gaps screen", () => {
  const onBase = flowSteps("base", stateAt("base", ["gpa", "major"], true));
  const onGaps = flowSteps("gaps", stateAt("gaps", ["gpa", "major"], true));
  assert.equal(onBase.length, onGaps.length);
  assert.deepEqual(keys(onBase), keys(onGaps));
});

/* THE SECOND, which is what stops a future fix from keying the denominator off `state.gaps`: the
   list is what is STILL outstanding, so answering the screen empties it. A count read from it would
   drop from seven to six on the last screen of setup. The server keeps saying seven because the
   screen was SHOWN, which does not stop being true. */
test("the count does not shrink as the gaps are answered", () => {
  const before = flowSteps("gaps", stateAt("gaps", ["gpa", "gpa_scale", "major"], true)).length;
  const after = flowSteps("done", stateAt("done", [], true)).length;
  assert.equal(before, 7);
  assert.equal(after, 7);
});

/* ...and the same in the other direction: a student who SKIPS still has every field outstanding,
   and must not be told the flow grew a screen they already declined. */
test("outstanding gaps alone never add a step", () => {
  const skipped = flowSteps("done", stateAt("done", ["gpa", "gpa_scale", "major"], true));
  const answered = flowSteps("done", stateAt("done", [], true));
  assert.equal(skipped.length, answered.length);
  assert.deepEqual(keys(skipped), keys(answered));
});

test("the rendered step is always in the result, which is what lets the rail locate itself", () => {
  for (const step of [...ALWAYS, "gaps"]) {
    const steps = flowSteps(step, stateAt(step, ["gpa"], step === "gaps"));
    assert.ok(
      keys(steps).includes(step),
      `${step} renders but is absent from its own flow, so the rail cannot say where it is`,
    );
    assert.ok(steps.findIndex((s) => s.key === step) >= 0);
  }
});

test("the gaps screen is counted in place: after the one-page review, before Done", () => {
  const steps = flowSteps("gaps", stateAt("gaps", ["gpa", "gpa_scale", "major"], true));
  assert.equal(steps.length, 7);
  assert.equal(steps.findIndex((s) => s.key === "gaps"), 5);
  assert.equal(steps.findIndex((s) => s.key === "done"), 6);
});

/* The two paths that reach the screen WITHOUT the server deriving it, and therefore without
   `includes_gaps_step`: the localhost QA bypass (?qa=1&step=gaps) and a legacy step name arriving
   mid-rolling-deploy. Neither may leave the rendered screen unable to say where it is, which is the
   invariant #285 restored - so `current` and `state.step` are both still consulted. They genuinely
   diverge in this flow: an older backend's `state.step: "targeting"` renders as `current: "done"`. */
test("a screen reached without the server's answer is still counted, from either side", () => {
  assert.equal(flowSteps("gaps", stateAt("done", [], false)).length, 7, "current alone did not count it");
  assert.equal(flowSteps("done", stateAt("gaps", [], false)).length, 7, "state.step alone did not count it");
});

/* An older backend omits the field entirely. Absent is not "true": that backend does not route to
   the screen, so the flow really is six steps and saying seven would be the #285 overcount again. */
test("a backend that never sends the field reads as a six-step flow", () => {
  const legacy = { step: "base", gaps: ["gpa", "major"] };
  assert.equal(flowSteps("base", legacy).length, 6);
  assert.ok(!keys(flowSteps("base", legacy)).includes("gaps"));
});

/* The loading rail. `current` is undefined because the step is genuinely unknown, and the result is
   the shape of the flow with no conditional screen assumed into it. */
test("with no current step the result is the unconditional flow", () => {
  const steps = flowSteps(undefined, null);
  assert.equal(steps.length, 6);
  assert.deepEqual(keys(steps), ["focus", "resume", "impact", "sponsorship", "base", "done"]);
  assert.equal(
    steps.findIndex((s) => s.key === undefined),
    -1,
    "an undefined current must not resolve to a position",
  );
});

test("a null state never throws and never invents the conditional screen", () => {
  for (const step of [...ALWAYS, "gaps"]) {
    const steps = flowSteps(step, null);
    assert.ok(keys(steps).includes(step), `${step} is missing from its own flow when state is null`);
  }
  assert.equal(flowSteps("base", null).length, 6);
  // Only because `current` says so; there is no state to corroborate it.
  assert.equal(flowSteps("gaps", null).length, 7);
});
