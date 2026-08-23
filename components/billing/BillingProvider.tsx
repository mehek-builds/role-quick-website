"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { sendTikTokEvent } from "@/lib/tiktok-client";
import { operationIdFor, completeOperationId } from "@/lib/operation-id";
import { isQaRender } from "@/lib/qa-mode";
import {
  createLitosPlusCheckout,
  createPendingBillingAction,
  contextualCheckoutAttempt,
  currentBillingReturnRoute,
  emitBillingEvent,
  featureAccess,
  getBillingState,
  getPlanCatalog,
  isDefinitiveCheckoutError,
  isPaidAccess,
  rememberBillingReturnContext,
  shouldOpenUpgrade,
  type EntitlementSnapshot,
  type ContextualCheckoutAttempt,
  type LitosPlusPlanId,
  type PlanCatalog,
  type PremiumFeatureKey,
  type UpgradeOpenSource,
} from "@/features/billing";
import { ApiError } from "@/lib/api";
import { UpgradeModal, type UpgradeRequest } from "./UpgradeModal";

type BillingContextValue = {
  access: EntitlementSnapshot | null;
  catalog: PlanCatalog | null;
  loading: boolean;
  error: string | null;
  canUse: (feature: PremiumFeatureKey) => boolean | null;
  refresh: () => Promise<void>;
  openUpgrade: (request: UpgradeRequest, options?: OpenUpgradeOptions) => void;
};

type OpenUpgradeOptions = {
  source?: UpgradeOpenSource;
  trigger?: HTMLElement | null;
};

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = useState<EntitlementSnapshot | null>(null);
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<UpgradeRequest | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const checkoutRequestIdRef = useRef<string | null>(null);
  const checkoutAttemptRef = useRef<ContextualCheckoutAttempt | null>(null);
  /* Keyed by planId, not just "the current attempt" like checkoutRequestIdRef above:
     switching plans inside one still-open modal after a failed checkout must get its
     own event_id, or TikTok's event_id dedup collapses the real second InitiateCheckout
     into the failed first one. */
  const tiktokCheckoutIdsRef = useRef(new Map<string, string>());

  const loadCatalog = useCallback(async () => {
    const next = await getPlanCatalog();
    setCatalog(next);
    if (!next.checkoutAvailable) setError("Litos could not verify the live Stripe catalog. Try again before purchasing.");
    else setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextAccess] = await Promise.all([
        getBillingState().then((state) => {
          setAccess(state);
          return state;
        }),
        loadCatalog(),
      ]);
      if (isPaidAccess(nextAccess)) setRequest(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Litos could not check plan access.");
    } finally {
      setLoading(false);
    }
  }, [loadCatalog]);

  useEffect(() => {
    if (isQaRender()) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let cancelled = false;
    Promise.all([getBillingState(), getPlanCatalog()])
      .then(([nextAccess, nextCatalog]) => {
        if (cancelled) return;
        setAccess(nextAccess);
        setCatalog(nextCatalog);
        setError(nextCatalog.checkoutAvailable ? null : "Litos could not verify the live Stripe catalog. Try again before purchasing.");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Litos could not check plan access.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const openUpgrade = useCallback((next: UpgradeRequest, options?: OpenUpgradeOptions) => {
    if (!shouldOpenUpgrade(access, next.feature, options?.source)) return;
    checkoutRequestIdRef.current = crypto.randomUUID();
    checkoutAttemptRef.current = null;
    triggerRef.current = options?.trigger?.isConnected
      ? options.trigger
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setRequest({ ...next, returnRoute: next.returnRoute ?? currentBillingReturnRoute() });
    track("paywall_impression", { feature_key: next.feature, placement: next.placement, trigger: next.trigger });
    void emitBillingEvent("paywall_impression", {
      feature_key: next.feature,
      placement: next.placement,
      trigger: next.trigger,
      access_class: access?.access_class,
    });
  }, [access]);

  const closeUpgrade = useCallback(() => {
    if (request) {
      track("paywall_dismissed", { feature_key: request.feature, placement: request.placement, trigger: request.trigger });
      void emitBillingEvent("paywall_dismissed", {
        feature_key: request.feature,
        placement: request.placement,
        trigger: request.trigger,
      });
    }
    checkoutRequestIdRef.current = null;
    checkoutAttemptRef.current = null;
    setRequest(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, [request]);

  async function checkout(planId: LitosPlusPlanId) {
    if (!request) return;
    if (!access?.account_id) {
      setError("Litos could not bind checkout to this account. Refresh your plan and try again.");
      return;
    }
    setCheckoutBusy(true);
    setError(null);
    try {
      const requestId = checkoutRequestIdRef.current ?? crypto.randomUUID();
      checkoutRequestIdRef.current = requestId;
      const attempt = contextualCheckoutAttempt(checkoutAttemptRef.current, requestId, planId);
      checkoutAttemptRef.current = attempt;
      request.onBeforeCheckout?.();
      track("plan_selected", { plan_id: planId, feature_key: request.feature, placement: request.placement });
      track("checkout_started", { plan_id: planId, feature_key: request.feature, placement: request.placement });
      const tiktokEventId = operationIdFor(tiktokCheckoutIdsRef.current, planId);
      sendTikTokEvent("InitiateCheckout", tiktokEventId, { plan_id: planId });
      void emitBillingEvent("upgrade_clicked", {
        feature_key: request.feature,
        placement: request.placement,
        trigger: request.trigger,
        plan_id: planId,
      });
      void emitBillingEvent("plan_selected", {
        feature_key: request.feature,
        placement: request.placement,
        trigger: request.trigger,
        plan_id: planId,
      });
      const action = attempt.action ?? await createPendingBillingAction({
        featureKey: request.feature,
        returnRoute: request.returnRoute ?? "/dashboard",
        applicationId: request.applicationId,
        jobId: request.jobId,
        contactId: request.contactId,
        idempotencyKey: attempt.actionIdempotencyKey,
      });
      attempt.action = action;
      const response = await createLitosPlusCheckout(planId, {
        surface: "dashboard",
        placement: request.placement,
        trigger: request.trigger,
        actionNonce: action.action_nonce,
        idempotencyKey: attempt.checkoutIdempotencyKey,
      });
      if (!response.offer_id) throw new Error("Checkout did not return a restorable offer.");
      rememberBillingReturnContext(response.offer_id, {
        actionNonce: action.action_nonce,
        accountId: access.account_id,
        returnRoute: request.returnRoute ?? action.return_route,
        expiresAt: response.expires_at,
      });
      track("checkout_opened", { plan_id: planId, feature_key: request.feature, placement: request.placement });
      void emitBillingEvent("checkout_opened", {
        feature_key: request.feature,
        placement: request.placement,
        trigger: request.trigger,
        plan_id: planId,
      });
      completeOperationId(tiktokCheckoutIdsRef.current, planId);
      window.location.assign(response.checkoutUrl);
    } catch (reason) {
      if (reason instanceof ApiError && isDefinitiveCheckoutError(reason.status)) {
        checkoutAttemptRef.current = null;
      }
      setError(reason instanceof Error ? reason.message : "Checkout could not open. Your work is saved. Try again.");
      setCheckoutBusy(false);
    }
  }

  const value = useMemo<BillingContextValue>(() => ({
    access,
    catalog,
    loading,
    error,
    canUse: (feature) => featureAccess(access, feature),
    refresh,
    openUpgrade,
  }), [access, catalog, error, loading, openUpgrade, refresh]);

  return (
    <BillingContext.Provider value={value}>
      {children}
      <UpgradeModal
        open={request !== null}
        request={request}
        access={access}
        catalog={catalog}
        busy={checkoutBusy}
        error={error}
        onClose={closeUpgrade}
        onRetryCatalog={() => void loadCatalog()}
        onCheckout={(planId) => void checkout(planId)}
      />
    </BillingContext.Provider>
  );
}

export function useBilling(): BillingContextValue {
  const value = useContext(BillingContext);
  if (!value) throw new Error("useBilling must be used inside BillingProvider.");
  return value;
}
