"use client";

import { useEffect, useRef } from "react";

/* Ambient hero background, three layers under the content:
   1. A whisper-opacity Gmail inbox filling up with application
     confirmations — the product's outcome as texture, not a screenshot.
   2. A white radial wash that clears the center so the headline and CTAs
     stay perfectly legible (clarity beats decoration, always).
   3. One soft brand glow that lerps toward the cursor. Reactive-to-you,
     never looping. Touch/reduced-motion users get it centered and static. */

/* Every subject reads unambiguously as a submission confirmation —
   "thank you for your interest" phrasing is banned here, it scans as a
   rejection opener. */
const INBOX = [
  { from: "LinkedIn", subject: "Your application to Software Engineer Intern at Google was sent", time: "11:58 AM", unread: true },
  { from: "Amazon Jobs", subject: "Application received: Software Development Engineer Intern", time: "11:57 AM", unread: true },
  { from: "Meta Careers", subject: "We've received your application to Meta", time: "11:56 AM", unread: false },
  { from: "Goldman Sachs", subject: "Application received: Summer Analyst", time: "11:55 AM", unread: true },
  { from: "Netflix Jobs", subject: "Your application has been received", time: "11:54 AM", unread: false },
  { from: "Spotify", subject: "We received your application: UX Design Intern", time: "11:53 AM", unread: true },
  { from: "Microsoft Careers", subject: "Application received: Business Analyst Intern", time: "11:52 AM", unread: false },
  { from: "LinkedIn", subject: "Your application to Software Engineer Intern at Stripe was sent", time: "11:51 AM", unread: true },
  { from: "Apple", subject: "We've received your application, Research Intern", time: "11:50 AM", unread: false },
];

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
      {/* 1. The inbox, as texture — fades out before the demo below */}
      <div
        className="absolute inset-x-0 top-0 opacity-[0.32]"
        style={{
          maskImage: "linear-gradient(to bottom, black 25%, transparent 90%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 25%, transparent 90%)",
        }}
      >
        {INBOX.map((m) => (
          <div
            key={m.time}
            className="flex items-center gap-4 border-b border-border/50 px-6 py-3 sm:px-10"
          >
            <span
              className={`w-32 shrink-0 truncate text-[12px] sm:w-44 ${
                m.unread ? "font-semibold text-muted" : "text-faint"
              }`}
            >
              {m.from}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-[12px] ${
                m.unread ? "font-medium text-muted" : "text-faint"
              }`}
            >
              {m.subject}
            </span>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand/60 text-[8px] font-semibold text-white">
              R
            </span>
            <span className="shrink-0 text-[11px] text-faint">{m.time}</span>
          </div>
        ))}
      </div>

      {/* 2. The clarity wash — clears the center for the headline and CTAs */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 58% at 50% 40%, var(--color-bg) 42%, transparent 100%)",
        }}
      />

      {/* 3. The glow that follows you */}
      <div
        ref={glowRef}
        className="absolute h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-[0.07] blur-[110px]"
        style={{ left: "50%", top: "35%" }}
      />
    </div>
  );
}
