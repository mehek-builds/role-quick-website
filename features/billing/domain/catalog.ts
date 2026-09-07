import {
  DEFAULT_CURRENCY,
  LITOS_PLUS_PLANS,
  isSupportedCurrency,
  litosPlusPlansForCurrency,
  type LitosPlusPlan,
  type SupportedCurrency,
} from "./plans.ts";

type ServerPlan = Partial<LitosPlusPlan> & {
  plan_id?: string;
  amount_cents?: number;
  checkout_available?: boolean;
};

export type PlanCatalog = {
  plans: LitosPlusPlan[];
  currency: SupportedCurrency;
  checkoutAvailable: boolean;
  source: "server" | "fallback";
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

/**
 * The server decides which currency a visitor sees (it alone knows their detected country);
 * this only ever verifies the AMOUNT the server claims for that currency against our own
 * conversion table, the same defense-in-depth this file already applied to USD. A currency we
 * don't recognize, or amounts that don't match our own table for it, fall the whole page back
 * to the static USD plans -- never a price nobody can independently confirm.
 */
export function verifiedPlanCatalog(value: unknown): PlanCatalog {
  const received = serverPlans(value);
  const response = value && typeof value === "object"
    ? value as { checkout_available?: unknown; currency?: unknown }
    : null;
  const currency: SupportedCurrency = isSupportedCurrency(response?.currency) ? response.currency : DEFAULT_CURRENCY;
  const expectedPlans = litosPlusPlansForCurrency(currency);
  const verified = expectedPlans.every((expected) => {
    const found = received.find((candidate) => planIdentity(candidate) === expected.id);
    return found && amount(found) === expected.amountCents;
  });
  const planAvailability = received
    .filter((candidate) => expectedPlans.some((expected) => expected.id === planIdentity(candidate)))
    .every((candidate) => candidate.checkout_available === true);
  const availability = verified && (
    response?.checkout_available === true
    || (response?.checkout_available === undefined && planAvailability)
  );

  return {
    plans: verified ? expectedPlans : [...LITOS_PLUS_PLANS],
    currency: verified ? currency : DEFAULT_CURRENCY,
    checkoutAvailable: Boolean(availability),
    source: verified ? "server" : "fallback",
  };
}
