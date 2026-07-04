"use client";

import { useEffect, useRef } from "react";

/* Ambient, reactive hero background: a whisper dot grid plus one soft brand
   glow that follows the pointer (lerped, never jumpy). Reactive-to-you, not
   looping-for-attention, which keeps it inside the motion law. Touch and
   reduced-motion users get a static centered glow. */

export function HeroBackdrop() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const glow = glowRef.current;
    if (!wrap || !glow) return;
    // Reduced-motion: static centered glow. (No coarse-pointer guard —
    // touch devices simply never fire mousemove, leaving the glow centered.)
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const parent = wrap.parentElement;
    if (!parent) return;
    wrap.dataset.live = "true";

    let targetX = 0.5;
    let targetY = 0.35;
    let x = targetX;
    let y = targetY;
    let raf = 0;

    // Out-of-bounds events simply don't move the target; the glow always
    // settles toward the last position seen inside the hero area.
    const onMove = (e: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      if (e.clientY < rect.top - 100 || e.clientY > rect.bottom + 100) return;
      targetX = (e.clientX - rect.left) / rect.width;
      targetY = (e.clientY - rect.top) / rect.height;
    };

    const tick = () => {
      x += (targetX - x) * 0.06;
      y += (targetY - y) * 0.06;
      glow.style.left = `${x * 100}%`;
      glow.style.top = `${y * 100}%`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrapRef} aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      {/* Dot grid, faded at the edges */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 75% 65% at 50% 38%, black 25%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 65% at 50% 38%, black 25%, transparent 78%)",
          opacity: 0.55,
        }}
      />
      {/* The glow that follows you */}
      <div
        ref={glowRef}
        className="absolute h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-[0.07] blur-[110px]"
        style={{ left: "50%", top: "35%" }}
      />
    </div>
  );
}
