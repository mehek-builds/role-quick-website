"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

/* Page-wide cinema: the connective tissue that makes the whole site read as
   one scroll. Owns (a) the site-wide grain and (b) scroll-scrubbed parallax
   on every [data-parallax] mockup. The film section (CinematicHero) stays its
   own machine. Reduced motion: parallax never initializes, grain is static
   (globals.css).

   It used to own a third thing, the fixed chapter rail, along with the
   FILM_CHAPTERS and SECTIONS tables that fed its label and the whole-page
   ScrollTrigger that drove them. All of that came out 2026-07-28 in the
   deletion pass (see the note in the markup below). */

export function CinematicPage() {
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);

    /* parallax: mockups drift against the scroll, whisper-deep */
    document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
      const amp = Number(el.dataset.parallax) || 28;
      gsap.fromTo(
        el,
        { y: amp },
        {
          y: -amp,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 },
        }
      );
    });
  });

  return (
    <>
      {/* site-wide film grain over everything, including the fixed stage */}
      <div
        className="rq-grain pointer-events-none fixed z-10 opacity-[0.04]"
        aria-hidden
      />
      {/* The site rail (a rotated chapter label plus a vertical fill bar down
          the right edge) was REMOVED 2026-07-28 in the deletion pass. It was
          the page's second scroll-progress indicator alongside ScrollProgress,
          and its label was sideways machine voice that had already forced a
          duplicate caption out of the hero. ScrollProgress keeps the one
          progress signal the pinned acts genuinely need. */}
    </>
  );
}
