"use client";

/* 07 YOUR TRIAL: the gift beat, in the frame right after the application went out.
 *
 * THE PREMISE THIS SCREEN WAS BUILT ON IS GONE, and walking production on 2026-08-19 is what
 * showed it. The seven days used to be granted at account creation, which is what made "already
 * on your account" literally true. They are a Stripe subscription with a card attached now,
 * opened from the checkout on the NEXT screen, so an account arriving here holds no trial at all.
 * The line said otherwise, the five meters below it all read "Not recorded" because there was no
 * trial to meter, and the whole thing sat one screen ahead of the paywall - the worst possible
 * place in this product to be caught saying something that is not so.
 *
 * The gift is still real, and it is still a gift: seven days in which nothing is charged. What
 * changed is only WHEN it starts, so the screen now says what is waiting rather than what is held.
 *
 * WHERE THE GIFT STAYS HONEST. The meters sit on the same screen as the figure, not behind a
 * link, because this trial is metered and Cal AI's is not: seven days of "unlimited" would be
 * selling a different product than the one that arrives. Before the trial exists they are what it
 * INCLUDES; once an account holds one they go back to counting what is LEFT, which is the only
 * honest reading of a number on a screen a returning student can also reach.
 *
 * The title does not assert the send either. Review offers two ways forward and one of them is
 * "Save it and send later", so "Sent." was a false statement about the student's own last action
 * whenever they took it. It is told, not assumed.
 */

import { useEffect, useState } from "react";
import {
  getBillingState,
  getPlanCatalog,
  type BillingCheckoutTerms,
  type EntitlementSnapshot,
  type PlanCatalog,
} from "@/features/billing";
import { localDayKeyOf } from "@/lib/local-day";
import { PrimaryButton, Receipt, StartShell } from "./ui";
import { track } from "@/lib/analytics";

/* MIRRORS TRIAL_LIMITS in the backend's lib/entitlements.ts, and it is a mirror rather than a read
   because the numbers have to be printable BEFORE an account holds a trial - there is no snapshot
   to read them from at that point. Kept beside the assertion in tests/trial-screen-limits.test.mjs
   so a change on that side shows up as a failure here rather than as a wrong number on the screen
   one step ahead of the paywall. */
const TRIAL_INCLUDES = {
  tailored_resumes: 5,
  cover_letters: 5,
  answer_applications: 5,
  outreach_companies: 5,
} as const;

/* The student's OWN calendar day, never the UTC one.
 *
 * A trial ending "2026-08-26" read off toISOString is the UTC day, and UTC midnight is 4 PM ET.
 * For the primary market that prints the wrong date for eight hours of every day, on the one
 * number this screen exists to be trusted about. localDayKeyOf is the codebase's existing
 * conversion for exactly this, and using anything else here reintroduces ISSUE-035. */
function endsLabel(access: EntitlementSnapshot | null): string {
  return localDayKeyOf(access?.trial?.ends_at) ?? "Not recorded";
}

export function TrialStep({ onContinue, sent }: { onContinue: () => void; sent: boolean }) {
  const [access, setAccess] = useState<EntitlementSnapshot | null>(null);
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getBillingState(), getPlanCatalog()])
      .then(([stateResult, catalogResult]) => {
        if (cancelled) return;
        if (stateResult.status === "fulfilled") setAccess(stateResult.value);
        if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value);
        const hasTerms = catalogResult.status === "fulfilled"
          && Object.keys(catalogResult.value.checkoutTerms).length > 0;
        const activeTrial = stateResult.status === "fulfilled"
          && stateResult.value.access_class === "trial_plus"
          && stateResult.value.trial?.active === true;
        setStatus(hasTerms || activeTrial ? "ready" : "error");
      });
    track("onboarding_trial_shown", {});
    return () => { cancelled = true; };
  }, []);

  const holdsTrial = access?.access_class === "trial_plus" && access.trial?.active === true;
  const usage = holdsTrial && access.trial?.meter_policy === "litos_plus_v2_lifetime" ? access.trial : null;
  const terms = firstCheckoutTerms(catalog);
  const offeredTrial = status === "ready"
    && terms?.checkoutStatus === "available"
    && terms.trialEligible === true
    && Boolean(terms.trialDays);
  /* What is LEFT for an account that holds a trial, and what the seven days INCLUDE for one that
     does not yet. Five rows of "Not recorded" is what this screen printed before the trial existed,
     which reads as a system that has lost track of the thing it is in the middle of offering. */
  const left = (used: number | null | undefined, limit: number | null | undefined, included: number) =>
    holdsTrial
      ? (typeof limit === "number" ? String(Math.max(0, limit - (used ?? 0))) : "Not recorded")
      : String(included);

  if (status === "loading") {
    return (
      <StartShell step="trial" title="Checking your Litos+ offer.">
        <div className="rq-shimmer h-48 rounded-card" />
        <div className="rq-shimmer mt-6 h-40 rounded-inner" />
      </StartShell>
    );
  }

  const action = sent ? "Sent." : "Saved.";
  const title = holdsTrial
    ? `${action} Your Litos+ trial is active.`
    : offeredTrial
      ? `${action} Here is your ${terms.trialDays}-day trial.`
      : `${action} Review Litos+ next.`;

  return (
    <StartShell step="trial" title={title}>
      {holdsTrial ? (
        <>
          <div className="rounded-card border border-brand/25 bg-brand-soft/60 px-6 py-7 text-center">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-brand-ink">Litos+ trial active</p>
            <p className="mt-3 text-lg text-ink">Ends {endsLabel(access)}</p>
            <p className="mt-3 font-mono text-[11px] text-muted">Active on your account.</p>
          </div>
          <div className="mt-6">
            <Receipt rows={[
              { t: "01", k: "Tailored resumes left", v: left(usage?.tailored_resumes_used, usage?.tailored_resumes_limit, TRIAL_INCLUDES.tailored_resumes) },
              { t: "02", k: "Cover letters left", v: left(usage?.cover_letters_used, usage?.cover_letters_limit, TRIAL_INCLUDES.cover_letters) },
              { t: "03", k: "Application answers left", v: left(usage?.answer_applications_used, usage?.answer_applications_limit, TRIAL_INCLUDES.answer_applications) },
              { t: "04", k: "Contact discovery companies left", v: left(usage?.outreach_companies_used, usage?.outreach_companies_limit, TRIAL_INCLUDES.outreach_companies) },
            ]} />
          </div>
          <p className="mt-5 text-sm leading-6 text-muted">
            These counters come from your account. A legacy trial may show Not recorded where exact feature usage is unavailable.
          </p>
        </>
      ) : offeredTrial ? (
        <>
          <div className="rounded-card border border-brand/25 bg-brand-soft/60 px-6 py-7 text-center">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-brand-ink">{terms.trialDays}-day Litos+ trial</p>
            <p className="mt-2 font-mono text-[56px] leading-none tabular-nums text-brand-ink">{terms.trialDays}</p>
            <p className="mt-2 text-lg text-ink">days of Litos+</p>
            <p className="mt-3 font-mono text-[11px] text-muted">
              $0 is due when you complete Stripe checkout. A payment method is required.
            </p>
          </div>
          <div className="mt-6">
            <Receipt rows={[
              { t: "01", k: "Tailored resumes", v: String(TRIAL_INCLUDES.tailored_resumes) },
              { t: "02", k: "Cover letters", v: String(TRIAL_INCLUDES.cover_letters) },
              { t: "03", k: "Application answers", v: String(TRIAL_INCLUDES.answer_applications) },
              { t: "04", k: "Contact discovery companies", v: String(TRIAL_INCLUDES.outreach_companies) },
              { t: "05", k: "Trial length", v: `${terms.trialDays} days after checkout completes` },
            ]} />
          </div>
          <p className="mt-5 text-sm leading-6 text-muted">
            The next screen shows the regular renewal price and lets you choose a term before Stripe opens.
          </p>
        </>
      ) : (
        <div className="rounded-card border border-border bg-surface px-5 py-6">
          <p className="text-sm leading-6 text-ink">
            {status === "error"
              ? "Litos could not verify checkout terms. The next screen will stay locked until it can load the amount due."
              : terms?.checkoutStatus === "claim_required"
                ? "Claim your account on the next screen so Litos can check trial eligibility and the amount due."
                : terms?.trialEligible === false
                  ? "This account is not eligible for another trial. The next screen shows the amount due before Stripe opens."
                  : "Litos+ checkout is not available for this account right now. Nothing has been charged."}
          </p>
        </div>
      )}

      <div className="mt-7">
        <PrimaryButton onClick={onContinue}>Continue</PrimaryButton>
      </div>
    </StartShell>
  );
}

function firstCheckoutTerms(catalog: PlanCatalog | null): BillingCheckoutTerms | null {
  if (!catalog) return null;
  return Object.values(catalog.checkoutTerms)[0] ?? null;
}
