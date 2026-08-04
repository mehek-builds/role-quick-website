/**
 * The parse boundary, tested as behaviour rather than as source text.
 *
 * WHAT THIS SUITE IS FOR
 * ======================
 * Three separate components in this repo have shipped a crash caused by mapping over a backend
 * collection that was not there. Each was fixed where it was found. This file exists so the FOURTH
 * one cannot ship: it pins the rule those three fixes should have been, one endpoint at a time.
 *
 * The two reported crashes are the first case under each of the first two endpoints:
 *   - /metrics/funnel answering `{}` must not produce an object the Momentum panel will map over.
 *   - /applications/board answering `[]` must not produce an object the Board will map over.
 * Both must REJECT, because both components already render an honest failure line for a rejection,
 * and neither has any way to render a truthful panel from that response.
 *
 * WHY THE ASSERTIONS ARE SPLIT THE WAY THEY ARE
 * =============================================
 * Every endpoint gets two kinds of case, and the pair is the whole point:
 *   REQUIRED  - the subject is missing, so the response is rejected and the panel says so.
 *   SECONDARY - the subject is present and something else is missing, so the response is ACCEPTED
 *               with that field emptied and the panel renders what was actually measured.
 * A guard that only did the first would be a route-killer converted into a panel-killer. A guard
 * that only did the second would print zeros nobody measured. Both directions are asserted for
 * every endpoint, so neither half can be removed without a red test.
 *
 * Nothing here reads source text or counts occurrences of a token: a mutation that leaves the right
 * expression behind in a comment must not be able to pass, which is the failure mode the click-path
 * spec's header documents.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ACTIVE_BOARD_STAGES } from "../domain/board-stages.ts";
import {
  PartialPayloadError,
  setPartialPayloadReporter,
  normalizeBoard,
  normalizeFunnel,
  normalizeGapEvidence,
  normalizeInterviewPrep,
  normalizeRequirements,
  normalizeResumeHealth,
} from "./response-shape.ts";

/* The module reports rejections through lib/analytics, which reads `window` and returns early
   without it. Under node:test there is no window, so nothing is captured and nothing throws. */

function rejects(run: () => unknown, fields: string[]) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof PartialPayloadError, `expected PartialPayloadError, got ${String(error)}`);
    assert.deepEqual([...error.fields], fields);
    return true;
  });
}

const FUNNEL_COUNTERS = {
  resumes_tailored: 22,
  applications_submitted: 5,
  fields_filled: 84,
  submitted_this_week: 2,
};

test("/metrics/funnel", async (t) => {
  await t.test("rejects the `{}` that blanked the whole Home Overview band", () => {
    rejects(() => normalizeFunnel({}), [
      "resumes_tailored",
      "applications_submitted",
      "fields_filled",
      "submitted_this_week",
    ]);
  });

  await t.test("rejects a body that is not an object at all", () => {
    rejects(() => normalizeFunnel([]), ["<envelope>"]);
    rejects(() => normalizeFunnel(null), ["<envelope>"]);
  });

  await t.test("rejects one missing counter, naming only that one", () => {
    rejects(() => normalizeFunnel({ ...FUNNEL_COUNTERS, submitted_this_week: undefined }), [
      "submitted_this_week",
    ]);
  });

  await t.test("rejects a counter that is a string, which is what a serialisation change looks like", () => {
    rejects(() => normalizeFunnel({ ...FUNNEL_COUNTERS, applications_submitted: "5" }), [
      "applications_submitted",
    ]);
  });

  await t.test("NEVER substitutes a zero for a counter it was not sent", () => {
    /* The whole reason the counters are required. A student with 5 submitted applications must
       never be shown a 0 because a different field went missing. */
    assert.throws(() => normalizeFunnel({ days: [] }));
  });

  await t.test("accepts the counters with `days` absent, and empties it", () => {
    const funnel = normalizeFunnel<{ days: unknown[]; applications_submitted: number }>(FUNNEL_COUNTERS);
    assert.deepEqual(funnel.days, []);
    assert.equal(funnel.applications_submitted, 5, "a measured counter survives untouched");
  });

  await t.test("drops only the malformed day entries, keeping the rest of the series", () => {
    const funnel = normalizeFunnel<{ days: { day: string }[] }>({
      ...FUNNEL_COUNTERS,
      days: [{ day: "d-1", submitted: 2 }, { submitted: 9 }, null, { day: "d-0", submitted: 0 }],
    });
    assert.deepEqual(funnel.days.map((d) => d.day), ["d-1", "d-0"]);
  });

  await t.test("treats an absent too_early as false rather than undefined", () => {
    const funnel = normalizeFunnel<{ too_early: boolean }>(FUNNEL_COUNTERS);
    assert.equal(funnel.too_early, false);
  });
});

test("/applications/board", async (t) => {
  await t.test("rejects the `[]` that killed the whole /dashboard/applications route", () => {
    rejects(() => normalizeBoard([], ACTIVE_BOARD_STAGES), ["<envelope>"]);
  });

  await t.test("rejects a body with no cards", () => {
    rejects(() => normalizeBoard({ stages: ["applied"] }, ACTIVE_BOARD_STAGES), ["cards"]);
  });

  await t.test("falls back to the client's own canonical stage list, in order", () => {
    /* NOT derived from the cards. activeBoardStages() filters whatever arrives through this exact
       constant, so a derived list could only ever be a subset of it: one card in `applied` would
       render the Applied column alone, hiding Interview and Offer and leaving MoveControl with a
       single option, which means the student cannot move a card forward and nothing says so. */
    const board = normalizeBoard<{ stages: string[]; cards: unknown[] }>(
      { cards: [{ id: "a", stage: "applied" }] },
      ACTIVE_BOARD_STAGES,
    );
    assert.deepEqual(board.stages, ["applied", "interview", "offer"]);
    assert.equal(board.cards.length, 1, "no card is lost to the missing field");
  });

  await t.test("gives every column even when no card is in it", () => {
    const board = normalizeBoard<{ stages: string[] }>({ cards: [] }, ACTIVE_BOARD_STAGES);
    assert.deepEqual(board.stages, [...ACTIVE_BOARD_STAGES]);
  });

  await t.test("copies the fallback rather than aliasing the shared constant", () => {
    /* A caller that sorted or spliced board.stages in place would otherwise mutate the module-level
       constant for every other reader in the app. */
    const board = normalizeBoard<{ stages: string[] }>({ cards: [] }, ACTIVE_BOARD_STAGES);
    board.stages.push("nonsense");
    assert.deepEqual([...ACTIVE_BOARD_STAGES], ["applied", "interview", "offer"]);
  });

  await t.test("prefers the sent stages over the fallback when both exist", () => {
    const board = normalizeBoard<{ stages: string[] }>(
      { stages: ["saved", "applied", "interview", "offer", "closed"], cards: [{ id: "a", stage: "applied" }] },
      ACTIVE_BOARD_STAGES,
    );
    assert.equal(board.stages.length, 5);
  });
});

test("the drift reporter", async (t) => {
  /* api_payload_incomplete is the ONLY signal that the hand-deployed backend and the
     auto-deployed frontend have drifted, so it is worth pinning rather than assuming. */
  const seen: { endpoint: string; fields: string[] }[] = [];
  t.after(() => setPartialPayloadReporter(() => {}));
  setPartialPayloadReporter((endpoint, fields) => seen.push({ endpoint, fields: [...fields] }));

  await t.test("fires once per rejection, with the endpoint and the field names", () => {
    seen.length = 0;
    assert.throws(() => normalizeResumeHealth({ findings: [] }));
    assert.deepEqual(seen, [{ endpoint: "/resume/health", fields: ["bullet_count", "quantified_count"] }]);
  });

  await t.test("carries the literal path, so no query string can ride along", () => {
    /* fetchFunnel requests `/metrics/funnel?tz_offset=NNN`. The endpoint reported here is the
       hardcoded literal, so the student's UTC offset never reaches the analytics payload. */
    seen.length = 0;
    assert.throws(() => normalizeFunnel({}));
    assert.equal(seen[0].endpoint, "/metrics/funnel");
  });

  await t.test("stays silent on an accepted response", () => {
    seen.length = 0;
    normalizeBoard({ cards: [] }, ACTIVE_BOARD_STAGES);
    assert.deepEqual(seen, []);
  });

  await t.test("a throwing reporter does not replace the error it was reporting", () => {
    setPartialPayloadReporter(() => {
      throw new Error("analytics is down");
    });
    rejects(() => normalizeFunnel({ days: [] }), [
      "resumes_tailored",
      "applications_submitted",
      "fields_filled",
      "submitted_this_week",
    ]);
  });
});

test("/resume/health", async (t) => {
  await t.test("rejects a body with no findings, the first of the three occurrences", () => {
    rejects(() => normalizeResumeHealth({ bullet_count: 8, quantified_count: 3 }), ["findings"]);
  });

  await t.test("rejects missing bullet counts rather than printing an invented denominator", () => {
    /* The panel writes "N of your M bullets have a number in them". Defaulting M to 0 would put a
       sentence about the student's resume on screen that describes no resume. */
    rejects(() => normalizeResumeHealth({ findings: [] }), ["bullet_count", "quantified_count"]);
  });

  await t.test("accepts a genuinely clean resume", () => {
    const health = normalizeResumeHealth<{ findings: unknown[] }>({
      findings: [],
      bullet_count: 8,
      quantified_count: 8,
    });
    assert.deepEqual(health.findings, []);
  });
});

test("/interview-prep", async (t) => {
  await t.test("rejects a body with no items", () => {
    rejects(() => normalizeInterviewPrep({ answered: 1, unanswered: 2 }), ["items"]);
  });

  await t.test("rejects missing answered/unanswered counts", () => {
    rejects(() => normalizeInterviewPrep({ items: [] }), ["answered", "unanswered"]);
  });

  await t.test("accepts a complete body untouched", () => {
    const prep = normalizeInterviewPrep<{ items: unknown[]; reason?: string }>({
      items: [{ term: "sql" }],
      answered: 1,
      unanswered: 0,
    });
    assert.equal(prep.items.length, 1);
    assert.equal(prep.reason, undefined, "an optional field stays absent rather than becoming a string");
  });
});

test("/jd-match/requirements", async (t) => {
  await t.test("rejects a body with no clauses", () => {
    /* "N of M met" is computed on the client from `clauses`. An empty default would print
       "0 of 0 met" under a posting full of requirements. */
    rejects(() => normalizeRequirements({ score: 61, scored: 9, met: 6 }), ["clauses"]);
  });

  await t.test("accepts clauses with `rejected` absent, and empties it", () => {
    const requirements = normalizeRequirements<{ clauses: unknown[]; rejected: unknown[] }>({
      clauses: [{ text: "3 years of SQL", verdict: "unmet" }],
    });
    assert.deepEqual(requirements.rejected, []);
    assert.equal(requirements.clauses.length, 1);
  });
});

test("/jd-match/evidence", async (t) => {
  await t.test("rejects a body with no answers", () => {
    rejects(() => normalizeGapEvidence({}), ["answers"]);
  });

  await t.test("empties a per-answer evidence list without dropping the answer", () => {
    const gaps = normalizeGapEvidence<{ answers: { term: string; evidence: unknown[] }[] }>({
      answers: [{ term: "sql", unsupported: false }, { term: "go", evidence: [{ term: "go" }] }],
    });
    assert.deepEqual(gaps.answers.map((a) => a.evidence.length), [0, 1]);
  });
});
