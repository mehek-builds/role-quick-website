"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { createPaperRoll } from "./paperRollEngine";
import { FlowDemoFit } from "@/components/FlowDemo";
import { track } from "@/lib/analytics";

/* The scroll film. A 121-frame generated sequence (public/film/) is drawn on
   a canvas and scrubbed by scroll across a pinned viewport: scattered
   application pages converge into one packet while the light passes through
   the three pillar tints. Frosted glass cards carry the copy, one chapter at
   a time. The film IS the pitch: chaos in, one packet out.

   Four effects, one system: film scrub + vignette + glass cards + chapter
   tints. (Was six. Grain and drifting paper particles came out 2026-07-28:
   both sat under the perceptual threshold on a white canvas and both cost a
   permanent animation loop to do it.) Pacing comes from Lenis (SmoothScroll)
   and the scrubbed timeline. The opening act is live: the Application Roll
   (paperRollEngine) prints the job hunt behind the hero card until the
   first scroll dissolves it into the scrub. Reduced motion / no JS: the
   section collapses to one static viewport (CSS only) with the hero card
   server-rendered. */

const FRAME_COUNT = 121;
const MAX_CACHED_FRAMES = 5;
const FRAME_RETRY_MS = 5_000;
const MAX_FRAME_ATTEMPTS = 2;
const FRAME_PREFETCH_OFFSETS = [0, 1, -1, 2, -2] as const;
const framePath = (i: number) => `/film/frame-${String(i).padStart(4, "0")}.webp`;

/* Frame stride. The full sequence is 121 frames at roughly 62KB, about
   7.5MB, and it is spent before the viewer has been told a single benefit.
   That is a fine trade on a laptop and a bad one on a phone plan, so small
   screens and Save-Data connections scrub every Nth frame instead. The film
   is a slow dissolve, not fast action, so a coarser stride reads as the same
   shot; only the download drops. Desktop is untouched. */
const frameStride = () => {
  if (typeof window === "undefined") return 1;
  const c = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData) return 4;
  if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return 4;
  return window.matchMedia("(max-width: 639px)").matches ? 3 : 1;
};
const snapToStride = (i: number, stride: number) =>
  stride <= 1 ? i : Math.min(FRAME_COUNT - 1, Math.round(i / stride) * stride);

/* Chapter tint overlay colors (multiply over the film, whisper-quiet). */
const TINTS = [
  "rgba(255,255,255,0)",
  "rgba(238,241,254,0.5)", // brand-soft
  "rgba(234,245,240,0.5)", // teal-soft
  "rgba(251,239,232,0.5)", // coral-soft
  "rgba(255,255,255,0)",
];

const CHAPTERS = [
  { at: 0.0, label: "00 · Job found" },
  { at: 0.24, label: "01 · Resume" },
  { at: 0.5, label: "02 · Forms" },
  { at: 0.74, label: "03 · Emails" },
  { at: 0.92, label: "04 · Ready to send" },
];

export function CinematicHero({ storeUrl }: { storeUrl: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLCanvasElement>(null);
  const rollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLDivElement>(null);
  const openDoneRef = useRef(false);
  /* set inside the opening effect; the scroll handler feeds it the hero
     progress every tick: any scroll dissolves the live roll into the
     scrub, and returning to the very top fades it back in and resumes */
  const syncOpeningRef = useRef<(p: number) => void>(() => {});
  const progressRef = useRef(0);
  const chapterRef = useRef(0);

  /* Load a small frame window on demand and draw the nearest decoded frame. */
  const imagesRef = useRef(new Map<number, HTMLImageElement>());
  const requestFrameRef = useRef<(index: number) => void>(() => {});
  const strideRef = useRef(1);
  const drawFrame = (rawIndex: number) => {
    const canvas = filmRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const index = snapToStride(rawIndex, strideRef.current);
    requestFrameRef.current(index);
    const imgs = imagesRef.current;
    /* nearest loaded frame so scrubbing never blanks */
    let img: HTMLImageElement | null = null;
    for (let d = 0; d < FRAME_COUNT; d++) {
      const lo = imgs.get(index - d);
      const hi = imgs.get(index + d);
      if (lo?.complete && lo.naturalWidth) { img = lo; break; }
      if (hi?.complete && hi.naturalWidth) { img = hi; break; }
    }
    if (!img) return;
    /* first successful paint dissolves the canvas in (CSS transition on the
       element) — the load-order pops white → poster → sting read as cuts */
    if (canvas.style.opacity !== "1") canvas.style.opacity = "1";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const { width: cw, height: ch } = canvas;
    /* cover fit */
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  };

  useEffect(() => {
    const imgs = imagesRef.current;
    const failedUntil = new Map<number, number>();
    const failedAttempts = new Map<number, number>();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryIndex: number | null = null;
    const cancelRetry = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      retryIndex = null;
    };
    const touch = (i: number, img: HTMLImageElement) => {
      imgs.delete(i);
      imgs.set(i, img);
    };
    const trim = () => {
      while (imgs.size > MAX_CACHED_FRAMES) {
        const oldest = imgs.keys().next().value as number | undefined;
        if (oldest === undefined) return;
        const img = imgs.get(oldest);
        imgs.delete(oldest);
        failedUntil.delete(oldest);
        failedAttempts.delete(oldest);
        if (img) {
          img.onload = null;
          img.onerror = null;
          img.src = "";
        }
      }
    };
    const load = (i: number) => {
      const existing = imgs.get(i);
      if (existing) {
        touch(i, existing);
        return;
      }
      if ((failedUntil.get(i) ?? 0) > Date.now()) return;
      if ((failedAttempts.get(i) ?? 0) >= MAX_FRAME_ATTEMPTS) return;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        failedUntil.delete(i);
        failedAttempts.delete(i);
        const want = Math.round(progressRef.current * (FRAME_COUNT - 1));
        if (Math.abs(want - i) < 3) drawFrame(want);
      };
      img.onerror = () => {
        if (imgs.get(i) === img) imgs.delete(i);
        const attempts = (failedAttempts.get(i) ?? 0) + 1;
        failedAttempts.set(i, attempts);
        const delay = FRAME_RETRY_MS * attempts;
        failedUntil.set(i, Date.now() + delay);
        const want = Math.round(progressRef.current * (FRAME_COUNT - 1));
        if (want === i && attempts < MAX_FRAME_ATTEMPTS) {
          cancelRetry();
          retryIndex = i;
          retryTimer = setTimeout(() => {
            const target = retryIndex;
            retryTimer = null;
            retryIndex = null;
            if (target === null) return;
            failedUntil.delete(target);
            requestFrameRef.current(target);
            drawFrame(target);
          }, delay);
        }
      };
      imgs.set(i, img);
      img.src = framePath(i);
      trim();
    };
    requestFrameRef.current = (index: number) => {
      if (retryIndex !== null && retryIndex !== index) cancelRetry();
      const stride = strideRef.current;
      for (const offset of FRAME_PREFETCH_OFFSETS) {
        const candidate = index + offset * stride;
        if (candidate >= 0 && candidate < FRAME_COUNT) load(candidate);
      }
    };
    strideRef.current = frameStride();
    requestFrameRef.current(0);

    const resize = () => {
      const canvas = filmRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      drawFrame(Math.round(progressRef.current * (FRAME_COUNT - 1)));
    };
    resize();
    window.addEventListener("resize", resize);
    /* opened in a background tab: layout can be zero-sized at mount and
       Chrome fires no resize on activation — re-fit when we become visible */
    const onVisible = () => {
      if (document.visibilityState === "visible") resize();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelRetry();
      requestFrameRef.current = () => {};
      for (const img of imgs.values()) {
        img.onload = null;
        img.onerror = null;
        img.src = "";
      }
      imgs.clear();
      failedUntil.clear();
      failedAttempts.clear();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /* ---- the opening: the Application Roll. A live WebGL drum wanders an
     endless white floor printing the job hunt sheet by sheet - resumes,
     portal forms, invites, rejections, offers - 24 unique documents, so
     nothing repeats on screen. It loops until the viewer scrolls; the
     first scroll dissolves the live scene into the film scrub, and
     scrolling back to the very top brings it back (the drum pauses while
     hidden, then resumes). Skipped under reduced motion, where the film
     poster carries the frame instead. ---- */
  useEffect(() => {
    const stage = openRef.current;
    const holder = rollRef.current;
    if (!stage || !holder) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let roll: {
      pause: () => void;
      resume: () => void;
      stop: () => void;
    } | null = null;
    let inited = false;
    const init = () => {
      if (inited) return;
      inited = true;
      roll = createPaperRoll(holder);
      /* the engine prerolls a full paper trail before its first frame, so
         this fires over a fully-laid scene: dissolve in, never pop */
      gsap.to(holder, { opacity: 1, duration: 0.8, ease: "power1.inOut" });
      /* entered mid-page (anchor link): start hidden and parked */
      if (window.scrollY > 2) {
        openDoneRef.current = true;
        gsap.set(stage, { autoAlpha: 0 });
        roll.pause();
      }
    };
    const sync = (p: number) => {
      if (!inited || !roll) return;
      if (p > 0.001 && !openDoneRef.current) {
        openDoneRef.current = true;
        gsap.to(stage, {
          autoAlpha: 0,
          duration: p > 0.45 ? 0.4 : 1.0,
          ease: p > 0.45 ? "power2.out" : "power2.inOut",
          overwrite: true,
          onComplete: () => roll?.pause(),
        });
      } else if (p <= 0.005 && openDoneRef.current) {
        openDoneRef.current = false;
        roll.resume();
        gsap.to(stage, {
          autoAlpha: 1,
          duration: 0.7,
          ease: "power1.inOut",
          overwrite: true,
        });
      }
    };
    syncOpeningRef.current = sync;

    /* wait for a real layout before sizing the canvas - during hydration
       the stage can read zero-sized. rAF waits for the first paint; the
       timeout covers throttled or hidden tabs. Whichever fires first runs
       the init once. */
    const startRaf = requestAnimationFrame(() =>
      requestAnimationFrame(init)
    );
    const timeout = setTimeout(init, 300);
    return () => {
      cancelAnimationFrame(startRaf);
      clearTimeout(timeout);
      syncOpeningRef.current = () => {};
      gsap.killTweensOf(stage);
      gsap.killTweensOf(holder);
      roll?.stop();
    };
  }, []);

  /* The drifting paper-dust particle layer was REMOVED 2026-07-28. 34 dots
     on a permanent requestAnimationFrame loop, at 0.12-0.42 alpha over a
     white page, behind grain and a vignette. Below the threshold anyone
     notices and above zero on every frame the hero is on screen. Its
     chapter-tinted DUST palette went with it; the chapter tint layer that
     actually reads is still here. */

  /* ---- the scrubbed timeline: frames, cards, tint, rail ---- */
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.registerPlugin(ScrollTrigger);
      const wrap = wrapRef.current!;
      const q = gsap.utils.selector(wrap);

      const tintEl = q<HTMLElement>(".rq-cine-tint")[0];
      const hint = q<HTMLElement>(".rq-cine-hint")[0];

      const setChapter = (p: number) => {
        let c = 0;
        for (let k = CHAPTERS.length - 1; k >= 0; k--)
          if (p >= CHAPTERS[k].at) { c = k; break; }
        chapterRef.current = c;
      };

      /* the film plays across the WHOLE page: frame index = page progress.
         No snap — the scroll is never yanked; Lenis alone paces it.
         Pacing: the papers keep flying for most of the page (frames 0-74
         are the swirl) and only collate into the single book at the very
         end (frames 75-120 compressed into the last 14% of scroll). */
      const SWIRL_END = 74 / (FRAME_COUNT - 1);
      const HOLD = 0.86;
      /* Paper-flow speed ramp: across the swirl the frame-advance-per-scroll
         accelerates from 1.0x to 1.2x (ends ~20% faster than it starts) while
         still landing exactly on SWIRL_END at HOLD. rate(u)=1+0.2u integrates
         to 1.1, so normalise by 1.1 to preserve the swirl's total range. */
      const RAMP = 0.2; // end speed relative to start (+20%)
      const filmCurve = (p: number) => {
        if (p >= HOLD)
          return SWIRL_END + ((p - HOLD) / (1 - HOLD)) * (1 - SWIRL_END);
        const u = p / HOLD; // 0..1 across the swirl
        const eased = (u + (RAMP / 2) * u * u) / (1 + RAMP / 2);
        return eased * SWIRL_END;
      };
      ScrollTrigger.create({
        trigger: document.body,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.6,
        onUpdate(self) {
          const fp = filmCurve(self.progress);
          progressRef.current = fp;
          drawFrame(Math.round(fp * (FRAME_COUNT - 1)));
        },
      });

      /* the opening act: cards, tint and hint follow the hero wrapper */
      ScrollTrigger.create({
        trigger: wrap,
        start: "top top",
        end: "bottom bottom",
        scrub: 1,
        onUpdate(self) {
          const p = self.progress;
          setChapter(p);
          /* any scroll dissolves the live roll into the scrub (deep fast
             scrolls cut quickly); back at the very top it fades in again
             and resumes rolling */
          syncOpeningRef.current(p);
          /* chapter tint: whisper multiply wash over the film */
          const seg = 1 / (TINTS.length - 1);
          const k = Math.min(Math.floor(p / seg), TINTS.length - 2);
          const local = (p - k * seg) / seg;
          if (tintEl)
            tintEl.style.backgroundColor = gsap.utils.interpolate(
              TINTS[k],
              TINTS[k + 1],
              local
            );
          if (hint) hint.style.opacity = String(Math.max(0, 1 - p * 12));
        },
      });

      /* glass card choreography — each card owns a slice of the film */
      const slide = (
        sel: string,
        enter: number,
        exit: number | null,
        tl: gsap.core.Timeline
      ) => {
        const el = q<HTMLElement>(sel)[0];
        if (!el) return;
        tl.fromTo(
          el,
          { autoAlpha: 0, y: 46, scale: 0.985 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.07, ease: "power2.out" },
          enter
        );
        if (exit !== null)
          tl.to(
            el,
            { autoAlpha: 0, y: -40, duration: 0.06, ease: "power2.in" },
            exit
          );
      };

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: wrap,
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
        },
      });
      /* timeline positions are progress fractions (total duration = 1) */
      tl.to({}, { duration: 1 }); // spine
      const hero = q<HTMLElement>(".rq-cine-card-hero")[0];
      if (hero) tl.to(hero, { autoAlpha: 0, y: -48, duration: 0.08, ease: "power2.in" }, 0.22);
      /* the opening now hands straight off to the real pinned sections: the
         hero sets it up, the swirl plays, the packet finale lands, done. The
         chapter deep-dives live in the sections below, held over this film. */
      slide(".rq-cine-card-4", 0.68, null, tl);

      const captions = q<HTMLElement>(".rq-cine-caption");
      if (captions.length)
        tl.to(captions, { autoAlpha: 0, y: -24, duration: 0.06, ease: "power2.in" }, 0.16);

      /* the credits: the whole fixed stage bows out as the footer enters, so
         the collated packet's hard edges never cut through the link columns.
         Scrubbed, so scrolling back up brings the film straight back. */
      const footer = document.querySelector("footer");
      if (footer && stageRef.current)
        gsap.to(stageRef.current, {
          opacity: 0,
          ease: "none",
          scrollTrigger: {
            trigger: footer,
            /* the footer is short: its top rests near 71% of the viewport at
               full scroll, so the fade must finish above that or it never
               completes and the packet seam stays half-visible */
            start: "top 96%",
            end: "top 74%",
            scrub: 0.4,
          },
        });
    },
    { scope: wrapRef }
  );

  /* The packet, assembling, in the same frame as the ask. This is the proof
     the hero lost on 2026-07-28 when the privacy caption moved into the #faq
     refusal trio and the ledger recorded "there is no longer proof under the
     hero CTA" as a known cost. It is better proof than the caption was: the
     caption asserted a policy, this shows the product doing the thing the
     headline claims, on a real posting, against the receipt clock.

     Hidden below xl, and xl is measured rather than picked. FlowDemo is drawn
     at a fixed 720x476 and FlowDemoFit only ever shrinks it, so the column is
     720 wide and the copy takes the rest. Below xl the two do not both fit at
     an honest size, so app/page.tsx renders the same demo directly beneath the
     hero instead, where the phone variant has room to breathe. */
  const demoNode = (
    <div className="rq-enter hidden w-full xl:block">
      <div data-demo className="flex h-full items-center justify-end">
        <FlowDemoFit />
      </div>
    </div>
  );

  return (
    <>
      {/* THE STAGE: the film and its atmosphere, fixed behind the entire
          page. Every section floats over this — the animation never ends. */}
      <div ref={stageRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        {/* 1 · the film — scrubbed by whole-page progress. Starts invisible;
            drawFrame dissolves it in on the first painted frame. */}
        <canvas
          ref={filmRef}
          className="rq-cine-film absolute inset-0 h-full w-full opacity-0 transition-opacity duration-700"
        />
        {/* 2 · the opening: the live Application Roll printing the job
            hunt behind the hero card; the whole stage dissolves into 1
            (the scrub) on first scroll */}
        <div ref={openRef} className="absolute inset-0 h-full w-full">
          <div
            ref={rollRef}
            aria-hidden
            className="absolute inset-0 h-full w-full opacity-0"
          />
        </div>
        {/* 3 · the static product still, reduced motion only.
            Until now a reduced-motion visitor got film frame 0 behind the
            hero card, and frame 0 is scattered application pages: the
            PROBLEM, not the product. So the one audience that cannot watch
            the film was also the one audience never shown what Litos does.
            This swaps in a real capture of the extension open on a posting.

            Reduced motion only, deliberately. Painting it under full motion
            too would fix the slow-connection case as well, but the film and
            the roll both start at opacity 0 and dissolve in, and a still
            underneath them would read as a cut. That is the exact load-order
            pop (white -> poster -> sting) called out in drawFrame above.

            Real product UI per DESIGN.md imagery law, and it sits before the
            tint and vignette layers so the stage's own atmosphere applies to
            it unchanged. The veil is what keeps the rq-glass hero card
            legible over a dense screenshot, the same problem the 2026-07-24
            calibration pass solved with opacity rather than more frost. */}
        <div className="rq-cine-still absolute inset-0">
          {/* object-contain, not cover, and a landscape capture rather than the
              portrait extension one. The first attempt used extension-job.png
              (598x900) at object-cover: on a 1600px stage that scales to about
              1600x2400, so the viewer got one blown-up fragment with 60px type
              and no way to tell what the product was. Cover crops to fill;
              a screenshot has to stay whole to be legible.

              Pushed below the header pill on purpose. Anchored at the top, the
              capture's own product nav (Litos / Home / Jobs / Applications /
              Emails) landed a few pixels under the site's real nav, so the page
              showed two Litos wordmarks and two navigations at once and read as
              a rendering fault. Starting it at 14svh keeps the two chromes
              apart and lets the rows, which are the part that shows what the
              product does, sit in the open. */}
          <div className="absolute inset-x-0 bottom-0 top-[14svh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/product/dashboard-emails.png"
              alt=""
              className="h-full w-full object-contain object-top"
            />
          </div>
          <div className="absolute inset-0 bg-white/[0.72]" />
        </div>
        {/* 4 · chapter tint (multiply, whisper) */}
        <div className="rq-cine-tint absolute inset-0 mix-blend-multiply" />
        {/* 5 · vignette — gentle, the brand stays light */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 42%, rgba(18,18,15,0) 62%, rgba(18,18,15,0.10) 100%)",
          }}
        />
      </div>

    {/* 200svh of scroll = the opening act: hero → film swirl → packet finale,
       then it hands off to the real pinned sections. Reduced motion collapses
       this to one viewport in CSS (globals.css). */}
    {/* id="product" moved here from the section below, which no longer exists:
        the packet demo WAS that section, and the header's "Product" link plus
        the footer sitemap both point at it. It now resolves to the top of the
        page, which is where the product demo actually is. */}
    <div ref={wrapRef} id="product" className="rq-cine relative h-[200svh]">
      <div className="sticky top-0 h-svh w-full overflow-hidden">

        {/* The chapter caption that used to sit here said "Job found" at the same
            moment, and a few hundred pixels from, the fixed site rail saying
            "00 · Job found" down the right edge (audit finding 46). One machine
            voice per moment; the rail is the one that persists, so it wins. */}

        {/* glass card 0 — the hero. Server-rendered, visible at first paint. */}
        {/* Vertically centred: two columns side by side are far shorter than
            the same content stacked, so there is slack to centre INTO. */}
        <div className="rq-cine-card-hero absolute inset-x-0 top-[16svh] px-6 sm:inset-0 sm:flex sm:flex-col sm:items-center sm:justify-center sm:px-8 sm:pt-6 lg:px-10">
        {/* The copy takes up to 520 and the demo takes the rest, capped at the
            720 it is drawn at. Not the other way round: a fixed 720 demo column
            starved the copy to 440 at 1280 and wrapped every one of the three
            CTAs onto two lines. The demo scales cleanly and the copy does not,
            so the demo is the side that gives. At 1440 it still gets its full
            720; at 1280 it runs at 0.89.

            items-stretch (the grid default) so the two boxes share a bottom
            edge as well as a top one: one row of two equal panels. */}
        <div className="mx-auto grid w-full max-w-6xl gap-8 xl:max-w-[1320px] xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)] xl:gap-10">
          {/* max-w-2xl until the grid actually splits. Below xl the columns
              collapse to one and the card would otherwise stretch to the full
              max-w-6xl, giving a measure far past the ~660px the type scale
              allows.

              justify-between at xl, not justify-center. The card is stretched
              to the demo's height, which leaves roughly 230px of slack, and
              centring pooled all of it into two dead bands above and below a
              clump of text. Distributing gives the card a top, a middle and a
              bottom, and lands the actions level with the demo's own send
              button across the gap. */}
          <div className="rq-glass rq-enter mx-auto flex w-full max-w-2xl flex-col justify-center gap-8 px-7 py-10 text-center sm:px-9 sm:py-9 xl:max-w-none xl:justify-between xl:gap-6 xl:px-10 xl:py-12 xl:text-left">
            {/* Nothing above the fold said what Litos IS: the H1 names a
                speed and the sub names a mechanism, so a first-time visitor
                had to infer the category. This is the same line the Chrome
                Web Store listing already leads with (store-assets-v2 shot 1).
                It says "job seekers" and must keep saying it: an earlier
                version narrowed it to "students and new grads", which read
                as a product nobody else was allowed to use. Students and new
                grads are one audience Litos serves, not the only one. */}
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Free Chrome extension for job seekers
            </p>

            {/* The middle band: the claim and the one line explaining it,
                grouped so justify-between treats them as a single object. */}
            <div>
              {/* In the split column the line wraps, and left to itself it
                  wrapped as "Apply in" / "seconds.", breaking the coloured
                  phrase across two lines and ending the first on a
                  preposition. Forcing the break at the phrase boundary keeps
                  "in seconds." whole, which is the half the colour marks. */}
              <h1 className="text-display font-[450] leading-[1.02] tracking-[-0.03em] text-ink">
                Apply <span className="text-brand-ink xl:block">in seconds.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-[460px] text-base leading-[1.65] text-muted xl:mx-0">
                Nothing is reused. Every job gets its own resume, form, and
                email.
              </p>
            </div>

            {/* The floor: everything actionable, grouped so it sits on the
                bottom edge rather than trailing off the middle band. */}
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center xl:justify-start">
              {/* Desktop only: a phone cannot install a Chrome extension, and the
                  handoff card right below this says exactly that. Leading a phone
                  with an action it cannot take was audit finding 47. */}
              <a
                href={storeUrl}
                onClick={() => track("install_click", { source: "hero" })}
                className="hidden min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:inline-flex sm:w-auto"
              >
                Add to Chrome, it&apos;s free
              </a>
              {/* Works on every device, so on mobile it IS the primary action. */}
              <a
                href="/try"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto sm:bg-transparent sm:px-2 sm:py-0 sm:text-muted sm:hover:bg-transparent sm:hover:text-ink"
              >
                Try it free
              </a>
              {/* BROKEN LINK, FIXED 2026-07-28. This pointed at #formats, and
                  #formats was deleted on 2026-07-28 when its band was folded
                  into #documents. The link shipped to production and did
                  nothing when clicked. tests/route-integrity.test.mjs exists
                  for exactly this class of bug but only checked ROUTES, not
                  in-page fragments; it checks both now.

                  #documents is the right target on its own merits: it is the
                  first deep-dive past the opening act, which is what a reader
                  pressing "skip" is asking for.

                  The gate around this (!hasSeenFilm) went with ReturningVisitor,
                  which rendered a second, competing skip pill on return visits.
                  One skip control, always shown. */}
              <a
                href="#documents"
                className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Skip ahead ↓
              </a>
            </div>
            {/* The mobile QR handoff (MobileSendLink) was REMOVED here
                2026-07-28. A QR code and a copy-link button inside the hero
                card, on the first screen, before a phone visitor knows what
                Litos is. The mobile primary CTA above is "Try it free", which
                works on a phone, and /install still carries the handoff for
                anyone who wants the link. MobileSendLink itself stays: /try's
                DonePanel uses it, at the point someone has actually seen the
                product work. */}
            {/* The privacy caption that used to sit here (collection, no-sale,
                deletion) moved into the refusal trio in #faq, app/page.tsx.
                Mehek's call 2026-07-28: two body blocks of near-equal length
                under the H1 read as noise, and two thirds of that caption was
                already said verbatim in the trio and the FAQ, against the
                say-once rule. This gives up the ledger 07-05 property of
                proof at the decision point (S26, under the hero CTA); /try
                and the footer still carry /privacy. */}
          </div>

          {demoNode}
        </div>
        </div>

        {/* The "Scroll" hint that used to sit at bottom-8 is GONE. It only
            ever rendered at sm+, which is exactly the breakpoint where the
            demo now occupies the lower half of the frame, so the two
            overlapped outright. The demo is also the better affordance: it is
            the one perpetually-moving element on the page and it sits at the
            fold. The GSAP timeline that faded it is guarded with `if (hint)`,
            so it no-ops rather than throwing. */}

        <div className="rq-cine-card-4 invisible absolute inset-x-0 bottom-[10svh] px-6 opacity-0 sm:bottom-[12svh]">
          <div className="rq-glass mx-auto max-w-xl px-7 py-9 text-center sm:px-10">
            <h2 className="text-section font-[450] leading-[1.1] tracking-[-0.02em] text-ink">
              One job. Nine seconds.
            </h2>
            <p className="mt-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Job found → ready to send · 9 seconds
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={storeUrl}
                onClick={() => track("install_click", { source: "film-card" })}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
              >
                Add to Chrome, it&apos;s free
              </a>
              {/* Was #product. That anchor now resolves to the top of the
                  page, so at 68% through the film this button would have
                  thrown the viewer back to the start. */}
              <a
                href="#documents"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-border bg-surface px-7 py-3 text-sm font-medium text-ink transition-colors hover:border-ink sm:w-auto"
              >
                See how it works
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
