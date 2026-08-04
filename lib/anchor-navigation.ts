/* In-page anchor jumps, both halves of them.
 *
 * The landing page has two anchors and they both point at #documents: the skip
 * link at the top of app/page.tsx, and "See how it works" two thirds of the way
 * through the film in CinematicHero. They shared a scroll fix and neither had a
 * focus fix, which is the half that matters for the one of them that exists
 * only for keyboard users.
 *
 * Scroll: Lenis owns the scroll position on the homepage, so a native hash jump
 * is a no-op while it is running. SmoothScroll already routed clicks through
 * lenis.scrollTo for this reason. That part worked.
 *
 * Focus: nothing moved it. Lenis's handler calls preventDefault and then
 * history.pushState, and pushState moves neither focus nor the sequential focus
 * navigation starting point. So the viewport travelled to #documents and focus
 * stayed on the skip link, which means the next Tab resumed from the top of the
 * document and put the keyboard user back in the header they had just skipped.
 * A screen reader announced nothing, because nothing had changed for it.
 *
 * Measuring note, since it cost a session once: verify this in a foreground
 * tab. requestAnimationFrame does not fire in a background tab, so Lenis's raf
 * loop freezes, every animated scrollTo silently does nothing, and the scroll
 * half looks broken when it is not.
 *
 * Kept here rather than inline in SmoothScroll because the reduced-motion path
 * never constructs Lenis and still needs the focus half.
 */

/* Matches the two forms an in-page link takes here: "#documents" written in
   page markup, and "/#documents" written by anything that builds an absolute
   path first. */
const ANCHOR_SELECTOR = 'a[href^="#"], a[href^="/#"]';

/* Elements the browser will focus without help. Anything else needs a borrowed
   tabindex before .focus() does anything at all. */
const NATURALLY_FOCUSABLE = /^(a|button|input|select|textarea|summary|iframe)$/i;

/** Moves real focus to an anchor target, so the next Tab continues from the
 *  content and a screen reader announces the new location. */
export function focusAnchorTarget(target: HTMLElement): void {
  const borrowsTabIndex =
    !target.hasAttribute("tabindex") &&
    !NATURALLY_FOCUSABLE.test(target.tagName) &&
    !target.isContentEditable;

  if (borrowsTabIndex) {
    /* -1 makes the section programmatically focusable without adding a tab
       stop of its own, which would put a stop on every anchor target. */
    target.setAttribute("tabindex", "-1");
    /* Borrowed for this visit only. A tabindex left behind is a focusable
       <section> for every later reader of the page. */
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), {
      once: true,
    });
  }

  /* preventScroll because the scroll is either already in flight through Lenis
     or already done by the native hash jump. Without it the browser snaps the
     viewport itself and cuts the glide off at the first frame. */
  target.focus({ preventScroll: true });
}

/** Handles a click on an in-page anchor.
 *
 *  `scrollToTarget` is how the page moves: pass Lenis's scrollTo when Lenis is
 *  running, or null to leave the browser's own hash jump alone (reduced motion,
 *  where Lenis is never constructed). Focus is moved either way.
 *
 *  Returns true when the event was an in-page anchor this handled. */
export function handleAnchorActivation(
  event: MouseEvent,
  doc: Document,
  scrollToTarget: ((target: HTMLElement) => void) | null
): boolean {
  const anchor = (event.target as HTMLElement | null)?.closest?.(
    ANCHOR_SELECTOR
  ) as HTMLAnchorElement | null;
  if (!anchor) return false;

  const hash = (anchor.getAttribute("href") ?? "").replace(/^\//, "");
  /* length < 2 drops bare "#", which is a button wearing a link and has no
     target to resolve. */
  if (!hash.startsWith("#") || hash.length < 2) return false;

  const target = doc.querySelector(hash) as HTMLElement | null;
  if (!target) return false;

  if (scrollToTarget) {
    event.preventDefault();
    scrollToTarget(target);
    /* pushState rather than setting location.hash: the hash setter would make
       the browser jump the scroll position out from under Lenis. */
    doc.defaultView?.history.pushState(null, "", hash);
  }

  focusAnchorTarget(target);
  return true;
}
