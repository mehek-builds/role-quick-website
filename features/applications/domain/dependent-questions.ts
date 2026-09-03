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

/**
 * The ids of questions the form's own words prove are answerable yes or no.
 *
 * A follow-up counts only when it STATES which way it points ("if yes", "if no", "if you answered
 * yes"). A backward reference that states no polarity ("If you selected a response to the prior
 * question") proves that a question sits above it and nothing at all about that question's shape,
 * so it is not evidence that the question above is polar. See dependentConditionPolarity below,
 * which is declared after this and is why this reads it lazily rather than at module scope.
 */
export function questionsWithPolarFollowUps(questions: readonly PromptShaped[]): Set<string> {
  const parents = dependentQuestionParents(questions);
  const proven = new Set<string>();
  for (const question of questions) {
    const id = question.id?.trim();
    if (!id) continue;
    const parentId = parents.get(id);
    if (!parentId) continue;
    if (dependentConditionPolarity(question.question) === "unstated") continue;
    proven.add(parentId);
  }
  return proven;
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

/* ================================================================================================
 * WHICH FOLLOW-UPS A KNOWN-FALSE CONDITION ACTUALLY TAKES WITH IT
 * ================================================================================================
 *
 * TWO THINGS ARE TRUE OF A FOLLOW-UP AND ONLY ONE OF THEM IS PROVED BY `questionDependsOnPrior`.
 * That predicate proves a follow-up refers BACKWARD. It proves nothing about WHICH answer above
 * makes the follow-up apply, and nothing about WHICH question above it means. Both gaps are
 * harmless where this module started, because `withRequiredParentQuestionIds` only ever ADDS a
 * question to the queue and a spurious addition costs one extra screen. Leaving an optional
 * question blank SUBTRACTS one. Under subtraction each gap is a way to take a question off the
 * screen that the applicant was owed, so each needs its own evidence.
 *
 * GAP ONE: POLARITY. `BACKWARD_REFERENCE_PATTERNS` deliberately matches "if no" and "if not"
 * alongside "if yes", and this module's own test asserts that it does. A follow-up opening "if no"
 * APPLIES EXACTLY WHEN THE CONDITION IS FALSE. Measured on the merged tree before this was added:
 *
 *   "Are you legally authorized to work in the United States?"  = No
 *   "If no, will you now or in the future require sponsorship for an employment visa?"
 *       -> left blank, badged "Left blank by Litos"
 *
 * That is the most consequential question on a US application form, hidden by the very answer that
 * makes it apply, and only `required` stood between it and the employer. So a follow-up is taken
 * with its condition only when its own opener is AFFIRMATIVE. "If no", "If not" and "If you
 * answered no" are never taken. Neither is an opener that states no polarity at all ("If you
 * selected a response to the prior question"): unstated is not affirmative, and guessing which way
 * it points is the whole error being fixed here.
 *
 * GAP TWO: WHICH PARENT. `dependentQuestionParents` resolves to the NEAREST free-standing question
 * above, which is the best available reading and is still only proximity. A closer question can
 * steal parenthood from the real one:
 *
 *   "Do you hold an active security clearance?"      = Yes
 *   "Are you willing to relocate?"                   = No     <- nearest above, so it is named
 *   "If yes, what level of clearance do you hold?"           -> left blank against relocation
 *
 * Proximity cannot tell those apart, so subtraction additionally requires the follow-up to be about
 * the same thing as the parent it was matched to: one content word in common, after generic form
 * vocabulary is removed. "clearance"/"level" against "willing"/"relocate" share nothing and the
 * pair is refused; "visa" against "visa sponsorship", and "offer" against "offer deadlines", both
 * hold. A follow-up with no content of its own ("If yes, please explain.") shares nothing with
 * anything and is simply asked, which costs one screen and cannot hide a question.
 */

/** Whether a follow-up applies when the question above it was answered yes, no, or unknowably. */
export type DependentConditionPolarity = "affirmative" | "negative" | "unstated";

/* Checked before the affirmative list, so a prompt that names both ("if no, unlike if yes...")
   resolves to the reading that keeps the question on screen. */
const NEGATIVE_CONDITION_OPENERS: readonly RegExp[] = [
  /^\s*if\s+(?:no|not)\b/i,
  /^\s*if\s+(?:you|the\s+applicant)\s+(?:answered|said|selected|responded|indicated|checked|chose|choose|reply|replied)\s*["'“‘]?\s*(?:with\s+)?["'“‘]?\s*no\b/i,
  /^\s*if\s+(?:the\s+)?answer\s+(?:to\s+[^,.?]{0,80}\s+)?(?:is|was|above\s+is)\s*["'“‘]?\s*no\b/i,
];

const AFFIRMATIVE_CONDITION_OPENERS: readonly RegExp[] = [
  /^\s*if\s+(?:yes|so)\b/i,
  /^\s*if\s+(?:you|the\s+applicant)\s+(?:answered|said|selected|responded|indicated|checked|chose|choose|reply|replied)\s*["'“‘]?\s*(?:with\s+)?["'“‘]?\s*yes\b/i,
  /^\s*if\s+(?:the\s+)?answer\s+(?:to\s+[^,.?]{0,80}\s+)?(?:is|was|above\s+is)\s*["'“‘]?\s*yes\b/i,
];

/**
 * Which answer above makes this follow-up apply.
 *
 * Only the opener is read. A "yes" appearing later in a long prompt is part of what the follow-up
 * ASKS, not the condition under which it is asked, and reading it as the condition is how "if no,
 * will you require sponsorship" would be classified affirmative on the strength of its own answer
 * options.
 */
export function dependentConditionPolarity(prompt: string | undefined): DependentConditionPolarity {
  const normalized = prompt?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "unstated";
  if (NEGATIVE_CONDITION_OPENERS.some((pattern) => pattern.test(normalized))) return "negative";
  if (AFFIRMATIVE_CONDITION_OPENERS.some((pattern) => pattern.test(normalized))) return "affirmative";
  return "unstated";
}

/* GENERIC APPLICATION-FORM VOCABULARY, which is most of what two unrelated prompts have in common.
   Erring long is the safe direction: every word added here makes some pair share nothing, and a
   pair that shares nothing is asked rather than hidden. */
const SUBJECT_STOPWORDS: ReadonlySet<string> = new Set([
  "able", "about", "above", "additional", "after", "again", "against", "also", "answer", "answered",
  "answers", "applicable", "applicant", "application", "applications", "apply", "applying", "asked",
  "aware", "back", "been", "before", "being", "below", "best", "both", "brief", "briefly", "candidate",
  "candidates", "cannot", "check", "checked", "choose", "chose", "chosen", "company", "companies",
  "complete", "confirm", "consider", "could", "current", "currently", "date", "dates", "describe",
  "description", "detail", "details", "does", "done", "during", "each", "else", "email", "employer",
  "employers", "employment", "explain", "field", "fields", "first", "following", "form", "from",
  "further", "give", "have", "held", "here", "hold", "holds", "indicate", "indicated", "information",
  "interested", "into", "itself", "know", "last", "least", "less", "like", "list", "listed", "made",
  "make", "many", "message", "month", "months", "more", "most", "much", "must", "name", "names",
  "need", "needs", "number", "numbers", "only", "option", "options", "other", "others", "over",
  "part", "phone", "please", "position", "positions", "previous", "prior", "provide", "provided",
  "question", "questions", "rate", "reply", "respond", "response", "responses", "role", "roles",
  "said", "same", "select", "selected", "share", "short", "should", "since", "some", "specify",
  "such", "tell", "than", "that", "their", "them", "then", "there", "these", "they", "this", "those",
  "through", "time", "times", "type", "types", "under", "until", "upon", "used", "using", "very",
  "want", "well", "were", "what", "when", "where", "whether", "which", "while", "will", "with",
  "within", "without", "would", "year", "years", "your", "yours", "yourself",
]);

/**
 * The content words a prompt is about, with generic form vocabulary and short words removed.
 *
 * A crude plural fold is enough and a real stemmer would be worse than useless here: this set is
 * only ever intersected with another one, so an over-eager stem creates a false match, which is the
 * expensive direction.
 */
function subjectTerms(prompt: string): Set<string> {
  const terms = new Set<string>();
  for (const raw of prompt.toLowerCase().replace(/[^a-z]+/g, " ").split(" ")) {
    if (raw.length < 4 || SUBJECT_STOPWORDS.has(raw)) continue;
    const stem = raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
    if (stem.length < 4 || SUBJECT_STOPWORDS.has(stem)) continue;
    terms.add(stem);
  }
  return terms;
}

/** True when two prompts name at least one thing in common that is not form furniture. */
export function promptsShareASubject(one: string | undefined, other: string | undefined): boolean {
  const first = subjectTerms(one ?? "");
  if (first.size === 0) return false;
  const second = subjectTerms(other ?? "");
  for (const term of second) if (first.has(term)) return true;
  return false;
}

/**
 * Whether this follow-up is one its condition takes with it when the condition is false.
 *
 * Both gaps closed at once, and BOTH are required. Polarity says the follow-up applies on a yes;
 * the shared subject says the question it applies to is the one proximity named. Either alone lets
 * a real question off the screen, which the two measurements at the top of this section are.
 */
export function dependentGoesWithAFalseCondition(
  dependentPrompt: string | undefined,
  conditionPrompt: string | undefined,
): boolean {
  return dependentConditionPolarity(dependentPrompt) === "affirmative"
    && promptsShareASubject(dependentPrompt, conditionPrompt);
}
