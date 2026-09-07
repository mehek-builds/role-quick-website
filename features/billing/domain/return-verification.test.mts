import assert from "node:assert/strict";
import test from "node:test";
import { billingReturnVerdict } from "./return-verification.ts";
import type { EntitlementSnapshot } from "./access.ts";

function state(accountId: string, accessClass: EntitlementSnapshot["access_class"]): EntitlementSnapshot {
  return {
    schema_version: 2,
    policy_version: "litos-entitlements-v2",
    account_id: accountId,
    revision: "revision-1",
    evaluated_at: "2026-08-14T00:00:00.000Z",
    access_class: accessClass,
    product: accessClass === "plus_paid" ? "litos_plus" : null,
    term: accessClass === "plus_paid" ? "month" : null,
    features: {} as EntitlementSnapshot["features"],
    trial: null,
    legacy_limits: null,
    subscription: null,
  };
}

test("an unrelated paid browser account cannot confirm another account's offer", () => {
  assert.equal(billingReturnVerdict({
    expectedAccountId: "account-a",
    offerStatus: "paid",
    state: state("account-b", "plus_paid"),
  }), "mismatch");
});

test("the exact account still waits for the exact offer to be paid", () => {
  assert.equal(billingReturnVerdict({
    expectedAccountId: "account-a",
    offerStatus: "checkout_created",
    state: state("account-a", "plus_paid"),
  }), "pending");
  assert.equal(billingReturnVerdict({
    expectedAccountId: "account-a",
    offerStatus: "paid",
    state: state("account-a", "plus_paid"),
  }), "active");
});

test("with no independent account to check, passing the server's own account id resolves on offer status alone", () => {
  /* This is the call-site pattern app/billing/return/page.tsx uses when there is no
     locally stored checkout context to compare against (storedContext missing):
     expectedAccountId falls back to state.account_id itself, so this specific
     check can never produce a false "mismatch" -- the real ownership proof for
     that case is the server-scoped getBillingOffer 404 check next to it, not this
     function. */
  assert.equal(billingReturnVerdict({
    expectedAccountId: "account-a",
    offerStatus: "paid",
    state: state("account-a", "trial_plus"),
  }), "active");
  assert.equal(billingReturnVerdict({
    expectedAccountId: "account-a",
    offerStatus: "checkout_created",
    state: state("account-a", "free_new"),
  }), "pending");
});

test("a freshly completed checkout confirms even though it lands on trial_plus, not plus_paid", () => {
  // Every new subscription starts as a Stripe trial: the account's own paid offer completing
  // must read as "active" here, or the return page polls out its attempts and hands a paying
  // student a timeout instead of a receipt (this is the exact bug the fix closes).
  assert.equal(billingReturnVerdict({
    expectedAccountId: "account-a",
    offerStatus: "paid",
    state: state("account-a", "trial_plus"),
  }), "active");
});
