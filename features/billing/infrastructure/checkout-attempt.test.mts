import assert from "node:assert/strict";
import test from "node:test";
import {
  contextualCheckoutAttempt,
  isDefinitiveCheckoutError,
} from "./checkout-attempt.ts";

test("an uncertain contextual checkout retry reuses its action and checkout keys", () => {
  const ids = ["action-key", "checkout-key", "next-action-key", "next-checkout-key"];
  const createId = () => ids.shift()!;
  const first = contextualCheckoutAttempt(null, "request-1", "litos_plus_quarter", createId);
  first.action = {
    action_nonce: "saved-action-nonce-1234567890",
    feature_key: "ai_resume_tailoring",
    return_route: "/dashboard/applications",
    expires_at: "2026-08-14T10:31:00.000Z",
  };

  const responseLostRetry = contextualCheckoutAttempt(first, "request-1", "litos_plus_quarter", createId);
  assert.strictEqual(responseLostRetry, first);
  assert.equal(responseLostRetry.actionIdempotencyKey, "action-key");
  assert.equal(responseLostRetry.checkoutIdempotencyKey, "checkout-key");
  assert.equal(responseLostRetry.action?.action_nonce, "saved-action-nonce-1234567890");

  const changedPlan = contextualCheckoutAttempt(first, "request-1", "litos_plus_month", createId);
  assert.notStrictEqual(changedPlan, first);
  assert.equal(changedPlan.actionIdempotencyKey, "next-action-key");
  assert.equal(changedPlan.checkoutIdempotencyKey, "next-checkout-key");
  assert.equal(changedPlan.action, null);
});

test("only definitive client errors clear a contextual retry", () => {
  assert.equal(isDefinitiveCheckoutError(400), true);
  assert.equal(isDefinitiveCheckoutError(409), true);
  assert.equal(isDefinitiveCheckoutError(408), false);
  assert.equal(isDefinitiveCheckoutError(429), false);
  assert.equal(isDefinitiveCheckoutError(500), false);
});
