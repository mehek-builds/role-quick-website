import type { ApplicationReview } from "@/lib/api";

export type SubmissionChecklistItem = {
  id: string;
  label: string;
  detail?: string;
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

function addUnique(items: SubmissionChecklistItem[], item: SubmissionChecklistItem) {
  if (items.some((existing) => existing.id === item.id || existing.label === item.label)) return;
  items.push(item);
}

export function humanInputItems(review: Pick<ApplicationReview, "attention_reason" | "questions" | "status">): SubmissionChecklistItem[] {
  const items: SubmissionChecklistItem[] = [];
  for (const blocker of compactLines(review.attention_reason)) {
    addUnique(items, {
      id: `blocker-${keyFor(blocker)}`,
      label: blocker,
    });
  }

  for (const question of review.questions ?? []) {
    const answer = (question.answer ?? "").trim();
    if (question.required && !answer) {
      addUnique(items, {
        id: `missing-${question.id}`,
        label: question.question,
        detail: "Required answer missing",
      });
      continue;
    }
    if (review.status !== "submitted" && question.kind === "essay" && answer) {
      addUnique(items, {
        id: `review-${question.id}`,
        label: question.question,
        detail: "Drafted answer ready for review",
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
    addUnique(items, {
      id: `field-${keyFor(label)}`,
      label,
    });
  }

  for (const question of review.questions ?? []) {
    const answer = (question.answer ?? "").trim();
    if (!answer) continue;
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
