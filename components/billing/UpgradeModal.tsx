"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/app/Button";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { useDashboardOverlayExit } from "@/components/app/useDashboardOverlayExit";
import {
  DEFAULT_LITOS_PLUS_PLAN_ID,
  FREE_FEATURES,
  LITOS_PLUS_PLANS,
  PLUS_FEATURES,
  accessLabel,
  litosPlusPlan,
  type EntitlementSnapshot,
  type LitosPlusPlanId,
  type PlanCatalog,
  type PremiumFeatureKey,
} from "@/features/billing";

export type UpgradeRequest = {
  feature: PremiumFeatureKey;
  placement: string;
  trigger: string;
  applicationId?: string;
  jobId?: string;
  contactId?: string;
  returnRoute?: string;
  title?: string;
  explanation?: string;
  manualLabel?: string;
  onManual?: () => void;
  onBeforeCheckout?: () => void;
};

type UpgradeCopy = {
  title: string;
  explanation: string;
  manualLabel: string;
};

const COPY: Record<PremiumFeatureKey, UpgradeCopy> = {
  ai_resume_tailoring: {
    title: "Tailor this resume with Litos+",
    explanation: "Your main resume can still be used to fill this application.",
    manualLabel: "Use main resume",
  },
  ai_resume_feedback: {
    title: "Review this resume with Litos+",
    explanation: "Your resume and application filling remain available on Free.",
    manualLabel: "Continue without feedback",
  },
  ai_cover_letter_generation: {
    title: "Write this cover letter with Litos+",
    explanation: "You can upload or write one yourself without upgrading.",
    manualLabel: "Write it myself",
  },
  ai_application_answer_generation: {
    title: "Draft this answer with Litos+",
    explanation: "Litos will leave the field blank for your review.",
    manualLabel: "Write it myself",
  },
  saved_generated_versions: {
    title: "Create another version with Litos+",
    explanation: "Every version you already made stays available.",
    manualLabel: "Keep this version",
  },
  contact_discovery: {
    title: "Find people with Litos+",
    explanation: "You can still add a contact manually.",
    manualLabel: "Add contact manually",
  },
  outreach_email_generation: {
    title: "Draft this email with Litos+",
    explanation: "Your contacts and saved messages remain available.",
    manualLabel: "Write it myself",
  },
  networking_discovery: {
    title: "Find referral paths with Litos+",
    explanation: "Import LinkedIn connections only when you choose. Litos never sends a LinkedIn message for you.",
    manualLabel: "Not now",
  },
  referral_paths: {
    title: "Find referral paths with Litos+",
    explanation: "Your imported contacts remain yours and can be deleted at any time.",
    manualLabel: "Not now",
  },
  connected_companies: {
    title: "See where you already have a path in",
    explanation: "Litos+ matches your approved network data to companies with open roles.",
    manualLabel: "Continue",
  },
  advanced_job_insights: {
    title: "See more context for this job",
    explanation: "Basic job facts and your match score remain free.",
    manualLabel: "Continue",
  },
  recruiter_visibility: {
    title: "Choose whether recruiters can find you",
    explanation: "Your profile stays private unless you turn visibility on.",
    manualLabel: "Keep private",
  },
  hover_generation: {
    title: "Start tailoring from job-card hover with Litos+",
    explanation: "Free and trial accounts can still choose Tailor resume explicitly. Hover never consumes trial usage.",
    manualLabel: "Choose it myself",
  },
  automatic_submission: {
    title: "Send an application without asking each time with Litos+",
    explanation: "Application filling stays free. On Free, you review the form and press the employer's final submit control.",
    manualLabel: "Keep manual submission",
  },
};

const SESSION_PLAN_KEY = "litos_plus_selected_plan_v2";

export function UpgradeModal({
  open,
  request,
  access,
  catalog,
  busy,
  error,
  onClose,
  onRetryCatalog,
  onCheckout,
}: {
  open: boolean;
  request: UpgradeRequest | null;
  access: EntitlementSnapshot | null;
  catalog: PlanCatalog | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRetryCatalog: () => void;
  onCheckout: (planId: LitosPlusPlanId) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  /* Keep the last request available while a controlled parent lowers `open`. Without this retained
     value, `request === null` removes the native dialog during render, before the close effect can
     put it through the same exit path as its buttons, backdrop, and Escape. */
  const [presentRequest, setPresentRequest] = useState<UpgradeRequest | null>(request);
  const [selectedPlan, setSelectedPlan] = useState<LitosPlusPlanId>(() => {
    if (typeof window === "undefined") return DEFAULT_LITOS_PLUS_PLAN_ID;
    const saved = window.sessionStorage.getItem(SESSION_PLAN_KEY);
    return LITOS_PLUS_PLANS.some((plan) => plan.id === saved)
      ? saved as LitosPlusPlanId
      : DEFAULT_LITOS_PLUS_PLAN_ID;
  });

  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const finishClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    setPresentRequest(null);
    onCloseRef.current();
  }, []);
  const { closing, requestClose, resetExit } = useDashboardOverlayExit({
    dialogRef,
    nativeBackdrop: true,
    onExitComplete: finishClose,
  });

  useEffect(() => {
    if (!open || !request) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPresentRequest(request);
    });
    return () => {
      cancelled = true;
    };
  }, [open, request]);

  useEffect(() => {
    if (!open || !presentRequest) return;
    resetExit();
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [open, presentRequest, resetExit]);

  useEffect(() => {
    if (open) return;
    const dialog = dialogRef.current;
    if (dialog?.open) requestClose();
  }, [open, requestClose]);

  if (!presentRequest) return null;
  const defaults = COPY[presentRequest.feature];
  const copy = {
    title: presentRequest.title ?? defaults.title,
    explanation: presentRequest.explanation ?? defaults.explanation,
    manualLabel: presentRequest.manualLabel ?? defaults.manualLabel,
  };
  const manualAction = presentRequest.onManual;
  const plan = litosPlusPlan(selectedPlan);
  const trial = access?.access_class === "trial_plus";
  const checkoutAvailable = catalog?.checkoutAvailable === true;
  const primaryLabel = trial ? "Choose Litos+" : `Continue with ${plan.shortLabel}`;

  function choose(planId: LitosPlusPlanId) {
    setSelectedPlan(planId);
    window.sessionStorage.setItem(SESSION_PLAN_KEY, planId);
  }

  function close() {
    if (busy || closing) return;
    requestClose();
  }

  function continueManually() {
    manualAction?.();
  }

  function leaveFor(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    requestClose(() => window.location.assign(href));
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-hidden={closing || undefined}
      inert={closing || undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
      className={`rq-dashboard-dialog m-auto max-h-[90svh] w-[min(96vw,1040px)] overflow-hidden rounded-card border border-border bg-surface p-0 text-ink shadow-overlay backdrop:bg-ink/35 max-sm:h-svh max-sm:max-h-none max-sm:w-screen max-sm:max-w-none max-sm:rounded-none ${closing ? "rq-dashboard-dialog-exit" : ""}`}
    >
      <div className="flex max-h-[90svh] flex-col max-sm:h-svh max-sm:max-h-none">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-6 border-b border-border bg-surface px-5 py-4 sm:px-7">
          <div>
            <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Litos+</p>
            <h2 id={titleId} className="mt-2 text-heading font-[450] text-ink">{copy.title}</h2>
            <p id={descriptionId} className="mt-1 max-w-2xl text-small text-muted">{copy.explanation}</p>
          </div>
          <button
            type="button"
            aria-label="Close Litos+ options"
            disabled={busy || closing}
            onClick={close}
            className="flex size-11 shrink-0 items-center justify-center rounded-control text-heading text-muted transition-colors hover:bg-surface-alt hover:text-ink disabled:opacity-50"
          >
            <span aria-hidden="true">x</span>
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-6 sm:px-7">
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
            <section aria-label="Free and Litos+ comparison" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <PlanBenefits title="Free" features={FREE_FEATURES} tone="free" />
              <PlanBenefits title="Litos+" features={PLUS_FEATURES} tone="plus" />
            </section>

            <section className="rounded-card border border-brand/45 bg-brand-soft/55 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Choose a term</p>
                  <p className="mt-1 text-small text-muted">Every term includes the same Litos+ tools.</p>
                </div>
                {access && (
                  <span className="rounded-control bg-surface px-3 py-1 font-mono text-label text-muted">
                    Current plan: {accessLabel(access)}
                  </span>
                )}
              </div>

              <fieldset className="mt-5 space-y-3">
                <legend className="sr-only">Litos+ term</legend>
                {LITOS_PLUS_PLANS.map((candidate) => {
                  const selected = selectedPlan === candidate.id;
                  return (
                    <label
                      key={candidate.id}
                      className={`relative flex min-h-16 cursor-pointer items-center gap-3 rounded-inner border bg-surface px-4 py-3 transition-colors ${selected ? "border-brand-ink" : "border-control-border hover:border-ink"}`}
                    >
                      <input
                        type="radio"
                        name="litos-plus-term"
                        value={candidate.id}
                        checked={selected}
                        onChange={() => choose(candidate.id)}
                        className="size-4 accent-brand"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-small font-medium text-ink">
                          {candidate.label}
                          {candidate.mostPopular && <span className="rounded-control bg-brand-soft px-2 py-0.5 font-mono text-label text-brand-ink">Most popular</span>}
                        </span>
                        <span className="mt-0.5 block font-mono text-machine text-muted">{candidate.daily}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-machine font-medium text-ink">{candidate.total}</span>
                        {candidate.savings && <span className="mt-0.5 block font-mono text-label text-brand-ink">Save {candidate.savings}%</span>}
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              <div className="mt-5 border-t border-brand/20 pt-5">
                <p className="font-mono text-machine text-ink" aria-live="polite">{plan.disclosure}</p>
                <p className="mt-1 text-label text-muted">Savings compare each daily rate with the weekly daily rate.</p>
                {error && <div className="mt-4"><ErrorNote message={error} /></div>}
                {!checkoutAvailable && !error && (
                  <p className="mt-4 text-small text-muted" role="status">Secure checkout is being checked. No purchase can start until the live catalog matches these terms.</p>
                )}
                <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Button
                    type="button"
                    block
                    disabled={busy || !checkoutAvailable}
                    aria-busy={busy}
                    onClick={() => onCheckout(selectedPlan)}
                  >
                    {busy ? <PendingLabel onColor>Opening Stripe</PendingLabel> : primaryLabel}
                  </Button>
                  {!checkoutAvailable && (
                    <Button type="button" variant="secondary" onClick={onRetryCatalog}>Try again</Button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={busy || closing}
                    onClick={() => requestClose(continueManually)}
                    className="min-h-11 text-small font-medium text-brand-ink underline decoration-brand/35 underline-offset-4 disabled:opacity-50"
                  >
                    {copy.manualLabel}
                  </button>
                  <button type="button" disabled={busy || closing} onClick={close} className="min-h-11 text-small text-muted hover:text-ink disabled:opacity-50">Not now</button>
                </div>
                <p className="mt-3 text-label leading-5 text-muted">
                  Manage or cancel in Account. Review the <a href="/terms" onClick={(event) => leaveFor(event, "/terms")} className="underline underline-offset-2">Terms</a> and <a href="/privacy" onClick={(event) => leaveFor(event, "/privacy")} className="underline underline-offset-2">Privacy Policy</a> before checkout.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function PlanBenefits({
  title,
  features,
  tone,
}: {
  title: string;
  features: readonly string[];
  tone: "free" | "plus";
}) {
  return (
    <div className={`rounded-card border p-5 ${tone === "plus" ? "border-brand/45 bg-brand-soft/45" : "border-border bg-surface"}`}>
      <h3 className="text-heading font-[450] text-ink">{title}</h3>
      <ul className="mt-4 space-y-3 text-small text-muted">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <span aria-hidden="true" className={tone === "plus" ? "text-brand-ink" : "text-teal-ink"}>+</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
