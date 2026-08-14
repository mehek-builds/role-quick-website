"use client";

import { Button, ButtonLink } from "@/components/app/Button";
import { Card, PendingLabel } from "@/components/app/ui";
import { accessLabel, isPaidAccess, termLabel } from "@/features/billing";
import { useBilling } from "./BillingProvider";

function date(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function PlanStatus({ compact = false, showAction = true }: { compact?: boolean; showAction?: boolean }) {
  const { access, loading, openUpgrade } = useBilling();
  if (loading && !access) {
    return <Card className={compact ? "p-4" : "p-5"}><PendingLabel>Checking access</PendingLabel></Card>;
  }
  if (!access || access.access_class === "unknown") return null;

  const paid = isPaidAccess(access);
  const trial = access.access_class === "trial_plus" ? access.trial : null;
  const v2Trial = trial?.meter_policy === "litos_plus_v2_lifetime" ? trial : null;
  const legacyTrial = trial?.meter_policy === "legacy_monthly_allowances";
  const subscriptionDate = date(access.subscription?.access_ends_at ?? access.subscription?.current_period_end);
  const heading = access.access_class === "trial_plus"
    ? "Your Litos+ trial is active."
    : access.access_class === "free_new"
      ? "Application filling is still free."
      : access.access_class === "free_grandfathered"
        ? "Your original Free access is preserved."
        : accessLabel(access);
  const body = access.access_class === "trial_plus"
    ? legacyTrial
      ? `Ends ${date(trial?.ends_at) ?? "on your original expiry date"}. Your original monthly allowances remain through that date. Application filling remains unlimited.`
      : `Ends ${date(trial?.ends_at) ?? "after seven days"}. Application filling remains unlimited.`
    : access.access_class === "free_new"
      ? "Upgrade when you want new tailored materials, outreach, insights, or sending without being asked each time."
      : paid
        ? `${termLabel(access.term)} term${subscriptionDate ? `. Access through ${subscriptionDate}.` : "."} Application filling is unlimited.`
        : `${access.legacy_summary ?? "Your existing limits remain in place."} Application filling is unlimited.`;

  return (
    <Card className={`${compact ? "p-4" : "p-5"} border-brand/30 bg-brand-soft/35`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">{accessLabel(access)}</p>
          <h2 className="mt-2 text-heading font-[450] text-ink">{heading}</h2>
          <p className="mt-1 text-small text-muted">{body}</p>
          {v2Trial && !compact && (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-label text-muted" aria-label="Trial usage">
              <span>{v2Trial.tailored_resumes_used} of {v2Trial.tailored_resumes_limit} tailored resumes used</span>
              <span>{v2Trial.cover_letters_used} of {v2Trial.cover_letters_limit} cover letters used</span>
              <span>{v2Trial.answer_applications_used} of {v2Trial.answer_applications_limit} answer applications used</span>
              <span>{v2Trial.outreach_companies_used} of {v2Trial.outreach_companies_limit} outreach companies used</span>
            </div>
          )}
          {(access.access_class === "free_grandfathered" || legacyTrial) && access.legacy_usage && !compact && (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-label text-muted" aria-label={legacyTrial ? "Original trial usage" : "Original plan usage"}>
              <span>{access.legacy_usage.tailored_resumes.used} of {access.legacy_usage.tailored_resumes.limit} tailored resumes used</span>
              <span>{access.legacy_usage.contacts.used} of {access.legacy_usage.contacts.limit} contacts used</span>
              <span>{access.legacy_usage.drafts.used} of {access.legacy_usage.drafts.limit} drafts used</span>
            </div>
          )}
        </div>
        {showAction && (paid ? (
          <ButtonLink href="/dashboard/settings#plan" variant="secondary">Manage plan</ButtonLink>
        ) : (
          <Button
            type="button"
            onClick={() => openUpgrade({
              feature: "ai_resume_tailoring",
              placement: "plan_status",
              trigger: "account_upgrade",
              manualLabel: "Keep filling for free",
            })}
          >
            See Litos+
          </Button>
        ))}
      </div>
    </Card>
  );
}
