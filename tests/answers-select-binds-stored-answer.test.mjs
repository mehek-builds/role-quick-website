import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { exactQuestionOption, questionReviewPresentation, requiredQuestionReviewRoute } from "../features/applications/domain/question-review-presentation.ts";
import { reviewedAnswersSaveLanding } from "../features/applications/domain/submission-checklist.ts";
import { packetQuestionsSnapshot } from "../features/applications/domain/packet-evidence-session.ts";

/* THE ANSWERS SCREEN MUST SHOW A STORED ANSWER AS THE CHOICE IT NAMES.
 *
 * MEASURED live, 2026-08-28, on the Mytos Lever packet (application 55de7c9e / packet 16f1c744).
 * The required question "what was your degree classification? ✱" is a closed select with nine
 * exact discovered options, and its stored answer was exactly one of them, "GPA 3.5-3.8" -
 * verified by repeated PUT /review/answers 200s and by the question flow echoing "Saved to this
 * application". The backend accepts and keeps a closed single-choice answer under trimmed
 * case-insensitive equivalence (its own fill match), so the stored bytes can differ from the
 * offered label by edge whitespace or letter case while remaining, to every server reader, that
 * exact option.
 *
 * The answers screen bound the select by byte equality, so that same stored answer rendered as
 * "Choose an answer" on every visit. Both ways out were defects:
 *   (a) re-picking the value she had already saved changed the answer bytes, which counted as an
 *       edit and voided the acknowledged exact-packet audit the metadata-refresh launch needs
 *       (the landing decision PR #442 shipped);
 *   (b) leaving it untouched showed a required question with no visible answer, so the screen
 *       read as still owing an answer that was already stored.
 * Either way the launch stayed unreachable.
 *
 * The binding now resolves through exactQuestionOption - the fill path's own equivalence - and is
 * display-only: the stored bytes are never rewritten by rendering, so an untouched Save posts the
 * exact bytes the audit was taken over and the audit survives it. */

const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

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

function mytosDegreeQuestion(answer, overrides = {}) {
  return {
    id: "degree-classification",
    question: "what was your degree classification? ✱",
    answer,
    kind: "required",
    required: true,
    portal_input_type: "select-one",
    portal_selector: '[name="cards[16f1c744][field3]"]',
    options: MYTOS_DEGREE_OPTIONS,
    ...overrides,
  };
}

function questionsScreenSource() {
  const start = page.indexOf("function QuestionsScreen(");
  const end = page.indexOf("\nfunction ", start + 1);
  assert.ok(start >= 0 && end > start, "QuestionsScreen must exist");
  return page.slice(start, end);
}

describe("the answers screen binds the stored answer to the choice it names", () => {
  test("the bulk select resolves through the fill path's equivalence, never raw bytes", () => {
    const screen = questionsScreenSource();
    assert.match(
      screen,
      /value=\{exactQuestionOption\(question\.answer, question\.options\) \?\? ""\}/,
      "the QuestionsScreen select must bind the offered label the stored answer names",
    );
    assert.doesNotMatch(
      screen,
      /<select\s[\s\S]{0,400}?value=\{question\.answer\}/,
      "binding the raw answer bytes is the defect: a value matching no option renders as unanswered",
    );
  });

  test("the bulk radio rows check the choice the stored answer names", () => {
    const screen = questionsScreenSource();
    assert.match(
      screen,
      /checked=\{exactQuestionOption\(question\.answer, question\.options\) === option\}/,
      "a short closed list must show the stored choice checked under the same equivalence",
    );
  });

  test("the production-shaped stored answer renders selected, in every byte skew the backend keeps", () => {
    const [editable] = questionReviewPresentation([mytosDegreeQuestion("GPA 3.5-3.8")]).editableQuestions;
    assert.ok(editable, "the degree classification must stay editable");
    assert.equal(exactQuestionOption(editable.answer, editable.options), "GPA 3.5-3.8");
    for (const skew of ["gpa 3.5-3.8", "GPA 3.5-3.8\n", "  GPA 3.5-3.8"]) {
      const [skewed] = questionReviewPresentation([mytosDegreeQuestion(skew)]).editableQuestions;
      assert.ok(skewed, `the ${JSON.stringify(skew)} variant must stay editable`);
      assert.equal(
        exactQuestionOption(skewed.answer, skewed.options),
        "GPA 3.5-3.8",
        `stored ${JSON.stringify(skew)} must bind the offered label instead of the placeholder`,
      );
    }
  });
});

describe("an untouched save neither edits nor blanks the stored answer", () => {
  test("rendering is display-only: the stored bytes survive presentation untouched", () => {
    const stored = mytosDegreeQuestion("GPA 3.5-3.8\n");
    const [editable] = questionReviewPresentation([stored]).editableQuestions;
    assert.equal(editable?.answer, "GPA 3.5-3.8\n", "presentation must never rewrite the answer bytes");
  });

  test("an untouched save keeps the audited packet byte-identical, so the acknowledged audit survives", () => {
    /* reconcilePacketEvidenceWithSubmission keeps evidence only while questionsSnapshot still
       byte-matches (PR #442's landing decision depends on it). The untouched save posts the exact
       stored bytes, so the snapshot equality holds; the re-pick the old binding forced changed the
       bytes and destroyed the audit for nothing. */
    const audited = [mytosDegreeQuestion("GPA 3.5-3.8")];
    const untouchedSave = [mytosDegreeQuestion("GPA 3.5-3.8")];
    assert.equal(packetQuestionsSnapshot(audited), packetQuestionsSnapshot(untouchedSave));

    const forcedRepick = [mytosDegreeQuestion("GPA 3.5-3.8")];
    const auditedSkewed = [mytosDegreeQuestion("gpa 3.5-3.8")];
    assert.notEqual(
      packetQuestionsSnapshot(auditedSkewed),
      packetQuestionsSnapshot(forcedRepick),
      "a re-pick that rewrites the bytes is a real edit and must still void the audit",
    );
  });

  test("a valid stored answer never routes the save back to the answers screen as unanswered", () => {
    const review = {
      status: "needs_attention",
      attention_reason: "Litos could not confirm one of the required answers had been accepted, so it did not press submit.",
      attention_categories: ["unknown"],
      questions: [mytosDegreeQuestion("gpa 3.5-3.8")],
    };
    assert.notDeepEqual(
      reviewedAnswersSaveLanding(review, true),
      { screen: "questions", kind: "unanswered_required" },
      "a stored answer that names an option is not a blank required answer",
    );
    assert.deepEqual(requiredQuestionReviewRoute(review.questions), { kind: "continue" });
  });

  test("a genuinely blank required answer still fails closed to the answers screen", () => {
    const review = {
      status: "needs_attention",
      attention_reason: "Litos could not confirm one of the required answers had been accepted, so it did not press submit.",
      attention_categories: ["unknown"],
      questions: [mytosDegreeQuestion("", { answer_draft: "3.89/4.00 (US 4.0 scale)" })],
    };
    assert.deepEqual(
      reviewedAnswersSaveLanding(review, true),
      { screen: "questions", kind: "unanswered_required" },
      "a re-opened question is blank even while its display-only draft is present",
    );
    assert.deepEqual(
      reviewedAnswersSaveLanding(review, false),
      { screen: "questions", kind: "unanswered_required" },
    );
  });
});

describe("answer_draft stays display-only", () => {
  test("the dashboard never reads the draft, so it can never override a stored answer", () => {
    /* The backend's re-open (its PR #763) preserves removed text on answer_draft. Its contract is
       display-only: it must never feed a control's value or stand in for `answer`. Today the page
       does not read it at all; a future use that renders it as helper copy must keep it out of
       every value binding, and updating this pin is the deliberate act that records that. */
    assert.doesNotMatch(page, /answer_draft/);
  });

  test("a draft beside a valid stored answer changes nothing the screen binds", () => {
    const withDraft = mytosDegreeQuestion("GPA 3.5-3.8", { answer_draft: "3.89/4.00 (US 4.0 scale)" });
    const [editable] = questionReviewPresentation([withDraft]).editableQuestions;
    assert.equal(editable?.answer, "GPA 3.5-3.8", "the answer wins");
    assert.equal(
      exactQuestionOption(editable.answer, editable.options),
      "GPA 3.5-3.8",
      "the select binds the stored answer's choice, not the draft",
    );
    assert.equal(exactQuestionOption("3.89/4.00 (US 4.0 scale)", editable.options), null, "the draft names no option");
  });
});
