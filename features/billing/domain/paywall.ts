import {
  featureAccess,
  type EntitlementSnapshot,
  type PremiumFeatureKey,
} from "./access.ts";

export const METERED_UPGRADE_FEATURES = [
  "ai_resume_tailoring",
  "ai_cover_letter_generation",
  "ai_application_answer_generation",
] as const satisfies readonly PremiumFeatureKey[];

export type UpgradeOpenSource = "proactive" | "server_denial" | "plan_management";

export function shouldOpenUpgrade(
  access: EntitlementSnapshot | null,
  feature: PremiumFeatureKey,
  source: UpgradeOpenSource = "proactive",
): boolean {
  if (source === "server_denial") return true;
  if (source === "plan_management") return true;
  return featureAccess(access, feature) !== true;
}

/**
 * WHETHER THIS ACCOUNT CAN START ITS SUBSCRIPTION EARLY instead of opening a checkout.
 *
 * The trial meters generations and the subscription meters time, so an account can spend its whole
 * allowance with days still on the clock. Sending that account to checkout is a dead end: the
 * server answers 409 `already_plus` for any trialing subscription, and it is right to, because a
 * second Stripe checkout on the same customer creates a second subscription and bills twice.
 * POST /billing/trial/start-now ends the trial on the subscription that already exists.
 *
 * GATED ON THE SUBSCRIPTION, NOT ON THE ACCESS CLASS. `trial_plus` can in principle be granted by
 * something other than a running Stripe subscription, and there is nothing to convert in that case
 * - no subscription to end, and no card the server may assume is on file. A status of exactly
 * `trialing` is the only shape the route accepts, so it is the only shape offered here.
 */
export function canStartSubscriptionNow(access: EntitlementSnapshot | null): boolean {
  return access?.access_class === "trial_plus"
    && access.subscription?.provider === "stripe"
    && access.subscription.status === "trialing";
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const STRUCTURED_UPGRADE_CODES = new Set([
  "entitlement_required",
  "quota_exceeded",
  "trial_expired",
  "subscription_past_due",
]);

/**
 * Only a structured monetization response can override a locally cached feature grant.
 * This keeps an unrelated 402, validation failure, or paid safety limit from becoming an upsell.
 */
export function isStructuredUpgradeDenial(
  error: unknown,
  expectedFeature: PremiumFeatureKey,
): boolean {
  const candidate = record(error);
  if (candidate?.status !== 402) return false;
  const payload = record(candidate.data);
  const code = typeof payload?.code === "string" ? payload.code : null;
  if (!code || !STRUCTURED_UPGRADE_CODES.has(code)) return false;

  const reportedFeature = payload?.feature ?? payload?.feature_key ?? payload?.feature_id;
  return typeof reportedFeature !== "string" || reportedFeature === expectedFeature;
}
