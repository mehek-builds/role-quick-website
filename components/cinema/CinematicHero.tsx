"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

/* The scroll film. A 121-frame generated sequence (public/film/) is drawn on
   a canvas and scrubbed by scroll across a pinned viewport: scattered
   application pages converge into one packet while the light passes through
   the three pillar tints. Frosted glass cards carry the copy, one chapter at
   a time. The film IS the pitch: chaos in, one packet out.

   Six effects, one system: film scrub + grain + particles + vignette +
   glass cards + chapter tints. Pacing comes from Lenis (SmoothScroll) and
   the scrubbed timeline. Reduced motion / no JS: the section collapses to
   one static viewport (CSS only) with the hero card server-rendered. */

const FRAME_COUNT = 121;
const framePath = (i: number) => `/film/frame-${String(i).padStart(4, "0")}.webp`;

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
  { at: 0.0, label: "00 · Detected" },
  { at: 0.24, label: "01 · Documents" },
  { at: 0.5, label: "02 · Autofill" },
  { at: 0.74, label: "03 · Outreach" },
  { at: 0.92, label: "04 · Packet ready" },
];

export function CinematicHero({ storeUrl }: { storeUrl: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLCanvasElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);
  const chapterRef = useRef(0);

  /* ---- film frames: load 0 first (poster), then everything, draw nearest ---- */
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const drawFrame = (index: number) => {
    const canvas = filmRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const imgs = imagesRef.current;
    /* nearest loaded frame so scrubbing never blanks */
    let img: HTMLImageElement | null = null;
    for (let d = 0; d < FRAME_COUNT; d++) {
      const lo = imgs[index - d];
      const hi = imgs[index + d];
      if (lo?.complete && lo.naturalWidth) { img = lo; break; }
      if (hi?.complete && hi.naturalWidth) { img = hi; break; }
    }
    if (!img) return;
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
    const load = (i: number, onload?: () => void) => {
      if (imgs[i]) return;
      const img = new Image();
      img.src = framePath(i);
      if (onload) img.onload = onload;
      imgs[i] = img;
    };
    /* poster first, then the rest in soft batches */
    load(0, () => drawFrame(Math.round(progressRef.current * (FRAME_COUNT - 1))));
    load(FRAME_COUNT - 1);
    let i = 0;
    const batch = () => {
      for (let k = 0; k < 10 && i < FRAME_COUNT; k++, i++)
        load(i, () => {
          const want = Math.round(progressRef.current * (FRAME_COUNT - 1));
          if (Math.abs(want - i) < 3) drawFrame(want);
        });
      if (i < FRAME_COUNT) setTimeout(batch, 80);
    };
    batch();

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
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const railFill = q<HTMLElement>(".rq-cine-railfill")[0];
      const railLabel = q<HTMLElement>(".rq-cine-raillabel")[0];
      const hint = q<HTMLElement>(".rq-cine-hint")[0];

      const setChapter = (p: number) => {
        let c = 0;
        for (let k = CHAPTERS.length - 1; k >= 0; k--)
          if (p >= CHAPTERS[k].at) { c = k; break; }
        if (c !== chapterRef.current) {
          chapterRef.current = c;
          if (railLabel) railLabel.textContent = CHAPTERS[c].label;
        }
      };

      ScrollTrigger.create({
        trigger: wrap,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.85,
        snap: {
          snapTo: [0, 0.33, 0.59, 0.82, 1],
          duration: { min: 0.25, max: 0.7 },
          delay: 0.12,
          ease: "power2.inOut",
        },
        onUpdate(self) {
          const p = self.progress;
          progressRef.current = p;
          drawFrame(Math.round(p * (FRAME_COUNT - 1)));
          setChapter(p);
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
          if (railFill) railFill.style.transform = `scaleY(${p})`;
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
          scrub: 0.85,
        },
      });
      /* timeline positions are progress fractions (total duration = 1) */
      tl.to({}, { duration: 1 }); // spine
      const hero = q<HTMLElement>(".rq-cine-card-hero")[0];
      if (hero) tl.to(hero, { autoAlpha: 0, y: -48, duration: 0.08, ease: "power2.in" }, 0.13);
      slide(".rq-cine-card-1", 0.24, 0.42, tl);
      slide(".rq-cine-card-2", 0.5, 0.66, tl);
      slide(".rq-cine-card-3", 0.74, 0.87, tl);
      slide(".rq-cine-card-4", 0.93, null, tl);
    },
    { scope: wrapRef }
  );

  return (
    /* 420svh of scroll = the film's runtime. Reduced motion collapses this
       to one viewport in CSS (globals.css) and hides the chapter cards. */
    <div ref={wrapRef} className="rq-cine relative h-[420svh]">
      <div className="sticky top-0 h-svh w-full overflow-hidden">
        {/* 1 · the film */}
        <canvas ref={filmRef} className="absolute inset-0 h-full w-full" aria-hidden />
        {/* 5 · chapter tint (multiply, whisper) */}
        <div className="rq-cine-tint pointer-events-none absolute inset-0 mix-blend-multiply" aria-hidden />
        {/* 2 · paper dust */}
        <canvas ref={dustRef} className="rq-cine-dust pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
        {/* 3 · film grain */}
        <div className="rq-grain pointer-events-none absolute inset-0" aria-hidden />
        {/* 4 · vignette — gentle, the brand stays light */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(120% 90% at 50% 42%, rgba(18,18,15,0) 62%, rgba(18,18,15,0.10) 100%)",
          }}
        />

        {/* progress rail — machine voice, desktop only */}
        <div className="rq-cine-rail pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 items-center gap-3 sm:flex" aria-hidden>
          <p className="rq-cine-raillabel rotate-180 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted [writing-mode:vertical-rl]">
            00 · Detected
          </p>
          <div className="relative h-40 w-px bg-border">
            <div className="rq-cine-railfill absolute inset-0 origin-top bg-ink" style={{ transform: "scaleY(0)" }} />
          </div>
        </div>

        {/* glass card 0 — the hero. Server-rendered, visible at first paint. */}
        <div className="rq-cine-card-hero absolute inset-x-0 top-[16svh] px-6 sm:top-[18svh]">
          <div className="rq-glass rq-enter mx-auto max-w-2xl px-7 py-10 text-center sm:px-12 sm:py-12">
            <h1 className="text-5xl font-[450] leading-[1.02] tracking-[-0.03em] text-ink sm:text-[68px]">
              Apply <span className="text-brand-ink">in seconds.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[460px] text-[16px] leading-[1.65] text-muted">
              RoleQuick is a free Chrome extension for students and new grads.
              Open a posting and it tailors your resume, fills the application,
              and drafts the outreach. You get the final say.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href={storeUrl}
                className="w-full rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
              >
                Add to Chrome, it&apos;s free
              </a>
              <a
                href="#product"
                className="text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Skip the film ↓
              </a>
            </div>
            <p className="mt-5 text-[13px] text-muted">
              Reads only the posting you&apos;re viewing. Your data is never sold.{" "}
              <a href="/privacy" className="underline decoration-border underline-offset-2 hover:text-ink">
                Privacy
              </a>
            </p>
          </div>
        </div>

        {/* scroll hint */}
        <div className="rq-cine-hint absolute inset-x-0 bottom-8 flex flex-col items-center gap-2" aria-hidden>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Scroll
          </p>
          <span className="block h-8 w-px animate-pulse bg-faint" />
        </div>

        {/* chapter cards — hidden until the timeline brings them in */}
        <div className="rq-cine-card-1 invisible absolute inset-x-0 top-[22svh] px-6 opacity-0 sm:left-[8vw] sm:right-auto sm:top-[30svh] sm:max-w-md">
          <div className="rq-glass px-7 py-8">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">
              01 · Documents
            </p>
            <h2 className="mt-3 text-[28px] font-[450] leading-[1.15] tracking-[-0.02em] text-ink">
              A resume tuned to this posting.
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-muted">
              Read for what matters. Rebuilt in the posting&apos;s own language.
            </p>
          </div>
        </div>

        <div className="rq-cine-card-2 invisible absolute inset-x-0 top-[22svh] px-6 opacity-0 sm:left-auto sm:right-[8vw] sm:top-[30svh] sm:max-w-md">
          <div className="rq-glass px-7 py-8">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-teal-ink">
              02 · Autofill
            </p>
            <h2 className="mt-3 text-[28px] font-[450] leading-[1.15] tracking-[-0.02em] text-ink">
              Every field, filled.
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-muted">
              Contact, links, work auth, screening. Essays stay yours.
            </p>
          </div>
        </div>

        <div className="rq-cine-card-3 invisible absolute inset-x-0 top-[22svh] px-6 opacity-0 sm:left-[8vw] sm:right-auto sm:top-[30svh] sm:max-w-md">
          <div className="rq-glass px-7 py-8">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-coral-ink">
              03 · Outreach
            </p>
            <h2 className="mt-3 text-[28px] font-[450] leading-[1.15] tracking-[-0.02em] text-ink">
              A real person, already drafted.
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-muted">
              Alumni first. Waiting in your Gmail drafts.
            </p>
          </div>
        </div>

        <div className="rq-cine-card-4 invisible absolute inset-x-0 bottom-[10svh] px-6 opacity-0 sm:bottom-[12svh]">
          <div className="rq-glass mx-auto max-w-xl px-7 py-9 text-center sm:px-10">
            <h2 className="text-[32px] font-[450] leading-[1.1] tracking-[-0.02em] text-ink">
              One packet. Nine seconds.
            </h2>
            <p className="mt-3 font-mono text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted">
              19:42:07 posting detected → 19:42:16 packet ready
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={storeUrl}
                className="w-full rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
              >
                Add to Chrome, it&apos;s free
              </a>
              <a
                href="#product"
                className="w-full rounded-full border border-border bg-surface px-7 py-3 text-sm font-medium text-ink transition-colors hover:border-ink sm:w-auto"
              >
                See it assemble
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
