import assert from "node:assert/strict";
import test from "node:test";
import { countryName, formatUsd, isLemonSqueezyCheckoutUrl } from "../lib/billing.ts";

test("accepts only reusable HTTPS Lemon Squeezy checkout links", () => {
  assert.equal(isLemonSqueezyCheckoutUrl("https://litos.lemonsqueezy.com/checkout/buy/variant"), true);
  assert.equal(isLemonSqueezyCheckoutUrl("https://lemonsqueezy.com/checkout/buy/variant"), true);
  assert.equal(isLemonSqueezyCheckoutUrl("https://litos.lemonsqueezy.com/checkout/custom/signed-token"), true);
  assert.equal(isLemonSqueezyCheckoutUrl("https://litos.lemonsqueezy.com/checkout/?cart=single-use"), false);
  assert.equal(isLemonSqueezyCheckoutUrl("http://litos.lemonsqueezy.com/checkout/buy/variant"), false);
  assert.equal(isLemonSqueezyCheckoutUrl("https://lemonsqueezy.com.evil.example/checkout/buy/variant"), false);
});

test("formats regional pricing labels without trusting arbitrary locale input", () => {
  assert.equal(countryName("US"), "United States");
  assert.equal(countryName("ZZ"), "Your location");
  assert.equal(formatUsd(2499), "$24.99");
  assert.equal(formatUsd(23990 / 12), "$19.99");
});
