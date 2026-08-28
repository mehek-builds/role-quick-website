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
 * Guardrails ban all three, and the labels already say what remains.
 *
 * Its denominator is the steps THIS student's flow contains, not the length of STEPS: one entry in
 * that list is conditional, and counting it for everybody made the printed count skip a number.
 * See `flowSteps`. That is also why the rail reads the onboarding state from a context rather than
 * a prop, and why it draws itself with no position at all until the state arrives.
 */

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/app/Button";
import { flowSteps } from "@/features/onboarding";
import type { OnboardingState, OnboardingStep } from "@/lib/api";

/* STEPS and `flowSteps` live in features/onboarding/domain/rail.ts and are re-exported here.
   They are the rail's data and its one rule, and they are plain TypeScript with no JSX, which
   is what lets tests/start-rail-denominator.test.mjs import them under `npm test` (node's
   --experimental-strip-types loads .ts and not .tsx). Re-exported rather than moved outright so
   every `from "./ui"` import site stays as it was. */
export { STEPS, flowSteps } from "@/features/onboarding";

/* The derived onboarding state the whole flow is rendered from, shared with the rail.
 *
 * The rail needs to know which steps THIS student's flow contains, and it cannot be told directly:
 * every screen renders `StartShell`, which renders the rail, and threading the state through eight
 * step components (and through `StartShell`'s own props) to reach one string would put the same
 * argument in eight places for one reader. app/start/page.tsx already holds the state and already
 * wraps every branch, so it provides it once, here.
 *
 * `null` means NOT YET KNOWN, and it is the default rather than an error: a rail rendered before
 * GET /onboarding/state answers must not claim a position, and one rendered outside the provider
 * should degrade to that same silence rather than throw. */
const StartFlowContext = createContext<OnboardingState | null>(null);

export function StartFlowProvider({
  state,
  children,
}: {
  state: OnboardingState | null;
  children: React.ReactNode;
}) {
  return <StartFlowContext.Provider value={state}>{children}</StartFlowContext.Provider>;
}

/** Omit `current` while the state is still loading: the rail then draws the shape of the flow
 *  without claiming a position in it. */
export function StepRail({ current }: { current?: OnboardingStep }) {
  const state = useContext(StartFlowContext);
  const steps = flowSteps(current, state);
  const i = current ? steps.findIndex((s) => s.key === current) : -1;
  /* Both halves have to be true. A position with no state behind it is the returning student
     mid-flow reading "Step 1 of 7" for as long as the request takes, which is a wayfinding device
     pointing at the wrong place: the one thing it must never do. */
  const known = state !== null && i >= 0;
  const step = i + 1;
  /* Each segment is as wide as the effort it represents. No percentage number: the written step
     count is precise enough, while the rail provides a quick visual map of the remaining work. */
  return (
    <div
      /* role="group", because `aria-label` on a bare div is not honoured: an element that maps to
         the generic role has no accessible name, so the whole string below was being computed for
         nobody. The e2e specs read the ATTRIBUTE and passed either way, which is exactly how it
         stayed unnoticed. A named group is also the honest shape for it: a small labelled region,
         not a landmark and not a progressbar (a progressbar reports a VALUE, which is the
         percentage the Guardrails ban). */
      role="group"
      aria-label={known ? `Setup: step ${step} of ${steps.length}, ${steps[i].label}` : "Setup"}
      aria-busy={known ? undefined : true}
    >
      {known ? (
        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] text-ink">{steps[i].label}</span>
          {/* The machine counting. Same label style as every other meta string in
              the product: 11px mono, uppercase, +0.08em (audit finding 43). */}
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Step {step} of {steps.length}
          </span>
        </div>
      ) : (
        /* Shimmer rather than an empty row, and rather than nothing at all: the row holds the height
           the resolved rail occupies, so the heading below does not jump when the state arrives.
           Nothing here is readable as a claim, which is the point.
           The bars are nested INSIDE spans carrying the two real type classes, and that nesting is
           what makes the heights match: the line box comes from the same font metrics the resolved
           row uses, so parity survives a change to the type scale. Measured: 19.5px either way.
           Bars alone, sized h-3, made this row 12px and moved everything below it by 7.5px on the
           one frame the state landed. */
        <div className="flex items-center justify-between gap-4" aria-hidden="true">
          <span className="text-[13px] text-ink">
            <span className="rq-shimmer inline-block h-3 w-28 rounded-full align-middle" />
          </span>
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            <span className="rq-shimmer inline-block h-3 w-24 rounded-full align-middle" />
          </span>
        </div>
      )}
      {/* The shimmer is decorative and every segment below is aria-hidden, so without this a screen
          reader gets NOTHING while the state loads: not a position, which is correct, but not the
          reason for its absence either. `aria-busy` alone does not fill that gap, it only tells AT
          to hold off announcing changes inside a live region, and this is not one. Sighted users
          read "we don't know yet" off the shimmer; this is the same sentence. */}
      {!known && <span className="sr-only">Loading your setup progress</span>}
      <ol className="mt-3 flex gap-1.5">
        {steps.map((s, index) => {
          const done = known && index < step - 1;
          const here = known && index === step - 1;
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
      {/* /start was the only public route with no chrome at all: no header, no
          logo, no way back to the site (audit finding 38). The mark goes home,
          the same door /login gives. Deliberately not the full marketing header:
          this is a flow, and a nav bar here would invite leaving it. */}
      <Link
        href="/"
        aria-label="Litos home"
        className="mb-7 inline-flex min-h-[44px] items-center gap-2 text-ink transition-opacity hover:opacity-70 sm:mb-8"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/litos-mark.svg" alt="" className="h-6 w-6" />
        <span className="text-base font-medium tracking-tight">Litos</span>
      </Link>

      <StepRail current={step} />
      <RevisitBar current={step} />
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
      <div
        key={step}
        className={`rq-onboarding-step min-w-0 ${title ? (wide ? "mt-6" : "mt-8") : "mt-7"}`}
      >
        {children}
      </div>
      {aside && <div className="mt-8">{aside}</div>}
    </main>
  );
}

/* Going back to change an answer, from wherever the student is standing.
 *
 * The flow is ledger-driven, so the SERVER decides which screen comes next. Without this there was
 * no way back at all: every screen advanced and nothing returned, so a student who mistyped a role
 * on the first screen carried it to the end. That is a bad trade in any flow and a worse one in
 * this one, where the last screen sends a real application.
 *
 * Revisiting does NOT un-acknowledge anything. The ledger records that a screen was SEEN, and going
 * back to change an answer does not unsee it; treating a revisit as an un-acknowledgement would
 * make the flow walk the student forward through every screen again. What returns them is the same
 * server answer that got them here, so the trip is always back to where they actually were.
 */
const REVISITABLE: { key: OnboardingStep; label: string }[] = [
  { key: "focus", label: "the roles you picked" },
  { key: "resume", label: "your resume" },
  { key: "questions", label: "what you told the employer" },
  { key: "sponsorship", label: "your work visa answer" },
];

/* The disclosure names the region it opens, the same contract the welcome walkthrough on the first
   screen already keeps. A button that expands something it does not name leaves a screen reader
   with no way to reach what appeared. */
const REVISIT_LIST_ID = "start-revisit-list";

const RevisitContext = createContext<{
  revisiting: OnboardingStep | null;
  onRevisit: (step: OnboardingStep) => void;
  onReturn: () => void;
} | null>(null);

export function RevisitProvider({
  value,
  children,
}: {
  value: { revisiting: OnboardingStep | null; onRevisit: (step: OnboardingStep) => void; onReturn: () => void };
  children: React.ReactNode;
}) {
  return <RevisitContext.Provider value={value}>{children}</RevisitContext.Provider>;
}

function RevisitBar({ current }: { current: OnboardingStep }) {
  const ctx = useContext(RevisitContext);
  const state = useContext(StartFlowContext);
  const [open, setOpen] = useState(false);
  if (!ctx) return null;

  /* While revisiting, the only control offered is the way back. Offering the full list again would
     let a student hop sideways between old screens and lose the thread of where they actually
     were. */
  if (ctx.revisiting) {
    return (
      <div className="mt-3 flex items-center gap-3 text-[13px]">
        <span className="text-muted">You came back to change this.</span>
        <button type="button" onClick={ctx.onReturn} className="text-brand-ink underline underline-offset-4">
          Done, take me back
        </button>
      </div>
    );
  }

  /* Only screens BEHIND the student, and only ones their flow actually contains: offering the work
     visa screen to somebody whose employer already answered it would open a screen the flow skipped
     on purpose. */
  const flow = flowSteps(current, state).map((s) => s.key);
  const at = flow.indexOf(current);
  const behind = REVISITABLE.filter((item) => {
    const index = flow.indexOf(item.key);
    return index >= 0 && index < at;
  });
  if (behind.length === 0) return null;

  return (
    <div className="mt-3 text-[13px]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={REVISIT_LIST_ID}
        onClick={() => setOpen((value) => !value)}
        className="min-h-11 text-muted underline underline-offset-4 hover:text-ink"
      >
        Change something you answered
      </button>
      {open && (
        <ul id={REVISIT_LIST_ID} className="mt-2 flex flex-wrap gap-2">
          {behind.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => { setOpen(false); ctx.onRevisit(item.key); }}
                className="min-h-11 rounded-control border border-border px-3 py-1.5 text-[12.5px] text-ink hover:border-brand"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
          className={`grid grid-cols-[52px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 px-4 py-1.5 font-mono text-xs sm:grid-cols-[64px_120px_minmax(0,1fr)] ${
            r.done ? "mt-1 border-t border-border pt-2.5" : ""
          }`}
        >
          <span className="text-muted">{r.t ?? ""}</span>
          <span className="text-[11px] uppercase tracking-[0.06em] text-muted">{r.k}</span>
          <span className={`col-span-2 break-words sm:col-span-1 sm:truncate ${r.done ? "text-brand-ink" : "text-ink"}`}>{r.v}</span>
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
      why: "We reuse only the exact country declaration you saved. A country with no declaration comes back to you.",
    },
    {
      what: "Visa sponsorship",
      why: "We reuse only your saved now and future sponsorship answers for that country. We never infer one.",
    },
    /* This row used to read: 'Race, gender, disability. Yours. We select
       "prefer not to answer" and store nothing.' Under a heading that says
       "What we won't keep", that was the wrong claim in the wrong table.
       The extension's setup screen offers these as optional fields and keeps
       what you enter in eeo_prefs, so Litos can answer with your own words.
       Blank is what produces the decline. Left in the list because the
       refusal is real, and stated as the choice it actually is. */
    {
      what: "Self-identification",
      why: 'Race, gender, disability. Optional, and only if you fill them in at setup. Leave them blank and we pick "prefer not to answer" every time.',
    },
  ];
  return (
    <div className="overflow-hidden rounded-inner border border-border">
      <div className="border-b border-border bg-surface-alt px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
        {/* Was "What we won't keep", which was wrong for all three rows: the
            setup screen collects and stores every one of them (citizenship
            and sponsorship on the application profile, self-ID in eeo_prefs).
            "What we won't answer for you" was the next attempt and is wrong
            for the third row, because self-ID IS answered, from what you
            entered. The one thing true of all three is that Litos never
            supplies an answer you did not give it: the eligibility fields are
            stored "for your reference only. Never used to answer forms", and
            self-ID is your words or a decline, never an inference. */}
        What we never guess
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

/* The quiet controls in an action row, Skip and Finish later, share one class
   string on purpose. They sit next to each other on the same baseline, so any
   drift between them is visible immediately, and drift is exactly the bug both
   components were written to fix. Shared constant rather than two identical
   literals, so the parity is enforced instead of coincidental. */
const QUIET_ACTION =
  "min-h-11 px-1 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline";

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
      className={QUIET_ACTION}
    >
      Finish later
    </button>
  );
}

/* Skip: move past an OPTIONAL thing and stay in the flow. Distinct from
   LaterLink, which leaves the flow entirely, and the two are always shown
   together so the difference is legible.
 *
 * One name for one control, the same fix LaterLink already got. Before this
 * there were two hand-rolled skips with two labels ("Skip these" on the gaps
 * step, "Skip" on the base-resume metrics), two paddings and two underline
 * offsets, so the same idea looked like a different control on each screen.
 * `what` only feeds the title, so the visible word stays one word everywhere.
 *
 * Deliberately NOT offered on resume, install, apply or targeting. Steps are
 * derived server-side from data that exists (routes/onboarding.ts), so a skip
 * on any of those would advance the screen and the next load would deposit the
 * student right back on it. A control that visibly does nothing is worse than
 * no control, and "Finish later" already covers wanting out of those. */
export function SkipLink({ onClick, what }: { onClick: () => void; what: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Optional. You can add ${what} later from your profile.`}
      className={QUIET_ACTION}
    >
      Skip
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
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
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
      className={`min-h-11 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
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
