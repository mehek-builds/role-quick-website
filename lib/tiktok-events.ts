/* Server-only. Never import this from a "use client" file: it reads
   TIKTOK_ACCESS_TOKEN, which must not reach the browser bundle. Client code
   calls the /api/tiktok-event route instead (see lib/tiktok-client.ts). */

import { createHash } from "node:crypto";
import { type TikTokServerEventName } from "./tiktok-event-names";
import { TIKTOK_US_PIXEL_CODE } from "./tiktok-pixel";
import { normalizeEmailForTikTok, normalizePhoneE164ForTikTok } from "./tiktok-identity";

const TIKTOK_EVENTS_ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";
const REQUEST_TIMEOUT_MS = 4_000;

export type { TikTokServerEventName };

/* The Events API does not hash for us the way the browser pixel's ttq.identify()
   does, so identifiers must arrive already SHA-256 hashed (lowercase hex).

   Verified 2026-09-08 that TikTok's API cannot confirm any of this: probes with a
   made-up user field, with the wrong key name, and with a plaintext unhashed email
   ALL returned `code: 0, "OK"`, and none appeared under Test Events' "Testing
   issues" filter. Only the Events Manager EMQ score and the pixel Diagnostics tab,
   both computed over real traffic with a lag, can confirm the fields landed. Never
   treat a code 0 as proof this works. */
function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function tiktokUserPayload(input: {
  email?: string | null;
  phone?: string | null;
  country?: string | null;
}): Record<string, string> {
  const user: Record<string, string> = {};
  const email = normalizeEmailForTikTok(input.email);
  if (email) user.email = sha256Hex(email);
  const phone = normalizePhoneE164ForTikTok(input.phone, input.country);
  if (phone) user.phone_number = sha256Hex(phone);
  return user;
}

export async function sendTikTokServerEvent(input: {
  event: TikTokServerEventName;
  eventId: string;
  properties?: Record<string, unknown>;
  /** Raw values; normalized and hashed here, never forwarded in the clear. */
  user?: { email?: string | null; phone?: string | null; country?: string | null };
}): Promise<void> {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) return;

  const testEventCode = process.env.TIKTOK_TEST_EVENT_CODE;
  const user = input.user ? tiktokUserPayload(input.user) : {};
  const body = {
    event_source: "web",
    event_source_id: TIKTOK_US_PIXEL_CODE,
    data: [
      {
        event: input.event,
        event_id: input.eventId,
        event_time: Math.floor(Date.now() / 1000),
        /* Omitted rather than sent as {} when nothing normalized: an empty user
           object is not a weaker signal, it is a malformed one. */
        ...(Object.keys(user).length > 0 ? { user } : {}),
        properties: input.properties ?? {},
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  /* Bounds the worst case: without this, a hanging TikTok API response holds
     the serverless invocation (which awaits this from the route handler,
     wrapped in next/server's after()) open indefinitely for a response
     nothing reads. */
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(TIKTOK_EVENTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": accessToken },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`[tiktok-events] ${input.event} rejected: ${response.status}`);
    }
  } catch (error) {
    console.error(`[tiktok-events] ${input.event} threw`, error);
  } finally {
    clearTimeout(timeout);
  }
}
