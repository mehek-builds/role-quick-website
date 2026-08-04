import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The two halves of the tab-bar clearance must agree about where `lg` starts.
 *
 * Tailwind 4 emits its `lg` variant as `min-width: 64rem`. The hand-authored media query that
 * zeroes --dashboard-bottom-bar was first written as `min-width: 1024px`, and the two are equal
 * ONLY at a 16px root font size. A reader with a larger default font gets an lg that starts later,
 * so there is a band where the tab bar is still rendered (`lg:hidden` not yet active) while the
 * clearance has already gone to zero: the exact "primary action under the tab bar" defect, aimed at
 * the people most likely to be hurt by it.
 *
 * No viewport test can catch this. Playwright runs at a 16px root, where the two agree. The only
 * thing that catches it is reading the unit.
 */
test("the bottom-bar clearance zeroes at the same breakpoint Tailwind hides the bar at", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const queries = [...css.matchAll(/@media \(min-width: ([^)]+)\) \{\s*:root \{\s*--dashboard-bottom-bar: 0px;/g)];
  assert.equal(queries.length, 1, "exactly one media query may zero --dashboard-bottom-bar");
  assert.equal(
    queries[0][1].trim(),
    "64rem",
    "must be 64rem, matching Tailwind's lg. A px value only agrees at a 16px root font size, and disagreeing restores the bug for anyone who changed their default font size.",
  );
});

/**
 * `main`'s bottom padding and the sticky bar's parked offset must be the SAME expression.
 *
 * They were `calc(var + 2.5rem)` and `var` in the first cut, 100px against 60px, so the bar hopped
 * 40px upward on the final scroll increment, right where a thumb was already reaching for it.
 */
test("a terminal action bar parks exactly where it comes to rest", async () => {
  const shell = await readFile(new URL("../app/dashboard/dashboard-shell.tsx", import.meta.url), "utf8");
  const ui = await readFile(new URL("../components/app/ui.tsx", import.meta.url), "utf8");
  assert.match(shell, /pb-\[var\(--dashboard-action-offset\)\]/);
  assert.match(ui, /sticky bottom-\[var\(--dashboard-action-sticky-offset,[^\]]*\)\]/);
  // The two are different variables ON PURPOSE, and they must agree whenever no keyboard is up.
  // The sticky one adds the keyboard; `main`'s padding must NOT, or the document would jump by a
  // keyboard's height the moment a textarea takes focus. Their only difference is that term.
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--dashboard-action-offset: calc\(var\(--dashboard-bottom-bar\) \+ 2\.5rem\);/);
  assert.match(
    css,
    /--dashboard-action-sticky-offset: calc\(max\(var\(--dashboard-bottom-bar\), var\(--keyboard-inset\)\) \+ 2\.5rem\);/,
  );
  assert.match(css, /--keyboard-inset: 0px;/, "the variable must have a stylesheet default, so a browser with no visualViewport resolves it");
  // A py-* shorthand on main would silently cancel the bottom padding again, which is the whole
  // reason the original defect existed.
  // The CONTENT main, not the loading skeleton's. The skeleton renders no tab bar and needs no
  // clearance, and matching the first <main> in the file silently tested the wrong one.
  const mains = [...shell.matchAll(/<main className="([^"]+)"/g)].map((m) => m[1]);
  const mainClasses = mains.find((c) => c.includes("flex-1")) ?? "";
  assert.ok(mainClasses.length > 0, `could not find the content main among ${mains.length} candidates`);
  assert.ok(
    !/(^|\s)(sm:|md:|lg:|xl:)?py-\d/.test(mainClasses),
    `main must set top and bottom padding separately; a py-* shorthand cancels the clearance. Got: ${mainClasses}`,
  );
});
