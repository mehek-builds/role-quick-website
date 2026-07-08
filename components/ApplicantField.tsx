"use client";

import { useEffect, useRef, useState } from "react";

/* The Glassdoor funnel, made visible: 250 marks fill in once on scroll,
   the six who get interviews darken after the sweep, and the one who gets
   the job lands last in blue. Run-once, reduced-motion safe. */

const TOTAL = 250;
const INTERVIEWS = [31, 78, 104, 139, 187, 226];
const HIRED = 162;

const SWEEP_MS = 3; // per-dot stagger during the fill
const SETTLE_MS = TOTAL * SWEEP_MS + 250; // when the six darken
const HIRE_MS = SETTLE_MS + 450; // when the one lands

export function ApplicantField() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="mx-auto mt-12 max-w-xl">
      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: TOTAL }).map((_, i) => {
          const hired = i === HIRED;
          const interview = INTERVIEWS.includes(i);
          const delay = hired ? HIRE_MS : interview ? SETTLE_MS : i * SWEEP_MS;
          return (
            <span
              key={i}
              style={{ transitionDelay: on ? `${delay}ms` : "0ms" }}
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                on ? "scale-100 opacity-100" : "scale-50 opacity-0"
              } ${hired ? "bg-brand" : interview ? "bg-muted" : "bg-border"}`}
            />
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-border" />
          250 apply
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-muted" />6 get
          interviews
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />1 gets the
          job
        </span>
      </div>
    </div>
  );
}
