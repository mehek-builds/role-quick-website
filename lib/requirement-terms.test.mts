import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildRequirementIndex, segmentText, normalizeTerm } from "./requirement-terms.ts";

const idx = (covered: string[], missing: string[] = []) =>
  buildRequirementIndex(
    covered.map((t) => ({ term: t, display: t, weight: 1 })),
    missing.map((t) => ({ term: t, display: t, weight: 1 })),
  );

const marks = (segments: ReturnType<typeof segmentText>) =>
  segments.filter((s) => s.kind === "mark").map((s) => (s.kind === "mark" ? [s.text, s.tone] : []));

describe("normalizeTerm", () => {
  test("agrees with the backend on the spellings that matter", () => {
    assert.equal(normalizeTerm("CI/CD"), "ci cd");
    assert.equal(normalizeTerm("Node.js"), "nodejs");
    assert.equal(normalizeTerm("Machine-Learning"), "machine learning");
  });
});

describe("segmentText", () => {
  test("marks a covered requirement and leaves the rest alone", () => {
    const out = segmentText("Strong experience with Python and Go", idx(["python"]));
    assert.deepEqual(marks(out), [["Python", "covered"]]);
  });

  test("reassembles to exactly the original text", () => {
    const text = "Familiarity with React, PostgreSQL, and Docker.";
    const out = segmentText(text, idx(["react", "docker"], ["postgresql"]));
    assert.equal(out.map((s) => s.text).join(""), text);
  });

  test("a two-word term matches a single written token (CI/CD)", () => {
    const out = segmentText("Comfortable with CI/CD pipelines", idx(["ci cd"]));
    assert.deepEqual(marks(out), [["CI/CD", "covered"]]);
  });

  test("a phrase marks once, not as two adjacent words", () => {
    const out = segmentText("Machine Learning experience", idx(["machine learning"]));
    assert.deepEqual(marks(out), [["Machine Learning", "covered"]]);
  });

  test("covered and missing carry different tones in the same text", () => {
    const out = segmentText("We use Docker and Kubernetes", idx(["docker"], ["kubernetes"]));
    assert.deepEqual(marks(out), [
      ["Docker", "covered"],
      ["Kubernetes", "missing"],
    ]);
  });

  test("trailing punctuation stays outside the mark", () => {
    const out = segmentText("We use Docker.", idx(["docker"]));
    assert.deepEqual(marks(out), [["Docker", "covered"]]);
    assert.equal(out.map((s) => s.text).join(""), "We use Docker.");
  });

  test("an edited term is marked only where no requirement claims the word", () => {
    const out = segmentText("Shipped Docker services", idx(["docker"]), new Set(["docker", "shipped"]));
    assert.deepEqual(marks(out), [
      ["Shipped", "edited"],
      ["Docker", "covered"],
    ]);
  });

  test("no requirements means no marks, not a crash", () => {
    const out = segmentText("Anything at all", idx([]));
    assert.deepEqual(marks(out), []);
    assert.equal(out.map((s) => s.text).join(""), "Anything at all");
  });
});
