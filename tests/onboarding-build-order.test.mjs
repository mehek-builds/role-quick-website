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

test("an empty employer-form pre-scan proceeds to Review and send, never dead-ends", async () => {
  /* THE PRE-SCAN IS A PREVIEW, NOT A GATE (Mehek, 2026-09-01). When the flaky live read comes up
     empty it used to dead-end this screen ("That build did not finish / could not read the form"),
     and a student hit that across many different jobs in a row. Onboarding must never dead-end
     here: the read is retried and then, if still empty, the build proceeds with an EMPTY ASK, which
     is the zero-outstanding case that skips straight to Review and send, where the live form is
     read fresh. This locks that in so the dead-end cannot come back. */
  const build = await read("lib/onboarding-build.ts");
  assert.doesNotMatch(build, /PostingReadError/, "the scan dead-end error type must be gone");

  const step = await read("components/start/BuildStep.tsx");
  assert.doesNotMatch(step, /throw new PostingReadError/, "the pre-scan must not throw a dead-end");
  assert.doesNotMatch(step, /error\?\.postingRead/, "the pre-scan failure screen must be gone");
  assert.doesNotMatch(step, /That build did not finish[^]*could not verify every question/,
    "the empty-read dead-end copy must be gone");

  const loadAt = step.indexOf("loadQuestions: async");
  assert.ok(loadAt !== -1, "loadQuestions went missing");
  const loadBody = step.slice(loadAt, loadAt + 2200);
  assert.match(loadBody, /POSTING_SCAN_RETRIES/, "the flaky pre-scan must be retried before giving up");
  assert.match(loadBody, /prescriptReadNothing/, "the empty-read proceed path keys on prescriptReadNothing");
  assert.match(loadBody, /ask: \[\]/, "an empty read must proceed with an empty ask, not throw");
});
