import assert from "node:assert/strict";
import test from "node:test";
import { isFinishedAccount, startArrival } from "./start-arrival.ts";

/* These are the tests the first version of this fix could not have: it lived entirely inside
 * app/start/page.tsx, so its suite could only assert that certain lines appeared in the file, and
 * it passed 4/4 against code that still shipped the bug. Every case below is a SEQUENCE, because
 * the defect was never in one decision - it was in what the flag carried between them. */

const flow = { step: "match", requires_onboarding: true } as const;
const finished = { step: "done", requires_onboarding: false } as const;

/** Replays a sitting: each state in turn, threading the flag, with `true` marking the states the
 *  student reached by pressing Continue rather than by being moved. */
function sitting(states: { state: typeof flow | typeof finished; advancedInto?: boolean }[]) {
  let advanced = false;
  const left: boolean[] = [];
  for (const { state, advancedInto } of states) {
    if (advancedInto) advanced = true;
    const arrival = startArrival(state, advanced);
    advanced = arrival.advanced;
    left.push(arrival.leave);
  }
  return left;
}

test("a finished account that was moved here leaves for the dashboard", () => {
  assert.deepEqual(startArrival(finished, false), { leave: true, advanced: false });
});

test("a student who walked to the end keeps their receipt", () => {
  assert.deepEqual(startArrival(finished, true), { leave: false, advanced: true });
});

test("any state mid-flow renders, and clears the flag", () => {
  assert.deepEqual(startArrival(flow, false), { leave: false, advanced: false });
  assert.deepEqual(startArrival(flow, true), { leave: false, advanced: false });
});

test("advancing once early does not buy a receipt for an eject much later", () => {
  /* THE BUG THE FIRST FIX STILL HAD, and the reason the flag has to be cleared rather than only
     set. The student presses Continue on "Your roles", walks on, and is later moved to `done` by a
     revisit's refresh. A set-only flag is still true from that first Continue, so the redirect is
     suppressed and DoneStep renders in place - the original eject, restored for anyone who
     advanced even one screen. */
  const left = sitting([
    { state: flow, advancedInto: true },  // pressed Continue on roles
    { state: flow },                      // landed on the next screen
    { state: finished },                  // a revisit's refresh answers done
  ]);
  assert.deepEqual(left, [false, false, true]);
});

test("the finisher's last Continue is still spent on the receipt", () => {
  /* The other direction, and the reason the redirect cannot simply be unconditional: the plan
     step's Continue is immediately followed by the state that answers `done`. */
  const left = sitting([
    { state: flow },
    { state: finished, advancedInto: true },
  ]);
  assert.deepEqual(left, [false, false]);
});

test("a receipt is spent once, not held for the rest of the sitting", () => {
  /* Having earned the receipt does not license every later arrival at `done`. */
  const left = sitting([
    { state: finished, advancedInto: true },
    { state: flow },
    { state: finished },
  ]);
  assert.deepEqual(left, [false, false, true]);
});

test("a backend that omits requires_onboarding is never treated as finished", () => {
  /* The safe direction: render the flow rather than eject someone mid-onboarding. */
  assert.equal(isFinishedAccount({ step: "done" }), false);
  assert.deepEqual(startArrival({ step: "done" }, false), { leave: false, advanced: false });
});

test("done and requires_onboarding are both load-bearing", () => {
  assert.equal(isFinishedAccount(finished), true);
  assert.equal(isFinishedAccount({ step: "done", requires_onboarding: true }), false);
  assert.equal(isFinishedAccount({ step: "match", requires_onboarding: false }), false);
});
