import assert from "node:assert/strict";
import test from "node:test";
import type { EntitlementSnapshot } from "./access.ts";
import {
  METERED_UPGRADE_FEATURES,
  canStartSubscriptionNow,
  isStructuredUpgradeDenial,
  shouldOpenUpgrade,
} from "./paywall.ts";

const trialAccess: EntitlementSnapshot = {
  schema_version: 2,
  policy_version: "litos-entitlements-v2",
  revision: "trial-meter-at-limit",
  evaluated_at: "2026-08-14T00:00:00.000Z",
  access_class: "trial_plus",
  product: "litos_plus",
  term: null,
  features: Object.fromEntries(METERED_UPGRADE_FEATURES.map((feature) => [feature, true])),
  trial: null,
  subscription: null,
};

test("authoritative exhausted-meter denials open every metered paywall despite a cached trial grant", () => {
  for (const feature of METERED_UPGRADE_FEATURES) {
    assert.equal(shouldOpenUpgrade(trialAccess, feature), false, `${feature} should not open proactively`);
    assert.equal(shouldOpenUpgrade(trialAccess, feature, "server_denial"), true, `${feature} must open after a server denial`);
    assert.equal(isStructuredUpgradeDenial({
      status: 402,
      data: {
        code: "entitlement_required",
        feature,
        reason: "trial_limit_reached",
        used: 5,
        limit: 5,
      },
    }, feature), true, `${feature} must recognize its structured denial`);
  }
});

test("explicit plan management opens even when a grandfathered allowance grants the named feature", () => {
  const grandfatheredAccess: EntitlementSnapshot = {
    ...trialAccess,
    revision: "grandfathered-plan-entry",
    access_class: "free_grandfathered",
    product: null,
  };

  assert.equal(shouldOpenUpgrade(grandfatheredAccess, "ai_resume_tailoring"), false);
  assert.equal(shouldOpenUpgrade(grandfatheredAccess, "ai_resume_tailoring", "plan_management"), true);
});

test("legacy quota denials without a feature remain upgrade denials", () => {
  assert.equal(isStructuredUpgradeDenial({
    status: 402,
    data: { code: "quota_exceeded", used: 20, limit: 20 },
  }, "ai_resume_tailoring"), true);
});

test("unrelated failures and mismatched feature denials never force a paywall", () => {
  assert.equal(isStructuredUpgradeDenial({
    status: 402,
    data: { code: "entitlement_required", feature: "contact_discovery" },
  }, "ai_resume_tailoring"), false);
  assert.equal(isStructuredUpgradeDenial({ status: 402, data: { error: "Card authorization required" } }, "ai_resume_tailoring"), false);
  assert.equal(isStructuredUpgradeDenial({ status: 429, data: { code: "quota_exceeded" } }, "ai_resume_tailoring"), false);
  assert.equal(isStructuredUpgradeDenial({ status: 429, data: { code: "rate_limited", reason: "paid_safety_limit" } }, "ai_resume_tailoring"), false);
});

/* THE DEAD END THIS PREDICATE EXISTS TO AVOID. An account whose trial generations are spent but
 * whose trial days are not gets sent to checkout, and checkout answers 409 `already_plus` for any
 * trialing subscription - correctly, since a second Stripe checkout on the same customer bills
 * twice. So the modal has to offer to start the existing subscription instead, and only when there
 * genuinely is one to start. */
const stripeTrialSubscription = {
  provider: "stripe" as const,
  status: "trialing",
  term: "week" as const,
  cancel_at_period_end: false,
  current_period_start: "2026-09-07T15:41:05.000Z",
  current_period_end: "2026-09-14T15:41:05.000Z",
  access_ends_at: null,
  management_available: true,
};

test("a trial running on a Stripe subscription can start that subscription early", () => {
  assert.equal(
    canStartSubscriptionNow({ ...trialAccess, subscription: stripeTrialSubscription }),
    true,
  );
});

test("a trial with no subscription has nothing to start, and no card to assume", () => {
  assert.equal(canStartSubscriptionNow({ ...trialAccess, subscription: null }), false);
});

test("a subscription already past its trial is not offered an early start", () => {
  for (const status of ["active", "past_due", "canceled", "incomplete"]) {
    assert.equal(
      canStartSubscriptionNow({ ...trialAccess, subscription: { ...stripeTrialSubscription, status } }),
      false,
      `${status} is not a running trial`,
    );
  }
});

test("a non-Stripe provider is never converted through the Stripe route", () => {
  assert.equal(
    canStartSubscriptionNow({
      ...trialAccess,
      subscription: { ...stripeTrialSubscription, provider: "lemonsqueezy" as const },
    }),
    false,
  );
});

test("a paid account is not shown a trial conversion", () => {
  assert.equal(
    canStartSubscriptionNow({
      ...trialAccess,
      access_class: "plus_paid",
      subscription: { ...stripeTrialSubscription, status: "active" },
    }),
    false,
  );
});

test("no access snapshot at all is not an invitation to charge a card", () => {
  assert.equal(canStartSubscriptionNow(null), false);
});
