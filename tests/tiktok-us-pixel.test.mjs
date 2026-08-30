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
  assert.match(client, /ttq\?\.instance\(pixelCode\)\.track/);
  assert.match(server, /event_source_id: TIKTOK_US_PIXEL_CODE/);
  assert.doesNotMatch(server, /DA3DU3JC77U208UL6HS0/);
  assert.match(billingReturn, /trackTikTokPixelEvent\("Purchase"/);
  assert.match(billingReturn, /billingReturnVerdict/);
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
