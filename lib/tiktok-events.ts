/* Server-only. Never import this from a "use client" file: it reads
   TIKTOK_ACCESS_TOKEN, which must not reach the browser bundle. Client code
   calls the /api/tiktok-event route instead (see lib/tiktok-client.ts). */

import { type TikTokServerEventName } from "./tiktok-event-names";

const TIKTOK_PIXEL_CODE = "DA3DU3JC77U208UL6HS0";
const TIKTOK_EVENTS_ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";
const REQUEST_TIMEOUT_MS = 4_000;

export type { TikTokServerEventName };

export async function sendTikTokServerEvent(input: {
  event: TikTokServerEventName;
  eventId: string;
  properties?: Record<string, string | number>;
}): Promise<void> {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) return;

  const testEventCode = process.env.TIKTOK_TEST_EVENT_CODE;
  const body = {
    event_source: "web",
    event_source_id: TIKTOK_PIXEL_CODE,
    data: [
      {
        event: input.event,
        event_id: input.eventId,
        event_time: Math.floor(Date.now() / 1000),
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
