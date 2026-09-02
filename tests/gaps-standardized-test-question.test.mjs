import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* THE STANDARDIZED-TEST QUESTION ON THE GAPS SCREEN.
 *
 * Gated server-side (hasSetupGapsFrom, student-outreach-backend) on a declared internship/co-op/
 * new-grad target, so `gaps` only carries "standardized_test_type" for the population it was
 * measured against (IMC Trading, DRW, Optiver internship pipelines) - this file only pins that
 * the client RENDERS the field when the server says to, and answers it correctly. It must never
 * re-derive who should see it.
 */

function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const STEPS = code(readFileSync("components/start/steps.tsx", "utf8"));

describe("the standardized-test question on the gaps screen", () => {
  test("it renders only when the server includes it in gaps, the same way every other field here does", () => {
    assert.match(
      STEPS,
      /const showTestScore = gaps\.includes\("standardized_test_type"\);/,
      "the client must read the server's own judgement, not re-derive who is a student"
    );
    assert.match(STEPS, /\{showTestScore && \(/, "the block must be conditional on the server flag");
  });

  test("the type control offers exactly the Settings page's own option set", () => {
    assert.match(
      STEPS,
      /const TEST_TYPE_OPTIONS = \["SAT", "ACT", "Both", "None"\] as const;/,
      "must match the vocabulary the backend and Settings page already write with"
    );
  });

  /* THE TWO ANSWERS THAT LOOK ALIKE AND MEAN OPPOSITE THINGS.
   *
   * "None" stores a declaration that she sat neither exam, which is the only answer that lets Litos
   * put anything in an employer's test-score field. Declining is the Skip control, which stores
   * nothing. Rendered as the raw enum they read as near-synonyms one row apart, and picking the
   * wrong one is the difference between an application that can be finished and one that cannot.
   */
  test("every offered value is said in words, and None is not left as the enum member", () => {
    const labels = STEPS.match(/const TEST_TYPE_LABELS: Record<\(typeof TEST_TYPE_OPTIONS\)\[number\], string> = \{([\s\S]*?)\};/);
    assert.ok(labels, "the screen needs a label for every stored value");
    for (const option of ["SAT", "ACT", "Both", "None"]) {
      assert.match(labels[1], new RegExp(`${option}: "[^"]+"`), `${option} needs a label`);
    }
    assert.doesNotMatch(labels[1], /None: "None"/, "the declaration must be said in words, not as the enum member");
    assert.match(labels[1], /None: "[^"]*not taken[^"]*"/, "None must read as having sat neither exam");
  });

  test("the select renders the label and still submits the stored value", () => {
    assert.match(
      STEPS,
      /<option key=\{option\} value=\{option\}>\{TEST_TYPE_LABELS\[option\]\}<\/option>/,
      "value stays the backend enum; only the text the applicant reads changes",
    );
    assert.doesNotMatch(
      STEPS,
      /<option key=\{option\} value=\{option\}>\{option\}<\/option>/,
      "rendering the raw enum is the defect this pins",
    );
  });

  test("the placeholder cannot be confused with the declaration", () => {
    // "Select one" is disabled and stores nothing; "I have not taken either" is an answer. If these
    // ever converge, the control's two most important entries become indistinguishable.
    assert.match(STEPS, /<option value="" disabled>Select one<\/option>/);
  });

  test("score inputs are conditional on the chosen type, not both always shown", () => {
    assert.match(STEPS, /\(testType === "SAT" \|\| testType === "Both"\) && \(/, "SAT score only for SAT or Both");
    assert.match(STEPS, /\(testType === "ACT" \|\| testType === "Both"\) && \(/, "ACT score only for ACT or Both");
  });

  test("a score typed before backing out to a non-matching type is never saved", () => {
    assert.match(
      STEPS,
      /if \(body\.standardized_test_type !== "SAT" && body\.standardized_test_type !== "Both"\) delete body\.sat_score;/,
      "a stray SAT score must not survive switching to ACT, Both, or None"
    );
    assert.match(
      STEPS,
      /if \(body\.standardized_test_type !== "ACT" && body\.standardized_test_type !== "Both"\) delete body\.act_score;/,
      "a stray ACT score must not survive switching to SAT, Both, or None"
    );
  });

  test("the score fields have real labels for the save-body builder to key off", () => {
    assert.match(STEPS, /sat_score: \{ label: "SAT score", placeholder: "1520" \}/);
    assert.match(STEPS, /act_score: \{ label: "ACT score", placeholder: "34" \}/);
  });
});
