import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the root layout loads the US TikTok pixel", async () => {
  const [layout, pixels] = await Promise.all([
    read("app/layout.tsx"),
    read("lib/tiktok-pixel.ts"),
  ]);

  assert.match(pixels, /TIKTOK_US_PIXEL_CODE = "DAA22IBC77U6VIRE3PD0"/);
  assert.match(layout, /ttq\.load\('\$\{TIKTOK_US_PIXEL_CODE\}'\)/);
});

test("the verified Stripe return Purchase is routed to the US pixel", async () => {
  const [client, billingReturn] = await Promise.all([
    read("lib/tiktok-client.ts"),
    read("app/billing/return/page.tsx"),
  ]);

  assert.match(client, /ttq\?\.instance\(TIKTOK_US_PIXEL_CODE\)\.track/);
  assert.match(billingReturn, /trackTikTokPixelEvent\("Purchase"/);
  assert.match(billingReturn, /billingReturnVerdict/);
});
