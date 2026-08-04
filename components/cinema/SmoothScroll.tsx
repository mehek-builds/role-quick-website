"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { handleAnchorActivation } from "@/lib/anchor-navigation";

/* Scroll pacing (effect 6 of 6): Lenis gives the page scroll weight, and
   every ScrollTrigger on the page reads from it. Mounted once on the
   homepage. Reduced motion: never initialized, native scroll untouched. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      /* No Lenis here, so the browser's own hash jump does the scrolling and
         is left alone. Focus still has to be moved by hand: without it the
         skip link scrolls the page and then hands the next Tab back to the
         header it just skipped. Same handler, no scroll callback. */
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
        lenis.scrollTo(target, { offset: -56, duration: 1.3 })
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
