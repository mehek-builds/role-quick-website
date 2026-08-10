import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* THE GAPS MEASURED ACROSS 158 PACKETS, ASKED ONCE IN ONBOARDING.
 *
 * Counted from attention_reason lines of the shape `"X" is required and is still empty`, as
 * DISTINCT packets blocked (2026-08-11):
 *
 *   standardized test score type   9      SAT score   9      ACT score   9
 *   coursework                     printed identically on all 158, including a Data Science
 *                                  internship and a quant trading internship
 *
 * These pin the three properties that make asking them safe rather than merely useful:
 *
 *   1. A BLANK WRITES NOTHING. Every question here is skippable, and an untouched field must be
 *      omitted from the patch entirely so the column stays null. Null is what the resolver reads as
 *      "never asked", and it is the only thing standing between a skipped question and Litos
 *      stating an invented test score to an employer.
 *   2. EVERY QUESTION SAYS WHY IT IS ASKED. A test score or a course history reads as intrusive
 *      unless the reason is on the screen beside it.
 *   3. COURSEWORK IS NOT AN APPLICATION_PROFILE FIELD, and must not be sent as one.
 */

function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const RAW = readFileSync("components/start/steps.tsx", "utf8");
const STEP = code(RAW);
const API = code(readFileSync("lib/api.ts", "utf8"));

describe("the measured gaps are asked", () => {
  test("every new field has a labelled question on the gaps screen", () => {
    for (const key of ["coursework", "standardized_test_type", "sat_score", "act_score"]) {
      assert.match(STEP, new RegExp(`${key}:\\s*\\{`), `${key} needs a GAP_LABEL entry`);
    }
  });

  test("the gaps screen renders each one", () => {
    assert.match(STEP, /gaps\.includes\("coursework"\)/);
    assert.match(STEP, /gaps\.includes\("standardized_test_type"\)/);
    assert.match(STEP, /gaps\.includes\("sat_score"\)/);
    assert.match(STEP, /gaps\.includes\("act_score"\)/);
  });

  /* Property 2. The two questions a student is most likely to find intrusive carry a note; the two
     score inputs do not need one because the question above them already explained the ask. */
  test("coursework and the test question each say plainly why Litos is asking", () => {
    assert.match(RAW, /GAP_LABEL\.coursework\.note/);
    assert.match(RAW, /GAP_LABEL\.standardized_test_type\.note/);
    const labels = RAW.slice(RAW.indexOf("const GAP_LABEL"), RAW.indexOf("export function GapsStep"));
    assert.match(labels, /Litos picks the ones that fit each posting/);
    assert.match(labels, /Leave it blank and Litos leaves their field blank too/);
  });
});

describe("a blank writes nothing", () => {
  /* Property 1, at its source. The patch loop skips any value that is empty after trimming, so a
     question the student passed over never reaches the body and the column stays null. */
  test("empty values are skipped before the patch is built", () => {
    assert.match(STEP, /if \(!v\.trim\(\)\) continue;/);
  });

  test("the test type select offers a real not-answered choice as its default", () => {
    assert.match(RAW, /<option value="">Prefer not to answer<\/option>/);
    // The blank option must come first, so it is what a select shows before anyone touches it.
    const select = RAW.slice(RAW.indexOf('id="gap-standardized_test_type"'));
    assert.ok(
      select.indexOf('value=""') < select.indexOf("TEST_TYPE_OPTIONS.map"),
      "the not-answered option must be the default",
    );
  });

  test("the whole screen is still skippable", () => {
    assert.match(STEP, /onDone\(true\)/);
  });
});

describe("the score and the test it belongs to travel together", () => {
  /* A stored 1520 with no declared type cannot tell an ACT field to stay empty, and the backend
     enum would reject a score saved against no type. Same pairing rule GPA and salary already use. */
  test("a score with no test type fails the save rather than storing half an answer", () => {
    assert.match(STEP, /hasScore && !body\.standardized_test_type/);
    assert.match(RAW, /Choose which test you took, or clear the score\./);
  });

  test("a score input only appears once its test is named", () => {
    assert.match(RAW, /values\.standardized_test_type === "SAT" \|\| values\.standardized_test_type === "Both"/);
    assert.match(RAW, /values\.standardized_test_type === "ACT" \|\| values\.standardized_test_type === "Both"/);
  });

  test("the test type is a closed list matching the backend enum", () => {
    assert.match(RAW, /TEST_TYPE_OPTIONS = \["SAT", "ACT", "Both", "None"\]/);
  });
});

describe("coursework is saved where it actually lives", () => {
  /* Property 3. coursework is on `profiles`, beside `skills`, because the resume tailorer must read
     it and application_profile's contract is that nothing in it reaches a drafting prompt. Sending
     it to PUT /profile/application would be silently stripped by that route's zod schema: a 200
     with the value discarded, which is the failure this assertion exists to prevent. */
  test("it goes to the parsed-profile route, not the application profile", () => {
    assert.match(API, /patchParsedProfileCoursework/);
    assert.match(API, /"\/profile\/parsed"[\s\S]{0,120}method: "PATCH"/);
    assert.match(STEP, /await patchParsedProfileCoursework\(coursework\)/);
  });

  test("it is never put on the application profile body", () => {
    const save = STEP.slice(STEP.indexOf("async function save()"), STEP.indexOf("function field("));
    assert.doesNotMatch(save, /body\.coursework/);
    assert.match(save, /k === "coursework"/);
  });

  test("a comma separated line becomes a list, because the column stores an array", () => {
    assert.match(STEP, /coursework = v\.split\(","\)\.map\(\(s\) => s\.trim\(\)\)\.filter\(Boolean\)/);
  });

  /* Saving only coursework is still a save, not a skip. Reporting it as skipped would tell the
     backend the screen was passed over when the student had in fact answered it. */
  test("coursework alone counts as answered", () => {
    assert.match(STEP, /onDone\(Object\.keys\(body\)\.length === 0 && !coursework\)/);
  });
});
