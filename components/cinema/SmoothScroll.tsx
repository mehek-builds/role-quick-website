"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* Scroll pacing (effect 6 of 6): Lenis gives the page scroll weight, and
   every ScrollTrigger on the page reads from it. Mounted once on the
   homepage. Reduced motion: never initialized, native scroll untouched. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
       the visitor sees the sections between here and there). */
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.(
        'a[href^="#"], a[href^="/#"]'
      ) as HTMLAnchorElement | null;
      if (!a) return;
      const hash = (a.getAttribute("href") ?? "").replace(/^\//, "");
      if (!hash.startsWith("#") || hash.length < 2) return;
      const el = document.querySelector(hash);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el as HTMLElement, { offset: -56, duration: 1.3 });
      history.pushState(null, "", hash);
    };
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
