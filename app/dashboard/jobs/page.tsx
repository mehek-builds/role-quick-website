"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, type MonitoredJob } from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, ShimmerRows, formatDate } from "@/components/app/ui";

function jobParams(query: string, location: string, remoteOnly: boolean, offset: number) {
  const params = new URLSearchParams({ offset: String(offset) });
  if (query.trim()) params.set("q", query.trim());
  if (location.trim()) params.set("location", location.trim());
  if (remoteOnly) params.set("remote", "true");
  return params;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<MonitoredJob[] | null>(null);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const version = ++requestVersion.current;
    const timer = window.setTimeout(() => {
      api<{ jobs: MonitoredJob[]; has_more: boolean }>(`/jobs?${jobParams(query, location, remoteOnly, 0).toString()}`)
        .then((result) => {
          if (!cancelled && requestVersion.current === version) {
            setJobs(result.jobs);
            setHasMore(result.has_more);
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

  async function loadMore() {
    if (!jobs || loadingMore || !hasMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    try {
      const result = await api<{ jobs: MonitoredJob[]; has_more: boolean }>(`/jobs?${jobParams(query, location, remoteOnly, jobs.length).toString()}`);
      if (requestVersion.current !== version) return;
      setJobs((current) => current ? [...current, ...result.jobs] : result.jobs);
      setHasMore(result.has_more);
      setError(null);
    } catch (reason) {
      if (requestVersion.current === version) setError(reason instanceof Error ? reason.message : "Could not load more monitored jobs.");
    } finally {
      if (requestVersion.current === version) setLoadingMore(false);
    }
  }

  const companies = useMemo(() => new Set(jobs?.map((job) => job.company_name)).size, [jobs]);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">All jobs</p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.025em] text-ink">Search the full feed.</h1>
        <p className="mt-2 text-sm text-muted">Active roles collected across supported job boards.</p>
      </div>

      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_0.7fr_auto]">
        <input aria-label="Search roles" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, skill, or keyword" className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:border-brand focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30" />
        <input aria-label="Filter by location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:border-brand focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30" />
        <label className="flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm text-ink transition-colors hover:border-brand focus-within:ring-2 focus-within:ring-brand/30">
          <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} className="accent-brand" />
          Remote only
        </label>
      </Card>

      {jobs && <p className="font-mono text-xs text-faint">{jobs.length} loaded active roles across {companies} companies{hasMore ? ", more available" : ""}</p>}
      {error && <ErrorNote message={error} />}
      {jobs === null ? <ShimmerRows rows={5} /> : jobs.length === 0 ? (
        <EmptyState title="No matching roles" body="Try a broader keyword or location. Monitored roles will appear here after the next career-page check." />
      ) : (
        <div className="grid gap-3">
          {jobs.map((job) => (
            <Card key={job.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  {job.remote && <Chip label="Remote" kind="sent" />}
                  <h2 className="mt-3 text-lg font-medium text-ink">{job.title}</h2>
                  <p className="mt-1 text-sm text-muted">{job.company_name}{job.location ? ` · ${job.location}` : ""}</p>
                  <p className="mt-2 font-mono text-[11px] text-faint">Found {formatDate(job.first_seen_at)}{job.department ? ` · ${job.department}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <a href={job.posting_url} target="_blank" rel="noreferrer" className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View posting</a>
                  <Link href={`/dashboard/applications?job=${job.id}`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Generate resume</Link>
                </div>
              </div>
            </Card>
          ))}
          {hasMore && (
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mx-auto mt-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">
              {loadingMore ? "Loading..." : "Load more roles"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
