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

/**
 * Regressions from the pre-merge review. Each of these is a way the panes could contradict the
 * score, which is the one failure mode this highlighting exists to prevent.
 */
describe("review regressions: the panes must agree with the score", () => {
  test("a term the score credits via plural is marked in the pane", () => {
    // The backend's resumeCovers credits singular/plural variants; an exact-key lookup here meant
    // the score said "api: covered" while the resume pane marked nothing, so the hover link to
    // "where does my resume say this" silently failed on the terms the score had credited.
    const out = segmentText("Shipped APIs and data pipelines.", idx(["api", "pipeline"]));
    assert.deepEqual(marks(out), [
      ["APIs", "covered"],
      ["pipelines", "covered"],
    ]);
  });

  test("a comma-separated resume line marks every term on it", () => {
    // normalizeTerm only separated on [-_/], so the two copies disagreed about whether a resume
    // saying "Docker, Kubernetes" contained `docker`.
    const text = "Used Docker, Kubernetes, and Terraform.";
    const out = segmentText(text, idx(["docker", "kubernetes", "terraform"]));
    assert.deepEqual(marks(out), [
      ["Docker", "covered"],
      ["Kubernetes", "covered"],
      ["Terraform", "covered"],
    ]);
    assert.equal(out.map((s) => s.text).join(""), text);
  });

  test("a digit-suffixed token tokenizes the same way the backend does", () => {
    const out = segmentText("Experience with OAuth2 and GraphQL", idx(["oauth2", "graphql"]));
    assert.deepEqual(marks(out), [
      ["OAuth2", "covered"],
      ["GraphQL", "covered"],
    ]);
  });
});

/**
 * ISSUE-047. Blue means "asked for by this job, AND on your resume", so a blue mark in the job
 * description with no blue anywhere in the resume pane is the page contradicting its own legend.
 *
 * Measured over the 85 production packets on 2026-08-09: 111 of 313 matched terms (35.5%) were
 * unanchored, across 76 of the 83 scorable packets. Most of it was fields the pane did not render
 * through RequirementText at all, which is fixed in the pane. Two causes were here.
 */
describe("a blue requirement can be found in the resume pane", () => {
  test("a hyphenated compound anchors the part the scorer credited", () => {
    // The backend's resumeCovers searches a normalized whole-text haystack, so the bullet "Built
    // LLM-agent cost infrastructure" contains ` llm ` and the requirement is counted as covered.
    // This pane matched token by token and both tokenizers keep `-` inside a token, so the
    // candidate was the two-word key `llm agent` and nothing was marked. Packets ff37b063,
    // edb20a2b, 31528fd9 and 56d9c011.
    const out = segmentText("Built LLM-agent cost infrastructure", idx(["llm"]));
    assert.deepEqual(marks(out), [["LLM", "covered"]]);
    assert.equal(out.map((s) => s.text).join(""), "Built LLM-agent cost infrastructure");
  });

  test("the whole compound still wins when the compound is itself the requirement", () => {
    const out = segmentText("Built LLM-agent cost infrastructure", idx(["llm agent"]));
    assert.deepEqual(marks(out), [["LLM-agent", "covered"]]);
  });

  test("a phrase spanning separate written words is not split into parts", () => {
    // The narrowness of the rule: it fires only where ONE written token carries its own separator.
    // Two words with a space between them are matched as a phrase or not at all.
    const out = segmentText("Built machine learning systems", idx(["machine"]));
    assert.deepEqual(marks(out), [["machine", "covered"]]);
  });

  test("a same-capability spelling is marked, and it names the requirement it satisfies", () => {
    // The scorer credits React for `frontend` (SAME_CAPABILITY_TERMS in the backend's jdMatch.ts),
    // and the resume never writes the word "frontend", so this pane had nothing to colour. It was
    // the last unanchored case on the corpus: 8 packets, all of them this.
    const index = buildRequirementIndex(
      [{ term: "frontend", display: "front-end", weight: 1, satisfied_by: "react" }],
      [],
    );
    const out = segmentText("Built the dashboard in React and TypeScript", index);
    assert.deepEqual(marks(out), [["React", "covered"]]);
    const mark = out.find((s) => s.kind === "mark");
    assert.equal(
      mark && mark.kind === "mark" ? mark.term : null,
      "frontend",
      "hovering the requirement in the JD has to lift this mark, so it carries the requirement's key",
    );
  });

  test("a requirement the posting states in its own right keeps its own key", () => {
    // A posting asking for BOTH `frontend` and `react` must not relabel React as frontend: the
    // alias only fills a key nothing else claims.
    const index = buildRequirementIndex(
      [
        { term: "frontend", display: "front-end", weight: 1, satisfied_by: "react" },
        { term: "react", display: "React", weight: 1 },
      ],
      [],
    );
    const out = segmentText("Built the dashboard in React", index);
    const mark = out.find((s) => s.kind === "mark");
    assert.equal(mark && mark.kind === "mark" ? mark.term : null, "react");
  });
});
