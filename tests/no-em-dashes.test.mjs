import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";

/* WHY THIS EXISTS. The house rule is zero em dashes in this repo. Not in copy, not in docs, not in
 * code comments, not anywhere. It used to be enforced by whoever happened to notice, which is to say
 * not at all: PR #197 started as two of them sitting in app/dashboard/jobs/page.tsx since the file
 * was written, and a sweep found 166 more across 40 files. All 166 were removed in that same PR and
 * this test is what stops them coming back.
 *
 * There is no allowlist and no baseline, deliberately. The rule is absolute, so the gate is a plain
 * assertion of zero, and the only way to satisfy it is to write the punctuation properly: a comma, a
 * colon, a semicolon, parentheses, or two sentences.
 *
 * Where the CHARACTER itself is load-bearing rather than prose, write it escaped in the source. Two
 * places genuinely need it and both read correctly today: scripts/sync-roles-feed.mjs strips em
 * dashes out of incoming feed titles, and tests/browse-jobs.test.mjs asserts that a role family
 * never carries one. Escaping keeps the behaviour and keeps the source clean. */

/* Escaped, not literal: this file is scanned like every other and must itself stay clean. */
const EM_DASH = "\u2014";
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

/* git ls-files rather than a directory walk: it already knows about .gitignore, so node_modules,
 * .next and the generated film frames never enter the list. Untracked files are not scanned, which
 * is the one hole here, but anything untracked is also not yet part of the repo, and it gets caught
 * on the commit that adds it. */
function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8", maxBuffer: 64 << 20 })
    .split("\0")
    .filter(Boolean);
}

function offendingLines(relativePath) {
  let text;
  try {
    text = readFileSync(join(REPO, relativePath), "utf8");
  } catch {
    return []; /* listed in the index but not on disk, mid-rebase */
  }
  if (text.includes("\u0000")) return []; /* binary: PNGs, video, fonts */
  if (!text.includes(EM_DASH)) return [];

  const out = [];
  text.split("\n").forEach((line, i) => {
    if (line.includes(EM_DASH)) out.push(`  ${relativePath}:${i + 1}: ${line.trim().slice(0, 100)}`);
  });
  return out;
}

describe("em-dash gate", () => {
  test("no tracked file contains an em dash", () => {
    const offenders = trackedFiles().flatMap(offendingLines);

    assert.deepEqual(
      offenders,
      [],
      `Em dashes are banned in this repo, in copy, docs and code comments alike.\n` +
        `Use a comma, colon, semicolon, parentheses, or two sentences instead.\n` +
        `If the character itself is load-bearing, write it as an escape.\n\n` +
        `${offenders.join("\n")}\n`,
    );
  });

  test("the gate is actually looking at this repo", () => {
    /* Cheap guard against the scan silently going empty, which would turn every future run green
     * without checking anything. */
    const files = trackedFiles();
    assert.ok(files.length > 100, `only ${files.length} tracked files found, the scan is not working`);
    assert.ok(files.includes("DESIGN.md"), "expected DESIGN.md in the scan");
  });
});
