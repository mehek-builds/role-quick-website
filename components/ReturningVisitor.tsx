"use client";

import { useEffect, useState } from "react";

/* The film is a two-viewport opening act, and it runs identically on every
   visit. That is right the first time and a toll every time after: someone
   who already knows the pitch and came back to install had to scroll the
   whole thing again, or hunt for the skip link.

   So: remember that a visitor got past the opening, and on the next visit
   offer one jump straight to the product. Deliberately small, deliberately
   in the hero card rather than as an interstitial, and it never appears on
   a first visit, which is the one that the film is for.

   Same storage convention as CalibrateCard (litos.* keys, this browser
   only, no account, no server). */
const LS_SEEN = "litos.film.seen.v1";
const SEEN_AT = 1400;

export function ReturningVisitor() {
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(LS_SEEN) === "1";
    } catch {
      /* storage unavailable: behave as a first visit */
    }
    setReturning(seen);

    if (seen) return;
    const onScroll = () => {
      if (window.scrollY < SEEN_AT) return;
      try {
        localStorage.setItem(LS_SEEN, "1");
      } catch {}
      window.removeEventListener("scroll", onScroll);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!returning) return null;

  return (
    <a
      href="#formats"
      className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted transition-colors hover:border-ink hover:text-ink"
    >
      Welcome back · jump to the product ↓
    </a>
  );
}
