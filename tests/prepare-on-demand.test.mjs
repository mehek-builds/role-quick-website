import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeUrl = new URL("../app/dashboard/page.tsx", import.meta.url);

/* Regression guard for the dead-end card.
 *
 * Prewarming narrowed to automatic-submission students, and the promise made in its place was that
 * everyone else "gets a packet when they ask for one". Home never shipped the asking: a card with
 * no packet rendered the words "Getting ready" in an inert span, so a matched job sat there
 * forever with no control on the card able to start anything. These tests hold the four states
 * apart and keep a button under the two that a student has to be able to press. */

test("a card with no packet offers a control that starts one", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /async function preparePacket\(jobId: string\)/);
  assert.match(home, /onPrepare=\{\(\) => void preparePacket\(job\.id\)\}/);
  // The idle branch is a real button carrying the handler, not text.
  assert.match(home, /onClick=\{status === "failed" \? onRetry : onPrepare\}/);
  assert.match(home, /\{status === "failed" \? "Try again" : "Prepare"\}/);
});

test("the four card states stay distinct and only one claims work is happening", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /const status = prepared \? "ready" : preparing \? "preparing" : preparationFailed \? "failed" : "idle"/);
  // "Not started" and "Getting ready" are different states now. Conflating them was the bug.
  assert.match(home, /status === "failed" \? "Paused" : "Not started"/);
  assert.match(home, /status === "preparing" \? "Getting ready"/);
  // Only the in-flight state renders an inert label.
  assert.match(home, /status === "preparing" \? \(\s*<span[^>]*>\s*<PendingLabel>Getting ready<\/PendingLabel>/);
});

test("retry reissues the request instead of nudging a loop that may not be running", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /function retryPreparation\(jobId: string\) \{[\s\S]*?void preparePacket\(jobId\);/);
  // The old retry bumped a counter so the prewarm effect would re-run. That effect returns early
  // for every student without automatic submission, so retry did nothing at all for them.
  assert.doesNotMatch(home, /setPrewarmRetry/);
  assert.doesNotMatch(home, /prewarmRetry/);
});

test("on-demand and prewarm share one lock so a job is never built twice", async () => {
  const home = await readFile(homeUrl, "utf8");

  // One protocol, three functions, used by both paths. A student on automatic submission has the
  // prewarm loop running while Prepare is also live, so disagreement here costs two model calls
  // and two entries against the monthly quota for one job.
  assert.match(home, /function claimPrewarmLock\(jobId: string\): void/);
  assert.match(home, /function prewarmLockHeld\(jobId: string\): boolean/);
  assert.match(home, /function releasePrewarmLock\(jobId: string\): void/);
  assert.doesNotMatch(home, /window\.localStorage\.(set|remove)Item\(lockKey/);

  // preparePacket claims the lock the prewarm worker checks before it starts anything.
  assert.match(home, /async function preparePacket[\s\S]*?claimPrewarmLock\(jobId\);/);
  assert.match(home, /if \(prewarmLockHeld\(job\.id\)\) continue;\s*claimPrewarmLock\(job\.id\);/);
  assert.match(home, /if \(preparingJobs\.includes\(jobId\)\) return;/);

  // A failure releases the lock on both paths, otherwise a retry is blocked for ten minutes.
  assert.match(home, /\} catch \{[\s\S]*?releasePrewarmLock\(jobId\);/);
  assert.match(home, /\} catch \(reason\) \{[\s\S]*?releasePrewarmLock\(job\.id\);/);
  assert.match(home, /function retryPreparation\(jobId: string\) \{\s*releasePrewarmLock\(jobId\);/);
});

test("the in-flight mark is always cleared, including on unmount", async () => {
  const home = await readFile(homeUrl, "utf8");

  // Both paths clear in a finally. A mark left behind is a card that says "Getting ready" with no
  // request behind it, which is the lie this change exists to remove.
  const finallies = home.match(/\} finally \{\s*[\s\S]*?setPreparingJobs\(\(current\) => current\.filter/g) ?? [];
  assert.equal(finallies.length, 2, "both preparePacket and the prewarm worker must clear in finally");
  // preparingJobs is written by the effect but never read by it, so it must stay out of the deps.
  assert.doesNotMatch(home, /me, packets, preparingJobs, qaMode\]/);
});

test("a card cannot offer Prepare before the profile can support it", async () => {
  const home = await readFile(homeUrl, "utf8");

  assert.match(home, /canPrepare=\{Boolean\(identity\?\.full_name\?\.trim\(\) && applicationProfile\)\}/);
  assert.match(home, /!canPrepare \? \([\s\S]*?\/dashboard\/profile[\s\S]*?Complete profile/);
  // The guard in preparePacket mirrors the one the prewarm worker already applied.
  assert.match(home, /if \(!identity\?\.full_name\?\.trim\(\) \|\| !applicationProfile\) return;/);
});
