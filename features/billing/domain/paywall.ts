import {
  featureAccess,
  type EntitlementSnapshot,
  type PremiumFeatureKey,
} from "./access.ts";

export const METERED_UPGRADE_FEATURES = [
  "ai_resume_tailoring",
  "ai_cover_letter_generation",
  "ai_application_answer_generation",
  "contact_discovery",
  "outreach_email_generation",
] as const satisfies readonly PremiumFeatureKey[];

export type UpgradeOpenSource = "proactive" | "server_denial";

export function shouldOpenUpgrade(
  access: EntitlementSnapshot | null,
  feature: PremiumFeatureKey,
  source: UpgradeOpenSource = "proactive",
): boolean {
  if (source === "server_denial") return true;
  return featureAccess(access, feature) !== true;
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
