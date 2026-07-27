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

  // --- regressions, both found by reading the rendered page rather than the tests.

  test("a comma-suffixed term still matches, and the comma stays outside the mark", () => {
    // On a real posting, "Familiarity with React, PostgreSQL, and Docker" marked ONLY Docker: the
    // two terms the student did have went uncredited in the pane while the score counted them.
    const text = "Familiarity with React, PostgreSQL, and Docker";
    const out = segmentText(text, idx(["react", "postgresql", "docker"]));
    assert.deepEqual(marks(out), [
      ["React", "covered"],
      ["PostgreSQL", "covered"],
      ["Docker", "covered"],
    ]);
    assert.equal(out.map((s) => s.text).join(""), text);
  });

  test("a mark never swallows a line break or the next bullet's dash", () => {
    // "PostgreSQL\n-" normalized to "postgresql" when a lone dash counted as a word, so the mark
    // ran past the end of the line and coloured the next bullet's dash.
    const text = "- Design REST APIs backed by PostgreSQL\n- Own services on AWS";
    const out = segmentText(text, idx(["postgresql", "aws"]));
    for (const [marked] of marks(out)) {
      assert.ok(!marked.includes("\n"), `mark "${marked}" crossed a line break`);
      assert.ok(!marked.includes("-"), `mark "${marked}" swallowed a dash`);
    }
    assert.deepEqual(marks(out), [
      ["PostgreSQL", "covered"],
      ["AWS", "covered"],
    ]);
    assert.equal(out.map((s) => s.text).join(""), text);
  });

  test("a phrase does not form across a comma or a newline", () => {
    const out = segmentText("Docker, Kubernetes", idx(["docker kubernetes"], []));
    assert.deepEqual(marks(out), [], "a list separator is not a phrase boundary to cross");
  });

  test("C++ and C# survive edge stripping", () => {
    const out = segmentText("Experience with C++ and C#.", idx(["c++", "c#"]));
    assert.deepEqual(marks(out), [
      ["C++", "covered"],
      ["C#", "covered"],
    ]);
  });

  test("no requirements means no marks, not a crash", () => {
    const out = segmentText("Anything at all", idx([]));
    assert.deepEqual(marks(out), []);
    assert.equal(out.map((s) => s.text).join(""), "Anything at all");
  });
});
