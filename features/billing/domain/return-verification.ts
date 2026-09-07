import { holdsLitosPlusAccess, type EntitlementSnapshot } from "./access.ts";

export type BillingReturnVerdict = "active" | "pending" | "mismatch";

export function billingReturnVerdict(input: {
  expectedAccountId: string;
  offerStatus: string | null;
  state: EntitlementSnapshot | null;
}): BillingReturnVerdict {
  if (input.state && input.state.account_id !== input.expectedAccountId) return "mismatch";
  if (input.offerStatus !== "paid" || !input.state) return "pending";
  /* A freshly completed Stripe checkout lands on `trial_plus`, not `plus_paid` -- every new
     subscription is a trial first. isPaidAccess alone never fires for that account, so the
     poll used to run out its six attempts and hand a paying student a "could not be confirmed"
     timeout instead of the receipt they just earned. */
  return holdsLitosPlusAccess(input.state) ? "active" : "pending";
}
