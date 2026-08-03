import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* THE FLUENCY DECLARATION HAS TO BE ASKED SOMEWHERE.
 *
 * It was not. GapsStep owns the question ("Which languages are you fluent in?") and is rendered
 * nowhere: onboardingStepFrom can return done/resume/impact/focus/sponsorship/base and never
 * 'gaps', and app/start/page.tsx routes `case "gaps"` straight to DoneStep alongside the deleted
 * extension detour. So the only way to declare fluency was to find the field in Settings, while
 * forms asking "Do you speak German?" got nothing and Litos correctly refused to guess.
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
      "the question has to be on a reachable screen; GapsStep is not one"
    );
    assert.match(STEP, /id="base-languages"/, "the question needs a real input, not just a label");
  });

  test("the answer goes to the declaration store, not the parsed one", () => {
    assert.match(
      STEP,
      /putApplicationProfile\(\{\s*languages:/,
      "must write application_profile.languages, the store a form is answered from"
    );
    assert.doesNotMatch(
      STEP,
      /profile\/parsed/,
      "must not write parsed_json, which records only what a page printed"
    );
  });

  test("a blank answer writes nothing, so a skip is not recorded as no languages", () => {
    assert.match(
      STEP,
      /declared\.length > 0/,
      "an empty list is a different and wrong answer to the next form that asks"
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
      /if \(!demo\) await putApplicationProfile/,
      "an unguarded write breaks ?qa=1&step=base, which has no account to write against"
    );
  });

  test("the block is gated on the build finishing, not shown mid-animation", () => {
    assert.match(
      STEP,
      /finished && languageGap/,
      "asking while the resume is still building puts a question above an unfinished document"
    );
  });
});
