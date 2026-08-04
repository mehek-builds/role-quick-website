import assert from "node:assert/strict";
import test from "node:test";
import { screenForStatus } from "./application-review.ts";

/**
 * The defect this exists for: a run that had already failed kept rendering the progress screen.
 *
 * POST /submit-request returns a TERMINAL review - it resolves when the run is over, and it
 * routinely carries status "failed". The dashboard installed that response with setSubmission and
 * then routed on nothing, so the screen stayed on "submitting" and the applicant watched
 * "Getting the company's page ready." and a climbing elapsed counter over a dead run, with no
 * error, no reason and no retry. Confirmed in prod on 2026-08-04.
 *
 * The mapping now lives in one function because it was written out longhand in three places and
 * the third one was simply missing.
 */
test("a terminal status routes off the progress screen", () => {
  // "submitting" is the fallback every mid-run caller passes, so these assert the fallback is
  // genuinely overridden rather than merely reachable.
  assert.equal(screenForStatus("failed", "submitting"), "portal");
  assert.equal(screenForStatus("needs_attention", "submitting"), "portal");
  assert.equal(screenForStatus("ready_for_final_approval", "submitting"), "portal");
  assert.equal(screenForStatus("submitted", "submitting"), "submitted");
});

test("an in-flight status keeps the progress screen", () => {
  for (const status of ["submit_requested", "preparing", "filling", "submitting", "submission_claimed"]) {
    assert.equal(screenForStatus(status, "review"), "submitting", status);
  }
});

test("the fallback is the only difference between selecting a packet and polling one", () => {
  // Selecting a packet that is not live lands on the review screen; a poll or a submit response
  // mid-run stays on the progress screen. Everything else is shared.
  assert.equal(screenForStatus("ready_to_submit", "review"), "review");
  assert.equal(screenForStatus("resume_ready", "review"), "review");
  assert.equal(screenForStatus(undefined, "review"), "review");
  assert.equal(screenForStatus(undefined, "submitting"), "submitting");
  // An unknown status from a newer backend must not strand the user on a spinner it cannot leave.
  assert.equal(screenForStatus("something_new", "review"), "review");
});
