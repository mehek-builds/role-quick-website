import test from "node:test";
import assert from "node:assert/strict";
import { prescriptReadNothing } from "./prescript.ts";

/* THE ONBOARDING BUILD PROCEEDS AND ASKS; it only dead-ends when the scan read NOTHING.
 *
 * Blocking the whole build on any imperfect employer-form read was the wrong behavior (Mehek,
 * 2026-09-01): a scan that DID read the questions but could not verify every option is exactly what
 * the follow-up questions screen is for, so the build should go there and ask in the same boxes the
 * dashboard uses. Only a run the provider never completed, with no questions read and none to ask,
 * genuinely cannot continue. These cases pin that boundary.
 */

test("a metadata_incomplete scan that read questions PROCEEDS (asks in boxes, does not block)", () => {
  assert.equal(
    prescriptReadNothing({
      discovery_status: "metadata_incomplete",
      question_count: 14,
      ask: [],
      already_answered: 3,
      metadata_blockers: [
        { kind: "missing_exact_options", required: true, portal_input_type: "select", question: "Degree" },
      ],
    }),
    false,
    "a scan that read 14 questions must not dead-end just because some options need a fresh read",
  );
});

test("an ok scan with zero extra questions PROCEEDS straight to review", () => {
  assert.equal(
    prescriptReadNothing({ discovery_status: "ok", question_count: 0, ask: [], already_answered: 0 }),
    false,
    "a form that asks nothing extra is not a failed read",
  );
});

test("a failed scan that read nothing BLOCKS (Rise8: the provider never completed the run)", () => {
  assert.equal(
    prescriptReadNothing({ discovery_status: "failed", question_count: 0, ask: [], already_answered: 0, metadata_blockers: [] }),
    true,
    "with no questions counted and none to ask, there is nothing to ask and nothing safe to submit",
  );
});

test("a form_not_reached scan with an ask still PROCEEDS, because there is something to ask", () => {
  assert.equal(
    prescriptReadNothing({
      discovery_status: "form_not_reached",
      question_count: 0,
      ask: [{ question: "Sponsorship?", input_type: "select", options: ["Yes", "No"], required: true, max_length: null, answer: "", reusable: false, remembered: false }],
      already_answered: 0,
    }),
    false,
    "a discovered answerable question is enough to proceed even when the status is not ok",
  );
});

test("a null or absent prescript BLOCKS", () => {
  assert.equal(prescriptReadNothing(null), true);
  assert.equal(prescriptReadNothing(undefined), true);
});
