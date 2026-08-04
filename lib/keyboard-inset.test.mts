import assert from "node:assert/strict";
import test from "node:test";

import { keyboardInsetFrom, MIN_KEYBOARD_PX } from "./keyboard-inset.ts";

/* Real numbers, so a reader can tell whether the arithmetic matches a device rather than matching
   itself. iPhone 14 Pro portrait in Safari: layout viewport 745px tall, keyboard ~336px. */
const IPHONE_LAYOUT = 745;

test("no keyboard means no inset", () => {
  assert.equal(
    keyboardInsetFrom({ layoutHeight: IPHONE_LAYOUT, visualHeight: IPHONE_LAYOUT, offsetTop: 0 }),
    0,
  );
});

test("an open keyboard reports the covered strip", () => {
  assert.equal(
    keyboardInsetFrom({ layoutHeight: IPHONE_LAYOUT, visualHeight: 409, offsetTop: 0 }),
    336,
  );
});

/**
 * The case that makes offsetTop load-bearing rather than decorative.
 *
 * iOS scrolls the VISUAL viewport down to keep a focused field above the keyboard. The visible
 * band is then [120, 529] of a 745px layout viewport, so the strip hidden at the bottom is 216px,
 * not the 336px that height alone reports. An implementation ignoring offsetTop would park the bar
 * 120px higher than the keyboard actually reaches, leaving a band of dead space above it.
 *
 * The first version of this test asserted 456 (336 + 120), which is the arithmetic backwards, and
 * the implementation was right. Worth keeping the number written down.
 */
test("a visual viewport scrolled down reports only the strip still covered", () => {
  assert.equal(
    keyboardInsetFrom({ layoutHeight: IPHONE_LAYOUT, visualHeight: 409, offsetTop: 120 }),
    216,
  );
});

test("scroll and zoom noise is not mistaken for a keyboard", () => {
  for (const overlap of [1, 12, 40, MIN_KEYBOARD_PX - 1]) {
    assert.equal(
      keyboardInsetFrom({ layoutHeight: IPHONE_LAYOUT, visualHeight: IPHONE_LAYOUT - overlap, offsetTop: 0 }),
      0,
      `${overlap}px of overlap must read as noise, not as a keyboard`,
    );
  }
  assert.equal(
    keyboardInsetFrom({ layoutHeight: IPHONE_LAYOUT, visualHeight: IPHONE_LAYOUT - MIN_KEYBOARD_PX, offsetTop: 0 }),
    MIN_KEYBOARD_PX,
    "the threshold itself counts",
  );
});

/* Android Chrome and every desktop browser resize the layout viewport, so the two heights stay
   equal and this whole mechanism is inert. Elastic overscroll can make the visual viewport taller
   than the layout one, which must not produce a negative offset. */
test("a layout viewport that already resized, or overscrolls, yields nothing", () => {
  assert.equal(keyboardInsetFrom({ layoutHeight: 409, visualHeight: 409, offsetTop: 0 }), 0);
  assert.equal(keyboardInsetFrom({ layoutHeight: 745, visualHeight: 800, offsetTop: 0 }), 0);
});

test("garbage in yields zero rather than NaN in a CSS variable", () => {
  assert.equal(keyboardInsetFrom({ layoutHeight: Number.NaN, visualHeight: 409, offsetTop: 0 }), 0);
  assert.equal(keyboardInsetFrom({ layoutHeight: 745, visualHeight: Number.POSITIVE_INFINITY, offsetTop: 0 }), 0);
});
