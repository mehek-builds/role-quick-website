"use client";

/* 09 YOUR PLAN: the last rung, and the only one that asks for money.
 *
 * By the time a student reaches this they have picked a field, uploaded a resume, accepted a
 * match, watched it build, answered an employer and sent a real application. The plan is
 * pre-selected because that is a default rather than a trick, and the exact charge sentence sits
 * next to the button rather than behind a tooltip.
 *
 * THE WORD THAT CHANGES. Every other screen's escape says "Finish later" because it defers this
 * one does not, it CHOOSES, so it reads "Continue on Free". A control that misnames what it does
 * is the dark pattern; the pre-selection is not.
 *
 * WHAT FREE ACTUALLY KEEPS is on the screen, and it weakens the ask on purpose. Unlimited filling,
 * the jobs board, the match scores, the resume just sent and every tracker receipt all survive,
 * and a paywall implying otherwise would contradict the product's own positioning.
 *
 * Continue goes straight to Stripe. The one line this build changes versus /pricing is the return
 * route: /pricing sends people back to the settings page, and setup has to come back to setup.
 */

import { useEffect, useState } from "react";
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
import { PrimaryButton, StartShell } from "./ui";

export function PlanStep({ onFree }: { onFree?: () => void }) {
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

  useEffect(() => {
    let cancelled = false;
    getBillingState()
      .then((access) => {
        if (cancelled) return;
        if (isPaidAccess(access)) {
          track("onboarding_plan_already_paid", {});
          /* Advancing a student who has ALREADY paid is not the Free path, it just shares
             the callback. With the card gate on, onFree is withheld and the refresh that
             follows checkout is what moves them: the server has the card by then, so the
             flow no longer stops here. */
          onFree?.();
          return;
        }
        setSettled(true);
      })
      /* A failed read shows the plans rather than blocking the last screen of setup. The worst case
         is a paid account being offered a plan it already holds, which checkout itself refuses; the
         alternative is a student stuck on a spinner at the end of onboarding. */
      .catch(() => { if (!cancelled) setSettled(true); });
    return () => { cancelled = true; };
  }, [onFree]);

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      track("checkout_started", { plan_id: selected, source: "onboarding", trigger: "start_plan" });
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

      {/* Adjacent to the button, never behind a tooltip. */}
      <p className="mt-3 font-mono text-[11px] leading-6 text-muted">
        {plan.disclosure} Cancel in Account, in one click, at any time.
      </p>

      <div className="mt-6 overflow-hidden rounded-inner border border-border">
        <header className="border-b border-border bg-surface-alt px-4 py-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">If you do nothing</span>
        </header>
        <div className="grid grid-cols-1 gap-1 border-b border-border px-4 py-3 text-[13px] sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-4">
          <span className="text-ink">You keep</span>
          <span className="leading-6 text-muted">
            Unlimited application filling, your jobs and match scores, the resume you just sent, and
            every tracker receipt. Free, with no time limit.
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1 px-4 py-3 text-[13px] sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-4">
          <span className="text-ink">You lose</span>
          <span className="leading-6 text-muted">
            New tailored resumes, new cover letters, generated answers and contact discovery, when
            the seven days end.
          </span>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <PrimaryButton onClick={() => void checkout()} disabled={busy}>
          {busy ? <PendingLabel onColor>Opening checkout...</PendingLabel> : `Continue with ${plan.shortLabel}`}
        </PrimaryButton>
        {/* Not "Finish later". This one chooses. Absent entirely when the account has no
            card on file: there is nothing for it to choose, because Free is behind the
            same gate, and a control that cannot do what it says is worse than no control. */}
        {onFree && (
          <button
            type="button"
            onClick={() => { track("onboarding_plan_declined", {}); onFree(); }}
            disabled={busy}
            className="text-sm text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
          >
            Continue on Free
          </button>
        )}
      </div>
    </StartShell>
  );
}
