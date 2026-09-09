import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const home = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const applications = await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

/* ONE door into an application.
 *
 * A matched job used to carry two controls, "Tailor resume" and "Fill application", and the student
 * had to know the difference before either had happened. They are not two things: tailoring is the
 * first step of applying, and filling without it sends the untailored resume this product exists to
 * replace. The card now offers "Start application", which opens the tailoring screen. That screen
 * writes the resume with the posting on screen beside it, hands over the coloured comparison, then
 * the fill, then the send, in that order and with the student pressing each one.
 *
 * These are source-text guards, and they are here because the failure they protect against is a
 * second control quietly reappearing on the card. */

test("a matched job offers exactly one action, and it opens the tailoring screen", () => {
  assert.match(home, /href=\{`\/dashboard\/applications\?job=\$\{job\.id\}&intent=tailor`\}/);
  assert.match(home, /\{status === "failed" \? "Try again" : "Start application"\}/);

  // Neither of the two old words survives anywhere the student can read them.
  const shipped = home.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(shipped, /"Tailor resume"/);
  assert.doesNotMatch(shipped, />Fill application</);
  /* intent=fill is still reachable, and deliberately: it is the "Fill with main resume" escape
     inside the upgrade dialog, for an account whose tailoring was refused. It is a fallback offered
     after a refusal, not a second thing to choose from on a card that has not started yet. */
  assert.equal((shipped.match(/intent=fill/g) ?? []).length, 2, "intent=fill belongs only to the two upgrade-dialog manual fallbacks");
  assert.match(home, /manualLabel: "Fill with main resume"[\s\S]*?onManual: \(\) => window\.location\.assign\(`\/dashboard\/applications\?job=\$\{jobId\}&intent=fill`\)/);

  /* The card's action slot is one ternary chain ending in that single link, so a "second action"
     cannot be added beside it without deleting a branch of the chain. Skip is the only other
     control, and it is not an application action. */
  assert.match(home, /status === "preparing" \? \([\s\S]*?\) : packetAction \? \([\s\S]*?\) : tailoringAccess === null \? \([\s\S]*?\) : !canPrepare \? \([\s\S]*?\) : \(/);
});

test("pressing the card claims the build lock the prewarm loop reads", () => {
  /* The build happens on the next screen now, but the lock that stops one job being built twice
     lives here, in localStorage, and the background prewarm loop skips any job holding it. Without
     this claim the loop can build the same job a second time: once in the gap between this press
     and the next screen's request, and again on every return to Home while that screen is still
     working. */
  assert.match(home, /onClick=\{\(\) => claimPrewarmLock\(job\.id\)\}/);
  assert.match(home, /if \(prewarmLockHeld\(job\.id\)\) continue;\s*claimPrewarmLock\(job\.id\);/);
});

test("arriving from the card starts the tailoring without a second press", () => {
  assert.match(applications, /if \(intent === "tailor"\) \{[\s\S]*?void createApplication\(draft\);/);
  /* Guarded by an action key so the effect cannot spend two generations if it runs twice for one
     arrival. */
  assert.match(applications, /const actionKey = `\$\{pendingJob\.id\}:tailor`;\s*if \(actionStartedFor\.current !== actionKey\)/);
  // An already-built packet opens its comparison instead of being rebuilt.
  assert.match(applications, /if \(existing && intent !== "fill"\) \{[\s\S]*?openApplication\(existing/);
});

test("the posting stays on screen while its resume is being written", () => {
  assert.match(
    applications,
    /\{showNewApplication && creating === "tailor" && newApplication\.jobId && newApplication\.jobDescription\.trim\(\) \? \(\s*<TailoringInProgress draft=\{newApplication\} \/>/,
  );
  assert.match(applications, /function TailoringInProgress\(\{ draft \}: \{ draft: NewApplicationDraft \}\)/);
  // Two panes, in the same shape and at the same heights the finished comparison uses.
  assert.match(applications, /function TailoringInProgress[\s\S]*?grid gap-4 xl:grid-cols-2/);
  assert.match(applications, /function TailoringInProgress[\s\S]*?>\s*Job description\s*</);
  assert.match(applications, /function TailoringInProgress[\s\S]*?whitespace-pre-line text-sm leading-6 text-ink">\{draft\.jobDescription\}/);
  assert.match(applications, /function TailoringInProgress[\s\S]*?<PendingLabel state="composing">Writing your resume against this posting<\/PendingLabel>/);

  /* A draft the student typed themselves keeps its four boxes: swapping those for a progress pane
     would take away the text they are still holding. The jobId is what tells the two apart. */
  assert.match(applications, /creating === "tailor" && newApplication\.jobId/);
  assert.match(applications, /\) : showNewApplication && \(\s*<NewApplicationPanel/);
});
