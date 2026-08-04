/**
 * One place where a backend response is checked before the presentation layer sees it.
 *
 * WHY THIS EXISTS
 * ===============
 * The button audit found the same defect three separate times, in three unrelated components:
 *
 *   1. components/app/ResumeHealth.tsx mapped `findings` from /resume/health. Undefined once, and
 *      the whole applications review screen went to the route boundary.
 *   2. components/app/Funnel.tsx mapped `days` from /metrics/funnel. `{}` on that endpoint made
 *      the ENTIRE Home Overview band never render: section[aria-labelledby="applications-summary"]
 *      is a sibling of Momentum inside one grid, and a throw in Momentum takes the grid with it.
 *   3. components/app/Board.tsx read `stages` and `cards` from /applications/board. `[]` instead
 *      of `{stages, cards}` killed the whole /dashboard/applications route.
 *
 * Three occurrences is a missing guard, not bad luck. The severity driver is the deploy topology:
 * this repo's frontend deploys automatically and the backend deploys by hand, so the two drift by
 * construction. A backend that merely ADDS a field, REORDERS one, or DROPS one under load takes
 * Home down for every user with no client-side change shipped and nothing in the suite to catch it.
 *
 * THE TWO KINDS OF FIELD, AND WHY THEY ARE TREATED DIFFERENTLY
 * ===========================================================
 * Defaulting everything to empty would be the obvious fix and it would be a worse bug. This audit
 * filed ISSUE-014 on the principle that Litos never prints a zero it did not measure, and an
 * all-defaults response renders a panel full of confident zeros: "0 sent since you started" on an
 * account with forty applications is a LIE, and it is a lie the student has no way to detect. A
 * blank panel is the same lie told quietly.
 *
 * So each response has exactly one SUBJECT: the field the panel is about, the thing whose absence
 * means the panel cannot say anything true. Subjects are REQUIRED. If a subject is missing or has
 * the wrong type the response is rejected with a PartialPayloadError, which every one of these
 * components already has a path for, because they all already handle a failed fetch by naming the
 * failure and offering a retry. Rejecting therefore lands the student on an honest sentence rather
 * than on a blank box or a fabricated figure, and it does it without a single new UI state.
 *
 * Everything else is SECONDARY: a collection the panel can render without, or a scalar with a
 * meaningful absence. Those are defaulted, and that is the whole graceful-degradation win: a
 * backend that drops `stages` still shows the cards; a backend that drops `days` still shows the
 * counters that were measured.
 *
 * NOTHING HERE IS SWALLOWED. A rejection throws, so the component's failure state is what renders,
 * and it is reported as `api_payload_incomplete` with the endpoint and the names of the offending
 * fields. No values, no message, no stack: the same discipline the render_error event holds itself
 * to. A containment guard that turned a backend outage into a page which merely looks fine would be
 * a worse defect than the one it replaced.
 *
 * The reporter is INJECTED rather than imported. This module is pure wire-shape arithmetic with no
 * dependencies, which is what lets it be tested as behaviour by node:test without a bundler, a DOM
 * or an analytics client; applications-api.ts, the only importer, wires the real one in.
 */

/**
 * A backend response arrived, parsed as JSON, and was not the shape this endpoint promises.
 *
 * Deliberately NOT an ApiError: the request succeeded. Callers that want to tell "the backend is
 * down" from "the backend answered something else" can, and the message stays generic because it
 * can reach a screen through userFacingError.
 */
export class PartialPayloadError extends Error {
  readonly endpoint: string;
  /** The field names that were missing or the wrong type. Names only, never values. */
  readonly fields: readonly string[];

  constructor(endpoint: string, fields: readonly string[]) {
    super("Response was incomplete");
    this.name = "PartialPayloadError";
    this.endpoint = endpoint;
    this.fields = fields;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A secondary collection. Anything that is not an array becomes an empty one.
 *
 * This is the defaulting the presentation layer must never have to repeat: `?? []` at the call
 * site is a guard the NEXT component to read this field does not inherit, which is precisely how
 * the same defect shipped three times.
 */
function collection<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Check the subjects, report and throw if any are wrong, otherwise hand back the record.
 *
 * `spec` maps a field name to the predicate it has to satisfy. Order is preserved so the reported
 * field list is stable and greppable.
 */
function required(
  endpoint: string,
  raw: unknown,
  spec: Record<string, (value: unknown) => boolean>,
): Record<string, unknown> {
  if (!isRecord(raw)) {
    reject(endpoint, ["<envelope>"]);
  }
  const record = raw as Record<string, unknown>;
  const bad = Object.keys(spec).filter((field) => !spec[field](record[field]));
  if (bad.length > 0) reject(endpoint, bad);
  return record;
}

/** Set once, by applications-api.ts. No-op by default so nothing depends on registration order. */
let report: (endpoint: string, fields: readonly string[]) => void = () => {};

export function setPartialPayloadReporter(reporter: (endpoint: string, fields: readonly string[]) => void) {
  report = reporter;
}

function reject(endpoint: string, fields: string[]): never {
  /* Reported here rather than at each catch site, so a partial payload is counted even when the
     component's own handler is a bare .catch() (all six of them are). Wrapped, because a reporter
     that threw would replace the specific PartialPayloadError with its own and lose the field
     names, which are the entire diagnostic value of the event. */
  try {
    report(endpoint, fields);
  } catch {
    /* reporting must never mask the error it is reporting */
  }
  throw new PartialPayloadError(endpoint, fields);
}

// ---- the normalizers, one per endpoint whose response a component maps over ----

/**
 * GET /metrics/funnel.
 *
 * SUBJECT: the four counters. Momentum exists to print them, they are the figures ISSUE-014 is
 * about, and a defaulted 0 under "sent since you started" is unfalsifiable from the student's
 * chair. Missing one means the panel says "could not load your activity", which is true.
 *
 * SECONDARY: `days` (the sparkline is an illustration of the counters, not the reading itself) and
 * `too_early`, whose absence already means "no".
 */
export function normalizeFunnel<T>(raw: unknown): T {
  const record = required("/metrics/funnel", raw, {
    resumes_tailored: isFiniteNumber,
    applications_submitted: isFiniteNumber,
    fields_filled: isFiniteNumber,
    submitted_this_week: isFiniteNumber,
  });
  return {
    ...record,
    /* Each entry is rendered as a bar keyed on `day`, so an entry without one is dropped rather
       than drawn: a bar with an undefined key and an undefined height is not a smaller truth. */
    days: collection<Record<string, unknown>>(record.days).filter(
      (day) => isRecord(day) && typeof day.day === "string" && isFiniteNumber(day.submitted),
    ),
    too_early: record.too_early === true,
  } as T;
}

/**
 * GET /applications/board.
 *
 * SUBJECT: `cards`. The board is the cards. `[]` for the whole body, the shape that killed the
 * route, fails the envelope check before this even runs.
 *
 * SECONDARY: `stages`, defaulted to the CLIENT'S OWN canonical stage list, which the caller passes
 * in. The first attempt at this derived the list from the cards' own stage values, and that was
 * wrong in exactly the way this file exists to prevent. activeBoardStages() already filters
 * whatever arrives through the fixed constant ACTIVE_BOARD_STAGES, so a derived list can only ever
 * be a SUBSET of something the client already hard-codes: deriving cannot add information, it can
 * only subtract it. Measured in the browser, a board with one card in `applied` and no `stages`
 * rendered the Applied column alone. Interview and Offer vanished, which tells a student those
 * stages do not exist, and MoveControl draws one option per visible stage, so the student could not
 * move a card forward at all. No error, no retry, no telemetry, a route that looks healthy. That is
 * ISSUE-014 with a guard's face on. Derived order was a second hazard: it follows card iteration,
 * so the board could draw Offer before Applied.
 *
 * Passing the constant instead invents strictly less. It cannot surface a stage the client would
 * not otherwise display, because the same constant filters it one line later, and it keeps
 * canonical order. It is a PARAMETER rather than an import so this module stays dependency-free and
 * its test can pin the exact fallback.
 */
export function normalizeBoard<T>(raw: unknown, fallbackStages: readonly string[]): T {
  const record = required("/applications/board", raw, { cards: Array.isArray });
  return {
    ...record,
    stages: Array.isArray(record.stages) ? record.stages : [...fallbackStages],
    cards: collection(record.cards),
  } as T;
}

/**
 * POST /resume/health. The first of the three occurrences.
 *
 * SUBJECT: `findings`, plus the two bullet counts. Zero findings is a real and common answer, and
 * the panel prints "Nothing to fix. All N bullets..." for it: defaulting the array would make that
 * sentence appear on a response that checked nothing, and defaulting the counts would put an
 * invented N inside it.
 */
export function normalizeResumeHealth<T>(raw: unknown): T {
  const record = required("/resume/health", raw, {
    findings: Array.isArray,
    bullet_count: isFiniteNumber,
    quantified_count: isFiniteNumber,
  });
  return { ...record, findings: collection(record.findings) } as T;
}

/**
 * POST /interview-prep.
 *
 * SUBJECT: `items`, plus `answered`/`unanswered`, which are printed as a sentence about the
 * student's own resume ("your resume answers N of these").
 *
 * SECONDARY: `reason`, which the panel already treats as optional with its own fallback line.
 */
export function normalizeInterviewPrep<T>(raw: unknown): T {
  const record = required("/interview-prep", raw, {
    items: Array.isArray,
    answered: isFiniteNumber,
    unanswered: isFiniteNumber,
  });
  return { ...record, items: collection(record.items) } as T;
}

/**
 * POST /jd-match/requirements.
 *
 * SUBJECT: `clauses`. Everything the breakdown prints, including "N of M met", is derived from it
 * on the client, so an empty default would print "0 of 0 met" over a posting full of requirements.
 *
 * SECONDARY: `rejected`, a diagnostic count whose absence honestly means "none".
 */
export function normalizeRequirements<T>(raw: unknown): T {
  const record = required("/jd-match/requirements", raw, { clauses: Array.isArray });
  return { ...record, clauses: collection(record.clauses), rejected: collection(record.rejected) } as T;
}

/**
 * POST /jd-match/evidence.
 *
 * SUBJECT: `answers`. The panel already distinguishes "no evidence" from "could not ask", and this
 * keeps that distinction true.
 *
 * SECONDARY: each answer's own `evidence` list, which the panel slices to three and can show none
 * of without claiming anything false.
 */
export function normalizeGapEvidence<T>(raw: unknown): T {
  const record = required("/jd-match/evidence", raw, { answers: Array.isArray });
  return {
    ...record,
    answers: collection<Record<string, unknown>>(record.answers).map((answer) => ({
      ...answer,
      evidence: collection(isRecord(answer) ? answer.evidence : undefined),
    })),
  } as T;
}
