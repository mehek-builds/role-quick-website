import assert from "node:assert/strict";
import test from "node:test";
import {
  allRequiredAnswered,
  answersToSave,
  askExplanation,
  kindOf,
  mayAutoAdvance,
  nextIndexAfter,
  optionLetter,
  remainingRequired,
} from "./onboarding-questions.ts";
import type { PostingPrescriptQuestion } from "./api.ts";

function q(overrides: Partial<PostingPrescriptQuestion> & { question: string }): PostingPrescriptQuestion {
  return {
    input_type: "select",
    options: ["Yes", "No"],
    required: true,
    max_length: null,
    answer: "",
    reusable: false,
    remembered: false,
    ...overrides,
  } as PostingPrescriptQuestion;
}

test("a question with the employer's options is closed; one without is open", () => {
  assert.equal(kindOf(q({ question: "GPA?", options: ["3.0 or above"] })), "closed");
  assert.equal(kindOf(q({ question: "Tell us more", options: null })), "open");
  assert.equal(kindOf(q({ question: "Tell us more", options: [] })), "open");
});

test("a closed list gets no free-text escape, which is the whole point of showing their options", () => {
  /* The largest class of stuck packets is a value that does not match the employer's vocabulary:
     3.89 typed at a control offering "3.6 or above (out of 4.0)". An Other box beside their list
     hands that bug straight back, because a value their list does not contain cannot be submitted
     however it was typed. So "closed" is the signal the UI uses to withhold free text. */
  assert.equal(kindOf(q({ question: "GPA?", options: ["Below 3.0", "3.6 or above (out of 4.0)"] })), "closed");
});

test("a self-declaration never auto-advances, even though it is a closed list", () => {
  /* selfDeclaration.ts defines one as a statement the applicant makes about herself, and records
     three times a machine generated one and shipped a false statement to an employer, including a
     binding season-long commitment. A 320ms advance turns that into a swipe. */
  const sponsorship = q({
    question: "Will you now or in the future require sponsorship?",
    options: ["Yes", "No"],
    reason: "self_declaration",
  });
  assert.equal(kindOf(sponsorship), "closed");
  assert.equal(mayAutoAdvance(sponsorship), false);
});

test("an ordinary closed question does auto-advance, which is what makes the screen short", () => {
  assert.equal(mayAutoAdvance(q({ question: "GPA?", reason: "choice_for_you" })), true);
});

test("an open question never auto-advances, because the student is still typing", () => {
  assert.equal(mayAutoAdvance(q({ question: "Why us?", options: null, reason: "needs_your_words" })), false);
});

test("auto-advance stops at the last question rather than advancing into nothing", () => {
  const questions = [q({ question: "one" }), q({ question: "two" })];
  assert.equal(nextIndexAfter(questions, 0), 1);
  assert.equal(nextIndexAfter(questions, 1), null);
});

test("a question that may not auto-advance holds position", () => {
  const questions = [q({ question: "declare", reason: "self_declaration" }), q({ question: "two" })];
  assert.equal(nextIndexAfter(questions, 0), null);
});

test("letters run A, B, C and keep counting past Z instead of repeating", () => {
  assert.equal(optionLetter(0), "A");
  assert.equal(optionLetter(25), "Z");
  assert.equal(optionLetter(26), "AA");
  // A silently repeated letter is worse than a long one: two options would share a shortcut.
  assert.notEqual(optionLetter(26), optionLetter(0));
});

test("only required questions gate the button", () => {
  /* An optional question left blank is a complete answer to an optional question. Treating it as
     unfinished makes the screen refuse to end for someone who has genuinely finished. */
  const questions = [
    q({ question: "required one", required: true }),
    q({ question: "optional one", required: false }),
  ];
  assert.equal(allRequiredAnswered(questions, {}), false);
  assert.equal(allRequiredAnswered(questions, { "required one": "Yes" }), true);
  assert.equal(remainingRequired(questions, { "required one": "Yes" }), 0);
  assert.equal(remainingRequired(questions, {}), 1);
});

test("whitespace is not an answer", () => {
  assert.equal(allRequiredAnswered([q({ question: "a" })], { a: "   " }), false);
});

test("blanks are never written, because a stored blank is a claim rather than an absence", () => {
  const questions = [
    q({ question: "answered", required: true }),
    q({ question: "left blank", required: false }),
  ];
  const saved = answersToSave(questions, { answered: " Yes ", "left blank": "  " });
  assert.deepEqual(saved, [{ question: "answered", answer: "Yes" }]);
});

test("the server's own explanation is used verbatim, or nothing is shown", () => {
  // The same sentence has to describe the same refusal here, in the apply flow, and in the
  // submission runner, or the product describes one situation in three voices.
  assert.equal(askExplanation({ explanation: "the employer requires this" }), "the employer requires this");
  assert.equal(askExplanation({ explanation: "  " }), null);
  assert.equal(askExplanation({}), null);
});
