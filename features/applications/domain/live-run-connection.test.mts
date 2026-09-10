import assert from "node:assert/strict";
import test from "node:test";
import {
  IDLE_LIVE_RUN_CONNECTION,
  LIVE_RUN_POLL_BASE_MS,
  LIVE_RUN_POLL_HIDDEN_BASE_MS,
  LIVE_RUN_POLL_MAX_DELAY_MS,
  LIVE_RUN_MIN_FAILED_ATTEMPTS,
  LIVE_RUN_RECONNECTING_NOTICE,
  LIVE_RUN_RECONNECT_WINDOW_MS,
  liveRunConnectionAfterFailure,
  liveRunConnectionAfterRetainedDelivery,
  liveRunConnectionAfterSuccess,
  liveRunConnectionIsFor,
  liveRunConnectionView,
  liveRunFailureKind,
  liveRunFailureStatus,
  liveRunPollDelayMs,
  liveRunRetainedRefusal,
  liveRunViewSurvivesFailure,
} from "./live-run-connection.ts";

/**
 * Measured 2026-09-10, three runs: the live view fell back to packet review under a red
 * "Failed to fetch" while the run kept filling on the server. These bound the rule that stops it.
 */

const failedToFetch = new TypeError("Failed to fetch");

/* Two ids, because the state is page-level and the applicant can switch applications inside the
   reconnect window. Every refusal it retains must name the one it is about. */
const APPLICATION_A = "7f7a2f1c-0f1e-4a44-9a2f-1c0f1e4a4491";
const APPLICATION_B = "1c0f1e4a-4a44-9a2f-0f1e-7f7a2f1c4492";

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
  const state = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, APPLICATION_A, failedToFetch, 1000, "Failed to fetch");
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
    state = liveRunConnectionAfterFailure(state, APPLICATION_A, failedToFetch, now, "Failed to fetch");
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
  let state = IDLE_LIVE_RUN_CONNECTION;
  for (let i = 0; i < LIVE_RUN_MIN_FAILED_ATTEMPTS; i += 1) {
    state = liveRunConnectionAfterFailure(state, APPLICATION_A, failedToFetch, i * 2500, "Failed to fetch");
  }
  assert.equal(liveRunConnectionView(state, LIVE_RUN_RECONNECT_WINDOW_MS * 5).tone, "error");
  assert.equal(liveRunViewSurvivesFailure(state), true);
});

test("an aged window with too few attempts is still only a notice", () => {
  /* Measured shape: the poll's tick returns without fetching while document.visibilityState is not
     "visible", so a backgrounded tab makes NO attempts while the wall clock runs. One failure and
     two minutes on another tab used to be enough to paint a red banner the browser had never
     earned. The window must be a window of RETRIES. */
  const oneFailure = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, APPLICATION_A, failedToFetch, 0, "Failed to fetch");
  const longAfterwards = LIVE_RUN_RECONNECT_WINDOW_MS * 3;
  assert.equal(liveRunConnectionView(oneFailure, longAfterwards).tone, "notice");
  assert.equal(liveRunConnectionView(oneFailure, longAfterwards).message, LIVE_RUN_RECONNECTING_NOTICE);

  let retried = oneFailure;
  while (retried.consecutiveFailures < LIVE_RUN_MIN_FAILED_ATTEMPTS) {
    retried = liveRunConnectionAfterFailure(retried, APPLICATION_A, failedToFetch, retried.consecutiveFailures * 2500, "Failed to fetch");
  }
  assert.equal(liveRunConnectionView(retried, longAfterwards).tone, "error");
  // A definitive refusal is never held for attempts either. The server answered on the first one.
  const refused = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, APPLICATION_A, apiError(409, "Start again."), 0, "Start again.");
  assert.equal(liveRunConnectionView(refused, 0).tone, "error");
});

test("liveRunFailureStatus separates a server's bytes from a dropped socket", () => {
  assert.equal(liveRunFailureStatus(failedToFetch), null);
  assert.equal(liveRunFailureStatus(undefined), null);
  assert.equal(liveRunFailureStatus({ status: "429" }), null);
  assert.equal(liveRunFailureStatus(apiError(429)), 429);
  assert.equal(liveRunFailureStatus(apiError(503)), 503);
});

test("a 429 on submit-request holds the live view AND keeps its sentence for the route back", () => {
  /* The blocker this pair exists for: 429 and 503 are transient - backing off is right - but
     litos-api WROTE them about this request and refused the run. Holding the view is correct;
     losing the sentence on the next clean tick is how a refused send becomes a silently re-armed
     button. */
  const limited = "You have reached this hour's application limit. Try again shortly.";
  const state = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, APPLICATION_A, apiError(429, limited), 1000, limited);
  assert.equal(liveRunViewSurvivesFailure(state), true, "the live view is held, the run may be alive");
  assert.equal(liveRunConnectionView(state, 1000).tone, "notice", "one refused round trip is not yet a banner");

  const healed = liveRunConnectionAfterSuccess(state);
  assert.equal(healed.consecutiveFailures, 0);
  assert.equal(healed.kind, null);
  assert.equal(liveRunConnectionView(healed, 60_000).tone, "none", "the connection itself is fine again");
  assert.deepEqual(
    liveRunRetainedRefusal(healed),
    { applicationId: APPLICATION_A, message: limited },
    "the server's sentence survives the heal, still naming the application it refused",
  );
  assert.equal(healed.applicationId, APPLICATION_A, "the surviving state names whose sentence it holds");

  const delivered = liveRunConnectionAfterRetainedDelivery(healed);
  assert.equal(liveRunRetainedRefusal(delivered), null, "and is not repeated forever once shown");
  assert.equal(liveRunConnectionAfterRetainedDelivery(delivered), delivered, "identity-stable when there is nothing owed");
});

test("a 503 shutdown gate keeps its sentence even under a later status-less blink", () => {
  const shuttingDown = "Litos is restarting. Nothing was sent. Start the application again in a moment.";
  let state = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, APPLICATION_A, apiError(503, shuttingDown), 0, shuttingDown);
  state = liveRunConnectionAfterFailure(state, APPLICATION_A, failedToFetch, 2500, "Failed to fetch");
  assert.deepEqual(liveRunRetainedRefusal(state), { applicationId: APPLICATION_A, message: shuttingDown },
    "a dropped socket has no sentence to overwrite it with");
  assert.deepEqual(liveRunRetainedRefusal(liveRunConnectionAfterSuccess(state)),
    { applicationId: APPLICATION_A, message: shuttingDown });
});

test("a status-less rejection holds the live view and leaves nothing owed", () => {
  const state = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, APPLICATION_A, failedToFetch, 0, "Failed to fetch");
  assert.equal(liveRunViewSurvivesFailure(state), true);
  assert.equal(liveRunRetainedRefusal(state), null, "the API said nothing, so there is nothing to deliver later");
  assert.equal(state.applicationId, APPLICATION_A, "an outage still names the application it was measured on");
  assert.equal(liveRunConnectionAfterSuccess(state), IDLE_LIVE_RUN_CONNECTION);
});

test("a definitive refusal skips the window entirely", () => {
  const state = liveRunConnectionAfterFailure(
    IDLE_LIVE_RUN_CONNECTION,
    APPLICATION_A,
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
  const failed = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, APPLICATION_A, failedToFetch, 10, "Failed to fetch");
  const healed = liveRunConnectionAfterSuccess(failed);
  assert.equal(healed, IDLE_LIVE_RUN_CONNECTION);
  assert.equal(liveRunConnectionView(healed, 10_000).tone, "none");
  assert.equal(liveRunConnectionAfterSuccess(healed), healed);
});

/* THE SECOND-ROUND BLOCKER, and the reason the retained refusal is a stamped pair rather than a
   bare string. The accumulator lives on the page, not on a packet: a 429 refusing application A's
   send is still sitting in it when the applicant clicks application B, whose entry screen is a
   routable "portal" and whose first poll tick reaches the delivery site. Unstamped, A's sentence
   was printed as B's banner. */
test("a retained refusal names the application it refused, and never another one", () => {
  const limited = "You have reached this hour's application limit. Try again shortly.";
  const refusedA = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, APPLICATION_A, apiError(429, limited), 0, limited);
  const owed = liveRunRetainedRefusal(refusedA);
  assert.deepEqual(owed, { applicationId: APPLICATION_A, message: limited });
  assert.notEqual(owed!.applicationId, APPLICATION_B, "B is owed nothing by A's refusal");

  /* And the caller's own question, asked of the state rather than reconstructed at the render. */
  assert.equal(liveRunConnectionIsFor(refusedA, APPLICATION_A), true);
  assert.equal(liveRunConnectionIsFor(refusedA, APPLICATION_B), false);
  assert.equal(liveRunConnectionIsFor(refusedA, null), false, "no application on screen is not a match");
  assert.equal(liveRunConnectionIsFor(IDLE_LIVE_RUN_CONNECTION, null), false, "and idle is nobody's news");
});

test("a failure on another application starts its own outage instead of inheriting one", () => {
  /* A run of failures measured on A must not lend B a half-exhausted reconnect window, and A's
     undelivered sentence must not ride into B's state to be delivered there. */
  const limited = "You have reached this hour's application limit. Try again shortly.";
  let onA = liveRunConnectionAfterFailure(IDLE_LIVE_RUN_CONNECTION, APPLICATION_A, apiError(429, limited), 0, limited);
  while (onA.consecutiveFailures < LIVE_RUN_MIN_FAILED_ATTEMPTS) {
    onA = liveRunConnectionAfterFailure(onA, APPLICATION_A, failedToFetch, onA.consecutiveFailures * 2500, "Failed to fetch");
  }
  assert.equal(liveRunConnectionView(onA, LIVE_RUN_RECONNECT_WINDOW_MS * 2).tone, "error", "A's window is spent");

  const onB = liveRunConnectionAfterFailure(onA, APPLICATION_B, failedToFetch, LIVE_RUN_RECONNECT_WINDOW_MS * 2, "Failed to fetch");
  assert.equal(onB.applicationId, APPLICATION_B);
  assert.equal(onB.consecutiveFailures, 1, "B's first failure is B's first failure");
  assert.equal(onB.firstFailureAtMs, LIVE_RUN_RECONNECT_WINDOW_MS * 2, "B's window opens when B first failed");
  assert.equal(liveRunRetainedRefusal(onB), null, "A's 429 does not follow the applicant into B");
  assert.equal(liveRunConnectionView(onB, LIVE_RUN_RECONNECT_WINDOW_MS * 2).tone, "notice", "and B is not born red");
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
