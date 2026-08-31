import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/dashboard/applications/page.tsx", "utf8");
const questionsStart = source.indexOf("function QuestionsScreen");
const directStart = source.indexOf("function DirectApplicationQuestion");
const submissionStart = source.indexOf("function SubmissionScreen");
const questions = source.slice(questionsStart, directStart);
const direct = source.slice(directStart, submissionStart);

test("optional answers and Skip stay in the dashboard and persist their state", () => {
  assert.match(questions, /answer_state: "skipped" as const/);
  assert.match(questions, /answer_state: undefined/);
  assert.match(questions, />\s*Skip\s*</);
  assert.match(questions, /Answer instead/);
  assert.match(direct, /onSkip\(task\.question\.id, task\.intent/);
  assert.match(direct, /Optional\. Answer it or skip it\./);
});

test("exact multi-value choices render as dashboard checkboxes", () => {
  assert.match(questions, /questionAcceptsMultipleOptions\(question\)/);
  assert.match(questions, /type="checkbox"/);
  assert.match(questions, /answerWithExactOptionToggled\(question\.answer, question\.options/);
  assert.doesNotMatch(questions, /Answer on company page/);
});
