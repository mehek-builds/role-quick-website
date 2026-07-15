"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useRef } from "react";

/* Page-wide cinema: the connective tissue that makes the whole site read as
   one scroll. Owns (a) the site-wide grain, (b) the fixed chapter rail that
   tracks the reader from the film through every section to the close, and
   (c) scroll-scrubbed parallax on every [data-parallax] mockup. The film
   section (CinematicHero) stays its own machine; this component only reads
   its wrapper's progress for the rail labels. Reduced motion: rail and
   parallax never initialize, grain is static (globals.css). */

const FILM_CHAPTERS = [
  { at: 0.0, label: "00 · Detected" },
  { at: 0.24, label: "01 · Documents" },
  { at: 0.5, label: "02 · Autofill" },
  { at: 0.74, label: "03 · Outreach" },
  { at: 0.92, label: "04 · Application ready" },
];

/* Sections below the film, in scroll order. ids live in app/page.tsx. */
const SECTIONS = [
  { id: "#product", label: "The receipt" },
  { id: "#odds", label: "The odds" },
  { id: "#formats", label: "ATS formats" },
  { id: "#documents", label: "01 · Documents" },
  { id: "#autofill", label: "02 · Autofill" },
  { id: "#outreach", label: "03 · Outreach" },
  { id: "#try", label: "Now you drive" },
  { id: "#pricing", label: "Pricing" },
  { id: "#faq", label: "Questions" },
  { id: "#close", label: "Your move" },
];

export function CinematicPage() {
  const railLabelRef = useRef<HTMLParagraphElement>(null);
  const railFillRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);

    const setLabel = (text: string) => {
      if (railLabelRef.current && railLabelRef.current.textContent !== text)
        railLabelRef.current.textContent = text;
    };

    /* rail fill + label from one whole-page trigger. The label is
       recomputed from live positions every frame instead of per-section
       toggles: toggle state seeded during hydration (viewport can read 0)
       was leaving a stale label at the top of the page. */
    const film = document.querySelector(".rq-cine");
    const secEls = SECTIONS.map((s) => ({
      el: document.querySelector(s.id),
      label: s.label,
    })).filter((s): s is { el: Element; label: string } => s.el !== null);
    ScrollTrigger.create({
      trigger: document.body,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.5,
      onUpdate(self) {
        if (railFillRef.current)
          railFillRef.current.style.transform = `scaleY(${self.progress})`;
        const vh = window.innerHeight;
        if (!vh) return;
        let label = "";
        for (const s of secEls) {
          const r = s.el.getBoundingClientRect();
          if (r.top <= vh * 0.55 && r.bottom > vh * 0.55) {
            label = s.label;
            break;
          }
        }
        if (!label && film) {
          const fr = film.getBoundingClientRect();
          if (fr.bottom > vh) {
            const p = Math.min(
              1,
              Math.max(0, -fr.top / Math.max(1, fr.height - vh))
            );
            label = FILM_CHAPTERS[0].label;
            for (const c of FILM_CHAPTERS) if (p >= c.at) label = c.label;
          }
        }
        if (label) setLabel(label);
      },
    });

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
      {/* the thread: one rail from first frame to footer */}
      <div
        className="rq-siterail pointer-events-none fixed right-6 top-1/2 z-10 hidden -translate-y-1/2 items-center gap-3 sm:flex"
        aria-hidden
      >
        <p
          ref={railLabelRef}
          className="rotate-180 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted [writing-mode:vertical-rl]"
        >
          00 · Detected
        </p>
        <div className="relative h-40 w-px bg-border">
          <div
            ref={railFillRef}
            className="absolute inset-0 origin-top bg-ink"
            style={{ transform: "scaleY(0)" }}
          />
        </div>
      </div>
    </>
  );
}
