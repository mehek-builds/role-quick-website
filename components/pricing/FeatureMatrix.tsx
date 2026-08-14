import { FEATURE_COMPARISON } from "@/features/billing";

export function FeatureMatrix() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface" role="table" aria-label="Free, trial, and Litos+ features">
      <div role="row" className="hidden grid-cols-[minmax(220px,1.25fr)_repeat(3,minmax(150px,1fr))] border-b border-border bg-surface-alt font-mono text-label uppercase tracking-[0.08em] text-muted md:grid">
        <div role="columnheader" className="p-4">Capability</div>
        <div role="columnheader" className="border-l border-border p-4">Free</div>
        <div role="columnheader" className="border-l border-border p-4">7-day trial</div>
        <div role="columnheader" className="border-l border-border p-4 text-brand-ink">Litos+</div>
      </div>
      {FEATURE_COMPARISON.map((row) => (
        <div key={row.feature} role="row" className="grid gap-3 border-b border-border p-4 last:border-0 md:grid-cols-[minmax(220px,1.25fr)_repeat(3,minmax(150px,1fr))] md:gap-0 md:p-0">
          <div role="rowheader" className="text-small font-medium text-ink md:p-4">{row.feature}</div>
          <MatrixValue label="Free" value={row.free} tone={row.tone} />
          <MatrixValue label="7-day trial" value={row.trial} tone={row.tone} />
          <MatrixValue label="Litos+" value={row.plus} tone={row.tone} plus />
        </div>
      ))}
    </div>
  );
}

function MatrixValue({ label, value, tone, plus = false }: { label: string; value: string; tone?: "fill" | "documents" | "outreach"; plus?: boolean }) {
  const toneClass = tone === "fill" ? "text-teal-ink" : tone === "outreach" ? "text-coral-ink" : plus ? "text-brand-ink" : "text-muted";
  return (
    <div role="cell" className={`text-small ${toneClass} md:border-l md:border-border md:p-4`}>
      <span className="mr-2 font-mono text-label uppercase tracking-[0.08em] text-faint md:hidden">{label}</span>
      {value}
    </div>
  );
}
