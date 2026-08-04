"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { handleAnchorActivation } from "@/lib/anchor-navigation";

/* Scroll pacing (effect 6 of 6): Lenis gives the page scroll weight, and
   every ScrollTrigger on the page reads from it. Mounted once on the
   homepage. Reduced motion: Lenis is still never initialized and the native
   scroll is still untouched, but a click listener runs the focus half of
   anchor navigation, which the native hash jump does not do on its own. */
/* How far above an anchor target the Lenis glide stops, so the fixed header
   does not sit on top of what the visitor just asked to see. The native path
   (reduced motion) gets the same clearance from Tailwind's scroll-mt on the
   target sections instead, which is why the two are not one value. */
const HEADER_CLEARANCE_PX = 56;

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      /* No Lenis here, so the browser's own hash jump is left alone to do the
         scrolling: it runs as the default action, right after this handler
         returns. Focus still has to be moved by hand, because a hash jump
         scrolls without focusing anything. Without it the skip link moves the
         page and then hands the next Tab back to the header it just skipped.
         Same handler, no scroll callback. */
      const onNativeAnchor = (e: MouseEvent) =>
        handleAnchorActivation(e, document, null);
      document.addEventListener("click", onNativeAnchor);
      return () => document.removeEventListener("click", onNativeAnchor);
    }

    gsap.registerPlugin(ScrollTrigger);
    /* Lenis owns pacing; the CSS smooth-behavior would fight it. */
    const prevBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";

    /* weightier, calmer: lower lerp = longer glide, no sudden stops */
    const lenis = new Lenis({ lerp: 0.07, wheelMultiplier: 0.85 });
    /* handle for scripted scrolls (QA tooling, console) */
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    /* Anchor jumps travel the page through Lenis (the existing site rule:
       the visitor sees the sections between here and there), and then focus
       follows the viewport. See lib/anchor-navigation.ts for why both halves
       have to be spelled out. */
    const onClick = (e: MouseEvent) =>
      handleAnchorActivation(e, document, (target) =>
        lenis.scrollTo(target, {
          offset: -HEADER_CLEARANCE_PX,
          duration: 1.3,
        })
      );
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      gsap.ticker.remove(raf);
      lenis.destroy();
      document.documentElement.style.scrollBehavior = prevBehavior;
    };
  }, []);

  return null;
}
