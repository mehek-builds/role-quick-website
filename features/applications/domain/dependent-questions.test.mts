import assert from "node:assert/strict";
import test from "node:test";
import { dependentQuestionParents, questionDependsOnPrior, withRequiredParentQuestionIds } from "./dependent-questions.ts";
import { directInputTaskPlan } from "./submission-checklist.ts";

/**
 * MEASURED, 2026-08-29, one application, one URL, nothing answered in between:
 *   first visit    "1 of 2", opening on the U.S. sanctions question
 *   minutes later  "1 of 1", opening on "If you selected a response to the prior question..."
 *                  with the prior question nowhere on screen
 */
const SANCTIONS_PROMPT =
  "select all that apply. note: this information will only be used to ensure compliance with u.s. sanctions";
const FOLLOW_UP_PROMPT =
  "If you selected a response to the prior question, please provide additional detail.";

test("an explicit backward reference is a follow-up", () => {
  assert.equal(questionDependsOnPrior(FOLLOW_UP_PROMPT), true);
  assert.equal(questionDependsOnPrior("If yes, please explain."), true);
  assert.equal(questionDependsOnPrior("If no, why not?"), true);
  assert.equal(questionDependsOnPrior("If you answered yes above, give dates."), true);
  assert.equal(questionDependsOnPrior("Please expand on the previous question."), true);
  assert.equal(questionDependsOnPrior("If the answer to the question above is yes, attach proof."), true);
});

test("a prompt carrying its own condition is free-standing, and is not chained to whatever sat above it", () => {
  /* THE EXPENSIVE FALSE POSITIVE. A wrong parent drags an unrelated question into her queue and
     re-asks something already settled, which is the defect this module exists to prevent, pointed
     the other way. Detection stays narrow for the same reason jd-display.ts gates on strong
     markers: this decides what she is shown before an application goes to an employer. */
  assert.equal(questionDependsOnPrior("If hired, when could you start?"), false);
  assert.equal(questionDependsOnPrior("Are you legally authorized to work in the United States?"), false);
  assert.equal(questionDependsOnPrior("Explain if no documentation exists."), false);
  assert.equal(questionDependsOnPrior("Describe a prior question you found difficult."), false);
  assert.equal(questionDependsOnPrior(SANCTIONS_PROMPT), false);
  assert.equal(questionDependsOnPrior(""), false);
  assert.equal(questionDependsOnPrior(undefined), false);
});

test("the parent is the nearest free-standing question above, walking past other follow-ups", () => {
  const questions = [
    { id: "sanctions", question: SANCTIONS_PROMPT },
    { id: "detail", question: FOLLOW_UP_PROMPT },
    { id: "dates", question: "If yes to the above, give dates." },
    { id: "start", question: "If hired, when could you start?" },
  ];
  const parents = dependentQuestionParents(questions);
  assert.equal(parents.get("detail"), "sanctions");
  // A chain resolves to the real question at its head, not to the middle of itself.
  assert.equal(parents.get("dates"), "sanctions");
  // Free-standing questions have no parent, including one that merely opens with "If".
  assert.equal(parents.has("sanctions"), false);
  assert.equal(parents.has("start"), false);
});

test("a follow-up with no question above it is left exactly where it is", () => {
  /* Nothing is invented and nothing is hidden: refusing to show it would hide a required question,
     which is worse than showing it without context. */
  const parents = dependentQuestionParents([{ id: "orphan", question: FOLLOW_UP_PROMPT }]);
  assert.equal(parents.size, 0);
  assert.deepEqual(
    [...withRequiredParentQuestionIds([{ id: "orphan", question: FOLLOW_UP_PROMPT }], new Set(["orphan"]))],
    ["orphan"],
  );
});

test("the queue is closed under the parent relation, and adding is idempotent", () => {
  const questions = [
    { id: "sanctions", question: SANCTIONS_PROMPT },
    { id: "detail", question: FOLLOW_UP_PROMPT },
  ];
  assert.deepEqual([...withRequiredParentQuestionIds(questions, new Set(["detail"]))].sort(), ["detail", "sanctions"]);
  assert.deepEqual([...withRequiredParentQuestionIds(questions, new Set(["sanctions", "detail"]))].sort(), ["detail", "sanctions"]);
  // A parent alone pulls nothing extra in.
  assert.deepEqual([...withRequiredParentQuestionIds(questions, new Set(["sanctions"]))], ["sanctions"]);
  assert.deepEqual([...withRequiredParentQuestionIds(questions, new Set())], []);
});

/* ---- the plan the navigator actually counts ---- */

const question = (id: string, prompt: string, answer: string, required = true) => ({
  id,
  question: prompt,
  answer,
  required,
  kind: "short_answer",
  portal_input_type: "textarea",
});

function planFor(questions: ReturnType<typeof question>[], attentionReason: string) {
  return directInputTaskPlan({
    status: "needs_attention",
    attention_reason: attentionReason,
    questions,
    filled_fields: [],
    question_metadata_blockers: [],
  } as never);
}

test("the follow-up never leads the queue on its own: its parent comes back with it", () => {
  /* THE SECOND VISIT. The managed run has settled the sanctions question between two page loads -
     the applicant did nothing - so only the follow-up is reported as outstanding. Before this, the
     queue was that follow-up alone: "1 of 1", asking about an answer never shown. */
  const questions = [
    question("sanctions", SANCTIONS_PROMPT, "None of the above"),
    question("detail", FOLLOW_UP_PROMPT, ""),
  ];
  const plan = planFor(questions, "Answer required: If you selected a response to the prior question, please provide additional detail.");

  assert.deepEqual(plan.questionTasks.map((task) => task.question.id), ["sanctions", "detail"]);
  assert.equal(plan.questionTasks[0].context, true, "the parent is re-admitted as context, not as work");
  assert.equal(plan.questionTasks[0].intent, "review", "and nothing about her stored answer is blanked");
  assert.equal(plan.questionTasks[1].context, undefined);
  assert.equal(plan.current?.kind, "question");
  assert.equal(
    plan.current && plan.current.kind === "question" ? plan.current.question.id : null,
    "sanctions",
    "the parent leads, which is what the first visit did before the run settled it",
  );
  /* The count the applicant reads is the navigator's step count, which is now the same on both
     visits. `remaining` is the amount of WORK, and a settled parent is not work. */
  assert.equal(plan.questionTasks.length, 2);
  assert.equal(plan.remaining, 1);
  // The re-admitted parent is on screen, so it is not also filed under what is already done.
  assert.equal(plan.settled.some((item) => item.questionId === "sanctions"), false);
});

test("the first visit is unchanged: both outstanding, both real work, parent first", () => {
  const questions = [
    question("sanctions", SANCTIONS_PROMPT, ""),
    question("detail", FOLLOW_UP_PROMPT, ""),
  ];
  const plan = planFor(
    questions,
    "Answer required: select all that apply. note: this information will only be used to ensure compliance with u.s. sanctions\nAnswer required: If you selected a response to the prior question, please provide additional detail.",
  );
  assert.deepEqual(plan.questionTasks.map((task) => task.question.id), ["sanctions", "detail"]);
  assert.equal(plan.questionTasks.every((task) => task.context === undefined), true);
  assert.equal(plan.questionTasks.length, 2);
  assert.equal(plan.remaining, 2);
});

test("the step count is the same across both visits, which is the property that moved", () => {
  const firstVisit = planFor(
    [question("sanctions", SANCTIONS_PROMPT, ""), question("detail", FOLLOW_UP_PROMPT, "")],
    "Answer required: select all that apply. note: this information will only be used to ensure compliance with u.s. sanctions\nAnswer required: If you selected a response to the prior question, please provide additional detail.",
  );
  const secondVisit = planFor(
    [question("sanctions", SANCTIONS_PROMPT, "None of the above"), question("detail", FOLLOW_UP_PROMPT, "")],
    "Answer required: If you selected a response to the prior question, please provide additional detail.",
  );
  assert.equal(firstVisit.questionTasks.length, secondVisit.questionTasks.length);
  assert.equal(secondVisit.questionTasks.length, 2, "1 of 2 stays 1 of 2");
});

test("an unrelated settled question is not dragged back in", () => {
  /* Only a PARENT returns. A queue that re-admitted every settled question would re-ask the whole
     form on every visit. */
  const questions = [
    question("authorized", "Are you legally authorized to work in the United States?", "Yes"),
    question("start", "If hired, when could you start?", ""),
  ];
  const plan = planFor(questions, "Answer required: If hired, when could you start?");
  assert.deepEqual(plan.questionTasks.map((task) => task.question.id), ["start"]);
});
