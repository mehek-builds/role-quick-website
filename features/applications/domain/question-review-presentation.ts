import type { ApplicationQuestion, ApplicationQuestionMetadataBlocker } from "../../../lib/api.ts";
import {
  conditionAnswerIsKnownNegative,
  dependentConditionPolarity,
  dependentQuestionParents,
  optionsOfferANegative,
  optionsOfferAnAffirmative,
  promptAsksAPolarQuestion,
  questionsWithPolarFollowUps,
  subjectResolvedParents,
} from "./dependent-questions.ts";

const CLOSED_QUESTION_CONTROL = /^(?:select(?:-one|-multiple)?|radio|checkbox|combobox|listbox)$/i;
const GENERIC_ANSWER_CONTROL_LABEL = /^(?:(?:please\s+)?(?:type|enter|write)(?:\s+your)?\s+)?(?:your\s+)?(?:answer|response)(?:\s+here)?[\s.:]*$/i;

/** One optional question Litos left blank, and the condition question whose answer decided that. */
export type LeftBlankQuestion = { questionId: string; conditionQuestion: string };

export type QuestionReviewPresentation = {
  editableQuestions: ApplicationQuestion[];
  metadataBlockers: ApplicationQuestionMetadataBlocker[];
  /**
   * The optional questions in `editableQuestions` that carry `answer_state: "skipped"` because
   * LITOS left them blank, not because the applicant did. The screen needs the difference so it can
   * say which it was and name the condition, and so the badge does not credit her with a decision
   * she never made. See `questionsLeftBlankByKnownFalseCondition`.
   */
  leftBlankQuestions: LeftBlankQuestion[];
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

export function questionOptionsAreComplete(
  question: Pick<ApplicationQuestion, "options_complete" | "optionsComplete">,
): boolean {
  return question.options_complete !== false && question.optionsComplete !== false;
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

/**
 * The employer's canonical option a stored single-choice answer names, or null when it names none.
 *
 * The backend fills and validates a closed single-choice answer under trimmed, case-insensitive
 * equivalence (portalSubmission's select match, and the unfit-answer re-open PR #763 put beside
 * it), so an answer it stores and keeps can differ from the offered label by edge whitespace or
 * letter case while still being, to every server reader, that exact option. The dashboard's
 * closed-choice controls bind by byte equality, so that same stored answer used to render as
 * unanswered: measured live on the Mytos Lever packet (application 55de7c9e / packet 16f1c744,
 * 2026-08-28), the degree-classification select held the stored, server-accepted answer
 * "GPA 3.5-3.8" and still opened on "Choose an answer" every visit, so the applicant re-picked
 * the value she had already saved, which changed the answer bytes and voided her acknowledged
 * exact-packet audit.
 *
 * Returns the OFFERED label rather than the answer, so a control can bind it as its value. The
 * equivalence is exactly the fill's own, trim plus case fold, and nothing looser: interior
 * whitespace and different characters still refuse, and a blank answer names nothing, so the
 * off-list rule (an answer on no employer list must read as unanswered, never as option one,
 * measured on Five Rings 2026-08-27) is unchanged. `answer_draft`, the display-only field the
 * backend's re-open writes, is deliberately not an input here: a draft can never name a choice.
 */
export function exactQuestionOption(
  answer: string,
  options: readonly string[] | null | undefined,
): string | null {
  const target = answer.trim().toLowerCase();
  if (!target) return null;
  return usableQuestionOptions(options).find((option) => option.toLowerCase() === target) ?? null;
}

/**
 * A closed control whose stored answer names none of the options the employer offers.
 *
 * AN OFF-LIST ANSWER IS UNANSWERED, AND UNTIL NOW ONLY THE CONTROLS SAID SO. The question card
 * already resolves a stored answer through the fill path's own equivalence and falls back to the
 * placeholder when it names nothing (tests/off-list-answer-reads-as-unanswered.test.mjs). The two
 * places that decide whether a packet may GO still tested emptiness alone, and an off-list value is
 * not empty: it read as answered, so the count said nothing was waiting, the route said continue,
 * and Send rendered enabled over a value the employer's form cannot accept.
 *
 * MEASURED on the Mytos Lever packet (application 55de7c9e, 2026-08-28): "what was your degree
 * classification?", a required closed list offering First-Class Honours through GPA 3.9+ and Other,
 * carrying the stored "3.89/4.00 (US 4.0 scale)". Three of that form's four closed questions named
 * a real option; this one named none, and the packet still sat at ready_for_final_approval with
 * Send live. The send would have been spent on an application the portal refuses.
 *
 * The equivalence is the one the rest of this file already uses, not a fourth one: `exactQuestionOption`
 * for a single choice, `exactSelectedQuestionOptions` for a control that takes several. Two
 * conditions keep it from blocking a packet that is fine:
 *
 *   - the control has to be a CLOSED one. A textarea that happens to carry suggestions accepts
 *     anything the applicant types, and membership means nothing there;
 *   - the option list has to be COMPLETE. `options_complete: false` is discovery saying it saw more
 *     choices than it could keep, so an answer outside what it kept may still be on the employer's
 *     list, and calling it off-list would be this file inventing a fact.
 *
 * A blank answer returns false rather than true. It IS unanswered, but every caller tests emptiness
 * beside this, and reporting it twice would let one of them drift into calling a blank answer
 * off-list.
 */
export function answerNamesNoOfferedOption(
  question: Pick<ApplicationQuestion, "answer" | "options" | "options_complete" | "optionsComplete" | "portal_input_type">,
): boolean {
  if (!question.answer.trim()) return false;
  if (!questionOptionsAreComplete(question)) return false;
  const options = usableQuestionOptions(question.options);
  if (options.length === 0) return false;
  if (!CLOSED_QUESTION_CONTROL.test(normalizedControlType(question.portal_input_type))) return false;
  return questionAcceptsMultipleOptions(question)
    /* Null is "no single reading of this answer", which covers an answer no combination of options
       produces AND one that several produce. Both are values this control could not be left
       holding, and the direct-answer guard above the save path already refuses on the same test. */
    ? exactSelectedQuestionOptions(question.answer, options) === null
    : exactQuestionOption(question.answer, options) === null;
}

/**
 * Whether a question reads to the applicant as already answered.
 *
 * ONE RULE FOR EVERY PLACE THAT SAYS "ANSWERED". `answerNamesNoOfferedOption` above taught the
 * waiting count and the continue route that an off-list value is not an answer. The badge on the
 * question card was the third such place and still tested emptiness alone, so it printed
 * "Answered" over a closed control it had itself painted blank. This wraps the pair so the badge,
 * the count and the last gate before the employer read one rule instead of three.
 *
 * IT DOES NOT MAKE THEM AGREE EVERYWHERE, and the remaining gap is upstream of this function: the
 * question card paints a choice control on a non-empty `options` alone, while
 * `answerNamesNoOfferedOption` also requires `portal_input_type` to name a closed control. That
 * field is optional, so a question with options under an absent or unrecognised control type still
 * reads as answered here while the card paints nothing. Closing that needs one shared closed-choice
 * predicate for both, which is a separate change.
 *
 * The two conditions are exactly the ones the gate already composes at the send: a blank answer is
 * not given, and a complete closed list that holds no reading of the stored answer is not given
 * either. Everything else, including a free-text answer and a control whose options discovery
 * could not finish reading, keeps reading as answered, because refusing a correct answer costs a
 * real application and this predicate is not the place to invent doubt.
 */
export function questionReadsAsAnswered(
  question: Pick<ApplicationQuestion, "answer" | "options" | "options_complete" | "optionsComplete" | "portal_input_type">,
): boolean {
  return Boolean(question.answer?.trim()) && !answerNamesNoOfferedOption(question);
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

/** Optional rows stay actionable until the applicant answers or explicitly skips them. */
export function optionalQuestionNeedsDecision(
  question: Pick<ApplicationQuestion, "required" | "answer" | "answer_state">,
): boolean {
  return !question.required
    && !question.answer.trim()
    && question.answer_state !== "skipped";
}

/**
 * The employer's whole choice list for a control that can only hold one of those choices.
 *
 * Null for anything the membership rules below cannot speak about: an incomplete inventory
 * (`options_complete: false` is discovery saying it saw more choices than it kept), an open box
 * that happens to carry suggestions, a control type that names no closed control, and a
 * multi-select, which is not a polar question whatever its options say. Every null hands the
 * question back to the applicant, which is the safe direction.
 */
function closedSingleChoiceOptions(
  question: Pick<ApplicationQuestion, "options" | "options_complete" | "optionsComplete" | "portal_input_type">,
): string[] | null {
  if (!questionOptionsAreComplete(question)) return null;
  if (!CLOSED_QUESTION_CONTROL.test(normalizedControlType(question.portal_input_type))) return null;
  if (questionAcceptsMultipleOptions(question)) return null;
  const options = usableQuestionOptions(question.options);
  return options.length > 0 ? options : null;
}

/**
 * The optional questions Litos must leave blank rather than put in front of the applicant, each
 * mapped to the condition question whose known-false answer decided it.
 *
 * Read `dependent-questions.ts` first: it holds the measurement, the two shapes, and the reason the
 * parent link is taken off the form's own words instead of off a shared noun. This function is only
 * the composition, and it lives here because deciding what an option list means is this file's job
 * (`questionOptionsAreComplete`, `CLOSED_QUESTION_CONTROL`, `questionReadsAsAnswered`) while
 * deciding what refers back to what is that file's.
 *
 * A REQUIRED QUESTION IS NEVER LEFT BLANK BY THIS, AND THAT IS DELIBERATE, NOT AN OVERSIGHT.
 * A required question whose options are all untrue is an EMPLOYER FORM problem, and the applicant
 * is the only party who can decide what to do about it: pick the least wrong option, or abandon the
 * application. Skipping it on her behalf would send a blank required field, which the portal either
 * refuses outright or accepts as an answer she never gave. So `required` stands the rule down at
 * every one of the three places it could apply, and
 * `tests/question-with-no-true-option.test.mjs` pins it.
 *
 * NOTHING IS WRITTEN AND NOTHING IS SENT. The result is recomputed from stored answers on every
 * read, so a condition that later flips to yes brings its follow-ups straight back. The save path
 * carries the applicant's own `questions` state, never this presentation's copy.
 */
export function questionsLeftBlankByKnownFalseCondition(
  questions: readonly ApplicationQuestion[],
  /**
   * Ids this presentation is holding back because their label, control or options could not be
   * read. AN UNREADABLE CONTROL SETTLES NOTHING AND IS OWED NOTHING. Without this, a parent that
   * renders as "Exact choices not read" could still be cited as the reason its follow-up was left
   * blank, so both questions would leave the screen: the parent into a blocker card with no answer,
   * the follow-up into a blank justified by an answer the same screen has just called unreadable.
   * That composition is reachable today and gets likelier as the metadata rules tighten, so this
   * closes it here rather than relying on any other change to not create it.
   */
  unreadableQuestionIds: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const knownFalseConditions = new Map<string, string>();
  const leftBlank = new Map<string, string>();
  /* Resolved over the employer's WHOLE stored form, holes included, for the reason
     `directInputTaskPlan` documents: "the nearest free-standing question above" computed over a
     list with a metadata blocker missing from it silently names the wrong one.

     Read lazily, and the reason is cost rather than tidiness. Several screens call
     questionReviewPresentation on every render, and reading prompts is the expensive part of this
     rule, so the scan below pays for it only on a form that actually reaches shape B. */
  let provenConditions: ReadonlySet<string> | null = null;

  for (const question of questions) {
    const id = question.id?.trim();
    if (!id || knownFalseConditions.has(id)) continue;
    if (unreadableQuestionIds.has(id)) continue;
    if (!conditionAnswerIsKnownNegative(question)) continue;
    const options = closedSingleChoiceOptions(question);
    if (!options) continue;

    if (optionsOfferANegative(options)) {
      /* SHAPE A, the ordinary yes/no parent. Its own list proves it is polar, so no prompt reading
         is involved at all. She is on the no, the condition is established, and only its follow-ups
         are affected: the parent itself is answered and is left exactly as it stands. */
      if (!optionsOfferAnAffirmative(options)) continue;
      /* AND THE NO HAS TO BE ONE THE EMPLOYER OFFERED. NEGATIVE_ANSWER accepts "N/A" and "Not
         applicable", and volley writes 'N/A' into some controls, so without this the condition
         could be settled by a value this same file simultaneously reports as unanswered:
         questionReadsAsAnswered is false for it, answerNamesNoOfferedOption is true, and the card
         paints the control blank. A follow-up must never be hidden on the strength of an answer
         nothing on screen shows. This is the fill path's own equivalence, trim plus case fold, the
         one the rest of this file already uses. Shape B is different by construction: its list
         holds no negative at all, so no negative answer can ever be on it. */
      if (exactQuestionOption(question.answer, options) === null) continue;
      knownFalseConditions.set(id, question.question);
      continue;
    }

    /* SHAPE B, the parent with no way to say no. Nothing on the list proves this question is polar,
       so two independent signals have to agree before it counts: the form's own explicit follow-up
       ("If yes, what company...") and a polar opener in the prompt itself. Either one alone would
       reach questions it must not. */
    provenConditions ??= questionsWithPolarFollowUps(questions);
    if (!provenConditions.has(id)) continue;
    if (!promptAsksAPolarQuestion(question.question)) continue;
    /* A REQUIRED ONE OF THESE SETTLES NOTHING, NOT EVEN FOR ITS FOLLOW-UPS. It must reach her, and
       every option on it asserts the affirmative, so whatever she picks makes the condition TRUE.
       Registering it as known-false would blank the follow-ups of a question she is about to answer
       yes to. Shape A is different and is registered above whether it is required or not: there she
       is on a real negative option the employer offered, so the condition is settled. */
    if (question.required) continue;
    knownFalseConditions.set(id, question.question);
    /* Her own word outranks this rule in both directions: "skipped" is a decision she already made,
       and "unanswered" is what the screen writes when she presses Answer instead, which is the way
       back out of a blank Litos left. Neither is overwritten. */
    if (question.answer_state === "skipped" || question.answer_state === "unanswered") continue;
    leftBlank.set(id, question.question);
  }

  /* NOTHING BELOW CAN FIRE WITHOUT A SETTLED CONDITION, and the two walks below are the whole cost
     of this rule. Most employer forms carry no closed control answered with a negative at all, so
     leaving here is the ordinary path rather than an optimisation for a rare one. */
  if (knownFalseConditions.size === 0) return leftBlank;

  const parents = dependentQuestionParents(questions);
  const subjectParents = subjectResolvedParents(questions);
  for (const question of questions) {
    const id = question.id?.trim();
    if (!id || leftBlank.has(id) || unreadableQuestionIds.has(id)) continue;
    const parentId = parents.get(id);
    const conditionQuestion = parentId ? knownFalseConditions.get(parentId) : undefined;
    if (!conditionQuestion) continue;
    if (question.required) continue;
    /* WHICH ANSWER MAKES IT APPLY. A backward reference points up; it does not say the follow-up
       applies on a YES. "If no, will you now or in the future require sponsorship" applies BECAUSE
       the condition is false, and was blanked by it before this line existed. */
    if (dependentConditionPolarity(question.question) !== "affirmative") continue;
    /* WHICH QUESTION IT MEANS. Proximity and the follow-up's own subject have to name the SAME
       question, independently. Proximity alone put "If yes, how many years of Python experience do
       you have?" under a Rust question, and one shared word alone could not separate them because
       both questions were about experience. See subjectResolvedParents for the measurements. */
    if (subjectParents.get(id) !== parentId) continue;
    if (question.answer_state === "skipped" || question.answer_state === "unanswered") continue;
    /* An answer she can see standing in the control is hers to keep, whoever put it there. Only a
       follow-up with nothing usable in it is left blank, so this never discards a value. */
    if (questionReadsAsAnswered(question)) continue;
    leftBlank.set(id, conditionQuestion);
  }

  return leftBlank;
}

function normalizedQuestionLabel(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function questionLabelIsGenericAnswerControl(value: string | undefined): boolean {
  return GENERIC_ANSWER_CONTROL_LABEL.test(normalizedQuestionLabel(value));
}

/* The employer's own required marker, read off the question label. ASCII "*" plus the Unicode
   heavy asterisk U+2731, which Lever renders: measured live on the Mytos packet 2026-08-28, the
   university picker's label ends "attended? ✱" while its stored required flag is false,
   because the Select2 replacement control hides the native required attribute from discovery.
   Word-boundary only, so an asterisk inside a token never counts. Mirrors the backend's
   labelMarksRequired in student-outreach-backend src/lib/questionDiscovery.ts. */
const REQUIRED_MARKER = /[*✱](?:\s|$)|(?:^|\s)[*✱]/;
// A legend rather than a marker: "* indicates a required field" printed into a label block
// describes the form, not this control, and must not mark it required.
const REQUIRED_MARKER_LEGEND = /[*✱]\s*(?:indicates|denotes|means|=)\b/i;

export function questionLabelMarksRequired(value: string | undefined): boolean {
  const label = normalizedQuestionLabel(value);
  if (!label) return false;
  if (REQUIRED_MARKER_LEGEND.test(label)) return false;
  return REQUIRED_MARKER.test(label);
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
    /* THE STORED FLAG ALONE IS NOT TRUSTED HERE, and that is the whole repair. This blocker exists
       because the control's metadata could not be read, and the stored required flag is part of
       that same unread metadata. Measured live on the Mytos Lever packet (2026-08-28, application
       55de7c9e / packet 16f1c744): the university Select2 combobox stored required:false while its
       own label ends with Lever's required marker "✱", so this blocker rode required:false,
       requiredQuestionReviewRoute answered "continue" instead of "metadata_refresh", every flow
       control dropped the managed re-read intent, and the dashboard cycled between the answers
       screen and the packet review without ever offering the run that reads the employer's
       choices. The employer's own marker in the label outranks a false stored flag; a true stored
       flag stands on its own. Fail-closed either way: a required blocker holds the continue route,
       it never fills or guesses anything. */
    required: question.required || questionLabelMarksRequired(question.question),
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
      || !questionOptionsAreComplete(matchingQuestion)
      || usableQuestionOptions(matchingQuestion.options).length === 0;
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
      if (options.length === 0 || !questionOptionsAreComplete(question)) {
        blockedQuestionIds.add(question.id);
        addBlocker(syntheticMetadataBlocker(question, "missing_exact_options"));
      }
      continue;
    }
    if (CLOSED_QUESTION_CONTROL.test(controlType)
      && (options.length === 0 || !questionOptionsAreComplete(question))) {
      blockedQuestionIds.add(question.id);
      addBlocker(syntheticMetadataBlocker(question, "missing_exact_options"));
    }
  }

  /* An optional question whose condition Litos already holds a no for is not hers to decide, so it
     is presented already left blank rather than as work waiting on her. Written as `skipped`
     because that IS the state - a blank optional field with a way back - and because every reader
     of that state, the waiting count, the continue route, the "your turn" checklist and the badge,
     then agrees without a fifth rule being invented for them. The stored answer is untouched: only
     this presentation copy carries the blank, and `leftBlankQuestions` below tells the screen it
     was Litos and not her. */
  const leftBlank = questionsLeftBlankByKnownFalseCondition(
    questions,
    new Set([...blockedQuestionIds].map((questionId) => questionId.trim())),
  );

  const editableQuestions = questions.flatMap((question) => {
    if (blockedQuestionIds.has(question.id)) return [];
    const options = usableQuestionOptions(question.options);
    const staleMultiValueAnswer = questionAcceptsMultipleOptions(question)
      && exactSelectedQuestionOptions(question.answer, options) === null;
    const safeQuestion = leftBlank.has(question.id.trim())
      ? {
        ...question,
        answer: "",
        answer_state: "skipped" as const,
        ...(question.answer_draft?.trim()
          ? { answer_draft: question.answer_draft }
          : question.answer.trim() ? { answer_draft: question.answer } : {}),
      }
      : staleMultiValueAnswer
      ? {
        ...question,
        answer: "",
        ...(!question.required ? { answer_state: "unanswered" as const } : {}),
        ...(question.answer_draft?.trim()
          ? { answer_draft: question.answer_draft }
          : question.answer.trim() ? { answer_draft: question.answer } : {}),
      }
      : question;
    if (options.length === 0) {
      return question.options == null ? [safeQuestion] : [{ ...safeQuestion, options: null }];
    }
    if (question.options?.length === options.length
      && question.options.every((option, index) => option === options[index])) return [safeQuestion];
    return [{ ...safeQuestion, options }];
  });

  /* Only what actually reached the screen is announced, and under the id that reached it. A
     question held back as a metadata blocker renders no card, so naming it here would describe a
     blank nobody can see or undo; and reporting a trimmed id the card does not key on would leave
     the card printing "Skipped" over a blank the applicant never chose. */
  const leftBlankQuestions = editableQuestions.flatMap((question) => {
    const conditionQuestion = leftBlank.get(question.id.trim());
    return conditionQuestion ? [{ questionId: question.id, conditionQuestion }] : [];
  });

  return { editableQuestions, metadataBlockers, leftBlankQuestions };
}

/**
 * How many required employer questions still stand between this packet and a send.
 *
 * WHY A COUNT AND NOT A BOOLEAN. The Tracker's detail card used to say "Litos can send this
 * application for you... ready on a portal Litos can submit through" over a primary button reading
 * "Continue to send", and pressing it landed on unanswered required questions. Measured 2026-08-29.
 * `readyToSend` there meant "a sendable packet exists on a supported portal", which is true and is
 * not the same claim as "nothing is waiting on you". Saying WHICH and HOW MANY is what turns a
 * button that misleads into one that describes where it goes.
 *
 * Counts the same two things `requiredQuestionReviewRoute` routes on, and in the same order of
 * authority, so the sentence on the card and the screen the button reaches cannot disagree:
 *   - required questions rendered as editable controls whose answer is blank OR names none of the
 *     options the employer offers (see `answerNamesNoOfferedOption`: an off-list answer is not
 *     empty, and it is not something the portal can take either), and
 *   - required metadata blockers, which are questions whose label or options could not be read at
 *     all. Those need a managed re-read rather than typing, but they equally stop a send, and
 *     leaving them out would print "0 required questions" over a packet that cannot go.
 */
export function unansweredRequiredQuestionCount(
  questions: readonly ApplicationQuestion[],
  serverBlockers: readonly ApplicationQuestionMetadataBlocker[] = [],
): number {
  const presentation = questionReviewPresentation(questions, serverBlockers);
  const blank = presentation.editableQuestions.filter(
    (question) => question.required && (!question.answer.trim() || answerNamesNoOfferedOption(question)),
  ).length;
  const unreadable = presentation.metadataBlockers.filter((blocker) => blocker.required).length;
  return blank + unreadable;
}

export function requiredQuestionReviewRoute(
  questions: readonly ApplicationQuestion[],
  serverBlockers: readonly ApplicationQuestionMetadataBlocker[] = [],
): RequiredQuestionReviewRoute {
  const presentation = questionReviewPresentation(questions, serverBlockers);
  /* An off-list answer is routed to exactly like a blank one, and it has to be: the send gate
     counts it as missing, so a route that stepped over it would print "required answer missing"
     over a screen with no way to reach the question it means. */
  const firstMissing = presentation.editableQuestions.find(
    (question) => question.required && (!question.answer.trim() || answerNamesNoOfferedOption(question)),
  );
  if (firstMissing) return { kind: "answer", questionId: firstMissing.id };
  if (presentation.metadataBlockers.some((blocker) => blocker.required)) {
    return { kind: "metadata_refresh" };
  }
  return { kind: "continue" };
}
