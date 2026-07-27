"use client";

import { Button } from "@/components/app/Button";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, type MonitoredJob } from "@/lib/api";
import { Card, EmptyState, ErrorNote, ShimmerRows, formatRelativeDate } from "@/components/app/ui";

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
        .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "Could not load the jobs we watch for you."));
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
      if (requestVersion.current === version) setError(reason instanceof Error ? reason.message : "Could not load any more jobs.");
    } finally {
      if (requestVersion.current === version) setLoadingMore(false);
    }
  }

  const companies = useMemo(() => new Set(jobs?.map((job) => job.company_name)).size, [jobs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-normal leading-[1.15] tracking-[-0.02em] text-ink">Jobs</h1>
        <p className="mt-2 text-sm text-muted">Every job Litos has found for you.</p>
      </div>

      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_0.7fr_auto]">
        <input aria-label="Search roles" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, skill, or keyword" className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:border-brand focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30" />
        <input aria-label="Filter by location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:border-brand focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30" />
        <label className="flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm text-ink transition-colors hover:border-brand focus-within:ring-2 focus-within:ring-brand/30">
          <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} className="accent-brand" />
          Remote only
        </label>
      </Card>

      {jobs && <p className="text-xs text-muted">{jobs.length} role{jobs.length === 1 ? "" : "s"} at {companies} compan{companies === 1 ? "y" : "ies"}{hasMore ? ", and more to load" : ""}</p>}
      {error && <ErrorNote message={error} />}
      {jobs === null ? <ShimmerRows rows={5} /> : jobs.length === 0 ? (
        <EmptyState title="No matching roles" body="Try a shorter search, or clear the location. New jobs show up here as Litos finds them." />
      ) : (
        <div className="grid gap-3">
          {jobs.map((job) => (
            <Card key={job.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  
                  <h2 className="mt-3 text-lg font-medium text-ink">{job.title}</h2>
                  <p className="mt-1 text-sm text-muted">{job.company_name}{job.location ? ` · ${job.location}` : ""}{job.remote && !/remote/i.test(job.location ?? "") ? " · Remote" : ""}</p>
                  <p className="mt-2 font-mono text-[11px] text-faint">Found {formatRelativeDate(job.first_seen_at)}{job.department ? ` · ${job.department}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <a href={job.posting_url} target="_blank" rel="noreferrer" className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View posting</a>
                  <Link href={`/dashboard/applications?job=${job.id}`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Get my resume</Link>
                </div>
              </div>
            </Card>
          ))}
          {hasMore && (
            <Button type="button" onClick={() => void loadMore()} disabled={loadingMore} variant="secondary" className="mx-auto mt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              {loadingMore ? "Loading..." : "Show more roles"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
