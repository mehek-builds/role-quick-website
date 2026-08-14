import type { LitosPlusPlanId } from "../domain/plans.ts";
import type { PendingBillingAction } from "./billing-api.ts";

export type ContextualCheckoutAttempt = {
  requestId: string;
  planId: LitosPlusPlanId;
  actionIdempotencyKey: string;
  checkoutIdempotencyKey: string;
  action: PendingBillingAction | null;
};

export function contextualCheckoutAttempt(
  current: ContextualCheckoutAttempt | null,
  requestId: string,
  planId: LitosPlusPlanId,
  createId: () => string = () => crypto.randomUUID(),
): ContextualCheckoutAttempt {
  if (current?.requestId === requestId && current.planId === planId) return current;
  return {
    requestId,
    planId,
    actionIdempotencyKey: createId(),
    checkoutIdempotencyKey: createId(),
    action: null,
  };
}

export function isDefinitiveCheckoutError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
