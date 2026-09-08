"use client";

import type { TikTokServerEventName } from "./tiktok-event-names.ts";
import { TIKTOK_ADS_PIXEL_CODES } from "./tiktok-pixel.ts";
import { normalizeEmailForTikTok, tiktokPurchaseContentId } from "./tiktok-identity.ts";

export type { TikTokServerEventName };

/**
 * Settle an Advanced Matching lookup without ever letting it gate the thing it
 * decorates. Never rejects, and never outlives `ms`.
 *
 * Used by the onboarding notifications screen, which fetches /me for the Advanced
 * Matching email next to the receipt the Purchase actually needs. api() passes no
 * AbortSignal, so a plain await covers rejection but not latency: a hung /me would
 * hold the Purchase indefinitely on a screen whose Continue button a student can
 * click immediately. Matching is a bonus on top of the event; it must never be able
 * to cost the event.
 *
 * The billing return page needs no equivalent: its email comes from the /me it has
 * already loaded, so nothing extra is fetched there.
 */
export function matchingWithin<T>(promise: Promise<T>, ms = 1200): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

/** Raw (unhashed) Advanced Matching identifiers, as held by the signed-in client.
    Email only: see lib/tiktok-identity.ts for why phone is not sent at all. */
export type TikTokAdvancedMatching = { email?: string | null };

declare global {
  interface Window {
    ttq?: {
      instance(pixelCode: string): {
        page(): void;
        track(event: TikTokServerEventName, properties?: Record<string, unknown>): void;
        /* Takes PLAINTEXT and hashes internally. Passing an already-hashed value
           here would be hashed a second time and match nobody, which is why the
           browser path must never reuse the server path's SHA-256 helper. */
        identify(identifiers: { email?: string }): void;
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
  user?: TikTokAdvancedMatching,
) {
  try {
    void fetch("/api/tiktok-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      /* Identifiers travel to our OWN route in the clear and are hashed there:
         the Events API needs a SHA-256 digest we compute ourselves, and doing it
         in the browser would ship a hashing rule the server could not keep in
         step with. Nothing new is exposed -- this is the signed-in student's own
         address, sent same-origin over HTTPS. */
      /* Only when there is actually an identifier to carry. `user` is an object even
         when its email is null, so a bare truthiness check on it put `{"email":null}`
         on the wire for every unmatched event -- harmless (the route drops it) but it
         reads like an identifier was sent, which is the confusing thing to see when
         EMQ later fails to move. */
      body: JSON.stringify({
        event,
        event_id: eventId,
        properties,
        ...(user?.email ? { user } : {}),
      }),
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
  properties?: Record<string, unknown>,
  user?: TikTokAdvancedMatching,
) {
  try {
    const email = normalizeEmailForTikTok(user?.email) ?? undefined;
    for (const pixelCode of TIKTOK_ADS_PIXEL_CODES) {
      const instance = window.ttq?.instance(pixelCode);
      /* identify() must precede track(): it attaches the identifiers to the
         events that follow it on this instance, so calling it afterwards would
         leave this very Purchase unmatched. Skipped entirely when neither value
         normalized, rather than sent as an empty object. */
      if (email) {
        /* Its own try/catch, INSIDE the loop. window.ttq can be a partial stub -- a
           consent tool or blocker that defines track() but not identify() -- and the
           optional chain guards `instance`, not `identify`, so a missing or throwing
           identify would propagate to the outer catch and abort the loop BEFORE any
           track(). That would drop the Purchase for both pixels to gain matching on
           neither. Matching is the bonus; the event is the point. */
        try {
          instance?.identify({ email });
        } catch {
          /* Fall through to track() unmatched rather than losing the event. */
        }
      }
      instance?.track(event, { ...properties, event_id: eventId });
    }
  } catch {
    /* analytics must never break the funnel */
  }
}

type PurchaseReceipt = {
  reference: string | null;
  amount_cents: number;
  currency: string;
  plan?: string | null;
  interval?: string | null;
};

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
  /* Raw identifiers for Event Match Quality. Optional and best-effort by design:
     every caller fetches them alongside the receipt and passes whatever came
     back, so a failed lookup costs match quality but never the event itself. */
  advancedMatching?: TikTokAdvancedMatching,
) {
  const dedupeId = receipt?.reference ?? fallbackKey;
  if (!dedupeId) return;
  const purchaseKey = `litos_tiktok_purchase_sent:${dedupeId}`;
  if (purchaseSentRef.current || window.sessionStorage.getItem(purchaseKey) === "1") return;
  purchaseSentRef.current = true;
  window.sessionStorage.setItem(purchaseKey, "1");
  const purchaseEventId = `purchase:${dedupeId}`;
  const contentId = tiktokPurchaseContentId(receipt?.plan, receipt?.interval);
  const purchaseProperties = receipt
    ? {
      value: receipt.amount_cents / 100,
      currency: receipt.currency,
      ...(contentId ? { content_id: contentId, content_type: "product" } : {}),
    }
    : undefined;
  /* The pixel gets contents[] too, matching what /api/tiktok-event rebuilds for
     the server copy, so the browser and server reports of one purchase carry the
     same shape rather than diverging on the field TikTok actually reads. */
  const pixelProperties = purchaseProperties && contentId
    ? {
      ...purchaseProperties,
      contents: [{
        content_id: contentId,
        content_type: "product",
        quantity: 1,
        price: receipt!.amount_cents / 100,
      }],
    }
    : purchaseProperties;
  sendTikTokEvent("Purchase", purchaseEventId, purchaseProperties, advancedMatching);
  trackTikTokPixelEvent("Purchase", purchaseEventId, pixelProperties, advancedMatching);
}
