/**
 * ASKED, NOT DEFAULTED.
 *
 * Disability status and veteran status were collected as free text with a placeholder, next to
 * race and gender. A blank on either is answered downstream with "Decline to self-identify", so an
 * applicant who never noticed the field is recorded as having refused a legal question. On
 * 2026-08-13 the account owner said "my answer is no. I have never had a disability, nor have I
 * ever been a veteran", and her stored preferences said she had declined. She never declined.
 *
 * WHAT THESE ASSERTIONS ARE. The table and its selection rule are pure, so they are tested by
 * CALLING them, which is this suite's preferred shape. Only the two facts that are genuinely
 * structural are read out of the component source: that the onboarding step renders this table,
 * and that it preselects nothing. Both are read from shipped copy with comments stripped, because
 * an assertion a comment can satisfy is not an assertion.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const {
  SELF_ID_CHOICE_QUESTIONS,
  isSelfIdChoiceQuestion,
  selectedSelfIdChoice,
  selfIdChoicesFor,
  selfIdSelectOptions,
} = await import("../lib/self-id-choices.ts");

const baseStep = readFileSync(new URL("../components/start/BaseResumeStep.tsx", import.meta.url), "utf8");

/** Source with every comment removed, so nothing here can be satisfied by prose about the code. */
function shippedCopy(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const base = shippedCopy(baseStep);

test("both questions are asked, and only these two", () => {
  assert.deepEqual(
    SELF_ID_CHOICE_QUESTIONS.map((question) => question.key),
    ["disability_status", "veteran_status"],
  );
  assert.equal(isSelfIdChoiceQuestion("disability_status"), true);
  assert.equal(isSelfIdChoiceQuestion("veteran_status"), true);
  // Race and gender stay free text: no list this repo could write holds every true answer.
  assert.equal(isSelfIdChoiceQuestion("race"), false);
  assert.equal(isSelfIdChoiceQuestion("gender"), false);
  assert.equal(selfIdChoicesFor("race"), undefined);
});

test("each question offers exactly three choices: the affirmative, the negative and the decline", () => {
  for (const question of SELF_ID_CHOICE_QUESTIONS) {
    assert.equal(question.choices.length, 3, `${question.key} must offer three answers`);
    assert.deepEqual(
      question.choices.map((choice) => choice.kind),
      ["affirmative", "negative", "decline"],
      `${question.key} must offer one of each kind, in that order`,
    );
    // Every choice must be readable and storable, and no two may store the same thing.
    const values = question.choices.map((choice) => choice.value);
    assert.equal(new Set(values).size, 3, `${question.key} stores three distinct values`);
    for (const choice of question.choices) {
      assert.ok(choice.label.trim().length > 0, `${question.key} ${choice.kind} needs a label`);
    }
  }
});

test("the stored strings are the ones the resolver's vocabulary is keyed on", () => {
  /* THE CONTRACT WITH THE BACKEND, asserted rather than assumed. The self-identification
   * vocabulary reads "Yes" as a stated affirmative and "No" as a stated negative, respells each
   * into the board's own wording for that control, and reads "Decline to self-identify" as a
   * refusal. A surface that stores "no" or "Decline to Self-Identify" instead would land in none
   * of those branches and fall back to a refusal, which is the exact defect this whole change
   * exists to remove: a statement submitted as a refusal under her name. All three are asserted,
   * because the affirmative fails the same way the negative does and the harm is symmetric. */
  for (const question of SELF_ID_CHOICE_QUESTIONS) {
    const byKind = Object.fromEntries(question.choices.map((choice) => [choice.kind, choice.value]));
    assert.equal(byKind.affirmative, "Yes", question.key);
    assert.equal(byKind.negative, "No", question.key);
    assert.equal(byKind.decline, "Decline to self-identify", question.key);
  }
});

test("an unanswered question is unanswered, and is never the decline", () => {
  // THE ASSERTION THIS FILE EXISTS FOR. Undefined, in every shape an empty profile arrives in.
  for (const question of SELF_ID_CHOICE_QUESTIONS) {
    assert.equal(selectedSelfIdChoice(undefined, question.key), undefined, "no profile");
    assert.equal(selectedSelfIdChoice(null, question.key), undefined, "null prefs");
    assert.equal(selectedSelfIdChoice({}, question.key), undefined, "empty prefs");
    assert.equal(selectedSelfIdChoice({ [question.key]: "" }, question.key), undefined, "blank string");
    assert.equal(selectedSelfIdChoice({ [question.key]: "   " }, question.key), undefined, "whitespace");
    // And an unrelated answer on the same profile does not select one here.
    assert.equal(selectedSelfIdChoice({ race: "South Asian" }, question.key), undefined);
  }
});

test("each of the three answers round-trips, including the decline", () => {
  for (const question of SELF_ID_CHOICE_QUESTIONS) {
    for (const choice of question.choices) {
      assert.equal(
        selectedSelfIdChoice({ [question.key]: choice.value }, question.key),
        choice.value,
        `${question.key} must remember ${choice.kind}`,
      );
    }
    // A deliberate decline is a real answer and must read back as chosen, not as unanswered.
    assert.equal(
      selectedSelfIdChoice({ [question.key]: "Decline to self-identify" }, question.key),
      "Decline to self-identify",
    );
  }
});

test("a value the table does not recognise reads as unanswered rather than as an answer", () => {
  /* Fails closed in the only safe direction. Showing an unrecognised string as a selected answer
   * would tell the applicant she had answered something she never chose. */
  assert.equal(selectedSelfIdChoice({ disability_status: "Maybe" }, "disability_status"), undefined);
  assert.equal(selectedSelfIdChoice({ veteran_status: "no" }, "veteran_status"), undefined);
});

test("the settings dropdown offers the unanswered row first and then the same three", () => {
  assert.deepEqual(selfIdSelectOptions("disability_status"), ["", "Yes", "No", "Decline to self-identify"]);
  assert.deepEqual(selfIdSelectOptions("veteran_status"), ["", "Yes", "No", "Decline to self-identify"]);
  assert.deepEqual(selfIdSelectOptions("race"), []);
});

test("onboarding renders the table rather than its own copy of the answers", () => {
  assert.match(base, /SELF_ID_CHOICE_QUESTIONS\.map\(/, "onboarding must render the shared table");
  assert.match(base, /question\.choices\.map\(/, "and the choices that table defines");
  // The two questions must have left the free-text block, or they are asked twice and answered
  // twice, with the free-text answer overwriting the choice.
  const freeText = base.slice(
    base.indexOf("const RACE_AND_GENDER_QUESTION_FIELDS"),
    base.indexOf("] as const", base.indexOf("const RACE_AND_GENDER_QUESTION_FIELDS")),
  );
  assert.ok(freeText.length > 0, "the free-text table must still exist for race and gender");
  assert.doesNotMatch(freeText, /disability_status/);
  assert.doesNotMatch(freeText, /veteran_status/);
  assert.match(freeText, /race/, "race is still asked in her own words");
});

test("nothing is preselected in the markup", () => {
  /* `checked` is computed from what she stored and from nothing else, which is what makes the
   * decline a choice rather than a state she is placed in. A literal defaultValue or a checked
   * expression naming the decline would defeat the whole change. */
  assert.match(base, /checked=\{chosen\}/, "selection must come from the stored answer");
  assert.match(
    base,
    /selectedSelfIdChoice\(raceAndGenderPrefs, question\.key\) === choice\.value/,
    "and `chosen` must be exactly that comparison",
  );
  const block = base.slice(base.indexOf("SELF_ID_CHOICE_QUESTIONS.map("));
  const end = block.indexOf("RACE_AND_GENDER_QUESTION_FIELDS.map(");
  const rendered = end > 0 ? block.slice(0, end) : block;
  assert.doesNotMatch(rendered, /defaultChecked/, "no radio may be checked by default");
  assert.doesNotMatch(rendered, /Decline to self-identify/, "the decline must not be hard-coded here");
});
