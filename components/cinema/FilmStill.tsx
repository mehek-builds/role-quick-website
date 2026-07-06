/* A washed still from the film behind a section: the studio never leaves.
   Server-rendered <img> (frames are tiny webps already in cache from the
   scrub) under a white veil that keeps text at body-copy contrast and
   feathers the still into the adjacent chapters. The img carries
   data-parallax so CinematicPage drifts it like every other plate. */

export function FilmStill({
  frame,
  opacity = 0.25,
  flip = false,
}: {
  frame: number;
  opacity?: number;
  flip?: boolean;
}) {
  const src = `/film/frame-${String(frame).padStart(4, "0")}.webp`;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        data-parallax="14"
        className={`h-full w-full scale-110 object-cover ${flip ? "-scale-x-110" : ""}`}
        style={{ opacity }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0.3)_22%,rgba(255,255,255,0.3)_78%,rgba(255,255,255,0.92)_100%)]" />
    </div>
  );
}
