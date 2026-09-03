import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const configSource = readFileSync(new URL("../lib/config.ts", import.meta.url), "utf8");
const billingSource = readFileSync(new URL("../lib/billing.ts", import.meta.url), "utf8");

/* The supported production API name, and the one the retiring Vercel project
   was only ever a proxy in front of. While both existed they served the
   identical Railway service: GET /health on each answered service "litos-api"
   with the same revision and revision_source "railway-git". So this was never
   about which host works. It is about which host survives. */
const liveFallback = "https://api.trylitos.com";
const retiredHost = "student-outreach-backend.vercel.app";

test("the dashboard and first-party billing guard share the live API fallback", () => {
  assert.ok(configSource.includes(`NEXT_PUBLIC_API_URL ?? "${liveFallback}"`));
  assert.ok(billingSource.includes(`NEXT_PUBLIC_API_URL ?? "${liveFallback}"`));
});

/* WHY THIS SECOND ASSERTION EXISTS, given the one above already names the host.
 *
 * The first test pins the shape `NEXT_PUBLIC_API_URL ?? "<host>"`. This one
 * refuses the retired host ANYWHERE in either file, so a second fallback added
 * later, or one spelled slightly differently, cannot reintroduce it while the
 * first test stays green.
 *
 * It is worth a test rather than a comment because the default is not a
 * local-dev convenience. Until 2026-09-04 the Dockerfile declared no build ARG
 * for NEXT_PUBLIC_API_URL, so Railway's service variable never reached
 * `npm run build` and this literal was the API origin shipped to every visitor:
 * confirmed on the live bundle on 2026-09-03, which carried the `?? "<default>"`
 * expression rather than an inlined literal, which is what an undefined
 * build-time variable compiles to. The Dockerfile now forwards the variable, so
 * the default is a fallback again rather than the live configuration.
 *
 * THE ASSERTIONS BELOW STAY, and so does the default they pin, because a
 * fallback is exactly what a build with no variable set compiles in. What this
 * file CANNOT see is build-time configuration: it reads source. Measured on
 * 2026-09-04, building this commit with NEXT_PUBLIC_API_URL="" left both tests
 * here green while .next/static carried `API_URL",0,""` and no occurrence of
 * api.trylitos.com at all. That gap is covered separately, at artifact level,
 * by the "built bundle carries the live API origin" step in .github/workflows/
 * ci.yml, and the build-arg wiring itself by tests/next-public-build-args.test.mjs. */
test("no default sends production at the retired Vercel host", () => {
  for (const [name, source] of [
    ["lib/config.ts", configSource],
    ["lib/billing.ts", billingSource],
  ]) {
    assert.equal(
      source.includes(`?? "https://${retiredHost}"`),
      false,
      `${name} still falls back to ${retiredHost}, which is being retired. Use ${liveFallback}.`,
    );
  }
});
