/**
 * The five per-band error boundaries are pinned here, by name and by what they wrap.
 *
 * WHY A STATIC TEST, IN A REPO THAT DISTRUSTS THEM
 * ===============================================
 * tests/e2e/partial-payload.spec.mjs proves a boundary CONTAINS a throw. It can only prove it for
 * the one band the case drives, because a boundary is invisible until something under it throws,
 * and with the parse boundary in front of these panels almost nothing does any more. Measured: the
 * other four SectionBoundary placements can be deleted wholesale and BOTH suites stay green. That
 * includes all three Home Overview columns, which are the whole motivation for this work and the
 * band the audit watched go dark three separate times.
 *
 * So this file covers a different failure than the browser spec, and neither replaces the other:
 *   - the browser spec answers "does the boundary work?"
 *   - this file answers "is the boundary still there?"
 * It runs inside `npm test`, so it also covers the case where the browser spec is skipped, its
 * Chromium is missing, or its harness breaks. That matters more than usual here: the browser spec
 * is the only thing standing between an ordinary refactor and the silent removal of the containment
 * this whole change is about.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * ================================
 * It asserts placement and nothing else. It does not count tokens, does not pin class names, and
 * does not read the fallback copy, all of which would break on any honest edit. Comments are
 * stripped before every structural assertion, because a mutation that leaves the right JSX behind
 * in a comment must not be able to pass: that exact failure mode is documented in the click-path
 * spec's header and it is the reason source-level tests are the junior partner here.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Block and line comments removed, so nothing commented out can satisfy an assertion below. */
function code(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

/**
 * The band name, the file, and the component the boundary has to be wrapped around.
 *
 * `child` is matched as the opening tag of the very next element inside the boundary. That is the
 * point of the test: a SectionBoundary sitting in the file but wrapping nothing, or wrapping the
 * wrong thing, is the same defect as no boundary at all.
 */
const PLACEMENTS = [
  { band: "momentum", file: "app/dashboard/page.tsx", child: "Funnel" },
  { band: "tracker-summary", file: "app/dashboard/page.tsx", child: "OverviewColumn" },
  { band: "outreach-summary", file: "app/dashboard/page.tsx", child: "OverviewColumn" },
  { band: "tracker-board", file: "app/dashboard/applications/page.tsx", child: "Board" },
  { band: "resume-health", file: "app/dashboard/applications/page.tsx", child: "ResumeHealth" },
];

test("every band that reads a mapped backend collection is wrapped in its own boundary", async (t) => {
  for (const { band, file, child } of PLACEMENTS) {
    await t.test(`${band} wraps <${child}> in ${file}`, () => {
      const source = code(file);
      const opening = new RegExp(`<SectionBoundary\\b[^>]*\\bband="${band}"[^>]*>`);
      const match = source.match(opening);
      assert.ok(match, `no <SectionBoundary band="${band}"> in ${file}`);

      /* The next JSX element opened after the boundary must be the panel it exists to contain.
         Whitespace and JSX expression braces are allowed between them; another component is not. */
      const after = source.slice(match.index + match[0].length);
      const next = after.match(/<\s*([A-Za-z][\w.]*)/);
      assert.ok(next, `<SectionBoundary band="${band}"> wraps nothing`);
      assert.equal(
        next[1],
        child,
        `<SectionBoundary band="${band}"> should wrap <${child}>, found <${next[1]}>`,
      );
    });
  }

  await t.test("no band is wrapped twice and none has been renamed away", () => {
    const bands = [];
    for (const file of new Set(PLACEMENTS.map((p) => p.file))) {
      for (const found of code(file).matchAll(/<SectionBoundary\b[^>]*\bband="([^"]+)"/g)) {
        bands.push(found[1]);
      }
    }
    assert.deepEqual(
      [...bands].sort(),
      PLACEMENTS.map((p) => p.band).sort(),
      "the set of boundaries on these two routes changed; update PLACEMENTS deliberately, or put the boundary back",
    );
  });

  await t.test("the boundary still declares itself a client component", () => {
    /* SectionBoundary is a class component using getDerivedStateFromError. Without the directive it
       becomes a server component at build time and catches nothing at runtime, which is a silent
       removal of all five boundaries at once. */
    const source = readFileSync(new URL("../components/app/SectionBoundary.tsx", import.meta.url), "utf8");
    assert.match(source.split("\n")[0], /^"use client";$/);
    assert.match(code("components/app/SectionBoundary.tsx"), /static getDerivedStateFromError/);
  });
});
