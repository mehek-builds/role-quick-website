import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

/* The contact route. Everything about the destination lives on the server:
 * CONTACT_INBOX is read here and never reaches the client, the page imports
 * nothing from this file, and the form posts to a path rather than to an
 * address. So there is no mailto: in the markup for a scraper to harvest, which
 * is the whole reason this exists rather than a link.
 *
 * Hardening mirrors app/api/try/route.ts, which already solved the same problem
 * for the demo: honeypot, per-IP daily cap, size cap, and pasted text treated
 * strictly as data. A public form that emails someone is a spam relay if any of
 * those are missing.
 */

const INBOX = process.env.CONTACT_INBOX ?? "mehekbuilds@gmail.com";
/* Resend's shared sender works with no DNS setup, which matters because this
   has to function before anyone configures a domain. Swap to a verified domain
   when there is one; deliverability improves and it stops looking forwarded. */
const FROM = process.env.CONTACT_FROM ?? "Litos contact <onboarding@resend.dev>";

const MAX_BYTES = 8_000;
const IP_LIMIT = 10; // messages per IP per day

/* The reasons a person actually writes in. Kept server-side as the source of
   truth and validated against, so a crafted POST cannot inject an arbitrary
   subject line into the inbox. */
export const REASONS = [
  "Something is not working",
  "Refund request",
  "Billing question",
  "Career centre or university",
  "Privacy or my data",
  "Something else",
] as const;

const counters = new Map<string, { n: number; day: string }>();

function bump(key: string, limit: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const cur = counters.get(key);
  if (!cur || cur.day !== day) {
    counters.set(key, { n: 1, day });
    return true;
  }
  if (cur.n >= limit) return false;
  cur.n += 1;
  return true;
}

function clean(s: unknown, max: number): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: "That message is too long." }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Could not read that." }, { status: 400 });
  }

  /* Honeypot: a real person never fills a field they cannot see. Answered with
     a 200 on purpose, so a bot learns nothing from the response. */
  if (clean(body.company, 200)) {
    return NextResponse.json({ ok: true });
  }

  const name = clean(body.name, 120);
  const email = clean(body.email, 200);
  const reason = clean(body.reason, 80);
  const message = clean(body.message, 5_000);

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "Name, email and a message are all needed." },
      { status: 400 },
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That email address looks wrong." }, { status: 400 });
  }
  if (!(REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: "Pick a reason." }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!bump(`ip:${ip}`, IP_LIMIT)) {
    return NextResponse.json(
      { error: "That is a lot of messages from one place today. Try tomorrow." },
      { status: 429 },
    );
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    /* Loud, not silent. A contact form that quietly drops mail is worse than no
       contact form: the sender believes they have been heard. Tell them the
       truth and log it so the missing key is visible. */
    console.error("[contact] RESEND_API_KEY is not set; message was NOT delivered", {
      reason,
      from: email,
    });
    return NextResponse.json(
      { error: "We could not send that just now. Please try again shortly." },
      { status: 503 },
    );
  }

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [INBOX],
      replyTo: email,
      subject: `Litos: ${reason}`,
      text: [
        `Reason:  ${reason}`,
        `Name:    ${name}`,
        `Email:   ${email}`,
        "",
        message,
      ].join("\n"),
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("[contact] send failed", e);
    return NextResponse.json(
      { error: "We could not send that just now. Please try again shortly." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
