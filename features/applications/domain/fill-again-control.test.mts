import assert from "node:assert/strict";
import test from "node:test";
import {
  FILL_AGAIN_LABEL,
  FILL_AGAIN_PACKET_REVIEW_LABEL,
  FILL_AGAIN_RUNNING_LABEL,
  fillAgainControlState,
} from "./fill-again-control.ts";

const STOPPED = {
  status: "needs_attention",
  submissionClaimed: false,
  running: false,
  unsavedAnswer: false,
  needsPacketReview: false,
} as const;

test("a stopped, unclaimed packet gets the control the question screen never had", () => {
  assert.deepEqual(fillAgainControlState(STOPPED), {
    available: true,
    disabled: false,
    busy: false,
    label: FILL_AGAIN_LABEL,
    reason: "ready",
  });
});

test("only a stopped packet gets it: no status the run cannot start from renders a control", () => {
  for (const status of [
    "resume_ready",
    "questions_ready",
    "ready_to_submit",
    "submit_requested",
    "preparing",
    "filling",
    "ready_for_final_approval",
    "awaiting_security_code",
    "submitting",
    "submission_claimed",
    "submitted",
    "failed",
  ]) {
    assert.deepEqual(
      fillAgainControlState({ ...STOPPED, status }),
      { available: false, reason: "not_stopped" },
      `${status} must not offer a fill again`,
    );
  }
});

test("a claimed packet hides the control, because the employer may already hold it", () => {
  assert.deepEqual(
    fillAgainControlState({ ...STOPPED, submissionClaimed: true }),
    { available: false, reason: "employer_attempt_open" },
  );
  // An unverified send she has not answered yet is the same open attempt, and stays hidden.
  assert.deepEqual(
    fillAgainControlState({ ...STOPPED, submissionClaimed: true, unverifiedResolution: undefined }),
    { available: false, reason: "employer_attempt_open" },
  );
  // "I looked and it is not there" is the ONE key the backend accepts for a claimed
  // needs_attention row (submitRequestDisposition), so the control comes back with it.
  assert.deepEqual(
    fillAgainControlState({ ...STOPPED, submissionClaimed: true, unverifiedResolution: "not_sent" }),
    { available: true, disabled: false, busy: false, label: FILL_AGAIN_LABEL, reason: "ready" },
  );
  // "I looked and it IS there" is not a key. That answer moves the packet to submitted.
  assert.deepEqual(
    fillAgainControlState({ ...STOPPED, submissionClaimed: true, unverifiedResolution: "sent" }),
    { available: false, reason: "employer_attempt_open" },
  );
});

test("the run in flight owns the control and says so", () => {
  assert.deepEqual(fillAgainControlState({ ...STOPPED, running: true }), {
    available: true,
    disabled: true,
    busy: true,
    label: FILL_AGAIN_RUNNING_LABEL,
    reason: "running",
  });
});

test("an unsaved answer disables the control rather than riding it", () => {
  const state = fillAgainControlState({ ...STOPPED, unsavedAnswer: true });
  assert.equal(state.available, true);
  assert.equal(state.available && state.disabled, true);
  assert.equal(state.available && state.busy, false);
  assert.equal(state.available && state.reason, "unsaved_answer");
  // The run carries only saved answers, so the label must not promise a fill it will not do.
  assert.equal(state.available && state.label, FILL_AGAIN_LABEL);
});

test("an unreviewed exact packet relabels the control instead of dead-ending it", () => {
  assert.deepEqual(fillAgainControlState({ ...STOPPED, needsPacketReview: true }), {
    available: true,
    disabled: false,
    busy: false,
    label: FILL_AGAIN_PACKET_REVIEW_LABEL,
    reason: "packet_review_first",
  });
});

test("in flight outranks every other reason, and a hidden control is never relabelled", () => {
  assert.deepEqual(
    fillAgainControlState({ ...STOPPED, running: true, unsavedAnswer: true, needsPacketReview: true }),
    { available: true, disabled: true, busy: true, label: FILL_AGAIN_RUNNING_LABEL, reason: "running" },
  );
  assert.deepEqual(
    fillAgainControlState({ ...STOPPED, status: "submitted", running: true, needsPacketReview: true }),
    { available: false, reason: "not_stopped" },
  );
  assert.deepEqual(
    fillAgainControlState({ ...STOPPED, submissionClaimed: true, running: true }),
    { available: false, reason: "employer_attempt_open" },
  );
});
