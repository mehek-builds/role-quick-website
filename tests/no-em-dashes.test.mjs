import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";

/* WHY THIS EXISTS. The house rule is zero em dashes anywhere in this repo, prose and code comments
 * alike. It was enforced by whoever happened to notice, which is to say not at all: PR #197 removed
 * two that had been sitting in app/dashboard/jobs/page.tsx since the file was written, and a sweep
 * at that point found 166 more spread over 40 files.
 *
 * Cleaning all 166 at once is a separate job. What this gate does is stop the number from growing:
 * a file not in the baseline may not contain a single em dash, and a file in the baseline may not
 * contain more than it already did. The count may only ever go down, and when it does the test says
 * so and asks for the baseline to be tightened, so the debt cannot quietly grow back.
 *
 * To re-baseline after removing some: npm test -- --test-name-pattern=em-dash with
 * UPDATE_EM_DASH_BASELINE=1 set, then commit the regenerated JSON. */

/* Escaped, not literal: this file is scanned like every other and must itself stay clean. */
const EM_DASH = "\u2014";
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const BASELINE_PATH = join(HERE, "em-dash-baseline.json");

/* git ls-files rather than a directory walk: it already knows about .gitignore, so node_modules,
 * .next and the generated film frames never enter the list. */
function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8", maxBuffer: 64 << 20 })
    .split("\0")
    .filter(Boolean);
}

function countEmDashes(relativePath) {
  let text;
  try {
    text = readFileSync(join(REPO, relativePath), "utf8");
  } catch {
    return 0; /* listed in the index but not on disk, mid-rebase */
  }
  if (text.includes("\u0000")) return 0; /* binary: PNGs, video, fonts */
  let n = 0;
  for (const ch of text) if (ch === EM_DASH) n += 1;
  return n;
}

function currentCounts() {
  const counts = {};
  for (const file of trackedFiles()) {
    const n = countEmDashes(file);
    if (n > 0) counts[file] = n;
  }
  return counts;
}

describe("em-dash gate", () => {
  test("no file gains an em dash, and no clean file grows one", () => {
    const actual = currentCounts();

    if (process.env.UPDATE_EM_DASH_BASELINE === "1") {
      const sorted = Object.fromEntries(Object.entries(actual).sort(([a], [b]) => a.localeCompare(b)));
      writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
      return;
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    const grew = [];
    const shrank = [];

    for (const [file, n] of Object.entries(actual)) {
      const allowed = baseline[file] ?? 0;
      if (n > allowed) grew.push(`  ${file}: ${n} (baseline allows ${allowed})`);
    }
    for (const [file, allowed] of Object.entries(baseline)) {
      const n = actual[file] ?? 0;
      if (n < allowed) shrank.push(`  ${file}: ${n} (baseline still claims ${allowed})`);
    }

    assert.equal(
      grew.length,
      0,
      `New em dashes. The house rule is zero of them, in prose and in code comments alike.\n` +
        `Replace each with a comma, colon, or hyphen:\n${grew.join("\n")}`,
    );
    assert.equal(
      shrank.length,
      0,
      `Em dashes were removed but the baseline was not tightened, so the debt could grow back.\n` +
        `Re-run with UPDATE_EM_DASH_BASELINE=1 and commit tests/em-dash-baseline.json:\n${shrank.join("\n")}`,
    );
  });

  test("the baseline is a shrinking list, not a place to add files", () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    for (const [file, n] of Object.entries(baseline)) {
      assert.ok(Number.isInteger(n) && n > 0, `${file}: a baseline entry of ${n} should just be deleted`);
    }
  });
});
