"use client";

import { useEffect, useRef, useState } from "react";

/* Motion (DESIGN.md v1.1): calm movement only. Things settle into place,
   nothing loops for attention except the receipt. Reduced-motion users get
   everything instantly via the media query in globals.css. */

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [instant, setInstant] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Already in view at mount (deep link, scroll restoration, reload
    // mid-page): appear immediately: a settle the viewer never saw start
    // is just missing content.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setInstant(true);
      setShown(true);
      return;
    }

    // Pre-trigger half a viewport before entry so normal scrolling lands on
    // content already settling. If the first callback finds the element
    // already inside the real viewport (End key, anchor jump, fast flick),
    // the viewer is looking at it now, appear instantly instead.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (entry.boundingClientRect.top < window.innerHeight * 0.85) {
            setInstant(true);
          }
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px 50% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: instant ? undefined : `${delay}ms` }}
      className={`rq-reveal ${shown ? "rq-reveal-in" : ""} ${instant ? "rq-reveal-instant" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/* Starts at 80% of the target so a mid-scroll reader never catches a
   nonsense low value ("0 applications per corporate role"). */
export function CountUp({ to, duration = 900 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(Math.round(to * 0.8));
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setValue(to);
          return;
        }
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(Math.round(to * (0.8 + 0.2 * eased)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  return <span ref={ref}>{value}</span>;
}
