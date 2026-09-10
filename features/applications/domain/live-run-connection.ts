/**
 * WHEN THE CONNECTION BLINKS DURING A LIVE FILL RUN.
 *
 * THE DEFECT THIS EXISTS FOR, measured 2026-09-10 on three separate runs against
 * trylitos.com/dashboard/applications?application=<id>&intent=apply: within the first one to three
 * minutes of a managed fill, the LIVE APPLICATION STATUS view ("Filling form", "Opening the company
 * form", the elapsed clock) replaced itself with a red "Failed to fetch" and the applicant landed
 * back on packet review under an armed "Approve packet and fill form". The run had not stopped. It
 * kept going on the server and finished minutes later, so the screen was lying about the one thing
 * it exists to report, and the only control it offered would have started a SECOND run against the
 * same employer, or been refused for the reason the screen was already wrong about.
 *
 * The cause is that both channels feeding that screen treat one rejected request as news about the
 * RUN, when it is only news about this browser's last round trip:
 *
 *   1. POST /applications/:id/submit-request is held open for the whole run - it resolves with the
 *      TERMINAL review, minutes later. A container swap or a single proxy hiccup rejects that one
 *      long-lived socket with a bare TypeError("Failed to fetch") while the run continues
 *      server-side, and prepareApplication's catch routed straight back to review.
 *   2. The 2.5s status poll surfaced any single rejected tick as a banner immediately.
 *
 * A dropped socket is not an answer. This module holds the rule for telling the two apart and the
 * retry window that has to elapse before a transient is allowed to become a sentence on screen. It
 * is domain code with no imports so the state machine can be asserted directly, in the repo's usual
 * shape: an ApiError is recognised structurally by its numeric `status` rather than by importing
 * the class out of the "use client" api module.
 */

/** How long consecutive failures may run before the applicant is told the connection is gone. */
export const LIVE_RUN_RECONNECT_WINDOW_MS = 60_000;

/**
 * And how many attempts must actually have been MADE and failed inside it.
 *
 * The window alone ages on the wall clock, and a hidden tab makes no attempts at all: the poll
 * effect's tick returns immediately while document.visibilityState !== "visible". So one failure
 * followed by two minutes on another tab used to satisfy a sixty-second window having retried the
 * connection exactly once, and the applicant came back to a red banner the browser had never
 * earned. The window is only honest if the connection was retried across it, so the escalation
 * needs both: the elapsed minute AND a run of failures long enough to mean it. A visible tab backs
 * off at 2.5s, 5s, 10s, 10s..., which reaches this count well inside the window, so nothing about
 * the measured incident's timing changes.
 */
export const LIVE_RUN_MIN_FAILED_ATTEMPTS = 4;

/** Non-blocking, and deliberately about the connection rather than about the run. */
export const LIVE_RUN_RECONNECTING_NOTICE = "Reconnecting to Litos...";

/** The poll's ordinary cadence, and the ceiling backoff may not exceed. */
export const LIVE_RUN_POLL_BASE_MS = 2500;
export const LIVE_RUN_POLL_HIDDEN_BASE_MS = 10_000;
export const LIVE_RUN_POLL_MAX_DELAY_MS = 10_000;

/**
 * HTTP statuses that are an infrastructure hiccup rather than an answer about the run.
 *
 * Railway answers 502/503/504 through the edge while a container is swapping, which is exactly the
 * shape of the measured incident, and none of those bytes were written by litos-api about this
 * application. 408 and 425 are the same class. 429 is a shared-platform throttle: backing off is
 * the correct response to it, and it says nothing about whether the run is alive.
 */
const TRANSIENT_HTTP_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 502, 503, 504]);

export type LiveRunFailureKind = "transient" | "definitive";

/**
 * The HTTP status the API chose for this rejection, or null when nothing answered.
 *
 * Exported because "did a server write these bytes" is a DIFFERENT question from "may the live view
 * hold", and the caller needs both. A 429 from the hourly limiter and a 503 from the shutdown gate
 * are transient - backing off is the right response - but litos-api chose them, wrote a sentence in
 * the body, and that sentence is the applicant's only account of why nothing started. Only a
 * status-less rejection (TypeError("Failed to fetch"), an abort, a timeout) is genuinely news about
 * nothing.
 */
export function liveRunFailureStatus(reason: unknown): number | null {
  if (!reason || typeof reason !== "object") return null;
  const status = (reason as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

const httpStatusOf = liveRunFailureStatus;

/**
 * Transient unless the API answered.
 *
 * A rejection with no HTTP status never reached litos-api, or reached it and lost the reply:
 * TypeError("Failed to fetch"), an abort, a timeout. That is the whole class this fix is about, and
 * it fails toward keeping the live view rather than toward believing a socket. Anything carrying a
 * status the server chose is definitive, and a 409 or a 422 must reach the applicant on the first
 * tick that raises it.
 */
export function liveRunFailureKind(reason: unknown): LiveRunFailureKind {
  const status = httpStatusOf(reason);
  if (status === null) return "transient";
  return TRANSIENT_HTTP_STATUSES.has(status) ? "transient" : "definitive";
}

export type LiveRunConnection = {
  /** Consecutive failures. Reset by any success, which is what makes the window a run of failures. */
  readonly consecutiveFailures: number;
  /** When the current run of failures began, so the window measures the OUTAGE, not the last tick. */
  readonly firstFailureAtMs: number | null;
  readonly kind: LiveRunFailureKind | null;
  readonly message: string | null;
  /**
   * THE SENTENCE A TRANSIENT MAY NOT TAKE WITH IT WHEN IT HEALS.
   *
   * Holding the live view over a transient is right, and swallowing one is not the same thing. Six
   * of the statuses in the transient class are written by litos-api itself about this very request:
   * the hourly limiter's 429, the shutdown gate's 503. Those refuse the run outright - nothing was
   * started, nothing is filling - and the poll's next clean tick then routes the applicant back to
   * review with the send re-armed and the screen silent about why the first press did nothing. That
   * is the dead-button class this file's siblings exist for, rebuilt out of the fix for the
   * opposite defect.
   *
   * So a failure that carried a STATUS parks its message here, and the heal deliberately does not
   * clear it. Anything the API did not write leaves this null: there is no sentence to keep.
   */
  readonly retainedMessage: string | null;
};

export const IDLE_LIVE_RUN_CONNECTION: LiveRunConnection = {
  consecutiveFailures: 0,
  firstFailureAtMs: null,
  kind: null,
  message: null,
  retainedMessage: null,
};

/** Identity-stable, so a clean tick does not re-render the live view on every one of them. */
export function liveRunConnectionAfterSuccess(current: LiveRunConnection): LiveRunConnection {
  if (current.consecutiveFailures === 0 && current.kind === null) return current;
  /* The run of failures is over; the server's sentence about the refused request is not. */
  return current.retainedMessage === null
    ? IDLE_LIVE_RUN_CONNECTION
    : { ...IDLE_LIVE_RUN_CONNECTION, retainedMessage: current.retainedMessage };
}

export function liveRunConnectionAfterFailure(
  current: LiveRunConnection,
  reason: unknown,
  nowMs: number,
  message: string,
): LiveRunConnection {
  return {
    consecutiveFailures: current.consecutiveFailures + 1,
    firstFailureAtMs: current.firstFailureAtMs ?? nowMs,
    kind: liveRunFailureKind(reason),
    message,
    /* A later status-less blink must not erase the sentence an earlier 429 or 503 wrote. */
    retainedMessage: liveRunFailureStatus(reason) === null ? current.retainedMessage : message,
  };
}

/** The server-chosen sentence still owed to the applicant, or null. */
export function liveRunRetainedRefusal(state: LiveRunConnection): string | null {
  return state.retainedMessage;
}

/** Called once the sentence has actually been put on screen, so it is not repeated forever. */
export function liveRunConnectionAfterRetainedDelivery(state: LiveRunConnection): LiveRunConnection {
  return state.retainedMessage === null ? state : { ...state, retainedMessage: null };
}

export type LiveRunConnectionView =
  | { readonly tone: "none"; readonly message: null }
  | { readonly tone: "notice"; readonly message: string }
  | { readonly tone: "error"; readonly message: string };

const IDLE_VIEW: LiveRunConnectionView = { tone: "none", message: null };

/**
 * What the applicant is shown for the connection, and nothing else: this never decides a screen.
 *
 * The escalation is one-way and time-based. A definitive refusal skips the window entirely - the
 * server wrote a sentence and withholding it for a minute would reproduce the swallowed-409 class
 * this file's siblings document.
 */
export function liveRunConnectionView(state: LiveRunConnection, nowMs: number): LiveRunConnectionView {
  if (state.consecutiveFailures === 0 || state.message === null) return IDLE_VIEW;
  if (state.kind === "definitive") return { tone: "error", message: state.message };
  const startedAt = state.firstFailureAtMs ?? nowMs;
  /* BOTH, and the attempt count is the half a hidden tab cannot fake. See
     LIVE_RUN_MIN_FAILED_ATTEMPTS: the wall clock keeps running while the poll makes no requests at
     all, so a minute of elapsed time on its own is not evidence that the connection is gone. */
  if (nowMs - startedAt < LIVE_RUN_RECONNECT_WINDOW_MS || state.consecutiveFailures < LIVE_RUN_MIN_FAILED_ATTEMPTS) {
    return { tone: "notice", message: LIVE_RUN_RECONNECTING_NOTICE };
  }
  return { tone: "error", message: state.message };
}

/**
 * True while the live view must be held over a run whose last known status was in flight.
 *
 * Separate from the view above because they answer different questions and diverge at the end of
 * the window: the banner escalates to red, and the screen still does not move. Only the server, or
 * a definitive refusal, may take the applicant off a run it says is running.
 *
 * CALLED FROM prepareApplication's catch, which is the one place a failure can route off the live
 * view, and it is asked of the state the failure WOULD produce rather than of the rejection: the
 * state is what carries the retained refusal a survived failure still owes the applicant.
 */
export function liveRunViewSurvivesFailure(state: LiveRunConnection): boolean {
  return state.kind !== "definitive";
}

/**
 * Backoff for the status poll, in milliseconds.
 *
 * Exponential from the ordinary cadence and capped, so a dead backend is not hammered every 2.5s
 * for the length of a fill, while still fitting several attempts inside the reconnect window: a
 * visible tab retries at roughly 2.5s, 5s, 10s, 10s... which is five or more attempts before the
 * window is exhausted. A hidden tab is already slower than the cap, so backoff cannot slow it
 * further.
 */
export function liveRunPollDelayMs(consecutiveFailures: number, visible: boolean): number {
  const base = visible ? LIVE_RUN_POLL_BASE_MS : LIVE_RUN_POLL_HIDDEN_BASE_MS;
  if (consecutiveFailures <= 0) return base;
  const backedOff = base * 2 ** Math.min(consecutiveFailures - 1, 10);
  return Math.max(base, Math.min(backedOff, LIVE_RUN_POLL_MAX_DELAY_MS));
}
