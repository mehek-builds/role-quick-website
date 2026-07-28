"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import captures from "@/lib/captures.json";
import { track } from "@/lib/analytics";

/* The proof stage: four REAL screenshots of the shipped product, above the
   fold, stepping through one job in order.
 *
 * Why this sits where it does
 * ---------------------------
 * The page used to open on the scroll film, which is beautiful and is labelled
 * "Illustration, not a screenshot · real ones below". So the first thing a
 * visitor met was a picture the page itself disclaimed, and the only genuine
 * screenshots were four viewports further down, lazy-loaded, past the point
 * most people leave. Cal AI's homepage is not persuasive because its shots are
 * pretty; it is persuasive because the shot is the proof and it sits where the
 * install decision gets made. This is that, in Litos's own voice.
 *
 * Every frame here comes from lib/captures.json, which is written by
 * scripts/capture-product.mjs from the running product. Nothing in this file
 * hardcodes an image path or a pixel dimension, which is the point: re-running
 * the capture re-shoots the hero, and `npm run capture:check` says whether the
 * committed pictures still match the code.
 *
 * Motion rule (DESIGN.md): it settles rather than loops. The sequence advances
 * once through the four steps and stops on the last one. It does not cycle
 * forever, and it never auto-advances under prefers-reduced-motion. */

type Shot = { w: number; h: number; src: string; cap?: string; note?: string; alt?: string; story?: number };

const STEPS: Shot[] = Object.values(captures as Record<string, Shot>)
  .filter((s): s is Shot & { story: number; cap: string; alt: string } => Boolean(s.story))
  .sort((a, b) => (a.story ?? 0) - (b.story ?? 0));

const STEP_MS = 3200;

export function HeroProof() {
  const [active, setActive] = useState(0);
  /* Once the viewer has driven it, the timer never takes the wheel back. A
     sequence that keeps moving under someone reading step 2 is the single
     most irritating thing a hero like this can do. */
  const [manual, setManual] = useState(false);
  const [reduced, setReduced] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* No timer on the last step, which is how the sequence settles instead of
     looping. That also means the effect never has to set state synchronously
     to stop itself. */
  useEffect(() => {
    if (reduced || manual || active >= STEPS.length - 1) return;
    const t = setTimeout(() => setActive((i) => i + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [active, reduced, manual]);

  const go = useCallback((i: number) => {
    setManual(true);
    setActive(i);
    track("hero_proof_step", { step: i + 1 });
  }, []);

  /* Left/right arrows move between steps once focus is in the rail, which is
     what a tablist is expected to do. */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (active + 1) % STEPS.length : (active - 1 + STEPS.length) % STEPS.length;
    go(next);
    stageRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  };

  /* The stage is one fixed box for every step, so switching steps never
     reflows the page around it. Portrait popup shots sit inside it at their
     true aspect; the landscape dashboard shot fills it. */
  const shots = useMemo(() => STEPS, []);
  if (!shots.length) return null;

  return (
    <div ref={stageRef} className="mx-auto w-full max-w-5xl">
      <div
        className="relative overflow-hidden rounded-card border border-border bg-surface-alt shadow-[0_24px_60px_rgba(35,33,29,0.10)]"
        onMouseEnter={() => setManual(true)}
      >
        {/* Decorative window chrome. No URL text: the extension steps happen on
            a company's own posting, and inventing a plausible address for it
            would be the one fabricated pixel on an otherwise honest stage. */}
        <div className="flex items-center gap-1.5 border-b border-border bg-surface px-4 py-3" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </div>

        {/* Portrait stage on phones. A 16/10 box across a 390px screen is about
            200px tall, and the popup shrank inside it until nothing in the
            screenshot could be read, which defeats the entire section. */}
        <div className="relative aspect-[3/4] w-full sm:aspect-[16/10]">
          {shots.map((shot, i) => {
            const portrait = shot.w < shot.h;
            return (
              <div
                key={shot.src}
                className={`absolute inset-0 ${
                  i === active ? "opacity-100" : "pointer-events-none opacity-0"
                } motion-safe:transition-opacity motion-safe:duration-500`}
                aria-hidden={i !== active}
              >
                {/* The extension popup is 380px wide and the stage is not. Rather
                    than float it in the middle of an empty field, the leftover
                    column carries the one line that says what the picture is
                    doing. The dashboard frame is wide enough to need no help and
                    simply fills the stage. */}
                <div
                  /* min-h-0 is load-bearing: without it the grid row sizes to
                     the image's intrinsic 580px, the stage overflows, and the
                     note beside it gets clipped. */
                  className={
                    portrait
                      ? "grid h-full min-h-0 grid-cols-1 items-center gap-6 overflow-hidden p-5 sm:grid-cols-[1fr_auto] sm:gap-10 sm:p-8"
                      : "flex h-full min-h-0 items-center justify-center overflow-hidden p-4 sm:p-6"
                  }
                >
                  {portrait && (
                    <p className="hidden max-w-[320px] text-[19px] leading-[1.5] tracking-[-0.01em] text-ink sm:block">
                      {shot.note}
                    </p>
                  )}
                  {/* The wrapper is what carries the definite height. A bare
                      `max-h-full` on a grid item does not clamp a replaced
                      element reliably, and the popup rendered at its full 2x
                      pixel size and burst out of the stage. */}
                  <div className="flex h-full min-h-0 items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={shot.src}
                      alt={shot.alt ?? ""}
                      width={shot.w}
                      height={shot.h}
                      /* The first frame is the largest thing above the fold, so
                         it loads eagerly and the rest defer. */
                      loading={i === 0 ? "eager" : "lazy"}
                      fetchPriority={i === 0 ? "high" : "auto"}
                      decoding="async"
                      className={`block rounded-inner border border-border bg-surface object-contain shadow-[0_10px_30px_rgba(35,33,29,0.08)] ${
                        portrait ? "h-full w-auto max-w-full" : "h-auto max-h-full w-full"
                      }`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The rail doubles as the caption: each step says, in the reader's
          words, what the picture above it is showing. */}
      <div
        role="tablist"
        aria-label="What Litos does, in four real screenshots"
        onKeyDown={onKey}
        className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {shots.map((shot, i) => (
          <button
            key={shot.src}
            role="tab"
            type="button"
            aria-selected={i === active}
            tabIndex={i === active ? 0 : -1}
            onClick={() => go(i)}
            /* 44px floor: the mobile tap-target pass took this site from 21
               undersized targets to none, and a new control must not undo it. */
            className={`min-h-[44px] rounded-inner border px-3 py-2.5 text-left text-[13px] leading-5 transition-colors ${
              i === active
                ? "border-brand-ink/30 bg-brand-soft text-ink"
                : "border-border bg-surface text-muted hover:text-ink"
            }`}
          >
            <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
              Step {i + 1}
            </span>
            {shot.cap}
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-[13px] leading-6 text-muted">
        Real screenshots of the app, taken from the code that ships. The names and
        companies in them are made up.
      </p>
    </div>
  );
}
