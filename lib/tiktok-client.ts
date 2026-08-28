"use client";

import type { TikTokServerEventName } from "./tiktok-event-names";

export type { TikTokServerEventName };

declare global {
  interface Window {
    ttq?: {
      track(event: TikTokServerEventName, properties?: Record<string, unknown>): void;
    };
  }
}

/* Fire-and-forget POST to our own /api/tiktok-event route, which holds the
   TikTok access token server-side and forwards to TikTok's Events API. Never
   blocks or throws into the caller, matching the analytics.ts convention.
   keepalive matters here: every call site fires right before a
   router.replace/location.assign navigation, which would otherwise cancel
   the in-flight request. */
export function sendTikTokEvent(
  event: TikTokServerEventName,
  eventId: string,
  properties?: Record<string, string | number>,
) {
  try {
    void fetch("/api/tiktok-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, event_id: eventId, properties }),
      keepalive: true,
    });
  } catch {
    /* analytics must never break the funnel */
  }
}

/* Fires the browser pixel's own track() call (app/layout.tsx's ttq.load),
   passing the same event_id as the paired sendTikTokEvent call so TikTok
   dedupes pixel + Events API into one conversion instead of double-counting.
   window.ttq is undefined when the pixel never loaded (ad blockers, consent
   tools) -- that's a no-op, not an error. */
export function trackTikTokPixelEvent(
  event: TikTokServerEventName,
  eventId: string,
  properties?: Record<string, string | number>,
) {
  try {
    window.ttq?.track(event, { ...properties, event_id: eventId });
  } catch {
    /* analytics must never break the funnel */
  }
}
