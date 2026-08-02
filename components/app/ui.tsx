"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { userFacingError } from "@/lib/user-facing-error";

/* Shared in-app primitives, per brand deck sections 04 (shape/surface) and 07
   (review view): quiet surfaces, pill chips, shimmer loading, match-score ring.
   Color encodes what something is (pillar), never how urgently to act. */

export function Card({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={`rounded-card border border-border bg-surface ${className}`}>
      {children}
    </div>
  );
}

/* FIVE looks, not twelve.
 *
 * A student does not learn twelve chip colours; they learn "quiet means nothing to do", "blue
 * means your turn", "green means it happened", "amber means it stopped", "red means it failed".
 * Every key below is an alias onto one of those five, so callers keep their vocabulary while the
 * eye only ever has five things to tell apart. Adding a sixth look needs a reason, not a key. */
const QUIET = "bg-surface-alt text-muted";
const YOUR_TURN = "bg-brand-soft text-brand-ink";
const HAPPENED = "bg-positive-soft text-positive";
const STOPPED = "bg-warn-soft text-warn";
const FAILED = "bg-danger-soft text-danger";

const CHIP_STYLES: Record<string, string> = {
  // nothing is being asked of you yet
  draft: QUIET,
  generating: QUIET,
  drafted: QUIET,
  linkedin_only: QUIET,
  // your turn
  ready: YOUR_TURN,
  // it happened
  sent: HAPPENED,
  replied: HAPPENED,
  verified: HAPPENED,
  // it stopped and is waiting on you
  warn: STOPPED,
  likely: STOPPED,
  // it failed
  bounced: FAILED,
  // persona marks what a contact IS, not a status, so it keeps the outreach pillar tint
  persona: "bg-coral-soft text-coral-ink",
};

export function Chip({ label, kind }: { label: string; kind?: string }) {
  const style = CHIP_STYLES[kind ?? label.toLowerCase()] ?? "bg-surface-alt text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.05em] ${style}`}
    >
      {label}
    </span>
  );
}

/* Meters fill in ink (DESIGN.md): a meter is a quantity, not a pillar.
   Color stays reserved for provenance and the one human action. */
export function Meter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const unlimited = limit <= 0 || limit >= 100000;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="font-mono text-xs text-muted">
          {used}
          {unlimited ? " used" : ` / ${limit}`}
        </span>
      </div>
      <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-border">
        {!unlimited && (
          <div
            className="h-full rounded-full bg-ink"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {/* A meter's job is to show a quantity. The billing-cycle rule is a policy sentence and it
          lives in Account, not under every bar. */}
      {unlimited && <p className="mt-1.5 text-[11px] text-faint">No limit on your plan</p>}
    </div>
  );
}

/** Match-score ring (deck 07). Only rendered when a real score exists.
 *
 *  The meaning used to live in a `title` tooltip reading "88% JD keyword coverage": invisible on
 *  touch, invisible to the keyboard, and written in the engine's vocabulary. It is a real
 *  sentence in the accessible name now, and the visible caption under the ring says what the
 *  number counts in words a student already owns. */
export function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const r = 15.9155;
  return (
    <div className="relative h-12 w-12 shrink-0" role="img" aria-label={`${pct} out of 100 words in this job post also appear on your resume`}>
      <svg aria-hidden="true" viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-surface-alt)" strokeWidth="3.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${pct} 100`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold text-ink">
        {pct}
      </span>
    </div>
  );
}

/** Inline pending label: a small orb next to button/status text, never wraps.
   `onColor` is for white-text buttons on a solid brand background, where the
   orb must render light dots regardless of the page's own light/dark mode. */
export function PendingLabel({
  children,
  state = "working",
  onColor = false,
}: {
  children: React.ReactNode;
  state?: OrbState;
  onColor?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <ThinkingOrb state={state} size={20} theme={onColor ? "dark" : "auto"} />
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
}

/** Section/page-level pending cue: pairs with ShimmerRows, doesn't replace it. */
export function LoadingOrb({
  label,
  state = "working",
}: {
  label?: string;
  state?: OrbState;
}) {
  return (
    <div className="flex items-center gap-2">
      <ThinkingOrb state={state} size={20} />
      {label && <span className="text-sm text-muted">{label}</span>}
    </div>
  );
}

export function ShimmerRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rq-shimmer h-16" />
      ))}
    </div>
  );
}

/* The dashboard's page header.
 *
 * All seven pages repeated the same five-class h1 string by hand, and had already
 * drifted: one used mt-2 for its subhead where the rest used mt-1, and the header
 * block varied in whether it carried a divider (audit finding 42). A repeated
 * string is a pattern nobody can enforce; a component is one you cannot get wrong.
 *
 * `action` is the page's one primary control, kept on the header's baseline. */
export function PageHeader({
  title,
  sub,
  action,
  size = "section",
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  /** The Applications page shrinks its title while the review drawer is open. */
  size?: "section" | "heading";
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1
          className={`font-normal leading-[1.15] tracking-[-0.02em] text-ink ${
            size === "heading" ? "text-heading" : "text-section"
          }`}
        >
          {title}
        </h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-y border-border py-10 text-center">
      <h3 className="text-base font-medium text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{body}</p>
      {children && <div className="mt-6 flex justify-center">{children}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-inner bg-danger-soft px-4 py-3 text-sm text-danger">
      {userFacingError(message)}
    </p>
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* A job hunt is a thing with momentum, and an absolute date carries none of it: "Jul 21, 2026"
   does not tell a student whether that was this morning or three weeks ago. Inside a week we say
   how long ago, which is the only form that answers "is this still moving?". Past a week the
   absolute date is the more useful fact again. */
export function formatRelativeDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}
