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
import { getBillingState, type EntitlementSnapshot } from "@/features/billing";
import { localDayKeyOf } from "@/lib/local-day";
import { PrimaryButton, Receipt, StartShell } from "./ui";
import { NotificationChoices } from "./NotificationsStep";
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

  useEffect(() => {
    let cancelled = false;
    getBillingState()
      .then((state) => { if (!cancelled) setAccess(state); })
      /* A failed read is not worth blocking the gift on. The days are already granted, and the
         meters below fall back to "Not recorded", which is this codebase's existing answer for a
         value it cannot stand behind rather than a guess dressed as a fact. */
      .catch(() => {});
    track("onboarding_trial_shown", {});
    return () => { cancelled = true; };
  }, []);

  /* Narrowed to the v2 meter shape before any counter is read. TrialUsage is a union and the
     legacy arm carries NO per-feature counters at all, so an account on the old monthly-allowance
     policy has nothing here to count; its rows fall to "Not recorded", which is this codebase's
     existing answer for a value it cannot stand behind. */
  const usage = access?.trial?.meter_policy === "litos_plus_v2_lifetime" ? access.trial : null;
  const holdsTrial = usage !== null;
  /* What is LEFT for an account that holds a trial, and what the seven days INCLUDE for one that
     does not yet. Five rows of "Not recorded" is what this screen printed before the trial existed,
     which reads as a system that has lost track of the thing it is in the middle of offering. */
  const left = (used: number | null | undefined, limit: number | null | undefined, included: number) =>
    holdsTrial
      ? (typeof limit === "number" ? String(Math.max(0, limit - (used ?? 0))) : "Not recorded")
      : String(included);

  return (
    <StartShell step="trial" title={sent ? "Sent. And here's something from us." : "Saved. And here's something from us."}>
      <div className="rounded-card border border-brand/25 bg-brand-soft/60 px-6 py-7 text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-brand-ink">A gift, on us</p>
        <p className="mt-2 font-mono text-[56px] leading-none tabular-nums text-brand-ink">7</p>
        <p className="mt-2 text-lg text-ink">days of Litos+</p>
        {/* WAS "Nothing to confirm. Already on your account." That stopped being true when the
            trial became a Stripe subscription rather than a signup grant. This says the same warm
            thing without claiming the account already holds something it does not. */}
        <p className="mt-3 font-mono text-[11px] text-muted">
          {holdsTrial ? "Already on your account." : "Nothing is charged for the first seven days."}
        </p>
      </div>

      <div className="mt-6">
        <Receipt
          rows={[
            { t: "01", k: "Tailored resumes", v: left(usage?.tailored_resumes_used, usage?.tailored_resumes_limit, TRIAL_INCLUDES.tailored_resumes) },
            { t: "02", k: "Cover letters", v: left(usage?.cover_letters_used, usage?.cover_letters_limit, TRIAL_INCLUDES.cover_letters) },
            { t: "03", k: "Application answers", v: left(usage?.answer_applications_used, usage?.answer_applications_limit, TRIAL_INCLUDES.answer_applications) },
            { t: "04", k: "Contact discovery", v: left(usage?.outreach_companies_used, usage?.outreach_companies_limit, TRIAL_INCLUDES.outreach_companies) },
            /* An end date exists only once the trial has started. Before that this row would be
               asserting a date nobody has set, so it names the length instead. */
            ...(holdsTrial ? [{ t: "05", k: "Ends", v: endsLabel(access) }] : [{ t: "05", k: "Length", v: "7 days" }]),
          ]}
        />
      </div>

      <p className="mt-5 text-sm leading-6 text-muted">
        {holdsTrial
          ? "These are what is left, counted after the resume Litos just built for you. The application costs nothing on any plan."
          : "This is what the seven days include. The resume Litos just built for you was free, and the application costs nothing on any plan."}
      </p>

      {/* THE STAYING-IN-TOUCH ASK, folded in from its own screen (10 -> 9). Its doc comment always
          said it belonged to this moment - "asked between the gift and the price" - and two screens
          for one moment was the rail counting a pause. The switches save themselves as they are
          ticked, so the button below stays about one thing. Both ledger entries are acknowledged by
          onContinue, which is what keeps the server from deriving the folded screen afterwards. */}
      <div className="mt-8">
        <p className="mb-4 text-[15px] leading-6 text-ink">Want to know when the next one opens?</p>
        <NotificationChoices />
      </div>

      <div className="mt-7">
        <PrimaryButton onClick={onContinue}>Start using it</PrimaryButton>
      </div>
    </StartShell>
  );
}
