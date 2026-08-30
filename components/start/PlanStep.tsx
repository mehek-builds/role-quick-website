"use client";

/* 09 YOUR PLAN: the last rung, and the only one that asks for money.
 *
 * By the time a student reaches this they have picked a field, uploaded a resume, accepted a
 * match, watched it build, answered an employer and sent a real application. The plan is
 * pre-selected because that is a default rather than a trick, and the exact charge sentence sits
 * next to the button rather than behind a tooltip.
 *
 * THERE IS NO LONGER A WAY PAST THIS SCREEN WITHOUT A CARD. Mehek's call 2026-08-19.
 * It used to carry a free-escape link, worded to CHOOSE rather than defer, next to a panel
 * describing what the free tier kept. Both are gone: a new account goes
 * seven-day trial then Litos+, and Free is somewhere you arrive by cancelling, not a fork
 * offered during setup. Leaving the control would have contradicted that, and leaving the
 * panel would have promised a tier the flow no longer hands out.
 *
 * The trial itself is the softener now and it is a real one -- seven days, nothing charged,
 * cancel in one click -- which is on the screen in the sentence above the button.
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
  DEFAULT_LITOS_PLUS_PLAN_ID,
  LITOS_PLUS_PLANS,
  createLitosPlusCheckout,
  getBillingState,
  isPaidAccess,
  litosPlusPlan,
  rememberBillingReturnContext,
  type LitosPlusPlanId,
} from "@/features/billing";
import { track } from "@/lib/analytics";
import { sendTikTokEvent, trackTikTokPixelEvent } from "@/lib/tiktok-client";
import { operationIdFor, completeOperationId } from "@/lib/operation-id";
import { PrimaryButton, StartShell } from "./ui";

export function PlanStep({ onSettled }: { onSettled: () => void }) {
  const [selected, setSelected] = useState<LitosPlusPlanId>(DEFAULT_LITOS_PLUS_PLAN_ID);
  /* THE RETURN FROM STRIPE LANDS HERE, and without this it lands on a sales pitch.
   *
   * Paying navigates away to Stripe, so this screen never gets to acknowledge itself. /billing/return
   * sends the student back to /start, where the ledger still has `plan` outstanding and the flow
   * therefore renders this screen again - now to somebody who has just paid, offering to sell them
   * the same thing a second time. Reading the entitlement on mount and advancing when it is already
   * paid is what closes that loop, and it is also correct for anyone who bought from /pricing in
   * another tab. */
  const [settled, setSettled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = litosPlusPlan(selected);
  const tiktokCheckoutIdsRef = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    getBillingState()
      .then((access) => {
        if (cancelled) return;
        if (isPaidAccess(access)) {
          track("onboarding_plan_already_paid", {});
          /* The only way off this screen that is not the checkout button, and it fires for
             exactly one reason: this account already holds Litos+. Paying navigates away to
             Stripe, so this screen never gets to acknowledge itself; the return lands on
             /start with `plan` still outstanding and would render this same sales pitch to
             somebody who just bought it. */
          onSettled();
          return;
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
    setBusy(true);
    setError(null);
    try {
      track("checkout_started", { plan_id: selected, source: "onboarding", trigger: "start_plan" });
      const tiktokEventId = operationIdFor(tiktokCheckoutIdsRef.current, selected);
      sendTikTokEvent("InitiateCheckout", tiktokEventId, { plan_id: selected });
      trackTikTokPixelEvent("InitiateCheckout", tiktokEventId, { plan_id: selected });
      const access = await getBillingState();
      if (!access?.account_id) throw new Error("Litos could not bind checkout to this account. Refresh and try again.");
      const session = await createLitosPlusCheckout(selected, {
        surface: "website",
        placement: "onboarding",
        trigger: "start_plan",
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
      <StartShell step="plan" title="What happens after the seven days.">
        <div className="rq-shimmer h-24 rounded-inner" />
      </StartShell>
    );
  }

  return (
    <StartShell step="plan" title="What happens after the seven days.">
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {LITOS_PLUS_PLANS.map((option) => {
          const on = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() => setSelected(option.id)}
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

      {/* plan.disclosure USED TO SIT HERE and it said "$89.99 today", which stopped being
          true when the card started a trial instead of a purchase: nothing is taken for
          seven days. It also contradicted the sentence below it, on the one screen in the
          product where being wrong about money costs the most. The terms line below says
          the whole thing correctly -- free for seven days, then the price, cancel before
          then -- so this is one sentence now rather than two that disagree. */}

      {/* WAS a two-row "If you do nothing / You keep / You lose" table promising the
          student unlimited filling, free with no time limit, if they simply did not act.
          That was true when doing nothing meant declining a purchase. It is the opposite
          of true now: the card starts a trial that converts on its own, so doing nothing
          is the path that gets charged. Replaced with the one sentence that matters
          rather than re-explaining the tiers on the screen that takes the card. */}
      <p className="mt-6 text-[13px] leading-6 text-muted">
        Free for seven days. After that, Litos+ continues at {plan.total} {plan.renewal}.
        Cancel in Account, in one click, any time before then and you are not charged.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <PrimaryButton onClick={() => void checkout()} disabled={busy}>
          {busy ? <PendingLabel onColor>Opening checkout...</PendingLabel> : `Continue with ${plan.shortLabel}`}
        </PrimaryButton>
      </div>
    </StartShell>
  );
}
