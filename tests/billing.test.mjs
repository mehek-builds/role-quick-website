import assert from "node:assert/strict";
import test from "node:test";
import { isLemonSqueezyCheckoutUrl, isLitosPayCheckoutUrl, isSafeCheckoutUrl, isStripePortalUrl } from "../lib/billing.ts";

test("accepts only reusable HTTPS Lemon Squeezy checkout links", () => {
  assert.equal(isLemonSqueezyCheckoutUrl("https://litos.lemonsqueezy.com/checkout/buy/variant"), true);
  assert.equal(isLemonSqueezyCheckoutUrl("https://lemonsqueezy.com/checkout/buy/variant"), true);
  assert.equal(isLemonSqueezyCheckoutUrl("https://litos.lemonsqueezy.com/checkout/?cart=single-use"), false);
  assert.equal(isLemonSqueezyCheckoutUrl("http://litos.lemonsqueezy.com/checkout/buy/variant"), false);
  assert.equal(isLemonSqueezyCheckoutUrl("https://lemonsqueezy.com.evil.example/checkout/buy/variant"), false);
});

test("accepts first-party Litos Pay checkout intents from the configured backend only", () => {
  const intent = "https://student-outreach-backend.vercel.app/billing/litos-pay/checkout/6d58c1f5-e885-41f7-a16a-dac37f98ab17?token=signed";
  assert.equal(isLitosPayCheckoutUrl(intent), true);
  assert.equal(isSafeCheckoutUrl(intent), true);
  assert.equal(isLitosPayCheckoutUrl(intent.replace("https://", "http://")), false);
  assert.equal(isLitosPayCheckoutUrl(intent.replace("student-outreach-backend.vercel.app", "evil.example")), false);
  assert.equal(isLitosPayCheckoutUrl("https://student-outreach-backend.vercel.app/billing/litos-pay/checkout/6d58c1f5-e885-41f7-a16a-dac37f98ab17"), false);
  assert.equal(isLitosPayCheckoutUrl("https://student-outreach-backend.vercel.app/billing/litos-pay/checkout/not-a-uuid?token=signed"), false);
});

test("accepts Litos Pay intents from an explicitly configured backend origin", () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://api.trylitos.com";
  try {
    const intent = "https://api.trylitos.com/billing/litos-pay/checkout/6d58c1f5-e885-41f7-a16a-dac37f98ab17?token=signed";
    assert.equal(isLitosPayCheckoutUrl(intent), true);
    assert.equal(isLitosPayCheckoutUrl(intent.replace("api.trylitos.com", "student-outreach-backend.vercel.app")), false);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = previous;
  }
});

test("accepts only Stripe-hosted customer portal sessions", () => {
  assert.equal(isStripePortalUrl("https://billing.stripe.com/p/session/test_123"), true);
  assert.equal(isStripePortalUrl("http://billing.stripe.com/p/session/test_123"), false);
  assert.equal(isStripePortalUrl("https://billing.stripe.com.evil.example/p/session/test_123"), false);
});
