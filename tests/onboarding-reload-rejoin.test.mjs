import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* THE RELOAD THAT USED TO SPEND A FREE BUILD, AND THEN THE ACCOUNT.
 *
 * /start holds `chosenMatch` and `built` in memory for the sitting, so a reload between the build
 * screen and the send screen dropped both and restarted at the match list with no memory of the
 * posting it had just built. Picking again ran POST /resume/generate, which claims one of the
 * account's TWO free onboarding builds. Two reloads exhausted them and bricked the account: it
 * could not finish setup (the build needs an entitlement it no longer had) and could not reach
 * /dashboard (the card gate holds the dashboard shut until setup completes). Measured on
 * production 2026-09-03: onboarding_builds_used 2, onboarding_completed_at NULL.
 *
 * THE DECISION ITSELF IS TESTED FOR REAL, in lib/onboarding-build.test.mts, against the injected
 * buildOrRejoin - including that ten reloads generate nothing. What is left here is the WIRING in
 * app/start/page.tsx, which has no seam a unit test can reach and two traps worth naming: a rejoin
 * that pulls back the very posting a student just asked to leave, and a match screen that flashes
 * and vanishes while the rejoin decides. Source assertions in the same shape as
 * onboarding-build-paywall.test.mjs beside it, and for the same reason: the e2e walk exercises the
 * happy path, and what must not regress is the shape.
 */
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("the build step reads the already-built packet before it generates", async () => {
  const build = await read("components/start/BuildStep.tsx");
  assert.match(build, /buildOrRejoin\(\{/, "the build no longer routes through the rejoin decision");
  assert.match(build, /readPacket: getOnboardingPacket/);
  /* The generation must be the injected fallback, never a call made beside the decision: a
     /resume/generate that runs unconditionally is the bug with a read bolted on top. */
  const decisionAt = build.indexOf("buildOrRejoin({");
  const generateAt = build.indexOf('"/resume/generate"');
  assert.ok(decisionAt !== -1 && generateAt !== -1);
  assert.ok(decisionAt < generateAt, "the generation must sit inside the decision, not before it");
});

test("pressing 'Show me a different one' stops the rejoin pulling the same posting back", async () => {
  /* Clearing chosenMatch alone re-satisfies the rejoin effect's own guard, which then re-fetches
     the in-progress application and hands the SAME posting straight back - the exact dead end
     onPickAnother exists to avoid, and the same trap pinnedJobDeclined was added for. Both of the
     page's BuildStep renders route through onPickAnother, so both must record the decline. */
  const page = await read("app/start/page.tsx");
  const handlers = page.match(/onPickAnother=\{[^]*?\}\}/g) ?? [];
  assert.ok(handlers.length >= 2, "expected both BuildStep renders to be found");
  for (const handler of handlers) {
    assert.match(handler, /setRejoinDeclined\(true\)/, `a BuildStep render leaves the rejoin armed: ${handler}`);
  }
});

test("the match screen does not flash while the rejoin is still deciding", async () => {
  /* "A screen that flashes and vanishes is not a lower-friction version of not showing it" is this
     flow's own rule, already followed by the job-first pin. Both places that fall back to MatchStep
     must hold the shimmer until the rejoin has answered. */
  const page = await read("app/start/page.tsx");
  const marker = "<MatchStep onLater={later} onBuild={setChosenMatch} />";
  const sites = [];
  for (let at = page.indexOf(marker); at !== -1; at = page.indexOf(marker, at + 1)) sites.push(at);
  assert.equal(sites.length, 2, "expected exactly the two MatchStep fallbacks");
  for (const at of sites) {
    /* The guard is allowed to be the same expression or the statement directly above it; both
       shapes are in the file. What is not allowed is reaching MatchStep with the rejoin undecided. */
    const guard = page.slice(Math.max(0, at - 200), at);
    assert.match(guard, /rejoinPending/, `a MatchStep fallback renders before the rejoin answers:\n${guard}`);
  }
});

test("the rejoin never blocks the flow: a failed read falls through to the match screen", async () => {
  /* An older backend without the route, or any network failure, must leave the student with a
     working way forward rather than a banner over a screen that already recovered. */
  const page = await read("app/start/page.tsx");
  const effect = page.slice(page.indexOf("REJOINING THE APPLICATION AFTER A RELOAD"));
  const body = effect.slice(0, effect.indexOf("}, [rejoinChecked"));
  assert.match(body, /catch \{/, "the rejoin read is unguarded");
  /* Set in `finally`, so a failure ends the pending state instead of leaving the shimmer forever. */
  assert.match(body, /finally \{[^]*setRejoinChecked\(true\)/);
});
