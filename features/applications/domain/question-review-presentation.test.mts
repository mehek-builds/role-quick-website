import test from "node:test";
import assert from "node:assert/strict";
import {
  answerWithExactOptionToggled,
  exactSelectedQuestionOptions,
  questionReviewPresentation,
  requiredQuestionReviewRoute,
} from "./question-review-presentation.ts";

const question = (overrides: Record<string, unknown> = {}) => ({
  id: "question-1",
  question: "Why this role?",
  answer: "",
  kind: "required" as const,
  required: true,
  ...overrides,
});

test("a historical closed control without exact options becomes a blocker, not a textarea", () => {
  const result = questionReviewPresentation([
    question({
      question: "Have you applied here before?",
      portal_input_type: "select-one",
      portal_selector: "#prior_application",
      options: null,
    }),
  ]);

  assert.deepEqual(result.editableQuestions, []);
  assert.deepEqual(result.metadataBlockers, [{
    kind: "missing_exact_options",
    required: true,
    portal_input_type: "select-one",
    portal_selector: "#prior_application",
    question: "Have you applied here before?",
  }]);
});

test("generic answer furniture becomes an unread-label blocker even for a textarea", () => {
  const result = questionReviewPresentation([
    question({ question: "Type your response", portal_input_type: "textarea" }),
  ]);

  assert.deepEqual(result.editableQuestions, []);
  assert.deepEqual(result.metadataBlockers, [{
    kind: "missing_question_text",
    required: true,
    portal_input_type: "textarea",
  }]);
});

test("a checkbox without exact presentation metadata never becomes free text", () => {
  const result = questionReviewPresentation([
    question({ question: "I certify that this information is accurate", portal_input_type: "checkbox" }),
  ]);

  assert.equal(result.editableQuestions.length, 0);
  assert.equal(result.metadataBlockers[0]?.kind, "missing_exact_options");
});

test("an open textarea remains editable and closed options discard blank entries", () => {
  const open = question({ id: "open", portal_input_type: "textarea" });
  const closed = question({
    id: "closed",
    question: "Are you willing to relocate?",
    portal_input_type: "radio",
    options: ["", " Yes ", "   ", "No", "Yes"],
  });
  const result = questionReviewPresentation([open, closed]);

  assert.deepEqual(result.metadataBlockers, []);
  assert.equal(result.editableQuestions[0], open);
  assert.deepEqual(result.editableQuestions[1]?.options, ["Yes", "No"]);
});

test("multi-value employer controls with exact options stay in the editor", () => {
  const result = questionReviewPresentation([
    question({
      question: "Select every location where you can work",
      portal_input_type: "select-multiple",
      portal_selector: "#locations",
      options: ["New York", "San Francisco"],
    }),
    question({
      id: "languages",
      question: "Select every language you speak",
      portal_input_type: "checkbox",
      portal_selector: "#languages",
      options: ["English", "Spanish"],
    }),
  ]);

  assert.deepEqual(result.editableQuestions.map((item) => item.id), ["question-1", "languages"]);
  assert.deepEqual(result.metadataBlockers, []);
});

test("an old unsupported blocker is suppressed only when the exact multi-value field is safe", () => {
  const stored = question({
    question: "Select every location where you can work",
    portal_input_type: "checkbox",
    portal_selector: "#locations",
    options: ["Chicago", "New York"],
  });
  const legacyBlocker = {
    kind: "unsupported_multi_value" as const,
    required: true,
    portal_input_type: "checkbox",
    portal_selector: "#locations",
    question: "Select every location where you can work",
  };

  assert.deepEqual(questionReviewPresentation([stored], [legacyBlocker]), {
    editableQuestions: [stored],
    metadataBlockers: [],
  });
  assert.deepEqual(
    questionReviewPresentation([{ ...stored, options: null }], [legacyBlocker]).metadataBlockers,
    [legacyBlocker],
    "a legacy blocker remains fail-closed when its exact employer options are absent",
  );
});

test("multi-value answers decompose against exact labels, including labels that contain commas", () => {
  const options = ["Washington, D.C.", "Chicago", "New York, NY"];

  assert.deepEqual(
    exactSelectedQuestionOptions("New York, NY, Chicago", options),
    ["New York, NY", "Chicago"],
    "a unique stored selection remains valid when its labels are not in employer order",
  );
  assert.deepEqual(
    exactSelectedQuestionOptions("Washington, D.C., New York, NY", options),
    ["Washington, D.C.", "New York, NY"],
  );
  assert.deepEqual(
    exactSelectedQuestionOptions("New York, NY, Washington, D.C.", options),
    ["New York, NY", "Washington, D.C."],
    "reversed labels containing commas are resolved as whole exact options",
  );
  assert.equal(
    answerWithExactOptionToggled("New York, NY, Washington, D.C.", options, "Chicago", true),
    "Washington, D.C., Chicago, New York, NY",
    "the next write serializes in employer order regardless of stored order",
  );
  assert.equal(
    answerWithExactOptionToggled("Washington, D.C., Chicago", options, "Washington, D.C.", false),
    "Chicago",
  );
});

test("an ambiguous or stale multi-value answer fails closed", () => {
  const ambiguousOptions = ["A", "A, B", "B"];
  assert.equal(exactSelectedQuestionOptions("A, B", ambiguousOptions), null);
  assert.equal(exactSelectedQuestionOptions("Seattle", ["Chicago", "New York"]), null);

  const result = questionReviewPresentation([
    question({
      question: "Select every location where you can work",
      answer: "A, B",
      portal_input_type: "select-multiple",
      options: ambiguousOptions,
    }),
  ]);
  assert.deepEqual(result.editableQuestions, []);
  assert.equal(result.metadataBlockers[0]?.kind, "unsupported_multi_value");
});

test("a server blocker suppresses the matching historical question without duplicating the card", () => {
  const stored = question({
    question: "What is your location preference?",
    portal_input_type: "select-one",
    portal_selector: "#location",
  });
  const blocker = {
    kind: "missing_exact_options" as const,
    required: true,
    portal_input_type: "select-one",
    portal_selector: "#location",
    question: "What is your location preference?",
  };
  const result = questionReviewPresentation([stored], [blocker]);

  assert.deepEqual(result.editableQuestions, []);
  assert.deepEqual(result.metadataBlockers, [blocker]);
});

test("required question routing gives applicant answers precedence over employer metadata refresh", () => {
  const requiredMetadata = [{
    kind: "missing_exact_options" as const,
    required: true,
    portal_input_type: "select-one",
    portal_selector: "#school",
    question: "School",
  }];
  const answered = question({ id: "notice", question: "Notice period", answer: "None" });
  const blank = question({ id: "authorization", question: "Work authorization", answer: "" });

  assert.deepEqual(
    requiredQuestionReviewRoute([blank], requiredMetadata),
    { kind: "answer", questionId: "authorization" },
    "a required applicant fact must block even when employer metadata is also unread",
  );
  assert.deepEqual(
    requiredQuestionReviewRoute([answered], requiredMetadata),
    { kind: "metadata_refresh" },
    "answered applicant facts may proceed to the scoped employer metadata read",
  );
  assert.deepEqual(
    requiredQuestionReviewRoute([answered, blank], requiredMetadata),
    { kind: "answer", questionId: "authorization" },
    "an editable blank added by a later packet audit must disable metadata refresh",
  );
  assert.deepEqual(
    requiredQuestionReviewRoute([answered], []),
    { kind: "continue" },
    "a complete packet without metadata blockers uses the ordinary continuation",
  );
});
