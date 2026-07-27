"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { createPaperRoll } from "./paperRollEngine";
import { MobileSendLink } from "@/components/MobileSendLink";
import { ReturningVisitor } from "@/components/ReturningVisitor";
import { track } from "@/lib/analytics";

/* The scroll film. A 121-frame generated sequence (public/film/) is drawn on
   a canvas and scrubbed by scroll across a pinned viewport: scattered
   application pages converge into one packet while the light passes through
   the three pillar tints. Frosted glass cards carry the copy, one chapter at
   a time. The film IS the pitch: chaos in, one packet out.

   Six effects, one system: film scrub + grain + particles + vignette +
   glass cards + chapter tints. Pacing comes from Lenis (SmoothScroll) and
   the scrubbed timeline. The opening act is live: the Application Roll
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
/* Particle colors per chapter (ink at rest, pillar inks mid-film). */
const DUST = ["#a3a19a", "#6b84e8", "#68ad95", "#dd9273", "#a3a19a"];

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
  const dustRef = useRef<HTMLCanvasElement>(null);
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

  /* ---- particles: drifting paper dust, tinted by the active chapter ---- */
  useEffect(() => {
    const canvas = dustRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    fit();
    window.addEventListener("resize", fit);

    const N = 34;
    const dots = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.7,
      vy: 0.00012 + Math.random() * 0.00028,
      vx: (Math.random() - 0.5) * 0.00012,
      a: 0.12 + Math.random() * 0.3,
      ph: Math.random() * Math.PI * 2,
    }));

    const tick = (t: number) => {
      if (!running) return;
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = DUST[chapterRef.current];
      for (const d of dots) {
        d.y -= d.vy;
        d.x += d.vx + Math.sin(t / 4000 + d.ph) * 0.00005;
        if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
        if (d.x < -0.02) d.x = 1.02;
        if (d.x > 1.02) d.x = -0.02;
        ctx.globalAlpha = d.a * (0.7 + 0.3 * Math.sin(t / 1600 + d.ph));
        ctx.beginPath();
        ctx.arc(d.x * w, d.y * h, d.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    /* only animate while the pinned hero is on screen */
    const io = new IntersectionObserver(([e]) => {
      const active = e.isIntersecting;
      if (active && !raf) raf = requestAnimationFrame(tick);
      if (!active && raf) { cancelAnimationFrame(raf); raf = 0; }
    });
    io.observe(canvas);

    return () => {
      running = false;
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, []);

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
        {/* 1b · the opening: the live Application Roll printing the job
            hunt behind the hero card; the whole stage dissolves into 1
            (the scrub) on first scroll */}
        <div ref={openRef} className="absolute inset-0 h-full w-full">
          <div
            ref={rollRef}
            aria-hidden
            className="absolute inset-0 h-full w-full opacity-0"
          />
        </div>
        {/* 5 · chapter tint (multiply, whisper) */}
        <div className="rq-cine-tint absolute inset-0 mix-blend-multiply" />
        {/* 2 · paper dust */}
        <canvas ref={dustRef} className="rq-cine-dust absolute inset-0 h-full w-full" />
        {/* 4 · vignette — gentle, the brand stays light */}
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
    <div ref={wrapRef} className="rq-cine relative h-[200svh]">
      <div className="sticky top-0 h-svh w-full overflow-hidden">

        {/* sparse machine-voice caption over the opening frame */}
        <p className="rq-cine-caption rq-enter absolute bottom-24 right-16 hidden font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint sm:block" aria-hidden>
          Job found
        </p>

        {/* glass card 0 — the hero. Server-rendered, visible at first paint. */}
        <div className="rq-cine-card-hero absolute inset-x-0 top-[16svh] px-6 sm:top-[18svh]">
          <div className="rq-glass rq-enter mx-auto max-w-2xl px-7 py-10 text-center sm:px-12 sm:py-12">
            {/* Nothing above the fold said what Litos IS: the H1 names a
                speed and the sub names a mechanism, so a first-time visitor
                had to infer the category. This is the same line the Chrome
                Web Store listing already leads with (store-assets-v2 shot 1).
                It says "job seekers" and must keep saying it: an earlier
                version narrowed it to "students and new grads", which read
                as a product nobody else was allowed to use. Students and new
                grads are one audience Litos serves, not the only one. */}
            <p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Free Chrome extension for job seekers
            </p>
            <h1 className="text-5xl font-[450] leading-[1.02] tracking-[-0.03em] text-ink sm:text-[68px]">
              Apply <span className="text-brand-ink">in seconds.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[460px] text-[16px] leading-[1.65] text-muted">
              Open a job. We fix your resume, fill in the form, and write
              the email. You hit send.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href={storeUrl}
                onClick={() => track("install_click", { source: "hero" })}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
              >
                Add to Chrome, it&apos;s free
              </a>
              <a
                href="/try"
                className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Try it free
              </a>
              {/* #product is the film's own section (top of page): pointing
                  here sent "skip" back to where the viewer already was. The
                  first section past the opening act is #formats. */}
              <a
                href="#formats"
                className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Skip ahead ↓
              </a>
            </div>
            {/* Phones can't install a Chrome extension. Say so once, in the
                handoff itself, and give a real door instead of a dead end. */}
            <ReturningVisitor />
            <MobileSendLink source="hero" className="mt-6 sm:hidden" />
            <p className="mt-5 text-[13px] text-muted">
              We only read the job you are on. We never sell your data.{" "}
              <a href="/privacy" data-inline-link className="underline decoration-border underline-offset-2 hover:text-ink">
                Privacy
              </a>
            </p>
          </div>
        </div>

        {/* scroll hint */}
        {/* Hidden on mobile: the hero card is taller there (it carries the
            install handoff) and the hint collided with the privacy line. */}
        <div className="rq-cine-hint absolute inset-x-0 bottom-8 hidden flex-col items-center gap-2 sm:flex" aria-hidden>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Scroll
          </p>
          <span className="block h-8 w-px animate-pulse bg-faint" />
        </div>

        <div className="rq-cine-card-4 invisible absolute inset-x-0 bottom-[10svh] px-6 opacity-0 sm:bottom-[12svh]">
          <div className="rq-glass mx-auto max-w-xl px-7 py-9 text-center sm:px-10">
            <h2 className="text-[32px] font-[450] leading-[1.1] tracking-[-0.02em] text-ink">
              One job. Nine seconds.
            </h2>
            <p className="mt-3 font-mono text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted">
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
              <a
                href="#product"
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
