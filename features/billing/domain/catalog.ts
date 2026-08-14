import {
  LITOS_PLUS_PLANS,
  type LitosPlusPlan,
} from "./plans.ts";

type ServerPlan = Partial<LitosPlusPlan> & {
  plan_id?: string;
  amount_cents?: number;
  checkout_available?: boolean;
};

export type PlanCatalog = {
  plans: LitosPlusPlan[];
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

  return {
    plans: [...LITOS_PLUS_PLANS],
    checkoutAvailable: Boolean(availability),
    source: verified ? "server" : "fallback",
  };
}
