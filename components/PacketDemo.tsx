"use client";

import { useEffect, useRef, useState } from "react";

/* The product, shown working (hero demo, second thing on the page): a job
   posting in a browser with the RoleQuick extension panel assembling the
   packet live. Finished artifacts become actionable Review rows that jump
   to their pillar section. Reduced-motion users get the finished scene. */

const ARTIFACTS = [
  {
    t: "19:42:11",
    label: "Resume tailored",
    sub: "Alex_Rivera_Notion_Resume.pdf",
    working: "Tailoring resume",
    action: "Review",
    thread: "bg-brand",
    ink: "text-brand-ink",
    hover: "hover:bg-brand-soft/60",
    target: "documents",
  },
  {
    t: "19:42:14",
    label: "Application filled",
    sub: "27 fields · nothing sent yet",
    working: "Filling application",
    action: "Review",
    thread: "bg-teal",
    ink: "text-teal-ink",
    hover: "hover:bg-teal-soft/60",
    target: "autofill",
  },
  {
    t: "19:42:16",
    label: "Outreach drafted",
    sub: "To Priya Nair · USC alum",
    working: "Drafting outreach",
    action: "Open",
    thread: "bg-coral",
    ink: "text-coral-ink",
    hover: "hover:bg-coral-soft/60",
    target: "outreach",
  },
];

const DETECT_MS = 1100;
const PROCESS_MS = 1000;
const GAP_MS = 350;
const HOLD_MS = 5000;

// phase: -2 idle start · -1 detecting · 0..2 artifact i processing · 3 done
export function PacketDemo() {
  const [phase, setPhase] = useState(-2);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setPhase(ARTIFACTS.length);
      return;
    }
    let cancelled = false;
    const advance = (next: number) => {
      if (cancelled) return;
      setPhase(next);
      const delay =
        next === -2 ? 500
        : next === -1 ? DETECT_MS
        : next < ARTIFACTS.length ? PROCESS_MS + GAP_MS
        : HOLD_MS;
      timer.current = setTimeout(
        () => advance(next >= ARTIFACTS.length ? -2 : next + 1),
        delay,
      );
    };
    advance(-2);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const done = phase >= ARTIFACTS.length;

  function jump(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-[20px] border border-border bg-surface shadow-[0_1px_2px_rgba(18,18,15,0.04),0_20px_48px_-24px_rgba(18,18,15,0.18)]">
      {/* Browser chrome */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </span>
        <span className="flex-1 rounded-full bg-surface-alt px-3 py-1 text-center font-mono text-[10px] text-faint">
          jobs.lever.co/notion/software-engineer-intern
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_340px]">
        {/* The posting underneath */}
        <div className="border-b border-border p-7 sm:border-b-0 sm:border-r">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Notion · San Francisco
          </p>
          <p className="mt-2 text-lg font-semibold tracking-tight text-ink">
            Software Engineer Intern
          </p>
          <div className="mt-5 space-y-2.5">
            <div className="h-1.5 w-11/12 rounded-full bg-surface-alt" />
            <div className="h-1.5 w-full rounded-full bg-surface-alt" />
            <div className="h-1.5 w-9/12 rounded-full bg-surface-alt" />
            <div className="h-1.5 w-10/12 rounded-full bg-surface-alt" />
            <div className="mt-5 h-1.5 w-4/12 rounded-full bg-border" />
            <div className="h-1.5 w-full rounded-full bg-surface-alt" />
            <div className="h-1.5 w-8/12 rounded-full bg-surface-alt" />
          </div>
          <span className="mt-7 inline-block rounded-full border border-border px-5 py-2 text-sm font-medium text-faint">
            Apply for this job
          </span>
        </div>

        {/* The extension panel (always present; only its rows cycle) */}
        <div className="p-5">
          <div className="rounded-[16px] border border-border bg-surface shadow-[0_8px_28px_-16px_rgba(18,18,15,0.25)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">
                  R
                </span>
                <span className="text-[13px] font-semibold tracking-tight text-ink">
                  RoleQuick
                </span>
              </span>
              <span className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
                {phase <= -1 ? (
                  <>
                    Scanning<span className="rq-blink">▍</span>
                  </>
                ) : done ? (
                  "Ready · 9 seconds"
                ) : (
                  "Posting detected"
                )}
              </span>
            </div>

            <div className="space-y-1 p-2.5">
              {ARTIFACTS.map((a, i) => {
                const state = done || phase > i ? "done" : phase === i ? "active" : "pending";
                if (state === "pending")
                  return (
                    <div key={a.t} className="h-[52px] rounded-xl border border-dashed border-border/70" />
                  );
                if (state === "active")
                  return (
                    <div
                      key={a.t}
                      className="flex h-[52px] items-center gap-3 rounded-xl bg-surface-alt/70 px-3"
                    >
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint" />
                      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted">
                        {a.working}
                        <span className="rq-blink ml-0.5">▍</span>
                      </span>
                    </div>
                  );
                return (
                  <button
                    key={a.t}
                    onClick={reduced ? undefined : () => jump(a.target)}
                    title="See how"
                    className={`flex h-[52px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left transition-colors ${a.hover}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`h-7 w-0.5 shrink-0 rounded-full ${a.thread}`} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-ink">{a.label}</span>
                        <span className="block truncate font-mono text-[10px] text-faint">
                          {a.sub}
                        </span>
                      </span>
                    </span>
                    <span className={`shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${a.ink}`}>
                      {a.action} →
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-border px-4 py-3">
              <span
                className={`block w-full rounded-full py-2 text-center text-[13px] font-medium transition-colors duration-500 ${
                  done
                    ? "bg-brand text-white"
                    : "border border-dashed border-border text-faint"
                }`}
              >
                {done ? "Review, then send" : "Assembling packet…"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
