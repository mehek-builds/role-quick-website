import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* A SCREEN WITH NOTHING TO ASK IS NOT A SCREEN.
 *
 * QuestionsStep has always carried an empty branch reading "<Employer> asks nothing Litos cannot
 * answer" above a single Continue, and its own comment called that branch unreachable "because the
 * build screen sends the student straight to review". It never did. The build handoff acknowledged
 * `match` alone, so the server served `questions` next whether or not any existed, and a student
 * whose posting asked nothing extra was shown a screen that told them so and charged them a click.
 *
 * Found by walking the flow for screenshots on 2026-08-20 - the screen appeared, in production, in
 * exactly the state a comment three files away insisted could not happen.
 *
 * A source assertion because the behaviour is a handoff between two components mediated by the
 * acknowledgement ledger, and the e2e walk's fixture deliberately HAS outstanding questions, so it
 * exercises the other branch.
 */
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("a build that found nothing outstanding acknowledges the questions step", async () => {
  const page = await read("app/start/page.tsx");
  const handoff = page.slice(page.indexOf("onQuestions={(result) => {"), page.indexOf("case \"questions\":"));

  assert.match(handoff, /outstandingQuestions === 0/, "the handoff no longer notices an empty ask");
  assert.match(handoff, /await ack\("questions"\)/, "the empty step is no longer acknowledged, so it renders");
  /* Order matters: `match` first, then `questions`, then one refresh. Acknowledging out of order or
     refreshing between them lets the server answer with the step being skipped. */
  assert.ok(
    handoff.indexOf('ack("match")') < handoff.indexOf('ack("questions")'),
    "match must be acknowledged before questions",
  );
});

test("the step is skipped by acknowledgement, never by removal from the rail", async () => {
  /* The distinction is the whole reason this is safe. Dropping it from the flow would take the
     total from ten to nine underneath a student standing on step three, which is the failure
     volley-backend #616 exists for. Acknowledging it leaves the rail counting ten and marks this
     one done, which is also true: Litos answered everything the employer asked. */
  const rail = await read("features/onboarding/domain/rail.ts");
  const steps = rail.slice(rail.indexOf("export const STEPS"), rail.indexOf("export function flowSteps"));
  assert.match(steps, /questions/, "the questions step was removed from the rail rather than acknowledged");

  const flow = rail.slice(rail.indexOf("export function flowSteps"));
  assert.doesNotMatch(
    flow,
    /includes_questions_step/,
    "the rail now gates the questions step on a flag, which can shrink the total mid-walk",
  );
});

test("the empty branch survives as a backstop, and says so", async () => {
  const source = await read("components/start/QuestionsStep.tsx");
  assert.match(source, /asks nothing Litos cannot answer/, "the backstop for a direct reload is gone");
  assert.doesNotMatch(
    source,
    /Not reachable from the build screen/,
    "the comment still claims the branch is unreachable, which is what made this defect invisible",
  );
});
