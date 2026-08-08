/* WHAT THE PAGE SAW, READABLE FROM THE TRIAL.
 *
 * Four of the ten defects are invisible in a screenshot and invisible in the DOM afterwards:
 *
 *   - the runner clicked a bullet in the job description rather than an option (the DOM looks
 *     identical either way, because nothing was selected in both cases);
 *   - the runner cleared a value an earlier pass had set (the end state is "empty", which is also
 *     what "never answered" looks like);
 *   - the runner typed into the search box and read its own typing back;
 *   - the menu was queried before it existed.
 *
 * So the fixture records what happened to it, on window.__litosQa, and the trial reads that instead
 * of guessing from the end state. This is the fixture's own instrumentation and exists nowhere in
 * the product; a page that reports what was done to it is the only way to tell "did not answer" from
 * "answered then unanswered".
 *
 * The array is capped so a runaway sweep cannot grow it without bound.
 */

export type QaEvent = { at: number; event: string; detail?: string };

export type QaWindow = {
  events: QaEvent[];
  /** Set once the page has mounted, so a trial can wait for instrumentation rather than race it. */
  ready: boolean;
  shape: string | null;
  /** Convenience for the trial: every event string in order. */
  names: () => string[];
  count: (event: string) => number;
  reset: () => void;
};

const MAX_EVENTS = 500;
const startedAt = Date.now();

function store(): QaWindow {
  const scope = globalThis as unknown as { __litosQa?: QaWindow };
  if (!scope.__litosQa) {
    const created: QaWindow = {
      events: [],
      ready: false,
      shape: null,
      names: () => created.events.map((entry) => entry.event),
      count: (event: string) => created.events.filter((entry) => entry.event === event).length,
      reset: () => { created.events.length = 0; },
    };
    scope.__litosQa = created;
  }
  return scope.__litosQa;
}

/* THE LOG HAS TO BE READABLE BY THE REAL RUNNER, NOT ONLY BY A LOCAL PLAYWRIGHT.
 *
 * The managed runner is the path production actually takes, and it is a script that runs inside a
 * forked sandbox and reports a fixed JSON shape. It cannot evaluate arbitrary JavaScript in the
 * page: the only DOM read it offers is `extract`, which returns one element's innerText or one of
 * its attributes.
 *
 * So window.__litosQa alone would only ever be readable by a REPLAY of the run driven from the
 * trial process, and a replay is a second implementation - the exact "two readers that disagree"
 * mistake this codebase has already had to delete once. Mirroring the log into an attribute makes
 * the real runner able to read it, so every verdict comes from the run that actually happened.
 *
 * ELEMENT_ID and the attribute names are the trial's contract. See scripts/trial-portal-shapes.mts
 * in the backend repo.
 */
export const QA_LOG_ELEMENT_ID = 'litos-qa-log';

function logElement(): Element | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(QA_LOG_ELEMENT_ID);
}

export function qaRecord(event: string, detail?: string): void {
  if (typeof window === 'undefined') return;
  const state = store();
  if (state.events.length >= MAX_EVENTS) return;
  state.events.push({ at: Date.now() - startedAt, event, detail });
  logElement()?.setAttribute(
    'data-litos-qa-events',
    state.events.map((entry) => (entry.detail ? `${entry.event}=${entry.detail}` : entry.event)).join('|'),
  );
}

/* A named piece of the fixture's end state, mirrored onto the log element so `extract` can read it.
 * Set imperatively rather than through React state: a re-render on every keystroke of a fill would
 * change the timing the fixture exists to reproduce. */
export function qaMirror(key: string, value: string): void {
  logElement()?.setAttribute(`data-litos-qa-${key}`, value);
}

export function qaReady(shape: string | null): void {
  if (typeof window === 'undefined') return;
  const state = store();
  state.shape = shape;
  state.ready = true;
}
