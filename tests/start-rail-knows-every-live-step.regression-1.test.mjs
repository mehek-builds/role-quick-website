import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { STEPS } from "../features/onboarding/domain/rail.ts";

/* A screen whose rail position is not a rail step shows a loading shimmer forever.
 *
 * StepRail locates itself with `findIndex`, and `known` requires that index to be >= 0. Pass it a
 * key STEPS does not contain and it renders the aria-busy placeholder instead of a position - not
 * for a frame while state arrives, which is what that placeholder is for, but permanently, because
 * there is no key for it to resolve to.
 *
 * BuildStep was doing exactly that with step="build". `build` stopped being a rail step when the
 * two phases were folded into one entry ("One screen, two phases: the posting, then it building"),
 * and nothing failed when the key was left behind. Caught by walking the flow as a guest: the build
 * screen is the longest wait in onboarding, around a minute, and it spent all of it telling the
 * student "Loading your setup progress".
 *
 * This pins the class rather than the instance, so the next folded-away step name cannot do it
 * again silently.
 */

const LIVE = new Set(STEPS.map((s) => s.key));

/* Steps the flow no longer routes to. app/start/page.tsx still renders their screens - the switch's
   default arm exists so an unknown step is never a blank page - but the server does not serve them,
   so a rail that cannot place them is not a live defect. Listed by name so that adding to this set
   is a deliberate act with a reason, rather than the silent default `build` enjoyed. */
const RETIRED = new Set(["impact", "base", "install", "apply", "targeting", "gaps"]);

const DIR = new URL("../components/start/", import.meta.url);

function railKeysByFile() {
  const found = new Map();
  for (const name of readdirSync(DIR)) {
    if (!name.endsWith(".tsx")) continue;
    const source = readFileSync(new URL(name, DIR), "utf8");
    /* `step=` on a StartShell or StepRail is the rail position. Matches the attribute wherever it
       sits, because BuildStep writes one of its three on its own line. */
    for (const [, key] of source.matchAll(/\bstep=\{?"([a-z]+)"\}?/g)) {
      if (!found.has(name)) found.set(name, new Set());
      found.get(name).add(key);
    }
  }
  return found;
}

test("every rail position a start screen passes is one the rail can place", () => {
  const offenders = [];
  for (const [file, keys] of railKeysByFile()) {
    for (const key of keys) {
      if (!LIVE.has(key) && !RETIRED.has(key)) offenders.push(`${file}: step="${key}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "these screens pass a rail position STEPS does not contain, so StepRail shows its loading "
      + "shimmer for the life of the screen instead of a step number",
  );
});

test("the build screen stands on the match step", () => {
  /* The specific regression. All three of BuildStep's shells - the build itself, the Litos+ wall
     and the failed build - are the same position in the flow, because a student on any of them is
     still on the match step. */
  const build = readFileSync(new URL("BuildStep.tsx", DIR), "utf8");
  assert.doesNotMatch(build, /step="build"/);
  assert.equal((build.match(/step="match"/g) ?? []).length, 3);
});

test("build is genuinely not a rail step, so the fix is a position and not a rename", () => {
  /* If `build` is ever added back to STEPS this test fails, which is the prompt to decide whether
     BuildStep should point at it again rather than silently keeping the match position. */
  assert.equal(LIVE.has("build"), false);
  assert.equal(LIVE.has("match"), true);
});
