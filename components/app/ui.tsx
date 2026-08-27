"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { userFacingError } from "@/lib/user-facing-error";
import { EXTENSION_STORE_URL, messageAsksForTheExtension } from "@/lib/extension-store-link";
import { Button } from "@/components/app/Button";

/* Shared in-app primitives, per brand deck sections 04 (shape/surface) and 07
   (review view): quiet surfaces, pill chips, shimmer loading, match-score ring.
   Color encodes what something is (pillar), never how urgently to act. */

export function Card({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={`min-w-0 rounded-card border border-border bg-surface [overflow-wrap:anywhere] ${className}`}>
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
      className={`inline-flex min-w-0 max-w-full items-center rounded-full px-2.5 py-0.5 text-center font-mono text-[11px] font-medium uppercase tracking-[0.05em] [overflow-wrap:anywhere] ${style}`}
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
    <div className="min-w-0">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm font-medium text-ink [overflow-wrap:anywhere]">{label}</span>
        <span className="shrink-0 font-mono text-xs text-muted">
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
      {unlimited && <p className="mt-1.5 text-[11px] text-muted">No limit on your plan</p>}
    </div>
  );
}

/** Match-score ring (deck 07). Only rendered when a real score exists.
 *
 *  The meaning used to live in a `title` tooltip reading "88% JD keyword coverage": invisible on
 *  touch, invisible to the keyboard, and written in the engine's vocabulary. It is a real
 *  sentence in the accessible name now, and the visible caption under the ring says what the
 *  number counts in words a student already owns. */
export function ScoreRing({
  score,
  metricLabel = "words in this job post also appear on your resume",
}: {
  score: number;
  metricLabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const r = 15.9155;
  return (
    <div className="relative h-12 w-12 shrink-0" role="img" aria-label={`${pct} out of 100 ${metricLabel}`}>
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

/** Inline pending label: a small orb next to button/status text, wrapping only when containment requires it.
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
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <ThinkingOrb state={state} size={20} theme={onColor ? "dark" : "auto"} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
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
    <div className="flex items-center gap-2" role="status" aria-live="polite" aria-busy={state === "working" || state === "composing"}>
      <span aria-hidden="true"><ThinkingOrb state={state} size={20} /></span>
      <span className={label ? "text-sm text-muted" : "sr-only"}>{label ?? "Loading"}</span>
    </div>
  );
}

export function ShimmerRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rq-skeleton divide-y divide-border border-y border-border" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} aria-hidden="true" className="rq-shimmer h-16" />
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
  visual,
  headingLevel = "h3",
  children,
}: {
  title: string;
  body: string;
  visual: "applications" | "emails" | "jobs" | "profile" | "error";
  headingLevel?: "h1" | "h2" | "h3";
  children?: React.ReactNode;
}) {
  const Heading = headingLevel;
  return (
    <div className="border-y border-border py-10 text-center">
      <EmptyStateVisual kind={visual} />
      <Heading className="text-base font-medium text-ink">{title}</Heading>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{body}</p>
      {children && <div className="mt-6 flex justify-center">{children}</div>}
    </div>
  );
}

export function DataErrorState({
  title,
  body,
  onRetry,
  headingLevel = "h1",
}: {
  title: string;
  body: string;
  onRetry: () => void;
  headingLevel?: "h1" | "h2" | "h3";
}) {
  return (
    <div role="alert">
      <EmptyState visual="error" title={title} body={body} headingLevel={headingLevel}>
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
      </EmptyState>
    </div>
  );
}

/**
 * A small diagram of the missing object, not decoration. Each first-use state gets its own
 * silhouette, while failure gets a broken connection rather than an empty container. Keeping the
 * drawings unfilled and neutral preserves the quiet-instrument system and avoids the familiar
 * icon-in-a-coloured-circle treatment this product deliberately rejects.
 */
function EmptyStateVisual({
  kind,
}: {
  kind: "applications" | "emails" | "jobs" | "profile" | "error";
}) {
  const shared = "mx-auto mb-5 h-11 w-11 text-faint";

  if (kind === "emails") {
    return (
      <svg aria-hidden="true" viewBox="0 0 44 44" className={shared} fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="5.5" y="10" width="33" height="24" rx="4" />
        <path d="m7 13 15 11 15-11" />
        <path d="M13 38h18" strokeDasharray="2 3" />
      </svg>
    );
  }

  if (kind === "jobs") {
    return (
      <svg aria-hidden="true" viewBox="0 0 44 44" className={shared} fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="19" cy="19" r="10.5" />
        <path d="m27 27 8.5 8.5M14 16h10M14 20h7" />
      </svg>
    );
  }

  if (kind === "profile") {
    return (
      <svg aria-hidden="true" viewBox="0 0 44 44" className={shared} fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="22" cy="15" r="6" />
        <path d="M10 35c1.8-7 6-10.5 12-10.5S32.2 28 34 35" />
        <path d="M8 39h28" strokeDasharray="2 3" />
      </svg>
    );
  }

  if (kind === "error") {
    return (
      <svg aria-hidden="true" viewBox="0 0 44 44" className={shared} fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M7 22h8l4-6 6 12 4-6h8" />
        <path d="M8 10h28v24H8z" strokeDasharray="3 3" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 44 44" className={shared} fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M12 5.5h15l7 7V38H12z" />
      <path d="M27 5.5v7h7M17 20h12M17 25h9M17 30h7" />
      <path d="M7 10v28h22" strokeDasharray="2 3" />
    </svg>
  );
}

/**
 * The action that ENDS a screen, kept on screen while you read the screen.
 *
 * The review screen is one long document: a job description, an editable resume, a cover letter,
 * and then, last, the button that fills the form. On a laptop that is fine, the whole thing is
 * about a viewport and a half. At 744x789 the same screen is ~2900px and the primary action is
 * roughly 2100px of scrolling away, past an editable resume that swallows Page_Down and End
 * because focus lands inside a textarea. The product's core action was the hardest thing on its
 * own screen to reach, and Litos's traffic is TikTok and Instagram, so narrow is the common case.
 *
 * So below lg the bar parks at the bottom of the viewport and settles into its real place in the
 * document once you scroll that far. `sticky` and not `fixed`: fixed would need the surrounding
 * document to reserve a hole for it and would sit there on desktop too, where there is no problem
 * to solve. Sticky costs nothing above lg (`lg:static`) and needs no reserved space, because at
 * the end of the scroll the element IS in its flow position.
 *
 * `bottom` is --dashboard-action-sticky-offset, which equals --dashboard-action-offset (the value
 * `main` reserves as bottom padding) until a software keyboard opens. That is
 * the point of there being one variable: park it anywhere else and the bar visibly hops as it goes
 * from stuck to settled on the last scroll increment, which is exactly where a thumb is already
 * reaching for it. The offset carries the tab bar's height, so above lg (where the bar is hidden
 * and its term is 0) this lands at the ordinary page gutter.
 *
 * The `,2.5rem` fallback is not decoration. The variable is declared on :root by app/globals.css,
 * but a caller who renders this outside that stylesheet gets an unresolvable var(), which makes
 * `bottom` invalid at computed-value time, which silently turns sticky into a no-op with nothing
 * failing loudly. The fallback degrades to a plain page-gutter offset instead.
 *
 * WHY THIS WORKS AT ALL, since it is the part that is easy to break: a bottom-sticky element can
 * only travel inside its containing block, and this bar is always the LAST child of its section.
 * The travel therefore comes from the PARENT being tall, not from anything below the bar. Keep it
 * as a direct child of the screen's full-height wrapper. Move it inside a short card and it will
 * silently stop sticking, with nothing failing loudly to tell you.
 */
export function TerminalActionBar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`sticky bottom-[var(--dashboard-action-sticky-offset,2.5rem)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-alt p-4 shadow-raised lg:static lg:shadow-none ${className}`}
    >
      {children}
    </div>
  );
}

const NOTICE = {
  error: { role: "alert", label: "Error", mark: "!", styles: "bg-danger-soft text-danger" },
  warning: { role: "status", label: "Warning", mark: "!", styles: "bg-warn-soft text-warn" },
  success: { role: "status", label: "Success", mark: "✓", styles: "bg-positive-soft text-positive" },
  info: { role: "status", label: "Information", mark: "i", styles: "bg-brand-soft text-brand-ink" },
} as const;

/* THE WAY OUT OF A REFUSAL THAT NAMES A DESTINATION IT CANNOT REACH.
 *
 * "Update the Litos extension from the Chrome Web Store, then try again." named a page the screen
 * would not take her to, and the listing is addressed by a 32-character extension id nobody can
 * guess or search for. Measured live on the applications composer, 2026-08-26: "Fill application"
 * refused with exactly that sentence and offered no way forward anywhere on the page.
 *
 * Rendered HERE, inside the one Notice every ErrorNote in the app delegates to, rather than beside
 * each call site: any surface that can refuse for a missing or stale extension gets the way out for
 * free, including the ones that do not exist yet. See lib/extension-store-link.ts for why it is
 * scoped to install/update refusals and deliberately silent on the "signed in to another account"
 * message, which the store does not answer.
 *
 * Keyed on the RESOLVED text, not the raw message, because userFacingError rewrites what is shown -
 * testing the input would decide the link from a sentence the applicant never reads. */
export function ExtensionStoreLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={EXTENSION_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-medium underline underline-offset-2 ${className}`.trim()}
    >
      Get the Litos extension
    </a>
  );
}

export function Notice({ message, variant = "info" }: { message: string; variant?: keyof typeof NOTICE }) {
  const notice = NOTICE[variant];
  const text = variant === "error" ? userFacingError(message) : message;
  return (
    <p role={notice.role} className={`flex items-start gap-2 rounded-inner px-4 py-3 text-sm ${notice.styles}`}>
      <span aria-hidden="true" className="font-mono font-semibold">{notice.mark}</span>
      {/* The link sits INSIDE the alert element on purpose: it is part of the answer, so a screen
          reader hears "…then try again. Get the Litos extension" as one announcement rather than
          leaving her to discover the way forward only by tabbing past the alert. */}
      <span>
        <span className="sr-only">{notice.label}: </span>{text}
        {messageAsksForTheExtension(text) && <> <ExtensionStoreLink /></>}
      </span>
    </p>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <Notice message={message} variant="error" />;
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
