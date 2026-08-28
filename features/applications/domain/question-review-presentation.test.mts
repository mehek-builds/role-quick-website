import test from "node:test";
import assert from "node:assert/strict";
import {
  answerWithExactOptionToggled,
  exactQuestionOption,
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

/* The circular gate measured live on the Mytos Lever packet, 2026-08-28 (application
   55de7c9e-13c0-44fd-8f78-0dee280dbd33, packet 16f1c744-1a3c-49a5-94cb-c14e6f4356d3).
   Lever marks a required field with the Unicode heavy asterisk in the label itself, while the
   Select2 replacement control hides the native required attribute from discovery, so the stored
   flag arrives false. A blocker that then rides required:false answers "continue", the flow
   never carries the metadata_refresh intent, and the dashboard cycles between the answers screen
   and the packet review without ever offering the managed run that reads the employer's exact
   choices. The employer's own marker must outrank the unreadable stored flag. */
test("a Lever heavy-asterisk label marks a blocked combobox required and routes to metadata refresh", () => {
  const university = question({
    id: "university",
    question: "which was the most recent university you attended? ✱",
    answer: "University of Southern California",
    required: false,
    portal_input_type: "combobox",
    portal_selector: '[name="cards[62541ff1][field0]"]',
    options: null,
  });
  const result = questionReviewPresentation([university]);

  assert.deepEqual(result.editableQuestions, []);
  assert.equal(result.metadataBlockers[0]?.kind, "missing_exact_options");
  assert.equal(result.metadataBlockers[0]?.required, true, "the label's own required marker must count");
  assert.deepEqual(
    requiredQuestionReviewRoute([university]),
    { kind: "metadata_refresh" },
    "an answered but unreadable required control demands the managed re-read, never a silent continue",
  );
});

test("an ASCII asterisk marker also marks a blocked closed control required", () => {
  const result = questionReviewPresentation([
    question({
      question: "Work authorization *",
      required: false,
      portal_input_type: "select-one",
      portal_selector: "#authorization",
      options: null,
    }),
  ]);
  assert.equal(result.metadataBlockers[0]?.required, true);
});

test("a required-marker legend does not mark the control required", () => {
  const legend = question({
    id: "legend",
    question: "How did you hear about us? ✱ indicates a required field",
    answer: "Job board",
    required: false,
    portal_input_type: "select-one",
    portal_selector: "#source",
    options: null,
  });
  const result = questionReviewPresentation([legend]);

  assert.equal(result.metadataBlockers[0]?.required, false);
  assert.deepEqual(
    requiredQuestionReviewRoute([legend]),
    { kind: "continue" },
    "a legend describes the form, not this control, so an optional unread field stays non-blocking",
  );
});

test("an asterisk inside a token is not a required marker and an unmarked optional blocker stays optional", () => {
  const starredToken = question({
    id: "starred",
    question: "Rate your C*-algebra familiarity",
    answer: "Expert",
    required: false,
    portal_input_type: "select-one",
    portal_selector: "#calgebra",
    options: null,
  });
  const unmarked = question({
    id: "plain",
    question: "Preferred office",
    answer: "London",
    required: false,
    portal_input_type: "select-one",
    portal_selector: "#office",
    options: null,
  });
  const result = questionReviewPresentation([starredToken, unmarked]);

  assert.equal(result.metadataBlockers[0]?.required, false);
  assert.equal(result.metadataBlockers[1]?.required, false);
  assert.deepEqual(requiredQuestionReviewRoute([starredToken, unmarked]), { kind: "continue" });
});

test("a stored required flag still marks the blocker required without any label marker", () => {
  const result = questionReviewPresentation([
    question({
      question: "Do you require sponsorship?",
      required: true,
      portal_input_type: "select-one",
      portal_selector: "#sponsorship",
      options: null,
    }),
  ]);
  assert.equal(result.metadataBlockers[0]?.required, true);
});

/* ---- exactQuestionOption: the stored answer binds the choice it names ----
 *
 * Production shape, measured live 2026-08-28 on the Mytos Lever packet (application 55de7c9e /
 * packet 16f1c744): the required degree-classification select carries nine exact discovered
 * options, and the stored answer "GPA 3.5-3.8" was accepted and kept by the backend, which
 * matches a closed single choice under trimmed case-insensitive equivalence. Byte-strict
 * membership on the dashboard rendered that stored answer as "Choose an answer" on every visit. */

const MYTOS_DEGREE_OPTIONS = [
  "First-Class Honours",
  "Upper Second-Class Honours",
  "Lower Second-Class Honours",
  "Third-Class Honours",
  "GPA 3.8-4.0",
  "GPA 3.5-3.8",
  "GPA 3.0-3.5",
  "GPA below 3.0",
  "Other",
];

test("a stored answer that is byte-identical to an offered option binds that option", () => {
  assert.equal(exactQuestionOption("GPA 3.5-3.8", MYTOS_DEGREE_OPTIONS), "GPA 3.5-3.8");
});

test("edge whitespace on the stored answer still binds the offered label, byte for byte", () => {
  assert.equal(exactQuestionOption("GPA 3.5-3.8\n", MYTOS_DEGREE_OPTIONS), "GPA 3.5-3.8");
  assert.equal(exactQuestionOption("  GPA 3.5-3.8  ", MYTOS_DEGREE_OPTIONS), "GPA 3.5-3.8");
});

test("a case-folded stored answer binds the offered label, not its own bytes", () => {
  assert.equal(exactQuestionOption("gpa 3.5-3.8", MYTOS_DEGREE_OPTIONS), "GPA 3.5-3.8");
  assert.equal(exactQuestionOption("GPA 3.5-3.8", ["gpa 3.5-3.8", "Other"]), "gpa 3.5-3.8");
});

test("an offered list with edge whitespace resolves to the same trimmed label the editor renders", () => {
  /* usableQuestionOptions is the canonicalisation the presentation applies before rendering, so
     the value returned here is exactly the <option> string on screen. */
  assert.equal(exactQuestionOption("GPA 3.5-3.8", ["  GPA 3.5-3.8  ", "Other"]), "GPA 3.5-3.8");
});

test("the Five Rings rule is unchanged: an off-list answer names nothing", () => {
  assert.equal(exactQuestionOption("Job board", ["Coffee Chat", "Conference", "Other"]), null);
  assert.equal(exactQuestionOption("3.89/4.00 (US 4.0 scale)", MYTOS_DEGREE_OPTIONS), null);
});

test("a blank answer names nothing, so a genuinely blank required question stays fail-closed", () => {
  assert.equal(exactQuestionOption("", MYTOS_DEGREE_OPTIONS), null);
  assert.equal(exactQuestionOption("   ", MYTOS_DEGREE_OPTIONS), null);
});

test("the equivalence is exactly the fill path's: trim plus case fold, nothing looser", () => {
  /* Interior whitespace, punctuation, and different characters still refuse, mirroring the
     backend's own select match (value.trim().toLowerCase() equality). */
  assert.equal(exactQuestionOption("GPA  3.5-3.8", MYTOS_DEGREE_OPTIONS), null);
  assert.equal(exactQuestionOption("GPA 3.5 - 3.8", MYTOS_DEGREE_OPTIONS), null);
  assert.equal(exactQuestionOption("GPA 3.5-3.9", MYTOS_DEGREE_OPTIONS), null);
});

test("no offered options means no choice to bind", () => {
  assert.equal(exactQuestionOption("GPA 3.5-3.8", null), null);
  assert.equal(exactQuestionOption("GPA 3.5-3.8", undefined), null);
  assert.equal(exactQuestionOption("GPA 3.5-3.8", []), null);
});

/* ---- answer_draft never outranks a valid stored answer ----
 *
 * The backend's re-open (its PR #763) blanks an unfit closed-choice answer and preserves the
 * removed text on the display-only answer_draft field. A question that carries BOTH a valid
 * stored answer and a lingering draft must present the answer: the draft is her old words, not
 * the application's state. */

test("a valid stored answer beside a display-only draft presents the answer, and the draft changes nothing", () => {
  const reopenedThenAnswered = question({
    id: "degree-classification",
    question: "what was your degree classification? ✱",
    answer: "GPA 3.5-3.8",
    answer_draft: "3.89/4.00 (US 4.0 scale)",
    required: true,
    portal_input_type: "select-one",
    portal_selector: '[name="cards[16f1c744][field3]"]',
    options: MYTOS_DEGREE_OPTIONS,
  });
  const presentation = questionReviewPresentation([reopenedThenAnswered]);

  assert.equal(presentation.editableQuestions.length, 1);
  const editable = presentation.editableQuestions[0]!;
  assert.equal(editable.answer, "GPA 3.5-3.8", "the stored answer is untouched by the draft");
  assert.equal(
    exactQuestionOption(editable.answer, editable.options),
    "GPA 3.5-3.8",
    "the select binds the stored answer's own choice; the draft never feeds a control's value",
  );
  assert.deepEqual(
    requiredQuestionReviewRoute([reopenedThenAnswered]),
    { kind: "continue" },
    "a valid stored answer is not a blank required answer, so the save must not land back on the answers screen",
  );
});

test("a genuinely re-opened question stays fail-closed: the draft cannot satisfy the required blank", () => {
  const reopened = question({
    id: "degree-classification",
    question: "what was your degree classification? ✱",
    answer: "",
    answer_draft: "3.89/4.00 (US 4.0 scale)",
    required: true,
    portal_input_type: "select-one",
    portal_selector: '[name="cards[16f1c744][field3]"]',
    options: MYTOS_DEGREE_OPTIONS,
  });

  assert.equal(exactQuestionOption("", MYTOS_DEGREE_OPTIONS), null, "the select shows the placeholder, never the draft");
  assert.deepEqual(
    requiredQuestionReviewRoute([reopened]),
    { kind: "answer", questionId: "degree-classification" },
    "a blank required answer keeps the answers screen even while a draft is present",
  );
});
