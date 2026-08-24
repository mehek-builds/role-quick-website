import type { ApplicationQuestion, ApplicationQuestionMetadataBlocker } from "../../../lib/api.ts";

const CLOSED_QUESTION_CONTROL = /^(?:select(?:-one|-multiple)?|radio|checkbox|combobox|listbox)$/i;
const GENERIC_ANSWER_CONTROL_LABEL = /^(?:(?:please\s+)?(?:type|enter|write)(?:\s+your)?\s+)?(?:your\s+)?(?:answer|response)(?:\s+here)?[\s.:]*$/i;

export type QuestionReviewPresentation = {
  editableQuestions: ApplicationQuestion[];
  metadataBlockers: ApplicationQuestionMetadataBlocker[];
};

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
    ...(kind === "missing_exact_options" && questionLabel ? { question: questionLabel } : {}),
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
  serverBlockers.forEach(addBlocker);

  const blockedQuestionIds = new Set<string>();
  for (const question of questions) {
    if (serverBlockers.some((blocker) => blockerMatchesQuestion(blocker, question))) {
      blockedQuestionIds.add(question.id);
      continue;
    }
    if (questionLabelIsGenericAnswerControl(question.question)) {
      blockedQuestionIds.add(question.id);
      addBlocker(syntheticMetadataBlocker(question, "missing_question_text"));
      continue;
    }
    const controlType = normalizedControlType(question.portal_input_type);
    if (CLOSED_QUESTION_CONTROL.test(controlType) && usableQuestionOptions(question.options).length === 0) {
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
