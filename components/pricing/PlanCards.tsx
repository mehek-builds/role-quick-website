"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/app/Button";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import {
  DEFAULT_LITOS_PLUS_PLAN_ID,
  LITOS_PLUS_PLANS,
  PLUS_FEATURES,
  createLitosPlusCheckout,
  getBillingState,
  getPlanCatalog,
  holdsLitosPlusAccess,
  isLitosPlusPlanId,
  rememberBillingReturnContext,
  zeroDue,
  type EntitlementSnapshot,
  type LitosPlusPlanId,
  type PlanCatalog,
} from "@/features/billing";
import { getToken } from "@/lib/api";
import { track } from "@/lib/analytics";
import { sendTikTokEvent, trackTikTokPixelEvent } from "@/lib/tiktok-client";
import { operationIdFor, completeOperationId } from "@/lib/operation-id";
import { createCheckoutThroughExtension } from "@/lib/extension-bridge";

const SESSION_PLAN_KEY = "litos_plus_selected_plan_v2";

export function PlanCards() {
  const [selected, setSelected] = useState<LitosPlusPlanId>(DEFAULT_LITOS_PLUS_PLAN_ID);
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null);
  const [access, setAccess] = useState<EntitlementSnapshot | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [checkoutSource, setCheckoutSource] = useState<"website" | "extension">("website");
  const [sourceTrigger, setSourceTrigger] = useState("pricing_plan");
  const [actionNonce, setActionNonce] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<LitosPlusPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tiktokCheckoutIdsRef = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    const params = new URLSearchParams(window.location.search);
    const fromExtension = params.get("surface") === "extension";
    const nextTrigger = params.get("trigger") || (fromExtension ? "extension_pricing" : "pricing_plan");
    const nextActionNonce = fromExtension ? params.get("action_nonce") : null;
    const requested = params.get("plan") ?? window.sessionStorage.getItem(SESSION_PLAN_KEY);
    queueMicrotask(() => {
      if (cancelled) return;
      if (isLitosPlusPlanId(requested)) setSelected(requested);
      setAuthenticated(Boolean(token));
      setCheckoutSource(fromExtension ? "extension" : "website");
      setSourceTrigger(nextTrigger);
      setActionNonce(nextActionNonce);
    });
    track("pricing_viewed", { source_route: "/pricing", authenticated: Boolean(token), source: fromExtension ? "extension" : "website" });
    Promise.all([getPlanCatalog(), token && !fromExtension ? getBillingState() : Promise.resolve(null)])
      .then(([nextCatalog, nextAccess]) => {
        if (cancelled) return;
        setCatalog(nextCatalog);
        setAccess(nextAccess);
        setError(nextCatalog.checkoutAvailable ? null : "Secure checkout is temporarily unavailable. The exact plan terms are still shown below.");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Litos could not verify checkout.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const extensionCheckout = checkoutSource === "extension";
  /* holdsLitosPlusAccess, not isPaidAccess: a trialing account is not "paid" for feature-gating
     purposes, but the backend refuses a second checkout for it exactly like a paid one
     (routes/billing.ts's already-has-Litos+ guard), so offering this button to a trial account
     was a guaranteed 409 with no redirect to catch it. */
  const paid = !extensionCheckout && holdsLitosPlusAccess(access);

  /* Each term now owns its own button, so the term is an argument rather than
     a piece of state read back after a setState that has not flushed. The
     session key still records the last term touched: /login and the extension
     both read it to come back to the column the student was standing on. */
  async function continueWithPlan(planId: LitosPlusPlanId) {
    setSelected(planId);
    window.sessionStorage.setItem(SESSION_PLAN_KEY, planId);
    track("plan_selected", { plan_id: planId, source: "pricing" });
    if (!extensionCheckout && !authenticated) {
      window.location.assign(`/login?intent=litos-plus&plan=${planId}`);
      return;
    }
    if (paid) {
      window.location.assign("/dashboard/settings#plan");
      return;
    }
    setBusyPlan(planId);
    setError(null);
    try {
      track("checkout_started", { plan_id: planId, source: extensionCheckout ? "extension" : "pricing", trigger: sourceTrigger });
      const tiktokEventId = operationIdFor(tiktokCheckoutIdsRef.current, planId);
      sendTikTokEvent("InitiateCheckout", tiktokEventId, { plan_id: planId });
      trackTikTokPixelEvent("InitiateCheckout", tiktokEventId, { plan_id: planId });
      let checkoutUrl: string;
      if (extensionCheckout) {
        checkoutUrl = await createCheckoutThroughExtension({
          planId,
          placement: "public_pricing",
          trigger: sourceTrigger,
          actionNonce,
        });
      } else {
        if (!access?.account_id) throw new Error("Litos could not bind checkout to this account. Refresh and try again.");
        const checkout = await createLitosPlusCheckout(planId, {
          surface: "website",
          placement: "public_pricing",
          trigger: sourceTrigger,
        });
        if (!checkout.offer_id) throw new Error("Checkout did not return a restorable offer.");
        rememberBillingReturnContext(checkout.offer_id, {
          accountId: access.account_id,
          returnRoute: "/dashboard/settings#plan",
          expiresAt: checkout.expires_at,
        });
        checkoutUrl = checkout.checkoutUrl;
      }
      completeOperationId(tiktokCheckoutIdsRef.current, planId);
      window.location.assign(checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Checkout could not open. Nothing was charged.");
      setBusyPlan(null);
    }
  }

  /* Named once here so the footnote quotes the same localized figures the card does, rather
     than a second hardcoded copy of them that a currency switch would silently falsify. */
  const discounted = (catalog?.plans ?? LITOS_PLUS_PLANS).find((plan) => plan.discountLabel && plan.listTotal) ?? null;

  const canPurchase = extensionCheckout
    ? catalog?.checkoutAvailable === true
    : !authenticated || paid || catalog?.checkoutAvailable === true;

  return (
    <div>
      {/* Three columns, one per thing you can actually choose. The terms used to
          sit inside a single Litos+ card as radio rows, which made the page
          read as one product with a setting on it; a term is not a setting on a
          plan, it is the plan. The Litos+ feature list repeats in every column
          on purpose: identical lists side by side are the fastest way to show
          that only the length of access changes.

          THERE IS NO FREE COLUMN, and it is not an oversight. Mehek's call
          2026-09-08: Free is not something Litos offers here. It is where an
          account lands by cancelling, which is the same position /start has
          taken since the card gate went in, so a column selling it on the
          checkout page contradicted the only other screen that quotes a price.
          Free still exists as an ACCESS CLASS on the backend and still appears
          in the in-app upgrade modal's comparison; what is gone is offering it
          as a choice at the point of sale. */}
      <div className="grid items-stretch gap-4 md:grid-cols-3">
        {(catalog?.plans ?? LITOS_PLUS_PLANS).map((plan) => {
          const busy = busyPlan === plan.id;
          const preselected = selected === plan.id;
          /* "Get Started" is the approved label and it is what almost everyone sees. The two
             exceptions stay, because both name a different destination than the one that
             phrase promises: a paid account's button opens Account, and a signed-out visitor's
             opens the trial rather than a charge. */
          const label = paid
            ? "Manage subscription"
            : !authenticated && !extensionCheckout
              ? "Start 7-day trial"
              : "Get Started";
          return (
            <article
              key={plan.id}
              aria-label={`Litos+, ${plan.label}`}
              className={`flex flex-col rounded-card border bg-brand-soft/35 p-6 ${plan.mostPopular ? "border-brand-ink" : "border-brand/45"}${preselected ? " ring-1 ring-brand-ink" : ""}`}
            >
              <div className="flex min-h-6 items-center gap-2">
                <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Litos+</p>
                {plan.mostPopular && <span className="rounded-control bg-brand-ink px-2 py-0.5 font-mono text-label text-surface">Popular</span>}
              </div>
              <h2 className="mt-4 text-heading font-[450] text-ink">{plan.label}</h2>
              {/* Who the plan is for, immediately under its name and above the price, which is
                  the order the approved layout reads in. min-h keeps the four columns' prices on
                  one line when one audience sentence wraps and another does not. */}
              <p className="mt-2 min-h-10 text-small text-muted">{plan.audience}</p>
              <div className="mt-5 flex min-h-10 items-end gap-3">
                <span className="font-mono text-section text-ink">{plan.total}</span>
                {plan.discountLabel && plan.listTotal ? (
                  <span className="pb-1 flex flex-col leading-tight">
                    <span className="font-mono text-machine text-brand-ink">{plan.discountLabel}</span>
                    <span className="font-mono text-machine text-muted line-through">{plan.listTotal}</span>
                  </span>
                ) : (
                  <span className="pb-1 font-mono text-machine text-muted">{plan.daily}</span>
                )}
              </div>
              <p className="mt-4 min-h-11 font-mono text-machine text-muted">{plan.applicationsLine}</p>
              <Button
                type="button"
                block
                className="mt-6"
                disabled={busy || loading || !canPurchase}
                aria-busy={busy}
                onClick={() => void continueWithPlan(plan.id)}
              >
                {busy ? <PendingLabel onColor>Opening Stripe</PendingLabel> : loading ? <PendingLabel onColor>Checking terms</PendingLabel> : label}
              </Button>
              <p className="mt-3 min-h-10 text-center text-label text-muted" aria-live="polite">
                Due today {authenticated || extensionCheckout ? plan.total : zeroDue(catalog?.currency ?? "USD")}. {authenticated || extensionCheckout
                  ? `Renews ${plan.renewal} until canceled.`
                  : `Then ${plan.total} ${plan.renewal}. Cancel any time.`}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5 text-small text-muted">
                {PLUS_FEATURES.map((feature) => <li key={feature} className="flex gap-2.5"><span aria-hidden="true" className="text-brand-ink">+</span>{feature}</li>)}
              </ul>
              <p className="mt-6 border-t border-brand/25 pt-5 text-small text-muted">{plan.closer}</p>
            </article>
          );
        })}
      </div>

      {error && <div className="mt-5"><ErrorNote message={error} /></div>}
      <p className="mt-5 text-center text-label text-muted">
        {discounted ? `${discounted.discountLabel} is against the ${discounted.listTotal} undiscounted ${discounted.label.toLowerCase()} rate. ` : ""}{extensionCheckout
          ? "Stripe opens through the signed-in Litos extension, so the purchase stays with that extension account."
          : "Nothing is charged for 7 days. Cancel any time."}
      </p>
    </div>
  );
}
