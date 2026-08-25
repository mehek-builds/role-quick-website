import test from "node:test";
import assert from "node:assert/strict";
import { questionReviewPresentation, requiredQuestionReviewRoute } from "./question-review-presentation.ts";

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

test("multi-value employer controls stay out of the single-answer editor", () => {
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

  assert.deepEqual(result.editableQuestions, []);
  assert.deepEqual(result.metadataBlockers.map((blocker) => blocker.kind), [
    "unsupported_multi_value",
    "unsupported_multi_value",
  ]);
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
