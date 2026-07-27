"use client";

import { useEffect, useState } from "react";

/* Three consecutive pinned acts (documents, autofill, outreach) each hold
   the viewport for roughly two screens of scrolling. Pinning is the point,
   but it breaks the one feedback loop a scroller relies on: scroll input
   stops mapping to visible movement, and "held deliberately" and "stuck"
   look identical from the outside.

   A one-pixel hairline across the top costs nothing visually and restores
   that loop. It is the same ink as the section rail, and it hides under
   reduced motion, where the pins collapse anyway. */
export function ScrollProgress() {
  const [p, setP] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onMq = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onMq);

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (reduced) return null;

  return (
    <div
      className="rq-progress pointer-events-none fixed inset-x-0 top-0 z-40 h-px"
      aria-hidden
    >
      <div
        className="h-full origin-left bg-ink/25"
        style={{ transform: `scaleX(${p})` }}
      />
    </div>
  );
}
