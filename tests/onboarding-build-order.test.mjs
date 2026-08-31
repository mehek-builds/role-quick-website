import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* EVERYTHING THAT CAN REFUSE RUNS BEFORE THE ONE CALL THAT COSTS ANYTHING.
 *
 * Measured live 2026-09-01: the questions stage is a live read of the employer's form and it
 * failed on a real posting, AFTER generation had already succeeded. The student's free setup
 * build was spent on a flow that then died on the failure screen, and the packet it paid for was
 * never shown to them in the flow. The build order is therefore load-bearing: posting, then the
 * employer's form, then the identity preconditions, and only then the generation.
 */
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("the questions read runs before generation, in the orchestrator and in the stage rail", async () => {
  const build = await read("lib/onboarding-build.ts");
  const run = build.slice(build.indexOf("export async function runOnboardingBuild"));
  const questionsAt = run.indexOf("deps.loadQuestions(");
  const generateAt = run.indexOf("deps.generateResume({");
  assert.ok(questionsAt !== -1 && generateAt !== -1, "a stage call went missing from the orchestrator");
  assert.ok(questionsAt < generateAt, "generation runs before the employer's form is verified, so a scan failure spends the free build again");

  const stages = build.slice(build.indexOf("export const BUILD_STAGES"), build.indexOf("export type BuildResult"));
  assert.ok(
    stages.indexOf('"questions"') < stages.indexOf('"resume"'),
    "the stage rail draws the resume before the questions read, which no longer matches the run order",
  );
});

test("a scan failure is typed, and its screen offers a free re-read instead of blaming the fit", async () => {
  const build = await read("lib/onboarding-build.ts");
  assert.match(build, /export class PostingReadError/);

  const step = await read("components/start/BuildStep.tsx");
  assert.match(step, /throw new PostingReadError\(/);
  const branchAt = step.indexOf("if (error?.postingRead)");
  const genericAt = step.indexOf('title="That build did not finish."', branchAt + 1);
  assert.ok(branchAt !== -1, "the posting-read branch is gone");
  const branch = step.slice(branchAt, genericAt === -1 ? undefined : step.indexOf("if (error) {", branchAt));
  assert.match(branch, /Read the form again/);
  assert.match(branch, /Show me a different one/);
  /* The generic copy's verdict on fit must not appear here: a scan failure says nothing about
     the student. */
  assert.doesNotMatch(branch, /not a fit/i);
});
