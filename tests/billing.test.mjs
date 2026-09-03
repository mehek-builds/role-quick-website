import assert from "node:assert/strict";
import test from "node:test";
import { isLemonSqueezyCheckoutUrl, isLemonSqueezyPortalUrl, isLitosPayCheckoutUrl, isSafeBillingPortalUrl, isSafeCheckoutUrl, isStripePortalUrl } from "../lib/billing.ts";

test("accepts only reusable HTTPS Lemon Squeezy checkout links", () => {
  assert.equal(isLemonSqueezyCheckoutUrl("https://litos.lemonsqueezy.com/checkout/buy/variant"), true);
  assert.equal(isLemonSqueezyCheckoutUrl("https://lemonsqueezy.com/checkout/buy/variant"), true);
  assert.equal(isLemonSqueezyCheckoutUrl("https://litos.lemonsqueezy.com/checkout/?cart=single-use"), false);
  assert.equal(isLemonSqueezyCheckoutUrl("http://litos.lemonsqueezy.com/checkout/buy/variant"), false);
  assert.equal(isLemonSqueezyCheckoutUrl("https://lemonsqueezy.com.evil.example/checkout/buy/variant"), false);
});

test("accepts first-party Litos Pay checkout intents from the configured backend only", () => {
  /* NEXT_PUBLIC_API_URL is unset here on purpose, so this case runs against the
     DEFAULT origin in lib/billing.ts. That default is what production actually
     uses, because the Dockerfile never forwards the variable into the build. */
  const intent = "https://api.trylitos.com/billing/litos-pay/checkout/6d58c1f5-e885-41f7-a16a-dac37f98ab17?token=signed";
  assert.equal(isLitosPayCheckoutUrl(intent), true);
  assert.equal(isSafeCheckoutUrl(intent), true);
  assert.equal(isLitosPayCheckoutUrl(intent.replace("https://", "http://")), false);
  assert.equal(isLitosPayCheckoutUrl(intent.replace("api.trylitos.com", "evil.example")), false);
  /* The retired Vercel name is no longer the configured origin, so an intent on
     it is refused like any other foreign host. Nothing issues one: both names
     fronted the same service, and the backend writes its own live name. */
  assert.equal(isLitosPayCheckoutUrl(intent.replace("api.trylitos.com", "student-outreach-backend.vercel.app")), false);
  assert.equal(isLitosPayCheckoutUrl("https://api.trylitos.com/billing/litos-pay/checkout/6d58c1f5-e885-41f7-a16a-dac37f98ab17"), false);
  assert.equal(isLitosPayCheckoutUrl("https://api.trylitos.com/billing/litos-pay/checkout/not-a-uuid?token=signed"), false);
});

test("accepts Litos Pay intents from an explicitly configured backend origin", () => {
  /* An explicit NEXT_PUBLIC_API_URL must beat the default in both directions,
     which is what keeps a staging or preview backend usable. */
  const previous = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://staging-api.trylitos.com";
  try {
    const intent = "https://staging-api.trylitos.com/billing/litos-pay/checkout/6d58c1f5-e885-41f7-a16a-dac37f98ab17?token=signed";
    assert.equal(isLitosPayCheckoutUrl(intent), true);
    assert.equal(isLitosPayCheckoutUrl(intent.replace("staging-api.trylitos.com", "api.trylitos.com")), false);
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

test("accepts provider-matched Lemon Squeezy management links only", () => {
  const storePortal = "https://litos.lemonsqueezy.com/billing?signature=signed";
  const orderPortal = "https://app.lemonsqueezy.com/my-orders/abc?signature=signed";
  assert.equal(isLemonSqueezyPortalUrl(storePortal), true);
  assert.equal(isLemonSqueezyPortalUrl(orderPortal), true);
  assert.equal(isSafeBillingPortalUrl(storePortal, "lemonsqueezy"), true);
  assert.equal(isSafeBillingPortalUrl(storePortal, "stripe"), false);
  assert.equal(isLemonSqueezyPortalUrl("https://litos.lemonsqueezy.com/checkout/buy/variant"), false);
  assert.equal(isLemonSqueezyPortalUrl("https://lemonsqueezy.com.evil.example/billing"), false);
  assert.equal(isLemonSqueezyPortalUrl("http://litos.lemonsqueezy.com/billing"), false);
});
