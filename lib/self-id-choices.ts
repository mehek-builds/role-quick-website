/* THE TWO SELF-IDENTIFICATION QUESTIONS THAT HAVE AN ANSWER, AND THE THREE ANSWERS EACH ONE HAS.
 *
 * WHY THIS FILE EXISTS. Disability status and veteran status were collected as free text with a
 * placeholder reading "Yes, No, Decline to self-identify", alongside race, gender and the rest.
 * Free text is the right shape for race, where the answer is a category nobody can enumerate for
 * an applicant. It is the wrong shape for these two, where the answer is one of exactly three
 * things and every US form asks it the same way.
 *
 * The cost of the wrong shape is not cosmetic. A field left blank is answered downstream with
 * "Decline to self-identify", so an applicant who never saw the question is recorded as having
 * refused it, on a legal form, under her own name. On 2026-08-13 the account owner said plainly:
 * "my answer is no. I have never had a disability, nor have I ever been a veteran", and her stored
 * preferences said she had declined to say. She never declined. She was never asked.
 *
 * NOTHING IS PRESELECTED, AND THAT IS THE WHOLE POINT. selectedSelfIdChoice returns undefined for
 * an unanswered question rather than the decline, so the decline is reachable in one click and is
 * never the state the applicant is put in by default. Declining is a real answer and stays on the
 * list; it just has to be chosen.
 *
 * THE STORED VALUES ARE THE CONTRACT WITH THE BACKEND and are the reason this table is a module
 * rather than two literals in a component. `value` is what lands in application_profile.eeo_prefs,
 * and the resolver's self-identification vocabulary is keyed on exactly these strings: "No" is what
 * it reads as a stated negative and respells into each board's own wording, and
 * "Decline to self-identify" is what it reads as a refusal. Onboarding and the account settings
 * page both render from here so the two surfaces cannot drift into storing different words for the
 * same answer, which is how a refusal and a statement get confused.
 */

export type SelfIdChoice = {
  /** Exactly what is written into eeo_prefs. Not display text. */
  value: string;
  /** What the applicant reads. May be longer than the value; must mean the same thing. */
  label: string;
  /** Which of the three kinds this is, so a test can assert the set rather than the strings. */
  kind: "affirmative" | "negative" | "decline";
};

export type SelfIdChoiceQuestion = {
  /** The eeo_prefs key. */
  key: string;
  /** The field name on both surfaces. */
  label: string;
  /** One sentence saying why the question is here and what happens if it is left alone. */
  help: string;
  choices: readonly SelfIdChoice[];
};

const DECLINE_VALUE = "Decline to self-identify";

export const SELF_ID_CHOICE_QUESTIONS: readonly SelfIdChoiceQuestion[] = [
  {
    key: "disability_status",
    label: "Do you have a disability, or have you had one in the past?",
    help: "Employers ask this on a voluntary federal form. Answering here means Litos never has to guess.",
    choices: [
      { value: "Yes", label: "Yes", kind: "affirmative" },
      { value: "No", label: "No", kind: "negative" },
      { value: DECLINE_VALUE, label: "I would rather not say", kind: "decline" },
    ],
  },
  {
    key: "veteran_status",
    label: "Are you a protected veteran?",
    help: "Asked on the same voluntary federal form, and answered the same way.",
    choices: [
      { value: "Yes", label: "Yes", kind: "affirmative" },
      { value: "No", label: "No", kind: "negative" },
      { value: DECLINE_VALUE, label: "I would rather not say", kind: "decline" },
    ],
  },
];

/** The three choices this question offers, or undefined when it is not one of the two. */
export function selfIdChoicesFor(key: string): readonly SelfIdChoice[] | undefined {
  return SELF_ID_CHOICE_QUESTIONS.find((question) => question.key === key)?.choices;
}

/** Is this eeo_prefs key asked as a fixed three-way choice rather than as free text? */
export function isSelfIdChoiceQuestion(key: string): boolean {
  return SELF_ID_CHOICE_QUESTIONS.some((question) => question.key === key);
}

/**
 * The choice currently selected for this question, or undefined when it has not been answered.
 *
 * UNDEFINED IS NOT "DECLINE". It is the honest reading of an unanswered question and the reason the
 * decline cannot become a default by accident: nothing here ever substitutes one for the other, in
 * either direction. A stored value that is not one of the three is also undefined rather than
 * silently coerced, so an answer this table does not recognise shows as unanswered instead of being
 * displayed as an answer the applicant did not give.
 */
export function selectedSelfIdChoice(
  prefs: Record<string, string> | null | undefined,
  key: string,
): string | undefined {
  const stored = prefs?.[key]?.trim();
  if (!stored) return undefined;
  return selfIdChoicesFor(key)?.some((choice) => choice.value === stored) ? stored : undefined;
}

/** The values a settings dropdown offers for one of these keys, with the unanswered row first. */
export function selfIdSelectOptions(key: string): string[] {
  const choices = selfIdChoicesFor(key);
  return choices ? ["", ...choices.map((choice) => choice.value)] : [];
}
