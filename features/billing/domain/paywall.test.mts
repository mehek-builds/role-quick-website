import assert from "node:assert/strict";
import test from "node:test";
import type { EntitlementSnapshot } from "./access.ts";
import {
  METERED_UPGRADE_FEATURES,
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
