"use client";

import { useEffect, useRef, useState } from "react";

/* The pile, made visible: one faint mark per application, filling in once
   on scroll (run-once, reduced-motion safe). Exactly one mark is blue and
   lands last: yours, the tailored one. Color states what something is. */

const TOTAL = 250;
const YOURS = 162;

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
          const yours = i === YOURS;
          return (
            <span
              key={i}
              style={{
                transitionDelay: on ? `${yours ? TOTAL * 3 + 200 : i * 3}ms` : "0ms",
              }}
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                on ? "scale-100 opacity-100" : "scale-50 opacity-0"
              } ${yours ? "bg-brand" : "bg-border"}`}
            />
          );
        })}
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
        Yours, tailored to the posting
      </p>
    </div>
  );
}
