import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* THE SANCTION HAS TO STAY A LIST OF ONE.
 *
 * `audited-state-contracts.spec.mjs` treats any unstubbed request on the billing-return and
 * account-deletion surfaces as a finding. That is the point of it. When the TikTok pixel moved into
 * the root layout (#389) it fired on those pages and turned all twelve cases red, and the call was
 * to sanction it rather than move the pixel: attribution is measured at the billing return, which
 * is where a purchase completes.
 *
 * The risk that creates is drift. "Aborting unknown third parties" is one edit away from "ignoring
 * third parties", and the guard would then be green while the surface it protects quietly filled up
 * with trackers. These assertions make widening it a deliberate act with a test to change.
 */
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("exactly one third-party origin is sanctioned, and it is the pixel", async () => {
  const spec = await read("tests/e2e/audited-state-contracts.spec.mjs");
  const block = spec.slice(
    spec.indexOf("const SANCTIONED_THIRD_PARTY_ORIGINS"),
    spec.indexOf("function isSanctionedThirdParty"),
  );
  const origins = [...block.matchAll(/'(https?:\/\/[^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    origins,
    ["https://analytics.tiktok.com"],
    "the sanctioned list changed; widening it is a privacy decision, not a test fix",
  );
});

test("it matches on origin, never on a substring", async () => {
  /* `url.includes("tiktok")` would sanction any host with that string in it, including one an
     attacker or a careless integration controls. The URL constructor is what makes it exact. */
  const spec = await read("tests/e2e/audited-state-contracts.spec.mjs");
  const fn = spec.slice(spec.indexOf("function isSanctionedThirdParty"), spec.indexOf("async function routeBilling"));
  assert.match(fn, /new URL\(url\)\.origin/, "the check no longer compares origins");
  assert.doesNotMatch(fn, /\.includes\(/, "the check fell back to substring matching");
});

test("a sanctioned request is aborted, never fulfilled", async () => {
  /* The same treatment Stripe's domain already gets. The suite must not make a real call to a real
     analytics endpoint, whatever it thinks of the pixel. */
  const spec = await read("tests/e2e/audited-state-contracts.spec.mjs");
  for (const match of spec.matchAll(/if \(isSanctionedThirdParty\(url\)\) return ([a-z.]+)\(\)/g)) {
    assert.equal(match[1], "route.abort", "a sanctioned third party is being fulfilled rather than aborted");
  }
});

test("every unknown-traffic fallback consults the sanction, so the three handlers agree", async () => {
  const spec = await read("tests/e2e/audited-state-contracts.spec.mjs");
  const fallbacks = [...spec.matchAll(/unknown\.push\(`\$\{request\.method\(\)\} \$\{url\}`\)/g)].length;
  const guards = [...spec.matchAll(/if \(isSanctionedThirdParty\(url\)\)/g)].length;
  assert.equal(
    guards,
    fallbacks,
    `${fallbacks} handlers record unknown traffic but ${guards} consult the sanction; one of them will disagree`,
  );
});
