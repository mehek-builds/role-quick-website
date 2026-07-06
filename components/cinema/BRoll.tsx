"use client";

import { useEffect, useRef } from "react";

/* A b-roll insert: one generated film shot dropped into a chapter, framed
   like the glass cards. Loads nothing until it nears the viewport
   (preload=none + IntersectionObserver), plays only while visible, and
   under reduced motion stays a still (the poster). The site-wide grain
   layer already sits over it; each shot carries its chapter's tint. */

const TINTS: Record<string, string> = {
  none: "rgba(255,255,255,0)",
  brand: "rgba(238,241,254,0.30)",
  teal: "rgba(234,245,240,0.30)",
  coral: "rgba(251,239,232,0.30)",
};

export function BRoll({
  src,
  poster,
  caption,
  tint = "none",
  className = "",
}: {
  src: string;
  poster: string;
  caption: string;
  tint?: keyof typeof TINTS;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.3 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <figure className={`rq-glass relative overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden
        className="block aspect-[21/9] w-full object-cover"
      />
      {/* chapter tint over the shot, same whisper as the film */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-multiply"
        style={{ backgroundColor: TINTS[tint] }}
        aria-hidden
      />
      {/* gentle vignette so the frame reads as film, not embed */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 45%, rgba(18,18,15,0) 64%, rgba(18,18,15,0.12) 100%)",
        }}
        aria-hidden
      />
      <figcaption className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
        {caption}
      </figcaption>
    </figure>
  );
}
