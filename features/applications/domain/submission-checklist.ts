import type { ApplicationReview } from "@/lib/api";

export type SubmissionChecklistItem = {
  id: string;
  label: string;
  detail?: string;
  action?: string;
};

function compactLines(value: string | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function keyFor(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function displayField(field: string): string {
  const label = field.startsWith("question:") ? field.slice("question:".length).trim() : field;
  return label.replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

function normalizedChecklistText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/\brequired field is required\b/g, "")
    .replace(/\bneeds your review\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blockerDuplicatesQuestion(blocker: string, questions: readonly { question: string }[] | undefined): boolean {
  const normalizedBlocker = normalizedChecklistText(blocker);
  return (questions ?? []).some((question) => {
    const normalizedQuestion = normalizedChecklistText(question.question);
    return normalizedQuestion.length > 10 && normalizedBlocker.includes(normalizedQuestion);
  });
}

function isHumanOnlyChecklistLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  if (/captcha|recaptcha|hcaptcha/.test(normalized)) return true;
  if (/privacy|privacy policy|privacy notice|candidate-privacy|consent|recording|brighthire/.test(normalized)) return true;
  if (/salary|compensation|pay expectation|expected pay|annualized total compensation/.test(normalized)) return true;
  if (/(immigration support|legally authorized|work authorization|authorized to work|require sponsorship|visa sponsorship)/.test(normalized)) {
    return !/(u\.s\.|us\b|united states|usa\b)/.test(normalized);
  }
  return false;
}

function addUnique(items: SubmissionChecklistItem[], item: SubmissionChecklistItem) {
  if (items.some((existing) => existing.id === item.id || existing.label === item.label)) return;
  items.push(item);
}

export function humanInputItems(review: Pick<ApplicationReview, "attention_reason" | "questions" | "status">): SubmissionChecklistItem[] {
  const items: SubmissionChecklistItem[] = [];
  for (const blocker of compactLines(review.attention_reason)) {
    if (blockerDuplicatesQuestion(blocker, review.questions)) continue;
    addUnique(items, {
      id: `blocker-${keyFor(blocker)}`,
      label: blocker,
      action: "Finish on company page",
    });
  }

  for (const question of review.questions ?? []) {
    const answer = (question.answer ?? "").trim();
    if (question.required && !answer) {
      addUnique(items, {
        id: `missing-${question.id}`,
        label: question.question,
        detail: "Required answer missing",
        action: "Add answer",
      });
      continue;
    }
    if (review.status !== "submitted" && question.kind === "essay" && answer) {
      addUnique(items, {
        id: `review-${question.id}`,
        label: question.question,
        detail: "Drafted answer ready for review",
        action: "Review draft",
      });
      continue;
    }
    if (review.status !== "submitted" && answer && isHumanOnlyChecklistLabel(question.question)) {
      addUnique(items, {
        id: `confirm-${question.id}`,
        label: question.question,
        detail: "Needs your confirmation",
        action: "Confirm",
      });
    }
  }

  return items;
}

export function completedSubmissionItems(review: Pick<ApplicationReview, "filled_fields" | "questions" | "receipt" | "status">): SubmissionChecklistItem[] {
  const items: SubmissionChecklistItem[] = [];
  for (const field of review.filled_fields ?? []) {
    const label = displayField(field);
    if (!label) continue;
    if (isHumanOnlyChecklistLabel(label)) continue;
    addUnique(items, {
      id: `field-${keyFor(label)}`,
      label,
    });
  }

  for (const question of review.questions ?? []) {
    const answer = (question.answer ?? "").trim();
    if (!answer) continue;
    if (question.kind === "essay" && review.status !== "submitted") continue;
    if (isHumanOnlyChecklistLabel(question.question)) continue;
    addUnique(items, {
      id: `answer-${question.id}`,
      label: question.question,
      detail: question.kind === "essay" ? "Answer drafted" : "Answer filled",
    });
  }

  if (review.receipt || review.status === "submitted") {
    addUnique(items, {
      id: "company-confirmation",
      label: "Company confirmation received",
    });
  }

  return items;
}
