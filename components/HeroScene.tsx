"use client";

import { useEffect, useRef, useState } from "react";
import captures from "@/lib/captures.json";

/* The hero scene: a REAL screenshot of the Litos popup, composited where it
   actually lives — docked under its own toolbar icon, over a job posting.
 *
 * What went wrong in the previous draft
 * -------------------------------------
 * It was a container for an asset, not a scene. A 380px popup sat in a 1000px
 * rounded box with three grey dots on top, and the other 60% of the box was
 * empty off-white with a caption floating in it. Three grey dots are not
 * browser chrome, they are the idea of browser chrome; the one element that
 * carried meaning (the toolbar, the extension icon, the page underneath) was
 * the element that had been left out. Litos's whole claim is that it reads the
 * posting off the page you are already on, and there was no page. The popup
 * even says "Found on this page" into a void.
 *
 * What this does instead
 * ----------------------
 * The composition follows the pattern every extension product converges on
 * (Simplify, Grammarly, Raycast):
 *
 *   1. Draw the ENVIRONMENT, don't fake the product. The window frame, tab and
 *      toolbar below are drawn. They are Chrome's furniture, not Litos's UI,
 *      so they are framing rather than a re-created product screenshot. The one
 *      Litos pixel in the whole frame is the real capture.
 *   2. GREEK the host page. The posting behind the popup is grey bars, with
 *      exactly one real line: the role and company, which is the line the popup
 *      claims to have read. A visitor sees the title on the page and the same
 *      title in the panel and understands the mechanism without a caption. We
 *      do not ship a pixel-accurate copy of an employer's page, which would be
 *      both a maintenance and a legal liability, and which nobody reads anyway.
 *   3. The address bar stays EMPTY. Inventing a plausible URL would be the one
 *      fabricated claim in an otherwise honest frame.
 *   4. The extension icon is the only saturated thing in the chrome, and the
 *      popup is anchored directly beneath it, which is the whole "this lives in
 *      your browser" statement in one relationship.
 *
 * Honesty: the panel is a real capture from scripts/capture-product.mjs. The
 * window around it is drawn, and the caption under the stage says exactly that.
 * Nothing here re-creates Litos's own interface. */

type Shot = { w: number; h: number; src: string; cap?: string; note?: string; alt?: string; story?: number };
const SHOTS = captures as Record<string, Shot>;

/* The greeked posting. Widths are percentages so the page reflows with the
   stage, and the rhythm (a short line ending each paragraph) is what makes it
   read as prose rather than as a loading skeleton. */
const PARAGRAPHS = [
  [96, 88, 93, 61],
  [91, 97, 74],
  [95, 86, 90, 48],
];

function GreekedPosting() {
  return (
    <div className="select-none px-8 pt-7" aria-hidden>
      {/* The one real line on the host page. It is the line the popup says it
          found, and the rhyme between the two is the entire demonstration. */}
      <p className="font-mono text-label uppercase tracking-[0.08em] text-faint">
        Figma · San Francisco, CA
      </p>
      <p className="mt-2 text-heading font-[450] text-ink/75">Software Engineer</p>

      <div className="mt-6 space-y-5">
        {PARAGRAPHS.map((para, p) => (
          <div key={p} className="space-y-2.5">
            {para.map((w, i) => (
              <div
                key={i}
                className="h-2 rounded-full bg-ink/[0.07]"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Chrome's own furniture. Deliberately low contrast: it should be recognisable
   in about 200ms and unreadable after that, so the panel wins the gaze. */
function WindowChrome() {
  return (
    <div className="border-b border-border bg-surface-alt" aria-hidden>
      <div className="flex items-end gap-2 px-3 pt-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <div className="ml-3 flex min-w-0 max-w-[260px] flex-1 items-center gap-2 rounded-t-lg bg-surface px-3 py-2">
          <span className="h-3 w-3 shrink-0 rounded-[3px] bg-ink/20" />
          <span className="truncate text-[11px] leading-none text-muted">
            Software Engineer · Figma
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 bg-surface px-3 py-2.5">
        <span className="text-[13px] leading-none text-faint">‹</span>
        <span className="text-[13px] leading-none text-faint">›</span>
        <span className="text-[13px] leading-none text-faint">⟳</span>
        {/* Empty on purpose. A drawn URL would be the one invented claim. */}
        <div className="h-6 flex-1 rounded-full bg-ink/[0.05]" />
        {/* The only saturated element in the chrome, and the anchor the panel
            hangs from. This is the "it lives in your browser" sentence. */}
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-soft">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-brand-ink" aria-hidden>
            <path d="M4 6.5h16M6 11h12M8 15.5h8M10 20h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

export function HeroScene() {
  const shot = SHOTS["hero-1-job"];
  const [lit, setLit] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* One settle, not a loop: the panel arrives once, the way it arrives when you
     click the icon. DESIGN.md allows exactly one looping element on the page
     and it is already spent on the Application Roll.

     Reduced motion lands on the SETTLED state, not the empty one. The previous
     draft degraded to its first frame, which handed the setup to the people who
     would never see the payoff. */
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setLit(true), reduce ? 0 : 260);
    return () => clearTimeout(t);
  }, []);

  if (!shot) return null;

  return (
    <div ref={ref} className="mx-auto w-full max-w-5xl">
      <div className="relative">
        <div className="overflow-hidden rounded-card border border-border bg-surface shadow-overlay">
          <WindowChrome />

          {/* The page and the panel share one box so the panel reads as sitting
              ON the page rather than beside it. The panel is clipped by the
              window bottom exactly as it is in Chrome. */}
          <div className="relative h-[300px] sm:h-[392px]">
            <GreekedPosting />

            <div
              className={`absolute right-4 top-3 origin-top-right sm:right-5 ${
                lit ? "opacity-100 sm:scale-100" : "opacity-0 sm:scale-[0.97]"
              } motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-[cubic-bezier(.16,1,.3,1)]`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.src}
                alt={shot.alt ?? ""}
                width={shot.w}
                height={shot.h}
                style={{ width: shot.w }}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="block max-w-none rounded-inner border border-border bg-surface shadow-overlay"
              />
            </div>
          </div>
        </div>

        {/* Floats OUTSIDE the window, the way Simplify puts its coverage card
            beside the browser rather than inside it. It is the first question
            every visitor has, and the honest answer is a split one: Litos fills
            more places than it submits. */}
        <div className="pointer-events-none absolute -bottom-6 -left-3 hidden max-w-[286px] rounded-inner border border-border bg-surface px-4 py-3 shadow-overlay lg:block">
          <p className="font-mono text-label uppercase tracking-[0.08em] text-faint">Works on</p>
          <p className="mt-1.5 text-small text-ink">
            Greenhouse, Lever, Ashby, Workday and LinkedIn.
          </p>
        </div>
      </div>

      {/* The receipt is the brand's own motif and the previous draft ignored it
          completely, spending four mono "STEP N" labels on chrome instead. The
          canon values live in PacketDemo (19:42:11 / :14 / :16); this is the
          same clock, stated once, as the thing the picture is evidence for.
          Speed as a log of something that already happened, never as a boast. */}
      <p className="mt-11 text-center font-mono text-label uppercase tracking-[0.08em] text-muted">
        19:42:07 job found → 19:42:16 ready to send · 9 seconds
      </p>

      <p className="mt-3 text-center text-small text-muted">
        The panel is a real screenshot of Litos. The browser around it is drawn,
        and the posting behind it is blanked out.
      </p>
    </div>
  );
}
