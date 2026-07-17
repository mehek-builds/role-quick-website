"use client";

/* Shared /start primitives.
 *
 * Both signature motifs from DESIGN.md live here, reused rather than reinvented:
 *   1. The receipt - a mono timestamp gutter. Speed shown as a fact, never claimed.
 *   2. The refusal list - "what we won't do", set like terms of service. Ethics as furniture.
 *
 * The step rail reuses the homepage film's own act labels (00 DETECTED, 01 DOCUMENTS), so the
 * marketing page and onboarding share one wayfinding device instead of inventing a second.
 * It is wayfinding, not a progress meter: no percentage, no streak, no celebration. The
 * Guardrails ban all three and a number would only make a 12-minute step feel longer.
 */

import type { OnboardingStep } from "@/lib/api";

export const STEPS: { key: OnboardingStep; act: string; label: string }[] = [
  { key: "resume", act: "00", label: "Résumé" },
  { key: "install", act: "01", label: "Install" },
  { key: "apply", act: "02", label: "Apply" },
  { key: "gaps", act: "03", label: "Gaps" },
  { key: "targeting", act: "04", label: "Target" },
  { key: "done", act: "05", label: "Done" },
];

export function StepRail({ current }: { current: OnboardingStep }) {
  const i = STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Setup progress" className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {STEPS.map((s, idx) => {
        const done = idx < i;
        const active = idx === i;
        return (
          <span
            key={s.key}
            aria-current={active ? "step" : undefined}
            className={`font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${
              active ? "text-ink" : done ? "text-muted" : "text-faint"
            }`}
          >
            <span className={active ? "text-brand-ink" : ""}>{s.act}</span> {s.label}
          </span>
        );
      })}
    </nav>
  );
}

export function StartShell({
  step,
  title,
  sub,
  children,
  aside,
}: {
  step: OnboardingStep;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <StepRail current={step} />
      {/* Display type: weight 450, never bold. Calm things don't shout. */}
      <h1 className="mt-10 text-[34px] font-normal leading-[1.15] tracking-[-0.02em] text-ink">
        {title}
      </h1>
      {sub && <p className="mt-3 max-w-[46ch] text-[15px] leading-7 text-muted">{sub}</p>}
      <div className="mt-8">{children}</div>
      {aside && <div className="mt-8">{aside}</div>}
    </div>
  );
}

export type ReceiptRow = { t?: string; k: string; v: string; done?: boolean };

/** DESIGN.md signature motif #1. Every value is mono, because the machine is speaking. */
export function Receipt({ rows }: { rows: ReceiptRow[] }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface-alt py-1">
      {rows.map((r, i) => (
        <div
          key={`${r.k}-${i}`}
          className={`grid grid-cols-[64px_120px_minmax(0,1fr)] items-baseline gap-3 px-4 py-1.5 font-mono text-[12.5px] ${
            r.done ? "mt-1 border-t border-border pt-2.5" : ""
          }`}
        >
          <span className="text-faint">{r.t ?? ""}</span>
          <span className="text-[11px] uppercase tracking-[0.06em] text-muted">{r.k}</span>
          <span className={`truncate ${r.done ? "text-brand-ink" : "text-ink"}`}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

/** DESIGN.md signature motif #2. This is the R-004 decision, rendered as a trust beat. */
export function RefusalList() {
  const rows = [
    {
      what: "Work authorization",
      why: "Location-specific. Your Berlin answer isn't your Toronto answer, so we ask every time.",
    },
    {
      what: "Visa sponsorship",
      why: "Same reason. We never put an answer in this field for you.",
    },
    {
      what: "Self-identification",
      why: 'Race, gender, disability. Yours. We select "prefer not to answer" and store nothing.',
    },
  ];
  return (
    <div className="overflow-hidden rounded-[12px] border border-border">
      <div className="border-b border-border bg-surface-alt px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        What we won&apos;t keep
      </div>
      {rows.map((r) => (
        <div
          key={r.what}
          className="grid grid-cols-1 gap-1 border-t border-border px-4 py-3 text-[13px] first:border-t-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4"
        >
          <span className="text-ink">{r.what}</span>
          <span className="leading-6 text-muted">{r.why}</span>
        </div>
      ))}
    </div>
  );
}

/* The one blue action per viewport. Blue never appears on anything that isn't an action. */
export function PrimaryButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/* "Finish later" is plainly worded and always visible. Strong default, not a trap: burying the
   exit would be the dark pattern the Guardrails exist to prevent. */
export function LaterLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-1 py-2.5 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
    >
      Finish later
    </button>
  );
}

export function Chip({
  label,
  on,
  derived,
  onClick,
}: {
  label: string;
  on?: boolean;
  derived?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
        on
          ? "border-brand bg-brand-soft text-brand-ink"
          : "border-border bg-surface text-muted hover:border-ink/30"
      } ${derived ? "border-dashed" : ""}`}
    >
      {label}
    </button>
  );
}
