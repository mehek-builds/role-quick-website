import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the root layout loads both advertiser pixels", async () => {
  const [layout, pixels] = await Promise.all([
    read("app/layout.tsx"),
    read("lib/tiktok-pixel.ts"),
  ]);

  assert.match(pixels, /TIKTOK_US_PIXEL_CODE = "DAA22IBC77U6VIRE3PD0"/);
  assert.match(pixels, /TIKTOK_UAE_PIXEL_CODE = "DAA38C3C77UBCVGL0KRG"/);
  assert.match(pixels, /TIKTOK_ADS_PIXEL_CODES = \[/);
  assert.match(layout, /TIKTOK_ADS_PIXEL_CODES\.map/);
  assert.match(layout, /ttq\.instance\('\$\{pixelCode\}'\)\.page\(\)/);
});

test("the verified Stripe return Purchase is routed to the US pixel", async () => {
  const [client, server, billingReturn] = await Promise.all([
    read("lib/tiktok-client.ts"),
    read("lib/tiktok-events.ts"),
    read("app/billing/return/page.tsx"),
  ]);

  assert.match(client, /for \(const pixelCode of TIKTOK_ADS_PIXEL_CODES\)/);
  /* The instance is resolved once per pixel and then identified + tracked, so this
     guards the routing (every ads pixel gets the track call) rather than one exact
     call expression. identify() must come first or the identifiers miss this event. */
  assert.match(client, /window\.ttq\?\.instance\(pixelCode\)/);
  assert.match(client, /instance\?\.track\(event/);
  /* The presence assertion has to come FIRST. indexOf returns -1 when the call is
     absent, and -1 is less than any real index, so the ordering check alone passes
     against a file with no identify() in it at all -- verified by deleting the block
     and watching this test stay green. */
  assert.match(client, /instance\?\.identify\(/, "the pixel must send Advanced Matching identifiers");
  assert.ok(
    client.indexOf("instance?.identify(") < client.indexOf("instance?.track(event"),
    "identify() must precede track() or Advanced Matching misses this very event",
  );
  /* identify() must not be able to take track() down with it: a partial ttq stub
     without identify would otherwise drop the Purchase for every pixel. The
     behavioural proof of all of this lives in tests/tiktok-advanced-matching.test.mjs;
     these guards only keep the shape from drifting. */
  assert.match(
    client,
    /try \{\s*\n\s*instance\?\.identify\(/,
    "identify() must sit in its own try so a stub without it cannot abort track()",
  );
  assert.match(server, /event_source_id: TIKTOK_US_PIXEL_CODE/);
  assert.doesNotMatch(server, /DA3DU3JC77U208UL6HS0/);
  // Purchase firing (dedupe + trackTikTokPixelEvent("Purchase", ...)) lives in
  // firePurchaseEventOnce (lib/tiktok-client.ts), shared with the onboarding
  // notifications screen -- the return page calls it, rather than inlining the
  // pixel call itself.
  assert.match(client, /export function firePurchaseEventOnce/);
  assert.match(client, /trackTikTokPixelEvent\("Purchase"/);
  assert.match(billingReturn, /firePurchaseEventOnce\(purchaseSentRef, receipt, context, \{/);
  assert.match(billingReturn, /billingReturnVerdict/);
});

test("onboarding fires Purchase from the notifications screen only, not from the return page", async () => {
  const [billingReturn, notificationsStep] = await Promise.all([
    read("app/billing/return/page.tsx"),
    read("components/start/NotificationsStep.tsx"),
  ]);

  // The return page's website branch must skip firing for an onboarding-sourced
  // checkout (returnRoute === "/start", set only by PlanStep.tsx): onboarding's
  // Purchase event is the notifications screen's job, not this page's. storedContext
  // can be missing (see the mismatch-fallback test below), so this reads it optionally
  // rather than assuming it is always present.
  /* Pins the guard and that the fire happens inside it, without pinning the exact
     statement that follows: the call now sits behind a bounded Advanced Matching
     lookup, and the invariant is "onboarding does not fire from here", not the
     shape of the intervening code. */
  assert.match(
    billingReturn,
    /if \(\(storedContext\?\.returnRoute \?\? null\) !== "\/start"\) \{[\s\S]{0,800}?firePurchaseEventOnce/,
  );
  /* And that there is exactly one such call on this page, so a future edit cannot
     reintroduce an ungated one alongside it. */
  assert.equal(billingReturn.match(/firePurchaseEventOnce\(/g)?.length, 2, "one guarded website call, one extension-branch call");
  assert.match(notificationsStep, /firePurchaseEventOnce\(purchaseSentRef, receipt, undefined, \{/);
});

test("every checkout entry point sends InitiateCheckout through the browser pixel", async () => {
  const checkoutSurfaces = await Promise.all([
    read("components/billing/BillingProvider.tsx"),
    read("components/pricing/PlanCards.tsx"),
    read("components/start/PlanStep.tsx"),
  ]);

  for (const surface of checkoutSurfaces) {
    assert.match(surface, /sendTikTokEvent\("InitiateCheckout", tiktokEventId/);
    assert.match(surface, /trackTikTokPixelEvent\("InitiateCheckout", tiktokEventId/);
  }
});
