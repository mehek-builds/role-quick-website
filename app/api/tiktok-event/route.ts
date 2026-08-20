import { NextRequest, NextResponse } from "next/server";
import { sendTikTokServerEvent, type TikTokServerEventName } from "@/lib/tiktok-events";

const ALLOWED_EVENTS = new Set<TikTokServerEventName>(["CompleteRegistration", "InitiateCheckout", "Purchase"]);
const ALLOWED_PROPERTY_KEYS = new Set(["plan_id", "value", "currency"]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const event = body?.event;
  const eventId = body?.event_id;

  if (typeof event !== "string" || !ALLOWED_EVENTS.has(event as TikTokServerEventName)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (typeof eventId !== "string" || eventId.length === 0 || eventId.length > 128) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const properties: Record<string, string | number> = {};
  if (body?.properties && typeof body.properties === "object") {
    for (const key of ALLOWED_PROPERTY_KEYS) {
      const value = (body.properties as Record<string, unknown>)[key];
      if (typeof value === "string" || typeof value === "number") properties[key] = value;
    }
  }

  await sendTikTokServerEvent({ event: event as TikTokServerEventName, eventId, properties });
  return NextResponse.json({ ok: true });
}
