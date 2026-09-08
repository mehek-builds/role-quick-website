import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";

/* BEHAVIOURAL COVER FOR THE WHOLE ADVANCED MATCHING PATH.
 *
 * Written because a review proved the previous tests could not see this working at
 * all: four separate mutations that completely disabled Event Match Quality --
 * calling identify() with an empty object, dropping the identifiers on the way into
 * both senders, having the API route stop forwarding them, and sending the email as
 * PLAINTEXT instead of a SHA-256 digest -- every one of them left the full suite
 * green. The old guards pinned syntax (that `identify(` appears, and appears before
 * `track(`), never that a real address reaches TikTok in the right shape.
 *
 * That gap matters more here than in most places: TikTok's API returns
 * `code: 0, "OK"` for a made-up field name and for unhashed PII alike (probed
 * 2026-09-08), so a broken matching path is invisible in production too, except as
 * an EMQ score that quietly never improves. These tests are the only thing that
 * actually fails when it breaks.
 */

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function loadPixelClient({ identifyThrows = false } = {}) {
  const calls = { identify: [], track: [], fetches: [] };
  globalThis.window = {
    ttq: {
      instance: () => ({
        page: () => {},
        identify: (identifiers) => {
          calls.identify.push(identifiers);
          if (identifyThrows) throw new TypeError("identify is not a function");
        },
        track: (event, properties) => calls.track.push({ event, properties }),
      }),
    },
    sessionStorage: {
      store: new Map(),
      getItem(key) { return this.store.get(key) ?? null; },
      setItem(key, value) { this.store.set(key, value); },
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
  };
  globalThis.fetch = async (url, init) => {
    calls.fetches.push({ url, body: JSON.parse(String(init.body)) });
    return new Response("{}", { status: 200 });
  };
  /* One module instance for the file (node --test cannot cache-bust a stripped-type
     import), so each test uses its own receipt reference: firePurchaseEventOnce
     dedupes per reference in sessionStorage, which the stub resets per call. */
  const mod = await import("../lib/tiktok-client.ts");
  return { mod, calls };
}

test("the signed-in email reaches ttq.identify() and the server route, on a real Purchase", async () => {
  const { mod, calls } = await loadPixelClient();
  mod.firePurchaseEventOnce(
    { current: false },
    { reference: "ref123456789", amount_cents: 3999, currency: "USD", plan: "litos_plus", interval: "monthly" },
    undefined,
    { email: "  Student@Example.COM " },
  );

  // Browser pixel: PLAINTEXT and normalized, because the SDK hashes internally.
  // Hashing here as well would double-hash and match nobody.
  assert.equal(calls.identify.length, 2, "both advertiser pixels must be identified");
  for (const identifiers of calls.identify) {
    assert.equal(identifiers.email, "student@example.com");
  }
  assert.equal(calls.track.length, 2, "both pixels must still receive the Purchase");

  // Server route: the identifier must actually be forwarded, and content_id with it.
  assert.equal(calls.fetches.length, 1);
  const body = calls.fetches[0].body;
  assert.equal(body.user.email, "  Student@Example.COM ", "the route hashes; the client forwards raw");
  assert.equal(body.properties.content_id, "litos_plus_month");
  assert.equal(body.event, "Purchase");
});

test("no email means no identify() call at all, rather than an empty one", async () => {
  const { mod, calls } = await loadPixelClient();
  mod.firePurchaseEventOnce(
    { current: false },
    { reference: "ref987654321", amount_cents: 3999, currency: "USD", plan: "litos_plus", interval: "month" },
    undefined,
    { email: null },
  );
  // An empty identify is not a weaker signal, it is a malformed one.
  assert.equal(calls.identify.length, 0);
  assert.equal(calls.track.length, 2, "the Purchase still fires unmatched");
  assert.equal("user" in calls.fetches[0].body, false);
});

test("an identify() that throws cannot cost the Purchase on either pixel", async () => {
  /* window.ttq can be a partial stub from a consent tool or blocker: track defined,
     identify missing or throwing. Before the fix that aborted the loop before ANY
     track(), dropping the conversion for both pixels to gain matching on neither. */
  const { mod, calls } = await loadPixelClient({ identifyThrows: true });
  mod.firePurchaseEventOnce(
    { current: false },
    { reference: "refthrows1234", amount_cents: 3999, currency: "USD", plan: "litos_plus", interval: "month" },
    undefined,
    { email: "student@example.com" },
  );
  assert.equal(calls.track.length, 2, "both pixels must still get the Purchase");
});

test("the server-side sender hashes the email and never transmits it in the clear", async () => {
  process.env.TIKTOK_ACCESS_TOKEN = "tt_test_token";
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: String(init.body) });
    return new Response('{"code":0}', { status: 200 });
  };
  const { sendTikTokServerEvent } = await import("../lib/tiktok-events.ts");
  await sendTikTokServerEvent({
    event: "Purchase",
    eventId: "purchase:ref123456789",
    properties: { value: 39.99, currency: "USD", content_id: "litos_plus_month" },
    user: { email: "  Student@Example.COM " },
  });
  delete process.env.TIKTOK_ACCESS_TOKEN;

  assert.equal(sent.length, 1);
  const body = JSON.parse(sent[0].body);
  // The exact field name TikTok reads, and the exact digest of the normalized value.
  assert.equal(body.data[0].user.email, sha256("student@example.com"));
  // The mutation this catches: sending the address itself instead of its digest.
  assert.ok(!sent[0].body.toLowerCase().includes("student@example.com"), "plaintext email must never leave");
  assert.equal("phone_number" in body.data[0].user, false, "phone is not sent from anywhere");
});

test("the API route still forwards the identifier into the Events API call", async () => {
  /* The one link the behavioural tests above cannot reach: POST cannot be invoked
     outside Next's request scope (`after()` throws), so this pins the forwarding at
     source instead. Deliberately specific -- it fails if the `user` spread is deleted
     from the sendTikTokServerEvent call, which is the mutation that silently disables
     matching while every other test stays green and the endpoint still returns ok.
     The hashing itself is covered behaviourally by the sender test above. */
  const route = await readFile(new URL("../app/api/tiktok-event/route.ts", import.meta.url), "utf8");
  const call = route.slice(route.indexOf("after(() => sendTikTokServerEvent("));
  assert.match(call.slice(0, 400), /user\?\.email \? \{ user \} : \{\}/,
    "the route must pass `user` through to the Events API call");
  // And that it reads the identifier off the request body in the first place.
  assert.match(route, /identifier\(rawUser\.email\)/);
});
