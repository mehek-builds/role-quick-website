"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/app/Button";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import {
  DEFAULT_LITOS_PLUS_PLAN_ID,
  FREE_FEATURES,
  LITOS_PLUS_PLANS,
  PLUS_FEATURES,
  createLitosPlusCheckout,
  getBillingState,
  getPlanCatalog,
  isLitosPlusPlanId,
  isPaidAccess,
  rememberBillingReturnContext,
  type EntitlementSnapshot,
  type LitosPlusPlanId,
  type PlanCatalog,
} from "@/features/billing";
import { getToken } from "@/lib/api";
import { track } from "@/lib/analytics";
import { sendTikTokEvent } from "@/lib/tiktok-client";
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
  const paid = !extensionCheckout && isPaidAccess(access);

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
      sendTikTokEvent("InitiateCheckout", crypto.randomUUID(), { plan_id: planId });
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
        const trial = access?.access_class === "trial_plus";
        const checkout = await createLitosPlusCheckout(planId, {
          surface: "website",
          placement: "public_pricing",
          trigger: trial ? "trial_early_purchase" : sourceTrigger,
        });
        if (!checkout.offer_id) throw new Error("Checkout did not return a restorable offer.");
        rememberBillingReturnContext(checkout.offer_id, {
          accountId: access.account_id,
          returnRoute: "/dashboard/settings#plan",
          expiresAt: checkout.expires_at,
        });
        checkoutUrl = checkout.checkoutUrl;
      }
      window.location.assign(checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Checkout could not open. Nothing was charged.");
      setBusyPlan(null);
    }
  }

  const canPurchase = extensionCheckout
    ? catalog?.checkoutAvailable === true
    : !authenticated || paid || catalog?.checkoutAvailable === true;

  return (
    <div>
      {/* Four columns, one per thing you can actually choose. The terms used to
          sit inside a single Litos+ card as radio rows, which made the page
          read as two products where there are four prices; a term is not a
          setting on a plan, it is the plan. The Litos+ feature list repeats in
          every paid column on purpose: identical lists side by side are the
          fastest way to show that only the length of access changes. */}
      <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-4">
        <article className="flex flex-col rounded-card border border-teal/45 bg-teal-soft/35 p-6">
          <p className="flex min-h-6 items-center font-mono text-label uppercase tracking-[0.08em] text-teal-ink">Free</p>
          <h2 className="mt-4 min-h-14 text-heading font-[450] text-ink">Fill applications. Track every move.</h2>
          <div className="mt-5 flex items-end gap-2">
            <span className="font-mono text-section text-ink">$0</span>
            <span className="pb-1 font-mono text-machine text-muted">forever</span>
          </div>
          <p className="mt-4 min-h-14 font-mono text-machine text-muted">No application limit, in the dashboard or on supported sites.</p>
          <ButtonLink
            href={authenticated ? "/dashboard/applications?new=1&intent=fill" : "/login?intent=start-free"}
            variant="secondary"
            block
            className="mt-6 border-teal text-teal-ink"
          >
            Start free
          </ButtonLink>
          {/* No trial claim sits here any more. Whether a new account opens on a trial
              depends on the card gate (CARD_GATE_FROM on the backend): with it off a
              student can finish setup on Free and never start one, so a sentence
              promising a trial to "new accounts" is only true half the time. The paid
              columns say what a trial costs and when it renews, which is true always. */}
          <p className="mt-3 min-h-10 text-center text-label text-muted" />
          <ul className="mt-6 flex-1 space-y-2.5 text-small text-muted">
            {FREE_FEATURES.map((feature) => <li key={feature} className="flex gap-2.5"><span aria-hidden="true" className="text-teal-ink">+</span>{feature}</li>)}
          </ul>
        </article>

        {LITOS_PLUS_PLANS.map((plan) => {
          const busy = busyPlan === plan.id;
          const preselected = selected === plan.id;
          const label = paid
            ? "Manage subscription"
            : !authenticated && !extensionCheckout
              ? "Start 7-day trial"
              : `Continue with ${plan.shortLabel}`;
          return (
            <article
              key={plan.id}
              aria-label={`Litos+, ${plan.label}`}
              className={`flex flex-col rounded-card border bg-brand-soft/35 p-6 ${plan.mostPopular ? "border-brand-ink" : "border-brand/45"}${preselected ? " ring-1 ring-brand-ink" : ""}`}
            >
              <div className="flex min-h-6 items-center justify-between gap-2">
                <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Litos+</p>
                {plan.mostPopular && <span className="rounded-control bg-brand-soft px-2 py-0.5 font-mono text-label text-brand-ink">Most popular</span>}
              </div>
              <h2 className="mt-4 min-h-14 text-heading font-[450] text-ink">{plan.label}</h2>
              <div className="mt-5 flex items-end gap-2">
                <span className="font-mono text-section text-ink">{plan.total}</span>
                <span className="pb-1 font-mono text-machine text-muted">{plan.daily}</span>
              </div>
              <p className="mt-4 min-h-14 font-mono text-machine text-muted">
                {plan.savings ? `Save ${plan.savings}% against the weekly rate.` : "The shortest term, for a search you expect to close fast."}
              </p>
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
                Due today {authenticated || extensionCheckout ? plan.total : "$0"}. {authenticated || extensionCheckout
                  ? `Renews ${plan.renewal} until canceled.`
                  : `Then ${plan.total} ${plan.renewal}. Cancel any time.`}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5 text-small text-muted">
                {PLUS_FEATURES.map((feature) => <li key={feature} className="flex gap-2.5"><span aria-hidden="true" className="text-brand-ink">+</span>{feature}</li>)}
              </ul>
            </article>
          );
        })}
      </div>

      {error && <div className="mt-5"><ErrorNote message={error} /></div>}
      <p className="mt-5 text-center text-label text-muted">
        Savings compare each daily rate with the weekly daily rate. {extensionCheckout
          ? "Stripe opens through the signed-in Litos extension, so the purchase stays with that extension account."
          : "Nothing is charged for 7 days. Cancel any time."}
      </p>
    </div>
  );
}
