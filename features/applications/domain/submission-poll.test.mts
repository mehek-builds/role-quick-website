import assert from "node:assert/strict";
import test from "node:test";
import { screenForStatus, submissionPollIsRequired } from "./application-review.ts";

/* THE NINETY MINUTES NOTHING ASKED.
 *
 * Measured 2026-09-08 on Mehek's two Neuralink packets (65586e22, 63df5520, greenhouse). Both sat
 * at outcome_recovery {state: "pending", checks: 2} with next_check_at an hour and a half in the
 * past, and no /applications/:id/submission request reached the server at all while their screen
 * was open. That request is the only thing that drives the backend's recovery queue, so the queue
 * could never take its third check, never reach `unresolved`, and never show the applicant the one
 * control that releases the packet. Both were locked permanently.
 */

const parked = { unverified_submission: { at: "2026-09-08T17:04:22.460Z" } };
const answered = { unverified_submission: { at: "2026-09-08T17:04:22.460Z", resolution: "not_sent" } };

test("the two screens that always polled still always poll", () => {
  for (const screen of ["submitting", "portal"] as const) {
    assert.equal(submissionPollIsRequired(screen, null), true, screen);
    assert.equal(submissionPollIsRequired(screen, {}), true, screen);
  }
});

test("a packet parked on an unresolved send polls wherever it is shown", () => {
  // THE REGRESSION. This is the Neuralink state, on the screen it actually renders.
  for (const screen of ["review", "questions", "submitted"] as const) {
    assert.equal(submissionPollIsRequired(screen, parked), true, screen);
  }
});

test("an answered send stops polling, and so does a packet with nothing pending", () => {
  /* "It is not there" is the whole point of the poll: once she has answered, the queue has nothing
     left to drive and a request every 2.5 seconds would be pure noise. */
  for (const screen of ["review", "questions", "submitted"] as const) {
    assert.equal(submissionPollIsRequired(screen, answered), false, screen);
    assert.equal(submissionPollIsRequired(screen, {}), false, screen);
    assert.equal(submissionPollIsRequired(screen, null), false, screen);
    assert.equal(submissionPollIsRequired(screen, undefined), false, screen);
  }
});

test("the status these packets carry really does render a screen that used to be excluded", () => {
  /* Guards the join between the two rules. needs_attention maps to "portal", which polled - but the
     page only reaches that screen once something moves it there, and a deep link to a parked packet
     opens on "review". If a future change made every parked packet land on a polling screen this
     test would still pass; what it pins is that "review" is reachable and is not a polling screen
     on its own account. */
  assert.equal(screenForStatus("needs_attention", "review"), "portal");
  assert.equal(submissionPollIsRequired("review", null), false);
  assert.equal(submissionPollIsRequired("review", parked), true);
});
