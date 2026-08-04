/* In-page anchor jumps, both halves of them.
 *
 * Six anchors on the landing page reach this: the skip link (app/page.tsx) and
 * "See how it works" in the film (CinematicHero) both point at #documents, and
 * the header and footer each carry /#product and /#faq. They shared a scroll
 * fix and none of them had a focus fix, which is the half that matters most for
 * the one that exists only for keyboard users.
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

/* Matches the two forms an in-page link takes here: "#documents" as written in
   app/page.tsx and CinematicHero, and "/#product" as written literally in the
   header and footer, which build an absolute path first. */
const ANCHOR_SELECTOR = 'a[href^="#"], a[href^="/#"]';

/** Resolves an anchor's href to the element it points at, or null.
 *
 *  getElementById rather than querySelector, for two reasons. querySelector
 *  reads the href as a CSS selector, so an id that is not a valid CSS ident
 *  ("#2026-roadmap", "#3d-view") throws a SyntaxError out of a document-level
 *  click listener, and the throw lands BEFORE preventDefault, which hands the
 *  scroll back to the browser mid-glide and desyncs every ScrollTrigger on the
 *  page. It also only guarantees the FIRST character: "#a, input" is a valid
 *  selector list that would resolve to some unrelated input. getElementById
 *  cannot throw and cannot match a second element. */
export function resolveAnchorTarget(
  href: string | null,
  doc: Document
): HTMLElement | null {
  const hash = (href ?? "").replace(/^\//, "");
  /* length < 2 drops bare "#", which is a button wearing a link and has no
     target to resolve. */
  if (!hash.startsWith("#") || hash.length < 2) return null;

  /* Percent-decoded to match how the browser resolves its own fragments: an
     href written "#caf%C3%A9" points at id="café". */
  let id = hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    /* Malformed escape sequence. Fall through with the raw id rather than
       throwing out of a click listener. */
  }
  return doc.getElementById(id);
}

/** Moves real focus to an anchor target, so the next Tab continues from the
 *  content and a screen reader announces the new location. */
export function focusAnchorTarget(target: HTMLElement, doc: Document): void {
  /* Try the element as it stands first. Tag name is NOT focusability: <a>
     without href and <button disabled> would both pass a naive tag allowlist
     while .focus() stays a silent no-op, which is the original bug back again
     with no error and no failing test. Asking the document who ended up
     focused is the only answer that cannot drift. */
  target.focus({ preventScroll: true });
  if (doc.activeElement === target) return;

  /* It did not take, so the target is not focusable on its own. -1 makes it
     programmatically focusable without adding a tab stop of its own. Never
     overwrite an author's own value. */
  if (target.hasAttribute("tabindex")) return;
  target.setAttribute("tabindex", "-1");

  /* Left in place deliberately, rather than handed back on blur. A blur-based
     release fires when the WINDOW loses focus too, so switching tabs and
     coming back would strip the attribute, the browser would fail to restore
     focus to a no-longer-focusable section, and the next Tab would resume from
     the top of the document: exactly the bug this file exists to fix. A
     resting tabindex="-1" adds no tab stop and no accessibility-tree change,
     and the repo's own focus traps already exclude it by selector. */
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
  /* Leave every gesture that means "open this somewhere else" alone. Without
     this, cmd-click and shift-click on the header's /#product scroll the page
     instead of opening a tab or a window, because both dispatch an ordinary
     click that preventDefault would swallow. */
  if (
    event.defaultPrevented ||
    (event.button ?? 0) !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  const anchor = (event.target as HTMLElement | null)?.closest?.(
    ANCHOR_SELECTOR
  ) as HTMLAnchorElement | null;
  if (!anchor) return false;
  /* target="_blank" opens elsewhere; same reasoning as the modifier keys. */
  if (anchor.target && anchor.target !== "_self") return false;

  const href = anchor.getAttribute("href");
  const target = resolveAnchorTarget(href, doc);
  if (!target) return false;

  if (scrollToTarget) {
    event.preventDefault();
    scrollToTarget(target);
    /* pushState rather than setting location.hash: the hash setter would make
       the browser jump the scroll position out from under Lenis. */
    doc.defaultView?.history.pushState(null, "", (href ?? "").replace(/^\//, ""));
  }

  focusAnchorTarget(target, doc);
  return true;
}
