/**
 * The step rail's denominator, pinned in the suite that runs on every push.
 *
 * WHY THIS EXISTS ALONGSIDE THE BROWSER SPECS
 * ===========================================
 * The arithmetic is covered end to end by the e2e specs, and those prove what actually matters: a
 * student walking the real flow reads a count that matches the screens they are shown. But those
 * need a build and a Chromium binary. `npm test` runs on every push, and this file is the cheap
 * guard: `flowSteps` is a pure function, so a direct call is the whole test.
 *
 * WHAT THIS FILE IS ABOUT NOW
 * ===========================
 * It used to be about the gaps screen. That screen is CUT: measured across 318 real packets, only
 * 21.7% of applications ask for a GPA at all, and the questions screen collects it from the
 * employer's own banded list when they do.
 *
 * The rule it protected did not go anywhere, it changed subject. The one conditional screen is now
 * the work visa, skipped for the ~40% of students whose first employer asked both halves itself and
 * shown to the rest, because sponsorship_required_at_onboarding is what turns the sponsor-only
 * board filter on and nothing else can answer it.
 *
 * The two failure modes are unchanged and are still the entire point: a total that GROWS under a
 * student as they walk into a conditional screen, and one that SHRINKS under them as they answer it.
 */

import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

import { STEPS, flowSteps } from "../features/onboarding/domain/rail.ts";

/** Minimal OnboardingState. Only the fields the rail reads. */
const stateAt = (step, extra = {}) => ({
  step,
  includes_application_steps: true,
  includes_sponsorship_step: false,
  ...extra,
});

const keys = (steps) => steps.map((s) => s.key);

/* The steps a student in the application flow walks. The work visa is the conditional one WITHIN
   that flow and never replaces any of these, so this is the spine and the base denominator. */
const ALWAYS = ["focus", "resume", "match", "questions", "review", "trial", "notifications", "plan", "done"];

/* The steps that are unconditional in STEPS itself, which is a different question. The application
   sequence is conditional on `includes_application_steps` because an account that has already
   finished onboarding never walks it; these four are in every flow there is. */
const UNCONDITIONAL = ["focus", "resume", "done"];

test("every conditional step has its own server signal, and no unconditional step is marked one", async () => {
  /* THE RULE, unchanged: a conditional step may never inherit another's signal. `includes_gaps_step`
     answers for the gaps screen and no other, and a screen counted by a flag that does not describe
     it is counted only while the student stands on it, which is the count-grows-underneath-them
     defect this rule exists to remove.
     What changed is the number of them. The application sequence added seven, and they read
     `includes_application_steps`, which is the server's answer for exactly those seven. So this now
     checks the PROPERTY rather than a fixed list: every conditional key must be reachable from a
     signal `flowSteps` actually consults.

     The list is still pinned as a VALUE because adding a screen is a deploy-order decision, not a
     detail: the website has to ship a case for a step before the backend serves it, or the student
     lands on a fallback screen mid-flow. A new key should arrive here as a deliberate edit. */
  const conditional = STEPS.filter((s) => s.conditional).map((s) => s.key);
  assert.deepEqual(
    conditional,
    ["match", "questions", "sponsorship", "review", "trial", "notifications", "plan"],
  );

  const source = await readFile(new URL("../features/onboarding/domain/rail.ts", import.meta.url), "utf8");
  for (const key of conditional) {
    const gated = key === "sponsorship"
      ? /includes_sponsorship_step/.test(source)
      : /includes_application_steps/.test(source);
    assert.ok(gated, `${key} is conditional but no server signal in flowSteps gates it`);
  }

  for (const key of UNCONDITIONAL) {
    assert.ok(
      !conditional.includes(key),
      `${key} is in every flow there is, so marking it conditional would leave it missing from its own count`,
    );
  }
});

test("a flow without the work-visa screen reads nine throughout", () => {
  for (const step of ALWAYS) {
    const steps = flowSteps(step, stateAt(step));
    assert.equal(steps.length, 9, `${step} claims ${steps.length} steps in a flow without the visa screen`);
    assert.ok(!keys(steps).includes("sponsorship"));
  }
});

test("a flow with it reads ten throughout, on every step", () => {
  for (const step of [...ALWAYS, "sponsorship"]) {
    const steps = flowSteps(step, stateAt(step, { includes_sponsorship_step: true }));
    assert.equal(steps.length, 10, `${step} claims ${steps.length} steps in a flow with the visa screen`);
  }
});

test("the count does not GROW as the student walks into the visa screen", () => {
  /* The first of the two failure modes. A student reading eleven on the questions screen must not
     read twelve on the next one because the rail only counts the screen while they stand on it. */
  const before = flowSteps("questions", stateAt("questions", { includes_sponsorship_step: true }));
  const during = flowSteps("sponsorship", stateAt("sponsorship", { includes_sponsorship_step: true }));
  assert.equal(before.length, during.length);
});

test("the count does not SHRINK once the declaration exists", () => {
  /* The second. The server stops setting the flag the moment the declaration lands, and a student
     mid-flow must not watch their total drop from twelve to eleven underneath them. That is why the
     flag is read for the flow, and why the step being RENDERED is always counted. */
  const during = flowSteps("sponsorship", stateAt("sponsorship", { includes_sponsorship_step: false }));
  assert.ok(keys(during).includes("sponsorship"), "the screen being rendered must always be counted");
  assert.equal(during.length, 10);
});

test("the rendered step is always in the result, which is what lets the rail locate itself", () => {
  for (const step of [...ALWAYS, "sponsorship"]) {
    const steps = flowSteps(step, stateAt(step));
    assert.ok(keys(steps).includes(step), `${step} is rendered but missing from its own flow`);
  }
});

test("the visa screen is counted in place: after the questions, before the review", () => {
  const steps = keys(flowSteps("sponsorship", stateAt("sponsorship", { includes_sponsorship_step: true })));
  assert.equal(steps.indexOf("sponsorship"), steps.indexOf("questions") + 1);
  assert.equal(steps.indexOf("review"), steps.indexOf("sponsorship") + 1);
});

test("a backend that never sends the flag reads as a flow without the screen", () => {
  const steps = flowSteps("review", { step: "review", includes_application_steps: true });
  assert.equal(steps.length, 9);
  assert.ok(!keys(steps).includes("sponsorship"));
});

test("with no current step the result is the unconditional flow", () => {
  const steps = flowSteps(undefined, { includes_application_steps: true });
  assert.deepEqual(keys(steps), ALWAYS);
  assert.equal(steps.findIndex((s) => s.key === undefined), -1, "an undefined current must not resolve to a position");
});

test("a null state never throws and never invents a conditional screen", () => {
  const steps = flowSteps("focus", null);
  assert.ok(!keys(steps).includes("sponsorship"));
  assert.ok(keys(steps).includes("focus"));
});
