"use client";

import { useEffect, useRef, useState } from "react";

/* The receipt, live (DESIGN.md motion v1.1: the one perpetually-moving
   element). A JS-driven state machine replaces the old CSS loop: each row
   "processes" with a cursor, then stamps in with its provenance thread.
   Completed rows are buttons that jump to their pillar section — the
   receipt is also the page's table of contents. Reduced-motion users get
   the finished packet, static. */

const STEPS = [
  { t: "19:42:07", label: "POSTING DETECTED", thread: "bg-border", hover: "hover:bg-surface-alt", target: null },
  { t: "19:42:11", label: "RESUME TAILORED", thread: "bg-brand", hover: "hover:bg-brand-soft/60", target: "documents" },
  { t: "19:42:14", label: "APPLICATION FILLED, 27 FIELDS", thread: "bg-teal", hover: "hover:bg-teal-soft/60", target: "autofill" },
  { t: "19:42:16", label: "OUTREACH DRAFTED, USC ALUM", thread: "bg-coral", hover: "hover:bg-coral-soft/60", target: "outreach" },
];

const PROCESS_MS = 850;
const GAP_MS = 450;
const HOLD_MS = 4200;

export function PacketDemo() {
  // -1 = nothing yet; 0..3 = that step is processing; 4 = done, holding.
  const [phase, setPhase] = useState(-1);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setPhase(STEPS.length);
      return;
    }
    let cancelled = false;
    const advance = (next: number) => {
      if (cancelled) return;
      setPhase(next);
      if (next === -1) {
        timer.current = setTimeout(() => advance(0), GAP_MS);
      } else if (next < STEPS.length) {
        timer.current = setTimeout(() => advance(next + 1), PROCESS_MS + GAP_MS);
      } else {
        timer.current = setTimeout(() => advance(-1), HOLD_MS);
      }
    };
    advance(-1);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const done = phase >= STEPS.length;

  function jump(target: string | null) {
    if (!target) return;
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-[20px] border border-border bg-surface text-left transition-shadow duration-300 hover:shadow-[0_16px_48px_-24px_rgba(18,18,15,0.25)]">
      <div className="flex items-baseline justify-between border-b border-border px-6 py-4">
        <span className="text-sm font-medium text-ink">
          Software Engineer Intern <span className="font-normal text-muted">· Notion</span>
        </span>
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Packet
        </span>
      </div>

      <div className="grid px-3 py-3">
        {STEPS.map((step, i) => {
          const state = phase > i || done ? "done" : phase === i ? "active" : "pending";
          const clickable = state === "done" && step.target !== null && !reduced;
          const Row = clickable ? "button" : "div";
          return (
            <Row
              key={step.t}
              onClick={clickable ? () => jump(step.target) : undefined}
              title={clickable ? "See how" : undefined}
              className={`grid grid-cols-[86px_1fr_auto] items-center gap-4 rounded-xl px-3 py-2 text-left font-mono text-[12.5px] transition-all duration-500 ${
                state === "pending" ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
              } ${clickable ? `cursor-pointer ${step.hover}` : ""}`}
            >
              <span className="text-faint">{state === "active" ? "" : step.t}</span>
              <span className="tracking-[0.02em] text-ink">
                {state === "active" ? (
                  <span className="text-muted">
                    {step.label.split(",")[0].split(" ").slice(0, 2).join(" ")}
                    <span className="rq-blink ml-0.5 inline-block w-[7px] text-ink">▍</span>
                  </span>
                ) : (
                  step.label
                )}
              </span>
              {state === "active" ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint" />
              ) : (
                <span className={`h-0.5 w-5 rounded-full ${step.thread}`} />
              )}
            </Row>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border px-6 py-3.5">
        <span
          className={`font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-500 ${
            done ? "text-teal-ink" : "text-faint"
          }`}
        >
          {done ? "Ready for your review" : "Assembling packet"}
          {!done && <span className="rq-blink ml-1 inline-block">▍</span>}
        </span>
        <span
          className={`font-mono text-[11px] tracking-[0.08em] text-faint transition-opacity duration-500 ${
            done ? "opacity-100" : "opacity-0"
          }`}
        >
          9 SECONDS
        </span>
      </div>
    </div>
  );
}
