"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SignInLink } from "@/components/SignInLink";

/* The four marketing destinations, declared once so the pill's desktop nav and
   the phone sheet can never drift apart. A phone that sees a different set of
   links from a laptop is how ISSUE-016 stayed invisible for a fortnight.

   These stay string literals: tests/route-integrity.test.mjs scans this file
   for homepage-anchor hrefs and checks each one against the ids on the
   homepage, and it can only do that for text it can read statically. */
const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/browse-jobs", label: "Jobs" },
  { href: "/try", label: "Try it free" },
  { href: "/#faq", label: "FAQ" },
] as const;

const MENU_ID = "header-mobile-nav";

/* Floating glass pill, not a white bar: the film shows around and through
   it, so the page reads as one surface from the first pixel.

   Cinema chrome rule: while the viewer scrolls DOWN through the film the
   pill retires upward so headlines and cards never collide with it; any
   scroll UP (or reaching the top) brings it straight back. Reduced motion
   keeps it parked permanently.

   Two things came out on 2026-07-28 in the deletion pass:

   - The mobile hamburger and its glass sheet. Every link behind it was an
     anchor on the page the visitor is already scrolling, plus a second copy
     of Add to Chrome, and the footer carries all four.
   - Sign in. It sat next to the primary CTA above the fold, competing with
     it for an audience that by definition does not have an account yet.
     /login is still reached from the #close section.

   The hamburger came back on 2026-08-03. Sign in did not, and should not: that
   argument still holds. The hamburger's did not survive the two weeks after it,
   on all three of its premises:

   - "Every link behind it was an anchor on the page you are already
     scrolling." Two of the four are now separate routes, /browse-jobs (added
     after the cut) and /try. You cannot scroll to a different page.
   - "Plus a second copy of Add to Chrome." The pill's CTA is /login now, and
     the sheet below carries no CTA at all, so there is nothing to duplicate.
   - "The footer carries all four." The footer lives inside app/page.tsx and
     renders on the homepage only. On /browse-jobs, /try, /litos-vs-simplify
     and /for-career-centres there is no footer, and with the nav at
     `hidden sm:flex` a phone had no link to anywhere: wordmark, one CTA, dead
     end. Traffic arrives from TikTok and Instagram, so that was most of it.

   The sheet is deliberately links only. The pill keeps "Get started" visible
   at all widths, which is why this can be four quiet destinations rather than
   a second competing ask. */
export function Header() {
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastY = useRef(0);
  /* Read by the scroll handler, which is registered once and must not be torn
     down and rebuilt every time the menu toggles: re-registering resets lastY
     and the pill jumps. Mirrored in an effect rather than assigned during
     render, which the React compiler lint rule correctly rejects. */
  const menuOpenRef = useRef(false);
  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);
  const panelRef = useRef<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  /* Closing always hands focus back to the control that opened the sheet.
     Without this the keyboard lands back at the top of the document and a
     screen-reader user has to walk the whole pill again. */
  const closeMenu = useCallback((returnFocus = false) => {
    setMenuOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      /* ignore sub-jitter deltas so Lenis easing can't flicker the pill */
      if (Math.abs(dy) < 6) return;
      lastY.current = y;
      /* never retire an open menu: the sheet is attached to the pill and would
         ride off the top of the screen with it */
      if (menuOpenRef.current) return;
      if (y < 120) {
        setHidden(false);
        return;
      }
      /* the last viewport is the close CTA + footer: the pill stays retired
         there so it never decapitates the finale headline (Lenis's settle
         corrections otherwise re-show it at the exact bottom) */
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 600 && y > max - 160) {
        setHidden(true);
        return;
      }
      setHidden(dy > 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Everything the open sheet owns: focus, Escape, Tab, and the outside tap.
     One effect rather than four, because they all share the same lifetime and
     the same "is it open" guard, and splitting them made the teardown order
     matter for no benefit. */
  useEffect(() => {
    if (!menuOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>("a[href]"));

    /* Move focus into the sheet so the next Tab is inside it, not further
       along the page behind it. */
    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key !== "Tab") return;
      /* Trap: the sheet covers the page on a phone, so Tab must not walk off
         into content the visitor cannot see.

         Order matters and got this wrong once. The toggle sits inside the pill
         and the sheet renders after it, so in DOM order the toggle is FIRST and
         the last link is last. Listing the toggle last instead made `last` a
         node the visitor never tabbed to, no wrap ever fired, and Tab off the
         final link landed in the page behind the sheet. The toggle stays in the
         ring either way, which is how "close" is reachable by keyboard. */
      const stops = [buttonRef.current, ...focusable()].filter(
        (node): node is HTMLElement => node !== null,
      );
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panel.contains(target) || buttonRef.current?.contains(target)) return;
      closeMenu();
    };

    /* Route change. Every link in here is a plain anchor, so a navigation to
       /browse-jobs or /try tears the component down on its own and there is
       nothing to close. The two homepage anchors are the real case: /#product
       and /#faq are same-document jumps that leave the sheet mounted and open
       over the section it just scrolled to. hashchange covers the click,
       popstate covers Back out of that jump. */
    const onRouteChange = () => closeMenu();

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("hashchange", onRouteChange);
    window.addEventListener("popstate", onRouteChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("hashchange", onRouteChange);
      window.removeEventListener("popstate", onRouteChange);
    };
  }, [menuOpen, closeMenu]);

  return (
    <header
      className={`fixed inset-x-0 top-3 z-30 px-3 transition-transform duration-300 ease-out sm:top-4 sm:px-6 ${
        hidden ? "-translate-y-[130%]" : "translate-y-0"
      }`}
    >
      <div className="rq-glass mx-auto flex max-w-5xl items-center justify-between rounded-full py-2 pl-4 pr-2">
        <a href="/" className="flex min-h-[44px] items-center gap-2">
          {/* The official mark (public/brand/litos-mark.svg), generated by
              scripts/generate-brand-assets.mjs: one drawing, black stack on
              white, everywhere the brand appears. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/litos-mark.svg" alt="" className="h-6 w-6" />
          <span className="text-base font-medium tracking-tight text-ink">
            Litos
          </span>
        </a>
        {/* The "Pricing" link was REMOVED 2026-07-30, with the homepage
            #pricing section it pointed at. It has to go: an anchor pointing
            at no id fails tests/route-integrity.test.mjs.

            What it was here for, if pricing ever comes back: price belongs in
            the nav, not only in a section someone has to scroll past the film
            to reach. Six of ten competitors have no fetchable pricing page at
            all, and being the exception is only worth anything if it is
            findable. */}
        <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
          {NAV.map(({ href, label }) => (
            <a key={href} href={href} className="transition-colors hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {/* Color v1.1: action blue repeats on every true CTA. With Sign in
              gone this is the only control in the pill, which is the point. */}
          {/* Was "Add to Chrome" pointing at the store. The install ask now
              lives once, in #packet, beside the demo of the extension doing
              the work; the header carries the account instead, which is the
              one door that also opens on a phone. Deliberately NOT relabelled
              "Sign in": the pill is still the only control up here, and it has
              to read as an invitation to people who have no account yet. The
              returning-user door is the same one, and /login says "Create
              account" and "Look around without signing up" on arrival. */}
          <SignInLink
            source="header"
            className="inline-flex min-h-[44px] items-center rounded-full bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 sm:px-4 sm:text-sm"
          >
            Get started
          </SignInLink>
          {/* Phones only: the pill hides the nav under sm, so the four
              destinations need a door. One button, one sheet, no second CTA. */}
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls={MENU_ID}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-white/70 sm:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path
                d={menuOpen ? "m6 6 12 12M18 6 6 18" : "M4.5 8h15M4.5 16h15"}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
      {/* Rendered only while open rather than hidden with a class: a sheet that
          is always in the tree is always in the tab order, which is the bug the
          focus trap above exists to prevent. */}
      {menuOpen && (
        <nav
          ref={panelRef}
          id={MENU_ID}
          aria-label="Site"
          className="rq-glass mx-auto mt-2 max-w-5xl rounded-card px-3 py-2 sm:hidden"
          /* Opaque, unlike the pill above it. The 2026-07 sheet used 92% white
             on the same reasoning and it was still not enough: this floats over
             the hero's own glass card on the homepage and over a page headline
             on /browse-jobs, and at 375px the type behind shows straight
             through the links. The pill carries the glass; the menu carries the
             links, and a menu you have to squint at is not a menu. */
          style={{ background: "var(--color-surface)" }}
        >
          {NAV.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={() => closeMenu()}
              className="block rounded-card px-4 py-3 text-base font-medium text-ink transition-colors hover:bg-white/70"
            >
              {label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
