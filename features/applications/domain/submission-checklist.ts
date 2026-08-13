import type { ApplicationReview, RequiredDocumentAsk } from "@/lib/api";

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
export type SubmissionChecklistAction = "open-page" | "answer" | "review" | "confirm" | "attach";

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
  | { element: "attach"; label: string; name: string; kind: string }
  | { element: "button"; label: string; name: string; intent: Exclude<SubmissionChecklistAction, "open-page" | "attach">; questionId: string };

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

const DISPLAY_ACRONYMS: Record<string, string> = {
  act: "ACT",
  ai: "AI",
  gpa: "GPA",
  imc: "IMC",
  sat: "SAT",
  uk: "UK",
  us: "US",
  usa: "USA",
  usc: "USC",
};

export function displayQuestionLabel(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const sentenceCased = trimmed === trimmed.toLowerCase()
    ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`
    : trimmed;
  return sentenceCased.replace(/\b(act|ai|gpa|imc|sat|uk|us|usa|usc)\b/gi, (token) => (
    DISPLAY_ACRONYMS[token.toLowerCase()] ?? token
  ));
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

export function humanInputItems(
  review: Pick<ApplicationReview, "attention_reason" | "attention_categories" | "filled_fields" | "questions" | "required_documents" | "transcript_supported" | "stall" | "status">,
  /* The employer, the role, and what the application already carries. None of the three is on the
     review: the first two live on the packet's job_context and the third on the submission envelope,
     so the caller supplies them. Optional, and every default is the honest one: with no company the
     sentence still names an employer as its subject, and with no document marks nothing is claimed
     to be attached. */
  context: { company?: string; role?: string; documents?: ChecklistDocumentMarks } = {},
): SubmissionChecklistItem[] {
  const items: SubmissionChecklistItem[] = [];
  for (const item of documentAskItems(review.required_documents ?? [], context, review)) addUnique(items, item);
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
        label: displayQuestionLabel(question.question),
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
        label: displayQuestionLabel(question.question),
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
      label: displayQuestionLabel(question.question),
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

function completedGroupForField(value: string): CompletedGroup {
  const field = providerFieldKey(value);
  if (/\b(resume|cv|cover letter|transcript|attachment|upload|doc(?:ument)?)\b/.test(field)) return "documents";
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
    add(completedGroupForField(field), key);
  }
  for (const question of review.questions ?? []) {
    if (!(question.answer ?? "").trim()) continue;
    if (question.kind === "essay" && review.status !== "submitted") continue;
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
