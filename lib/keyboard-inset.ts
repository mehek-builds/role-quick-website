/**
 * How much of the layout viewport's bottom edge is currently covered by something the page cannot
 * see: on a phone, the software keyboard.
 *
 * WHY THIS EXISTS
 * ===============
 * `position: sticky; bottom: X` resolves against the SCROLLPORT, which is the layout viewport. On
 * iOS Safari the layout viewport does not shrink when the keyboard opens: `window.innerHeight` is
 * unchanged and only `visualViewport.height` drops. So a bottom-sticky action bar stays pinned to
 * a layout-viewport edge that is now behind the keyboard, and is invisible for exactly as long as
 * a text field is focused.
 *
 * That is not an edge case for this product. Both screens that use a terminal action bar are
 * screens made of textareas: the review screen wraps an editable resume and a cover letter, and
 * the questions screen is N six-row boxes. The keyboard is up for essentially the whole time
 * either screen is being used on a phone, which is the traffic this whole change is about.
 *
 * Android Chrome resizes the layout viewport instead, so `overlap` there is 0 and nothing moves.
 * The same is true of every desktop browser. This is a no-op everywhere except the case it fixes.
 *
 * WHY A THRESHOLD
 * ===============
 * `visualViewport` also moves for pinch-zoom, for elastic overscroll, and for sub-pixel rounding
 * during momentum scrolling. Reacting to those would make the bar twitch while a student scrolls.
 * A keyboard is hundreds of pixels tall; nothing else that routinely covers the bottom of the
 * viewport is. `MIN_KEYBOARD_PX` is the floor below which an overlap is treated as noise, not as a
 * keyboard, and it is deliberately well above browser-chrome-sized movement and well below the
 * shortest real keyboard (the iPhone SE landscape keyboard is ~160px).
 */

/** Below this, an overlap is scroll or zoom noise rather than a keyboard. */
export const MIN_KEYBOARD_PX = 100;

export type ViewportGeometry = {
  /** The layout viewport's height. `window.innerHeight`. */
  layoutHeight: number;
  /** The visible height. `visualViewport.height`. */
  visualHeight: number;
  /** How far the visual viewport sits down the layout viewport. `visualViewport.offsetTop`. */
  offsetTop: number;
};

/**
 * Pixels of the layout viewport's bottom that are covered, rounded, never negative, and 0 unless
 * the overlap is big enough to be a keyboard.
 *
 * The subtraction has to include `offsetTop`, and the direction is worth stating because the first
 * draft of the test beside this asserted it backwards. The visual viewport occupies
 * `[offsetTop, offsetTop + visualHeight]` of the layout viewport, so the hidden bottom strip is
 * everything below that, which is `layoutHeight - visualHeight - offsetTop`. When iOS scrolls the
 * visual viewport DOWN to keep a focused field above the keyboard, less of the bottom is left
 * covered, not more: height alone would OVER-report by exactly `offsetTop` and float the bar that
 * far above the keyboard, leaving a visible gap of dead space over it.
 */
export function keyboardInsetFrom({ layoutHeight, visualHeight, offsetTop }: ViewportGeometry): number {
  if (![layoutHeight, visualHeight, offsetTop].every((n) => Number.isFinite(n))) return 0;
  const overlap = Math.round(layoutHeight - (visualHeight + offsetTop));
  if (overlap < MIN_KEYBOARD_PX) return 0;
  return overlap;
}

/** The browser-side read. Safe only after mount, and 0 anywhere `visualViewport` is absent. */
export function currentKeyboardInset(): number {
  if (typeof window === "undefined" || !window.visualViewport) return 0;
  return keyboardInsetFrom({
    layoutHeight: window.innerHeight,
    visualHeight: window.visualViewport.height,
    offsetTop: window.visualViewport.offsetTop,
  });
}
