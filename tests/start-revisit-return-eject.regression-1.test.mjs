import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* "Done, take me back" took the student the opposite of back.
 *
 * Reproduced in the browser on trylitos.com against a live account: standing on "Your match" at
 * STEP 3 OF 10, opening "Change something you answered", stepping into "the roles you picked", and
 * pressing "Done, take me back" landed on STEP 3 OF 3 "Setup complete." The rail lost seven of its
 * ten steps between one click and the next, and the receipt asserted a work-visa answer and a
 * built resume the student had never been shown.
 *
 * The cause was a rule that only ever ran once. /start's mount effect refuses to show a finished
 * account the receipt and sends it to the dashboard, which is correct - but `refresh()` is called
 * from every screen's Continue, the install poll and both halves of a revisit, and any of those
 * answering `done` re-rendered the default arm (DoneStep) in place instead.
 *
 * So the rule now runs on every state change, with one exception: a student who WALKED to the last
 * screen must still get their receipt. `advancedHere` is that exception, and it is deliberately not
 * derived from `stepDone` alone, because a revisit's own Continue calls `stepDone` too - keying on
 * it unguarded would have left the save-and-return path with the bug this fixes.
 *
 * Source-text assertions in the style of tests/dashboard-home-title.test.mjs: no build, no port and
 * no DOM, pinning parts that are individually invisible.
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

test("a refresh that answers done redirects instead of rendering the receipt in place", () => {
  /* The redirect must sit in an effect keyed on `state`, not inside the mount effect, or it goes
     back to running once. Anchored on the guard clause so a reordering that drops the
     requires_onboarding half - which would eject accounts mid-flow - fails here. */
  assert.match(
    START,
    /useEffect\(\(\) => \{\s*if \(!state \|\| advancedHere\.current\) return;\s*if \(state\.step !== "done" \|\| state\.requires_onboarding !== false\) return;\s*router\.replace\("\/dashboard"\);\s*\}, \[state, router\]\);/,
  );
});

test("the first-time finisher still reaches their receipt", () => {
  /* Without `advancedHere` the redirect above is unconditional, and the last screen of the flow
     becomes unreachable: the student presses Continue on the plan step, the refresh answers done,
     and they are bounced to the dashboard having never seen the receipt or its automation
     switches. The ref is the whole reason the redirect is safe. */
  assert.match(START, /const advancedHere = useRef\(false\);/);
});

test("only forward movement sets the flag, never a revisit", () => {
  /* THE HALF THAT IS EASY TO GET WRONG. Every revisit's Continue calls stepDone before
     completedRevisit takes over (see the focus, sponsorship and questions cases), so a stepDone
     that set the flag unconditionally would mark a student as having advanced when all they did
     was step back and save. The next refresh answering done would then render the receipt in
     place - the exact bug - on the save-and-return path while the plain-return path was fixed. */
  assert.match(START, /if \(revisiting === null\) advancedHere\.current = true;/);

  /* And the callback has to actually recompute when a revisit opens or closes, or the closure
     reads a stale `revisiting` and the guard above decides on last render's answer. */
  assert.match(START, /const stepDone = useCallback\([\s\S]{0,220}?\[revisiting\],\s*\);/);
});

test("the mount check that established the rule is still there", () => {
  /* The new effect generalises this one rather than replacing it: the mount path short-circuits
     before loadProfile, so deleting it would add a wasted profile fetch and a frame of the receipt
     on every load by a finished account. */
  assert.match(START, /if \(s\.requires_onboarding === false && s\.step === "done"\) \{\s*router\.replace\("\/dashboard"\);/);
});
