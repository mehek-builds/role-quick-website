import {
  LITOS_PLUS_PLANS,
  type LitosPlusPlan,
  type LitosPlusPlanId,
} from "./plans.ts";

type ServerPlan = Partial<LitosPlusPlan> & {
  plan_id?: string;
  amount_cents?: number;
  checkout_available?: boolean;
  checkout_terms?: unknown;
};

export type BillingCheckoutStatus =
  | "available"
  | "claim_required"
  | "already_plus"
  | "billing_recovery_required"
  | "billing_not_configured";

export type BillingCheckoutTerms = {
  schemaVersion: 1;
  revision: string;
  checkoutStatus: BillingCheckoutStatus;
  blockerCode: string | null;
  paymentMethodRequired: true;
  trialEligible: boolean | null;
  trialDays: number | null;
  dueAtCheckout: {
    amountCents: number;
    currency: "USD";
    amountKind: "exact" | "catalog_before_tax_and_promotions";
  };
  firstCharge: {
    regularSubtotalCents: number;
    currency: "USD";
    timing: { kind: "at_checkout_completion" } | { kind: "days_after_checkout_completion"; days: number };
  };
  renewal: {
    regularSubtotalCents: number;
    currency: "USD";
    interval: "week" | "month";
    intervalCount: 1 | 3;
  };
  automaticTaxEnabled: boolean;
  promotionCodesAllowed: true;
  priceBasis: "catalog_before_tax_and_promotions";
};

export type PlanCatalog = {
  plans: LitosPlusPlan[];
  checkoutAvailable: boolean;
  source: "server" | "fallback";
  checkoutTerms: Partial<Record<LitosPlusPlanId, BillingCheckoutTerms>>;
};

function serverPlans(value: unknown): ServerPlan[] {
  if (Array.isArray(value)) return value as ServerPlan[];
  if (value && typeof value === "object" && Array.isArray((value as { plans?: unknown }).plans)) {
    return (value as { plans: ServerPlan[] }).plans;
  }
  return [];
}

function planIdentity(plan: ServerPlan): string | null {
  return typeof plan.id === "string" ? plan.id : typeof plan.plan_id === "string" ? plan.plan_id : null;
}

function amount(plan: ServerPlan): number | null {
  return typeof plan.amountCents === "number"
    ? plan.amountCents
    : typeof plan.amount_cents === "number"
      ? plan.amount_cents
      : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

function checkoutTerms(value: unknown, expected: LitosPlusPlan): BillingCheckoutTerms | null {
  const terms = record(value);
  const due = record(terms?.due_at_checkout);
  const first = record(terms?.first_charge);
  const timing = record(first?.timing);
  const renewal = record(terms?.renewal);
  const statuses: BillingCheckoutStatus[] = [
    "available",
    "claim_required",
    "already_plus",
    "billing_recovery_required",
    "billing_not_configured",
  ];
  const status = typeof terms?.checkout_status === "string" && statuses.includes(terms.checkout_status as BillingCheckoutStatus)
    ? terms.checkout_status as BillingCheckoutStatus
    : null;
  const trialEligible = typeof terms?.trial_eligible === "boolean" || terms?.trial_eligible === null
    ? terms.trial_eligible as boolean | null
    : undefined;
  const trialDays = typeof terms?.trial_days === "number" && Number.isInteger(terms.trial_days) && terms.trial_days >= 0
    ? terms.trial_days
    : terms?.trial_days === null ? null : undefined;
  const expectedInterval = expected.term === "week" ? "week" : "month";
  const expectedIntervalCount = expected.term === "quarter" ? 3 : 1;
  const timingValid = timing?.kind === "at_checkout_completion"
    || (timing?.kind === "days_after_checkout_completion"
      && typeof timing.days === "number"
      && Number.isInteger(timing.days)
      && timing.days > 0);

  if (
    terms?.schema_version !== 1
    || typeof terms.revision !== "string"
    || terms.revision.length < 8
    || !status
    || !(terms.blocker_code === null || typeof terms.blocker_code === "string")
    || terms.payment_method_required !== true
    || trialEligible === undefined
    || trialDays === undefined
    || !due
    || typeof due.amount_cents !== "number"
    || !Number.isInteger(due.amount_cents)
    || due.amount_cents < 0
    || due.currency !== "USD"
    || (due.amount_kind !== "exact" && due.amount_kind !== "catalog_before_tax_and_promotions")
    || !first
    || first.regular_subtotal_cents !== expected.amountCents
    || first.currency !== "USD"
    || !timingValid
    || !renewal
    || renewal.regular_subtotal_cents !== expected.amountCents
    || renewal.currency !== "USD"
    || renewal.interval !== expectedInterval
    || renewal.interval_count !== expectedIntervalCount
    || typeof terms.automatic_tax_enabled !== "boolean"
    || terms.promotion_codes_allowed !== true
    || terms.price_basis !== "catalog_before_tax_and_promotions"
  ) return null;

  if (status === "available" && trialEligible === true) {
    if (!trialDays || due.amount_cents !== 0 || due.amount_kind !== "exact"
      || timing?.kind !== "days_after_checkout_completion" || timing.days !== trialDays) return null;
  }
  if (status === "available" && trialEligible === false) {
    if (trialDays !== 0 || due.amount_cents !== expected.amountCents
      || due.amount_kind !== "catalog_before_tax_and_promotions" || timing?.kind !== "at_checkout_completion") return null;
  }

  return {
    schemaVersion: 1,
    revision: terms.revision,
    checkoutStatus: status,
    blockerCode: terms.blocker_code as string | null,
    paymentMethodRequired: true,
    trialEligible,
    trialDays,
    dueAtCheckout: {
      amountCents: due.amount_cents as number,
      currency: "USD",
      amountKind: due.amount_kind as BillingCheckoutTerms["dueAtCheckout"]["amountKind"],
    },
    firstCharge: {
      regularSubtotalCents: expected.amountCents,
      currency: "USD",
      timing: timing as BillingCheckoutTerms["firstCharge"]["timing"],
    },
    renewal: {
      regularSubtotalCents: expected.amountCents,
      currency: "USD",
      interval: expectedInterval,
      intervalCount: expectedIntervalCount,
    },
    automaticTaxEnabled: terms.automatic_tax_enabled as boolean,
    promotionCodesAllowed: true,
    priceBasis: "catalog_before_tax_and_promotions",
  };
}

export function verifiedPlanCatalog(value: unknown): PlanCatalog {
  const received = serverPlans(value);
  const response = value && typeof value === "object"
    ? value as { checkout_available?: unknown }
    : null;
  const verified = LITOS_PLUS_PLANS.every((expected) => {
    const found = received.find((candidate) => planIdentity(candidate) === expected.id);
    return found && amount(found) === expected.amountCents;
  });
  const planAvailability = received
    .filter((candidate) => LITOS_PLUS_PLANS.some((expected) => expected.id === planIdentity(candidate)))
    .every((candidate) => candidate.checkout_available === true);
  const availability = verified && (
    response?.checkout_available === true
    || (response?.checkout_available === undefined && planAvailability)
  );
  const terms = Object.fromEntries(LITOS_PLUS_PLANS.flatMap((expected) => {
    const found = received.find((candidate) => planIdentity(candidate) === expected.id);
    const parsed = checkoutTerms(found?.checkout_terms, expected);
    return parsed ? [[expected.id, parsed]] : [];
  })) as Partial<Record<LitosPlusPlanId, BillingCheckoutTerms>>;

  return {
    plans: [...LITOS_PLUS_PLANS],
    checkoutAvailable: Boolean(availability),
    source: verified ? "server" : "fallback",
    checkoutTerms: terms,
  };
}
