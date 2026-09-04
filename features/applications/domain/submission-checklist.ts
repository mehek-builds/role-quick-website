import type { ApplicationQuestion, ApplicationReview, RequiredDocumentAsk } from "@/lib/api";
import { screenForStatus, type ReviewScreen } from "./application-review.ts";
import { questionReviewPresentation, requiredQuestionReviewRoute } from "./question-review-presentation.ts";
import { withRequiredParentQuestionIds } from "./dependent-questions.ts";
import { cleanScrapedLabel, cleanScrapedPrompt } from "./scraped-text.ts";

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
export type SubmissionChecklistAction = "open-page" | "restart" | "answer" | "review" | "confirm" | "attach";

/**
 * The most options a closed list renders as individual choice rows.
 *
 * Below this a list reads at a glance, which is the whole point of showing the employer's own
 * options instead of a blank box: the acknowledgement lists this exists for offer one or two
 * sentences. Above it the rows become the wall the blank box was, so the answers editor falls back
 * to its select and the Your turn row falls back to its plain Answer control.
 */
export const QUESTION_CHOICE_LIST_LIMIT = 8;

export type SubmissionChecklistItem = {
  id: string;
  label: string;
  detail?: string;
  /** The words on the control. Display only. Bind to `actionKind`, never to this. */
  action?: string;
  actionKind?: SubmissionChecklistAction;
  /** The question this row is about, when the row came from one. The answer editor opens on it. */
  questionId?: string;
  /** The document this row is about, when the row came from an employer's file ask. The upload
   *  modal opens on it. Carried separately from questionId because a document ask is not a question
   *  and must not be routed into the answers editor, which has nothing to show for it. */
  documentKind?: string;
  /** One short state word rendered as a pill beside the label. Display only, and deliberately not
   *  derived from the control: the OFFICIAL-copy row keeps its control and drops this word, because
   *  a row she has already acknowledged must not go on shouting REQUIRED at her. */
  badge?: string;
  /**
   * This row states something that is already handled, and keeps a control only so she can change
   * it. It is NOT work waiting on her.
   *
   * A settled row exists because a control that vanishes the moment its job is done takes the way
   * back with it. The attached-transcript row is the case that forced this: "Remove this file" lives
   * inside the upload modal, the modal opens only from a row emitted here, and the row used to
   * disappear as soon as a file was stored, so nothing in the shipped product could remove a stored
   * transcript while the privacy page promised removal.
   *
   * Every renderer has to keep these out of whatever it counts or colours as outstanding. A
   * confirmation drawn inside an amber panel headed "Your turn" is how a finished thing starts
   * reading as a blocked application.
   */
  settled?: boolean;
  /**
   * This row takes a tick. True only on the rows built FROM attention_reason - the blockers whose
   * only resolution is on the employer's own page - because those are the rows where "done" is a
   * fact only the applicant can know, and her tick is the honest record of it.
   *
   * Deliberately absent everywhere else, and the absences are each a decision:
   * - A question row (answer/review/confirm) completes through its own control and the server's
   *   own record. A tick that marked it done without the answer landing would be the Done column
   *   lying again, one row earlier.
   * - A document row feeds the send gate through documentControls, which never reads ticks. A
   *   ticked document row would read settled beside a Send button still grey because of it, and
   *   the screen would be contradicting itself about the same file.
   */
  acknowledgeable?: boolean;
  /**
   * The applicant ticked this row, and the tick is stored on the review
   * (attention_acknowledgements, written by POST /applications/:id/review/attention-acks). Always
   * paired with settled, and distinct from it: settled says "out of the outstanding count", this
   * says "by her own hand, and the checkbox must stay live so she can take it back". A server-
   * settled row (a confirmed answer, an attached file) is not hers to untick.
   */
  acknowledged?: boolean;
  /**
   * Normalized name of the FIELD the row is about, used to dedupe. The runner emits more than one
   * blocker line per field, so "What is your top location preference?" is required and is still
   * empty and location choice left for you: "what is your top location preference?" arrived as two
   * rows for one field.
   */
  subject?: string;
  /**
   * The employer's own options, in the employer's own order, when the question behind this row
   * carries a short closed list. Display plus routing only: picking one opens the answers editor
   * with that option selected, and the editor's Save is still the only write. Absent past
   * QUESTION_CHOICE_LIST_LIMIT, where the plain Answer control is the kinder shape.
   */
  options?: readonly string[];
};

export type DirectQuestionTaskIntent = Extract<SubmissionChecklistAction, "answer" | "review" | "confirm">;

export type DirectQuestionTask = {
  kind: "question";
  id: string;
  item: SubmissionChecklistItem;
  question: ApplicationQuestion;
  intent: DirectQuestionTaskIntent;
  /**
   * True for a question in the queue only because the question after it refers back to it.
   *
   * Its answer already stands. It is here so a follow-up is never asked about an answer the
   * applicant was not shown (see dependent-questions.ts), which means it must NOT behave like
   * outstanding work: it does not count toward `remaining`, and the renderer navigates past an
   * unedited one instead of re-saving an answer nothing changed. Editing it is still allowed and
   * still saves - it is her answer, and the follow-up beneath it is the reason she is looking.
   */
  context?: true;
};

export type DirectNonQuestionTask = {
  kind: "non-question";
  id: string;
  item: SubmissionChecklistItem;
};

export type DirectInputTask = DirectQuestionTask | DirectNonQuestionTask;

/**
 * Whether a row is about a FILE rather than about the employer's form.
 *
 * ONE DEFINITION, because there were two and they were about to disagree. This predicate was written
 * inline inside metadataRefreshOutranksStandingAttention as a pair of terms, and the screen needs the
 * same question answered in a second place now (see documentStepsInPlan), so the third copy is the
 * one that gets a term wrong. Both halves are kept: `documentKind` is what a row carries so a control
 * knows which key to write, and `actionKind === "attach"` is what makes it draw the control at all.
 * Every row documentAskItems emits has both, and requiring either rather than both means a row that
 * loses one of them is still recognised as a document row instead of quietly becoming a blocker.
 *
 * WHAT THIS IS FOR, and it is not cosmetic grouping. A document row is the only outstanding row on
 * this screen whose control WRITES NOTHING TOWARD AN EMPLOYER: attaching a file writes
 * `spec._documents` and sends nothing. Every other control in the amber panel either re-runs the
 * fill, opens the employer's page, or saves an answer that the next run will type into their form.
 * That difference is why a mode which must suppress the sending controls does not have to suppress
 * this one.
 */
export function isDocumentChecklistItem(item: SubmissionChecklistItem): boolean {
  return item.documentKind !== undefined || item.actionKind === "attach";
}

/**
 * The document steps standing on this application, out of a plan that may be showing none of them.
 *
 * THE DEFECT THIS EXISTS FOR, measured 2026-09-03 on two packets of one account. The dashboard's
 * unverified-submission mode - status needs_attention with an `unverified_submission` that has no
 * resolution - replaces the entire amber panel with the raw `attention_reason` and two buttons
 * ("I found it there" / "It is not there"). On the Databricks packet, which was not in that mode,
 * the same review rendered "Databricks needs your transcript" with a REQUIRED badge and a working
 * Add transcript control. On the Verkada packet, which was, the only thing on screen was
 *
 *   "Undergraduate Transcript" is required and is still empty
 *   1 required field has no question you can answer in Litos: "Undergraduate Transcript"
 *
 * with no control anywhere. Same measurement, same required_documents, same transcript_supported,
 * two completely different screens, and the one that stated the requirement was the one that could
 * not act on it.
 *
 * SUPPRESSING THE SENDING CONTROLS IS RIGHT AND IS NOT WHAT THIS CHANGES. While Litos may already
 * have reached the employer, Try again and Review and fill could send a second application, so they
 * correctly wait for her yes/no. A document row cannot: see isDocumentChecklistItem. It is also work
 * she owes on BOTH answers - "not there" means the next run needs the file, and "found it there"
 * ends the application and takes the row away with it - so hiding it buys nothing and costs her the
 * only surface that could tell her the file was wanted.
 *
 * Reads the PLAN rather than re-deriving from the review, so a row that reaches this list is one the
 * ordinary panel would have drawn too: the same builder, the same dedupe, the same order. A second
 * derivation is how one surface starts asking for a document the other has already settled.
 *
 * SETTLED ROWS COME TOO, and leaving them out was the first version of this. The plan keeps them in
 * `settled` rather than in `nonQuestionTasks`, so a list built from the outstanding half alone
 * vanishes the instant she attaches the file - and the confirmation row is the only thing on this
 * screen carrying a control back to the modal, where "Remove this file" lives, while /privacy
 * publishes "we encrypt it and keep it until you remove it or delete your account". BlockerList
 * already draws the two halves differently, so handing it both is what it is built for: the
 * outstanding row asks, the settled row confirms and keeps the way back.
 */
export function documentStepsInPlan(plan: Pick<DirectInputTaskPlan, "nonQuestionTasks" | "settled">): SubmissionChecklistItem[] {
  return [
    ...plan.nonQuestionTasks.map((task) => task.item),
    ...plan.settled,
  ].filter(isDocumentChecklistItem);
}

export type DirectInputTaskPlan = {
  /** Safe employer questions that still need the applicant, in the employer's stored order. */
  questionTasks: DirectQuestionTask[];
  /** Outstanding work that cannot be completed by saving an answer in Litos. */
  nonQuestionTasks: DirectNonQuestionTask[];
  /** Server-settled rows kept outside the outstanding count, with their way back preserved. */
  settled: SubmissionChecklistItem[];
  /** Questions whose exact label or options cannot be trusted enough to render an answer control. */
  metadataBlockers: ReturnType<typeof questionReviewPresentation>["metadataBlockers"];
  /** The first safe prompt, with direct questions intentionally taking precedence. */
  current: DirectInputTask | null;
  /** Outstanding direct questions plus outstanding non-question work. */
  remaining: number;
};

/**
 * Stable identity for the employer prompt the applicant actually saw. It intentionally excludes
 * the stored answer and task intent: after one accepted direct save, the same measured prompt is
 * complete for this answer pass even if the runner relabels it from Answer to Review. A changed
 * label, control, option order, or helper copy produces a new identity and must be shown again.
 */
export function directQuestionPromptFingerprint(
  task: Pick<DirectQuestionTask, "question">,
): string {
  const { question } = task;
  return JSON.stringify([
    question.id,
    question.question,
    question.kind,
    question.required,
    question.portal_selector ?? null,
    question.portal_input_type ?? null,
    question.options ?? null,
    question.explanation ?? null,
  ]);
}

/**
 * Exact save-boundary identity. The base answer and intent are included here because a poll may
 * replace either while the applicant is typing. A response entered for yesterday's wording or an
 * older stored answer must never be written to a newly measured employer field that reused an id.
 */
export function directQuestionTaskFingerprint(task: DirectQuestionTask): string {
  return JSON.stringify([
    directQuestionPromptFingerprint(task),
    task.intent,
    task.question.answer,
    task.question.answer_state ?? null,
    task.question.answer_source ?? null,
    task.question.answer_reviewed_at ?? null,
  ]);
}

/**
 * The control a row renders, decided in one place so no renderer can invent a third answer.
 *
 * `null` means the row has nothing to act on, and then NOTHING is drawn. A control that cannot act
 * must be absent rather than dead: that rule is already written into this page for the packet
 * viewer's revisit mark, and this panel is where it was not applied.
 */
export type ChecklistRowControl =
  | { element: "link"; label: string; name: string; href: string }
  | { element: "restart"; label: string; name: string }
  | { element: "attach"; label: string; name: string; kind: string }
  | { element: "button"; label: string; name: string; intent: Exclude<SubmissionChecklistAction, "open-page" | "restart" | "attach">; questionId: string };

export function checklistRowControl(
  item: SubmissionChecklistItem,
  context: { portalUrl?: string },
): ChecklistRowControl | null {
  if (!item.action || !item.actionKind) return null;
  if (item.actionKind === "open-page") {
    const href = context.portalUrl?.trim();
    if (!href) return null;
    /* Two sentences for one link, because the accessible name is a promise about what pressing it
       is FOR - the same rule the attach and confirm controls follow. On an acknowledged row she has
       already said the work is done, so "to handle" would be a screen reader assigning her work she
       just marked handled; the link stays only as the way back to the page. */
    const name = item.settled
      ? `Open the company page for: ${item.label}. You marked this handled.`
      : `Open the company page to handle: ${item.label}`;
    return { element: "link", label: item.action, name, href };
  }
  if (item.actionKind === "restart") {
    return {
      element: "restart",
      label: item.action,
      name: `Review the current packet and restart this application in Litos: ${item.label}`,
    };
  }
  /* ABOVE the questionId guard, and that placement is the whole point of adding a third member
     rather than reusing "answer". A document ask has no question behind it, so a transcript row
     routed through the guard below returns null: the panel would draw the sentence saying the
     employer is waiting on a file and no control at all, which is the exact regression this file
     exists to prevent. */
  if (item.actionKind === "attach") {
    if (!item.documentKind) return null;
    /* Same element, two different sentences, because the accessible name is a promise about what
       pressing this does. On a settled row the file is already stored and the only thing behind the
       control is the modal state that can remove it, so "Add the file this employer asks for" would
       be a screen reader being told the opposite of what is about to happen. */
    const name = item.settled
      ? `Open the ${item.documentKind} attached to this application, where you can remove it`
      : `Add the file this employer asks for: ${item.label}`;
    return { element: "attach", label: item.action, name, kind: item.documentKind };
  }
  if (!item.questionId) return null;
  /* Two sentences per intent, because the accessible name is a promise about what pressing this
     does. On a settled row the answer already stands and the only thing behind the control is the
     editor that can change it, so "Confirm your answer" would be a screen reader announcing work
     that is already done. Same rule as the attach control above, and it has to hold for REVIEW as
     well as CONFIRM now that an approved essay settles instead of going on asking: a settled row
     still named "Review the drafted answer" would be restating the exact ask her approval ended. */
  const name = item.actionKind === "answer"
    ? `Answer: ${item.label}`
    : item.actionKind === "review"
      ? item.settled
        ? `Change your reviewed answer to: ${item.label}`
        : `Review the drafted answer to: ${item.label}`
      : item.settled
        ? `Change your confirmed answer to: ${item.label}`
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

/* What a question re-admitted to the queue for its dependent says about itself. It is not a new
   ask: her answer stands, and it is on screen so the follow-up underneath it can be read. */
const PARENT_CONTEXT_DETAIL = "The next question refers back to this one";


/**
 * The one place a scraped employer prompt becomes text Litos is willing to print.
 *
 * It used to capitalise the first character and restore a short acronym list, which was enough for
 * "provide your best result on sat" and nothing else. Measured 2026-08-29 it left
 * "select all that apply. note: this information will only be used to ensure compliance with u.s.
 * sanctions..." with one capital at the front and the rest exactly as the DOM had it, and it had no
 * notion at all of a label captured three times over ("Preferred first name* preferred first name
 * preferred_name"). Both now go through scraped-text.ts, which follows jd-display.ts's rules: guarded,
 * conservative, and never cleaning to empty.
 *
 * Label cleaning runs FIRST so a duplicated capture is gone before the prompt is cased; casing a
 * string that still contains its own restatement would just produce two capitals.
 */
export function displayQuestionLabel(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return cleanScrapedPrompt(cleanScrapedLabel(trimmed));
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

/**
 * A cover-letter control measured as unsupported is not applicant work.
 *
 * Older packets can still carry the generated question that represented the text area or upload
 * control before the managed run inspected the employer's current form. Once that run reports
 * `cover_letter_supported: false`, rendering the historical question under Your turn contradicts
 * the measurement and asks the applicant to review content Litos has nowhere to send.
 *
 * Keep the match deliberately field-shaped. A genuine essay that merely mentions a cover letter
 * must not disappear because the form lacks a cover-letter attachment control.
 */
function isCoverLetterFieldLabel(value: string): boolean {
  return /^(?:please )?(?:(?:attach|upload|provide) (?:a )?)?cover letter(?: optional)?$/.test(normalizedChecklistText(value));
}

function isCaptchaChecklistText(value: string): boolean {
  return /captcha|recaptcha|hcaptcha|prove you are human/i.test(value);
}

/**
 * A packet-audit stop belongs to Litos, not to the employer's page.
 *
 * The first live instance was a Workable application whose packet changed after the applicant had
 * reviewed it. The checklist treated every free-form attention sentence as work on the company
 * page, so it rendered both an Open page link and a checkbox saying she handled it there. Neither
 * could repair the stale packet. The existing Review and fill path can: it stores reviewed answers,
 * takes a fresh audit, and starts the managed fill again. Keep that recovery attached to the row
 * that names the stop so this class of audit failure never sends the applicant out of Litos.
 */
function isPacketRestartChecklistText(value: string): boolean {
  return /application changed after you approved the exact packet|packet changed after you approved|review the current packet/i.test(value);
}

/**
 * The runner's diagnostic sentences, translated into the applicant's next move.
 *
 * attention_reason is written by the machine about its own failure, and rendering it verbatim hands
 * the student a diagnosis with no verb: the live example was "A required field on the form has no
 * label Litos can read, and is still empty" sitting alone as the entire YOUR NEXT STEP list
 * (Belvedere, 2026-08-28). The row's controls were always real - the tick stores an
 * acknowledgement, packet review restarts the form - but nothing in the sentence said so.
 *
 * KEYED ON STABLE PHRASES FROM THE RUNNER, matched loosely enough to survive small rewordings, and
 * the map only ever rewrites COPY: subject, id, action kind and the tick all still derive from the
 * original sentence, so dedupe and acknowledgement storage cannot be broken by a rewording here.
 * An unrecognized sentence renders as before, which is the honest fallback.
 */
const ATTENTION_BLOCKER_REWRITES: readonly { pattern: RegExp; label: string; detail: string }[] = [
  {
    /* Singular only, on word boundaries: "required fields have no label" must fall through
       verbatim rather than be rewritten to one-box copy that erases the count. */
    pattern: /required field\b.*no label\b.*can read.*still empty/i,
    label: "One required box on the form still needs an answer",
    detail: "Litos could not read that box's wording, so it left it empty rather than guess. Open packet review to run the form again, or answer it on the company page and tick this row when it is done.",
  },
];

function attentionBlockerRewrite(blocker: string): { label: string; detail: string } | null {
  return ATTENTION_BLOCKER_REWRITES.find((rewrite) => rewrite.pattern.test(blocker)) ?? null;
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
    /* \bus\b, not us\b. Without the leading boundary this matched inside "status", so the standard
       Greenhouse phrasing - "will you now or in the future require sponsorship for employment visa
       status?" - was read as a US-scoped question and dropped out of the human-only class, which is
       the class that grows a Confirm row. The server refuses that label either way, so the row was
       the only thing missing. Measured: the exclusion hit at index 74, inside "status".
       Non-US labels mentioning a "status" were caught by the same accident. */
    return !/(u\.s\.|\bus\b|united states|\busa\b)/.test(normalized);
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

/**
 * What this application already carries, keyed by document kind.
 *
 * Structural rather than `AttachedDocument`, because it comes off the SUBMISSION envelope on one
 * caller and off the packet's own stored spec on the other, and those two records are not the same
 * type. The three fields below are the only ones either row of this decision reads, and `file_name`
 * is optional because a mark written by an older envelope may not carry one: a confirmation row that
 * cannot name the file still confirms the file.
 */
export type ChecklistDocumentMarks = Readonly<Record<string, { file_name?: string | null; attached_at?: string | null; ordered_at?: string | null }>>;

/**
 * The document controls a screen with no Your turn panel has to offer, ONE PER KIND.
 *
 * WHY THIS IS A FUNCTION AND NOT TWO EXPRESSIONS ON THE SCREEN. It shipped as `find` plus a
 * whole-screen `!outstandingAsk` guard, which quietly made every kind depend on every other kind:
 * with a transcript attached and a writing sample still outstanding, the attached transcript's
 * control disappeared, because a different kind was unfinished. The route to "Remove this file" for
 * a file Litos is storing therefore went away for a reason that had nothing to do with that file,
 * while /privacy publishes "We encrypt it and keep it until you remove it or delete your account".
 * One kind's state must never decide another kind's control, and a list of kinds is the shape that
 * cannot express the mistake.
 *
 * `attached` is read off the MARKS and not off the asks, because the ask is the thing that goes
 * away: `required_documents` is re-measured from the unanswered-required labels on every prepare,
 * so the first run after a successful upload reports none at all.
 *
 * `ordered_at` deliberately does not clear an ask. Litos cannot make a registrar mail a sealed
 * transcript, so a send offered on the strength of "I have ordered it" is a send the employer
 * refuses.
 */
export type DocumentControls = {
  /** Every ask Litos can still take a file for on this screen. Each one needs its own Add control. */
  outstanding: RequiredDocumentAsk[];
  /**
   * Asks she has answered with "I have ordered it" and nothing else.
   *
   * Separate from `outstanding` because the two want different sentences and different exits. An
   * outstanding ask is waiting on a file she has; this one is waiting on a registrar, which Litos
   * cannot hurry and cannot stand in for. It still draws an Add control, because plenty of employers
   * write "official" and take the unofficial PDF, but the screen must also offer the door the modal
   * already promised her: "This application then finishes with you rather than with Litos."
   */
  ordered: RequiredDocumentAsk[];
  /**
   * Asks on a form the run measured and found NO control for.
   *
   * `transcript_supported === false` is the measurement, and it was shipped on the wire and read
   * nowhere: an employer asked for a transcript, Litos found nothing it could fill, the student
   * uploaded a file, it attached to nothing, and the send presented itself as complete. These asks
   * are deliberately absent from `outstanding` - offering "Add transcript" here is offering an
   * upload that reaches no one - and they keep blocking the send even once a file is stored, because
   * the file being stored is not the file being delivered.
   */
  undeliverable: RequiredDocumentAsk[];
  /** Every kind with a stored file on this application, whether or not a run still asks for it. */
  attached: string[];
};

/**
 * Whether the employer's form has a control Litos can put this KIND of file in, as the run measured
 * it off their own page.
 *
 * TRI-STATE, AND ONLY `false` MEANS ANYTHING HERE. `undefined` is every packet prepared before the
 * measurement existed and every kind nothing has ever measured, and reading unknown as "no control"
 * would refuse sends on forms that were perfectly able to take the file. This is the same discipline
 * `cover_letter_required` is held to, in submission-state.ts, and for the same reason.
 *
 * KEYED BY KIND THROUGH A LOOKUP RATHER THAN READ DIRECTLY, because the wire field is named for one
 * kind - `transcript_supported` - while the asks are a list of kinds. A second document type arrives
 * as a second field beside it and as one more arm here; until then every other kind is honestly
 * unmeasured, which is the answer that blocks nothing.
 */
export function documentControlSupported(
  review: Pick<ApplicationReview, "transcript_supported">,
  kind: string,
): boolean | undefined {
  return kind === "transcript" ? review.transcript_supported : undefined;
}

/**
 * The employer's asks, folded to ONE PER KIND.
 *
 * A kind is a storage key: `spec._documents` is keyed by it and one upload writes one entry. Two
 * labels that classify to it are one file asked for twice, which is what a form carrying both
 * "Official transcript" and "Unofficial transcript (PDF)" is. Rendered as two rows they are two
 * controls that open the same modal and write the same key, so attaching once clears one of them
 * and leaves the other asking for a file she has already given.
 *
 * REACT KEYS ARE THE SHARP EDGE, and they are why this cannot be left to the server. Both screens
 * that draw these key their elements on `ask.kind`, so a duplicate kind is a duplicate key: React
 * warns, and the second element and everything rendered beside it become undefined behaviour on the
 * next reorder. The backend does fold its asks today, in requiredDocuments.ts, but this list arrives
 * over the wire from a repo that deploys separately, and a type is a statement of intent about the
 * bytes rather than a fact about them. A render invariant is held where the render is.
 *
 * FOLDED THE WAY THE SERVER FOLDS, deliberately, so the two agree wherever both run: the first
 * label seen names the row, and `official_requested` is true if ANY label for that kind asked for a
 * sealed copy. Erring toward official adds the "I have ordered it" door; erring the other way takes
 * away the only honest answer available to a student who cannot upload a registrar's file.
 *
 * The kept ask is a COPY. This list is React state on both callers, and OR-ing the flag onto the
 * caller's own object would mutate a rendered value in place.
 */
export function documentAsksByKind(
  asks: readonly RequiredDocumentAsk[] | undefined,
): RequiredDocumentAsk[] {
  const byKind = new Map<string, RequiredDocumentAsk>();
  for (const ask of asks ?? []) {
    if (!ask?.kind) continue;
    const kept = byKind.get(ask.kind);
    if (!kept) {
      byKind.set(ask.kind, { ...ask, official_requested: ask.official_requested === true });
      continue;
    }
    kept.official_requested = kept.official_requested || ask.official_requested === true;
  }
  return [...byKind.values()];
}

export function documentControls(
  asks: readonly RequiredDocumentAsk[] | undefined,
  marks: ChecklistDocumentMarks | undefined,
  /* The measured capability, defaulted to "nothing measured" so a caller that has not got a review
     to hand gets the answer that blocks nothing rather than the answer that blocks everything. */
  review: Pick<ApplicationReview, "transcript_supported"> = {},
): DocumentControls {
  const byKind = documentAsksByKind(asks);
  /* Undeliverable is decided FIRST and takes the ask out of every other list, because it is a fact
     about the form rather than about her: no control means no upload here can help, so an Add pill
     and a "press Add" sentence would both be sending her to do work that changes nothing. */
  const undeliverable = byKind.filter((ask) => documentControlSupported(review, ask.kind) === false);
  const unmet = byKind.filter((ask) => (
    documentControlSupported(review, ask.kind) !== false && !marks?.[ask.kind]?.attached_at
  ));
  return {
    outstanding: unmet.filter((ask) => !marks?.[ask.kind]?.ordered_at),
    ordered: unmet.filter((ask) => marks?.[ask.kind]?.ordered_at),
    undeliverable,
    attached: Object.keys(marks ?? {}).filter((kind) => marks?.[kind]?.attached_at),
  };
}

/**
 * The row that confirms a stored file and carries the way back to it.
 *
 * Shared by both callers below because they are the same sentence: one reaches it through an ask the
 * run still reports, the other through the attachment alone. The control is not decoration on either
 * path. "Remove this file" lives inside the upload modal, the modal opens only from a control this
 * function gives a row, and /privacy publishes "We encrypt it and keep it until you remove it or
 * delete your account". A stored file with no row is that sentence made false.
 */
function attachedDocumentItem(
  kind: string,
  mark: { file_name?: string | null } | undefined,
  subject: string,
): SubmissionChecklistItem {
  const stored = mark?.file_name?.trim();
  return {
    id: `document-attached-${kind}`,
    label: `Your ${kind} is attached`,
    detail: stored
      ? `${stored}. Litos keeps it until you remove it.`
      : "Litos keeps it until you remove it.",
    action: "Manage file",
    actionKind: "attach",
    documentKind: kind,
    /* Settled, so no renderer counts or colours it as outstanding, and no badge, because a
       confirmation wearing a REQUIRED pill is a confirmation nobody reads as one. */
    settled: true,
    subject,
  };
}

/**
 * The rows for the documents the employer's own form asks for, plus a confirmation for anything this
 * application already carries.
 *
 * Emitted BEFORE everything else in humanInputItems, and both halves of that are deliberate.
 *
 * Before the captcha early return, because a captcha-stalled packet is still an application the
 * employer will refuse without the file. Returning the captcha row alone left the send blocked for
 * a reason the screen never stated.
 *
 * Before the blocker loop, because `addUnique` drops on subject collision and the runner already
 * emits `"Transcript" is required and is still empty` as a generic open-page blocker about the same
 * field. One of the two is going to vanish. The one that survives has to be the one with a control
 * that can resolve it, which means this one is added first.
 */
function documentAskItems(
  rawAsks: readonly RequiredDocumentAsk[],
  context: { company?: string; role?: string; documents?: ChecklistDocumentMarks },
  review: Pick<ApplicationReview, "transcript_supported">,
): SubmissionChecklistItem[] {
  /* The employer is the SUBJECT of the sentence. "Transcript required" is a form validation
     message; a student reading it has to work out who wants it and what happens if she ignores it.
     "Databricks needs your transcript" is the same fact with the asker restored. */
  const employer = context.company?.trim() || "This employer";
  const role = context.role?.trim();
  const marks = context.documents ?? {};
  /* One row per kind, resolved by the same fold the control row uses. `addUnique` would already drop
     the second row on its id, but it drops the LATER one, so a form asking for both an unofficial
     and an official copy kept the row that never offers "I have ordered it". The fold carries the
     official flag across instead of losing it to arrival order. */
  const asks = documentAsksByKind(rawAsks);
  const askedKinds = new Set(asks.map((ask) => ask.kind));
  /* Anything stored on this application that THIS run no longer asks about.
   *
   * Keyed on the attachment rather than on the ask, because the ask is the thing that goes away.
   * `required_documents` is re-measured from the unanswered-required labels every prepare, so the
   * run after a successful upload reports no ask at all: the field it was derived from is filled.
   * A confirmation that only exists while the employer is still complaining would take the remove
   * control off the screen on the next run instead of on the next click, which is the same defect
   * one poll tick later. The modal already expects this arrival, and says so: its `ask` prop is
   * documented as "Null on a reopen after the ask has cleared". */
  const carried = Object.keys(marks)
    .filter((kind) => !askedKinds.has(kind) && marks[kind]?.attached_at)
    .map((kind) => attachedDocumentItem(kind, marks[kind], normalizedChecklistText(kind)));
  return asks.flatMap((ask) => {
    const mark = context.documents?.[ask.kind];
    const subject = normalizedChecklistText(ask.label);
    if (documentControlSupported(review, ask.kind) === false) {
      /* THE MEASUREMENT THAT WAS ON THE WIRE AND READ NOWHERE.
       *
       * The run looked at this form for somewhere to put the file and found nothing it could fill.
       * Before this branch the row read "Databricks needs your transcript" with an Add pill on it,
       * she uploaded, the ask cleared, and the send went out reporting the document handled: the
       * file attached to nothing and no screen ever said so.
       *
       * A STORED FILE STILL GETS ITS OWN ROW, added first so the stale
       * `"Transcript" is required and is still empty` blocker collides with IT on subject and is the
       * line that drops. The two rows say two true things that are not the same thing: Litos is
       * keeping her file and can still delete it, and this employer is not going to receive it from
       * here. Collapsing them would have to give up one of the two, and both are load-bearing - one
       * is the privacy promise, the other is the send gate. */
      const rows: SubmissionChecklistItem[] = mark?.attached_at
        ? [attachedDocumentItem(ask.kind, mark, subject)]
        : [];
      rows.push({
        id: `document-unsupported-${ask.kind}`,
        label: `${employer} asks for your ${ask.kind} and their form has nowhere Litos can put one`,
        detail: mark?.attached_at
          ? "Litos is holding your file and found no upload control on this form to attach it to. Add it on their page yourself."
          : "Litos found no upload control on this form, so a file added here would not reach them. Add it on their page yourself.",
        action: "Open page",
        actionKind: "open-page",
        badge: "Required",
        /* A subject of its own, because the confirmation row above already claimed the ask's. Two
           rows sharing one subject is one row: addUnique drops the second, and whichever it dropped
           would be a promise broken - the file with no way back to Remove, or the employer's blocker
           with nothing on screen that states it. */
        subject: `${subject} no litos control`,
      });
      return rows;
    }
    if (mark?.attached_at) {
      /* ATTACHED IS NOT ABSENT, and this branch returning [] is what made a published privacy
         sentence untrue: no control anywhere in the shipped build could delete a stored transcript,
         one press after the modal that promised removal. The row stays. It just stops asking. */
      return [attachedDocumentItem(ask.kind, mark, subject)];
    }
    if (mark?.ordered_at) {
      /* She pressed "I have ordered it". That does not unblock the send, because Litos cannot make
         a registrar mail a sealed transcript, but it does mean the row has nothing left to demand:
         it states what is outstanding and keeps a control for the unofficial copy she may still
         want to attach. No REQUIRED pill, because the ask is acknowledged. */
      return [{
        id: `document-ordered-${ask.kind}`,
        label: `${employer} asked for an official ${ask.kind}`,
        detail: "You said you have ordered it. Litos cannot send a sealed copy from your registrar.",
        action: "Add a copy",
        actionKind: "attach" as const,
        documentKind: ask.kind,
        subject,
      }];
    }
    return [{
      id: `document-${ask.kind}`,
      label: `${employer} needs your ${ask.kind}`,
      detail: role
        ? `Their ${role} form will not submit without it.`
        : "Their form will not submit without it.",
      action: `Add ${ask.kind}`,
      actionKind: "attach" as const,
      documentKind: ask.kind,
      badge: "Required",
      subject,
    }];
  }).concat(carried);
}

/**
 * SHE ALREADY CONFIRMED THIS ONE, says the server, and only the server may say it.
 *
 * The CONFIRM row below used to be decided by the label class alone, which cannot change: confirm,
 * save, "Saved.", and the same amber ask again, indefinitely - driven four full cycles on the DV
 * Trading packet on 2026-08-17. What a confirmation actually leaves behind is a field the server
 * mints only from her explicit `confirmed` flag, so that field is what this reads.
 *
 * IT READS answer_confirmed_of, NOT THE APPLICANT-CLAIM, and the difference is a dead end.
 *
 * This used to test `answer_source: 'applicant_review'` beside a matching review round. That is a
 * strictly LOOSER test than the one the send gate applies, and the gap is not theoretical: the
 * backend's sensitive-question gate clears on `answer_confirmed_of === question`, which is minted
 * ONLY by a per-question `confirmed: true`, while `applicant_review` is also minted by any bulk
 * review save. So a packet could hold applicant_review on every answer, render every sensitive row
 * as "Confirmed by you" in the Done column with no control asking for anything - and refuse to send,
 * permanently, with the only account of why living in a 422 body the checklist never sees.
 *
 * Measured live on 2026-09-04, Exa "Software Engineer, Intern" packet 73768339 (ashby). Its visa
 * question carried answer_source applicant_review with answer_reviewed_at equal to
 * questions_reviewed_at, so this function returned true and the row settled into
 * "Employer questions - 4 items completed". Pressing Send returned
 * FINAL_APPROVAL_VERIFICATION_FAILED, "Sensitive question requires your attention: do you require
 * visa sponsorship...". There was no Confirm control anywhere on the screen, because this function
 * had already declared the thing confirmed. The client said done, the server said not done, and
 * nothing in between could be pressed.
 *
 * The round check is gone with the claim it guarded. answer_confirmed_of is an ANSWER-claim on the
 * server (see ANSWER_CLAIM_FIELDS): it is falsified by the answer changing, deliberately NOT by the
 * round moving, because a confirmation that expired whenever the round advanced for an unrelated
 * reason would put the gate straight back into the dead end the field exists to open. Matching the
 * value against the question's own text is what proves the confirmation belongs to THIS question and
 * did not survive a rename underneath it - the same check the server's own reader makes.
 */
function applicantConfirmedAnswer(
  question: Pick<ApplicationQuestion, "answer" | "question" | "answer_confirmed_of">,
): boolean {
  return Boolean(
    (question.answer ?? "").trim()
    && typeof question.answer_confirmed_of === "string"
    && question.answer_confirmed_of === question.question,
  );
}

/**
 * THE SERVER SAYS THIS ANSWER STANDS, as opposed to being a paragraph Litos wrote and nobody has
 * approved. Read by the essay row below and by BOTH Done-column builders, in one definition,
 * because the row list and the group count saying different things about one essay is the same
 * class of defect as the two columns disagreeing about a file.
 *
 * ABSENT IS NOT APPROVED, and that is the whole point of naming the approving sources rather than
 * excluding the drafting one. The backend reads a missing `answer_source` as a machine answer and
 * counts the row unacknowledged (see the Akuna measurement at app/dashboard/applications/page.tsx,
 * where that is exactly what parked the packet), so a client that settled on "not a draft" would
 * call a row done that the server is still holding open, with nothing left in the queue to press.
 * Testing the two approving values fails closed instead: an answer the server named no source for
 * goes on asking, and her save is what names it.
 *
 * NOT the same question as applicantConfirmedAnswer below. That one asks whether she pressed
 * Confirm on a SENSITIVE question, which mints answer_confirmed_of and nothing else does. This one
 * asks who the answer belongs to. An essay is a plain drafted answer that no gate asks her to
 * confirm, so reading the confirmation field for it would never come true.
 */
function applicantApprovedAnswer(question: Pick<ApplicationQuestion, "answer_source">): boolean {
  return question.answer_source === "applicant_review"
    || question.answer_source === "consent_permission";
}

export function humanInputItems(
  review: Pick<ApplicationReview, "attention_reason" | "attention_categories" | "attention_acknowledgements" | "cover_letter_supported" | "filled_fields" | "questions" | "question_metadata_blockers" | "questions_reviewed_at" | "required_documents" | "transcript_supported" | "stall" | "status">,
  /* The employer, the role, and what the application already carries. None of the three is on the
     review: the first two live on the packet's job_context and the third on the submission envelope,
     so the caller supplies them. Optional, and every default is the honest one: with no company the
     sentence still names an employer as its subject, and with no document marks nothing is claimed
     to be attached. */
  /* `sensitiveConfirmations` is THE SERVER'S OWN LIST of the questions it will refuse to send
     without a confirmation, straight off GET /applications/:id/submission. It is the authority and
     the label classes below are only a fallback, because the server decides with the resolver, the
     applicant profile, the JD and the posting country - none of which exist here. Omitting it
     leaves the previous label-only behaviour exactly as it was. */
  context: { company?: string; role?: string; documents?: ChecklistDocumentMarks; sensitiveConfirmations?: readonly string[] } = {},
): SubmissionChecklistItem[] {
  const items: SubmissionChecklistItem[] = [];
  for (const item of documentAskItems(review.required_documents ?? [], context, review)) addUnique(items, item);
  /* HER STORED TICKS, applied to the attention rows as they are built. The tick is her word that
     she handled that line on the employer's page herself, so a ticked row renders settled - out of
     the amber panel and out of "N to check" - while KEEPING its Open page control (the settled rule:
     the way back stays) and staying acknowledgeable, so the same checkbox can take the tick back.
     The detail says exactly what the tick is and is not: Litos has not re-measured the form, and a
     re-run starts the checklist clean because the backend drops this map with every fresh
     attention_reason. */
  /* Applied by MAP AT THE EXITS, never at individual construction sites, and guarded on the row's
     own acknowledgeable flag. Wrapping literals one by one is how a third acknowledgeable row gets
     added with a live checkbox whose stored tick never renders back - the dead-checkbox defect one
     row class at a time - and an unguarded wrapper is how a stray key like "missing-<id>" could
     settle a question row, which the flag's own comment forbids. */
  const acknowledgements = review.attention_acknowledgements;
  const withAcknowledgement = (item: SubmissionChecklistItem): SubmissionChecklistItem => (
    item.acknowledgeable === true && acknowledgements?.[item.id]
      ? { ...item, settled: true, acknowledged: true, detail: "Ticked off by you. Litos has not re-checked the company's form." }
      : item
  );
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
      acknowledgeable: true,
    });
    return items.map(withAcknowledgement);
  }

  const emptySubjects = emptyFieldSubjects(blockers);
  const presentedQuestions = new Map(questionReviewPresentation(
    review.questions ?? [],
    review.question_metadata_blockers ?? [],
  ).editableQuestions.map((question) => [question.id, question]));

  for (const blocker of blockers) {
    if (blockerDuplicatesQuestion(blocker, review.questions)) continue;
    if (fieldEvidenceAlreadyCoversBlocker(blocker, review.filled_fields, review.questions)) continue;
    const restartInLitos = isPacketRestartChecklistText(blocker);
    /* addUnique dedupes on label equality, so a rewrite may only apply while its label is not
       already on the list: two DIFFERENT blockers matching one rewrite entry must not collapse
       into a single row (the second would become invisible and un-acknowledgeable). The second
       one falls back to its own verbatim sentence instead. */
    const rewrite = attentionBlockerRewrite(blocker);
    const rewriteUsable = rewrite !== null && !items.some((existing) => existing.label === rewrite.label);
    addUnique(items, {
      id: `blocker-${keyFor(blocker)}`,
      label: rewriteUsable ? rewrite.label : blocker,
      ...(rewriteUsable ? { detail: rewrite.detail } : {}),
      action: restartInLitos ? "Review and fill" : "Open page",
      actionKind: restartInLitos ? "restart" : "open-page",
      subject: blockerSubject(blocker),
      acknowledgeable: !restartInLitos,
    });
  }

  for (const storedQuestion of review.questions ?? []) {
    const question = presentedQuestions.get(storedQuestion.id) ?? storedQuestion;
    if (review.cover_letter_supported === false && isCoverLetterFieldLabel(question.question)) continue;
    const answer = (question.answer ?? "").trim();
    if (question.required && !answer) {
      addUnique(items, {
        id: `missing-${question.id}`,
        label: displayQuestionLabel(question.question),
        detail: "Required answer missing",
        action: "Answer",
        actionKind: "answer",
        questionId: question.id,
        /* The employer's own list rides on the row, so the panel can show what the control accepts
           instead of naming a box she has to guess the wording for. A blank answer to a closed
           list is exactly the shape this exists for: she typed "Yes" into an acknowledgement whose
           only option was a sentence, and the fill failed silently. */
        ...(question.options && question.options.length > 0 && question.options.length <= QUESTION_CHOICE_LIST_LIMIT
          ? { options: question.options }
          : {}),
      });
      continue;
    }
    if (!question.required && !answer && question.answer_state !== "skipped") {
      addUnique(items, {
        id: `optional-${question.id}`,
        label: displayQuestionLabel(question.question),
        detail: "Optional, answer or skip",
        action: "Answer",
        actionKind: "answer",
        questionId: question.id,
        ...(question.options && question.options.length > 0 && question.options.length <= QUESTION_CHOICE_LIST_LIMIT
          ? { options: question.options }
          : {}),
      });
      continue;
    }
    /* AN ESSAY SHE HAS ALREADY APPROVED IS NOT WORK, and nothing here used to test that.
     *
     * This branch asked on the KIND and on the presence of an answer alone, "it is an essay and it
     * has words in it", so it re-raised its own row out of the answer the previous pass had just
     * saved. The sentence it prints is a claim about PROVENANCE (Litos wrote this, you have not
     * approved it) and the condition never checked provenance.
     *
     * Measured live 2026-09-04, Exa "Software Engineer, Intern" packet
     * 73768339-7fef-4493-aa75-1d47c61ae51f (ashby): four required essays, all four answered, four
     * confirming saves all returning 200, and a reload that opened on "1 of 4 / Save and next"
     * again. directInputTaskPlan turns every row emitted here into a question task unless the row
     * is settled, so four rows that could not settle were four steps that could not be walked off.
     *
     * answer_source IS THE FIELD, and it is the same one the backend's own send gate reads
     * (unapprovedLitosDraftQuestionLabels in src/lib/submissionSafety.ts), so what this screen asks
     * for and what the gate refuses to send are now one test rather than two guesses about one
     * thing. `litos_draft` is a paragraph Litos wrote that she has not approved; her save mints
     * `applicant_review` over it. That mint is the backend half of this fix (volley-backend
     * fix/answered-essay-stops-being-asked, 6440c5b): before it a confirming save moved nothing at
     * all, because the stored label carried the employer's required marker while every read path
     * served normalizeReviewQuestionLabel's output and the merge's confirmation gate compared the
     * two byte for byte.
     *
     * NOT answer_confirmed_of, which belongs to the branch below and would be the wrong field here:
     * that one is minted only by a per-question `confirmed: true` on a SENSITIVE question, and an
     * essay is a plain drafted answer no gate asks her to confirm. Reading it here would put this
     * row straight back into the loop it is leaving, because approving an essay never mints it.
     *
     * THE APPROVED ROW SETTLES RATHER THAN DISAPPEARING, for the reason every settled row in this
     * file exists: a control that vanishes the moment its job is done takes the way back with it.
     * completedSubmissionItems deliberately keeps an unsubmitted essay out of the Done column, so a
     * dropped row would leave her approved essay on no list at all, with nothing on the screen that
     * could open it again. */
    if (review.status !== "submitted" && question.kind === "essay" && answer) {
      const label = displayQuestionLabel(question.question);
      if (!applicantApprovedAnswer(question)) {
        addUnique(items, {
          id: `review-${question.id}`,
          label,
          /* Two sentences, because only one of them is a claim this screen is entitled to make.
             `litos_draft` is the server saying Litos composed the paragraph, so the row may say so.
             An absent source is an answer with nobody named, and printing "Drafted answer" over it
             would be attributing words to Litos the server never attributed. Both still ASK: see
             applicantApprovedAnswer for why absent fails closed. */
          detail: question.answer_source === "litos_draft"
            ? "Drafted answer ready for review"
            : "Ready for your review",
          action: "Review",
          actionKind: "review",
          questionId: question.id,
        });
        continue;
      }
      /* SETTLED, UNLESS THE RUN SAYS THE BOX IS STILL EMPTY, and the exception is the whole reason
         this is not one unconditional addUnique.
       *
       * The blocker naming this field is already suppressed by blockerDuplicatesQuestion, on the
       * reasoning that a question record covers it, and the `continue` below the essay branch keeps
       * the `empty-` row from ever being built for an essay. So a settled row here was the ONLY
       * thing on screen for an approved essay whose box the run measured empty: a confirmation, out
       * of the amber panel and out of the count, standing in for a required answer the employer
       * never received. Falling through hands the field to the `empty-` branch, which states the
       * one true thing about it and gives her a control that fills it. */
      if (!questionReportedEmpty(question.question, emptySubjects)) {
        addUnique(items, {
          id: `review-${question.id}`,
          label,
          /* Her own hand is worth naming back to her; a standing permission is Litos acting for her
             and must not be printed as her review. */
          detail: question.answer_source === "applicant_review"
            ? "Reviewed by you"
            : "Accepted under your standing permission",
          action: "Change",
          actionKind: "review",
          questionId: question.id,
          settled: true,
        });
        continue;
      }
    }
    /* WHEN THE SERVER SENDS ITS LIST, THE LIST IS THE WHOLE ANSWER - not one input to it.
     *
     * Measured live 2026-09-04 on Exa packet 73768339, after pressing Confirm and saving: the
     * server dropped the visa question from sensitive_questions_requiring_confirmation, so its gate
     * was satisfied - and `answer_confirmed_of` was ABSENT from the served question. It is persisted
     * and read by the backend's own gate, but it does not round-trip to this client, so
     * applicantConfirmedAnswer can never return true here no matter what she confirms.
     *
     * ORing the local label classes into the condition therefore built a row that could never
     * settle: the question kept asking, sensitiveQuestionPresent stayed true, and Send stayed
     * disabled after a successful confirmation. That is the same dead end as before with the
     * polarity flipped, and it is why the list has to be authoritative rather than additive.
     *
     * So: list present -> a row exists exactly while the server still names the question, and it
     * disappears when the server stops. List absent (an older payload) -> fall back to the label
     * classes and the confirmation field, which is precisely the previous behaviour.
     *
     * Case- and space-insensitive, because the two sides carry the same label through different
     * transports and only the TEXT is its identity. */
    const serverList = context.sensitiveConfirmations;
    const needsConfirmation = serverList
      ? serverList.some((label) => label.trim().toLowerCase() === question.question.trim().toLowerCase())
      : isHumanOnlyChecklistLabel(question.question);
    if (review.status !== "submitted" && answer && needsConfirmation) {
      /* Confirmed once is confirmed, and the row has to say so or the ask never ends. The settled
         shape keeps the control - she can still change the answer - while taking the row out of the
         amber panel and out of the "N to check" count. See applicantConfirmedAnswer. */
      const confirmed = applicantConfirmedAnswer(question);
      addUnique(items, confirmed
        ? {
          id: `confirm-${question.id}`,
          label: displayQuestionLabel(question.question),
          detail: "Confirmed by you",
          action: "Change",
          actionKind: "confirm",
          questionId: question.id,
          settled: true,
        }
        : {
          id: `confirm-${question.id}`,
          label: displayQuestionLabel(question.question),
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
        label: displayQuestionLabel(question.question),
        detail: "Answered here, still empty on the form",
        action: "Answer",
        actionKind: "answer",
        questionId: question.id,
        subject: normalizedChecklistText(question.question),
      });
    }
  }

  return items.map(withAcknowledgement);
}

/**
 * Builds the one-question-at-a-time queue without turning uncertain employer metadata into a text
 * box. `humanInputItems` decides whether a review row still needs the applicant, while
 * `questionReviewPresentation` decides whether the employer's exact prompt and accepted answers are
 * trustworthy enough to edit. A direct question must pass both decisions.
 *
 * `sensitiveConfirmations` HAS TO REACH `humanInputItems` HERE TOO, not only at the call sites that
 * build the packet screen's confirmation block. Both read `humanInputItems`; only one carried the
 * server's own list. Every caller below built its context from `{ company, role, documents }` alone,
 * so this function fell back to `isHumanOnlyChecklistLabel` unconditionally - the SAME local guess
 * the packet screen stopped trusting - and the two surfaces could name a different verdict for the
 * same question.
 *
 * Measured live 2026-09-04, Hudson River Trading application 4a79eec1-5c65-4dd4-8e72-e119fbfbd733:
 * `sensitive_questions_requiring_confirmation` was `[]`, `packet_audit.status` was `passed`, and the
 * sponsorship question already carried `answer_source: "applicant_review"` from the current review
 * round. The server had nothing left to ask. This queue asked anyway, because the label matches
 * `isHumanOnlyChecklistLabel`'s visa-sponsorship pattern regardless of what the server's list says,
 * so `directAnswerActive` stayed true over a single "confirm" task that could never settle: the
 * press it draws goes to `PUT /review/answers`, which answers on the STORED row rather than this
 * screen's belief about it, and had already refused the packet for an unrelated reason. Nothing this
 * screen could do would clear a question the server had already cleared.
 */
export function directInputTaskPlan(
  review: Pick<ApplicationReview, "attention_reason" | "attention_categories" | "attention_acknowledgements" | "cover_letter_supported" | "filled_fields" | "questions" | "question_metadata_blockers" | "questions_reviewed_at" | "required_documents" | "transcript_supported" | "stall" | "status">,
  context: { company?: string; role?: string; documents?: ChecklistDocumentMarks; sensitiveConfirmations?: readonly string[] } = {},
): DirectInputTaskPlan {
  const items = humanInputItems(review, context);
  const presentation = questionReviewPresentation(
    review.questions ?? [],
    review.question_metadata_blockers ?? [],
  );
  const questionIdCounts = new Map<string, number>();
  for (const question of review.questions ?? []) {
    questionIdCounts.set(question.id, (questionIdCounts.get(question.id) ?? 0) + 1);
  }

  const questionItemsById = new Map<string, SubmissionChecklistItem>();
  for (const item of items) {
    if (!item.questionId || questionItemsById.has(item.questionId)) continue;
    questionItemsById.set(item.questionId, item);
  }

  /* A question is ANSWERABLE HERE when its label, control and options were all read well enough to
     render a control for it. Separated from the outstanding decision below because the parent of a
     dependent question has to pass this test even when nothing is outstanding about it: it is being
     re-admitted as context, not as work. */
  const answerable = (question: ApplicationQuestion): boolean => (
    Boolean(question.id.trim())
    && Boolean(question.question.trim())
    && questionIdCounts.get(question.id) === 1
  );
  const outstandingQuestionIds = new Set(
    presentation.editableQuestions
      .filter((question) => {
        const item = questionItemsById.get(question.id);
        return answerable(question)
          && Boolean(item)
          && item?.settled !== true
          && (item?.actionKind === "answer" || item?.actionKind === "review" || item?.actionKind === "confirm");
      })
      .map((question) => question.id),
  );
  /* THE QUEUE IS CLOSED UNDER THE PARENT RELATION. See dependent-questions.ts for the measurement:
     one URL, nothing answered, "1 of 2" opening on the U.S. sanctions question became "1 of 1"
     opening on "If you selected a response to the prior question..." with that question nowhere on
     screen. A background run had settled the parent between two page loads, the queue dropped it,
     and the follow-up was left asking about an answer the applicant had never been shown, while
     the count moved under her.

     Re-admitting the parent fixes both halves with one property. It is not re-asking work that is
     done: the parent comes back at intent "review", which is the same intent the plan already uses
     for a question whose answer stands and wants looking at, so nothing is blanked and no stored
     answer is touched. */
  /* RESOLVED OVER THE EMPLOYER'S WHOLE FORM, not over the editable subset.
     `editableQuestions` has holes in it - anything held back as a metadata blocker is missing - and
     "the nearest free-standing question above" computed over a list with holes silently names the
     wrong one. A follow-up whose real parent is a Select2 whose options could not be read would be
     paired with whatever unrelated question happened to precede it, and the screen would state "The
     next question refers back to this one" about a question it does not refer to. Passing the full
     stored list means an unreadable parent resolves to itself and is then simply not re-admitted
     (it is not in editableQuestions, so the task builder skips it), which leaves the follow-up
     exactly where it was - the documented behaviour for a parent that cannot be found. */
  const requiredQuestionIds = withRequiredParentQuestionIds(
    review.questions ?? [],
    outstandingQuestionIds,
  );

  const questionTasks = presentation.editableQuestions.flatMap((question): DirectQuestionTask[] => {
    if (!requiredQuestionIds.has(question.id) || !answerable(question)) return [];
    const item = questionItemsById.get(question.id);
    if (outstandingQuestionIds.has(question.id)) {
      /* Narrowed by the outstanding filter above, which already proved both of these. */
      if (!item || (item.actionKind !== "answer" && item.actionKind !== "review" && item.actionKind !== "confirm")) return [];
      return [{ kind: "question", id: item.id, item, question, intent: item.actionKind }];
    }
    /* A parent pulled back in for its dependent. It carries the settled item's own identity when
       there is one, so navigation fingerprints and drafts keep pointing at the same row; a parent
       with no checklist item at all gets a synthetic one rather than being dropped, because
       dropping it is the defect. */
    const contextItem: SubmissionChecklistItem = item
      ? { ...item, settled: undefined, action: "Review", actionKind: "review", detail: PARENT_CONTEXT_DETAIL }
      : {
        id: `context-${question.id}`,
        label: displayQuestionLabel(question.question),
        detail: PARENT_CONTEXT_DETAIL,
        action: "Review",
        actionKind: "review",
        questionId: question.id,
      };
    return [{ kind: "question", id: contextItem.id, item: contextItem, question, intent: "review", context: true }];
  });

  const editableQuestionIds = new Set(
    presentation.editableQuestions
      .filter((question) => question.id.trim() && question.question.trim() && questionIdCounts.get(question.id) === 1)
      .map((question) => question.id),
  );
  /* A parent re-admitted for its dependent is ON SCREEN in the queue, so it must not also be
     listed as settled work: one question cannot be both the thing being looked at and an entry in
     the record of what is already done. */
  const contextQuestionIds = new Set(
    questionTasks.filter((task) => task.context === true).map((task) => task.question.id),
  );
  const settled = items.filter((item) => (
    item.settled === true
    && (!item.questionId || editableQuestionIds.has(item.questionId))
    && (!item.questionId || !contextQuestionIds.has(item.questionId))
  ));
  const nonQuestionTasks = items.flatMap((item): DirectNonQuestionTask[] => (
    item.settled !== true
      && !item.questionId
      && item.actionKind !== "answer"
      && item.actionKind !== "review"
      && item.actionKind !== "confirm"
      ? [{ kind: "non-question", id: item.id, item }]
      : []
  ));
  const current = questionTasks[0] ?? nonQuestionTasks[0] ?? null;

  return {
    questionTasks,
    nonQuestionTasks,
    settled,
    metadataBlockers: presentation.metadataBlockers,
    current,
    /* Context parents are excluded: this field is the amount of WORK outstanding, and a question
       whose answer already stands is not work. The one-at-a-time navigator counts its own steps
       (which do include the parent, and must, or the count moves between visits again). */
    remaining: questionTasks.filter((task) => task.context !== true).length + nonQuestionTasks.length,
  };
}

/**
 * Whether the metadata-refresh launch may lead the attention screen while a non-question attention
 * task still stands.
 *
 * Measured live on the Mytos Lever packet, 2026-08-28 (application
 * 55de7c9e-13c0-44fd-8f78-0dee280dbd33): the row's standing attention was a withheld press, "Litos
 * could not confirm one of the required answers had been accepted", categories ["unknown"], written
 * before the named answer was re-answered with an exact employer option. The recovery for BOTH that
 * sentence and the required metadata blocker is the same managed re-read of the employer's form,
 * and the only control that starts it lives on the panel the standing task was hiding: the
 * dashboard cycled between the answers screen and the attention screen, saving answers into a
 * packet whose launch was never on screen. A stale sentence about a run that is over must not
 * outrank the one action that replaces it with a fresh measurement.
 *
 * Nothing here clears, acknowledges, or resends anything. The stored attention state is untouched,
 * the launch is still the applicant's own explicit press, and the run it starts is the fill and
 * discovery run, which re-measures the form and rewrites the attention state from evidence.
 *
 * FAIL-CLOSED, every arm. The panel may only take precedence when:
 * - the applicant has an acknowledged, passing exact-packet audit, so the launch button behind the
 *   panel is genuinely live rather than a "Review packet first" detour;
 * - the required-question route is metadata_refresh, the one state whose only recovery is that run;
 * - every attention category is "unknown". A captcha, a security code, a pending unverified
 *   submission, a document ask, or any category naming real applicant work keeps its screen, and a
 *   review that names no category at all is unreadable rather than supersedable;
 * - no unresolved human-verification stall and no open unverified submission stand, whatever the
 *   categories claim;
 * - no direct question still awaits the applicant, and every standing non-question task is an
 *   attention-sentence row. Document rows and the captcha row are never superseded, checked here by
 *   the ids this module itself mints so a future row class fails closed.
 */
export function metadataRefreshOutranksStandingAttention(
  review: Pick<
    ApplicationReview,
    | "attention_reason"
    | "attention_categories"
    | "attention_acknowledgements"
    | "cover_letter_supported"
    | "filled_fields"
    | "questions"
    | "question_metadata_blockers"
    | "questions_reviewed_at"
    | "required_documents"
    | "transcript_supported"
    | "stall"
    | "status"
    | "unverified_submission"
  >,
  packetAuditAcknowledged: boolean,
  context: { company?: string; role?: string; documents?: ChecklistDocumentMarks } = {},
): boolean {
  if (!packetAuditAcknowledged) return false;
  if (review.status !== "needs_attention") return false;
  if (review.unverified_submission && !review.unverified_submission.resolution) return false;
  if (review.stall && !review.stall.resolved_at) return false;
  const categories = review.attention_categories ?? [];
  if (categories.length === 0) return false;
  if (categories.some((category) => category !== "unknown")) return false;
  const route = requiredQuestionReviewRoute(review.questions ?? [], review.question_metadata_blockers ?? []);
  if (route.kind !== "metadata_refresh") return false;
  const plan = directInputTaskPlan(review, context);
  if (plan.questionTasks.length > 0) return false;
  return plan.nonQuestionTasks.every((task) => (
    task.id.startsWith("blocker-")
    && task.id !== "blocker-captcha-requires-your-attention"
    /* Was two inline terms here, and is now the shared predicate: this decision and
       documentStepsInPlan have to mean the same thing by "a document row", and they were one
       edit away from not. Nothing about the fail-closed rule changes - a document row still
       stops the metadata-refresh panel from leading. */
    && !isDocumentChecklistItem(task.item)
  ));
}

/**
 * Where the dashboard lands after the answers screen's Save persists a stalled run's answers.
 *
 * The last leg of the Mytos Lever loop (application 55de7c9e-13c0-44fd-8f78-0dee280dbd33,
 * 2026-08-28). PR #438 made the unreadable required combobox demand metadata_refresh and PR #440
 * let the launch panel outrank the row's stale unknown-category attention sentence, but the save
 * handler still routed on the bare status: every Save landed the applicant back on whichever view
 * the attention state produced, with no statement anywhere of which screen actually holds the one
 * control that starts the managed re-read. The applicant cycled answers screen to attention screen
 * indefinitely, saving answers into a packet whose launch was never on screen.
 *
 * This is that statement, as one domain decision the save handler routes through:
 *
 * - "unanswered_required": the saved packet still holds a blank required answer the applicant can
 *   edit, so the answers screen KEEPS her. Fail-closed: a save must never route past a screen that
 *   still needs her typing, and the attention screen's one-question flow would re-ask what the list
 *   in front of her already shows.
 * - "metadata_refresh_launch": the saved answers leave nothing unanswered, the required-question
 *   route is metadata_refresh, and the applicant's acknowledged exact-packet audit survived the
 *   save, so metadataRefreshOutranksStandingAttention holds and the attention screen provably leads
 *   with the launch panel (the binding SubmissionScreen resolves through that same decision). The
 *   save lands there, where "Review and fill again" is on screen.
 * - "status": everything else keeps the exact status routing the save has always had, including
 *   every fail-closed arm of the launch decision: no acknowledged audit, a captcha or document row,
 *   an unresolved stall, an open unverified submission, or a non-attention status.
 *
 * Nothing here acknowledges, fills, or sends anything: this chooses a screen, and the run still
 * starts only on the applicant's own press of the launch control.
 */
export type ReviewedAnswersSaveLanding =
  | { screen: "questions"; kind: "unanswered_required" }
  | { screen: "portal"; kind: "metadata_refresh_launch" }
  | { screen: ReviewScreen; kind: "status" };

export function reviewedAnswersSaveLanding(
  review: Pick<
    ApplicationReview,
    | "attention_reason"
    | "attention_categories"
    | "attention_acknowledgements"
    | "cover_letter_supported"
    | "filled_fields"
    | "questions"
    | "question_metadata_blockers"
    | "questions_reviewed_at"
    | "required_documents"
    | "transcript_supported"
    | "stall"
    | "status"
    | "unverified_submission"
  >,
  packetAuditAcknowledged: boolean,
  context: { company?: string; role?: string; documents?: ChecklistDocumentMarks } = {},
): ReviewedAnswersSaveLanding {
  if (review.status === "needs_attention") {
    const route = requiredQuestionReviewRoute(review.questions ?? [], review.question_metadata_blockers ?? []);
    if (route.kind === "answer") return { screen: "questions", kind: "unanswered_required" };
    if (metadataRefreshOutranksStandingAttention(review, packetAuditAcknowledged, context)) {
      return { screen: "portal", kind: "metadata_refresh_launch" };
    }
  }
  return { screen: screenForStatus(review.status, "portal"), kind: "status" };
}

export function completedSubmissionItems(review: Pick<ApplicationReview, "attention_reason" | "filled_fields" | "questions" | "receipt" | "status">): SubmissionChecklistItem[] {
  const items: SubmissionChecklistItem[] = [];
  const emptySubjects = emptyFieldSubjects(compactLines(review.attention_reason));
  for (const field of review.filled_fields ?? []) {
    const label = displayField(field);
    if (!label) continue;
    if (isHumanOnlyChecklistLabel(label)) continue;
    // The run says it put a file on the form. Nothing here has seen the form, and Done is a claim
    // about the employer's form. Routed through documentClaimState rather than tested inline so the
    // one place that decides what a file claim is worth also decides what enters this column.
    if (isDocumentField(field) && documentClaimState(field, review, emptySubjects) !== "verified") continue;
    addUnique(items, {
      id: `field-${keyFor(label)}`,
      label,
    });
  }

  for (const question of review.questions ?? []) {
    const answer = (question.answer ?? "").trim();
    if (!answer) continue;
    /* An essay was excluded here for one reason: while unsubmitted it was ALWAYS an outstanding
       review row, so listing it as complete would have contradicted the panel beside it. An essay
       she has approved is no longer outstanding anywhere, and the row list drops server-settled
       rows on the packet viewer, so leaving the exclusion whole is what made an approved essay
       render on none of that screen's lists at all. Still the run's own empty report below outranks
       this, exactly as it does for every other answer. */
    if (question.kind === "essay" && review.status !== "submitted" && !applicantApprovedAnswer(question)) continue;
    if (isHumanOnlyChecklistLabel(question.question)) continue;
    // The run says this box is still empty. A stored answer is not the employer having received it,
    // and Done is a claim about the employer's form.
    if (review.status !== "submitted" && questionReportedEmpty(question.question, emptySubjects)) continue;
    addUnique(items, {
      id: `answer-${question.id}`,
      label: displayQuestionLabel(question.question),
      /* An approved essay reaches this column now, so it must not be listed under the sentence for
         a paragraph nobody has approved. Same words the checklist row uses, so the two surfaces
         describe one answer the same way. */
      detail: question.kind === "essay"
        ? (applicantApprovedAnswer(question) ? "Reviewed by you" : "Answer drafted")
        : "Answer filled",
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

type CompletedGroup = "contact" | "education" | "links" | "documents" | "eligibility" | "questions" | "other" | "confirmation";

const COMPLETED_GROUPS: Array<{ id: CompletedGroup; label: string }> = [
  { id: "contact", label: "Contact details" },
  { id: "education", label: "Education" },
  { id: "links", label: "Professional links" },
  { id: "documents", label: "Application files" },
  { id: "eligibility", label: "Eligibility and availability" },
  { id: "questions", label: "Employer questions" },
  { id: "other", label: "Other details" },
  { id: "confirmation", label: "Company confirmation" },
];

function providerFieldKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:combo|input|control|question|field|label)[_: -]*\d+\b/g, " ")
    .replace(/[_: -]+\d+\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every field name that names a FILE rather than a typed answer.
 *
 * ONE DEFINITION. The grouping row below routes on it and the claim gate under that reads it, and a
 * second copy is a copy that stops agreeing: a term added to the grouping and not to the gate would
 * put a file back in the Done column by the side door.
 */
const DOCUMENT_FIELD_PATTERN = /\b(?:resume|cv|cover letter|transcript|attachment|upload|doc(?:ument)?)\b/;

/**
 * The word that says WHICH file, for matching one report against another.
 *
 * Deliberately shorter than the pattern above. "upload", "attachment" and "document" group a field
 * fine and identify nothing, so a skipped reason mentioning an upload is not evidence about the
 * resume and must not be read as any.
 */
const DOCUMENT_KIND_PATTERN = /\b(?:resume|cv|cover letter|transcript)\b/g;

/** The words Litos prints for a file it can name. Litos spells it resume, never with accents. */
const DOCUMENT_KIND_LABELS: Record<string, string> = {
  resume: "Resume",
  "cover letter": "Cover letter",
  transcript: "Transcript",
};

/**
 * A field that names a FILE, and not a QUESTION about one.
 *
 * `question:cover letter` is a text area the run typed into, and completedSubmissionGroups already
 * skips every question-prefixed key before it groups anything, for exactly this reason. A list of
 * unconfirmed FILES that included it would be flagging a typed answer as an upload that never
 * landed, which is a fresh false statement in the column built to stop making them.
 */
function isDocumentField(value: string): boolean {
  const field = providerFieldKey(value);
  if (/^question(?: text)?\b/.test(field)) return false;
  return DOCUMENT_FIELD_PATTERN.test(field);
}

/**
 * Which FILE a string is about, as one word, or null when it names no particular one. "CV" and
 * "resume" are one file under two names on employers' forms.
 */
function namedDocumentKind(value: string): string | null {
  const kinds = (providerFieldKey(value).match(DOCUMENT_KIND_PATTERN) ?? []).map((kind) => (kind === "cv" ? "resume" : kind));
  return kinds[0] ?? null;
}

/**
 * The key a list dedupes files on, so it carries one row per file rather than one per capture.
 *
 * Falls back to the normalized field name when nothing names a kind: an "attachment" control is
 * still a file and still gets its own row, it just cannot be merged with anything.
 */
function documentFileSubject(field: string): string {
  return namedDocumentKind(field) ?? providerFieldKey(field);
}

/**
 * Whether the employer's own record has answered for this application yet.
 *
 * A receipt, or a submitted status. Both are the employer's side of the exchange rather than the
 * run's report on its own work, and only that side can settle a claim about the employer's form.
 * This is the same line the questions path stops second-guessing at, on purpose.
 */
function employerRecordConfirms(review: Pick<ApplicationReview, "receipt" | "status">): boolean {
  return Boolean(review.receipt) || review.status === "submitted";
}

/**
 * The fields a run says it did NOT put on the form, by normalized name.
 *
 * `skipped_reasons` is the run naming its own omissions, so every line here is already a report of
 * something missing and there is no blocker shape to filter for, unlike attention_reason. Empty on
 * most packets today and that is fine: absence here is silence, never evidence.
 */
function skippedFieldSubjects(reasons: readonly string[] | undefined): Set<string> {
  return new Set((reasons ?? []).map(blockerSubject).filter(Boolean));
}

/**
 * What the canonical application row says about the resume attached to THIS application.
 *
 * Structural rather than `CanonicalApplication`, for the same reason `ChecklistDocumentMarks` above
 * is structural: these three fields are all this decision reads, and binding the checklist to the
 * whole tracker row would make every future field on it an input to a list about files.
 */
export type ChecklistResumeRecord = Readonly<{
  resume_attached?: boolean;
  resume_source?: string;
  resume_attached_at?: string | null;
}>;

/**
 * The application RECORD's own answer about the resume, when it has one.
 *
 * `GET /applications` has been serving `resume_attached`, `resume_source` and `resume_attached_at`
 * on every canonical row all along, and lib/api.ts has typed all three all along, and the dashboard
 * read none of them. Another measurement on the wire and read nowhere, like `transcript_supported`
 * before it. On the DSI Innovations packet the SAME database held `resume_attached: false`,
 * `resume_source: "none"` and `submission_state: ready_for_final_approval` while this screen printed
 * "Application files, 2 items completed" over an enabled Send button.
 *
 * ONLY THE NEGATIVE IS READ, IT NEVER PROMOTES, AND IT IS NOT AN ACCUSATION. All three of those are
 * load-bearing, and the third one is where the first draft of this was wrong.
 *
 * WHAT THE FIELD ACTUALLY MEANS, read off the backend rather than guessed from the name. The column
 * is `boolean not null default false` with a CHECK constraint tying it to `resume_source`
 * (`false`/'none', or `true`/'artifact' with a selected artifact id, or `true`/'base_resume'), and
 * six places write it, four of which can write `true`: `linkExactPacket` in managedPrepare.ts at
 * PREPARE time on the managed path, `updateCanonicalApplicationAfterFill` in
 * canonicalApplications.ts on the POST /applications/:id/fill path, submissionConfirmationRepair.ts,
 * and canonicalApplicationSync.ts off the application_artifacts links, which runs inside the
 * CONFIRMED-RECEIPT transaction rather than at prepare.
 *
 * So `true` means an artifact row is linked to the record. `false` is THREE different states, not
 * one: the schema default on a packet that never went through a managed prepare, which is the
 * ORDINARY state of a perfectly healthy application; the applicant having explicitly chosen to
 * continue without attaching; and a confirmed send that genuinely carried no resume. Only the first
 * two are reachable on this screen, because a receipt silences this row entirely, so the rendered
 * calibration below is right either way. But `false` is not one fact, and a reader who treats it as
 * one will over-trust it.
 *
 * Which is why this only ever sharpens a row that is ALREADY not verified, and why it does not raise
 * the badge. A row that got here is a file nothing has confirmed; the record having nothing either
 * is a true and useful second sentence about that same uncertainty, and it is NOT proof the employer
 * got no resume. Calling it Missing would be a fresh false statement in the column built to stop
 * making them, and the applicant would go re-upload a resume that was fine.
 *
 * `true` is not evidence in the other direction either. It says a resume artifact is linked to the
 * RECORD, which is a different claim from the employer's form having received one: Hudson River
 * Trading and EQL Tech both read `resume_attached: true` with `submission_state: not_started` on
 * 2026-09-03. Promoting that to Done would be this same defect wearing a new source.
 *
 * `undefined` is an older backend, or a row this ledger never loaded. Silence, never a verdict.
 *
 * `resume_source` is deliberately not switched on. The CHECK constraint means it carries nothing
 * `resume_attached` does not already carry, and lib/api.ts types it
 * `"artifact" | "base_resume" | "none" | string` so a client branch on "none" would be a closed
 * reading of a field the client was told to treat as open.
 */
function recordHasNoResume(record: ChecklistResumeRecord | undefined): boolean {
  return record?.resume_attached === false;
}

/**
 * What a run's claim about a FILE is worth on a screen that has not seen the employer's form.
 *
 * "verified" only ever comes from the employer's own record. Everything before that is the runner
 * describing its own attempt, and DSI Innovations is what that cost on 2026-09-03: `filled_fields`
 * carried "resume" and "cover_letter", the Done column read "Application files, 2 items completed",
 * and the evidence image printed directly beside it showed the required "CV or resume *" dropzone
 * still saying "Upload a file or drag and drop here". Done is a claim about the employer's form, not
 * about what this process attempted, which is the rule the questions path in this same file already
 * states and the documents path did not follow.
 *
 * "reported_empty" is the run contradicting its own claim, in either of the two places it can say
 * so: an attention_reason blocker, or a skipped reason once the runner starts dropping an unverified
 * upload out of `filled_fields` and naming why (litos-stratus #152). NEITHER IS REQUIRED TO BE
 * PRESENT, and neither promotes anything. They only sharpen the sentence from "nobody checked this"
 * to "the run says it is not there", so this reads the same before and after that lands.
 *
 * There is deliberately no fourth state for "the run says it attached it". That WAS the defect.
 *
 * The subject match is made on the kind word rather than through `questionReportedEmpty`, which is
 * the right test for a question and the wrong one for a file: it wants more than ten characters on
 * one side before it will match a substring, and the labels a form puts on a dropzone are "resume",
 * "cv", "cover letter". "CV or resume" and "resume" share exactly the part that is the same file.
 */
type DocumentClaimState = "verified" | "reported_empty" | "unverified";

function documentClaimState(
  field: string,
  review: Pick<ApplicationReview, "receipt" | "status">,
  reportedEmptySubjects: ReadonlySet<string>,
): DocumentClaimState {
  if (employerRecordConfirms(review)) return "verified";
  const subject = documentFileSubject(field);
  for (const reported of reportedEmptySubjects) {
    if (reported.includes(subject)) return "reported_empty";
  }
  return "unverified";
}

function completedGroupForField(value: string): CompletedGroup {
  const field = providerFieldKey(value);
  if (DOCUMENT_FIELD_PATTERN.test(field)) return "documents";
  if (/\b(school|university|college|education|degree|discipline|major|graduation|graduate|gpa|coursework)\b/.test(field)) return "education";
  if (/\b(linkedin|github|portfolio|website|web site|url)\b/.test(field)) return "links";
  if (/\b(authorization|authorised|authorized|sponsorship|visa|relocation|availability|available|start date|work eligible)\b/.test(field)) return "eligibility";
  if (/\b(first name|last name|full name|preferred name|email|phone|telephone|mobile|location|address|city|country|state|postal|zip)\b/.test(field)) return "contact";
  return "other";
}

export function completedSubmissionGroups(
  review: Pick<ApplicationReview, "attention_reason" | "filled_fields" | "questions" | "receipt" | "status">,
): SubmissionChecklistItem[] {
  const emptySubjects = emptyFieldSubjects(compactLines(review.attention_reason));
  const grouped = new Map<CompletedGroup, Set<string>>();
  const add = (group: CompletedGroup, key: string) => {
    const values = grouped.get(group) ?? new Set<string>();
    values.add(key);
    grouped.set(group, values);
  };

  for (const field of review.filled_fields ?? []) {
    const key = providerFieldKey(field);
    if (!key || /^question(?: text)?\b/.test(key)) continue;
    const group = completedGroupForField(field);
    /* The same rule the row list applies, in the shape this column happens to use: a file counts as
       complete only once the employer's own record says so. An unverified file leaves this group at
       zero and the group off the Done column entirely, which is the honest shape for a count headed
       "Complete". unconfirmedDocumentItems is where the file is then named, so dropping it here
       hides nothing. */
    if (group === "documents" && documentClaimState(field, review, emptySubjects) !== "verified") continue;
    add(group, key);
  }
  for (const question of review.questions ?? []) {
    if (!(question.answer ?? "").trim()) continue;
    /* An essay was excluded here for one reason: while unsubmitted it was ALWAYS an outstanding
       review row, so listing it as complete would have contradicted the panel beside it. An essay
       she has approved is no longer outstanding anywhere, and the row list drops server-settled
       rows on the packet viewer, so leaving the exclusion whole is what made an approved essay
       render on none of that screen's lists at all. Still the run's own empty report below outranks
       this, exactly as it does for every other answer. */
    if (question.kind === "essay" && review.status !== "submitted" && !applicantApprovedAnswer(question)) continue;
    if (isHumanOnlyChecklistLabel(question.question)) continue;
    if (review.status !== "submitted" && questionReportedEmpty(question.question, emptySubjects)) continue;
    add("questions", question.id || normalizedChecklistText(question.question));
  }
  if (review.receipt || review.status === "submitted") add("confirmation", "received");

  return COMPLETED_GROUPS.flatMap(({ id, label }) => {
    const count = grouped.get(id)?.size ?? 0;
    if (count === 0) return [];
    return [{
      id: `completed-group-${id}`,
      label,
      detail: `${count} ${count === 1 ? "item" : "items"} completed`,
    }];
  });
}

/**
 * The files this run says it attached that nothing has confirmed on the employer's own form.
 *
 * The other half of the documents gate above, and it is not optional. Dropping an unverified file
 * out of Done is only half honest: the applicant is reading that list to decide whether to press
 * Send, and a file that quietly stops being mentioned reads as a file this form never asked for. So
 * it is named here instead, in the state it is actually in, beside the picture of the form it is a
 * claim about, where she can settle it in one look.
 *
 * NOT a blocker, and deliberately not routed into humanInputItems or anywhere the send gate reads.
 * Refusing a correct send is the failure that costs a real application, and nothing on this screen
 * has measured enough to refuse one. These rows carry no action, no acknowledgement tick and no
 * control: they carry a sentence, and they point at the evidence.
 *
 * `skipped_reasons` is read here and nowhere else in this file, and it is read TWICE, for the two
 * different worlds this has to be right in. Today a runner that cannot confirm an upload still lists
 * the label in `filled_fields`, so the first loop demotes the claim. Once litos-stratus #152 lands
 * the runner DROPS the label and names the reason in `skipped` instead, so there is no claim left to
 * demote and the first loop would say nothing at all about the file: the second loop is what keeps
 * it named on exactly the runs that measured it best. Neither loop needs the other to have found
 * anything.
 *
 * A file named in `attention_reason` and absent from `filled_fields` is deliberately NOT picked up
 * here. humanInputItems already emits that one, with a control that opens the employer's page, and
 * two rows for one file under two headings is the screen contradicting itself.
 *
 * `context.resume` is the canonical row's own record of the resume, and it SHARPENS rows rather than
 * creating them. A record saying no resume is attached, on an application whose run never claimed
 * one either, is not news about this send: nothing here said it had a resume, `required_documents`
 * and humanInputItems own the employer still asking for one, and a Resume row on every application
 * that has not been prepared yet is noise where this list needs to be read.
 */
export function unconfirmedDocumentItems(
  review: Pick<ApplicationReview, "attention_reason" | "filled_fields" | "receipt" | "skipped_reasons" | "status">,
  context: { resume?: ChecklistResumeRecord } = {},
): SubmissionChecklistItem[] {
  const reportedEmptySubjects = emptyFieldSubjects(compactLines(review.attention_reason));
  for (const subject of skippedFieldSubjects(review.skipped_reasons)) reportedEmptySubjects.add(subject);
  const noResumeOnRecord = recordHasNoResume(context.resume);
  const items: SubmissionChecklistItem[] = [];
  const name = (source: string, state: DocumentClaimState) => {
    const subject = documentFileSubject(source);
    const label = DOCUMENT_KIND_LABELS[subject] ?? displayField(providerFieldKey(source));
    if (!label) return;
    /* The record speaks about the RESUME and about nothing else, because the resume is the only file
       that row of the ledger describes. It never promotes, and it never raises the badge: it adds a
       second true sentence about an uncertainty this row already had. See recordHasNoResume. */
    const fromRecord = noResumeOnRecord && subject === "resume" && state !== "reported_empty";
    addUnique(items, {
      id: `unconfirmed-${keyFor(label)}`,
      label,
      detail: fromRecord
        ? "Litos says it attached this, and Litos's own application record has no resume linked to it either. Nothing here can confirm the company got one, so check the picture of the filled form."
        : state === "reported_empty"
          ? "The run reports this file is still missing from the company's form."
          : "Litos says it attached this. Nothing has confirmed it on the company's form, so check the picture of the filled form for the file name.",
      badge: state === "reported_empty" ? "Missing" : "Not confirmed",
      /* One row per FILE, not per capture. A form that names the same dropzone "resume" on one run
         and "Resume upload control_4" on the next is one file, and a file both loops below reach is
         still one file. addUnique drops the second on this subject rather than saying the same
         uncertain thing twice. */
      subject,
    });
  };
  for (const field of review.filled_fields ?? []) {
    if (!isDocumentField(field)) continue;
    const state = documentClaimState(field, review, reportedEmptySubjects);
    if (state === "verified") continue;
    name(field, state);
  }
  for (const reason of employerRecordConfirms(review) ? [] : review.skipped_reasons ?? []) {
    /* A named kind, not merely a document-shaped sentence. "upload" and "attachment" are in the
       grouping pattern and identify no file, and a skipped reason that cannot say WHICH file would
       arrive here as a row labelled with its own sentence. isDocumentField carries the other half,
       so a reason about a question ABOUT a file is not read as a reason about the file. */
    if (!isDocumentField(reason) || !namedDocumentKind(reason)) continue;
    name(reason, "reported_empty");
  }
  return items;
}
