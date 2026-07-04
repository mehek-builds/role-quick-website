"use client";

/* Shared in-app primitives, per brand deck sections 04 (shape/surface) and 07
   (review view): 20px cards, pill chips, shimmer loading, match-score ring.
   Color encodes what something is (pillar), never how urgently to act. */

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[20px] border border-border bg-surface ${className}`}>
      {children}
    </div>
  );
}

const CHIP_STYLES: Record<string, string> = {
  // review-flow statuses (deck 07): Draft -> Generating -> Ready -> Sent.
  // Status runs neutral-to-semantic; pillar color marks artifact type only.
  draft: "bg-surface-alt text-muted",
  generating: "bg-surface-alt text-muted",
  drafted: "bg-surface-alt text-muted",
  ready: "bg-brand-soft text-brand-ink",
  sent: "bg-positive-soft text-positive",
  replied: "bg-positive-soft text-positive",
  bounced: "bg-danger-soft text-danger",
  // contact confidence tiers (same scale as the marketing mockups)
  verified: "bg-positive-soft text-positive",
  likely: "bg-warn-soft text-warn",
  linkedin_only: "bg-surface-alt text-muted",
  // persona marks what a contact is: an outreach-pillar artifact, not a status
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
      <p className="mt-1.5 text-[11px] text-faint">
        {unlimited ? "No cap on your plan" : "Resets on the 1st of the month"}
      </p>
    </div>
  );
}

/** Match-score ring (deck 07). Only rendered when a real score exists. */
export function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const r = 15.9155;
  return (
    <div className="relative h-12 w-12 shrink-0" title={`${pct}% JD keyword coverage`}>
      <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-surface-alt)" strokeWidth="3.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="var(--color-brand)"
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

export function ShimmerRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rq-shimmer h-16 rounded-[20px]" />
      ))}
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
    <Card className="p-10 text-center">
      <h3 className="text-base font-medium text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{body}</p>
      {children && <div className="mt-6 flex justify-center">{children}</div>}
    </Card>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-sm text-danger">
      {message}
    </p>
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
