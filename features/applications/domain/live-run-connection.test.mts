import assert from "node:assert/strict";
import test from "node:test";
import {
  IDLE_LIVE_RUN_CONNECTION,
  LIVE_RUN_POLL_BASE_MS,
  LIVE_RUN_POLL_HIDDEN_BASE_MS,
  LIVE_RUN_POLL_MAX_DELAY_MS,
  LIVE_RUN_RECONNECTING_NOTICE,
  LIVE_RUN_RECONNECT_WINDOW_MS,
  liveRunConnectionAfterFailure,
  liveRunConnectionAfterSuccess,
  liveRunConnectionView,
  liveRunFailureKind,
  liveRunPollDelayMs,
  liveRunViewSurvivesFailure,
} from "./live-run-connection.ts";

/**
 * Measured 2026-09-10, three runs: the live view fell back to packet review under a red
 * "Failed to fetch" while the run kept filling on the server. These bound the rule that stops it.
 */

const failedToFetch = new TypeError("Failed to fetch");

function apiError(status: number, message = `HTTP ${status}`): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

test("a rejection with no HTTP status is transient", () => {
  assert.equal(liveRunFailureKind(failedToFetch), "transient");
  assert.equal(liveRunFailureKind(new DOMException("The operation was aborted.", "AbortError")), "transient");
  assert.equal(liveRunFailureKind(new Error("network error")), "transient");
  assert.equal(liveRunFailureKind(undefined), "transient");
});

test("a gateway status is transient and a chosen refusal is definitive", () => {
  for (const status of [408, 425, 429, 502, 503, 504]) {
    assert.equal(liveRunFailureKind(apiError(status)), "transient", String(status));
  }
  for (const status of [400, 401, 403, 404, 409, 422, 500]) {
    assert.equal(liveRunFailureKind(apiError(status)), "definitive", String(status));
  }
});

test("a single transient failure shows the reconnecting notice, never the error banner", () => {
  const state = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, failedToFetch, 1000, "Failed to fetch");
  const view = liveRunConnectionView(state, 1000);
  assert.equal(view.tone, "notice");
  assert.equal(view.message, LIVE_RUN_RECONNECTING_NOTICE);
  assert.equal(liveRunViewSurvivesFailure(state), true);
});

test("the window measures the outage, not the latest tick", () => {
  // Every tick failing for a minute is ONE outage. Resetting the clock per failure would keep the
  // notice up forever, which is the opposite defect: a permanently dead backend never escalates.
  let state = IDLE_LIVE_RUN_CONNECTION;
  let now = 0;
  for (let i = 0; i < 6; i += 1) {
    now += liveRunPollDelayMs(state.consecutiveFailures, true);
    state = liveRunConnectionAfterFailure(state, failedToFetch, now, "Failed to fetch");
    assert.equal(state.firstFailureAtMs, liveRunPollDelayMs(0, true), "the run of failures keeps its start");
  }
  assert.equal(liveRunConnectionView(state, state.firstFailureAtMs! + LIVE_RUN_RECONNECT_WINDOW_MS - 1).tone, "notice");
  assert.equal(liveRunConnectionView(state, state.firstFailureAtMs! + LIVE_RUN_RECONNECT_WINDOW_MS).tone, "error");
  assert.equal(
    liveRunConnectionView(state, state.firstFailureAtMs! + LIVE_RUN_RECONNECT_WINDOW_MS).message,
    "Failed to fetch",
  );
});

test("the live view survives even an exhausted window", () => {
  // The banner escalates; the screen does not move. Only the server may take an applicant off a run
  // it still reports as running.
  const state = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, failedToFetch, 0, "Failed to fetch");
  assert.equal(liveRunConnectionView(state, LIVE_RUN_RECONNECT_WINDOW_MS * 5).tone, "error");
  assert.equal(liveRunViewSurvivesFailure(state), true);
});

test("a definitive refusal skips the window entirely", () => {
  const state = liveRunConnectionAfterFailure(
    IDLE_LIVE_RUN_CONNECTION,
    apiError(409, "That took too long and timed out. Start the application again."),
    5000,
    "That took too long and timed out. Start the application again.",
  );
  const view = liveRunConnectionView(state, 5000);
  assert.equal(view.tone, "error");
  assert.equal(view.message, "That took too long and timed out. Start the application again.");
  assert.equal(liveRunViewSurvivesFailure(state), false);
});

test("one success clears the run of failures, and an already-clean tick is identity-stable", () => {
  const failed = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, failedToFetch, 10, "Failed to fetch");
  const healed = liveRunConnectionAfterSuccess(failed);
  assert.deepEqual(healed, IDLE_LIVE_RUN_CONNECTION);
  assert.equal(liveRunConnectionView(healed, 10_000).tone, "none");
  assert.equal(liveRunConnectionAfterSuccess(healed), healed);
});

test("backoff climbs from the ordinary cadence to the cap and never past it", () => {
  assert.equal(liveRunPollDelayMs(0, true), LIVE_RUN_POLL_BASE_MS);
  assert.equal(liveRunPollDelayMs(1, true), 2500);
  assert.equal(liveRunPollDelayMs(2, true), 5000);
  assert.equal(liveRunPollDelayMs(3, true), LIVE_RUN_POLL_MAX_DELAY_MS);
  assert.equal(liveRunPollDelayMs(40, true), LIVE_RUN_POLL_MAX_DELAY_MS);
  assert.equal(liveRunPollDelayMs(0, false), LIVE_RUN_POLL_HIDDEN_BASE_MS);
  assert.equal(liveRunPollDelayMs(9, false), LIVE_RUN_POLL_HIDDEN_BASE_MS);
});

test("backoff still fits several attempts inside the reconnect window", () => {
  // The window is only honest if the connection is actually retried across it.
  let elapsed = 0;
  let attempts = 0;
  let failures = 0;
  while (elapsed < LIVE_RUN_RECONNECT_WINDOW_MS) {
    elapsed += liveRunPollDelayMs(failures, true);
    failures += 1;
    attempts += 1;
  }
  assert.ok(attempts >= 5, `expected at least five retries inside the window, got ${attempts}`);
});
