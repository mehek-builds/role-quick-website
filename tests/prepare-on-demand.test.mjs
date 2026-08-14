import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeUrl = new URL("../app/dashboard/page.tsx", import.meta.url);
const applicationsUrl = new URL("../app/dashboard/applications/page.tsx", import.meta.url);

/* Regression guard for the dead-end card.
 *
 * Prewarming narrowed to automatic-submission students, and the promise made in its place was that
 * everyone else "gets a packet when they ask for one". Home never shipped the asking: a card with
 * no packet rendered the words "Getting ready" in an inert span, so a matched job sat there
 * forever with no control on the card able to start anything. These tests hold the four states
 * apart and keep a button under the two that a student has to be able to press. */

test("a card with no packet offers a control that starts one", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /async function preparePacket\(jobId: string, initiation: ResumeGenerationInitiation\)/);
  assert.match(home, /onPrepare=\{\(\) => void preparePacket\(job\.id, "explicit_click"\)\}/);
  // The idle branch is a real button carrying the handler, not text.
  assert.match(home, /onClick=\{status === "failed" \? onRetry : onPrepare\}/);
  assert.match(home, /\{status === "failed" \? "Try tailoring again" : "Tailor resume"\}/);
  assert.match(home, /intent=fill[\s\S]{0,250}>Fill application<\/Link>/);
});

test("the four card states stay distinct and only one claims work is happening", async () => {
  const home = await readFile(homeUrl, "utf8");

  /* `reviewHref` where this used to read `prepared`. The boolean and the Review control used to be
     two independent props, so "Ready" and "there is something to open" could disagree. They are one
     value now: the card is Ready exactly when there is a packet id to link to. */
  assert.match(home, /const status = reviewHref \? "ready" : preparing \? "preparing" : preparationFailed \? "failed" : "idle"/);
  assert.doesNotMatch(home, /prepared: boolean/, "the prepared boolean is gone; reviewHref decides the state");
  // "Not started" and "Getting ready" are different states now. Conflating them was the bug.
  assert.match(home, /status === "failed" \? "Paused" : "Not started"/);
  assert.match(home, /status === "preparing" \? "Getting ready"/);
  // Only the in-flight state renders an inert label.
  assert.match(home, /status === "preparing" \? \(\s*<span[^>]*>\s*<PendingLabel>Getting ready<\/PendingLabel>/);
});

test("retry reissues the request instead of nudging a loop that may not be running", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /function retryPreparation\(jobId: string\) \{[\s\S]*?void preparePacket\(jobId, "explicit_click"\);/);
  // The old retry bumped a counter so the prewarm effect would re-run. That effect returns early
  // for every student without automatic submission, so retry did nothing at all for them.
  assert.doesNotMatch(home, /setPrewarmRetry/);
  assert.doesNotMatch(home, /prewarmRetry/);
});

test("explicit and paid-hover tailoring share one lock so a job is never built twice", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /function claimPrewarmLock\(jobId: string\): void/);
  assert.match(home, /function prewarmLockHeld\(jobId: string\): boolean/);
  assert.match(home, /function releasePrewarmLock\(jobId: string\): void/);
  assert.match(home, /hoverGenerationEnabled=\{canUse\("hover_generation"\) === true\}/);
  assert.match(home, /hoverGenerationEnabled && canPrepare && status === "idle"/);
  assert.match(home, /onHoverPrepare=\{\(\) => void preparePacket\(job\.id, "hover_prewarm"\)\}/);
  assert.match(home, /status === "idle"\) onHoverPrepare\(\)/);
  assert.match(home, /preparingJobs\.includes\(jobId\) \|\| \(!qaMode && prewarmLockHeld\(jobId\)\)/);
  assert.match(home, /async function preparePacket[\s\S]*?claimPrewarmLock\(jobId\);/);
  assert.match(home, /\} finally \{\s*releasePrewarmLock\(jobId\);/);
  assert.match(home, /function retryPreparation\(jobId: string\) \{\s*releasePrewarmLock\(jobId\);/);
});

test("the in-flight mark is always cleared", async () => {
  const home = await readFile(homeUrl, "utf8");

  const finallies = home.match(/\} finally \{\s*[\s\S]*?setPreparingJobs\(\(current\) => current\.filter/g) ?? [];
  assert.equal(finallies.length, 2, "both paid background and explicit tailoring paths must clear in finally");
  assert.match(home, /\} finally \{\s*releasePrewarmLock\(jobId\);\s*setPreparingJobs/);
});

test("Paused says what stopped, and never says it in jargon", async () => {
  const home = await readFile(homeUrl, "utf8");

  // The single explicit or paid-hover build path records a reason, not just the fact of failure.
  assert.match(home, /const \[preparationErrors, setPreparationErrors\] = useState<Record<string, string>>\(\{\}\)/);
  assert.match(home, /\} catch \(reason\) \{[\s\S]*?setPreparationErrors\(\(current\) => \(\{ \.\.\.current, \[jobId\]: userFacingError\(reason\) \}\)\)/);

  // userFacingError swaps stack traces and 5xx text for a plain sentence, so a backend fault
  // never reaches a student's card as jargon.
  assert.match(home, /userFacingError\(reason\)/);

  // The card renders it, and only under the state it explains.
  assert.match(home, /status === "failed" && preparationError && \([\s\S]*?text-warn">\{preparationError\}/);

  // A new attempt drops the previous reason rather than explaining a failure that already ended.
  assert.match(home, /setPreparationErrors\(\(current\) => \{\s*if \(!\(jobId in current\)\) return current;[\s\S]*?delete next\[jobId\];/);
});

test("only paid opt-in accounts generate from hover or background work", async () => {
  const home = await readFile(homeUrl, "utf8");
  assert.match(home, /hoverGenerationEnabled=\{canUse\("hover_generation"\) === true\}/);
  assert.equal((home.match(/"\/resume\/generate"/g) ?? []).length, 2, "generation has one paid background path and one named action path");
  assert.match(home, /if \(!autoSubmitEnabled \|\| !backgroundGenerationAllowed\) return;/);
  assert.match(home, /\(autoSubmitEnabled && backgroundGenerationAllowed \? rankedJobs\.slice/);
  assert.doesNotMatch(home, /autoSubmitEnabled \? rankedJobs\.slice/);
  assert.match(home, /resumeGenerationBody\(completeJob, identity, applicationProfile, "hover_prewarm", operationId\)/);
  assert.match(home, /resumeGenerationBody\(completeJob, identity, applicationProfile, initiation, operationId\)/);
  assert.match(home, /onPrepare=\{\(\) => void preparePacket\(job\.id, "explicit_click"\)\}/);
  assert.match(home, /onHoverPrepare=\{\(\) => void preparePacket\(job\.id, "hover_prewarm"\)\}/);
});

test("every website resume generation request declares its initiation", async () => {
  const [home, applications] = await Promise.all([
    readFile(homeUrl, "utf8"),
    readFile(applicationsUrl, "utf8"),
  ]);
  assert.equal(
    (home.match(/"\/resume\/generate"/g) ?? []).length + (applications.match(/"\/resume\/generate"/g) ?? []).length,
    3,
    "all website resume generation call sites are covered by this contract",
  );
  assert.match(home, /resumeGenerationBody\(completeJob, identity, applicationProfile, "hover_prewarm", operationId\)/);
  assert.match(home, /resumeGenerationBody\(completeJob, identity, applicationProfile, initiation, operationId\)/);
  assert.match(home, /onPrepare=\{\(\) => void preparePacket\(job\.id, "explicit_click"\)\}/);
  assert.match(home, /onHoverPrepare=\{\(\) => void preparePacket\(job\.id, "hover_prewarm"\)\}/);
  assert.match(applications, /"\/resume\/generate", \{[\s\S]*?initiation: "explicit_click"/);
});

test("a card cannot offer Prepare before the profile can support it", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /canPrepare=\{Boolean\(identity\?\.full_name\?\.trim\(\) && applicationProfile\)\}/);
  assert.match(home, /!canPrepare \? \([\s\S]*?\/dashboard\/profile[\s\S]*?Complete profile/);
  // The guard in preparePacket mirrors the one the prewarm worker already applied.
  assert.match(home, /if \(!identity\?\.full_name\?\.trim\(\) \|\| !applicationProfile\) return;/);
});
