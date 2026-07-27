"use client";

import { useEffect, useState } from "react";
import { STORE_URL } from "@/lib/config";
import { track } from "@/lib/analytics";

/* The film runs for roughly 15,000px between the hero card and the first
   interactive element in Outreach. For most of that stretch there was nothing
   to click: a viewer convinced at second four had to keep scrolling for half a
   minute to act on it, and the header pill retires on the way down by design
   (cinema chrome rule, Header.tsx).

   So: one quiet pill, bottom-right, that appears once the hero card is gone
   and stands down before the close section makes the same ask properly. It
   never competes with a real CTA on screen, and it is the only persistent
   chrome on the page.

   Reduced motion keeps it, without the slide. */
const SHOW_AFTER = 1600;
const HIDE_BEFORE_END = 2400;

export function StickyCTA() {
  const [inRange, setInRange] = useState(false);
  /* CalibrateCard owns the bottom-right corner and goes full-width on
     mobile. Two pieces of floating chrome in one corner reads as a bug, so
     this one stands down whenever that card or its pill is on screen. */
  const [calibrateBusy, setCalibrateBusy] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setInRange(y > SHOW_AFTER && y < max - HIDE_BEFORE_END);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const root = document.documentElement;
    const readCalibrate = () => {
      const p = root.dataset.calibrate;
      setCalibrateBusy(p === "card" || p === "pill");
    };
    readCalibrate();
    const mo = new MutationObserver(readCalibrate);
    mo.observe(root, { attributes: true, attributeFilter: ["data-calibrate"] });

    return () => {
      window.removeEventListener("scroll", onScroll);
      mo.disconnect();
    };
  }, []);

  const shown = inRange && !calibrateBusy;

  return (
    <div
      className={`rq-sticky-cta fixed bottom-5 left-5 z-30 transition-all duration-300 ease-out sm:bottom-7 sm:left-7 ${
        shown
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <a
        href={STORE_URL}
        onClick={() => track("install_click", { source: "sticky" })}
        aria-hidden={!shown}
        tabIndex={shown ? 0 : -1}
        className="flex min-h-[44px] items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-medium text-white shadow-[0_6px_24px_-8px_rgba(18,18,15,0.45)] transition-opacity hover:opacity-90"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="hidden sm:inline">Add to Chrome, it&apos;s free</span>
        <span className="sm:hidden">Add to Chrome</span>
      </a>
    </div>
  );
}
