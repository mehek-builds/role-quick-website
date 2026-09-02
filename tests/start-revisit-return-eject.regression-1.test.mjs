import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* "Done, take me back" took the student the opposite of back.
 *
 * Reproduced in the browser on trylitos.com: standing on "Your match" at STEP 3 OF 10, opening
 * "Change something you answered", stepping into "the roles you picked", and pressing "Done, take
 * me back" landed on STEP 3 OF 3 "Setup complete." The rail lost seven of its ten steps between one
 * click and the next, and the receipt asserted a work-visa answer and a built resume the student
 * had never been shown.
 *
 * The cause was a rule that only ever ran once. /start's mount effect refuses to show a finished
 * account the receipt and sends it to the dashboard, but `refresh()` is called from every screen's
 * Continue, the install poll and both halves of a revisit, and any of those answering `done`
 * re-rendered the default arm (DoneStep) in place instead.
 *
 * THE RULE ITSELF IS TESTED IN lib/start-arrival.test.mts, against what it does, including the
 * sequence that the first version of this fix still got wrong. This file covers only what that
 * cannot: that the component actually defers to it. The first attempt at this fix was pinned
 * entirely by source assertions like these and they passed 4/4 while the bug shipped, so these are
 * deliberately few, and they check WIRING rather than restate the rule.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/* Comments describe the fix at length and quote the identifiers under test while doing it, so every
   assertion reads shipped code only. Without this the prose alone satisfies most of them. */
const code = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const START = code(read("app/start/page.tsx"));

test("every state read is put through the shared rule, not just the first", () => {
  /* An effect keyed on `state`, so it runs for the refreshes a revisit fires as well as for the
     mount read. Keyed on anything narrower and the rule goes back to running once. */
  assert.match(START, /startArrival\(state, advancedHere\.current\)/);
  assert.match(START, /\}, \[state, router\]\);/);
});

test("the bookkeeping the rule returns is written back", () => {
  /* THE LINE THAT CARRIES THE FIX. startArrival clears `advanced` on every non-terminal state, and
     that clearing only takes effect if the caller stores it. Dropping this assignment restores a
     set-only flag: true from the student's first Continue and true for the rest of the sitting, so
     the redirect is suppressed and the eject returns for anyone who advanced a single screen. */
  assert.match(START, /advancedHere\.current = arrival\.advanced;/);
});

test("only forward movement marks the sitting as advanced", () => {
  /* Every revisit's Continue calls stepDone before completedRevisit takes over, so a stepDone that
     set the flag unconditionally would mark stepping back and saving as progress. */
  assert.match(START, /if \(revisiting === null\) advancedHere\.current = true;/);

  /* And the callback has to recompute when a revisit opens or closes, or the closure reads a stale
     `revisiting` and the guard above decides on last render's answer. */
  assert.match(START, /const stepDone = useCallback\([\s\S]{0,220}?\[revisiting\],\s*\);/);
});

test("the mount read and the later refreshes share one definition of finished", () => {
  /* These were the same comparison written twice in opposite polarity. One drifting from the other
     would let a fresh load and a mid-flow refresh disagree about the same account. */
  assert.match(START, /if \(isFinishedAccount\(s\)\) \{/);
  assert.doesNotMatch(START, /requires_onboarding === false && s\.step === "done"/);
});
