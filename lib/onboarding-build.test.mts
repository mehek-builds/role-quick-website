import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILD_STAGES,
  BuildPreconditionError,
  buildActionLabel,
  initialStages,
  runOnboardingBuild,
  stagesAt,
  type BuildDeps,
  type BuildStage,
} from "./onboarding-build.ts";
import type { PostingPrescriptQuestion } from "./api.ts";

function ask(question: string): PostingPrescriptQuestion {
  return {
    question, input_type: "select", options: ["Yes", "No"], required: true,
    max_length: null, answer: "", reusable: false, remembered: false,
  } as PostingPrescriptQuestion;
}

function deps(overrides: Partial<BuildDeps> = {}): BuildDeps {
  return {
    loadPosting: async () => ({ description: "Full JD text", title: "Software Engineer Intern", company: "Ramp" }),
    loadIdentity: async () => ({ fullName: "A Candidate", resumeEmail: "a@example.com" }),
    generateResume: async () => ({ applicationId: "app-1", resumeSpec: { school: "USC", degree: "BS", grad_date: "May 2027", coursework: "", experience: [], skills: [] } }),
    loadQuestions: async () => ({
      total: 17,
      alreadyAnswered: 14,
      ask: [ask("Sponsorship?"), ask("GPA?"), ask("Anything else?")],
    }),
    ...overrides,
  };
}

/** Every list the orchestrator emitted, so the ORDER of transitions can be asserted. */
function record() {
  const seen: BuildStage[][] = [];
  return { seen, onStages: (stages: BuildStage[]) => seen.push(stages) };
}

const statusOf = (stages: BuildStage[], key: string) => stages.find((s) => s.key === key)!.status;

test("there are exactly three stages, because three things actually happen", () => {
  // Not five. POST /resume/generate does the writing and the layout behind one await, so there is
  // no event between them to drive a transition and showing two rows would be theatre.
  assert.deepEqual(BUILD_STAGES.map((s) => s.key), ["posting", "resume", "questions"]);
});

test("each stage carries a shipped orb state that matches the work", () => {
  assert.deepEqual(BUILD_STAGES.map((s) => s.orb), ["working", "composing", "solving"]);
});

test("the first stage starts active and the rest wait", () => {
  const stages = initialStages();
  assert.equal(statusOf(stages, "posting"), "active");
  assert.equal(statusOf(stages, "resume"), "waiting");
  assert.equal(statusOf(stages, "questions"), "waiting");
});

test("a stage is only ever done after its own call resolved", async () => {
  /* The honesty property. The resume row must stay active for exactly as long as generation takes,
     so it must not be marked done by anything except that await returning. */
  let releaseGeneration: (value: unknown) => void = () => {};
  const generation = new Promise((resolve) => { releaseGeneration = resolve; });
  const { seen, onStages } = record();

  const run = runOnboardingBuild(
    deps({ generateResume: () => generation.then(() => ({ applicationId: "app-1", resumeSpec: null })) }),
    "job-1",
    onStages,
  );

  // Let the first stage settle and the resume stage go active.
  await new Promise((r) => setTimeout(r, 0));
  const midway = seen[seen.length - 1];
  assert.equal(statusOf(midway, "posting"), "done");
  assert.equal(statusOf(midway, "resume"), "active", "the resume stage finished before generation did");
  assert.equal(statusOf(midway, "questions"), "waiting");

  releaseGeneration(null);
  await run;
  const final = seen[seen.length - 1];
  assert.deepEqual(final.map((s) => s.status), ["done", "done", "done"]);
});

test("the stages are reported in order and never go backwards", async () => {
  const { seen, onStages } = record();
  await runOnboardingBuild(deps(), "job-1", onStages);

  const activeOrder = seen
    .map((stages) => stages.find((s) => s.status === "active")?.key)
    .filter(Boolean);
  assert.deepEqual(activeOrder, ["posting", "resume", "questions"]);
});

test("the result carries the real counts, not a rounded promise", async () => {
  const result = await runOnboardingBuild(deps(), "job-1", record().onStages);
  assert.equal(result.outstandingQuestions, 3);
  assert.equal(result.totalQuestions, 17);
  assert.equal(result.alreadyAnswered, 14);
  assert.equal(result.applicationId, "app-1");
  // Derived from the ask list, so the button's count and the next screen's list cannot disagree.
  assert.equal(result.outstandingQuestions, result.ask.length);
});

test("the full posting is what gets tailored against, never the board preview", async () => {
  // The board row carries a 600-character preview; grading a student on the posting's intro
  // paragraph is grading them on the part where the requirements are not.
  let sawJd = "";
  await runOnboardingBuild(
    deps({
      loadPosting: async () => ({ description: "the whole description", title: "T", company: "C" }),
      generateResume: async (input) => { sawJd = input.jdText; return { applicationId: null, resumeSpec: null }; },
    }),
    "job-1",
    record().onStages,
  );
  assert.equal(sawJd, "the whole description");
});

test("a missing name fails before generation, and says which field", async () => {
  /* Checked before the expensive call on purpose: discovering it afterwards spends one of the
     trial's five generations on a request that could never have succeeded. */
  let generated = false;
  const { seen, onStages } = record();
  await assert.rejects(
    () => runOnboardingBuild(
      deps({
        loadIdentity: async () => ({ fullName: "  ", resumeEmail: "a@example.com" }),
        generateResume: async () => { generated = true; return { applicationId: null, resumeSpec: null }; },
      }),
      "job-1",
      onStages,
    ),
    (error: unknown) => error instanceof BuildPreconditionError && error.field === "full_name",
  );
  assert.equal(generated, false, "generation ran despite a precondition that could never pass");
  assert.equal(statusOf(seen[seen.length - 1], "resume"), "failed");
});

test("a missing resume email fails the same way, named separately", async () => {
  await assert.rejects(
    () => runOnboardingBuild(
      deps({ loadIdentity: async () => ({ fullName: "A Candidate", resumeEmail: null }) }),
      "job-1",
      record().onStages,
    ),
    (error: unknown) => error instanceof BuildPreconditionError && error.field === "resume_email",
  );
});

test("a failure marks the stage that broke, so the screen can say which", async () => {
  /* "We could not read the posting" and "we could not write your resume" are different sentences
     with different recoveries. A single generic error flattens them. */
  const posting = record();
  await assert.rejects(
    () => runOnboardingBuild(deps({ loadPosting: async () => { throw new Error("board down"); } }), "j", posting.onStages),
    /board down/,
  );
  assert.equal(statusOf(posting.seen[posting.seen.length - 1], "posting"), "failed");

  const questions = record();
  await assert.rejects(
    () => runOnboardingBuild(deps({ loadQuestions: async () => { throw new Error("probe failed"); } }), "j", questions.onStages),
    /probe failed/,
  );
  const last = questions.seen[questions.seen.length - 1];
  assert.equal(statusOf(last, "questions"), "failed");
  // And the work that DID succeed still reads as done rather than being reset by the failure.
  assert.equal(statusOf(last, "resume"), "done");
});

test("stagesAt marks everything before the named stage as done", () => {
  const stages = stagesAt("questions", "active");
  assert.deepEqual(stages.map((s) => s.status), ["done", "done", "active"]);
});

test("the button reports the real count, and zero skips the questions screen", () => {
  assert.equal(buildActionLabel({ outstandingQuestions: 3 }), "3 questions need you");
  assert.equal(buildActionLabel({ outstandingQuestions: 1 }), "1 question needs you");
  // Nothing outstanding means screen 05 would be empty, so the button says what really happens.
  assert.equal(buildActionLabel({ outstandingQuestions: 0 }), "Review and send");
});
