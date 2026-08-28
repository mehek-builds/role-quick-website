import { isPaidAccess, type EntitlementSnapshot } from "./access.ts";

export type BillingReturnVerdict = "active" | "trial_active" | "pending" | "mismatch";

export function billingReturnVerdict(input: {
  expectedAccountId: string;
  offerStatus: string | null;
  state: EntitlementSnapshot | null;
}): BillingReturnVerdict {
  if (input.state && input.state.account_id !== input.expectedAccountId) return "mismatch";
  if (input.offerStatus !== "paid" || !input.state) return "pending";
  if (input.state.access_class === "trial_plus") return "trial_active";
  return isPaidAccess(input.state) ? "active" : "pending";
}
