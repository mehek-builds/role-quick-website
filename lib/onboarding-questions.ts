import type { PostingPrescriptQuestion } from "./api";

/* 05 WHAT THE JOB ASKS: the rules behind the one-at-a-time question card.
 *
 * The interaction is the approval-card pattern: one question on screen, lettered options, a step
 * badge, and an auto-advance that makes three questions three taps. What is in here is the part
 * that must not be decided by the component, because two of these rules are correctness rules
 * rather than presentation ones.
 *
 * RULE 1: A CLOSED LIST GETS NO FREE-TEXT ESCAPE.
 * The largest class of stuck packets on the live queue is a value Litos holds that does not match
 * the vocabulary of a list the employer wrote: `3.89` typed at a control offering
 * "3.6 or above (out of 4.0)", `May 2028` at one offering bands. Rendering the employer's own
 * options is the fix. Adding an "Other" box beside them would hand that bug straight back, because
 * a value the employer's list does not contain cannot be submitted no matter how it was typed. So
 * free text appears only where the question is genuinely open.
 *
 * RULE 2: A SELF-DECLARATION NEVER AUTO-ADVANCES.
 * lib/selfDeclaration.ts on the backend defines one as a statement the applicant makes about
 * herself: legal status, record, intentions, agreement to a term. Its header records three times a
 * machine generated one and shipped a false statement to an employer, including a binding
 * season-long commitment. A 320ms auto-advance turns that class of answer into a swipe, so those
 * questions wait for a deliberate press even though every other question does not.
 */

export type QuestionKind = "closed" | "open";

/** Whether this question offers the employer's own list, or wants the applicant's words. */
export function kindOf(question: Pick<PostingPrescriptQuestion, "options">): QuestionKind {
  return Array.isArray(question.options) && question.options.length > 0 ? "closed" : "open";
}

/**
 * Whether picking an answer may slide straight to the next question.
 *
 * True for ordinary questions, because that is what makes the screen short. False for a
 * self-declaration, and false for an open question, where the student is still typing and an
 * advance would move the screen out from under them mid-word.
 */
export function mayAutoAdvance(question: Pick<PostingPrescriptQuestion, "options" | "reason">): boolean {
  if (question.reason === "self_declaration") return false;
  return kindOf(question) === "closed";
}

/** A, B, C... for the options of one question. Past Z it keeps counting rather than wrapping,
 *  because a silently repeated letter is worse than a long one. */
export function optionLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export type AnswerMap = Record<string, string>;

/** The key an answer is stored under. The employer's own label, which is unique within a posting
 *  and is also what the write path keys on, so no separate id has to be invented or kept in step. */
export function answerKey(question: Pick<PostingPrescriptQuestion, "question">): string {
  return question.question;
}

/**
 * Whether every question that must be answered has been.
 *
 * Only REQUIRED questions gate the button. An optional question left blank is a complete answer to
 * an optional question, and treating it as unfinished would make the screen refuse to end for
 * someone who has genuinely finished with it.
 */
export function allRequiredAnswered(
  questions: readonly PostingPrescriptQuestion[],
  answers: AnswerMap,
): boolean {
  return questions
    .filter((question) => question.required)
    .every((question) => (answers[answerKey(question)] ?? "").trim().length > 0);
}

/** How many still need an answer, for the progress badge. Required only, same reasoning. */
export function remainingRequired(
  questions: readonly PostingPrescriptQuestion[],
  answers: AnswerMap,
): number {
  return questions
    .filter((question) => question.required)
    .filter((question) => (answers[answerKey(question)] ?? "").trim().length === 0)
    .length;
}

/**
 * The index to move to after answering `from`, or null to stay put.
 *
 * Stays put on the last question so the screen never advances into nothing, and stays put whenever
 * the question just answered is one that may not auto-advance. The caller still moves manually
 * through the step arrows in both cases.
 */
export function nextIndexAfter(
  questions: readonly PostingPrescriptQuestion[],
  from: number,
): number | null {
  const question = questions[from];
  if (!question || !mayAutoAdvance(question)) return null;
  return from < questions.length - 1 ? from + 1 : null;
}

/**
 * The answers to send, dropping blanks.
 *
 * A blank is an unanswered optional question and must not be written: sending an empty string
 * would store "" as the applicant's answer, and a stored blank reads as a declaration that the
 * answer is nothing rather than as an absence. The submission runner treats those differently.
 */
export function answersToSave(
  questions: readonly PostingPrescriptQuestion[],
  answers: AnswerMap,
  options: { includeBlank?: boolean } = {},
): { question: string; answer: string }[] {
  const values = questions
    .map((question) => ({ question: question.question, answer: (answers[answerKey(question)] ?? "").trim() }));
  return options.includeBlank ? values : values.filter((entry) => entry.answer.length > 0);
}

/**
 * The one-line reason this question reached the student, ready to print.
 *
 * The server already composes an `explanation` for every ask, and it is used verbatim rather than
 * being re-worded here: the same sentence has to describe the same refusal on this screen, in the
 * dashboard's apply flow, and in the submission runner's attention reasons, or the product
 * describes one situation in three voices.
 */
export function askExplanation(question: Pick<PostingPrescriptQuestion, "explanation">): string | null {
  const text = question.explanation?.trim();
  return text ? text : null;
}
