"use client";

/* Shared /start primitives.
 *
 * Both signature motifs from DESIGN.md live here, reused rather than reinvented:
 *   1. The receipt - a mono timestamp gutter. Speed shown as a fact, never claimed.
 *   2. The refusal list - "what we won't do", set like terms of service. Ethics as furniture.
 *
 * The step rail reuses the homepage film's own act labels (00 JOB FOUND, 01 RESUME), so the
 * marketing page and onboarding share one wayfinding device instead of inventing a second.
 * It is wayfinding, not a progress meter: no percentage, no streak, no celebration. The
 * Guardrails ban all three and a number would only make a 12-minute step feel longer.
 */

import { Button } from "@/components/app/Button";
import type { OnboardingStep } from "@/lib/api";

/* Step names a student can read. "Gaps", "Target" and "Focus" were the backend's words for these
   screens, and the resume step was the only place in the product that accented the word. It is
   "resume" everywhere we write it, in every surface, with no exceptions. */
/* `weight` is roughly how much of the student's TIME the step costs, and it is
   the whole reason this rail can draw a fill again. The 2026-07-04 removal was
   right about the bar it removed: equal segments read 43% done while the
   twelve-minute application was still ahead, which is a promise the flow
   cannot keep. But the fault was equal weighting, not fills. Sizing each
   segment by its real cost means the apply step occupies 12 of 22 of the rail,
   so the student SEES the big block ahead instead of being told they are
   nearly finished. Rough numbers on purpose: they only have to be right
   relative to each other, and being roughly honest beats being precisely
   wrong. Approved 2026-07-27 as override 1 of 10 (DESIGN.md). */
export const STEPS: { key: OnboardingStep; label: string; weight: number }[] = [
  { key: "focus", label: "What you want", weight: 1 },
  { key: "resume", label: "Your resume", weight: 2 },
  { key: "base", label: "Your one page", weight: 2 },
  { key: "install", label: "Add to Chrome", weight: 2 },
  { key: "apply", label: "One application", weight: 12 },
  { key: "gaps", label: "A few details", weight: 2 },
  { key: "targeting", label: "When you start", weight: 1 },
  { key: "done", label: "Done", weight: 0 },
];

export function StepRail({ current }: { current: OnboardingStep }) {
  const i = STEPS.findIndex((s) => s.key === current);
  const activeStep = STEPS[Math.max(0, i)];
  const step = Math.max(0, i) + 1;
  /* The fill is back, weighted by effort rather than by step count. The rule it
     has to satisfy is the one that killed the last bar: never tell a student
     they are nearly done while the twelve-minute application is still ahead.
     Weighting does that structurally. Each segment is as wide as the step is
     expensive, so at "Add to Chrome" the rail is visibly about a third filled
     with one wide block left, which is the truth.

     No percentage number. The 2026-07-04 note that a figure "would only make a
     12-minute step feel longer" still holds, and the bar's shape already says
     more than a digit would. The written "Step 5 of 8" stays as the precise
     part. */
  return (
    <div aria-label={`Setup: step ${step} of ${STEPS.length}, ${activeStep.label}`}>
      <div className="flex items-center justify-between gap-4 text-[13px]">
        <span className="text-ink">{activeStep.label}</span>
        <span className="text-faint">Step {step} of {STEPS.length}</span>
      </div>
      <ol className="mt-3 flex gap-1.5">
        {STEPS.map((s, index) => {
          const done = index < step - 1;
          const here = index === step - 1;
          return (
            <li
              key={s.key}
              aria-hidden="true"
              /* flexGrow, not flex-1: the segment carries its own weight, which
                 is what makes the rail read as the shape of the work. The final
                 "Done" step weighs 0, so it collapses to the gap and the rail
                 ends where the work ends. */
              style={{ flexGrow: s.weight, flexBasis: 0 }}
              /* motion-safe, and 200ms: Motion v1.1 puts micro transitions at
                 150-250ms, and there is no blanket transition kill in the
                 reduced-motion block, so the variant is what actually honours
                 the preference here rather than an assumption that something
                 upstream does. */
              className={`h-0.5 rounded-full motion-safe:transition-colors motion-safe:duration-200 ${
                done ? "bg-ink" : here ? "bg-ink/40" : "bg-border"
              }`}
            />
          );
        })}
      </ol>
    </div>
  );
}

export function StartShell({
  step,
  title,
  sub,
  children,
  aside,
  /* One screen in the flow is a two-column document view rather than a form, and a 2xl column
     cannot hold a legible sheet of paper beside a build log. Opt-in rather than automatic: every
     other step is a single question and gets narrower measure on purpose. */
  wide = false,
}: {
  step: OnboardingStep;
  /* Optional so a step can place its own heading inside its layout. The document-review step needs
     the title BESIDE the paper rather than above it: stacked, the heading block pushes a full sheet
     below the fold, and a one-page resume you cannot see in one screen argues against itself. */
  title?: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main
      className={`mx-auto w-full min-w-0 px-4 sm:px-6 ${
        // The wide step has a full sheet of paper to fit on screen, so it buys that room back from
        // the chrome around it rather than from the document.
        wide ? "max-w-5xl py-8 sm:py-10" : "max-w-2xl py-10 sm:py-16"
      }`}
    >
      <StepRail current={step} />
      {/* Display type: weight 450, never bold. Calm things don't shout. */}
      {title && (
        <h1
          className={`max-w-full text-section font-normal leading-[1.15] tracking-[-0.02em] text-ink sm:text-section ${
            wide ? "mt-6 sm:mt-7" : "mt-8 sm:mt-10"
          }`}
        >
          {title}
        </h1>
      )}
      {sub && <p className="mt-3 max-w-[46ch] text-base leading-7 text-muted">{sub}</p>}
      <div className={`min-w-0 ${title || sub ? (wide ? "mt-6" : "mt-8") : "mt-7"}`}>{children}</div>
      {aside && <div className="mt-8">{aside}</div>}
    </main>
  );
}

export type ReceiptRow = { t?: string; k: string; v: string; done?: boolean };

/** DESIGN.md signature motif #1. Every value is mono, because the machine is speaking. */
export function Receipt({ rows }: { rows: ReceiptRow[] }) {
  return (
    <div className="rounded-inner border border-border bg-surface-alt py-1">
      {rows.map((r, i) => (
        <div
          key={`${r.k}-${i}`}
          className={`grid grid-cols-[64px_120px_minmax(0,1fr)] items-baseline gap-3 px-4 py-1.5 font-mono text-xs ${
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
    <div className="overflow-hidden rounded-inner border border-border">
      <div className="border-b border-border bg-surface-alt px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
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
    <Button
      {...rest} >
      {children}
    </Button>
  );
}

/* "Finish later" is plainly worded and always visible. Strong default, not a trap: burying the
   exit would be the dark pattern the Guardrails exist to prevent.
 *
 * One name for one control. This button said "Exit setup", the component is LaterLink and the
 * analytics event is onboarding_step_later, so the same escape hatch had three names. The
 * reassurance moves into the button's own title rather than sitting beside it as a third piece
 * of text in a row that already had two buttons. */
export function LaterLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Anything you have finished stays saved"
      className="min-h-11 px-1 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
    >
      Finish later
    </button>
  );
}

/* A note from Mehek, used ONCE, on the screen that asks for the most.
 *
 * Walking Simplify (2026-07-17): their founder's face appears on exactly three screens - resume,
 * category, salary - the three highest-hesitation moments in their flow. It is not decoration;
 * each quote answers the specific doubt of that specific screen.
 *
 * Ours has one such screen. Step 03 asks a student to spend twelve minutes filling a form by hand
 * to use a product whose entire pitch is that it fills forms for you. That objection is real and
 * obvious, and no amount of UI copy answers it - only a person explaining the reason does. So this
 * exists once, there, and nowhere else. Repeating it would make it furniture.
 *
 * Not social proof, so it does not violate the "only when real, only below the fold" rule: it is
 * the founder taking responsibility for the worst thing the product asks of you. */
export function FounderNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-inner border border-border bg-surface-alt px-4 py-3.5">
      {/* The mark has no ground of its own, so it merges into the surface it
          sits on: no border, no rounding, no padding. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/litos-mark.svg"
        alt=""
        className="mt-0.5 h-6 w-6 shrink-0"
      />
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
          Mehek, who builds Litos
        </p>
        <p className="mt-1 text-[13px] leading-6 text-ink">{children}</p>
      </div>
    </div>
  );
}

export function Chip({
  label,
  on,
  derived,
  disabled,
  onClick,
}: {
  label: string;
  on?: boolean;
  derived?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
        on
          ? "border-brand bg-brand-soft text-brand-ink"
          : "border-border bg-surface text-muted hover:border-ink/30"
      } ${derived ? "border-dashed" : ""} ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      }`}
    >
      {label}
    </button>
  );
}
