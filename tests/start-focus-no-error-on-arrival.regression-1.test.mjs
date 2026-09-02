import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Step 1 of 10 greeted every new student with a red error.
 *
 * Reproduced in a browser on the live flow: the roles screen rendered "Add at least one place." in
 * `text-warn` gated on nothing but the data being absent, and disabled Continue in the same breath.
 * Locations are the one field on that screen that CANNOT be seeded - the resume guess fills fields,
 * stage and titles, but nothing fills a place - so this was the state of every account on arrival.
 * The first frame of the product read as a form the student had already failed.
 *
 * The fix moves the answer to where SponsorshipStep already had it: a pure `problem` function
 * consulted when Continue is pressed. The sentence is unchanged; what changed is that it is now a
 * reply to an action instead of an accusation on arrival.
 *
 * Source-text assertions in the style of tests/dashboard-home-title.test.mjs.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const code = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const STEPS = code(read("components/start/steps.tsx"));

test("no warn-coloured paragraph renders from absent data alone", () => {
  /* The two `text-warn` paragraphs are the bug. Either one coming back - on categories or on
     places - puts the red error back on the first screen of the product. */
  assert.doesNotMatch(STEPS, /role="status" className="mb-4 text-xs leading-5 text-warn"/);
});

test("Continue is no longer dead on arrival", () => {
  /* It keeps `busy` and the documented `!ready` invariant (deselecting every field hides the title
     list, and Continue must never commit titles the screen has stopped drawing) and drops the four
     data-completeness terms, which are what made the button unpressable before the student had
     done anything. */
  assert.match(STEPS, /disabled=\{busy \|\| !ready\}/);
  assert.doesNotMatch(STEPS, /disabled=\{busy \|\| !ready \|\| selectedTitles\.length === 0/);
});

test("pressing Continue is what answers, and it answers before it writes", () => {
  /* The guard has to sit ahead of putTargeting or an incomplete screen still saves. */
  const save = /async function save\(\) \{[\s\S]*?\n  \}/.exec(STEPS)?.[0] ?? "";
  assert.match(save, /const problem = focusProblem\(/);
  assert.match(save, /if \(problem\) \{\s*setError\(problem\);\s*return;\s*\}/);
  assert.ok(
    save.indexOf("focusProblem") < save.indexOf("putTargeting"),
    "focusProblem must be consulted before the screen writes",
  );
});

test("the rule is a pure function in lib, so it is testable without a DOM", () => {
  /* Same placement as countryEligibilityProblem in lib/work-eligibility.ts, and the reason
     lib/onboarding-role-inference.test.mts can pin every branch of it under `npm test`. */
  assert.match(code(read("lib/onboarding-role-inference.ts")), /export function focusProblem\(/);
});
