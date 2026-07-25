"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type MonitoredJob } from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, ShimmerRows, formatDate } from "@/components/app/ui";

export default function JobsPage() {
  const [jobs, setJobs] = useState<MonitoredJob[] | null>(null);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (location.trim()) params.set("location", location.trim());
      if (remoteOnly) params.set("remote", "true");
      api<{ jobs: MonitoredJob[] }>(`/jobs?${params.toString()}`)
        .then((result) => {
          if (!cancelled) {
            setJobs(result.jobs);
            setError(null);
          }
        })
        .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "Could not load monitored jobs."));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [location, query, remoteOnly]);

  const companies = useMemo(() => new Set(jobs?.map((job) => job.company_name)).size, [jobs]);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Monitored career pages</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight text-ink">Fresh roles, ready for a tailored application.</h1>
        <p className="mt-1 text-sm text-muted">Litos checks participating company career pages and brings active postings into one feed.</p>
      </div>

      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_0.7fr_auto]">
        <input aria-label="Search roles" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, skill, or keyword" className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
        <input aria-label="Filter by location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
        <label className="flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm text-ink">
          <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} className="accent-brand" />
          Remote only
        </label>
      </Card>

      {jobs && <p className="font-mono text-xs text-faint">{jobs.length} active roles across {companies} companies</p>}
      {error && <ErrorNote message={error} />}
      {jobs === null ? <ShimmerRows rows={5} /> : jobs.length === 0 ? (
        <EmptyState title="No matching roles" body="Try a broader keyword or location. Monitored roles will appear here after the next career-page check." />
      ) : (
        <div className="grid gap-3">
          {jobs.map((job) => (
            <Card key={job.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip label={job.ats_name} kind="ready" />
                    {job.remote && <Chip label="Remote" kind="sent" />}
                  </div>
                  <h2 className="mt-3 text-lg font-medium text-ink">{job.title}</h2>
                  <p className="mt-1 text-sm text-muted">{job.company_name}{job.location ? ` · ${job.location}` : ""}</p>
                  <p className="mt-2 font-mono text-[11px] text-faint">Found {formatDate(job.first_seen_at)}{job.department ? ` · ${job.department}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <a href={job.posting_url} target="_blank" rel="noreferrer" className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View posting</a>
                  <Link href={`/dashboard/applications?job=${job.id}`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Apply with Litos</Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
