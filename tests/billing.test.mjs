import assert from "node:assert/strict";
import test from "node:test";
import { isLemonSqueezyCheckoutUrl } from "../lib/billing.ts";

test("accepts only reusable HTTPS Lemon Squeezy checkout links", () => {
  assert.equal(isLemonSqueezyCheckoutUrl("https://litos.lemonsqueezy.com/checkout/buy/variant"), true);
  assert.equal(isLemonSqueezyCheckoutUrl("https://lemonsqueezy.com/checkout/buy/variant"), true);
  assert.equal(isLemonSqueezyCheckoutUrl("https://litos.lemonsqueezy.com/checkout/?cart=single-use"), false);
  assert.equal(isLemonSqueezyCheckoutUrl("http://litos.lemonsqueezy.com/checkout/buy/variant"), false);
  assert.equal(isLemonSqueezyCheckoutUrl("https://lemonsqueezy.com.evil.example/checkout/buy/variant"), false);
});
