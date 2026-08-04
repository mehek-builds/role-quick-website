import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

/* The landing page carries one skip link, and a comment above it explains why:
 * a fixed header and a long scroll film sit between the top of the page and the
 * first real content, so a keyboard user needs a way past them.
 *
 * That comment used to justify itself with a footer line claiming the site was
 * "keyboard-navigable end to end". The line was added 2026-07-05, reworded, and
 * cut on 2026-07-27. The comment kept citing it for a week. Nothing failed,
 * because nothing checked.
 *
 * This test is the check. It does not assert any copy, deliberately, since
 * copy is exactly what rotted last time. It asserts the three things the skip
 * link actually needs in order to work at all:
 *
 *   1. it exists,
 *   2. its href resolves to a section that exists on this page,
 *   3. nothing focusable precedes it, so it really is the first tab stop.
 *
 * The failure it guards: rename or delete the target section and the link
 * still renders, still takes the first tab, and jumps nowhere. The one user
 * who needed it is the one user who finds out.
 *
 * Source is parsed as text rather than imported because app/page.tsx is a
 * server component pulling in the whole cinematic layer. The shapes here are
 * simple and the file is ours, so a regex is the cheaper honest tool. */
const SOURCE = readFileSync("app/page.tsx", "utf8");

const SKIP_HREF = /<a\s+href="#([a-zA-Z0-9_-]+)"/;

describe("landing skip link", () => {
  test("the skip link is still on the page", () => {
    assert.match(
      SOURCE,
      SKIP_HREF,
      'app/page.tsx has no skip link. It is the first tab stop past a fixed header and a long scroll film. If it was removed on purpose, delete this test in the same commit and say why; do not leave the page without an escape.'
    );
  });

  test("its target section exists on this page", () => {
    const target = SOURCE.match(SKIP_HREF)?.[1];
    assert.ok(target, "could not parse the skip link href");

    assert.ok(
      SOURCE.includes(`id="${target}"`),
      `\n\nThe skip link points at #${target}, and no element on app/page.tsx has that id.\n\nThe link still renders and still takes the first tab, it just lands nowhere. This already happened once: the target was #product until #product became the film wrapper, which made the link skip to the thing it exists to skip.\n\nEither restore id="${target}" or repoint the link at the first real section past the hero.\n`
    );
  });

  test("nothing focusable comes before it", () => {
    const bodyStart = SOURCE.indexOf("export default function Home()");
    assert.notEqual(bodyStart, -1, "Home() not found in app/page.tsx");

    const linkAt = SOURCE.search(SKIP_HREF);
    const before = SOURCE.slice(bodyStart, linkAt);

    /* Comments explain the link and mention its history, so strip them before
     * looking for markup. A remembered <a href="#product"> is not a tab stop. */
    const markup = before.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

    const focusable = [...markup.matchAll(/<(a|button|input|select|textarea)[\s>]/g)].map(
      (m) => m[1]
    );

    assert.deepEqual(
      focusable,
      [],
      `\n\nA <${focusable[0]}> renders before the skip link, so the skip link is no longer the first tab stop and a keyboard user meets that element first instead.\n\nMove the new element after the skip link, or if it genuinely belongs first, update the comment above the link so it stops claiming a position it does not hold.\n`
    );
  });

  test("it stays invisible until focused", () => {
    const linkAt = SOURCE.search(SKIP_HREF);
    const tag = SOURCE.slice(linkAt, SOURCE.indexOf(">", linkAt));

    assert.match(
      tag,
      /\bsr-only\b/,
      "the skip link lost sr-only, so it now renders visibly above the header for every user"
    );
    assert.match(
      tag,
      /\bfocus:not-sr-only\b/,
      "the skip link lost focus:not-sr-only, so it stays screen-reader-only and never becomes visible when a keyboard user tabs to it"
    );
  });
});
