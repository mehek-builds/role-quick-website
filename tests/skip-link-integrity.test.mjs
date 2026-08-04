import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { handleAnchorActivation } from "../lib/anchor-navigation.ts";

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

/* The structural tests above say the link is present, points somewhere real,
 * comes first, and shows itself on focus. All four passed the whole time the
 * link did nothing.
 *
 * What was actually broken: activating it set the hash and left focus on the
 * link. The viewport moved, the keyboard user did not, and the next Tab put
 * them back in the header the link exists to skip. These tests cover the part
 * the source-reading tests structurally cannot see.
 *
 * A hand-built stub rather than jsdom: the repo has no DOM test dependency,
 * and the handler only touches a handful of methods, all of them listed here.
 * If this stub starts needing real layout, that is the signal to move the
 * assertion into tests/e2e/ where playwright-core already lives. */
function fakeTarget(tagName = "SECTION", attributes = {}) {
  const attrs = { ...attributes };
  return {
    tagName,
    isContentEditable: false,
    focusCalls: [],
    listeners: {},
    hasAttribute: (name) => name in attrs,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => {
      attrs[name] = value;
    },
    removeAttribute: (name) => {
      delete attrs[name];
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    focus(options) {
      this.focusCalls.push(options);
    },
  };
}

function fakeClick(href, target) {
  const anchor = { getAttribute: (name) => (name === "href" ? href : null) };
  const pushed = [];
  const event = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    target: { closest: () => anchor },
  };
  const doc = {
    querySelector: (selector) => (selector === href ? target : null),
    defaultView: { history: { pushState: (_s, _t, url) => pushed.push(url) } },
  };
  return { event, doc, pushed };
}

/* Read the real href out of the page so this cannot drift from the markup the
   tests above are guarding. */
const SKIP_TARGET_HREF = `#${SOURCE.match(SKIP_HREF)?.[1]}`;

describe("landing skip link, when a keyboard user activates it", () => {
  test("focus lands on the target section, not on the link", () => {
    const target = fakeTarget();
    const { event, doc } = fakeClick(SKIP_TARGET_HREF, target);

    handleAnchorActivation(event, doc, () => {});

    assert.equal(
      target.focusCalls.length,
      1,
      `\n\nActivating the skip link did not move focus to ${SKIP_TARGET_HREF}.\n\nThis is the original bug. The page scrolled, the hash changed, and focus stayed on the skip link, so the very next Tab resumed from the top of the document and handed the keyboard user back the header they had just skipped. A screen reader announced nothing, because for it nothing had happened.\n\nA skip link that scrolls but does not move focus is not a skip link.\n`
    );
    assert.deepEqual(
      target.focusCalls[0],
      { preventScroll: true },
      "focus() must pass preventScroll, or the browser snaps the viewport itself and cuts off the Lenis glide at the first frame"
    );
  });

  test("the section borrows a tabindex so focus can land at all", () => {
    const target = fakeTarget();
    const { event, doc } = fakeClick(SKIP_TARGET_HREF, target);

    handleAnchorActivation(event, doc, () => {});

    assert.equal(
      target.getAttribute("tabindex"),
      "-1",
      "a <section> is not focusable on its own, so without tabindex=-1 the focus() call is a silent no-op"
    );

    /* Borrowed, not kept: give it back so the section does not sit in the
       accessibility tree as a focusable element for everyone afterwards. */
    assert.equal(
      typeof target.listeners.blur,
      "function",
      "nothing removes the borrowed tabindex, so it outlives the visit"
    );
    target.listeners.blur();
    assert.equal(target.getAttribute("tabindex"), null);
  });

  test("a target that is already focusable is left alone", () => {
    const target = fakeTarget("SECTION", { tabindex: "0" });
    const { event, doc } = fakeClick(SKIP_TARGET_HREF, target);

    handleAnchorActivation(event, doc, () => {});

    assert.equal(
      target.getAttribute("tabindex"),
      "0",
      "an author-set tabindex was overwritten, which changes where the section sits in the tab order"
    );
  });

  test("the scroll travels through Lenis, since a native hash jump is a no-op under it", () => {
    const target = fakeTarget();
    const { event, doc, pushed } = fakeClick(SKIP_TARGET_HREF, target);
    const scrolled = [];

    handleAnchorActivation(event, doc, (el) => scrolled.push(el));

    assert.deepEqual(
      scrolled,
      [target],
      `\n\nThe handler did not hand ${SKIP_TARGET_HREF} to the scroll callback.\n\nLenis owns the scroll position on this page. The browser's own hash jump cannot move it, so if the handler does not call through to Lenis the viewport never moves.\n`
    );
    assert.equal(
      event.defaultPrevented,
      true,
      "the native jump has to be prevented, or the browser fights Lenis for the scroll position"
    );
    assert.deepEqual(pushed, [SKIP_TARGET_HREF], "the hash was not written to history");
  });

  test("under reduced motion the browser keeps the scroll and only focus is moved", () => {
    const target = fakeTarget();
    const { event, doc, pushed } = fakeClick(SKIP_TARGET_HREF, target);

    /* null scroll callback is the reduced-motion path: Lenis is never
       constructed there, so the native hash jump is the thing that scrolls. */
    handleAnchorActivation(event, doc, null);

    assert.equal(
      event.defaultPrevented,
      false,
      "reduced motion has no Lenis to scroll through, so preventing the native jump leaves the page stuck at the top"
    );
    assert.deepEqual(pushed, [], "the browser writes the hash itself on the native path");
    assert.equal(
      target.focusCalls.length,
      1,
      "reduced motion still needs the focus half: the native jump scrolls but does not focus an element that has no tabindex"
    );
  });

  test("a bare '#' href is left to whatever it is", () => {
    const target = fakeTarget();
    const { event, doc } = fakeClick("#", target);

    assert.equal(handleAnchorActivation(event, doc, () => {}), false);
    assert.equal(event.defaultPrevented, false);
  });
});
