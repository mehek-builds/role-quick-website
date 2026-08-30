"use client";

import type { TikTokServerEventName } from "./tiktok-event-names";
import { TIKTOK_US_PIXEL_CODE } from "./tiktok-pixel";

export type { TikTokServerEventName };

declare global {
  interface Window {
    ttq?: {
      instance(pixelCode: string): {
        track(event: TikTokServerEventName, properties?: Record<string, unknown>): void;
      };
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

/* Fires the US advertiser account's browser pixel explicitly. window.ttq is
   undefined when the pixel never loaded (ad blockers or consent tools), which
   is a no-op. */
export function trackTikTokPixelEvent(
  event: TikTokServerEventName,
  eventId: string,
  properties?: Record<string, string | number>,
) {
  try {
    window.ttq?.instance(TIKTOK_US_PIXEL_CODE).track(event, { ...properties, event_id: eventId });
  } catch {
    /* analytics must never break the funnel */
  }
}
