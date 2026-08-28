"use client";

/* 09 YOUR PLAN: the last rung, and the only one that asks for money.
 *
 * By the time a student reaches this they have picked a field, uploaded a resume, accepted a
 * match, watched it build, answered an employer and sent a real application. The student chooses
 * the renewal term here, and the exact charge sentence sits next to the button.
 *
 * THERE IS NO LONGER A WAY PAST THIS SCREEN WITHOUT CHECKOUT. Mehek's call 2026-08-19.
 * It used to carry a free-escape link, worded to CHOOSE rather than defer, next to a panel
 * describing what the free tier kept. Both are gone: a new account goes
 * seven-day trial then Litos+, and Free is somewhere you arrive by cancelling, not a fork
 * offered during setup. Leaving the control would have contradicted that, and leaving the
 * panel would have promised a tier the flow no longer hands out.
 *
 * Trial eligibility and the amount due come from the same account rule checkout uses. The screen
 * never promotes a trial until that personalized response says one is available.
 *
 * `onSettled` is NOT that control coming back. It fires only for an account that already
 * holds Litos+, which is how somebody returning from a completed Stripe checkout gets off
 * this screen instead of being sold the thing they just bought. It is deliberately not
 * optional: making it optional is what would let a caller quietly strand a paid student here.
 *
 * Continue goes straight to Stripe. The one line this build changes versus /pricing is the return
 * route: /pricing sends people back to the settings page, and setup has to come back to setup.
 */

import { useEffect, useRef, useState } from "react";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import {
  createLitosPlusCheckout,
  getPlanCatalog,
  getBillingState,
  isPaidAccess,
  isLitosPlusPlanId,
  rememberBillingReturnContext,
  type BillingCheckoutTerms,
  type LitosPlusPlanId,
  type PlanCatalog,
} from "@/features/billing";
import { track } from "@/lib/analytics";
import { sendTikTokEvent } from "@/lib/tiktok-client";
import { operationIdFor, completeOperationId } from "@/lib/operation-id";
import { PrimaryButton, StartShell } from "./ui";

export function PlanStep({ onSettled }: { onSettled: () => void }) {
  const [selected, setSelected] = useState<LitosPlusPlanId | null>(null);
  /* THE RETURN FROM STRIPE LANDS HERE, and without this it lands on a sales pitch.
   *
   * Paying navigates away to Stripe, so this screen never gets to acknowledge itself. /billing/return
   * sends the student back to /start, where the ledger still has `plan` outstanding and the flow
   * therefore renders this screen again - now to somebody who has just paid, offering to sell them
   * the same thing a second time. Reading the entitlement on mount and advancing when it is already
   * paid is what closes that loop, and it is also correct for anyone who bought from /pricing in
   * another tab. */
  const [settled, setSettled] = useState(false);
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = selected ? catalog?.plans.find((item) => item.id === selected) ?? null : null;
  const terms = selected ? catalog?.checkoutTerms[selected] ?? null : null;
  const tiktokCheckoutIdsRef = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    const saved = window.sessionStorage.getItem("litos_plus_selected_plan_v2");
    if (isLitosPlusPlanId(saved)) queueMicrotask(() => { if (!cancelled) setSelected(saved); });
    Promise.all([
      getBillingState().catch(() => null),
      getPlanCatalog(),
    ])
      .then(([access, nextCatalog]) => {
        if (cancelled) return;
        if (access && (isPaidAccess(access) || access.access_class === "trial_plus")) {
          track("onboarding_plan_already_paid", { access_class: access.access_class });
          /* The only way off this screen that is not the checkout button, and it fires for
             exactly one reason: this account already holds Litos+. Paying navigates away to
             Stripe, so this screen never gets to acknowledge itself; the return lands on
             /start with `plan` still outstanding and would render this same sales pitch to
             somebody who just bought it. */
          onSettled();
          return;
        }
        setCatalog(nextCatalog);
        if (Object.keys(nextCatalog.checkoutTerms).length === 0) {
          setError("Litos could not verify today's checkout terms. Refresh before continuing to Stripe.");
        }
        setSettled(true);
      })
      /* A failed read shows the plans rather than blocking the last screen of setup. The worst case
         is a paid account being offered a plan it already holds, which checkout itself refuses; the
         alternative is a student stuck on a spinner at the end of onboarding. */
      .catch(() => { if (!cancelled) setSettled(true); });
    return () => { cancelled = true; };
  }, [onSettled]);

  async function checkout() {
    if (!selected) {
      setError("Choose a renewal term before continuing to checkout.");
      return;
    }
    if (terms?.checkoutStatus === "claim_required") {
      track("onboarding_plan_claim_required", {});
      window.location.assign("/login?intent=claim&next=/start");
      return;
    }
    if (!terms || terms.checkoutStatus !== "available" || catalog?.checkoutAvailable !== true) {
      setError("Litos could not verify these checkout terms. Refresh before continuing to Stripe.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      track("checkout_started", { plan_id: selected, source: "onboarding", trigger: "start_plan" });
      const tiktokEventId = operationIdFor(tiktokCheckoutIdsRef.current, selected);
      sendTikTokEvent("InitiateCheckout", tiktokEventId, { plan_id: selected });
      const access = await getBillingState();
      if (!access?.account_id) throw new Error("Litos could not bind checkout to this account. Refresh and try again.");
      const session = await createLitosPlusCheckout(selected, {
        surface: "website",
        placement: "onboarding",
        trigger: "start_plan",
        checkoutTermsRevision: terms.revision,
      });
      if (!session.offer_id) throw new Error("Checkout did not return a restorable offer.");
      /* THE ONE LINE THIS BUILD CHANGES. /pricing returns to /dashboard/settings#plan; setup has to
         come back to setup so a completed purchase lands on the last screen of the flow rather
         than dropping the student into an account page they have never seen. */
      rememberBillingReturnContext(session.offer_id, {
        accountId: access.account_id,
        returnRoute: "/start",
        expiresAt: session.expires_at,
      });
      completeOperationId(tiktokCheckoutIdsRef.current, selected);
      window.location.assign(session.checkoutUrl);
    } catch (reason) {
      /* A GUEST CANNOT PAY YET, AND THIS IS THE ONLY WAY OUT OF THE PAYMENT GATE.
       *
       * /billing/checkout refuses a guest outright with `claim_required`: Stripe needs
       * an email and a guest account has none. Guests are NOT exempt from the gate, so
       * without this branch the screen is a dead end -- the dashboard sends a gated
       * guest here, and the only control on the page returns a 409 they cannot act on.
       * Claiming an email converts the guest into a real account, after which checkout
       * behaves like anyone else's, so the gate is not bypassed by this, only entered
       * one step earlier. Returning to /start puts them back on this screen able to pay. */
      const code = (reason as { data?: { code?: string } } | null)?.data?.code;
      if (code === "checkout_terms_changed") {
        const nextCatalog = await getPlanCatalog();
        setCatalog(nextCatalog);
        setSelected(null);
        window.sessionStorage.removeItem("litos_plus_selected_plan_v2");
        setError("Your checkout terms changed. Choose a term again to review the current amount before opening Stripe.");
        setBusy(false);
        return;
      }
      if (code === "claim_required") {
        track("onboarding_plan_claim_required", {});
        window.location.assign("/login?intent=claim&next=/start");
        return;
      }
      setError(reason instanceof Error ? reason.message : "Checkout could not open. Nothing was charged.");
      setBusy(false);
    }
  }

  if (!settled) {
    /* Held until the entitlement is known. Rendering the plans first and advancing a moment later
       would flash a sales pitch at somebody who has just paid for it, which is the exact moment
       this product can least afford to look like it was not listening. */
    return (
      <StartShell step="plan" title="Checking your Litos+ terms.">
        <div className="rq-shimmer h-24 rounded-inner" />
      </StartShell>
    );
  }

  const canCheckout = catalog?.checkoutAvailable === true && terms?.checkoutStatus === "available";
  const needsClaim = terms?.checkoutStatus === "claim_required";
  const termsCopy = checkoutTermsCopy(terms);

  return (
    <StartShell step="plan" title="Choose your Litos+ term.">
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {(catalog?.plans ?? []).map((option) => {
          const on = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setSelected(option.id);
                setError(null);
                window.sessionStorage.setItem("litos_plus_selected_plan_v2", option.id);
              }}
              className={`flex flex-col gap-0.5 rounded-inner border p-3.5 text-left transition-colors ${
                on ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-brand"
              }`}
            >
              <span className="text-[13px] text-ink">{option.label}</span>
              <span className="font-mono text-[17px] tabular-nums text-ink">{option.total}</span>
              <span className="font-mono text-[11px] text-muted">{option.daily}</span>
              {on && <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-brand-ink">Selected</span>}
            </button>
          );
        })}
      </div>

      {/* The due amount is never read from the local display catalog. It comes from the signed-in
          checkout preview, which uses the same account eligibility rule as the Stripe route. */}

      {/* WAS a two-row "If you do nothing / You keep / You lose" table promising the
          student unlimited filling, free with no time limit, if they simply did not act.
          That was true when doing nothing meant declining a purchase. It is the opposite
          of true now: an eligible trial converts on its own, so doing nothing
          is the path that gets charged. Replaced with the one sentence that matters
          rather than re-explaining the tiers on the screen that opens checkout. */}
      <div className="sticky bottom-[var(--keyboard-inset)] z-20 -mx-4 mt-6 border-t border-border bg-white/95 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <p id="onboarding-plan-terms" className="text-[13px] leading-6 text-muted">
          {plan ? termsCopy : "Choose a renewal term to load the amount due in Stripe and when renewal begins."}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <PrimaryButton
            onClick={() => void checkout()}
            disabled={busy || !plan || (!canCheckout && !needsClaim)}
            aria-describedby="onboarding-plan-terms"
            className="w-full sm:w-auto"
          >
            {busy
              ? <PendingLabel onColor>Opening checkout...</PendingLabel>
              : !plan
                ? "Choose a term"
                : needsClaim
                  ? "Claim account to continue"
                  : terms?.trialEligible
                    ? "Add payment method and start trial"
                    : "Review and pay in Stripe"}
          </PrimaryButton>
        </div>
      </div>
    </StartShell>
  );
}

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function renewalCadence(terms: BillingCheckoutTerms): string {
  if (terms.renewal.interval === "week") return "every week";
  return terms.renewal.intervalCount === 3 ? "every 3 months" : "every month";
}

function checkoutTermsCopy(terms: BillingCheckoutTerms | null): string {
  if (!terms) return "The current checkout amount could not be verified. Refresh before continuing to Stripe.";
  if (terms.checkoutStatus === "claim_required") {
    return "Claim this account first so Litos can check trial eligibility and show the amount due before Stripe opens.";
  }
  if (terms.checkoutStatus === "already_plus") return "Litos+ is already active on this account.";
  if (terms.checkoutStatus === "billing_recovery_required") {
    return "This account has a billing issue to resolve before another checkout can start.";
  }
  if (terms.checkoutStatus !== "available") return "Secure checkout is temporarily unavailable. Nothing has been charged.";

  const regular = usd(terms.renewal.regularSubtotalCents);
  const qualifier = "before any applicable tax or promotion";
  if (terms.trialEligible && terms.trialDays) {
    return `$0 is due when you complete Stripe checkout. A payment method is required. The regular ${regular} price, ${qualifier}, is first charged ${terms.trialDays} days after checkout completes, then renews ${renewalCadence(terms)}. Cancel in Account before the trial ends to avoid that charge.`;
  }
  return `The regular ${regular} price is due when you complete Stripe checkout, ${qualifier}. A payment method is required, and the plan renews ${renewalCadence(terms)} until canceled in Account.`;
}
