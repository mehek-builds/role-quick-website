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
  if (/^question(?:\s*text)?[:_]/i.test(field)) return "";
  const label = field.startsWith("question:") ? field.slice("question:".length).trim() : field;
  const display = label.replaceAll("_", " ").replace(/\s+/g, " ").trim();
  return display ? display.charAt(0).toUpperCase() + display.slice(1) : "";
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

function isCaptchaChecklistText(value: string): boolean {
  return /captcha|recaptcha|hcaptcha|prove you are human/i.test(value);
}

function blockerDuplicatesQuestion(blocker: string, questions: readonly { question: string }[] | undefined): boolean {
  const normalizedBlocker = normalizedChecklistText(blocker);
  if (normalizedBlocker.startsWith("ai drafted answer")) return true;
  if (normalizedBlocker.startsWith("open ended question left for you")) return true;
  if (normalizedBlocker.startsWith("work eligibility question left for you")) return true;
  return (questions ?? []).some((question) => {
    const normalizedQuestion = normalizedChecklistText(question.question);
    return normalizedQuestion.length > 10 && normalizedBlocker.includes(normalizedQuestion);
  });
}

function fieldEvidenceAlreadyCoversBlocker(
  blocker: string,
  filledFields: readonly string[] | undefined,
  questions: readonly { question: string; answer?: string }[] | undefined,
): boolean {
  const normalizedBlocker = normalizedChecklistText(blocker);
  const evidence = [
    ...(filledFields ?? []),
    ...(questions ?? [])
      .filter((question) => (question.answer ?? "").trim())
      .map((question) => question.question),
  ].map(normalizedChecklistText);
  const hasEvidence = (pattern: RegExp) => evidence.some((item) => pattern.test(item));

  if (/\bdiscipline\b|field of study|degree subject|major\b/.test(normalizedBlocker)) {
    return hasEvidence(/\bdiscipline\b|field of study|degree subject|major\b/);
  }
  if (/graduation year|expected graduation year|graduate year|grad year|end year/.test(normalizedBlocker)) {
    return hasEvidence(/graduation year|expected graduation year|grad year|end year|education end year/);
  }
  if (/graduation month|expected graduation month|end month/.test(normalizedBlocker)) {
    return hasEvidence(/graduation month|expected graduation month|end month|education end month/);
  }
  if (/graduation date|expected graduation date|graduate date/.test(normalizedBlocker)) {
    return hasEvidence(/graduation date|expected graduation date|grad date|education end/);
  }
  if (/\bgpa\b|grade point average/.test(normalizedBlocker)) {
    return hasEvidence(/\bgpa\b|grade point average/);
  }
  if (/university|school|college|institution/.test(normalizedBlocker)) {
    return hasEvidence(/university|school|college|institution/);
  }
  if (/\bdegree\b|education level/.test(normalizedBlocker)) {
    return hasEvidence(/\bdegree\b|education level/);
  }
  return false;
}

function isHumanOnlyChecklistLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  if (isCaptchaChecklistText(normalized)) return true;
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

export function humanInputItems(review: Pick<ApplicationReview, "attention_reason" | "attention_categories" | "filled_fields" | "questions" | "stall" | "status">): SubmissionChecklistItem[] {
  const items: SubmissionChecklistItem[] = [];
  const blockers = compactLines(review.attention_reason);
  const captchaBlockers = blockers.filter(isCaptchaChecklistText);
  const captchaOnly = captchaBlockers.length > 0
    || review.stall?.kind === "human_verification"
    || review.attention_categories?.includes("captcha");

  if (captchaOnly) {
    addUnique(items, {
      id: "blocker-captcha-requires-your-attention",
      label: captchaBlockers[0] ?? "CAPTCHA requires your attention",
      action: "Open page",
    });
    return items;
  }

  for (const blocker of blockers) {
    if (blockerDuplicatesQuestion(blocker, review.questions)) continue;
    if (fieldEvidenceAlreadyCoversBlocker(blocker, review.filled_fields, review.questions)) continue;
    addUnique(items, {
      id: `blocker-${keyFor(blocker)}`,
      label: blocker,
      action: "Open page",
    });
  }

  for (const question of review.questions ?? []) {
    const answer = (question.answer ?? "").trim();
    if (question.required && !answer) {
      addUnique(items, {
        id: `missing-${question.id}`,
        label: question.question,
        detail: "Required answer missing",
        action: "Answer",
      });
      continue;
    }
    if (review.status !== "submitted" && question.kind === "essay" && answer) {
      addUnique(items, {
        id: `review-${question.id}`,
        label: question.question,
        detail: "Drafted answer ready for review",
        action: "Review",
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
