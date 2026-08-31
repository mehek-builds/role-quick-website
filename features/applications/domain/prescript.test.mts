import test from "node:test";
import assert from "node:assert/strict";
import {
  prescriptBlocksProgress,
  prescriptEditableQuestions,
  prescriptMetadataBlockers,
  prescriptNeedsHer,
  prescriptQuestionId,
  prescriptSummary,
} from "./prescript.ts";

/* The four questions below are verbatim from the production run of 2026-08-08, which stalled 21 of
 * 25 applications. Each is the shape this screen exists to catch before a browser ever opens. */
const prescript = {
  discovery_status: "ok" as const,
  metadata_blockers: [],
  ask: [
    {
      question: "Astranis complies with U.S. Government space technology export regulations, including the International Traffic in Arms Regulations (ITAR). Are you a U.S. person as defined by these regulations?",
      input_type: "select",
      options: ["Yes", "No"],
      required: true,
      max_length: null,
      answer: "",
      reusable: true,
      remembered: false,
      reason: "self_declaration" as const,
      explanation: 'this one is a declaration about you, so Litos will not write it: "Astranis complies with U.S. Governm"',
    },
    {
      question: "Please rate your skill level in C++",
      input_type: "select",
      options: ["Beginner", "Intermediate", "Advanced", "Expert"],
      required: true,
      max_length: null,
      answer: "Advanced",
      reusable: true,
      remembered: true,
      reason: undefined,
      explanation: undefined,
    },
    {
      question: "Based on the team descriptions above, which opening would you be most interested in contributing to?",
      input_type: "textarea",
      options: null,
      required: true,
      max_length: 500,
      answer: "",
      reusable: false,
      remembered: false,
      reason: "needs_your_words" as const,
      explanation: "an open question this employer wants in your own words",
    },
  ],
  already_answered: 12,
};

test("the ask list becomes rows the existing answers editor can render", () => {
  const rows = prescriptEditableQuestions(prescript);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.required), [true, true, true]);
  // Nothing here was drafted, so nothing here is an essay. "essay" is the marker for a draft she is
  // reviewing, and using it for a blank box would tell the review screen there is a draft to check.
  assert.deepEqual([...new Set(rows.map((row) => row.kind))], ["required"]);
  assert.deepEqual(rows[0].options, ["Yes", "No"]);
  assert.equal(rows[0].portal_input_type, "select");
  assert.equal(rows[2].portal_input_type, "textarea");
  assert.equal(rows[2].options, null);
});

test("a pre-script multi-select retains its employer control type", () => {
  const rows = prescriptEditableQuestions({
    ask: [{
      ...prescript.ask[0],
      question: "Which other offices would you consider?",
      input_type: "select-multiple",
      options: ["Chicago", "New York"],
    }],
    already_answered: 0,
  });

  assert.equal(rows[0]?.portal_input_type, "select-multiple");
  assert.deepEqual(rows[0]?.options, ["Chicago", "New York"]);
});

test("a declaration arrives blank and an answer she already gave arrives filled", () => {
  const rows = prescriptEditableQuestions(prescript);
  assert.equal(rows[0].answer, "", "an export-control declaration is never prefilled");
  assert.equal(rows[0].remembered, false);
  assert.equal(rows[1].answer, "Advanced");
  assert.equal(rows[1].remembered, true, "she is told when an answer came from an earlier posting");
});

test("every row that Litos declined carries the reason, in the backend's words", () => {
  const rows = prescriptEditableQuestions(prescript);
  assert.match(rows[0].explanation ?? "", /declaration about you/);
  assert.match(rows[2].explanation ?? "", /your own words/);
});

test("the id is derived from the question, so resolving twice does not split a row", () => {
  const label = "Please rate your skill level in C++";
  assert.equal(prescriptQuestionId(label), prescriptQuestionId(label));
  assert.notEqual(prescriptQuestionId(label), prescriptQuestionId("Please rate your skill level in Python"));
  const twice = prescriptEditableQuestions({ ask: [prescript.ask[0], prescript.ask[0]], already_answered: 0 });
  assert.equal(twice.length, 1, "the same question asked twice is one row");
});

test("the summary counts what Litos handled as well as what is left", () => {
  assert.match(prescriptSummary(prescript), /12 answers/);
  assert.match(prescriptSummary(prescript), /3 questions only you can answer/);
  assert.match(
    prescriptSummary({ ask: [prescript.ask[0]], already_answered: 1 }),
    /one answer[\s\S]*one question only you can answer/,
  );
  assert.match(prescriptSummary({ ask: [prescript.ask[0]], already_answered: 0 }), /^This form asks one question/);
});

test("nothing to ask means nothing happens", () => {
  assert.equal(prescriptNeedsHer({ discovery_status: "ok", metadata_blockers: [], ask: [], already_answered: 40 }), false);
  assert.equal(prescriptNeedsHer(null), false);
  assert.equal(prescriptNeedsHer(undefined), false);
  assert.equal(prescriptSummary({ ask: [], already_answered: 40 }), "");
  assert.deepEqual(prescriptEditableQuestions(null), []);
  assert.equal(prescriptNeedsHer(prescript), true);
});

test("a response without a discovery result fails closed", () => {
  assert.equal(prescriptBlocksProgress({ ask: [], already_answered: 0 }), true);
  assert.equal(prescriptNeedsHer({ ask: [], already_answered: 0 }), true);
});

test("metadata-incomplete lookahead blocks Apply even when no answer is currently visible", () => {
  const blocker = {
    kind: "missing_exact_options" as const,
    required: true,
    portal_input_type: "select-multiple",
    portal_selector: "#locations",
    question: "Select every location where you can work",
  };
  const incomplete = {
    discovery_status: "metadata_incomplete" as const,
    metadata_blockers: [blocker],
    ask: [],
    already_answered: 4,
  };

  assert.equal(prescriptBlocksProgress(incomplete), true);
  assert.equal(prescriptNeedsHer(incomplete), true);
  assert.deepEqual(prescriptMetadataBlockers(incomplete), [blocker]);
});

test("a failed or unreached lookahead blocks Apply instead of becoming an empty question list", () => {
  for (const discovery_status of ["failed", "form_not_reached"] as const) {
    const failed = { discovery_status, metadata_blockers: [], ask: [], already_answered: 0 };
    assert.equal(prescriptBlocksProgress(failed), true);
    assert.equal(prescriptNeedsHer(failed), true);
  }
  assert.equal(prescriptBlocksProgress({
    discovery_status: "ok",
    metadata_blockers: [],
    ask: [],
    already_answered: 2,
  }), false);
});
