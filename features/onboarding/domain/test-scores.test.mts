import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  TEST_TYPE_LABELS,
  TEST_TYPE_OPTIONS,
  TEST_TYPE_UNANSWERED_LABEL,
  chooseTestType,
} from "./test-scores.ts";

/* CHANGING THE ANSWER REMOVES THE SCORES THAT NO LONGER APPLY.
 *
 * The gaps screen never removed anything: the save patch iterated everything typed and both
 * setState calls were additive spreads, so a value that stopped being VISIBLE went on being SENT.
 * Choosing "Both", filling 1520 and 34, then answering "None" posted all three, the API stored it,
 * and the resolver then told one employer she had taken no standardized test and that her SAT was
 * 1520.
 *
 * These drive the real reducer through the real click sequences and assert on the BODY that would
 * go on the wire, because the defect was in what the state machine did, not in how it was spelled.
 */

/** Replay a sequence of interactions: `{ type }` is the select, anything else is typing. */
function afterClicks(...steps: Array<Record<string, string>>) {
  let values: Record<string, string> = {};
  for (const step of steps) {
    if (step.type !== undefined) values = chooseTestType(values, step.type);
    else values = { ...values, ...step };
  }
  return values;
}

/** What GapsStep's save() would put on the wire: the patch loop skips empty values. */
function body(values: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) if (v && v.trim()) out[k] = v.trim();
  return out;
}

describe("changing the test clears the scores that no longer apply", () => {
  test("the exact sequence from the defect: Both, fill both, then None", () => {
    const values = afterClicks(
      { type: "Both" },
      { sat_score: "1520" },
      { act_score: "34" },
      { type: "None" },
    );
    assert.deepEqual(body(values), { standardized_test_type: "None" });
  });

  test("Both, fill both, then the decline option sends nothing at all", () => {
    const values = afterClicks(
      { type: "Both" },
      { sat_score: "1520" },
      { act_score: "34" },
      { type: "" },
    );
    assert.deepEqual(body(values), {});
  });

  test("narrowing Both to SAT drops the ACT score and keeps the SAT one", () => {
    const values = afterClicks(
      { type: "Both" },
      { sat_score: "1520" },
      { act_score: "34" },
      { type: "SAT" },
    );
    assert.deepEqual(body(values), { standardized_test_type: "SAT", sat_score: "1520" });
  });

  test("narrowing Both to ACT drops the SAT score", () => {
    const values = afterClicks(
      { type: "Both" },
      { sat_score: "1520" },
      { act_score: "34" },
      { type: "ACT" },
    );
    assert.deepEqual(body(values), { standardized_test_type: "ACT", act_score: "34" });
  });

  test("a coherent answer is untouched", () => {
    const values = afterClicks({ type: "Both" }, { sat_score: "1520" }, { act_score: "34" });
    assert.deepEqual(body(values), {
      standardized_test_type: "Both",
      sat_score: "1520",
      act_score: "34",
    });
  });

  /* Deleting the key rather than blanking it is what makes this hold: a value kept in state and
     merely hidden comes back the moment the student returns to the option that shows it. */
  test("switching away and back does not resurrect the old score", () => {
    const values = afterClicks(
      { type: "SAT" },
      { sat_score: "1520" },
      { type: "None" },
      { type: "SAT" },
    );
    assert.deepEqual(body(values), { standardized_test_type: "SAT" });
  });

  test("the cleared keys are absent, not blank", () => {
    const values = chooseTestType({ sat_score: "1520", act_score: "34" }, "None");
    assert.equal("sat_score" in values, false);
    assert.equal("act_score" in values, false);
  });

  /* Other answers on the screen are not this question's business, and clearing them would lose a
     GPA the student had already typed. */
  test("unrelated answers survive a test-type change", () => {
    const values = afterClicks(
      { gpa: "3.89" },
      { type: "SAT" },
      { sat_score: "1520" },
      { type: "None" },
    );
    assert.equal(values.gpa, "3.89");
  });
});

/* THE TWO ANSWERS THAT LOOK ALIKE AND MEAN OPPOSITE THINGS.
 *
 * The blank option stores nothing: she has not answered, and Litos hands every test-score field
 * back to her for ever. "None" stores a declaration that she took neither, which is the only
 * answer that lets Litos put something on an employer's form. Rendered as the raw enum they read
 * as near-synonyms on a list where they sit one row apart, and picking the wrong one is the
 * difference between an application that can be finished and one that cannot.
 */
describe("naming the answers", () => {
  test("every stored value has a label, and no label is the enum member for None", () => {
    for (const option of TEST_TYPE_OPTIONS) {
      const label = TEST_TYPE_LABELS[option];
      assert.ok(label && label.trim().length > 0, `${option} needs a label`);
    }
    assert.notEqual(TEST_TYPE_LABELS.None, "None", "the declaration must be said in words");
    assert.match(TEST_TYPE_LABELS.None, /not taken/);
  });

  test("the declaration and the refusal cannot be read as each other", () => {
    // The one assertion this block exists for. If these two ever converge, the screen is asking a
    // question whose two most important answers are indistinguishable.
    assert.notEqual(TEST_TYPE_LABELS.None, TEST_TYPE_UNANSWERED_LABEL);
    assert.doesNotMatch(TEST_TYPE_LABELS.None, /prefer not|decline|rather not/i);
    assert.doesNotMatch(TEST_TYPE_UNANSWERED_LABEL, /not taken|neither|none/i);
  });

  test("the labels are for the screen only: the stored values are untouched", () => {
    /* The wire format is the backend enum and nothing here may change it. A label leaking into the
     * patch would post "I have not taken either" into a column typed
     * z.enum(['SAT','ACT','Both','None']) and 400 the whole save. */
    assert.deepEqual([...TEST_TYPE_OPTIONS], ["SAT", "ACT", "Both", "None"]);
    assert.equal(afterClicks({ type: "None" }).standardized_test_type, "None");
    assert.equal(body(afterClicks({ type: "None" })).standardized_test_type, "None");
  });

  test("choosing the declaration still clears the scores, as it did before", () => {
    // The reducer is unchanged by this and the guarantee it carries must not be lost to a rename.
    const values = afterClicks({ type: "Both" }, { sat_score: "1520" }, { act_score: "34" }, { type: "None" });
    assert.equal(body(values).sat_score, undefined);
    assert.equal(body(values).act_score, undefined);
    assert.equal(body(values).standardized_test_type, "None");
  });
});
