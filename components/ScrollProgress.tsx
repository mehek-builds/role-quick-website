"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { normalizedScrollProgress } from "@/lib/scroll-progress";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onStoreChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function reducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function reducedMotionServerSnapshot() {
  // The progress bar stays absent until the browser can report the user's preference.
  return true;
}

/* Three consecutive pinned acts (documents, autofill, outreach) each hold
   the viewport for roughly two screens of scrolling. Pinning is the point,
   but it breaks the one feedback loop a scroller relies on: scroll input
   stops mapping to visible movement, and "held deliberately" and "stuck"
   look identical from the outside.

   A one-pixel hairline across the top costs nothing visually and restores
   that loop. It is the same ink as the section rail, and it hides under
   reduced motion, where the pins collapse anyway. */
export function ScrollProgress() {
  const reduced = useSyncExternalStore(
    subscribeToReducedMotion,
    reducedMotionSnapshot,
    reducedMotionServerSnapshot,
  );
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;

    let raf = 0;
    const paint = () => {
      raf = 0;
      const progress = normalizedScrollProgress(
        window.scrollY,
        document.documentElement.scrollHeight,
        window.innerHeight,
      );
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div
      className="rq-progress pointer-events-none fixed inset-x-0 top-0 z-40 h-px"
      aria-hidden
    >
      <div
        ref={barRef}
        className="h-full origin-left bg-ink/25"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
