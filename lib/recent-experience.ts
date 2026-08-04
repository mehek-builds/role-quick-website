import type { ImpactComponent } from "./api";

/* The two answer-handling rules of the recent-experience step, kept out of the component so they
 * can be tested by BEHAVIOUR rather than by grepping JSX. Both exist because an answer is a claim
 * about a specific job, and both failures they prevent are the same failure: a claim ending up
 * attached to work it does not describe.
 *
 * `import type` only, so nothing here pulls lib/api (and its window access) into a node test. */

export type ImpactAnswers = Partial<Record<ImpactComponent, string>>;

/** The blank answer set. One definition for the initial state and for the reset on re-pick, so the
 *  two cannot drift apart. Three because the step never asks for more: the server caps
 *  `missing_bullets` at 3 and its PUT schema caps `answers` at 3. */
export const blankAnswers = (): ImpactAnswers[] => [{}, {}, {}];

/** Whether the student left this whole answer set empty. */
export function isBlank(answer: ImpactAnswers): boolean {
  return Object.values(answer).every((value) => !value?.trim());
}

/**
 * The answers to keep when the student picks a candidate.
 *
 * Switching entry drops them: they were typed about the entry that was selected when they were
 * typed. Re-picking was impossible before the chooser was made reopenable, so this is a path the
 * fix for that opened, and it was reproduced in a browser: type an answer about one employer,
 * switch the radio, save, and the PUT carried the first employer's answer attached to the second
 * entry.
 *
 * Guarded on the id rather than run on every pick, because a second click on the ALREADY selected
 * radio, or reopening the chooser to look and picking the same entry again, must not throw away
 * work the student has typed about that very entry.
 */
export function answersForPick(
  previousId: string | null,
  pickedId: string,
  answers: ImpactAnswers[],
): ImpactAnswers[] {
  return pickedId === previousId ? answers : blankAnswers();
}

/**
 * The answers to PUT, which is not simply the visible slice. Trailing blanks are dropped and
 * nothing else is, for two reasons that pull in opposite directions.
 *
 * BLANKS IN THE MIDDLE MUST STAY. The server composes answers POSITIONALLY, and index 0 is
 * special: it is composed against the entry's existing first bullet. Compacting the array would
 * slide an accomplishment the student wrote about their second bullet onto their first.
 *
 * A TRAILING RUN OF BLANKS GOES, so that "Continue with what you found." with nothing typed sends
 * `[]` exactly as it did before this step grew answer fieldsets. This is now tidiness rather than
 * a defence: a blank set composes server-side either to text already in the bank, which the server
 * recognises as an echo and drops, or to an empty string when the entry has no bullets yet, which
 * the server discards before it looks at anything. Kept because sending three empty objects asks
 * the server to do work with no possible effect, and because this app deploys separately from the
 * backend.
 *
 * Do NOT let this grow into dropping leading or interior blanks. Whether a blank at index 0 is
 * safe is the server's business, not this function's; here the only invariant is that an answer
 * keeps the index it was typed at.
 *
 * Re-derived against student-outreach-backend d9285df plus the pending change to it: the PUT
 * handler in src/routes/profile.ts delegates to `applyImpactAnswers` in
 * src/engine/recentExperience.ts, which composes positionally with index 0 against the entry's
 * existing first bullet, recognises echoes of the bank, and only then judges what is left. Named
 * by function rather than by line, because line numbers in that handler have already gone stale
 * once in this comment's history. The PUT body schema accepts `{}` as an element because all four
 * answer fields are optional.
 */
export function answersToSend(answers: ImpactAnswers[], answerCount: number): ImpactAnswers[] {
  const visible = answers.slice(0, answerCount);
  let last = visible.length;
  while (last > 0 && isBlank(visible[last - 1])) last -= 1;
  return visible.slice(0, last);
}
