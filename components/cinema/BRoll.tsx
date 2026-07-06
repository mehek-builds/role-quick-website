"use client";

import { useEffect, useRef } from "react";

/* A b-roll shot dropped into a chapter. No frame, no glass, no shadow —
   the clip was shot in the same white studio as the page's film, so its
   edges feather to nothing (the Wash trick) and the footage reads as the
   storm gathering into a shot, not a video placed on top. Loads nothing
   until it nears the viewport (preload=none + IntersectionObserver),
   plays only while visible, and under reduced motion stays a still (the
   poster). The site-wide grain already sits over it; each shot carries
   its chapter's tint inside the same feather. */

const TINTS: Record<string, string> = {
  none: "rgba(255,255,255,0)",
  brand: "rgba(238,241,254,0.30)",
  teal: "rgba(234,245,240,0.30)",
  coral: "rgba(251,239,232,0.30)",
};

/* elliptical feather: full footage in the middle, gone at the edges */
const FEATHER =
  "radial-gradient(62% 88% at 50% 50%, rgba(0,0,0,1) 42%, rgba(0,0,0,0.55) 68%, rgba(0,0,0,0) 96%)";

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
    <figure className={`relative ${className}`}>
      <div
        className="relative"
        style={{ maskImage: FEATHER, WebkitMaskImage: FEATHER }}
      >
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
      </div>
      {/* machine caption in the page's citation voice, not a card label */}
      <figcaption className="mt-1 text-center font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        {caption}
      </figcaption>
    </figure>
  );
}
