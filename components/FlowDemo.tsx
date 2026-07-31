"use client";

/**
 * FlowDemo — a miniature picture of the product working, for the hero.
 *
 * It plays one loop: five matched jobs, then the packet being made against a
 * real posting (the resume rewritten and the employer's form filled), each
 * artifact approved by the person, then the board it all
 * lands on and a second role arriving on its own once auto-submit is on.
 *
 * Two properties are deliberate and worth keeping:
 *
 *  - Nothing here describes the product in words. Every claim is shown as the
 *    artifact being made. The one exception is the labels an employer's form
 *    and an email client genuinely have.
 *
 *  - The person presses Approve, Submit and Send. Auto-submit only turns on
 *    afterwards, and announces itself with a cancel window, which is the
 *    shipped behaviour and the Guardrail PacketDemo also honours.
 *
 * Motion follows the site's rules: it parks on a finished packet under reduced
 * motion, and it stops entirely when off-screen or in a background tab.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import {
  ACTION_MOVES, ACTIONS, ASK, AUTO_APPLY, AUTO_FLY, BLOOMBERG, BULLETS, COLUMNS,
  EMAIL, FEATURED,
  FIELDS, GITHUB, IDX, JD_LINES, JOBS, NAV, ORB_STATE, QUEUE, REDDIT, STAGE_ACTION,
  SEED_BOARD, STAGE, STEPS, type Board, type Job,
} from "./flow/data";
import {
  type Flash, flashValue, playEntrances, ringShadow,
  runFlip, snapshot, springTo, type Rects,
} from "./flow/engine";

const cx = (...v: (string | false | undefined)[]) => v.filter(Boolean).join(" ");

/** Design sizes. The demo is a picture at a fixed size, not a fluid layout, so
 *  it is scaled to the space available rather than reflowed into it. */
const DESIGN_H = 476;
const DESIGN_W = 720;
const COMPACT_W = 552;          // the same picture with the sidebar dropped
const COMPACT_BELOW = 640;      // container width at which the sidebar goes
const PHONE_BELOW = 480;        // and below which it stops being this picture

/**
 * Fits FlowDemo to its container. Never scales past 1: at rest it is the size
 * it was drawn at, and it only ever shrinks.
 *
 * Under PHONE_BELOW it stops scaling and hands over to the phone variant,
 * which is a different composition at real size rather than this one shrunk.
 *
 * `minScale` therefore only guards the scaled picture: if the room left for it
 * would put the body text under about 9px, it renders nothing instead of an
 * illegible thumbnail. It does not apply to the phone variant, which has no
 * scale to be illegible at.
 */
export function FlowDemoFit({ className, fitHeight = false, gutter = 16, minScale = 0 }:
  { className?: string; fitHeight?: boolean; gutter?: number; minScale?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ s: 1, compact: false, ok: true, phone: false });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const avail = el.parentElement?.clientWidth ?? el.clientWidth;
      if (!avail) return;
      // Below this the desktop picture stops being worth scaling: at 375 it
      // would run at 0.68 and the 11px labels land near 7px. The phone variant
      // is a different composition at real size, so it is never scaled and
      // never gated - everything past this point only concerns the other one.
      const phone = avail < PHONE_BELOW;
      if (phone) {
        setFit((f) => (f.phone ? f : { s: 1, compact: true, ok: true, phone: true }));
        return;
      }
      const compact = avail < COMPACT_BELOW;
      const dw = compact ? COMPACT_W : DESIGN_W;
      let s = Math.min(1, avail / dw);
      if (fitHeight) {
        // Stacked under something in a fixed-height frame, the constraint is
        // what is left below it, not the width.
        //
        // Measure the PARENT, never this element. When the gate below hides
        // this one its own rect collapses to zero, which reads as "there is
        // room for anything", which shows it again: the two states feed each
        // other and it settles on whichever it happened to land on. The parent
        // keeps its position either way, because what precedes it decides it.
        const anchor = el.parentElement ?? el;
        const room = window.innerHeight - anchor.getBoundingClientRect().top - gutter;
        if (room > 0) s = Math.min(s, room / DESIGN_H);
      }
      // Only commit real changes: this also observes its own box, so an
      // unguarded set would feed itself.
      setFit((f) => (!f.phone && Math.abs(f.s - s) < 0.005 && f.compact === compact
        ? f : { s, compact, ok: s >= minScale, phone: false }));
    };

    // The first measure can land before the frame has been laid out, and the
    // height check then reads a top of 0 and concludes there is room for
    // anything. Re-measure once layout has settled.
    measure();
    const raf = requestAnimationFrame(measure);
    const settle = window.setTimeout(measure, 120);

    const ro = new ResizeObserver(measure);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // fit.phone is a dependency because the two branches render different
    // elements. It happens to work without it, because React patches the one
    // div in place rather than replacing it, but that is a reconciliation
    // detail: the moment the branches differ structurally, `el` would point at
    // an unmounted node whose parent is null, avail would read 0, and measure
    // would return early forever.
  }, [fitHeight, gutter, minScale, fit.phone]);

  if (fit.phone) {
    return (
      <div ref={box} className={cx("rq-f-phone", className)}>
        <FlowDemo phone />
      </div>
    );
  }

  return (
    <div ref={box} className={cx("rq-f-fit", className)} data-legible={fit.ok}
      style={{ "--s": fit.ok ? fit.s : 0, "--dw": `${fit.compact ? COMPACT_W : DESIGN_W}px`,
        "--dh": `${DESIGN_H}px`, display: fit.ok ? undefined : "none" } as React.CSSProperties}>
      {fit.ok && <FlowDemo compact={fit.compact} />}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Orb({ state, px }: { state: "searching" | "composing" | "solving" | "shaping" | "working"; px: number }) {
  // The library ships two tuned sizes rather than a scale factor; 20 is the
  // inline one. Anything smaller is the 20 scaled down inside a fixed box, so
  // it keeps its tuning and still occupies the space the layout expects.
  return (
    <span className="rq-f-orb" style={{ width: px, height: px }} aria-hidden>
      <span style={{ transform: `scale(${px / 20})`, transformOrigin: "top left", display: "block" }}>
        <ThinkingOrb state={state} size={20} theme="light" />
      </span>
    </span>
  );
}

function LogoBox({ job, size }: { job: Job; size: 40 | 36 | 28 }) {
  return (
    <div className={cx(`rq-f-logobox rq-f-lb-${size}`, job.markDark && "rq-f-lb-dark", job.wordmark && "rq-f-lb-wm")}>
      {job.mark
        ? <span className="rq-f-monomark" aria-label={job.company}>{job.mark}</span>
        // eslint-disable-next-line @next/next/no-img-element -- a 1KB brand SVG; next/image does not optimise SVG and would add a wrapper this fixed tile cannot take
        : <img src={job.logo} alt={`${job.company} logo`} loading="lazy" />}
    </div>
  );
}

const Tick = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

/** The cancel window counts down for real rather than sitting on one number. */
function Countdown({ since }: { since: () => number }) {
  const [n, setN] = useState(12);
  useEffect(() => {
    let raf = 0;
    const tick = () => { setN(Math.max(1, 12 - Math.floor(since() / 380))); raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [since]);
  return <>{n}</>;
}

/* ------------------------------------------------------------------- state */

type S = {
  stepIdx: number;
  page: "jobs" | "applications";
  feed: Job | null;
  board: Board;
  autopilot: boolean;
  today: number;
  flashes: Record<string, Flash>;
  cursor: { x: number; y: number; shown: boolean };
  stepStart: number;
  justReset: boolean;
};

const freshBoard = (): Board => ({
  applied: [...SEED_BOARD.applied], interview: [...SEED_BOARD.interview], offer: [...SEED_BOARD.offer],
});
const freshState = (): S => ({
  stepIdx: 0, page: "jobs", feed: null, board: freshBoard(), autopilot: false,
  today: 127, flashes: {}, cursor: { x: 0, y: 0, shown: false }, stepStart: 0, justReset: true,
});

export function FlowDemo({ compact = false, phone = false }: { compact?: boolean; phone?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const applyBtn = useRef<HTMLDivElement>(null);
  const actBtn = useRef<HTMLSpanElement>(null);
  const navApps = useRef<HTMLDivElement>(null);
  const yesBtn = useRef<HTMLSpanElement>(null);
  const noBtn = useRef<HTMLSpanElement>(null);
  const appsTab = useRef<HTMLSpanElement>(null);

  const S = useRef<S>(freshState());
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const pendingFlip = useRef<Rects | null>(null);
  const flying = useRef(new Set<string>());
  const flipRuns = useRef(new Map<string, () => void>());
  const cursorSpring = useRef<(() => void) | null>(null);
  const cursorPos = useRef({ x: 0, y: 0 });
  const cursorScale = useRef(1);
  const accentTop = useRef<number | null>(null);
  const flashRaf = useRef(0);
  const prev = useRef({ page: "", feed: "", today: 0, autopilot: false, scanning: false, packet: false, counts: {} as Record<string, number> });
  const reduced = useRef(false);

  const step = () => STEPS[S.current.stepIdx].name as string;
  const since = useCallback(() => performance.now() - S.current.stepStart, []);
  const at = (n: string) => IDX[step()] >= IDX[n];

  /* ------------------------------------------------------------- effects */

  const applyStepEffects = useCallback((): boolean => {
    const st = STEPS[S.current.stepIdx].name as string;
    const s = S.current;
    const startFlash = (key: string, color: "blue" | "green") => {
      const now = performance.now();
      for (const k of Object.keys(s.flashes)) {
        if (k === key) continue;
        const v = flashValue(s.flashes[k], now);
        if (v === null || v <= 0.001) { delete s.flashes[k]; continue; }
        s.flashes[k] = { color: s.flashes[k].color, mode: "out", from: v, t0: now };
      }
      s.flashes[key] = { color, mode: "in", t0: now };
    };

    if (st === "swap") {
      s.page = "applications";
      s.board.applied = [FEATURED, ...s.board.applied];
      s.today += 1;
      s.feed = QUEUE[0];
    } else if (st === "landFlash") { startFlash(FEATURED.key, "blue"); }
    else if (st === "askClick") { s.autopilot = true; }
    else if (st === "detect2") { s.feed = BLOOMBERG; }
    else if (AUTO_FLY.includes(st) && s.feed) {
      const j = s.feed;
      s.board.applied = [j, ...s.board.applied];
      startFlash(j.key, "blue");
      s.feed = null;
      s.today += 1;
      return true;
    } else if (st === "promote1") {
      s.board.applied = s.board.applied.filter((x) => x.key !== GITHUB.key);
      s.board.interview = [GITHUB, ...s.board.interview];
      startFlash(GITHUB.key, "green");
      return true;
    } else if (st === "promote2") {
      s.board.interview = s.board.interview.filter((x) => x.key !== REDDIT.key);
      s.board.offer = [REDDIT, ...s.board.offer];
      startFlash(REDDIT.key, "green");
      return true;
    }
    return false;
  }, []);

  /* ------------------------------------------------------------ the loop */

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced.current) {
      // "Reduced motion gets the product, not the poster": park on the
      // finished packet instead of looping, and drop the cursor, which is
      // purely a motion device.
      for (S.current.stepIdx = 0; STEPS[S.current.stepIdx].name !== "sent"; S.current.stepIdx++) applyStepEffects();
      S.current.stepStart = performance.now();
      rerender();
      return;
    }

    let timer = 0;
    let deadline = 0;
    let remaining = 0;
    let playing = true;
    let onScreen = true;

    const advance = () => {
      pendingFlip.current = snapshot(root.current!);
      const s = S.current;
      if (s.stepIdx === STEPS.length - 1) {
        const keep = s.stepIdx;
        Object.assign(s, freshState());
        void keep;
        flying.current.clear();
        flipRuns.current.clear();
        prev.current = { page: "", feed: "", today: 0, autopilot: false, scanning: false, packet: false, counts: {} };
      } else {
        s.stepIdx += 1;
        s.justReset = false;
      }
      s.stepStart = performance.now();
      applyStepEffects();
      rerender();
      schedule(STEPS[s.stepIdx].ms);
    };

    const schedule = (ms: number) => {
      clearTimeout(timer);
      deadline = performance.now() + ms;
      timer = window.setTimeout(advance, ms);
    };

    S.current.stepStart = performance.now();
    applyStepEffects();
    rerender();
    schedule(STEPS[0].ms);

    /* A loop nobody is looking at should not be running. */
    const active = () => document.visibilityState === "visible" && onScreen;
    const pause = () => {
      if (!playing) return;
      playing = false;
      clearTimeout(timer);
      remaining = Math.max(0, deadline - performance.now());
    };
    const resume = () => {
      if (playing) return;
      playing = true;
      S.current.stepStart = performance.now() - (STEPS[S.current.stepIdx].ms - remaining);
      schedule(remaining);
    };
    const onVis = () => (active() ? resume() : pause());
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; onVis(); }, { threshold: 0 });
    if (root.current) io.observe(root.current);
    document.addEventListener("visibilitychange", onVis);

    const runsAtMount = flipRuns.current;
    return () => {
      clearTimeout(timer);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      cancelAnimationFrame(flashRaf.current);
      cursorSpring.current?.();
      runsAtMount.forEach((k) => k());
    };
  }, [applyStepEffects, rerender]);

  /* ------------------------------------- after every commit, before paint */

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || reduced.current) { paintFlashes(); return; }
    const lag = since();

    playEntrances(el, lag);
    paintFlashes();

    if (pendingFlip.current) {
      runFlip(el, pendingFlip.current, flying.current, flipRuns.current, lag, paintFlashes);
      pendingFlip.current = null;
    }
    syncNav(S.current.justReset, lag);
    placeCursor(lag);

    prev.current = {
      page: S.current.page,
      feed: S.current.feed?.key ?? "",
      today: S.current.today,
      autopilot: S.current.autopilot,
      scanning: S.current.autopilot && !S.current.feed,
      packet: IDX[step()] >= IDX.jdScan && IDX[step()] <= IDX.navClick,
      counts: Object.fromEntries(COLUMNS.map((c) => [c.key, S.current.board[c.key].length])),
    };
  });

  /* --------------------------------------------------------- flash driver */

  function paintFlashes() {
    const el = root.current;
    if (!el) return;
    const now = performance.now();
    let live = false;
    for (const key of Object.keys(S.current.flashes)) {
      const f = S.current.flashes[key];
      const v = flashValue(f, now);
      if (v === null) {
        const done = el.querySelector<HTMLElement>(`[data-flip="${key}"]`);
        if (done) { done.style.boxShadow = ""; done.style.zIndex = ""; }
        delete S.current.flashes[key];
        continue;
      }
      live = true;
      const node = el.querySelector<HTMLElement>(`[data-flip="${key}"]`);
      if (!node) continue;
      // A card in flight renders no ring and pops it on landing, which is what
      // the projection it imitates does.
      const shown = flying.current.has(key) ? 0 : v;
      node.style.boxShadow = ringShadow(f, shown);
      node.style.position = "relative";
      node.style.zIndex = "5";
    }
    if (live && !flashRaf.current && !reduced.current) {
      const tick = () => { flashRaf.current = 0; paintFlashes(); };
      flashRaf.current = requestAnimationFrame(tick);
    }
  }

  /* --------------------------------------------------------------- cursor */

  function placeCursor(lag: number) {
    const el = root.current;
    const cur = cursorRef.current;
    if (!el || !cur) return;
    const st = step();
    const box = el.getBoundingClientRect();
    const rect = (n: HTMLElement | null) => {
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return r.width > 0 ? r : null;
    };
    const put = (r: DOMRect | null, fx = 0.5, fy = 0.58) => {
      if (r) S.current.cursor = { x: r.left - box.left + r.width * fx, y: r.top - box.top + r.height * fy, shown: true };
    };

    if (st === "move") put(rect(applyBtn.current));
    else if (ACTION_MOVES.includes(st) && actBtn.current) put(rect(actBtn.current), 0.5, 0.6);
    else if (st === "navMove") put(rect(appsTab.current ?? navApps.current), 0.55, 0.55);
    else if (st === "askNo") put(rect(noBtn.current));
    else if (st === "askYes" || st === "askBack" || st === "askClick") put(rect(yesBtn.current));
    else if (st === "idle") S.current.cursor = { x: box.width * 0.62, y: box.height * 0.5, shown: true };
    else if (st === "autoApply1") S.current.cursor = { x: box.width * 0.62, y: box.height * 0.78, shown: true };

    const clicking = st.endsWith("Click") || st === "click";
    const tx = S.current.cursor.x - 3.5;
    const ty = S.current.cursor.y - 1.5;
    cur.style.opacity = S.current.cursor.shown && st !== "fade" ? "1" : "0";
    cur.style.transition = "opacity .3s linear";

    const paint = () => {
      cur.style.transform = `translate(${cursorPos.current.x}px, ${cursorPos.current.y}px) scale(${cursorScale.current})`;
    };
    if (!cur.dataset.placed) {
      cur.dataset.placed = "1";
      cursorPos.current = { x: tx, y: ty };
      paint();
    } else {
      cursorSpring.current?.();
      cursorSpring.current = springTo(
        { x: cursorPos.current.x, y: cursorPos.current.y }, { x: tx, y: ty },
        { stiffness: 130, damping: 19, mass: 0.7 },
        (s) => { cursorPos.current = { x: s.x, y: s.y }; paint(); }, undefined, lag,
      );
    }
    // scale is a short tween, independent of the travel spring
    const from = cursorScale.current;
    const to = clicking ? 0.82 : 1;
    const t0 = performance.now();
    const scaleTick = () => {
      const p = Math.min(1, (performance.now() - t0) / 150);
      cursorScale.current = from + (to - from) * p;
      paint();
      if (p < 1) requestAnimationFrame(scaleTick);
    };
    requestAnimationFrame(scaleTick);
  }

  function syncNav(instant: boolean, lag: number) {
    if (compact) return;
    const el = root.current;
    const accent = el?.querySelector<HTMLElement>(".rq-f-navaccent");
    const nav = el?.querySelector<HTMLElement>(".rq-f-side-nav");
    const active = el?.querySelector<HTMLElement>(".rq-f-navitem.rq-f-active");
    if (!accent || !nav || !active) return;
    const nb = nav.getBoundingClientRect();
    const tb = active.getBoundingClientRect();
    const top = tb.top - nb.top + 4;
    accent.style.height = `${tb.height - 8}px`;
    accent.style.left = `${tb.left - nb.left}px`;
    if (instant || accentTop.current === null) {
      accent.style.top = `${top}px`;
      accentTop.current = top;
      return;
    }
    if (Math.abs(accentTop.current - top) < 0.5) return;
    springTo({ y: accentTop.current }, { y: top }, { stiffness: 350, damping: 30 },
      (s) => { accent.style.top = `${s.y}px`; accentTop.current = s.y; }, undefined, lag);
  }

  /* ---------------------------------------------------------------- views */

  const st = step();
  const s = S.current;
  const stage = STAGE[st] ?? null;
  const packetOpen = stage !== null;
  const sent = at("sent");
  const approved = (at("approveClick") ? 1 : 0) + (at("submitClick") ? 1 : 0) + (at("sendClick") ? 1 : 0);
  const action = ACTIONS.find((a) => a.steps.includes(st));
  const orbState = ORB_STATE[st];
  const isApplying = AUTO_APPLY.includes(st);

  const jobRow = (j: Job, i: number) => {
    const first = i === 0;
    return (
      <div key={j.key} className={cx("rq-f-jobrow", !first && packetOpen && "rq-f-jobrow-out")}>
        <LogoBox job={j} size={40} />
        <div className="rq-f-jobmid">
          <div className="rq-f-jobtop">
            <span className="rq-f-jobtitle">{j.title}</span>
            <span className="rq-f-matchbadge">{j.match}% match</span>
          </div>
          <div className="rq-f-jobsub">{j.company} · {j.location}</div>
        </div>
        <div ref={first ? applyBtn : undefined} className={cx("rq-f-btnslot", first && packetOpen && !sent && "rq-f-btnslot-idle")}>
          <span className="rq-f-pill rq-f-pill-apply"
            style={{ opacity: first && packetOpen ? 0 : 1, transform: `scale(${first && st === "click" ? 0.92 : 1})` }}>
            Apply Now
          </span>
          {first && (
            <span className="rq-f-pill rq-f-pill-applied" style={{ opacity: sent ? 1 : 0 }}>
              <Tick className="rq-f-tickicon" />Sent
            </span>
          )}
        </div>
      </div>
    );
  };

  const keysLit = at("tailor2") ? 2 : at("tailor1") ? 1 : 0;
  const written = at("tailor2") ? 2 : at("tailor1") ? 1 : 0;
  const filled = at("fill3") ? 6 : at("fill2") ? 4 : at("fill1") ? 2 : 0;
  const filling = st === "fill1" || st === "fill2" || st === "fill3";
  const writing = st === "emailWrite";
  const opening = st === "emailOpen";
  const hasMail = at("emailWrite");

  const scene =
    stage === "resume" ? (
      <div className="rq-f-scene rq-f-scene-split">
        <div className={cx("rq-f-jd", st === "jdScan" && "rq-f-scanning")}>
          <div className="rq-f-jdhead" />
          {JD_LINES.map((line, i) => (
            <div className="rq-f-jdline" key={i}>
              {line.map((x, j) =>
                x.k !== undefined
                  ? <span key={j} className={cx("rq-f-jdkey", x.k < keysLit && "rq-f-lit")}>{x.t}</span>
                  : <span key={j}>{x.t}</span>)}
            </div>
          ))}
        </div>
        <div className="rq-f-doc">
          <div className="rq-f-docbar" /><div className="rq-f-docbar rq-f-short" />
          {BULLETS.map((b, i) => {
            const done = i < written;
            const active = i === written - 1 && (st === "tailor1" || st === "tailor2");
            return (
              <div className={cx("rq-f-bullet", done && "rq-f-done")} key={i}>
                <span className="rq-f-bdot" />
                <span className="rq-f-btext" {...(active ? { "data-type": "1" } : {})}>
                  {done && b.after
                    ? b.after.map((x, j) => (x.hi ? <em key={j}>{x.t}</em> : <span key={j}>{x.t}</span>))
                    : b.before}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    ) : stage === "form" ? (
      <div className="rq-f-scene">
        <div className="rq-f-formgrid">
          {FIELDS.map((f, i) => {
            const on = i < filled;
            const justNow = on && filling && i >= filled - 2;
            return (
              <div className="rq-f-frow" key={f.label}>
                <div className="rq-f-flabel">{f.label}</div>
                <div className={cx("rq-f-finput", on && "rq-f-on", justNow && "rq-f-flash", f.select && "rq-f-sel")}>
                  <span className="rq-f-fval" {...(justNow ? { "data-type": "1" } : {})}>{on ? f.value : ""}</span>
                  {f.select && (
                    <svg className="rq-f-fcaret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : (
      <div className="rq-f-scene">
        <div className="rq-f-mail">
          <div className="rq-f-mrow">
            <span className="rq-f-mlab">To</span>
            <span className="rq-f-mto" {...(opening ? { "data-type": "1" } : {})}>{EMAIL.to}</span>
            <span className="rq-f-mmeta" {...(opening ? { "data-type": "1", style: { "--d": "120ms" } as React.CSSProperties } : {})}>{EMAIL.meta}</span>
          </div>
          <div className="rq-f-mrow">
            <span className="rq-f-mlab">Subject</span>
            <span className="rq-f-msub" {...(writing ? { "data-type": "1" } : {})}>{hasMail ? EMAIL.subject : ""}</span>
          </div>
          <div className="rq-f-mbody">
            {EMAIL.body.map((l, i) => (
              <div className="rq-f-mline" key={i}
                {...(writing ? { "data-type": "1", style: { "--d": `${i * 180}ms` } as React.CSSProperties } : {})}>
                {hasMail ? l : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    );

  /* ---------------------------------------------------------- phone view */

  if (phone) {
    const board = (
      <>
        <div className="rq-fp-stages">
          {COLUMNS.map((c) => (
            <div className="rq-fp-stage" key={c.key}>
              <b>{c.base + s.board[c.key].length}</b><span>{c.label}</span>
            </div>
          ))}
        </div>
        {s.feed && st === "detect2" ? (
          <div className="rq-fp-line rq-f-done">
            <span className="rq-f-dtag" style={{ fontSize: 9 }}><i />New role detected · 1 minute ago</span>
          </div>
        ) : (
          <div className="rq-fp-line rq-f-done">
            <LogoBox job={s.board.applied[0]} size={28} />
            <span className="rq-fp-btext" style={{ paddingTop: 4 }}>
              {s.board.applied[0].title} · {s.board.applied[0].company}
            </span>
          </div>
        )}
      </>
    );

    // The opening beats belong to the jobs screen, not the board. Showing the
    // board here would put "143 applied" on screen before anything has been
    // applied, and give away the ending in the first second.
    const queue = (
      <>
        <div className="rq-fp-eyebrow">New matches</div>
        {[FEATURED, ...QUEUE.slice(0, 2)].map((j, i) => (
          <div className="rq-fp-qrow" key={j.key} style={{ opacity: i <= IDX[st] ? 1 : 0 }}>
            <LogoBox job={j} size={28} />
            <span className="rq-fp-qtitle">{j.title} · {j.company}</span>
            <span className="rq-fp-match">{j.match}%</span>
          </div>
        ))}
      </>
    );

    /* The same question the desktop variant asks, so both variants tell one
       story. It takes the whole body rather than sitting under the stage counts,
       which needed 120px of a 112px window; the counts are back one beat later.
       No hover states: there is no cursor on the phone, and faking one would
       show a pointer a phone does not have. The press on Yes is real, because
       that beat is the answer being given. */
    const askBlock = (
      <div className="rq-fp-ask rq-fp-ask-solo">
        <span className="rq-fp-ask-q">Turn on <b>Send without asking?</b></span>
        <span className="rq-fp-ask-row">
          <span className="rq-fp-ask-btn rq-fp-ask-no">No</span>
          <span className={cx("rq-fp-ask-btn rq-fp-ask-yes", st === "askClick" && "rq-f-press")}>Yes</span>
        </span>
      </div>
    );

    const bodyPhone =
      ASK.includes(st) ? askBlock :
      IDX[st] < IDX["jdScan"] ? queue :
      stage === "resume" ? (
        <>
          <div className="rq-fp-eyebrow">
            From the posting
            {keysLit > 0 && <em>{keysLit > 1 ? "user research" : "product specs"}</em>}
          </div>
          {BULLETS.slice(0, 2).map((b, i) => {
            const done = i < written;
            const active = i === written - 1 && (st === "tailor1" || st === "tailor2");
            return (
              <div className={cx("rq-fp-line", done && "rq-f-done")} key={i}>
                <span className="rq-fp-dot" />
                <span className="rq-fp-btext" {...(active ? { "data-type": "1" } : {})}>
                  {done && b.after
                    ? b.after.map((x, j) => (x.hi ? <em key={j}>{x.t}</em> : <span key={j}>{x.t}</span>))
                    : b.before}
                </span>
              </div>
            );
          })}
        </>
      ) : stage === "form" ? (
        <>
          <div className="rq-fp-eyebrow">Their application form</div>
          {/* the desktop fills six fields two at a time; three fields taking two
              at a time would leave fill3 with nothing left to do, so here each
              beat fills exactly one */}
          {FIELDS.slice(0, 3).map((f, i) => {
            const shown = Math.ceil(filled / 2);
            const on = i < shown;
            const justNow = on && filling && i === shown - 1;
            return (
              <div className="rq-fp-frow" key={f.label}>
                <span className="rq-fp-flabel">{f.label}</span>
                <span className="rq-fp-fval" {...(justNow ? { "data-type": "1" } : {})}>{on ? f.value : ""}</span>
              </div>
            );
          })}
        </>
      ) : stage === "email" ? (
        <>
          <div className="rq-fp-mrow">
            <span className="rq-fp-mlab">To</span>
            <span className="rq-fp-mval" {...(opening ? { "data-type": "1" } : {})}>{EMAIL.to} · {EMAIL.meta}</span>
          </div>
          <div className="rq-fp-mrow">
            <span className="rq-fp-mlab">Subject</span>
            <span className="rq-fp-mval" {...(writing ? { "data-type": "1" } : {})}>{hasMail ? EMAIL.subject : ""}</span>
          </div>
          <div className="rq-fp-mbody" {...(writing ? { "data-type": "1" } : {})}>
            {/* the whole message, clamped, so it reads as a real email being
                written rather than a sentence that stops mid-clause */}
            {hasMail ? EMAIL.body.join(" ") : ""}
          </div>
        </>
      ) : board;

    return (
      <div ref={root} className="rq-f-root rq-fp" data-step={st} role="img"
      aria-label="Litos tailoring a resume to a job, filling the application, and tracking the result.">
        <div className="rq-fp-job">
          <LogoBox job={FEATURED} size={36} />
          <div className="rq-fp-jobmid">
            <div className="rq-fp-title">{FEATURED.title}</div>
            <div className="rq-fp-sub">{FEATURED.company} · {FEATURED.location}</div>
          </div>
          <span className="rq-fp-match">{FEATURED.match}% match</span>
        </div>

        <div className="rq-fp-body">{bodyPhone}</div>

        <div className="rq-fp-foot">
          {/* Same rule as the desktop footer: the working stage's slot IS the
              orb, and the tick replaces it on approval. This is also what earns
              the orb its place back here, having been removed when it sat beside
              the marks as a fourth one of them rather than as one of them. */}
          <span className="rq-f-steps">
            {(["resume", "form"] as const).map((name, i) => (
              <span className="rq-f-slot" key={name}>
                {i < approved
                  ? <Tick className="rq-f-stick" />
                  : name === stage && orbState
                    ? <Orb state={orbState} px={13} />
                    : <i className={cx(name === stage && "rq-f-on")} />}
              </span>
            ))}
          </span>
          {sent
            ? <span className="rq-fp-sent">Sent 19:42:31</span>
            : stage && (
              <span className={cx("rq-fp-act", !action && "rq-f-act-wait")} aria-disabled={!action}
                style={{ transform: `scale(${st.endsWith("Click") ? 0.94 : 1})` }}>
                {STAGE_ACTION[stage]}
              </span>
            )}
        </div>
      </div>
    );
  }

  const jobsScreen = (
    <div className={cx("rq-f-page-inner", prev.current.page !== s.page && "rq-f-anim")}>
      <div className="rq-f-phead">
        <div className="rq-f-head-left"><div className="rq-f-ptitle">Jobs</div></div>
        <span className="rq-f-newpill">3 new today</span>
      </div>
      <div className="rq-f-joblist">
        {jobRow(JOBS[0], 0)}
        {packetOpen ? (
          <div className={cx("rq-f-packet", !prev.current.packet && "rq-f-anim")}>
            <div className="rq-f-packet-body" data-stage={stage}>{scene}</div>
            <div className="rq-f-packet-foot">
              {/* Each stage owns one slot. While the stage is working the slot IS
                  the orb, so the thing that is thinking sits exactly where its
                  tick will land; the tick replaces it once the person approves.
                  Fixed-width slots, or the row would jitter as 18px bars, 14px
                  orbs and 13px ticks swapped places. */}
              <span className="rq-f-steps">
                {(["resume", "form"] as const).map((name, i) => (
                  <span className="rq-f-slot" key={name}>
                    {i < approved
                      ? <Tick className="rq-f-stick" />
                      : name === stage && orbState
                        ? <Orb state={orbState} px={16} />
                        : <i className={cx(name === stage && "rq-f-on")} />}
                  </span>
                ))}
              </span>
              {sent
                ? <span className="rq-f-sent-note">Sent 19:42:31</span>
                : stage && (
                  /* Present for the whole stage, not just its two action beats,
                     so the button the work is heading towards is visible while
                     the work happens. Grey until the artifact is actually
                     finished; `action` is truthy only on those beats. */
                  <span ref={actBtn} className={cx("rq-f-act-pill", !action && "rq-f-act-wait")}
                    aria-disabled={!action}
                    style={{ transform: `scale(${st.endsWith("Click") ? 0.94 : 1})` }}>
                    {STAGE_ACTION[stage]}
                  </span>
                )}
            </div>
          </div>
        ) : JOBS.slice(1).map((j, i) => jobRow(j, i + 1))}
      </div>
      {!packetOpen && <div className="rq-f-joblistfoot">Matched to your resume</div>}
    </div>
  );

  const feedSlot = st === "detect2" && s.feed ? (
    <div className="rq-f-dcard rq-f-anim" data-flip={s.feed.key}>
      <LogoBox job={s.feed} size={36} />
      <div className="rq-f-jobmid">
        <div className="rq-f-jobtop"><span className="rq-f-jobtitle">{s.feed.title}</span></div>
        <div className="rq-f-jobsub">{s.feed.company} · {s.feed.location}</div>
      </div>
      <span className="rq-f-dtag"><i />New role detected · 1 minute ago</span>
    </div>
  ) : s.feed ? (
    <div className={cx("rq-f-feedcard", prev.current.feed !== s.feed.key && "rq-f-anim")} data-flip={s.feed.key}>
      <LogoBox job={s.feed} size={36} />
      <div className="rq-f-jobmid">
        <div className="rq-f-jobtop">
          <span className="rq-f-jobtitle">{s.feed.title}</span>
          <span className="rq-f-matchbadge">{s.feed.match}% match</span>
        </div>
        <div className="rq-f-jobsub">{s.feed.company} · {s.feed.location}</div>
      </div>
      <div className="rq-f-btnslot rq-f-sm">
        <span className="rq-f-pill rq-f-pill-queued" style={{ opacity: isApplying ? 0 : 1 }}>Queued</span>
        <span className="rq-f-pill rq-f-pill-applying" style={{ opacity: isApplying ? 1 : 0 }}>
          {isApplying && <Orb state="working" px={14} />}
          <span className="rq-f-sendlab">Sending <Countdown since={since} />s</span>
        </span>
      </div>
    </div>
  ) : s.autopilot ? (
    <div className={cx("rq-f-scanbox", !prev.current.scanning && "rq-f-anim")}>
      <Orb state="searching" px={16} /><span>Looking for your next match…</span>
    </div>
  ) : null;

  const appsScreen = (
    <div className={cx("rq-f-page-inner", prev.current.page !== s.page && "rq-f-anim")}>
      <div className="rq-f-phead">
        <div className="rq-f-head-left"><div className="rq-f-ptitle">Applications</div></div>
        {s.autopilot && <span className="rq-f-autoon">Auto-submit on</span>}
      </div>

      {/* The question, asked once, where the toggle used to sit.
          A settings switch made turning auto-submit on look like a thing the
          product does quietly; asking makes it a decision the person takes,
          which is what actually happens and what the Guardrails promise.

          A popover rather than a centred modal with a scrim: the beat right
          before this one is the first application landing on the board and
          flashing, and a scrim would hide the very thing the demo just earned.
          Nothing is dimmed, so both read at once. */}
      {/* askClick is kept in the condition on purpose: autopilot flips true in
          that same beat, so gating on autopilot alone unmounted the card on the
          very frame the click landed and the press never rendered. It leaves
          one beat later, once the answer has visibly been taken. */}
      {(!s.autopilot || st === "askClick") && s.page === "applications" && (
        <div className={cx("rq-f-ask", prev.current.page !== s.page && "rq-f-anim")} role="group">
          <span className="rq-f-ask-q">Turn on <b>Send without asking?</b></span>
          <span className="rq-f-ask-row">
            <span ref={noBtn} className={cx("rq-f-ask-btn rq-f-ask-no", st === "askNo" && "rq-f-hover")}>No</span>
            <span ref={yesBtn}
              className={cx("rq-f-ask-btn rq-f-ask-yes",
                (st === "askYes" || st === "askBack") && "rq-f-hover", st === "askClick" && "rq-f-press")}>Yes</span>
          </span>
        </div>
      )}
      <div className="rq-f-subrow">
        <span className="rq-f-label-mono">
          {s.autopilot
            ? <><Orb state="working" px={13} /><span>Sending for you · cancel any time</span></>
            : "Next best match"}
        </span>
        <span className="rq-f-todayline">
          <span className={cx("rq-f-todaynum", prev.current.today !== s.today && "rq-f-anim")}>{s.today}</span> applied today
        </span>
      </div>
      <div className="rq-f-feedzone"><div className="rq-f-feedbox">{feedSlot}</div></div>
      <div className="rq-f-board">
        {COLUMNS.map((c) => {
          const list = s.board[c.key];
          return (
            <div className="rq-f-col" key={c.key}>
              <div className="rq-f-colhead">
                <span className="rq-f-chip">{c.label}</span>
                <span className={cx("rq-f-colcount", prev.current.counts[c.key] !== list.length && "rq-f-anim")}>
                  {c.base + list.length}
                </span>
              </div>
              <div className="rq-f-colbody">
                <div className="rq-f-colinner">
                  {list.map((j) => (
                    <div className="rq-f-card" key={j.key} data-flip={j.key}>
                      <div className="rq-f-cardtop">
                        <LogoBox job={j} size={28} />
                        <div className="rq-f-cardmid">
                          <div className="rq-f-cardtitle">{j.title}</div>
                          <div className="rq-f-cardco">{j.company}</div>
                        </div>
                      </div>
                      <div className="rq-f-cardago">{j.ago}</div>
                    </div>
                  ))}
                  {list.length === 0 && <div className="rq-f-colempty">Nothing here</div>}
                </div>
                <div className="rq-f-colfade" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={root} className={cx("rq-f-root rq-f-mock", compact && "rq-f-compact")} data-step={st} role="img"
      aria-label="Litos finding a job, tailoring a resume to it, filling the application, and tracking the result.">
      <div className="rq-f-mock-glow" />
      <div className="rq-f-mock-frame">
        <div className="rq-f-titlebar">
          <div className="rq-f-dots">
            <span style={{ background: "#ff5f57" }} /><span style={{ background: "#febc2e" }} /><span style={{ background: "#28c840" }} />
          </div>
          <div className="rq-f-urlpill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span className="rq-f-urltext">
              trylitos.com<span className="rq-f-urlsuffix">/dashboard/{s.page}</span>
            </span>
          </div>
        </div>

        <div ref={bodyRef} className="rq-f-appbody" style={{ opacity: st === "fade" ? 0 : 1, transition: "opacity .55s ease-in-out" }}>
          <aside className="rq-f-side">
            <div className="rq-f-side-brand">
              {/* eslint-disable-next-line @next/next/no-img-element -- same mark, and same reason, as Header.tsx */}
              <img src="/brand/litos-mark.svg" alt="" /><span>Litos</span>
            </div>
            <nav className="rq-f-side-nav">
              <p className="rq-f-side-cap">Menu</p>
              <span className="rq-f-navaccent" />
              {NAV.map((n) => {
                const active = n.name === (s.page === "jobs" ? "Jobs" : "Applications");
                return (
                  <div key={n.name} ref={n.name === "Applications" ? navApps : undefined}
                    className={cx("rq-f-navitem", active && "rq-f-active")}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d={n.d} />
                    </svg>
                    <span>{n.name}</span>
                  </div>
                );
              })}
            </nav>
            <div className="rq-f-side-foot">
              <div className="rq-f-navitem">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg><span>Account</span>
              </div>
            </div>
            <div className="rq-f-side-user">
              <div className="rq-f-side-avatar">?</div>
              <div style={{ minWidth: 0, flex: 1 }}><p>Your account</p></div>
            </div>
          </aside>
          <div className="rq-f-main">
            {compact && (
              <div className="rq-f-tabs">
                {(["Jobs", "Applications"] as const).map((t) => (
                  <span key={t}
                    ref={t === "Applications" ? appsTab : undefined}
                    className={cx("rq-f-tab", (t === "Jobs") === (s.page === "jobs") && "rq-f-active")}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="rq-f-page" data-page={s.page}>
              {s.page === "jobs" ? jobsScreen : appsScreen}
            </div>
          </div>
        </div>
      </div>

      {!reduced.current && (st.endsWith("Click") || st === "click") && (
        <span key={`ripple-${st}-${s.stepIdx}`} className="rq-f-ripple" aria-hidden
          style={{ left: s.cursor.x - 14, top: s.cursor.y - 14 }} />
      )}

      {!reduced.current && (
        <div ref={cursorRef} className="rq-f-cursor" aria-hidden>
          <svg width="23" height="25" viewBox="0 0 23 25" fill="none" style={{ display: "block", filter: "drop-shadow(0 2px 5px rgba(18,18,15,.35))" }}>
            <path d="M3.5 1.5 L3.5 19.6 L8.2 15.6 L11 22.4 L14.6 20.9 L11.8 14.3 L18 13.7 Z" fill="#ffffff" stroke="#12120f" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
