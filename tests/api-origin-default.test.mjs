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
 * local-dev convenience here. The Dockerfile declares no build ARG for
 * NEXT_PUBLIC_API_URL, so Railway's service variable never reaches
 * `npm run build` and the literal in lib/config.ts is the API origin shipped to
 * every visitor. Confirmed on the live bundle on 2026-09-03, which still carried
 * the `?? "<default>"` expression rather than an inlined literal: that is what
 * an undefined build-time variable compiles to. A default aimed at a platform
 * being retired is therefore a dead product on the day that project is deleted,
 * not a fallback that merely looks untidy. */
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
