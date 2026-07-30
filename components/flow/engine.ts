/**
 * The motion behind the flow demo.
 *
 * Three things here are not obvious and were each arrived at by measuring the
 * behaviour they imitate rather than by guessing:
 *
 *  - The spring is solved analytically, the way framer-motion does it, so a
 *    mid-flight position matches rather than merely converging to the same
 *    rest point. Its rest thresholds are framer's defaults (restDelta 0.01,
 *    restSpeed 2); a stricter velocity threshold ran flights ~150ms long.
 *
 *  - Entrances are back-dated. Rebuilding a screen costs real milliseconds,
 *    and a CSS animation on a freshly inserted node starts at the next frame,
 *    which lands a frame late. These are driven through the Web Animations API
 *    so their phase can be set explicitly from the moment the beat began.
 *
 *  - The flash ring's easing was fitted to samples of the box-shadow it
 *    imitates (rms 0.10px of ring spread over 42 samples), and an interrupted
 *    ring holds at full strength for its delay before decaying, which is why
 *    tails overlap instead of snapping off.
 */

export const REST_DELTA = 0.01;
export const REST_SPEED = 2;

export type SpringCfg = { stiffness: number; damping: number; mass?: number };

/** Analytic spring. `advanceMs` starts the clock partway in, to cover the cost
 *  of the render that preceded it. Returns a cancel function. */
export function springTo(
  from: Record<string, number>,
  to: Record<string, number>,
  cfg: SpringCfg,
  apply: (s: Record<string, number>) => void,
  onDone?: () => void,
  advanceMs = 0,
): () => void {
  const keys = Object.keys(to);
  const { stiffness, damping, mass = 1 } = cfg;
  const w0 = Math.sqrt(stiffness / mass);
  const z = damping / (2 * Math.sqrt(stiffness * mass));
  const solve: Record<string, (t: number) => number> = {};

  for (const k of keys) {
    const A = from[k] - to[k];
    const target = to[k];
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      const B = (z * w0 * A) / wd;
      solve[k] = (t) => target + Math.exp(-z * w0 * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
    } else if (z === 1) {
      solve[k] = (t) => target + (A + w0 * A * t) * Math.exp(-w0 * t);
    } else {
      const r = w0 * Math.sqrt(z * z - 1);
      const c2 = (z * w0 * A) / r;
      solve[k] = (t) => target + Math.exp(-z * w0 * t) * (A * Math.cosh(r * t) + c2 * Math.sinh(r * t));
    }
  }

  const t0 = performance.now() - Math.max(0, advanceMs);
  const state: Record<string, number> = {};
  const sample = (t: number) => {
    let settled = true;
    for (const k of keys) {
      state[k] = solve[k](t);
      const v = (solve[k](t + 0.005) - solve[k](t - 0.005)) / 0.01;
      if (Math.abs(state[k] - to[k]) > REST_DELTA || Math.abs(v) > REST_SPEED) settled = false;
    }
    return settled;
  };

  let raf = 0;
  let killed = false;
  if (advanceMs > 0) { sample(advanceMs / 1000); apply(state); }

  const tick = (now: number) => {
    if (killed) return;
    if (sample((now - t0) / 1000)) {
      keys.forEach((k) => (state[k] = to[k]));
      apply(state);
      onDone?.();
      return;
    }
    apply(state);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { killed = true; cancelAnimationFrame(raf); };
}

/* ---------------------------------------------------------------- flash ring */

export const FLASH_DELAY = 450;
export const FLASH_DUR = 1100;
export const FLASH_PEAK = 4;
const FLASH_EASE = [0.131, 0.0, 0.455, 0.81] as const;
export const FLASH_RGB = {
  blue: [107, 132, 232, 0.3],
  green: [104, 173, 149, 0.35],
} as const;

export const flashEase = (t: number) => {
  const [x1, y1, x2, y2] = FLASH_EASE;
  let lo = 0, hi = 1, m = 0;
  for (let i = 0; i < 40; i++) {
    m = (lo + hi) / 2;
    const x = 3 * (1 - m) * (1 - m) * m * x1 + 3 * (1 - m) * m * m * x2 + m * m * m;
    if (x < t) lo = m; else hi = m;
  }
  m = (lo + hi) / 2;
  return 3 * (1 - m) * (1 - m) * m * y1 + 3 * (1 - m) * m * m * y2 + m * m * m;
};

export type Flash = { color: "blue" | "green"; mode: "in" | "out"; t0: number; from?: number };

/** Ring spread in px, or null once the ring has finished. */
export function flashValue(f: Flash, now: number): number | null {
  const e = now - f.t0 - FLASH_DELAY;
  if (e < 0) return f.mode === "out" ? f.from ?? 0 : 0;
  const p = e / FLASH_DUR;
  if (p >= 1) return null;
  if (f.mode === "out") return (f.from ?? 0) * (1 - flashEase(p));
  return p < 0.3
    ? FLASH_PEAK * flashEase(p / 0.3)
    : FLASH_PEAK * (1 - flashEase((p - 0.3) / 0.7));
}

export function ringShadow(f: Flash, v: number) {
  const [r, g, b, a] = FLASH_RGB[f.color];
  return `0 0 0 ${v}px rgba(${r},${g},${b},${(a * v) / FLASH_PEAK}), 0 1px 2px rgba(18,18,15,.04)`;
}

/* -------------------------------------------------------------- entrances */

export type Entrance = { k: Keyframe[]; o: KeyframeAnimationOptions };

export const ENTRANCES: Record<string, Entrance> = {
  "rq-f-page-inner": {
    k: [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0px)" }],
    o: { duration: 300, easing: "cubic-bezier(.25,.46,.45,.94)" },
  },
  "rq-f-feedcard": {
    k: [{ opacity: 0, transform: "translateY(-12px)" }, { opacity: 1, transform: "translateY(0px)" }],
    o: { duration: 350, easing: "cubic-bezier(.25,.46,.45,.94)" },
  },
  /* Arrives with the screen, slightly overshooting, so it reads as a thing that
     turned up rather than a thing that was always there. Same curve as the
     detect card, whose job is also "this just appeared". */
  "rq-f-ask": {
    k: [{ opacity: 0, transform: "translateY(8px) scale(.97)" }, { opacity: 1, transform: "translateY(0px) scale(1)" }],
    o: { duration: 300, delay: 120, easing: "cubic-bezier(.34,1.4,.64,1)" },
  },
  "rq-f-dcard": {
    k: [{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "scale(1)" }],
    o: { duration: 280, easing: "cubic-bezier(.34,1.4,.64,1)" },
  },
  "rq-f-scanbox": {
    k: [{ opacity: 0 }, { opacity: 1 }],
    o: { duration: 300, delay: 250, easing: "linear" },
  },
  "rq-f-colcount": {
    k: [{ transform: "scale(1.25)" }, { transform: "scale(1)" }],
    o: { duration: 450, easing: "cubic-bezier(.22,1,.36,1)" },
  },
  "rq-f-todaynum": {
    k: [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0px)" }],
    o: { duration: 300, easing: "linear" },
  },
  "rq-f-packet": {
    k: [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0px)" }],
    o: { duration: 340, easing: "cubic-bezier(.25,.46,.45,.94)" },
  },
};

/** Play every gated entrance inside `root`, phase-corrected by `lag`, and
 *  reveal any text marked as being written left to right in character steps. */
export function playEntrances(root: HTMLElement, lag: number) {
  root.querySelectorAll<HTMLElement>(".rq-f-anim").forEach((n) => {
    for (const cls in ENTRANCES) {
      if (!n.classList.contains(cls)) continue;
      const a = n.animate(ENTRANCES[cls].k, { fill: "both", ...ENTRANCES[cls].o });
      a.currentTime = Math.max(0, lag);
    }
  });
  root.querySelectorAll<HTMLElement>("[data-type]").forEach((n) => {
    const chars = Math.max(6, (n.textContent || "").length);
    const extra = parseFloat(getComputedStyle(n).getPropertyValue("--d")) || 0;
    const a = n.animate(
      [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
      { duration: Math.min(900, chars * 13), delay: extra, fill: "both",
        easing: `steps(${Math.min(chars, 42)})` },
    );
    a.currentTime = Math.max(0, lag);
  });
}

/* ------------------------------------------------------------------- FLIP */

export const LAYOUT_SPRING: SpringCfg = { stiffness: 240, damping: 27 };

export type Rects = Map<string, DOMRect>;

export function snapshot(root: HTMLElement): Rects {
  const map: Rects = new Map();
  root.querySelectorAll<HTMLElement>("[data-flip]").forEach((n) => {
    map.set(n.dataset.flip!, n.getBoundingClientRect());
  });
  return map;
}

/** Move each card from where it was to where it now is. A card can be
 *  re-flighted before its previous flight settles, so the old spring is
 *  cancelled first: otherwise two springs fight over one transform, and the
 *  old one's completion clears the in-flight flag the new one just set. */
export function runFlip(
  root: HTMLElement,
  before: Rects,
  flying: Set<string>,
  runs: Map<string, () => void>,
  lag: number,
  onSettle: () => void,
) {
  root.querySelectorAll<HTMLElement>("[data-flip]").forEach((n) => {
    const key = n.dataset.flip!;
    const prev = before.get(key);
    if (!prev) return;
    const now = n.getBoundingClientRect();
    if (now.width === 0) return;
    const dx = prev.left - now.left;
    const dy = prev.top - now.top;
    const sx = prev.width / now.width;
    const sy = prev.height / now.height;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) return;

    runs.get(key)?.();
    flying.add(key);
    n.style.transformOrigin = "top left";
    n.style.willChange = "transform";
    const kill = springTo(
      { x: dx, y: dy, sx, sy }, { x: 0, y: 0, sx: 1, sy: 1 }, LAYOUT_SPRING,
      (s) => { n.style.transform = `translate(${s.x}px, ${s.y}px) scale(${s.sx}, ${s.sy})`; },
      () => {
        n.style.transform = "";
        n.style.willChange = "";
        n.style.transformOrigin = "";
        if (runs.get(key) === kill) { runs.delete(key); flying.delete(key); }
        onSettle();
      },
      lag,
    );
    runs.set(key, kill);
  });
}
