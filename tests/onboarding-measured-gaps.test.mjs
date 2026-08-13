import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  TEST_TYPE_LABELS,
  TEST_TYPE_OPTIONS,
  TEST_TYPE_UNANSWERED_LABEL,
} from "../features/onboarding/domain/test-scores.ts";

/* THE GAPS MEASURED ACROSS 158 PACKETS, ASKED ONCE IN ONBOARDING.
 *
 * Counted from attention_reason lines of the shape `"X" is required and is still empty`, as
 * DISTINCT packets blocked (2026-08-11):
 *
 *   standardized test score type   8      SAT score   8      ACT score   8
 *
 * Those 8 packets are 2 postings at one employer, retried four times each. The backend's
 * db/schema.ts states the bar in that unit and records why the count alone is not the argument.
 *
 * A coursework question was on this screen and was removed before merge. It needs a column on the
 * backend's `profiles` table, which has 27 bare selects and no narrowed-projection helper, so
 * declaring it ahead of its migration takes the backend down rather than degrading one feature.
 *
 * These pin the two properties that make asking the rest safe rather than merely useful:
 *
 *   1. A BLANK WRITES NOTHING. Every question here is skippable, and an untouched field must be
 *      omitted from the patch entirely so the column stays null. Null is what the resolver reads as
 *      "never asked", and it is the only thing standing between a skipped question and Litos
 *      stating an invented test score to an employer.
 *   2. EVERY QUESTION SAYS WHY IT IS ASKED. A test score reads as intrusive unless the reason is on
 *      the screen beside it.
 */

function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const RAW = readFileSync("components/start/steps.tsx", "utf8");
const STEP = code(RAW);
const API = code(readFileSync("lib/api.ts", "utf8"));

describe("the measured gaps are asked", () => {
  test("every new field has a labelled question on the gaps screen", () => {
    for (const key of ["standardized_test_type", "sat_score", "act_score"]) {
      assert.match(STEP, new RegExp(`${key}:\\s*\\{`), `${key} needs a GAP_LABEL entry`);
    }
  });

  test("the gaps screen renders each one", () => {
    assert.match(STEP, /gaps\.includes\("standardized_test_type"\)/);
    assert.match(STEP, /gaps\.includes\("sat_score"\)/);
    assert.match(STEP, /gaps\.includes\("act_score"\)/);
  });

  /* Property 2. The test question carries the note; the two score inputs do not need one because
     the question above them already explained the ask. */
  test("the test question says plainly why Litos is asking, and what each answer does", () => {
    assert.match(RAW, /GAP_LABEL\.standardized_test_type\.note/);
    const labels = RAW.slice(RAW.indexOf("const GAP_LABEL"), RAW.indexOf("export function GapsStep"));
    /* BOTH outcomes, not just the blank one. The note used to describe only what happens if she
       skips it, which left the answer that actually unblocks an application undescribed. */
    assert.match(labels, /leaves their field blank too/);
    assert.match(labels, /I have not taken either/);
  });

  /* The coursework question must not come back on its own. It needs a backend column that cannot
     ship in the same change as its migration, so a question here with no column behind it would
     save nothing and report success.

     Scoped to the WRITE PATH, not the word: ParsedProfile.coursework is a long-standing field on
     the resume parse and is read all over the app. What must not exist is a client that SENDS a
     coursework edit, and a gaps question that collects one. */
  test("no coursework question ships without its backend column", () => {
    assert.doesNotMatch(STEP, /coursework/);
    assert.doesNotMatch(API, /patchParsedProfileCoursework/);
  });
});

describe("a blank writes nothing", () => {
  /* Property 1, at its source. The patch loop skips any value that is empty after trimming, so a
     question the student passed over never reaches the body and the column stays null. */
  test("empty values are skipped before the patch is built", () => {
    assert.match(STEP, /if \(!v\.trim\(\)\) continue;/);
  });

  test("the test type select offers a real not-answered choice as its default", () => {
    assert.match(RAW, /<option value="">\{TEST_TYPE_UNANSWERED_LABEL\}<\/option>/);
    // The blank option must come first, so it is what a select shows before anyone touches it.
    const select = RAW.slice(RAW.indexOf('id="gap-standardized_test_type"'));
    assert.ok(
      select.indexOf('value=""') < select.indexOf("TEST_TYPE_OPTIONS.map"),
      "the not-answered option must be the default",
    );
  });

  /* ASSERTED ON THE VALUES, NOT ON THE SOURCE. The two tests above read the file and match a
     pattern, which is how a screen keeps passing while the thing it renders changes underneath.
     These read the exported constants the screen actually renders from, so they fail when the
     rendered words change rather than when the JSX is reformatted. */
  test("the declaration is a sentence, and it is not the refusal", () => {
    assert.equal(TEST_TYPE_LABELS.None, "I have not taken either");
    assert.equal(TEST_TYPE_UNANSWERED_LABEL, "Prefer not to answer");
    assert.notEqual(TEST_TYPE_LABELS.None, TEST_TYPE_UNANSWERED_LABEL);
  });

  test("the stored values are still the backend enum, whatever the screen calls them", () => {
    // A label leaking into the patch would post a sentence into a column typed
    // z.enum(['SAT','ACT','Both','None']) and 400 the entire save.
    assert.deepEqual([...TEST_TYPE_OPTIONS], ["SAT", "ACT", "Both", "None"]);
    for (const option of TEST_TYPE_OPTIONS) {
      assert.ok(TEST_TYPE_LABELS[option], `${option} must have a label`);
    }
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

  /* The closed list lives with the reducer in the domain module, so the screen and the state
     machine cannot disagree about what the options are. Free text would let "sat" or "None yet"
     reach a column the resolver reads as a literal answer. */
  test("the test type is a closed list matching the backend enum", () => {
    const domain = readFileSync("features/onboarding/domain/test-scores.ts", "utf8");
    assert.match(domain, /TEST_TYPE_OPTIONS = \["SAT", "ACT", "Both", "None"\]/);
    assert.match(STEP, /TEST_TYPE_OPTIONS\.map/);
  });
});

/* The select must go through the reducer that clears stale scores, not through a bare additive
   spread. The reducer's own behaviour is driven end to end in
   features/onboarding/domain/test-scores.test.mts; this only pins that the screen uses it, which is
   the wiring a regex can legitimately check. */
describe("the test-type select clears scores that no longer apply", () => {
  test("the select goes through chooseTestType", () => {
    assert.match(STEP, /onChange=\{\(e\) => setValues\(\(v\) => chooseTestType\(v, e\.target\.value\)\)\}/);
  });

  test("no additive spread is left on the test-type select", () => {
    assert.doesNotMatch(STEP, /standardized_test_type: e\.target\.value/);
  });
});

describe("the three test fields are the whole of what this screen adds", () => {
  /* Everything on this screen writes through PUT /profile/application, which is the only route the
     three columns live on. A field with no line in that route's zod schema is stripped silently: a
     200 with the value discarded, which is the failure this pins. */
  test("the save goes to the application profile route", () => {
    assert.match(API, /"\/profile\/application"[\s\S]{0,120}method: "PUT"/);
    assert.match(STEP, /await putApplicationProfile\(body\)/);
  });

  test("nothing on this screen writes to a table this PR did not migrate", () => {
    assert.doesNotMatch(STEP, /patchParsedProfile/);
  });
});
