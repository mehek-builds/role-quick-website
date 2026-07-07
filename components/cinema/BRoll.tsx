"use client";

import { useEffect, useRef } from "react";

/* A b-roll shot dropped into a chapter, printed INTO the film rather than
   played over it: the video multiply-blends with the page, so the clip's
   white studio becomes the page itself (the wash and the storm beneath)
   and only the subject — pages, ink, shadows, colored highlights — paints
   on top of the continuous animation. The source clips are pre-processed
   (see public/broll/_orig for the originals): the studio backdrop is
   whitened to pure white, so it drops to nothing under multiply with no
   diagonal banding and no rectangular patch — only the resume floats. That
   means the full 16:9 frame can show (aspect-video, no crop) so the resume's
   own edges stay in view, and the feather only needs a gentle outer fade.

   IMPORTANT: blend modes are isolated by any transformed/filtered/opacity
   ancestor. BRoll must sit OUTSIDE Reveal and [data-parallax] wrappers or
   the multiply silently stops reaching the film. Loads nothing until near
   the viewport (preload=none + IntersectionObserver), plays only while
   visible; reduced motion stays a still (the poster, same blend). */

const FEATHER =
  "radial-gradient(86% 96% at 50% 50%, rgba(0,0,0,1) 74%, rgba(0,0,0,0) 100%)";

export function BRoll({
  src,
  poster,
  caption,
  className = "",
}: {
  src: string;
  poster: string;
  caption: string;
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
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden
        className="block aspect-video w-full object-cover"
        style={{
          maskImage: FEATHER,
          WebkitMaskImage: FEATHER,
          mixBlendMode: "multiply",
        }}
      />
      {/* machine caption in the page's citation voice */}
      <figcaption className="mt-1 text-center font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        {caption}
      </figcaption>
    </figure>
  );
}
