"use client";

import { TermMark } from "@/components/app/RequirementText";
import type { PacketAudit } from "@/lib/api";
import { exactPacketAuditRanges, manualHandoffMatchesPacket, manualTrialPacketEvidenceIsFresh, packetAuditDisplayIsExact, packetAuditResponseMatchesApplication } from "@/features/applications";

export { manualHandoffMatchesPacket, manualTrialPacketEvidenceIsFresh, packetAuditDisplayIsExact, packetAuditResponseMatchesApplication };

export function AuditedJobDescription({ jdText, audit }: { jdText: string; audit: PacketAudit }) {
  if (!packetAuditDisplayIsExact(jdText, audit)) {
    return <p role="alert" className="rounded-inner bg-danger-soft px-4 py-3 text-sm text-danger">The requirement evidence does not match this saved job description.</p>;
  }
  const ranges = exactPacketAuditRanges(jdText, audit) ?? [];
  const content: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) content.push(jdText.slice(cursor, range.start));
    content.push(
      <TermMark key={`${range.start}:${range.end}:${range.tone}`} term={range.key || range.text.toLowerCase()} tone={range.tone}>
        {jdText.slice(range.start, range.end)}
      </TermMark>,
    );
    cursor = range.end;
    if (index === ranges.length - 1 && cursor < jdText.length) content.push(jdText.slice(cursor));
  });
  if (ranges.length === 0) content.push(jdText);
  return <div className="whitespace-pre-line">{content}</div>;
}

export function PacketAuditBreakdown({ jdText, audit }: { jdText: string; audit: PacketAudit }) {
  if (!packetAuditDisplayIsExact(jdText, audit)) {
    return <p role="alert" className="rounded-inner bg-danger-soft px-4 py-3 text-sm text-danger">The requirement evidence does not match this saved job description.</p>;
  }
  return (
    <section aria-labelledby="packet-audit-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="packet-audit-heading" className="text-sm font-medium text-ink">Requirement evidence</h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-positive">Exact packet checked</p>
      </div>
      <dl className="mt-3 grid gap-3 rounded-inner border border-border bg-surface-alt px-4 py-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted">Resume email</dt>
          <dd className="mt-1 break-all font-mono text-ink">{audit.identities.resume_email}</dd>
        </div>
        <div>
          <dt className="text-muted">Portal routing email</dt>
          <dd className="mt-1 break-all font-mono text-ink">{audit.identities.applicant_email}</dd>
        </div>
      </dl>
      <ul className="mt-3 space-y-3">
        {audit.clauses.map((clause) => (
          <li key={`${clause.start}:${clause.end}`} className="rounded-inner border border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-6 text-ink">{clause.text}</p>
              <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[0.06em] ${clause.verdict === "covered" ? "bg-brand-soft text-brand-ink" : clause.verdict === "missing" ? "bg-warn-soft text-warn" : "bg-panel-soft text-muted"}`}>
                {clause.verdict === "covered" ? "Covered" : clause.verdict === "missing" ? "Gap" : "Not scoreable"}
              </span>
            </div>
            {clause.evidence && (
              <ul className="mt-2 space-y-1 border-l-2 border-brand pl-3 text-xs leading-5 text-muted">
                {clause.evidence.map((evidence) => (
                  <li key={`${evidence.source}:${evidence.path}:${evidence.sha256}`}>
                    {evidence.source === "resume_spec" ? "Resume evidence" : "Profile evidence"}: {evidence.quote}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
