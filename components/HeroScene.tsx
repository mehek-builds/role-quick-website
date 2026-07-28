"use client";

import { useEffect, useRef, useState } from "react";
import captures from "@/lib/captures.json";
import { InstallLink } from "@/components/InstallLink";

/* The fold: the tailored resume beside the posting it was built from, at full
   size, bleeding off the right edge.
 *
 * Two drafts died to get here and both died the same way.
 *
 * Draft 1 cross-faded four screenshots behind a four-box step rail. Draft 2
 * built a drawn Chrome window with a greeked posting and docked the real
 * extension popup under a toolbar icon. Twenty-five critics, each trained on a
 * different product hero, scored draft 2 a mean 3.0 out of 10, and they
 * converged on a charge neither draft had answered: the hero was photographing
 * the wrong moment. `hero-1-job` shows "2 drafts ready", "Current job", "Fill
 * this form", "Review" — five affordances and zero output, under a subhead
 * promising a resume, a form and an email. No amount of relighting or animating
 * turns a picture of a launcher menu into evidence, because there is no outcome
 * inside it to reveal.
 *
 * This frame has the outcome. It also has the thing no competitor can
 * screenshot: an explicit refusal. "This posting asks for 1 thing your resume
 * does not mention" with a single Node.js chip. Every rival ships an AI that
 * says it nailed it; Litos is the only one that photographs what it could not
 * do, and candour is the currency this brand already chose.
 *
 * Mehek's ruling 2026-07-28 on the colour in this frame: the black-and-white
 * resume rule governs the resume DOCUMENT. The blue/orange/green match
 * highlights are dashboard chrome laid over it, and they are the evidence of
 * tailoring, so they stay.
 *
 * What was deleted, and why deleting was the fix
 * ----------------------------------------------
 * The drawn window, the eleven greeked bars, the empty address bar and the
 * two-sentence honesty note are all gone. Every one of them existed to stage a
 * screenshot that is no longer here. The greek in particular was actively
 * harmful: eleven identical 8px bars at 7% opacity is the universal idiom for
 * CONTENT HAS NOT LOADED, sitting under a headline that says "Apply in
 * seconds." And the note disclaimed furniture that is no longer drawn — the
 * labelling rule only ever covered re-creations of Litos's OWN interface, so
 * that footnote was self-inflicted.
 *
 * Deleting the room took the product from roughly 10% of the fold to most of
 * it, which was the single most-repeated charge across all 25 critics.
 *
 * Why it is not scaled to fit
 * ---------------------------
 * The capture is 1104 CSS px wide and it is rendered at 1104 CSS px. The column
 * is narrower than that on purpose, so the frame runs off the right edge rather
 * than shrinking. Every hero in the study that reads as real refuses to fit:
 * Linear runs its frame off the right, Attio past the bottom fold, Grammarly
 * and Simplify crop to one widget. Shrinking a window to fit is what puts 13px
 * type under 11px and turns a screenshot into decoration.
 *
 * Server-rendered, no hydration gate, no entrance animation. The previous draft
 * held the whole stage at opacity 0 behind a 260ms timer, so the LCP element
 * was invisible without JS. */

type Shot = { w: number; h: number; src: string; alt?: string };
/* hero-band, not hero-2-review: the same review surface cut to 516px instead
   of 620px. The taller frame only cleared about 300px of a 900px fold, so a
   third of the hero was product and two thirds was copy — the most-repeated
   charge across 25 critics. The band drops the whitespace under the columns and
   keeps every element that carries a claim: the 86 match ring, the three-swatch
   legend, the posting with its requirements lit, the "1 thing your resume does
   not mention" refusal with its Node.js chip, and both tailored bullets with
   their highlights. Nothing that argues anything was cut. */
const SHOT = (captures as Record<string, Shot>)["hero-band"];
/* The phone gets the OUTPUT, not the input. The desktop band is 1104px wide;
   anchored left at 390px it showed only the job-description column, so the
   whole phone fold was a picture of the posting and the tailored resume, the
   86 ring and the refusal line were all off-screen. */
const SHOT_MOBILE = (captures as Record<string, Shot>)["hero-band-mobile"];
/* The same screen, hovered. The review surface's own legend says "Point at any
   highlighted term to see it light up on both sides" — an instruction a single
   still physically cannot obey, so the hero was printing a promise it broke.
   These two frames are both real captures of the shipped screen at identical
   viewport and scroll, so cross-fading them demonstrates the link rather than
   asserting it, and nothing is painted. One settle, no loop. */
const SHOT_LIT = (captures as Record<string, Shot>)["hero-band-lit"];

/* Fills on five, submits on three. The previous card said "Works on:
   Greenhouse, Lever, Ashby, Workday and LinkedIn", which collapsed those two
   verbs into one while sitting inches from a Fill-this-form button — an
   overclaim in the one slot reserved for candour. It was also hidden below lg,
   so the answer to the first question every visitor asks was display:none on
   the widths most job seekers arrive on. */
const COVERAGE = [
  ["Fills", "Greenhouse, Lever, Ashby, Workday, LinkedIn"],
  ["Submits", "Greenhouse, Lever, Ashby"],
] as const;

export function HeroScene() {
  /* Settles on the LIT frame and stays there. Reduced motion renders it
     immediately: the settled state is the message, and the previous draft
     degraded to the "nothing has happened yet" frame. */
  const [lit, setLit] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      /* Deferred rather than set synchronously: a setState in the effect body
         cascades a render. One tick is imperceptible and keeps the settled
         frame the first thing a reduced-motion visitor sees. */
      const t = setTimeout(() => setLit(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setTimeout(() => setLit(true), 520);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!SHOT) return null;

  return (
    <div ref={ref}>
      {/* Left-aligned, three blocks, one rhythm.
       *
       * The centred seven-block stack ran 450px and left the product at a third
       * of the fold; Attio reaches ~67% product with four elements in ~230px.
       * Copy is now a single 560px column at the gutter and the artifact starts
       * ~170px higher. */}
      {/* Two copy columns, then the artifact full width.
       *
       * A single left-aligned 600px column left the right half of a 1440 fold
       * empty, which is worse than the centred stack it replaced: the widest
       * axis of the viewport went unspent. The claim and the coverage answer
       * move to a right-hand column, so the copy row fills the width, the
       * headline keeps a 560px measure, and the artifact still starts high. */}
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <div className="max-w-[600px]">
            <p className="font-mono text-label uppercase tracking-[0.08em] text-muted">
              Free Chrome extension for job seekers
            </p>
            <h1 className="mt-4 text-display font-[450] text-ink">
              Apply <span className="text-brand-ink">in seconds.</span>
            </h1>
            <p className="mt-5 max-w-[460px] text-body text-muted">
              Nothing is reused. Every job gets its own resume, form, and email.
            </p>

            <div className="mt-7 flex flex-col items-start gap-2.5">
              <InstallLink
                source="hero"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-body font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
              >
                Add to Chrome, it&apos;s free
              </InstallLink>
              <p className="text-small text-faint">
                Desktop Chrome and Edge.{" "}
                <a
                  href="/try"
                  data-inline-link
                  className="underline decoration-border underline-offset-2 hover:text-ink"
                >
                  Try it free, no account needed
                </a>
                .
              </p>
            </div>
          </div>

          <div className="shrink-0 lg:pb-1">
            {/* The number in the Stripe idiom: bare type over a hairline, no
                card, no border, no shadow. It was a bordered, shadowed box
                absolutely positioned over the capture, which occluded the line
                saying WHICH job this is and wore the same radius and elevation
                token as the artifact underneath — a marketing claim dressed as
                product UI, which is the one thing a brand built on candour
                cannot afford. Rendered at every width; it was sm:-gated, so the
                phone fold carried no speed claim at all. */}
            <p className="text-section font-[450] text-ink">
              <span className="font-mono text-muted">&lt;</span>&thinsp;30 seconds
            </p>
            <p className="mt-1.5 font-mono text-label uppercase tracking-[0.08em] text-faint">
              Job found → ready to send
            </p>

            {/* Above the fold at every width. Coverage is the first question a
                job seeker asks and it had drifted below the cut. */}
            <dl className="mt-6 flex flex-col gap-1.5 border-t border-border pt-4">
              {COVERAGE.map(([verb, sites]) => (
                <div key={verb} className="flex gap-3 text-small">
                  <dt className="w-[64px] shrink-0 font-mono text-label uppercase tracking-[0.08em] text-faint">
                    {verb}
                  </dt>
                  <dd className="text-muted">{sites}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Full-viewport-width band with no page gutter, cropped past the side
          edges and the bottom. The previous version centred 1104px inside a
          1232px container, so both edges were visible and it read as a card
          placed on a page rather than a workspace the viewport happens to cut.
          Refusing to fit is what makes Linear and Attio read as real. */}
      <div className="mt-10 flex w-full justify-center overflow-hidden">
        <div className="relative w-[544px] shrink-0 sm:w-[1104px]">
          <picture>
            <source media="(max-width: 640px)" srcSet={SHOT_MOBILE?.src ?? SHOT.src} />
            <img
              src={SHOT.src}
              alt={SHOT.alt ?? ""}
              width={SHOT.w}
              height={SHOT.h}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="block h-auto w-full rounded-card border border-border bg-surface shadow-overlay"
            />
          </picture>

          {/* The lit frame sits exactly on top of the idle one and fades in
              once. Both are real captures of the same screen at the same
              viewport and scroll, so nothing moves and nothing is invented —
              the only change is which terms the product itself lights up.
              Desktop only: the mobile crop is the resume column, where there is
              no second side to link to. */}
          {SHOT_LIT && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={SHOT_LIT.src}
              alt=""
              aria-hidden
              width={SHOT_LIT.w}
              height={SHOT_LIT.h}
              loading="eager"
              decoding="async"
              className={`absolute inset-0 hidden h-auto w-full rounded-card border border-border bg-surface shadow-overlay sm:block ${
                lit ? "opacity-100" : "opacity-0"
              } motion-safe:transition-opacity motion-safe:duration-[420ms] motion-safe:ease-[cubic-bezier(.2,.6,.2,1)]`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
