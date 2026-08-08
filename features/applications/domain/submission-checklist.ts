import type { ApplicationReview } from "@/lib/api";

/**
 * What the row's control DOES, as opposed to what it says.
 *
 * `action` was the only field here for a long time and it is a CAPTION: the words printed on the
 * pill. The panel rendered that caption into a `<span>`, so "Review" and "Confirm" were text that
 * looked like buttons and were bound to nothing: no navigation, no request, no error, no state
 * change. Measured by hand on a real needs_attention packet on 2026-08-08.
 *
 * A caption cannot be bound to anything, so the kind is now carried separately and every renderer
 * has to resolve it through `checklistRowControl`, which returns a link or a button or nothing at
 * all. There is no path left that prints an action word without an element behind it.
 */
export type SubmissionChecklistAction = "open-page" | "answer" | "review" | "confirm";

export type SubmissionChecklistItem = {
  id: string;
  label: string;
  detail?: string;
  /** The words on the control. Display only. Bind to `actionKind`, never to this. */
  action?: string;
  actionKind?: SubmissionChecklistAction;
  /** The question this row is about, when the row came from one. The answer editor opens on it. */
  questionId?: string;
  /**
   * Normalized name of the FIELD the row is about, used to dedupe. The runner emits more than one
   * blocker line per field, so "What is your top location preference?" is required and is still
   * empty and location choice left for you: "what is your top location preference?" arrived as two
   * rows for one field.
   */
  subject?: string;
};

/**
 * The control a row renders, decided in one place so no renderer can invent a third answer.
 *
 * `null` means the row has nothing to act on, and then NOTHING is drawn. A control that cannot act
 * must be absent rather than dead: that rule is already written into this page for the packet
 * viewer's revisit mark, and this panel is where it was not applied.
 */
export type ChecklistRowControl =
  | { element: "link"; label: string; name: string; href: string }
  | { element: "button"; label: string; name: string; intent: Exclude<SubmissionChecklistAction, "open-page">; questionId: string };

export function checklistRowControl(
  item: SubmissionChecklistItem,
  context: { portalUrl?: string },
): ChecklistRowControl | null {
  if (!item.action || !item.actionKind) return null;
  if (item.actionKind === "open-page") {
    const href = context.portalUrl?.trim();
    if (!href) return null;
    return { element: "link", label: item.action, name: `Open the company page to handle: ${item.label}`, href };
  }
  if (!item.questionId) return null;
  const name = item.actionKind === "answer"
    ? `Answer: ${item.label}`
    : item.actionKind === "review"
      ? `Review the drafted answer to: ${item.label}`
      : `Confirm your answer to: ${item.label}`;
  return { element: "button", label: item.action, name, intent: item.actionKind, questionId: item.questionId };
}

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

/**
 * The FIELD a blocker line is about, normalized.
 *
 * The runner writes more than one line per field and phrases them differently, so the panel showed
 * "What is your top location preference?" is required and is still empty next to
 * location choice left for you: "what is your top location preference?" as two separate tasks for
 * one box on one form. Both name the field in quotes, so the quoted run is the subject and two
 * lines that quote the same field collapse to one row.
 *
 * Lines with no quoted run fall back to the whole sentence, which makes the subject no weaker than
 * the label dedupe that was already there.
 */
function blockerSubject(blocker: string): string {
  const quoted = blocker.match(/[“"]([^”"]{3,})[”"]/);
  return normalizedChecklistText(quoted?.[1] ?? blocker);
}

function blockerReportsEmptyField(blocker: string): boolean {
  return /is required and is still empty/i.test(blocker);
}

function questionNamedByBlocker(
  blocker: string,
  questions: readonly { question: string }[] | undefined,
): { question: string } | undefined {
  const normalizedBlocker = normalizedChecklistText(blocker);
  return (questions ?? []).find((question) => {
    const normalizedQuestion = normalizedChecklistText(question.question);
    return normalizedQuestion.length > 10 && normalizedBlocker.includes(normalizedQuestion);
  });
}

function blockerDuplicatesQuestion(blocker: string, questions: readonly { question: string }[] | undefined): boolean {
  const normalizedBlocker = normalizedChecklistText(blocker);
  // "AI-drafted answer ..." and the later "drafted answer needs your review ..." are the same
  // sentence from the same writer, and only the first spelling was recognized.
  if (/^(?:ai )?drafted answer/.test(normalizedBlocker)) return true;
  if (normalizedBlocker.startsWith("open ended question left for you")) return true;
  if (normalizedBlocker.startsWith("work eligibility question left for you")) return true;
  return questionNamedByBlocker(blocker, questions) !== undefined;
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
  if (item.subject && items.some((existing) => existing.subject === item.subject)) return;
  items.push(item);
}

/**
 * The fields this run says are STILL EMPTY on the employer's form, by normalized name.
 *
 * This is the run reporting on the form it just filled, so it outranks a stored answer string.
 * "How did you hear about Anduril?" was listed here AND printed in the Done column as
 * "Answer filled", because a stored answer of "Company website" was read as proof the box had been
 * typed into. The captured screenshot of that same run shows the box empty. One of the two columns
 * was lying to the applicant about what the employer is going to receive, and it was Done.
 */
function emptyFieldSubjects(blockers: readonly string[]): Set<string> {
  return new Set(blockers.filter(blockerReportsEmptyField).map(blockerSubject));
}

function questionReportedEmpty(question: string, emptySubjects: ReadonlySet<string>): boolean {
  const normalized = normalizedChecklistText(question);
  if (!normalized) return false;
  for (const subject of emptySubjects) {
    if (subject === normalized) return true;
    if (subject.length > 10 && normalized.includes(subject)) return true;
    if (normalized.length > 10 && subject.includes(normalized)) return true;
  }
  return false;
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
      actionKind: "open-page",
    });
    return items;
  }

  const emptySubjects = emptyFieldSubjects(blockers);

  for (const blocker of blockers) {
    if (blockerDuplicatesQuestion(blocker, review.questions)) continue;
    if (fieldEvidenceAlreadyCoversBlocker(blocker, review.filled_fields, review.questions)) continue;
    addUnique(items, {
      id: `blocker-${keyFor(blocker)}`,
      label: blocker,
      action: "Open page",
      actionKind: "open-page",
      subject: blockerSubject(blocker),
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
        actionKind: "answer",
        questionId: question.id,
      });
      continue;
    }
    if (review.status !== "submitted" && question.kind === "essay" && answer) {
      addUnique(items, {
        id: `review-${question.id}`,
        label: question.question,
        detail: "Drafted answer ready for review",
        action: "Review",
        actionKind: "review",
        questionId: question.id,
      });
      continue;
    }
    if (review.status !== "submitted" && answer && isHumanOnlyChecklistLabel(question.question)) {
      addUnique(items, {
        id: `confirm-${question.id}`,
        label: question.question,
        detail: "Needs your confirmation",
        action: "Confirm",
        actionKind: "confirm",
        questionId: question.id,
      });
      continue;
    }
    /* An answer Litos holds that the run says never reached the box. Neither of the branches above
       catches it: it is not an essay and not a question only a human may answer, so before this it
       fell straight through into the Done column as "Answer filled". The blocker naming the same
       field was ALSO suppressed, by blockerDuplicatesQuestion, on the reasoning that a question
       record covers it. Between the two, the one row that should have existed was the only thing
       missing. */
    if (review.status !== "submitted" && answer && questionReportedEmpty(question.question, emptySubjects)) {
      addUnique(items, {
        id: `empty-${question.id}`,
        label: question.question,
        detail: "Answered here, still empty on the form",
        action: "Answer",
        actionKind: "answer",
        questionId: question.id,
        subject: normalizedChecklistText(question.question),
      });
    }
  }

  return items;
}

export function completedSubmissionItems(review: Pick<ApplicationReview, "attention_reason" | "filled_fields" | "questions" | "receipt" | "status">): SubmissionChecklistItem[] {
  const items: SubmissionChecklistItem[] = [];
  const emptySubjects = emptyFieldSubjects(compactLines(review.attention_reason));
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
    // The run says this box is still empty. A stored answer is not the employer having received it,
    // and Done is a claim about the employer's form.
    if (review.status !== "submitted" && questionReportedEmpty(question.question, emptySubjects)) continue;
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
