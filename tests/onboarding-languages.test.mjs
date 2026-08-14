import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* THE FLUENCY DECLARATION HAS TO BE ASKED SOMEWHERE.
 *
 * It was not. The question now lives on the base resume step so the student reaches it before the
 * server's final gap collection. The dedicated GapsStep is also reachable for any declarations
 * that remain unanswered, including referral source.
 *
 * The question now lives on the base resume step, prefilled from what the resume printed. These
 * pin the two properties that make that safe rather than just convenient:
 *
 *   - it is ASKED, not inferred. The suggestion is a starting value; the student's save is the
 *     declaration, and a blank writes nothing so a skip never records "no languages".
 *   - it writes the DECLARATION store. application_profile.languages is the authority a form is
 *     answered from; parsed_json.languages is only what a page printed, and schema.ts is explicit
 *     that the second may never become the first on its own.
 */

function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const STEP = code(readFileSync("components/start/BaseResumeStep.tsx", "utf8"));
const START = code(readFileSync("app/start/page.tsx", "utf8"));

describe("the languages declaration in onboarding", () => {
  test("the base step asks the question", () => {
    assert.match(
      STEP,
      /Which languages are you fluent in\?/,
      "the question has to be on the reachable base-resume screen"
    );
    assert.match(STEP, /id="base-languages"/, "the question needs a real input, not just a label");
  });

  test("the answer goes to the declaration store, not the parsed one", () => {
    assert.match(STEP, /profilePatch\.languages = declared/, "must stage application_profile.languages");
    assert.match(STEP, /putApplicationProfile\(profilePatch\)/, "must write the application-profile store a form is answered from");
    assert.doesNotMatch(
      STEP,
      /profile\/parsed/,
      "must not write parsed_json, which records only what a page printed"
    );
  });

  test("unchanged languages are omitted, while a deliberate clear writes an empty list", () => {
    assert.match(
      STEP,
      /if \(languages !== initial\.languages\) \{[\s\S]*?profilePatch\.languages = declared/,
      "the save must distinguish an untouched seed from an edited declaration"
    );
    assert.doesNotMatch(
      STEP,
      /declared\.length > 0/,
      "an edited blank must be able to clear a stale saved declaration"
    );
  });

  test("the suggestion is offered only where the question is still open", () => {
    assert.match(
      START,
      /languageGap=\{state\.gaps\.includes\("languages"\)\}/,
      "gaps is the server's judgement of what is unanswered; the client must not re-derive it"
    );
    assert.match(
      START,
      /languageSuggestion=\{state\.gap_suggestions\?\.languages \?\? \[\]\}/,
      "the suggestion comes from the server beside the gap it belongs to"
    );
  });

  /* persist() has carried a !demo guard since the QA harness existed. The declaration write is a
     second network call on the same button and needs the same guard: without it, pressing "Looks
     right" in a QA session 401s and reports "Could not save your resume" on the one screen the
     harness exists to make reviewable without an account. */
  test("the declaration write is guarded for QA sessions, like every other write here", () => {
    assert.match(
      STEP,
      /if \(!demo && Object\.keys\(profilePatch\)\.length > 0\) await putApplicationProfile/,
      "an unguarded write breaks ?qa=1&step=base, which has no account to write against"
    );
  });

  test("the block remains after the build finishes, even when the server gap is closed", () => {
    assert.match(
      STEP,
      /\{finished && \([\s\S]*?Which languages are you fluent in\?/,
      "the saved declaration must remain reviewable after the resume finishes building"
    );
    assert.doesNotMatch(
      STEP,
      /finished && languageGap/,
      "closing the server gap must not hide the saved profile category"
    );
    assert.match(
      STEP,
      /profile\?\.languages \?\? languageSuggestion/,
      "a saved declaration must take precedence over a resume-derived suggestion"
    );
  });
});

describe("optional race and gender preferences in onboarding", () => {
  test("the base step asks and stores race and gender preferences", () => {
    assert.match(STEP, /Optional questions about race and gender/);
    assert.match(STEP, /RACE_AND_GENDER_QUESTION_FIELDS/);
    assert.match(STEP, /JSON\.stringify\(raceAndGenderPrefs\) !== JSON\.stringify\(initial\.raceAndGenderPrefs\)/);
    assert.match(STEP, /const latest = demo \? profile : await getApplicationProfile\(\)/);
    assert.match(STEP, /const merged = \{ \.\.\.\(latest\?\.eeo_prefs \?\? \{\}\) \}/);
    assert.match(STEP, /if \(current === before\) continue/);
    assert.match(STEP, /if \(current\) merged\[field\.key\] = current/);
    assert.match(STEP, /else delete merged\[field\.key\]/);
    assert.match(STEP, /profilePatch\.eeo_prefs = Object\.keys\(merged\)\.length > 0 \? merged : null/);
    assert.match(STEP, /key: "transgender_status"/);
    assert.match(STEP, /key: "sexual_orientation"/);
    assert.doesNotMatch(STEP, /hispanic_ethnicity/);
  });
});
