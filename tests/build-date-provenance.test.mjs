import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

/* The footer's two dates must be build-time constants, not clock reads.
 *
 * Why this file exists. The footer used to live inline in app/page.tsx, which
 * is a server component, so `process.env.BUILD_TIME ?? Date.now()` and
 * `new Date().getFullYear()` were evaluated once during prerender and baked
 * into static HTML. Lifting it into components/SiteFooter.tsx made it site
 * chrome, and /contact carries "use client", so the same two lines started
 * being compiled into the BROWSER bundle and re-evaluated on every visit.
 *
 * Measured on the branch that introduced it, built with BUILD_TIME=2026-07-01:
 * every prerendered page's server HTML said "Built July 2026", and /contact's
 * rendered DOM said "Built August 2026", because BUILD_TIME is a server-only
 * variable and `??` fell through to Date.now() in the browser. One deploy,
 * two contradicting build dates, a silent hydration text mismatch, and a
 * "freshness" claim that would re-date itself every month forever.
 *
 * The fix is in next.config.ts, not in /contact: `env` inlines BUILD_TIME as a
 * literal into both bundles, so server and client cannot disagree no matter
 * which components are client components. These assertions pin that shape,
 * because the failure mode is invisible. Nothing goes red, nothing 500s, the
 * page just quietly lies, and it only lies in the browser, so server-rendered
 * snapshots and curl both show the correct value.
 *
 * Mostly static, in the house style: no build, no port, no DOM. The end-to-end
 * proof (build with an explicit BUILD_TIME, diff server HTML against rendered
 * DOM on a client route and a server route) was done by hand and is recorded in
 * next.config.ts; these are what stop the shape regressing between those runs.
 *
 * The LAST test is the exception and is deliberately behavioural, because the
 * first version of this file was four shape checks and all four stayed green
 * through a real, site-wide, ships-to-production defect: with the runtime
 * fallback removed, BUILD_TIME="" and BUILD_TIME=latest both built cleanly and
 * rendered "Built Invalid Date" and "(c) NaN Litos" on every page. A shape check
 * cannot catch that, because the shape was correct. So that one runs the config.
 */

const ROOT = new URL("..", import.meta.url).pathname;
const FOOTER = join(ROOT, "components/SiteFooter.tsx");

function shipped(text) {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("next.config inlines BUILD_TIME into the client bundle via env", () => {
  /* Without this key, `process.env.BUILD_TIME` is undefined in the browser and
     every consumer silently falls back to whatever it was written to fall back
     to. The key is the entire reason the footer is allowed to read it at all. */
  const config = shipped(readFileSync(join(ROOT, "next.config.ts"), "utf8"));
  assert.match(
    config,
    /env:\s*\{[^}]*\bBUILD_TIME\b/,
    "next.config.ts must declare BUILD_TIME under `env` so it is inlined into " +
      "both the server and the browser bundle",
  );
});

test("the footer reads no clock, so server and browser cannot disagree", () => {
  /* Enumerating forbidden spellings is a losing game, so this inverts it: every
     way the source touches `Date` must be the ONE allowed form, and anything
     else fails whether or not it was anticipated.

     The earlier version listed `Date.now()` and `new Date()` and called that
     "the same bug in every costume". It was not. `Date()` called WITHOUT `new`
     returns the current time as a string, so `Date().slice(11, 15)` puts the
     copyright year back on the visitor's clock and passed all four tests. That
     mutant is what motivated rewriting this as an allowlist. */
  const footer = shipped(readFileSync(FOOTER, "utf8"));

  const uses = [];
  for (const m of footer.matchAll(/\bDate\b\s*(?:\.\s*\w+\s*)?\(/g)) {
    const preceding = footer.slice(Math.max(0, m.index - 5), m.index);
    uses.push({ text: m[0].replace(/\s+/g, ""), isConstructor: /\bnew\s$/.test(preceding) });
  }

  const illegal = uses.filter((u) => !u.isConstructor).map((u) => u.text);
  assert.deepEqual(
    illegal,
    [],
    `components/SiteFooter.tsx may only use \`new Date(...)\`. On /contact this ` +
      `component is in the client bundle, so every other form of Date reads the ` +
      `VISITOR's clock, not the build's. Found: ${JSON.stringify(illegal)}`,
  );
  /* `new Date()` IS a constructor, so the allowlist above waves it through. The
     assertion below is what stops it. Without this it is still caught, but by
     the next test complaining about seed COUNT, which is a confusing thing to
     read when the actual mistake is a zero-argument clock read. */
  assert.doesNotMatch(
    footer,
    /new\s+Date\s*\(\s*\)/,
    "components/SiteFooter.tsx must not call new Date() with no argument: on " +
      "/contact that reads the visitor's clock, not the build's",
  );
  assert.match(
    footer,
    /process\.env\.BUILD_TIME/,
    "the footer's dates must derive from BUILD_TIME",
  );
});

test("every date the footer renders comes from the same build constant", () => {
  /* Two spans, two values, one source. The previous version had the month on
     BUILD_TIME and the year on a separate live clock, which is how a page can
     be internally inconsistent as well as wrong. */
  const footer = shipped(readFileSync(FOOTER, "utf8"));
  const seeds = [...footer.matchAll(/new\s+Date\(([^)]*)\)/g)].map((m) =>
    m[1].trim(),
  );
  assert.equal(
    seeds.length,
    1,
    `the footer should construct exactly one Date, from BUILD_TIME. Found ` +
      `${seeds.length}: ${JSON.stringify(seeds)}`,
  );
  assert.match(seeds[0], /process\.env\.BUILD_TIME/);
});

/* ---------- the trap this defect walked into, kept visible ---------- */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test("the set of client files rendering the footer is written down, not discovered", () => {
  /* Not a ban. A client component rendering the footer is legitimate, and
     /contact has to be one. The point is that the count is an input to the
     reasoning above, so it should change loudly rather than in passing.

     If this fails, the honest fix is usually to update the list. Read the
     assertions above first: they are what actually keeps the dates correct,
     and they hold no matter how long this list gets.

     Scans components/ as well as app/. The first version looked only at
     app/**\/page.tsx, so a client component under components/ that rendered the
     footer was invisible to it and the set it claimed to write down was
     under-counted. There is no such component today; the point is that the list
     is now the real set rather than a subset that happened to match. */
  const KNOWN_CLIENT_FILES_WITH_FOOTER = ["app/contact/page.tsx"];

  const candidates = [
    ...walk(join(ROOT, "app")),
    ...walk(join(ROOT, "components")),
  ].filter((f) => /\.tsx$/.test(f) && !/\.test\.[mc]?tsx?$/.test(f));

  const found = candidates
    .filter((f) => {
      const text = readFileSync(f, "utf8");
      return (
        /^\s*["']use client["']/m.test(text) &&
        /<SiteFooter\b/.test(shipped(text))
      );
    })
    .map((f) => relative(ROOT, f))
    .sort();

  assert.deepEqual(
    found,
    KNOWN_CLIENT_FILES_WITH_FOOTER,
    "the set of client files rendering <SiteFooter /> changed. That is " +
      "allowed, but it is the condition that made the build date a " +
      "browser-evaluated value, so update this list deliberately.",
  );
});

/* ---------- the one assertion that runs the config instead of reading it ---------- */

test("a set but unparseable BUILD_TIME fails the build, not the page", () => {
  /* The gap that four shape checks could not see. With SiteFooter's runtime
     fallback deliberately removed, `??` is nullish-only, so an empty or
     unparseable BUILD_TIME reaches new Date() intact and every page renders
     "Built Invalid Date" and "(c) NaN Litos". Measured: both cases built with
     exit 0 and this suite stayed green at 789.

     That matters here specifically because this repo auto-deploys on merge, and
     the two realistic producers of an empty value are a CI line reading
     BUILD_TIME=$(cmd) where cmd failed, and a dashboard variable saved blank.
     Neither looks like a mistake anywhere except on the live site.

     Runs next.config.ts in a child process, once per case, because the value is
     resolved at module scope and ESM caches modules: re-importing in-process
     would reuse the first evaluation and quietly assert nothing. */
  const run = (value) =>
    spawnSync(
      process.execPath,
      ["--experimental-strip-types", "-e", "import('./next.config.ts')"],
      {
        cwd: ROOT,
        env:
          value === undefined
            ? Object.fromEntries(
                Object.entries(process.env).filter(([k]) => k !== "BUILD_TIME"),
              )
            : { ...process.env, BUILD_TIME: value },
        encoding: "utf8",
      },
    );

  for (const bad of ["", "latest", "not-a-date", "2026-13-45"]) {
    const r = run(bad);
    assert.notEqual(
      r.status,
      0,
      `BUILD_TIME=${JSON.stringify(bad)} must fail the build. It did not, ` +
        `which means it ships "Invalid Date" to every visitor instead.`,
    );
    assert.match(
      r.stderr,
      /BUILD_TIME is set but unparseable/,
      "the failure must name BUILD_TIME, or whoever hits it in CI cannot act on it",
    );
  }

  /* Absent is still legitimate: a local `npm run build` has no CI to set it. */
  assert.equal(
    run(undefined).status,
    0,
    "an ABSENT BUILD_TIME must still build, falling back to the build clock",
  );
  assert.equal(
    run("2026-07-01").status,
    0,
    "a parseable BUILD_TIME must build",
  );
});
