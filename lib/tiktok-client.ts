"use client";

import type { TikTokServerEventName } from "./tiktok-event-names";
import { TIKTOK_ADS_PIXEL_CODES } from "./tiktok-pixel";

export type { TikTokServerEventName };

declare global {
  interface Window {
    ttq?: {
      instance(pixelCode: string): {
        page(): void;
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

/* Fires both advertiser accounts' browser pixels with the same event ID. Each
   account can therefore optimize independently, while a single account still
   deduplicates its browser and Events API copies. window.ttq is undefined when
   the pixel never loaded (ad blockers or consent tools), which is a no-op. */
export function trackTikTokPixelEvent(
  event: TikTokServerEventName,
  eventId: string,
  properties?: Record<string, string | number>,
) {
  try {
    for (const pixelCode of TIKTOK_ADS_PIXEL_CODES) {
      window.ttq?.instance(pixelCode).track(event, { ...properties, event_id: eventId });
    }
  } catch {
    /* analytics must never break the funnel */
  }
}

type PurchaseReceipt = { reference: string | null; amount_cents: number; currency: string };

/* Shared by every place Purchase can fire client-side (app/billing/return/page.tsx's
   website branch, components/start/NotificationsStep.tsx). Keys the sessionStorage
   dedupe (and the TikTok event id) on the receipt's own reference whenever one is
   available -- litos-api's Stripe-webhook fallback (litos-backend's
   lib/tiktokEvents.ts) builds the exact same id from the same underlying value
   (provider_checkout_id's last 12 characters), so TikTok's own event-id dedup
   collapses the case where both the client and the server-side fallback fire for
   one purchase.

   fallbackKey is optional: a caller with no receipt yet and nothing unique to key
   on (unlike app/billing/return/page.tsx, which always has the checkout's own
   "context") should pass nothing and let this no-op rather than dedupe on a
   non-unique placeholder, which would silently drop a second real purchase. */
export function firePurchaseEventOnce(
  purchaseSentRef: { current: boolean },
  receipt: PurchaseReceipt | null,
  fallbackKey?: string,
) {
  const dedupeId = receipt?.reference ?? fallbackKey;
  if (!dedupeId) return;
  const purchaseKey = `litos_tiktok_purchase_sent:${dedupeId}`;
  if (purchaseSentRef.current || window.sessionStorage.getItem(purchaseKey) === "1") return;
  purchaseSentRef.current = true;
  window.sessionStorage.setItem(purchaseKey, "1");
  const purchaseEventId = `purchase:${dedupeId}`;
  const purchaseProperties = receipt
    ? { value: receipt.amount_cents / 100, currency: receipt.currency }
    : undefined;
  sendTikTokEvent("Purchase", purchaseEventId, purchaseProperties);
  trackTikTokPixelEvent("Purchase", purchaseEventId, purchaseProperties);
}
