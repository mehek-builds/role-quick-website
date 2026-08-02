import assert from "node:assert/strict";
import test from "node:test";
import {
  clarificationEvidenceText,
  findDeclinedKeywordClaims,
  findKeywordClarifications,
  parseClarificationAnswers,
} from "./try-keyword-clarifications.ts";

test("queues a posting keyword that the resume cannot verify", () => {
  const clarifications = findKeywordClarifications(
    "Build Python and SQL client reporting workflows.",
    "Experience building Python services. Education includes Example University.",
  );

  assert.deepEqual(
    clarifications.map((item) => item.keyword),
    ["SQL", "client reporting"],
  );
  assert.match(clarifications[0].question, /specific project, task, or result/);
});

test("queues at most three high-value gaps", () => {
  const clarifications = findKeywordClarifications(
    "Python, SQL, React, TypeScript, machine learning, and statistics are required.",
    "Experience in customer support. Education includes Example University.",
  );

  assert.equal(clarifications.length, 3);
  assert.deepEqual(
    clarifications.map((item) => item.keyword),
    ["Python", "SQL", "React"],
  );
});

test("matches whole keywords rather than fragments", () => {
  assert.deepEqual(
    findKeywordClarifications(
      "Build interfaces with React.",
      "Created reactive forms. Education includes Example University.",
    ).map((item) => item.keyword),
    ["React"],
  );
});

test("requires every queued item to have evidence or an explicit decline", () => {
  const clarifications = findKeywordClarifications(
    "Python and SQL are required.",
    "Experience in reporting. Education includes Example University.",
  );

  assert.equal(parseClarificationAnswers(clarifications, { python: null }), null);
  assert.equal(
    parseClarificationAnswers(clarifications, {
      python: "yes",
      sql: null,
    }),
    null,
  );
  assert.deepEqual(
    parseClarificationAnswers(clarifications, {
      python: "Built Python reports for a weekly operations review.",
      sql: null,
    }),
    {
      python: "Built Python reports for a weekly operations review.",
      sql: null,
    },
  );
});

test("rejects extra answer keys instead of accepting unrequested claims", () => {
  const clarifications = findKeywordClarifications(
    "Python is required.",
    "Experience in reporting. Education includes Example University.",
  );

  assert.equal(
    parseClarificationAnswers(clarifications, {
      python: "Built Python reports for a weekly operations review.",
      invented: "Led an unrelated acquisition.",
    }),
    null,
  );
});

test("only concrete answers become new candidate evidence", () => {
  const clarifications = findKeywordClarifications(
    "Python and SQL are required.",
    "Experience in reporting. Education includes Example University.",
  );
  const answers = {
    python: "Built Python reports for a weekly operations review.",
    sql: null,
  };

  assert.equal(
    clarificationEvidenceText(clarifications, answers),
    "Python: Built Python reports for a weekly operations review.",
  );
});

test("flags a declined keyword that the model still puts in a bullet", () => {
  const clarifications = findKeywordClarifications(
    "Python and SQL are required.",
    "Experience in reporting. Education includes Example University.",
  );
  const answers = { python: null, sql: null };

  assert.deepEqual(
    findDeclinedKeywordClaims(
      ["Built reporting workflows in Python.", "Improved weekly delivery.", "Partnered with analysts."],
      clarifications,
      answers,
    ),
    ["Python"],
  );
});

test("allows a keyword after the user supplies concrete evidence", () => {
  const clarifications = findKeywordClarifications(
    "Python is required.",
    "Experience in reporting. Education includes Example University.",
  );

  assert.deepEqual(
    findDeclinedKeywordClaims(
      ["Built weekly reporting workflows in Python."],
      clarifications,
      { python: "Built Python reports for a weekly operations review." },
    ),
    [],
  );
});
