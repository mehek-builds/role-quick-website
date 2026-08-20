import { after, NextRequest, NextResponse } from "next/server";
import { sendTikTokServerEvent } from "@/lib/tiktok-events";
import { TIKTOK_SERVER_EVENTS, type TikTokServerEventName } from "@/lib/tiktok-event-names";
import { SITE_URL } from "@/lib/config";

const ALLOWED_EVENTS = new Set<TikTokServerEventName>(TIKTOK_SERVER_EVENTS);
const ALLOWED_PROPERTY_KEYS = new Set(["plan_id", "value", "currency"]);

/* This route has no session/auth of its own -- it exists purely to keep
   TIKTOK_ACCESS_TOKEN off the client, not to gate who can claim a conversion
   happened. The origin check + rate limit below are the only things standing
   between an open POST endpoint and someone scripting fabricated Purchase
   events into TikTok's Events API. Neither is airtight (Origin/Referer are
   client-supplied and the counter is in-memory per warm instance, same
   caveat as app/api/try/route.ts's), but together they rule out the trivial
   curl-from-anywhere case that costs nothing to block. */
const allowedOrigins = new Set([SITE_URL, SITE_URL.replace("://", "://www.")]);
if (process.env.NODE_ENV !== "production") allowedOrigins.add("http://localhost:3000");

const IP_LIMIT = 30; // conversion events per IP per day; real traffic is a handful per visitor
const counters = new Map<string, { n: number; day: string }>();

function bump(key: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const cur = counters.get(key);
  if (!cur || cur.day !== day) {
    counters.set(key, { n: 1, day });
    return true;
  }
  if (cur.n >= IP_LIMIT) return false;
  cur.n += 1;
  return true;
}

export async function POST(request: NextRequest) {
  /* A real browser fetch() always sends Origin on a POST, same-site or not --
     this has been true across Chrome/Firefox/Safari for years, since Origin is
     tied to the request method, not to cross-origin-ness. So treating a MISSING
     Origin as suspicious (not just a mismatched one) is what actually closes
     the curl-with-no-headers case; allowing anything through when the header is
     merely absent would defeat the point of checking it at all. */
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!bump(ip)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

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

  /* after() lets the response return immediately while the outbound TikTok
     call finishes in the background -- every caller (lib/tiktok-client.ts)
     fire-and-forgets this route and never reads its response, so there is
     nothing to gain by holding the invocation open for the round trip. */
  after(() => sendTikTokServerEvent({ event: event as TikTokServerEventName, eventId, properties }));
  return NextResponse.json({ ok: true });
}
