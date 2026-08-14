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
