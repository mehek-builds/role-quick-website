"use client";

import { useEffect, useState } from "react";
import { api, GeneratedResume, OutreachEvent } from "@/lib/api";
import { STORE_URL } from "@/lib/config";
import {
  Card,
  Chip,
  ScoreRing,
  ShimmerRows,
  EmptyState,
  ErrorNote,
  formatDate,
} from "@/components/app/ui";

/* The unified review view (brand deck section 07): everything Litos made
   for one job, reviewed together under one job header. The resume packet is
   the anchor row; the matching outreach event (same company) rides along. */

type Packet = {
  resume: GeneratedResume;
  outreach: OutreachEvent | null;
  score: number | null;
  keywords: string[];
};

export default function Applications() {
  const [packets, setPackets] = useState<Packet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [resumesRes, eventsRes] = await Promise.all([
          api<{ resumes: GeneratedResume[] }>("/resume/history"),
          api<{ events?: OutreachEvent[] } | OutreachEvent[]>("/track/events").catch(
            () => [] as OutreachEvent[],
          ),
        ]);
        if (cancelled) return;
        const events = Array.isArray(eventsRes) ? eventsRes : (eventsRes.events ?? []);
        const items = resumesRes.resumes.map((resume) => ({
          resume,
          outreach: matchEvent(resume, events),
          score: extractScore(resume.spec),
          keywords: extractKeywords(resume.spec),
        }));
        setPackets(items);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load applications.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Applications</h1>
        <p className="mt-1 text-sm text-muted">
          Everything for one job in one place: the tailored resume, the filled
          fields, and the outreach note, reviewed together.
        </p>
      </div>

      {packets === null ? (
        <ShimmerRows rows={4} />
      ) : packets.length === 0 ? (
        <EmptyState
          title="No applications yet"
          body="When you open a job posting with the extension, Litos builds a tailored resume, fills the fields, and drafts an outreach email. Each one lands here for you to review."
        >
          <a
            href={STORE_URL}
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add Litos to Chrome
          </a>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {packets.map(({ resume, outreach, score, keywords }) => (
            <Card key={resume.id} className="p-6">
              {/* Job header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  {score !== null && <ScoreRing score={score} />}
                  <div>
                    <h2 className="text-base font-medium text-ink">
                      {resume.job_context?.role ?? "Role"}
                    </h2>
                    <p className="mt-0.5 text-sm text-muted">
                      {resume.job_context?.company ?? "Company"}
                      {resume.created_at && (
                        <span className="text-faint"> · {formatDate(resume.created_at)}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip label="Resume ready" kind="ready" />
                  {outreach ? (
                    <Chip label={`Outreach ${outreach.status}`} kind={outreach.status} />
                  ) : (
                    <Chip label="No outreach yet" kind="draft" />
                  )}
                </div>
              </div>

              {/* Keyword coverage */}
              {keywords.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {keywords.slice(0, 10).map((k) => (
                    <span
                      key={k}
                      className="rounded-full bg-surface-alt px-2.5 py-0.5 font-mono text-[11px] text-muted"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}

              {/* Outreach note preview */}
              {outreach?.draft_text && (
                <div className="mt-4 rounded-[12px] bg-coral-soft/60 p-4">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-coral-ink">
                    Outreach note{outreach.contact?.full_name ? ` to ${outreach.contact.full_name}` : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">
                    {open === resume.id
                      ? outreach.draft_text
                      : truncate(outreach.draft_text, 180)}
                  </p>
                  {outreach.draft_text.length > 180 && (
                    <button
                      onClick={() => setOpen(open === resume.id ? null : resume.id)}
                      className="mt-2 text-xs font-medium text-coral-ink hover:underline"
                    >
                      {open === resume.id ? "Show less" : "Show full draft"}
                    </button>
                  )}
                </div>
              )}

              <p className="mt-4 text-xs text-faint">
                The resume PDF downloads from the extension at generation time.
                You review before anything is submitted.
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function matchEvent(
  resume: GeneratedResume,
  events: OutreachEvent[],
): OutreachEvent | null {
  const company = resume.job_context?.company?.toLowerCase().trim();
  if (!company) return null;
  const compact = company.replace(/\s+/g, "");
  return (
    events.find((e) => {
      const domain = e.contact?.company_domain?.toLowerCase() ?? "";
      return domain !== "" && (domain.includes(compact) || compact.includes(domain.split(".")[0]));
    }) ?? null
  );
}

/* spec is the backend's tailoring decision plus a _quality audit block; shapes
   have shifted across versions, so both readers stay defensive. */
function extractScore(spec: Record<string, unknown>): number | null {
  const quality = spec?.["_quality"] as Record<string, unknown> | undefined;
  const cov = quality?.["atsCoverage"];
  if (typeof cov === "number") return cov <= 1 ? cov * 100 : cov;
  if (cov && typeof cov === "object") {
    const o = cov as Record<string, unknown>;
    const matched = Number(o.matched ?? o.covered ?? NaN);
    const total = Number(o.total ?? NaN);
    if (Number.isFinite(matched) && Number.isFinite(total) && total > 0) {
      return (matched / total) * 100;
    }
  }
  return null;
}

function extractKeywords(spec: Record<string, unknown>): string[] {
  for (const key of ["keywords", "jd_keywords", "target_keywords", "skills"]) {
    const v = spec?.[key];
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      return v as string[];
    }
  }
  return [];
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n).trimEnd() + "...";
}
