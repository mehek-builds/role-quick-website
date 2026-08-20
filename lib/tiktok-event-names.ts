/* Single source of truth for the TikTok server event names, imported by both
   the client dispatcher (lib/tiktok-client.ts), the server sender
   (lib/tiktok-events.ts), and the API route's allowlist (app/api/tiktok-event/
   route.ts) so the three can never drift out of sync. */
export const TIKTOK_SERVER_EVENTS = ["CompleteRegistration", "InitiateCheckout", "Purchase"] as const;
export type TikTokServerEventName = typeof TIKTOK_SERVER_EVENTS[number];
