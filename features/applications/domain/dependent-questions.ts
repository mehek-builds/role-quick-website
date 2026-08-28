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
