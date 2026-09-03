import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { questionReadsAsAnswered } from "../features/applications/domain/question-review-presentation.ts";

/* THE BADGE MUST NOT SAY "ANSWERED" OVER A CONTROL IT PAINTED BLANK.
 *
 * MEASURED live on trylitos.com, 2026-09-03, on the Hudson River Trading Greenhouse packet
 * (4a79eec1), reading the DOM rather than the screen:
 *
 *     What is your gender?   badge "Answered"   Woman/Man/Non-binary/I don't wish to answer
 *                                               every radio checked === false
 *     Are you a veteran?     badge "Answered"   Yes/No/I don't wish to answer
 *                                               "No" checked === true
 *
 * Two badges, the same word, two different states. The stored gender answer was the profile
 * spelling "Female", which no offered option holds, so the card correctly painted nothing and the
 * badge still called it answered. On a REQUIRED self-identification question that is the worst
 * possible place for the screen to be wrong: the one question actually waiting for her looked
 * finished, and it sat on a screen whose Save press continues the application.
 *
 * `answerNamesNoOfferedOption` had already taught the waiting count and the continue route that an
 * off-list value is not an answer. The badge was the third place testing emptiness alone.
 * `questionReadsAsAnswered` is that pair wrapped once so all three read one rule.
 */
const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

const radio = (answer, options) => ({
  answer,
  options,
  options_complete: true,
  optionsComplete: true,
  portal_input_type: "radio",
});

describe("questionReadsAsAnswered, on the values measured live", () => {
  test("the HRT gender question does not read as answered", () => {
    assert.equal(
      questionReadsAsAnswered(radio("Female", ["Woman", "Man", "Non-binary", "I don't wish to answer"])),
      false,
      "'Female' is on none of the offered options, so the badge must not claim it",
    );
  });

  test("the HRT veteran question beside it still reads as answered", () => {
    assert.equal(
      questionReadsAsAnswered(radio("No", ["Yes", "No", "I don't wish to answer"])),
      true,
      "a painted selection must keep its badge, or the fix trades one wrong badge for another",
    );
  });

  test("membership stays the fill path's equivalence, not byte equality", () => {
    // The Mytos Lever converse defect (application 55de7c9e, 2026-08-28). A stored answer that
    // differs only by case or padding names its option and must keep reading as answered.
    assert.equal(questionReadsAsAnswered(radio("  gpa 3.5-3.8 ", ["GPA 3.9+", "GPA 3.5-3.8", "Other"])), true);
  });

  test("a blank answer never reads as answered", () => {
    assert.equal(questionReadsAsAnswered(radio("", ["Woman", "Man"])), false);
    assert.equal(questionReadsAsAnswered(radio("   ", ["Woman", "Man"])), false);
  });

  test("free text keeps its badge, because membership means nothing there", () => {
    assert.equal(
      questionReadsAsAnswered({ answer: "Out for undergrad tech conference.", options: [], options_complete: true, optionsComplete: true, portal_input_type: "textarea" }),
      true,
    );
  });

  test("an incomplete option list does not invent doubt", () => {
    // options_complete false is discovery saying it saw more choices than it kept. Calling the
    // answer off-list there would refuse a correct send, which is the expensive direction.
    assert.equal(
      questionReadsAsAnswered({ answer: "Female", options: ["Woman", "Man"], options_complete: false, optionsComplete: false, portal_input_type: "radio" }),
      true,
    );
  });
});

describe("the badge and the send gate spell the same rule", () => {
  test("all three badge arms route through the predicate", () => {
    assert.match(page, /\? questionReadsAsAnswered\(question\) \? "Answered" : "Required"/);
    assert.match(page, /: questionReadsAsAnswered\(question\) \? "Optional, answered" : "Optional, answer or skip"/);
    assert.match(page, /question\.required && !questionReadsAsAnswered\(question\) \? "text-warn" : "text-muted"/);
  });

  test("no badge arm tests emptiness alone any more", () => {
    assert.doesNotMatch(
      page,
      /question\.answer\.trim\(\) \? "Answered" : "Required"/,
      "emptiness alone is the defect: an off-list value is not empty",
    );
    assert.doesNotMatch(page, /question\.answer\.trim\(\) \? "Optional, answered"/);
  });

  test("the last gate before the employer reads the same predicate", () => {
    assert.match(page, /question\.required\s*\n\s*&& !questionReadsAsAnswered\(question\)\)/);
  });

  test("the waiting count on the badge's own screen reads it too", () => {
    // Left on emptiness alone this count disabled nothing for an off-list answer, so the badge
    // could read Required while Save and continue stayed enabled in the same frame.
    assert.match(
      page,
      /const missingQuestions = editableQuestions\.filter\(\(question\) => question\.required && !questionReadsAsAnswered\(question\)\);/,
    );
    assert.doesNotMatch(
      page,
      /const missingQuestions = editableQuestions\.filter\(\(question\) => question\.required && !question\.answer\.trim\(\)\);/,
    );
  });
});
