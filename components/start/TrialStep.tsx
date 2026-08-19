"use client";

/* 07 YOUR TRIAL: the gift beat, placed in the frame right after the application went out.
 *
 * The seven days are real and were granted at account creation, before they were mentioned, so
 * "already on your account" is literally true rather than a framing. What this screen does is
 * tell the student they have it, at the moment the product has just proved what it is for.
 *
 * WHERE THE GIFT STAYS HONEST. The meters sit on the same screen as the figure, not behind a
 * link, because this trial is metered and Cal AI's is not: seven days of "unlimited" would be
 * selling a different product than the one that arrives. And the build on screen 04 spent one of
 * the five tailored resumes, so this screen counts what is LEFT rather than what the plan
 * advertises. A five printed next to an account holding four is the kind of number that makes
 * every other number on the screen worth less.
 */

import { useEffect, useState } from "react";
import { getBillingState, type EntitlementSnapshot } from "@/features/billing";
import { localDayKeyOf } from "@/lib/local-day";
import { PrimaryButton, Receipt, StartShell } from "./ui";
import { track } from "@/lib/analytics";

/* The student's OWN calendar day, never the UTC one.
 *
 * A trial ending "2026-08-26" read off toISOString is the UTC day, and UTC midnight is 4 PM ET.
 * For the primary market that prints the wrong date for eight hours of every day, on the one
 * number this screen exists to be trusted about. localDayKeyOf is the codebase's existing
 * conversion for exactly this, and using anything else here reintroduces ISSUE-035. */
function endsLabel(access: EntitlementSnapshot | null): string {
  return localDayKeyOf(access?.trial?.ends_at) ?? "Not recorded";
}

export function TrialStep({ onContinue }: { onContinue: () => void }) {
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
  const left = (used: number | null | undefined, limit: number | null | undefined) =>
    typeof limit === "number" ? String(Math.max(0, limit - (used ?? 0))) : "Not recorded";

  return (
    <StartShell step="trial" title="Sent. And here's something from us.">
      <div className="rounded-card border border-brand/25 bg-brand-soft/60 px-6 py-7 text-center">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-brand-ink">A gift, on us</p>
        <p className="mt-2 font-mono text-[56px] leading-none tabular-nums text-brand-ink">7</p>
        <p className="mt-2 text-lg text-ink">days of Litos+</p>
        <p className="mt-3 font-mono text-[11px] text-muted">Nothing to confirm. Already on your account.</p>
      </div>

      <div className="mt-6">
        <Receipt
          rows={[
            { t: "01", k: "Tailored resumes", v: left(usage?.tailored_resumes_used, usage?.tailored_resumes_limit) },
            { t: "02", k: "Cover letters", v: left(usage?.cover_letters_used, usage?.cover_letters_limit) },
            { t: "03", k: "Application answers", v: left(usage?.answer_applications_used, usage?.answer_applications_limit) },
            { t: "04", k: "Contact discovery", v: left(usage?.outreach_companies_used, usage?.outreach_companies_limit) },
            { t: "05", k: "Ends", v: endsLabel(access) },
          ]}
        />
      </div>

      <p className="mt-5 text-sm leading-6 text-muted">
        These are what is left, counted after the resume Litos just built for you. The application
        you sent costs nothing on any plan.
      </p>

      <div className="mt-7">
        <PrimaryButton onClick={onContinue}>Start using it</PrimaryButton>
      </div>
    </StartShell>
  );
}
