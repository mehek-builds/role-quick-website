import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  handleAnchorActivation,
  resolveAnchorTarget,
} from "../lib/anchor-navigation.ts";

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
 * A hand-built stub rather than jsdom: the repo has no DOM test dependency.
 * The stub models the three DOM behaviours this handler actually depends on,
 * because an earlier, looser version of it was provably blind:
 *
 *   1. closest() honours its selector. The first version returned the anchor
 *      no matter what was asked for, so replacing ANCHOR_SELECTOR with a
 *      string that matches nothing still passed every test.
 *   2. lookup goes through the same normalisation the code does. The first
 *      version compared the raw href by string identity, which made a
 *      "/#product" case structurally impossible to write, so deleting the
 *      leading-slash strip also passed every test. /#product and /#faq are
 *      real hrefs in the header and footer.
 *   3. focus() is a no-op on an element that is not focusable, and
 *      activeElement reflects that. This is the whole reason the handler
 *      borrows a tabindex, so a stub where focus() always "works" cannot see
 *      the bug it is meant to guard.
 *
 * If this stub ever needs real layout, that is the signal to move the
 * assertion into tests/e2e/ where playwright-core already lives. */

/* Enough of a[href^="#"], a[href^="/#"] to answer honestly. */
function matchesAnchorSelector(selector, href) {
  return selector
    .split(",")
    .map((part) => part.trim())
    .some((part) => {
      const prefix = part.match(/^a\[href\^="(.+)"\]$/)?.[1];
      return prefix !== undefined && href.startsWith(prefix);
    });
}

const NATURALLY_FOCUSABLE_TAGS = new Set(["A", "BUTTON", "INPUT", "TEXTAREA"]);

function fakeDom({
  href,
  targetTag = "SECTION",
  targetAttrs = {},
  targetId,
  /* Focusable markup that still refuses focus: hidden, inert, or inside a
     display:none subtree. focus() is a silent no-op on all of them. */
  neverFocusable = false,
}) {
  const attrs = { ...targetAttrs };
  const doc = { activeElement: null };

  const target = {
    tagName: targetTag,
    focusCalls: [],
    hasAttribute: (name) => name in attrs,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => {
      attrs[name] = value;
    },
    removeAttribute: (name) => {
      delete attrs[name];
    },
    focus(options) {
      this.focusCalls.push(options);
      /* Real focus() silently does nothing when the element is not focusable.
         Naturally focusable tags qualify; anything else needs a tabindex. */
      const focusable =
        !neverFocusable &&
        (NATURALLY_FOCUSABLE_TAGS.has(this.tagName) || "tabindex" in attrs);
      if (focusable) doc.activeElement = this;
    },
  };

  /* targetId defaults to the id the href points at, so the lookup only
     succeeds if the code normalises "/#x" to "#x" the way the browser does. */
  const id = targetId ?? href.replace(/^\//, "").slice(1);
  const anchor = {
    tagName: "A",
    target: "",
    getAttribute: (name) => (name === "href" ? href : null),
  };

  const pushed = [];
  doc.getElementById = (wanted) => (wanted === id ? target : null);
  doc.defaultView = {
    history: { pushState: (_state, _title, url) => pushed.push(url) },
  };

  return { doc, target, anchor, pushed };
}

function fakeClick(href, dom, overrides = {}) {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    target: {
      closest: (selector) =>
        matchesAnchorSelector(selector, href) ? dom.anchor : null,
    },
    ...overrides,
  };
}

/* Read the real href out of the page so this cannot drift from the markup the
   structural tests above are guarding. */
const SKIP_TARGET_HREF = `#${SOURCE.match(SKIP_HREF)?.[1]}`;

describe("landing skip link, when a keyboard user activates it", () => {
  test("focus lands on the target section, not on the link", () => {
    const dom = fakeDom({ href: SKIP_TARGET_HREF });

    handleAnchorActivation(fakeClick(SKIP_TARGET_HREF, dom), dom.doc, () => {});

    assert.equal(
      dom.doc.activeElement,
      dom.target,
      `\n\nActivating the skip link did not move focus to ${SKIP_TARGET_HREF}.\n\nThis is the original bug. The page scrolled, the hash changed, and focus stayed on the skip link, so the very next Tab resumed from the top of the document and handed the keyboard user back the header they had just skipped. A screen reader announced nothing, because for it nothing had happened.\n\nA skip link that scrolls but does not move focus is not a skip link.\n`
    );
    assert.deepEqual(
      dom.target.focusCalls.at(-1),
      { preventScroll: true },
      "focus() must pass preventScroll, or the browser snaps the viewport itself and cuts off the Lenis glide at the first frame"
    );
  });

  test("the section borrows a tabindex, because focus alone does not stick", () => {
    const dom = fakeDom({ href: SKIP_TARGET_HREF });

    handleAnchorActivation(fakeClick(SKIP_TARGET_HREF, dom), dom.doc, () => {});

    assert.equal(
      dom.target.getAttribute("tabindex"),
      "-1",
      "a <section> is not focusable on its own, so without tabindex=-1 the focus() call is a silent no-op"
    );
  });

  test("the borrowed tabindex is left in place, not released on blur", () => {
    const dom = fakeDom({ href: SKIP_TARGET_HREF });

    handleAnchorActivation(fakeClick(SKIP_TARGET_HREF, dom), dom.doc, () => {});

    /* An earlier version handed the tabindex back on blur. blur also fires
       when the WINDOW loses focus, so switching tabs and coming back stripped
       it, the browser could not restore focus to a no-longer-focusable
       section, and the next Tab resumed from the top of the document. That is
       the exact bug this file exists to fix, reintroduced by its own cleanup. */
    assert.equal(
      typeof dom.target.blurListener,
      "undefined",
      "a blur listener releases the tabindex when the window loses focus, which reintroduces the original bug on tab-back"
    );
    assert.equal(dom.target.getAttribute("tabindex"), "-1");
  });

  test("a target that is already focusable keeps its own tab order", () => {
    /* Tag name is not focusability, so the handler asks the document who ended
       up focused rather than consulting a list of tag names. A <button> target
       must not be given tabindex=-1: that would pull a real control out of the
       tab order. */
    const dom = fakeDom({ href: SKIP_TARGET_HREF, targetTag: "BUTTON" });

    handleAnchorActivation(fakeClick(SKIP_TARGET_HREF, dom), dom.doc, () => {});

    assert.equal(dom.doc.activeElement, dom.target);
    assert.equal(
      dom.target.getAttribute("tabindex"),
      null,
      "a naturally focusable target was given tabindex=-1, which removes it from the tab order"
    );
  });

  test("an author's own tabindex is never overwritten", () => {
    const dom = fakeDom({
      href: SKIP_TARGET_HREF,
      targetAttrs: { tabindex: "0" },
    });

    handleAnchorActivation(fakeClick(SKIP_TARGET_HREF, dom), dom.doc, () => {});

    assert.equal(
      dom.target.getAttribute("tabindex"),
      "0",
      "an author-set tabindex was overwritten, which changes where the section sits in the tab order"
    );
  });

  test("an author's tabindex survives even when the focus attempt fails", () => {
    /* The case that actually reaches the guard: markup carries tabindex="0",
       but the element refuses focus (hidden, inert, display:none subtree), so
       the handler gets past its activeElement check and would otherwise stamp
       -1 over the author's 0 and quietly change the tab order. */
    const dom = fakeDom({
      href: SKIP_TARGET_HREF,
      targetAttrs: { tabindex: "0" },
      neverFocusable: true,
    });

    handleAnchorActivation(fakeClick(SKIP_TARGET_HREF, dom), dom.doc, () => {});

    assert.equal(dom.target.getAttribute("tabindex"), "0");
  });

  test("the scroll travels through Lenis, since a native hash jump is a no-op under it", () => {
    const dom = fakeDom({ href: SKIP_TARGET_HREF });
    const event = fakeClick(SKIP_TARGET_HREF, dom);
    const scrolled = [];

    handleAnchorActivation(event, dom.doc, (el) => scrolled.push(el));

    assert.deepEqual(
      scrolled,
      [dom.target],
      `\n\nThe handler did not hand ${SKIP_TARGET_HREF} to the scroll callback.\n\nLenis owns the scroll position on this page. The browser's own hash jump cannot move it, so if the handler does not call through to Lenis the viewport never moves.\n`
    );
    assert.equal(
      event.defaultPrevented,
      true,
      "the native jump has to be prevented, or the browser fights Lenis for the scroll position"
    );
    assert.deepEqual(dom.pushed, [SKIP_TARGET_HREF], "the hash was not written to history");
  });

  test("under reduced motion the browser keeps the scroll and only focus is moved", () => {
    const dom = fakeDom({ href: SKIP_TARGET_HREF });
    const event = fakeClick(SKIP_TARGET_HREF, dom);

    /* null scroll callback is the reduced-motion path: Lenis is never
       constructed there, so the native hash jump is the thing that scrolls. */
    handleAnchorActivation(event, dom.doc, null);

    assert.equal(
      event.defaultPrevented,
      false,
      "reduced motion has no Lenis to scroll through, so preventing the native jump leaves the page stuck at the top"
    );
    assert.deepEqual(dom.pushed, [], "the browser writes the hash itself on the native path");
    assert.equal(
      dom.doc.activeElement,
      dom.target,
      "reduced motion still needs the focus half: the native jump scrolls but does not focus an element that has no tabindex"
    );
  });
});

describe("the other five in-page anchors on the landing page", () => {
  /* The skip link is not the only caller. The header and footer write their
     hrefs as "/#product" and "/#faq", which a `href="#` grep does not find and
     which cost this fix a round of review. */
  for (const href of ["/#product", "/#faq"]) {
    test(`${href} resolves and takes focus like the skip link does`, () => {
      const dom = fakeDom({ href });
      const event = fakeClick(href, dom);
      const scrolled = [];

      const handled = handleAnchorActivation(event, dom.doc, (el) =>
        scrolled.push(el)
      );

      assert.equal(
        handled,
        true,
        `${href} was not recognised as an in-page anchor. The leading slash has to be stripped before the id lookup, or the header and footer links resolve to nothing.`
      );
      assert.deepEqual(scrolled, [dom.target]);
      assert.equal(dom.doc.activeElement, dom.target);
      assert.deepEqual(dom.pushed, [href.replace(/^\//, "")]);
    });
  }
});

describe("clicks the anchor handler must keep its hands off", () => {
  test("a click that did not land on an in-page anchor is ignored", () => {
    /* This listener is on document, so it runs for every click on the page. */
    const dom = fakeDom({ href: SKIP_TARGET_HREF });
    const event = fakeClick(SKIP_TARGET_HREF, dom, {
      target: { closest: () => null },
    });

    assert.equal(handleAnchorActivation(event, dom.doc, () => {}), false);
    assert.equal(event.defaultPrevented, false);
    assert.equal(dom.doc.activeElement, null);
  });

  for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
    test(`${key} click still opens in a new tab or window`, () => {
      const dom = fakeDom({ href: "/#product" });
      const event = fakeClick("/#product", dom, { [key]: true });

      assert.equal(handleAnchorActivation(event, dom.doc, () => {}), false);
      assert.equal(
        event.defaultPrevented,
        false,
        `${key}-click was swallowed into an in-page scroll instead of opening a new tab`
      );
      assert.equal(dom.doc.activeElement, null);
    });
  }

  test("a non-primary mouse button is ignored", () => {
    const dom = fakeDom({ href: "/#product" });
    const event = fakeClick("/#product", dom, { button: 1 });

    assert.equal(handleAnchorActivation(event, dom.doc, () => {}), false);
    assert.equal(event.defaultPrevented, false);
  });

  test("an anchor that opens elsewhere is left to the browser", () => {
    const dom = fakeDom({ href: "/#product" });
    dom.anchor.target = "_blank";
    const event = fakeClick("/#product", dom);

    assert.equal(handleAnchorActivation(event, dom.doc, () => {}), false);
    assert.equal(event.defaultPrevented, false);
  });

  test("an already-handled click is not handled twice", () => {
    const dom = fakeDom({ href: SKIP_TARGET_HREF });
    const event = fakeClick(SKIP_TARGET_HREF, dom, { defaultPrevented: true });

    assert.equal(handleAnchorActivation(event, dom.doc, () => {}), false);
  });

  test("an anchor pointing at an id that no longer exists is inert, not fatal", () => {
    /* The drift the structural tests above document: #product was renamed once
       already. The handler must not preventDefault a jump it cannot perform. */
    const dom = fakeDom({ href: "#gone", targetId: "still-here" });
    const event = fakeClick("#gone", dom);
    const scrolled = [];

    assert.equal(
      handleAnchorActivation(event, dom.doc, (el) => scrolled.push(el)),
      false
    );
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual(scrolled, []);
  });

  test("a bare '#' href has no target to resolve", () => {
    /* A button wearing a link. Nothing to scroll to, nothing to focus. */
    const dom = fakeDom({ href: "#", targetId: "documents" });
    const event = fakeClick("#", dom);

    assert.equal(handleAnchorActivation(event, dom.doc, () => {}), false);
    assert.equal(event.defaultPrevented, false);
  });
});

describe("resolving an href to its target", () => {
  test("an id that is not a valid CSS selector does not throw", () => {
    /* querySelector reads the href as a CSS selector, so "#2026-roadmap"
       throws a SyntaxError out of a document-level click listener, and the
       throw lands before preventDefault, handing the scroll back to the
       browser mid-glide. getElementById cannot throw. */
    const doc = { getElementById: (id) => (id === "2026-roadmap" ? {} : null) };

    assert.doesNotThrow(() => resolveAnchorTarget("#2026-roadmap", doc));
    assert.ok(resolveAnchorTarget("#2026-roadmap", doc));
  });

  test("an href cannot select a second, unrelated element", () => {
    /* "#nope, input" is a valid CSS selector list. querySelector would return
       the first <input> on the page and the handler would focus it. */
    const doc = { getElementById: (id) => (id === "nope" ? {} : null) };

    assert.equal(resolveAnchorTarget("#nope, input", doc), null);
  });

  test("a percent-encoded href resolves the way the browser resolves it", () => {
    const doc = { getElementById: (id) => (id === "café" ? {} : null) };

    assert.ok(resolveAnchorTarget("#caf%C3%A9", doc));
  });

  test("a malformed escape does not throw", () => {
    const doc = { getElementById: () => null };

    assert.doesNotThrow(() => resolveAnchorTarget("#%E0%A4%A", doc));
  });
});
