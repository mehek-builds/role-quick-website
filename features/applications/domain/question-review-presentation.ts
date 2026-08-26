import type { ApplicationQuestion, ApplicationQuestionMetadataBlocker } from "../../../lib/api.ts";

const CLOSED_QUESTION_CONTROL = /^(?:select(?:-one|-multiple)?|radio|checkbox|combobox|listbox)$/i;
const GENERIC_ANSWER_CONTROL_LABEL = /^(?:(?:please\s+)?(?:type|enter|write)(?:\s+your)?\s+)?(?:your\s+)?(?:answer|response)(?:\s+here)?[\s.:]*$/i;

export type QuestionReviewPresentation = {
  editableQuestions: ApplicationQuestion[];
  metadataBlockers: ApplicationQuestionMetadataBlocker[];
};

export type RequiredQuestionReviewRoute =
  | { kind: "answer"; questionId: string }
  | { kind: "metadata_refresh" }
  | { kind: "continue" };

function normalizedControlType(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function usableQuestionOptions(options: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const usable: string[] = [];
  for (const option of options ?? []) {
    const trimmed = option.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    usable.push(trimmed);
  }
  return usable;
}

export function questionAcceptsMultipleOptions(
  question: Pick<ApplicationQuestion, "portal_input_type" | "options">,
): boolean {
  const controlType = normalizedControlType(question.portal_input_type);
  const options = usableQuestionOptions(question.options);
  return controlType === "select-multiple" || (controlType === "checkbox" && options.length > 1);
}

function normalizedChoiceOption(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim().toLowerCase();
}

/**
 * Reads a stored multi-value answer without splitting on commas.
 *
 * Employer labels can contain commas themselves, so `answer.split(",")` can silently turn one
 * exact option into two invented answers. The stored contract is still one string containing exact
 * employer labels joined with `, `. Older reviews can carry those labels in a different selection
 * order, so this mirrors the backend: it walks only complete offered-label prefixes, without
 * reusing an option, and accepts exactly one decomposition. Ambiguous or stale values return null
 * and stay out of the editor. The toggle writer below separately restores employer order.
 */
export function exactSelectedQuestionOptions(
  answer: string,
  options: readonly string[] | null | undefined,
): string[] | null {
  const target = normalizedChoiceOption(answer);
  if (!target) return [];
  const unique = new Map<string, string>();
  for (const option of usableQuestionOptions(options)) {
    const normalized = normalizedChoiceOption(option);
    if (normalized && !unique.has(normalized)) unique.set(normalized, option);
  }
  if (unique.size === 0) return null;

  const offered = [...unique].map(([normalized, canonical]) => ({ normalized, canonical }));
  const solutions: string[][] = [];
  const visit = (remaining: string, selected: string[], used: Set<string>) => {
    if (solutions.length > 1) return;
    for (const option of offered) {
      if (used.has(option.normalized)) continue;
      if (remaining === option.normalized) {
        solutions.push([...selected, option.canonical]);
        continue;
      }
      const prefix = `${option.normalized}, `;
      if (!remaining.startsWith(prefix)) continue;
      visit(
        remaining.slice(prefix.length),
        [...selected, option.canonical],
        new Set([...used, option.normalized]),
      );
    }
  };
  visit(target, [], new Set());
  return solutions.length === 1 ? solutions[0] : null;
}

export function answerWithExactOptionToggled(
  answer: string,
  options: readonly string[] | null | undefined,
  option: string,
  checked: boolean,
): string | null {
  const exactOptions = usableQuestionOptions(options);
  if (!exactOptions.includes(option)) return null;
  const selected = exactSelectedQuestionOptions(answer, exactOptions);
  if (selected === null) return null;
  const next = new Set(selected);
  if (checked) next.add(option);
  else next.delete(option);
  return exactOptions.filter((candidate) => next.has(candidate)).join(", ");
}

function normalizedQuestionLabel(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function questionLabelIsGenericAnswerControl(value: string | undefined): boolean {
  return GENERIC_ANSWER_CONTROL_LABEL.test(normalizedQuestionLabel(value));
}

function blockerMatchesQuestion(
  blocker: ApplicationQuestionMetadataBlocker,
  question: ApplicationQuestion,
): boolean {
  const questionSelector = question.portal_selector?.trim();
  const blockerSelector = blocker.portal_selector?.trim();
  if (questionSelector && blockerSelector) return questionSelector === blockerSelector;

  const blockerQuestion = normalizedQuestionLabel(blocker.question).toLowerCase();
  const questionLabel = normalizedQuestionLabel(question.question).toLowerCase();
  if (!blockerQuestion || blockerQuestion !== questionLabel) return false;

  const blockerType = normalizedControlType(blocker.portal_input_type);
  const questionType = normalizedControlType(question.portal_input_type);
  return !blockerType || !questionType || blockerType === questionType;
}

function blockerIdentity(blocker: ApplicationQuestionMetadataBlocker): string {
  const selector = blocker.portal_selector?.trim();
  if (selector) return `selector\u0000${selector}`;
  const controlId = blocker.control_id?.trim();
  if (controlId) return `control\u0000${controlId}`;
  return [
    "question",
    normalizedQuestionLabel(blocker.question).toLowerCase(),
    normalizedControlType(blocker.portal_input_type),
    blocker.kind,
  ].join("\u0000");
}

function syntheticMetadataBlocker(
  question: ApplicationQuestion,
  kind: ApplicationQuestionMetadataBlocker["kind"],
): ApplicationQuestionMetadataBlocker {
  const questionLabel = normalizedQuestionLabel(question.question);
  return {
    kind,
    required: question.required,
    portal_input_type: normalizedControlType(question.portal_input_type) || "unknown",
    ...(question.portal_selector?.trim() ? { portal_selector: question.portal_selector.trim() } : {}),
    ...(kind !== "missing_question_text" && questionLabel ? { question: questionLabel } : {}),
  };
}

/**
 * Turns stored employer questions into the controls the applicant can safely edit.
 *
 * Historical runs can predate question_metadata_blockers while still carrying each control's
 * portal_input_type. A select or radio without its live option inventory must not fall through to
 * the textarea branch. The same applies to generic browser furniture such as "Type your response":
 * it is evidence that the employer's label was not read, not a question the applicant can answer.
 */
export function questionReviewPresentation(
  questions: readonly ApplicationQuestion[],
  serverBlockers: readonly ApplicationQuestionMetadataBlocker[] = [],
): QuestionReviewPresentation {
  const metadataBlockers: ApplicationQuestionMetadataBlocker[] = [];
  const blockerIdentities = new Set<string>();
  const addBlocker = (blocker: ApplicationQuestionMetadataBlocker) => {
    const identity = blockerIdentity(blocker);
    if (blockerIdentities.has(identity)) return;
    blockerIdentities.add(identity);
    metadataBlockers.push(blocker);
  };
  const effectiveServerBlockers = serverBlockers.filter((blocker) => {
    if (blocker.kind !== "unsupported_multi_value") return true;
    const matchingQuestion = questions.find((question) => blockerMatchesQuestion(blocker, question));
    return !matchingQuestion
      || !questionAcceptsMultipleOptions(matchingQuestion)
      || exactSelectedQuestionOptions(matchingQuestion.answer, matchingQuestion.options) === null;
  });
  effectiveServerBlockers.forEach(addBlocker);
  const questionIdCounts = new Map<string, number>();
  for (const question of questions) {
    const id = question.id.trim();
    questionIdCounts.set(id, (questionIdCounts.get(id) ?? 0) + 1);
  }

  const blockedQuestionIds = new Set<string>();
  for (const question of questions) {
    if (effectiveServerBlockers.some((blocker) => blockerMatchesQuestion(blocker, question))) {
      blockedQuestionIds.add(question.id);
      continue;
    }
    if (!normalizedQuestionLabel(question.question)) {
      blockedQuestionIds.add(question.id);
      addBlocker(syntheticMetadataBlocker(question, "missing_question_text"));
      continue;
    }
    const questionId = question.id.trim();
    if (!questionId || questionIdCounts.get(questionId) !== 1) {
      blockedQuestionIds.add(question.id);
      addBlocker(syntheticMetadataBlocker(question, "ambiguous_question_identity"));
      continue;
    }
    if (questionLabelIsGenericAnswerControl(question.question)) {
      blockedQuestionIds.add(question.id);
      addBlocker(syntheticMetadataBlocker(question, "missing_question_text"));
      continue;
    }
    const controlType = normalizedControlType(question.portal_input_type);
    const options = usableQuestionOptions(question.options);
    if (questionAcceptsMultipleOptions(question)) {
      if (options.length === 0) {
        blockedQuestionIds.add(question.id);
        addBlocker(syntheticMetadataBlocker(question, "missing_exact_options"));
      } else if (exactSelectedQuestionOptions(question.answer, options) === null) {
        blockedQuestionIds.add(question.id);
        addBlocker(syntheticMetadataBlocker(question, "unsupported_multi_value"));
      }
      continue;
    }
    if (CLOSED_QUESTION_CONTROL.test(controlType) && options.length === 0) {
      blockedQuestionIds.add(question.id);
      addBlocker(syntheticMetadataBlocker(question, "missing_exact_options"));
    }
  }

  const editableQuestions = questions.flatMap((question) => {
    if (blockedQuestionIds.has(question.id)) return [];
    const options = usableQuestionOptions(question.options);
    if (options.length === 0) {
      return question.options == null ? [question] : [{ ...question, options: null }];
    }
    if (question.options?.length === options.length
      && question.options.every((option, index) => option === options[index])) return [question];
    return [{ ...question, options }];
  });

  return { editableQuestions, metadataBlockers };
}

export function requiredQuestionReviewRoute(
  questions: readonly ApplicationQuestion[],
  serverBlockers: readonly ApplicationQuestionMetadataBlocker[] = [],
): RequiredQuestionReviewRoute {
  const presentation = questionReviewPresentation(questions, serverBlockers);
  const firstMissing = presentation.editableQuestions.find(
    (question) => question.required && !question.answer.trim(),
  );
  if (firstMissing) return { kind: "answer", questionId: firstMissing.id };
  if (presentation.metadataBlockers.some((blocker) => blocker.required)) {
    return { kind: "metadata_refresh" };
  }
  return { kind: "continue" };
}
