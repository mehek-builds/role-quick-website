import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* A 402 ON THE ONBOARDING BUILD IS NOT A VERDICT ON THE POSTING.
 *
 * Measured live 2026-09-01: an account whose one free setup build was already spent hit
 * POST /resume/generate's entitlement refusal on step 3, and the screen presented it as a build
 * failure. Its copy blamed the fit ("not a fit Litos can write honestly. Try another posting")
 * and its only forward control was "Show me a different one", which re-runs the same entitlement
 * check against a different posting and refuses identically for every posting there is. A student
 * in that state was told a falsehood and offered a loop.
 *
 * A source assertion because the e2e walk's fixture account always holds its grant, so the walk
 * exercises the success path; what must not regress is the SHAPE of the failure handling.
 */
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("an entitlement denial is recognised by its structured shape, for the build's own feature", async () => {
  const build = await read("components/start/BuildStep.tsx");
  /* The same helper and the same feature key the dashboard uses, so an unrelated 402 (a
     validation failure, a paid safety limit) cannot become an upsell. */
  assert.match(build, /isStructuredUpgradeDenial\(reason, "ai_resume_tailoring"\)/);
});

test("the paywall branch renders before the generic failure and offers no posting loop", async () => {
  const build = await read("components/start/BuildStep.tsx");
  const entitlementAt = build.indexOf("if (error?.entitlement)");
  const genericAt = build.indexOf('title="That build did not finish."');
  assert.ok(entitlementAt !== -1, "the entitlement branch is gone");
  assert.ok(genericAt !== -1, "the generic failure branch is gone");
  assert.ok(entitlementAt < genericAt, "the generic branch shadows the entitlement branch");

  const branch = build.slice(entitlementAt, genericAt);
  /* The honest forward control is the plans page, where the ask already lives (the
     paywall-sequence decision keeps it on /pricing). Never another posting: the refusal is about
     the account, so every posting refuses identically. */
  assert.match(branch, /window\.location\.assign\("\/pricing"\)/);
  assert.doesNotMatch(branch, /Show me a different one/);
  assert.doesNotMatch(branch, /Try another posting/i);
  /* And it does not blame the student or the posting for a billing state. */
  assert.doesNotMatch(branch, /not a fit/i);
});
