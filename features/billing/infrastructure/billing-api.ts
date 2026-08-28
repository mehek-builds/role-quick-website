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
  checkoutTermsRevision?: string;
};

export type CheckoutResponse = {
  provider: "stripe";
  offer_id?: string;
  checkout_session_id?: string;
  checkout_url?: string;
  url?: string;
  status_url?: string;
  expires_at: string;
  checkout_terms?: unknown;
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
    return { plans: [...LITOS_PLUS_PLANS], checkoutAvailable: false, source: "fallback", checkoutTerms: {} };
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

/**
 * Ask the server to ask Stripe what happened, instead of waiting to be told.
 *
 * The return page used to poll our own database for up to seven seconds and then
 * give up, which assumed the webhook would land in that window. A webhook can lag
 * the redirect, be retried for minutes after a 5xx, or -- if its signing secret is
 * wrong -- never arrive, and the student is already back on the site having just
 * paid. Reconciling first turns "wait and hope" into "go and check".
 *
 * Never throws. A failed reconcile must not block the return: the poll below it
 * is still there and is still correct once the webhook lands.
 */
export async function reconcileBillingCheckout(offerId: string): Promise<boolean> {
  try {
    const result = await api<{ reconciled?: boolean }>("/billing/reconcile", {
      method: "POST",
      body: JSON.stringify({ offer_id: offerId }),
    });
    return result?.reconciled === true;
  } catch {
    return false;
  }
}

export async function createLitosPlusCheckout(
  planId: LitosPlusPlanId,
  context: CheckoutContext,
): Promise<CheckoutResponse & { checkoutUrl: string }> {
  const idempotencyKey = context.idempotencyKey ?? crypto.randomUUID();
  /* Older purchase surfaces share this function but do not yet hold the personalized preview in
     component state. Fetching it here keeps those callers compatible with the server's stale-terms
     guard while onboarding passes the exact revision the applicant already reviewed. */
  const checkoutTermsRevision = context.checkoutTermsRevision
    ?? (await getPlanCatalog()).checkoutTerms[planId]?.revision;
  if (!checkoutTermsRevision) {
    throw new Error("Litos could not verify the current checkout terms.");
  }
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
      checkout_terms_revision: checkoutTermsRevision,
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
