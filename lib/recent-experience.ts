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
 * A TRAILING RUN OF BLANKS MUST GO, and specifically an all-blank set must become []. The server
 * runs its strong-verb gate over every composed bullet BEFORE deduping, and a lone `{}` at index 0
 * composes to the entry's existing first bullet verbatim. That bullet came from the resume parse
 * and is under no obligation to open with a whitelisted verb ("Responsible for ..."), so sending
 * `[{}]` can 400 the request on the student's own untouched text. "Continue with what you found."
 * is the control a stuck student uses to escape this screen and it previously sent [] regardless,
 * so it has to keep working when nothing has been typed.
 *
 * Read in student-outreach-backend at 3f38555 on 2026-08-04, READ ONLY: src/routes/profile.ts
 * composes at :985, gates with startsWithStrongVerb at :988 and dedupes at :992;
 * src/engine/recentExperience.ts composeImpactBullet returns `current.trim()` when every field is
 * empty; and the PUT body schema at :129 accepts `{}` as an element because all four fields are
 * optional.
 */
export function answersToSend(answers: ImpactAnswers[], answerCount: number): ImpactAnswers[] {
  const visible = answers.slice(0, answerCount);
  let last = visible.length;
  while (last > 0 && isBlank(visible[last - 1])) last -= 1;
  return visible.slice(0, last);
}
