import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* The company logo on a job row shipped BROKEN TWICE, in two different ways, and neither showed up
   as a failing test, a console error, or a red build. Both are pinned here.

   Source assertions rather than a rendering test on purpose: this repo's runner is
   `node --experimental-strip-types`, which cannot parse JSX, so `components/app/CompanyLogo.tsx`
   is not importable. `tests/typography-policy.test.mjs` guards its own laws the same way. */

const componentUrl = new URL("../components/app/CompanyLogo.tsx", import.meta.url);

/* Comments are stripped before anything is asserted. These checks describe what the component
   DOES, and the comments here explain the bugs it must not repeat by quoting them verbatim — so a
   naive search matches the explanation and reports a failure that is not real. That happened on
   the first run of this file. */
async function code() {
  const source = await readFile(componentUrl, "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

test("the row logo is never lazy-loaded", async () => {
  /* FAILURE 1, measured on trylitos.com 2026-07-29: with loading="lazy", not one of the 41 logos
     on the first page ever loaded. Every circle rendered empty, including rows sitting in the
     viewport, and because the image never errored the monogram fallback never ran either — so the
     row showed nothing at all rather than a letter. Forcing the same element to eager painted it
     immediately, and probing the URL from that page returned a 64px image.

     These icons are ~1KB, sit at the left edge of every row, and are the row's identity. Deferring
     them buys nothing and cost the whole feature. */
  const source = await code();
  assert.doesNotMatch(
    source,
    /loading=["']lazy["']/,
    'the logo must not be lazy-loaded: on production not one lazy logo ever loaded',
  );
});

test("a logo that fails still leaves something in the circle", async () => {
  /* The circle must never be empty. If the image errors we fall back to the company's initial, so
     onError has to set that state — without it a dead icon leaves a blank disc with no clue whose
     row it is. */
  const source = await code();
  assert.match(source, /onError=\{\(\) => setBroken\(true\)\}/);
  assert.match(source, /charAt\(0\)\.toUpperCase\(\)/, "the fallback renders the company initial");
});

test("the logo domain comes from the shared resolver, not from a URL in the component", async () => {
  /* FAILURE 2: the component derived the domain from `career_url`, which on every polled source
     holds the JOB BOARD, so the resolver correctly returned null on 100 rows out of 100 and no
     logo ever appeared. The rule now lives in lib/job-rows.ts where it is tested, and the
     component must not grow its own copy. */
  const source = await code();
  assert.match(source, /companyDomainForRow/);
  assert.doesNotMatch(
    source,
    /new URL\(/,
    "domain parsing belongs in lib/job-rows.ts, where it has tests",
  );
});

test("the favicon request never carries the dashboard URL with it", async () => {
  // The referrer would tell a third party which page a signed-in student is on.
  const source = await code();
  assert.match(source, /referrerPolicy="no-referrer"/);
});
