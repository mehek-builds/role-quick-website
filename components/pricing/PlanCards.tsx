"use client";

import { useEffect, useMemo, useState } from "react";
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
  litosPlusPlan,
  rememberBillingReturnContext,
  type EntitlementSnapshot,
  type LitosPlusPlanId,
  type PlanCatalog,
} from "@/features/billing";
import { getToken } from "@/lib/api";
import { track } from "@/lib/analytics";
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
  const [busy, setBusy] = useState(false);
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

  const plan = useMemo(() => litosPlusPlan(selected), [selected]);
  const extensionCheckout = checkoutSource === "extension";
  const paid = !extensionCheckout && isPaidAccess(access);
  const trial = !extensionCheckout && access?.access_class === "trial_plus";
  const plusLabel = extensionCheckout
    ? `Continue with ${plan.shortLabel}`
    : paid
    ? "Manage subscription"
    : !authenticated
      ? "Start 7-day trial"
      : trial
        ? "Choose Litos+"
        : `Continue with ${plan.shortLabel}`;

  function choose(planId: LitosPlusPlanId) {
    setSelected(planId);
    window.sessionStorage.setItem(SESSION_PLAN_KEY, planId);
    track("plan_selected", { plan_id: planId, source: "pricing" });
  }

  async function continueWithPlan() {
    window.sessionStorage.setItem(SESSION_PLAN_KEY, selected);
    if (!extensionCheckout && !authenticated) {
      window.location.assign(`/login?intent=litos-plus&plan=${selected}`);
      return;
    }
    if (paid) {
      window.location.assign("/dashboard/settings#plan");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      track("checkout_started", { plan_id: selected, source: extensionCheckout ? "extension" : "pricing", trigger: sourceTrigger });
      let checkoutUrl: string;
      if (extensionCheckout) {
        checkoutUrl = await createCheckoutThroughExtension({
          planId: selected,
          placement: "public_pricing",
          trigger: sourceTrigger,
          actionNonce,
        });
      } else {
        if (!access?.account_id) throw new Error("Litos could not bind checkout to this account. Refresh and try again.");
        const checkout = await createLitosPlusCheckout(selected, {
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
      setBusy(false);
    }
  }

  const canPurchase = extensionCheckout
    ? catalog?.checkoutAvailable === true
    : !authenticated || paid || catalog?.checkoutAvailable === true;

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <article className="flex flex-col rounded-card border border-teal/45 bg-teal-soft/35 p-6 sm:p-8">
        <p className="font-mono text-label uppercase tracking-[0.08em] text-teal-ink">Free</p>
        <div className="mt-5 flex items-end gap-2">
          <span className="font-mono text-section text-ink">$0</span>
          <span className="pb-1 font-mono text-machine text-muted">forever</span>
        </div>
        <h2 className="mt-6 text-heading font-[450] text-ink">Fill applications. Track every move.</h2>
        <p className="mt-2 text-body text-muted">Use the dashboard and supported sites without an application limit.</p>
        <ul className="mt-6 flex-1 space-y-3 text-small text-muted">
          {FREE_FEATURES.map((feature) => <li key={feature} className="flex gap-2.5"><span aria-hidden="true" className="text-teal-ink">+</span>{feature}</li>)}
        </ul>
        <ButtonLink href={authenticated ? "/dashboard/applications?new=1&intent=fill" : "/login?intent=start-free"} variant="secondary" block className="mt-7 border-teal text-teal-ink">Start free</ButtonLink>
        <p className="mt-3 text-center text-label text-muted">New accounts begin with a 7-day Litos+ trial. No card required.</p>
      </article>

      <article className="rounded-card border border-brand/45 bg-brand-soft/35 p-6 sm:p-8">
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div>
            <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Litos+</p>
            <h2 className="mt-5 text-heading font-[450] text-ink">Tailoring, outreach, insights, and automation for the search ahead.</h2>
            <p className="mt-2 text-body text-muted">The same full toolset is included in every paid term.</p>
            <ul className="mt-6 space-y-3 text-small text-muted">
              {PLUS_FEATURES.map((feature) => <li key={feature} className="flex gap-2.5"><span aria-hidden="true" className="text-brand-ink">+</span>{feature}</li>)}
            </ul>
          </div>

          <div>
            <fieldset className="space-y-3">
              <legend className="font-mono text-label uppercase tracking-[0.08em] text-muted">Choose a term</legend>
              {LITOS_PLUS_PLANS.map((candidate) => {
                const active = selected === candidate.id;
                return (
                  <label key={candidate.id} className={`relative mt-3 flex min-h-16 cursor-pointer items-center gap-3 rounded-inner border bg-surface px-4 py-3 ${active ? "border-brand-ink text-brand-ink" : "border-border text-ink"}`}>
                    <input type="radio" name="pricing-term" checked={active} onChange={() => choose(candidate.id)} className="size-4 accent-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-small font-medium">
                        {candidate.label}
                        {candidate.mostPopular && <span className="rounded-control bg-brand-soft px-2 py-0.5 font-mono text-label text-brand-ink">Most popular</span>}
                      </span>
                      <span className="mt-1 block font-mono text-machine text-muted">{candidate.daily}</span>
                    </span>
                    <span className="text-right font-mono text-machine text-ink">
                      <span className="block">{candidate.total}</span>
                      {candidate.savings && <span className="text-label text-brand-ink">Save {candidate.savings}%</span>}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <div className="mt-5 rounded-inner border border-brand/25 bg-surface p-4" aria-live="polite">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-machine text-muted">Due today</span>
                <span className="font-mono text-heading text-ink">{authenticated || extensionCheckout ? plan.total : "$0"}</span>
              </div>
              <p className="mt-3 font-mono text-machine text-ink">{authenticated || extensionCheckout
                ? plan.disclosure
                : `Selected paid term: ${plan.shortLabel} at ${plan.total}. After the trial, stay on Free unless you return and explicitly purchase.`}</p>
              <p className="mt-1 text-label text-muted">Savings compare each daily rate with the weekly daily rate.</p>
            </div>
            {error && <div className="mt-4"><ErrorNote message={error} /></div>}
            <Button type="button" block className="mt-5" disabled={busy || loading || !canPurchase} aria-busy={busy} onClick={() => void continueWithPlan()}>
              {busy ? <PendingLabel onColor>Opening Stripe</PendingLabel> : loading ? <PendingLabel onColor>Checking terms</PendingLabel> : plusLabel}
            </Button>
            <p className="mt-3 text-center text-label text-muted">{extensionCheckout
              ? "Stripe opens through the signed-in Litos extension, so the purchase stays with that extension account."
              : "No charge begins with the 7-day trial. Stripe opens only after a later, explicit purchase."}</p>
          </div>
        </div>
      </article>
    </div>
  );
}
