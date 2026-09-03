/**
 * A question that only makes sense after the one above it, and the one it refers to.
 *
 * WHY THIS EXISTS
 * ===============
 * Measured live on 2026-08-29, one application, one URL, nothing answered in between:
 *
 *   first visit    "1 of 2", opening on the U.S. sanctions question
 *   minutes later  "1 of 1", opening on "If you selected a response to the prior question..."
 *                  with the prior question nowhere on screen
 *
 * The applicant was asked to answer a follow-up to a question she had never been shown, and the
 * count moved under her while she had answered nothing. Both are the same defect: the one-question
 * queue was assembled with no notion that some employer questions are not free-standing.
 *
 * HOW A PARENT DISAPPEARS WITHOUT ANYTHING BEING ANSWERED. `directInputTaskPlan` builds its queue
 * from the questions `humanInputItems` still reports as unsettled, and that judgement comes off the
 * review's attention data - which a background fill run rewrites. So a managed run that touches the
 * sanctions question between two page loads settles it, the queue drops it, and the dependent
 * follow-up is promoted to the only task. Nothing the applicant did caused either change.
 *
 * THE RULE: THE QUEUE IS CLOSED UNDER THE PARENT RELATION. If a dependent question is in the queue,
 * the question it depends on is in the queue too, immediately before it, in the employer's own
 * order. That fixes both symptoms with one property, and it fixes the count for the reason the
 * count moved: the parent no longer leaves when a run settles it, so "1 of 2" stays "1 of 2".
 *
 * DETECTION IS DELIBERATELY NARROW, and for the same reason jd-display.ts gates its cleaning on
 * strong markers: this decides what an applicant is shown before she sends an application to an
 * employer. Only an EXPLICIT backward reference counts - "if you selected a response to the prior
 * question", "if yes", "if so", "if you answered above". A prompt that merely opens with a
 * condition of its own ("If hired, when could you start?") is free-standing and must not be
 * chained to whatever happened to be typed above it, because a false parent would drag an
 * unrelated question into her queue and re-ask something already settled.
 *
 * NOTHING IS INVENTED AND NOTHING IS HIDDEN. A dependent whose parent cannot be found - it is the
 * employer's first question, or every candidate above it is itself dependent - is left exactly
 * where it was. Refusing to show it would hide a required question, which is worse than showing it
 * without context; the count stays honest either way.
 */

type PromptShaped = { id: string; question: string };

/* Explicit backward references only. Anchored at the start, or introduced by a clause boundary, so
   the words have to be doing the referring rather than merely appearing somewhere in a long prompt.
   Each of these was written against a real employer prompt; none is speculative. */
const BACKWARD_REFERENCE_PATTERNS: readonly RegExp[] = [
  /* The live Lever prompt this was written for. */
  /\bif you (?:selected|answered|responded|indicated|checked|chose|said)\b/i,
  /* THE DEFINITE ARTICLE IS LOAD-BEARING. "the prior question" points at one specific question;
     "a prior question" ("Describe a prior question you found difficult") is an indefinite noun
     phrase inside a prompt of its own, and chaining that to whatever happened to sit above it
     would re-ask a settled question for no reason. */
  /\bthe (?:prior|previous|preceding|foregoing|above) question\b/i,
  /\bquestion above\b/i,
  /\bif (?:the )?answer (?:to|above)\b/i,
  /* "If yes" / "If no" / "If so" as the opening clause, which is how most ATS forms write a
     follow-up. Bounded to the start of the prompt: "explain if no documentation exists" is a
     free-standing instruction, not a reference to the question above it. */
  /^\s*if\s+(?:yes|no|so|not)\b/i,
  /^\s*if\s+you\s+answered\b/i,
];

/**
 * True when this prompt cannot be answered without the question above it on screen.
 *
 * Blank and whitespace-only prompts are never dependent: an unlabelled control is already handled
 * as a metadata blocker, and calling it a follow-up would attach it to a parent it has no stated
 * relationship with.
 */
export function questionDependsOnPrior(prompt: string | undefined): boolean {
  const normalized = prompt?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return false;
  return BACKWARD_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * For each dependent question, the id of the question it depends on.
 *
 * The parent is the nearest question ABOVE it in the employer's own stored order that is not itself
 * a follow-up. Walking upward past other dependents is what makes a chain ("If yes... / If yes to
 * the above...") resolve to the one real question at its head rather than to the middle of itself.
 *
 * Questions are read in the order given. That order is the employer's, preserved through
 * `questionReviewPresentation`, and it is the only evidence available about which question "the
 * prior question" names: there is no parent id on the wire. Callers that reorder before calling
 * this would be asking a different and unanswerable question.
 */
export function dependentQuestionParents(questions: readonly PromptShaped[]): Map<string, string> {
  const parents = new Map<string, string>();
  let lastFreeStandingId: string | null = null;
  for (const question of questions) {
    const id = question.id?.trim();
    if (!id) continue;
    if (questionDependsOnPrior(question.question)) {
      if (lastFreeStandingId !== null) parents.set(id, lastFreeStandingId);
      continue;
    }
    lastFreeStandingId = id;
  }
  return parents;
}

/**
 * The ids the queue must hold, given the ids it currently holds.
 *
 * Adds the parent of every outstanding dependent. Returns ids rather than tasks so the caller keeps
 * ownership of what a task IS - `directInputTaskPlan` needs the checklist item and the intent that
 * go with each question, and neither belongs in this module.
 *
 * Idempotent, and it does not add a parent's parent: a parent is by definition free-standing, so
 * there is no chain to walk. A dependent already accompanied by its parent adds nothing.
 */
export function withRequiredParentQuestionIds(
  questions: readonly PromptShaped[],
  outstandingIds: ReadonlySet<string>,
): Set<string> {
  const parents = dependentQuestionParents(questions);
  const required = new Set(outstandingIds);
  for (const id of outstandingIds) {
    const parentId = parents.get(id);
    if (parentId) required.add(parentId);
  }
  return required;
}

/* ================================================================================================
 * A CONDITION THE EMPLOYER ASKS ABOUT THAT LITOS ALREADY HOLDS A NO FOR
 * ================================================================================================
 *
 * MEASURED live on the Hudson River Trading Greenhouse packet (application 4a79eec1, account
 * a18f774b, 2026-09-03) and confirmed against the employer's own published form
 * (boards-api.greenhouse.io/v1/boards/wehrtyou/jobs/8052083?questions=true), questions 15 and 16 in
 * the employer's own order:
 *
 *   15  "Do you have any upcoming offer deadlines?"   optional, combobox, options complete
 *       Less than 2 weeks | 2 to 4 weeks | More than 4 weeks | I have an offer with no deadline
 *       stored answer "No"
 *   16  "If yes, what company (or companies) do you have an offer from?"   optional, text
 *
 * EVERY ONE OF THOSE FOUR CHOICES ASSERTS THAT SHE HAS AN OFFER. She has none. There is no option
 * on that list she can truthfully pick, so the honest answer, the one Litos already resolved and
 * stored, is a word the employer never offered. It is on no option, so the control paints blank,
 * the badge reads "Optional, answer or skip", and the question re-opens on every visit.
 * `optionalQuestionNeedsDecision` then feeds `continuationBlocked`, so a question nobody can answer
 * truthfully holds the screen, and her only exit is Skip: a decision recorded about a question that
 * should never have reached her.
 *
 * WHAT MAKES QUESTION 15 A CONDITION RATHER THAN A GUESS. Question 16 opens "If yes", which is the
 * form itself stating, in its own words, that the question above it is answerable yes or no. That
 * is the same explicit backward reference `questionDependsOnPrior` above already detects, resolved
 * by the same `dependentQuestionParents` walk, so the link is read off the employer's markup rather
 * than inferred from two prompts happening to share a noun. Pairing on a shared noun is the failure
 * this whole module is built to avoid: a false pair SUPPRESSES a real question, which is far worse
 * than asking one extra.
 *
 * TWO SHAPES, AND ONLY TWO.
 *
 *   A. THE ORDINARY YES/NO PARENT. Its own list offers both a yes and a no, she is on the no, and
 *      its "If yes..." follow-ups are therefore not hers. Nothing about the parent changes; it is
 *      answered. Common on greenhouse, lever and workable ("Do you require sponsorship?" No,
 *      then "If yes, what type?").
 *
 *   B. THE PARENT WITH NO WAY TO SAY NO. Question 15. Its list offers no negative option at all, so
 *      the negative Litos holds cannot be placed, and neither the parent nor its follow-ups are
 *      hers. Because nothing on the list proves the question is polar, this shape needs TWO
 *      corroborating signals before it counts: a polar opener in the prompt AND the form's own
 *      explicit follow-up. "Please select your top preferred HRT office location" (question 20 on
 *      the same form, whose follow-up 21 opens "If you equally prefer") has neither, and a rule
 *      that reached it would hide a genuine choice behind an answer nobody made.
 *
 * NOTHING HERE INVENTS AN ANSWER. Picking "Less than 2 weeks" because it is first is the Five Rings
 * incident (2026-08-27) exactly: an off-list answer let a control impersonate "Coffee Chat" and
 * would have told an employer about a meeting that never happened. The only outcomes available in
 * this file are LEAVE IT BLANK and DO NOTHING.
 */

/**
 * A stored answer that says no.
 *
 * WHOLE-ANSWER ONLY. "No" is a negative answer; "I have an offer with no deadline" is an
 * affirmative one that happens to contain the word, and a substring test would read the second as
 * the first on the very form this was written against.
 */
const NEGATIVE_ANSWER = /^(?:no|nope|none|n\/?a|not applicable|no offers?|none at (?:this|the) (?:time|moment))[.!]?$/i;

/**
 * An offered option a person with nothing to declare could truthfully pick.
 *
 * Anchored at the START and closed with a word boundary, which is doing real work in both
 * directions: "November 2026" must not read as "no", and "I have an offer with no deadline" must
 * not read as "I have no". Deliberately generous about what counts as a negative, because finding
 * one here STANDS THE RULE DOWN and hands the question back to the applicant.
 */
const NEGATIVE_OPTION = /^(?:no|nope|none|n\/?a|neither|not\s+(?:applicable|at\s+(?:this|the)\s+(?:time|moment))|i\s+(?:do\s+not|don'?t|am\s+not|have\s+no(?:ne)?)\b)\b/i;

/** An offered option that says yes. Paired with the above to recognise a genuine yes/no list. */
const AFFIRMATIVE_OPTION = /^(?:yes|yep|yeah|i\s+(?:do|am|have|would|will)\b)\b/i;

/**
 * A prompt that asks something answerable yes or no.
 *
 * Used ONLY for shape B, where the option list cannot prove polarity by itself, and never alone:
 * the form's own explicit follow-up has to agree. An auxiliary verb followed by a subject is the
 * whole test, because that is what a polar question is in English. "How did you hear about HRT?",
 * "What is your preferred coding language?" and "Please select your top preferred HRT office
 * location" all fail it, and all three sit on the same measured form.
 */
const POLAR_QUESTION_OPENER = /^\s*(?:do|does|did|are|is|was|were|have|has|had|will|would|can|could|should|shall|may|might|must|am)\b\s+(?:you|your|there|any|it|we|the|this|they)\b/i;

/** True when this prompt asks something answerable yes or no. */
export function promptAsksAPolarQuestion(prompt: string | undefined): boolean {
  const normalized = prompt?.replace(/\s+/g, " ").trim() ?? "";
  return Boolean(normalized) && POLAR_QUESTION_OPENER.test(normalized);
}

/** True when some question in this form explicitly refers back to the question with this id. */
export function questionsWithExplicitDependents(questions: readonly PromptShaped[]): Set<string> {
  return new Set(dependentQuestionParents(questions).values());
}

/** True when at least one offered option lets her say no. */
export function optionsOfferANegative(options: readonly string[]): boolean {
  return options.some((option) => NEGATIVE_OPTION.test(option.trim()));
}

/** True when at least one offered option lets her say yes. */
export function optionsOfferAnAffirmative(options: readonly string[]): boolean {
  return options.some((option) => AFFIRMATIVE_OPTION.test(option.trim()));
}

/**
 * Whether the answer Litos holds for this question says no.
 *
 * THE RE-OPENED DRAFT IS READ AS EVIDENCE, NEVER AS AN ANSWER. `answer_draft` is display-only by
 * contract: it must never feed a control's value or stand in for `answer`, and it is never sent
 * back. None of that is happening here. The backend's `reopenUnfitClosedChoiceQuestions` blanks a
 * closed-choice answer that fits no exact option and parks it in the draft, so on the second read
 * of the very packet this was measured on, the stored "No" has moved from `answer` to
 * `answer_draft` with nothing else changed. Reading only `answer` would mean the rule fired before
 * that pass and stopped firing after it, on identical facts. The draft is consulted to decide
 * whether to ASK her something, and the only thing it can produce is a blank field.
 */
export function conditionAnswerIsKnownNegative(
  question: { answer?: string; answer_draft?: string },
): boolean {
  const answer = question.answer?.trim() ?? "";
  if (answer) return NEGATIVE_ANSWER.test(answer);
  const draft = question.answer_draft?.trim() ?? "";
  return Boolean(draft) && NEGATIVE_ANSWER.test(draft);
}
