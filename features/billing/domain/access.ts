import type { Me } from "@/lib/api";

export type AccessClass =
  | "free_new"
  | "trial_plus"
  | "free_grandfathered"
  | "plus_paid"
  | "legacy_paid"
  | "unknown";

export type PremiumFeatureKey =
  | "ai_resume_tailoring"
  | "ai_resume_feedback"
  | "ai_cover_letter_generation"
  | "ai_application_answer_generation"
  | "saved_generated_versions"
  | "contact_discovery"
  | "outreach_email_generation"
  | "networking_discovery"
  | "referral_paths"
  | "connected_companies"
  | "advanced_job_insights"
  | "recruiter_visibility"
  | "hover_generation"
  | "automatic_submission";

export type TrialCompanyUsage = {
  company_scope_key: string;
  company_name: string;
  contacts_used: number;
  contacts_limit: number;
  drafts_used: number;
  drafts_limit: number;
};

type TrialUsageBase = {
  starts_at: string;
  ends_at: string;
  active: boolean;
};

export type LegacyTrialUsage = TrialUsageBase & {
  meter_policy: "legacy_monthly_allowances";
};

export type LitosPlusTrialUsage = TrialUsageBase & {
  meter_policy: "litos_plus_v2_lifetime";
  tailored_resumes_used: number;
  tailored_resumes_limit: number;
  cover_letters_used: number;
  cover_letters_limit: number;
  answer_applications_used: number;
  answer_applications_limit: number;
  outreach_companies_used: number;
  outreach_companies_limit: number;
  company_usage: TrialCompanyUsage[];
};

export type TrialUsage = LegacyTrialUsage | LitosPlusTrialUsage;

export type LegacyLimits = {
  tailored_resumes_monthly: number;
  contacts_monthly: number;
  drafts_monthly: number;
  cover_letters_unmetered: boolean;
  application_answers_unmetered: boolean;
};

export type LegacyUsage = {
  tailored_resumes: { used: number; limit: number };
  contacts: { used: number; limit: number };
  drafts: { used: number; limit: number };
};

export type SubscriptionSummary = {
  provider: "stripe" | "lemonsqueezy" | "manual";
  status: string;
  term: "week" | "month" | "quarter" | "year" | "manual" | null;
  amount_cents?: number | null;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  access_ends_at: string | null;
  management_available: boolean;
};

export type EntitlementSnapshot = {
  schema_version: 2;
  policy_version: string;
  revision: string;
  evaluated_at: string;
  account_id?: string;
  access_class: AccessClass;
  product: "litos_plus" | null;
  term: SubscriptionSummary["term"];
  features: Partial<Record<PremiumFeatureKey, boolean>>;
  trial: TrialUsage | null;
  subscription: SubscriptionSummary | null;
  legacy_limits?: LegacyLimits | null;
  legacy_usage?: LegacyUsage | null;
  legacy_summary?: string | null;
};

export type AccessDenialCode =
  | "trial_expired"
  | "trial_limit_reached"
  | "plus_required"
  | "payment_past_due"
  | "feature_not_entitled"
  | "TRIAL_EXPIRED"
  | "PACKET_LIMIT_REACHED"
  | "TRIAL_COMPANY_LIMIT_REACHED"
  | "CONTACT_LIMIT_REACHED"
  | "DRAFT_LIMIT_REACHED"
  | "PLUS_REQUIRED"
  | "PAYMENT_PAST_DUE";

export type AccessDenial = {
  code: AccessDenialCode;
  feature_key?: PremiumFeatureKey;
  action?: string;
  reason?: string;
  used?: number;
  limit?: number;
  company_id?: string;
  trigger?: string;
};

const PREMIUM_FEATURES: readonly PremiumFeatureKey[] = [
  "ai_resume_tailoring",
  "ai_resume_feedback",
  "ai_cover_letter_generation",
  "ai_application_answer_generation",
  "saved_generated_versions",
  "contact_discovery",
  "outreach_email_generation",
  "networking_discovery",
  "referral_paths",
  "connected_companies",
  "advanced_job_insights",
  "recruiter_visibility",
  "hover_generation",
  "automatic_submission",
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTrial(value: unknown): TrialUsage | null {
  const trial = record(value);
  if (!trial) return null;
  const startsAt = stringOrNull(trial.starts_at);
  const endsAt = stringOrNull(trial.ends_at);
  if (!startsAt || !endsAt) return null;
  const active = typeof trial.active === "boolean"
    ? trial.active
    : new Date(endsAt).getTime() > Date.now();
  if (trial.meter_policy === "legacy_monthly_allowances") {
    return {
      meter_policy: "legacy_monthly_allowances",
      starts_at: startsAt,
      ends_at: endsAt,
      active,
    };
  }
  const numericMeters = [
    trial.tailored_resumes_used,
    trial.tailored_resumes_limit,
    trial.cover_letters_used,
    trial.cover_letters_limit,
    trial.answer_applications_used,
    trial.answer_applications_limit,
    trial.outreach_companies_used,
    trial.outreach_companies_limit,
  ].map(numberOrNull);
  if (numericMeters.some((meter) => meter === null)) return null;
  const companyUsage = Array.isArray(trial.company_usage)
    ? trial.company_usage.flatMap((item) => {
        const company = record(item);
        if (!company) return [];
        return [{
          company_scope_key: stringOrNull(company.company_scope_key) ?? "unknown",
          company_name: stringOrNull(company.company_name) ?? "Company",
          contacts_used: numberOr(company.contacts_used, 0),
          contacts_limit: numberOr(company.contacts_limit, 2),
          drafts_used: numberOr(company.drafts_used, 0),
          drafts_limit: numberOr(company.drafts_limit, 2),
        }];
      })
    : [];
  return {
    meter_policy: "litos_plus_v2_lifetime",
    starts_at: startsAt,
    ends_at: endsAt,
    active,
    tailored_resumes_used: numericMeters[0]!,
    tailored_resumes_limit: numericMeters[1]!,
    cover_letters_used: numericMeters[2]!,
    cover_letters_limit: numericMeters[3]!,
    answer_applications_used: numericMeters[4]!,
    answer_applications_limit: numericMeters[5]!,
    outreach_companies_used: numericMeters[6]!,
    outreach_companies_limit: numericMeters[7]!,
    company_usage: companyUsage,
  };
}

function normalizeSubscription(value: unknown, term: SubscriptionSummary["term"]): SubscriptionSummary | null {
  const subscription = record(value);
  if (!subscription) return null;
  const provider = subscription.provider === "lemonsqueezy" || subscription.provider === "manual"
    ? subscription.provider
    : "stripe";
  return {
    provider,
    status: stringOrNull(subscription.status) ?? "unknown",
    term,
    amount_cents: typeof subscription.amount_cents === "number" ? subscription.amount_cents : null,
    cancel_at_period_end: subscription.cancel_at_period_end === true,
    current_period_start: stringOrNull(subscription.current_period_start),
    current_period_end: stringOrNull(subscription.current_period_end),
    access_ends_at: stringOrNull(subscription.access_ends_at),
    management_available: subscription.management_available === true,
  };
}

function normalizeLegacyLimits(value: unknown): LegacyLimits | null {
  const limits = record(value);
  if (!limits) return null;
  return {
    tailored_resumes_monthly: numberOr(limits.tailored_resumes_monthly, 20),
    contacts_monthly: numberOr(limits.contacts_monthly, 30),
    drafts_monthly: numberOr(limits.drafts_monthly, 60),
    cover_letters_unmetered: limits.cover_letters_unmetered === true,
    application_answers_unmetered: limits.application_answers_unmetered === true,
  };
}

function normalizeLegacyUsage(value: unknown): LegacyUsage | null {
  const usage = record(value);
  const resumes = record(usage?.tailored_resumes);
  const contacts = record(usage?.contacts);
  const drafts = record(usage?.drafts);
  if (!resumes || !contacts || !drafts) return null;
  return {
    tailored_resumes: { used: numberOr(resumes.used, 0), limit: numberOr(resumes.limit, 20) },
    contacts: { used: numberOr(contacts.used, 0), limit: numberOr(contacts.limit, 30) },
    drafts: { used: numberOr(drafts.used, 0), limit: numberOr(drafts.limit, 60) },
  };
}

export function normalizeEntitlementSnapshot(value: unknown): EntitlementSnapshot | null {
  const outer = record(value);
  if (!outer) return null;
  const candidate = record(outer.entitlement)
    ?? record(outer.entitlements)
    ?? record(outer.snapshot)
    ?? outer;
  if (candidate.schema_version !== 2) return null;
  const rawClass = stringOrNull(candidate.access_class);
  const accessClass: AccessClass = [
    "free_new",
    "trial_plus",
    "free_grandfathered",
    "plus_paid",
    "legacy_paid",
  ].includes(rawClass ?? "") ? rawClass as AccessClass : "unknown";
  const rawTerm = stringOrNull(candidate.term);
  const term = ["week", "month", "quarter", "year", "manual"].includes(rawTerm ?? "")
    ? rawTerm as SubscriptionSummary["term"]
    : null;
  const rawFeatures = record(candidate.features) ?? {};
  const features: Partial<Record<PremiumFeatureKey, boolean>> = {};
  for (const feature of PREMIUM_FEATURES) {
    if (typeof rawFeatures[feature] === "boolean") features[feature] = rawFeatures[feature] as boolean;
  }
  return {
    schema_version: 2,
    policy_version: stringOrNull(candidate.policy_version) ?? "litos-entitlements-v2",
    revision: stringOrNull(candidate.revision) ?? "unknown",
    evaluated_at: stringOrNull(candidate.evaluated_at) ?? new Date(0).toISOString(),
    account_id: stringOrNull(outer.account_id) ?? stringOrNull(candidate.account_id) ?? undefined,
    access_class: accessClass,
    product: candidate.product === "litos_plus" ? "litos_plus" : null,
    term,
    features,
    trial: normalizeTrial(candidate.trial),
    subscription: normalizeSubscription(candidate.subscription, term),
    legacy_limits: normalizeLegacyLimits(candidate.legacy_limits),
    legacy_usage: normalizeLegacyUsage(candidate.legacy_usage),
    legacy_summary: stringOrNull(candidate.legacy_summary),
  };
}

export function legacySnapshotFromMe(me: Me): EntitlementSnapshot {
  const trialActive = Boolean(me.trial_ends_at && new Date(me.trial_ends_at).getTime() > Date.now());
  const paid = me.tier === "pro" || me.tier === "plus";
  const legacyFreeFeatures = new Set<PremiumFeatureKey>([
    "ai_resume_tailoring",
    "ai_resume_feedback",
    "ai_cover_letter_generation",
    "ai_application_answer_generation",
    "saved_generated_versions",
    "contact_discovery",
    "outreach_email_generation",
  ]);
  const features = Object.fromEntries(PREMIUM_FEATURES.map((feature) => {
    if (feature === "hover_generation") return [feature, paid];
    if (paid || trialActive) return [feature, true];
    return [feature, legacyFreeFeatures.has(feature)];
  })) as Record<PremiumFeatureKey, boolean>;
  const accessClass: AccessClass = paid ? "legacy_paid" : trialActive ? "trial_plus" : "free_grandfathered";
  const usesLegacyMeters = accessClass === "free_grandfathered" || trialActive;
  const legacyLimits: LegacyLimits | null = usesLegacyMeters ? {
    tailored_resumes_monthly: me.usage.resumes.limit,
    contacts_monthly: me.usage.contacts.limit,
    drafts_monthly: me.usage.drafts.limit,
    cover_letters_unmetered: true,
    application_answers_unmetered: true,
  } : null;
  return {
    schema_version: 2,
    policy_version: "legacy-compatibility",
    revision: "legacy-me",
    evaluated_at: new Date().toISOString(),
    access_class: accessClass,
    product: paid || trialActive ? "litos_plus" : null,
    term: null,
    features,
    trial: trialActive && me.trial_ends_at ? {
      meter_policy: "legacy_monthly_allowances",
      starts_at: new Date(new Date(me.trial_ends_at).getTime() - 7 * 86_400_000).toISOString(),
      ends_at: me.trial_ends_at,
      active: true,
    } : null,
    subscription: paid ? {
      provider: me.billing_provider === "lemonsqueezy" ? "lemonsqueezy" : "stripe",
      status: me.billing_status ?? "active",
      term: null,
      cancel_at_period_end: Boolean(me.billing_ends_at),
      current_period_start: null,
      current_period_end: me.billing_renews_at ?? me.billing_ends_at ?? null,
      access_ends_at: me.billing_ends_at ?? null,
      management_available: me.billing_portal_available === true || Boolean(me.billing_portal_url),
    } : null,
    legacy_limits: legacyLimits,
    legacy_usage: usesLegacyMeters ? {
      tailored_resumes: { ...me.usage.resumes },
      contacts: { ...me.usage.contacts },
      drafts: { ...me.usage.drafts },
    } : null,
    legacy_summary: paid
      ? "Your original paid access is preserved."
      : accessClass === "free_grandfathered"
        ? `Your original monthly limits remain: ${me.usage.resumes.limit} tailored resumes, ${me.usage.contacts.limit} contacts, and ${me.usage.drafts.limit} drafts.`
        : trialActive
          ? "Your original trial allowances remain through the exact trial expiry."
          : null,
  };
}

export function hydrateLegacyTrialUsage(snapshot: EntitlementSnapshot, me: Me): EntitlementSnapshot {
  if (snapshot.trial?.meter_policy !== "legacy_monthly_allowances") return snapshot;
  return {
    ...snapshot,
    legacy_limits: {
      tailored_resumes_monthly: me.usage.resumes.limit,
      contacts_monthly: me.usage.contacts.limit,
      drafts_monthly: me.usage.drafts.limit,
      cover_letters_unmetered: true,
      application_answers_unmetered: true,
    },
    legacy_usage: {
      tailored_resumes: { ...me.usage.resumes },
      contacts: { ...me.usage.contacts },
      drafts: { ...me.usage.drafts },
    },
    legacy_summary: "Your original trial allowances remain through the exact trial expiry.",
  };
}

export function featureAccess(
  snapshot: EntitlementSnapshot | null,
  feature: PremiumFeatureKey,
): boolean | null {
  if (!snapshot) return null;
  const value = snapshot.features[feature];
  return typeof value === "boolean" ? value : null;
}

export function isPaidAccess(snapshot: EntitlementSnapshot | null): boolean {
  return snapshot?.access_class === "plus_paid" || snapshot?.access_class === "legacy_paid";
}

export function accessLabel(snapshot: EntitlementSnapshot | null): string {
  switch (snapshot?.access_class) {
    case "trial_plus": return "Litos+ trial";
    case "plus_paid": return "Litos+";
    case "legacy_paid": return "Original paid plan";
    case "free_grandfathered": return "Original Free plan";
    case "free_new": return "Free";
    default: return "Access unavailable";
  }
}

export function termLabel(term: SubscriptionSummary["term"]): string {
  switch (term) {
    case "week": return "Weekly";
    case "month": return "Monthly";
    case "quarter": return "Three-month";
    case "year": return "Annual";
    case "manual": return "Original";
    default: return "Original";
  }
}
