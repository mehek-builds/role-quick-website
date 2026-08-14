import { api, getToken, type Me } from "@/lib/api";
import { isSafeBillingPortalUrl, isStripeCheckoutUrl } from "@/lib/billing";
import { litosClientHeaders } from "@/lib/product";
import { API_URL } from "@/lib/config";
import {
  LITOS_PLUS_PLANS,
  type LitosPlusPlanId,
} from "../domain/plans";
import {
  verifiedPlanCatalog,
  type PlanCatalog,
} from "../domain/catalog";
import {
  legacySnapshotFromMe,
  hydrateLegacyTrialUsage,
  normalizeEntitlementSnapshot,
  type EntitlementSnapshot,
} from "../domain/access";

export type CheckoutContext = {
  surface: "website" | "dashboard" | "extension";
  placement?: string;
  trigger?: string;
  actionNonce?: string;
  idempotencyKey?: string;
};

export type CheckoutResponse = {
  provider: "stripe";
  offer_id?: string;
  checkout_session_id?: string;
  checkout_url?: string;
  url?: string;
  status_url?: string;
  expires_at: string;
};

export type BillingOffer = {
  offer_id: string;
  status: "creating" | "checkout_created" | "paid" | "expired" | "failed";
  paid_at?: string | null;
  completed_at?: string | null;
  expires_at: string;
};

export type PendingBillingAction = {
  action_nonce: string;
  feature_key: string;
  return_route: string;
  expires_at: string;
  contact_id?: string | null;
};

export type PendingBillingActionState = {
  feature_key: string;
  return_route: string;
  expires_at: string;
  application_id?: string | null;
  job_id?: string | null;
  contact_id?: string | null;
  state: string;
};

export type ConsumedBillingAction = {
  consumed: true;
  idempotent: boolean;
  return_route: string;
  feature_key?: string;
  application_id?: string | null;
  job_id?: string | null;
  contact_id?: string | null;
};

export async function getPlanCatalog(): Promise<PlanCatalog> {
  try {
    return verifiedPlanCatalog(await api<unknown>("/billing/plans", { cache: "no-store" }));
  } catch {
    return { plans: [...LITOS_PLUS_PLANS], checkoutAvailable: false, source: "fallback" };
  }
}

export async function getBillingState(): Promise<EntitlementSnapshot> {
  try {
    const state = normalizeEntitlementSnapshot(await api<unknown>("/billing/state", { cache: "no-store" }));
    if (state?.trial?.meter_policy === "legacy_monthly_allowances") {
      try {
        return hydrateLegacyTrialUsage(state, await api<Me>("/me", { cache: "no-store" }));
      } catch {
        return state;
      }
    }
    if (state) return state;
  } catch {
    // A rolling deploy can serve the legacy account response before billing v2 is available.
  }
  return legacySnapshotFromMe(await api<Me>("/me", { cache: "no-store" }));
}

export async function getBillingOffer(offerId: string): Promise<BillingOffer> {
  return api<BillingOffer>(`/billing/offers/${encodeURIComponent(offerId)}`, { cache: "no-store" });
}

export async function createLitosPlusCheckout(
  planId: LitosPlusPlanId,
  context: CheckoutContext,
): Promise<CheckoutResponse & { checkoutUrl: string }> {
  const idempotencyKey = context.idempotencyKey ?? crypto.randomUUID();
  const response = await api<CheckoutResponse>("/billing/checkout", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      plan_id: planId,
      surface: context.surface,
      placement: context.placement,
      trigger: context.trigger,
      action_nonce: context.actionNonce,
      idempotency_key: idempotencyKey,
    }),
  });
  const checkoutUrl = response.checkout_url ?? response.url;
  if (!checkoutUrl || !isStripeCheckoutUrl(checkoutUrl)) {
    throw new Error("Checkout returned an invalid Stripe URL.");
  }
  const expiresAt = Date.parse(response.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("Checkout returned an invalid expiration time.");
  }
  return { ...response, checkoutUrl };
}

export async function createPendingBillingAction(input: {
  featureKey: string;
  returnRoute: string;
  applicationId?: string;
  jobId?: string;
  contactId?: string;
  idempotencyKey?: string;
}): Promise<PendingBillingAction> {
  return api<PendingBillingAction>("/billing/actions", {
    method: "POST",
    body: JSON.stringify({
      feature_key: input.featureKey,
      return_route: input.returnRoute,
      idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      application_id: input.applicationId,
      job_id: input.jobId,
      contact_id: input.contactId,
    }),
  });
}

export async function readPendingBillingAction(actionNonce: string): Promise<PendingBillingActionState> {
  return api(`/billing/actions/${encodeURIComponent(actionNonce)}`, { cache: "no-store" });
}

export async function consumePendingBillingAction(actionNonce: string): Promise<ConsumedBillingAction> {
  return api(`/billing/actions/${encodeURIComponent(actionNonce)}/consume`, { method: "POST" });
}

export async function createStripePortal(): Promise<string> {
  const portal = await api<{ provider: "stripe" | "lemonsqueezy"; url: string }>("/billing/portal", { method: "POST" });
  if (!isSafeBillingPortalUrl(portal.url, portal.provider)) throw new Error("Billing portal returned an unsafe URL.");
  return portal.url;
}

export async function emitBillingEvent(
  event: "paywall_impression" | "paywall_dismissed" | "upgrade_clicked" | "plan_selected" | "checkout_opened",
  properties: Record<string, string | number | boolean | null | undefined>,
): Promise<void> {
  const token = getToken();
  if (!token) return;
  const surface = properties.surface === "website"
    || properties.surface === "extension"
    || properties.surface === "api"
    ? properties.surface
    : "dashboard";
  const field = (key: string) => typeof properties[key] === "string" ? properties[key] : undefined;
  const reserved = new Set([
    "surface",
    "placement",
    "trigger",
    "feature_key",
    "plan_id",
    "application_id",
    "job_id",
    "session_id",
  ]);
  const eventProperties = Object.fromEntries(Object.entries(properties).filter(
    ([key, value]) => !reserved.has(key) && value !== undefined,
  ));
  await fetch(`${API_URL}/billing/events`, {
    method: "POST",
    keepalive: true,
    headers: {
      ...litosClientHeaders(),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      event_key: crypto.randomUUID(),
      event_name: event,
      surface,
      placement: field("placement"),
      trigger: field("trigger"),
      feature_key: field("feature_key"),
      plan_id: field("plan_id"),
      application_id: field("application_id"),
      job_id: field("job_id"),
      session_id: field("session_id"),
      occurred_at: new Date().toISOString(),
      properties: eventProperties,
    }),
  }).catch(() => null);
}
