import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STEPS } from "../features/onboarding/domain/rail.ts";

/* The staying-in-touch screen folded into the trial screen (10 -> 9).
 *
 * Its own doc comment placed it there from the start - "asked between the gift and the price" -
 * and two screens for one moment was the rail counting a pause. What this file pins is the three
 * pieces that have to move together, because any one of them alone quietly restores a tenth step
 * or strands an account:
 *
 *  1. the trial screen renders the switches;
 *  2. finishing the trial acknowledges BOTH ledger entries, trial before notifications, and only
 *     then refreshes - otherwise the server's next derivation still serves the folded step;
 *  3. the legacy screen (for accounts that acked trial before the fold) stands on the "trial"
 *     rail position, because "notifications" left STEPS and a rail position STEPS does not
 *     contain shimmers for the life of the screen.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

test("the trial screen renders the switches", () => {
  const trial = code(read("components/start/TrialStep.tsx"));
  assert.match(trial, /<NotificationChoices \/>/);
});

test("finishing the trial answers both ledger entries, in order, then refreshes", () => {
  const page = code(read("app/start/page.tsx"));
  assert.match(
    page,
    /await ack\("trial"\); await ack\("notifications"\); await refresh\(\);/,
    "the double ack is what stops the server deriving the folded screen; order and the trailing refresh both matter",
  );
});

test("the legacy screen stands on the trial rail position", () => {
  const legacy = code(read("components/start/NotificationsStep.tsx"));
  assert.match(legacy, /<StartShell step="trial"/);
  assert.doesNotMatch(legacy, /step="notifications"/);
});

test("the rail counts nine, and notifications is not one of them", () => {
  assert.equal(STEPS.some((s) => s.key === "notifications"), false);
  /* focus, resume, match, questions, sponsorship, review, trial, plan, done. */
  assert.equal(STEPS.length, 9);
});

test("a switch saves itself, so the trial's button stays about one thing", () => {
  /* On a screen of its own, save-on-continue was free; as a section of the trial screen it would
     couple "Start using it" to a write that can fail after the acks succeed. */
  const choices = code(read("components/start/NotificationsStep.tsx"));
  assert.match(choices, /function change\(next: Choice\) \{\s*setChoice\(next\);\s*void persist\(next\);/);
});
