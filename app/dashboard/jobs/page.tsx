"use client";

import { Button } from "@/components/app/Button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, type JobsPage, type MonitoredJob } from "@/lib/api";
import { fetchBoard } from "@/lib/jd-match";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import { Card, EmptyState, ErrorNote, ShimmerRows, formatRelativeDate } from "@/components/app/ui";

function jobParams(query: string, location: string, remoteOnly: boolean, offset: number) {
  const params = new URLSearchParams({ offset: String(offset) });
  if (query.trim()) params.set("q", query.trim());
  if (location.trim()) params.set("location", location.trim());
  if (remoteOnly) params.set("remote", "true");
  return params;
}

/* Company and role, flattened enough that "Airbnb, Inc." and "Airbnb" are the same employer and
   "Senior  Product Analyst" is the same role as "Senior Product Analyst". Deliberately NOT clever:
   this decides whether a row says "Applied", and a loose rule that folded two different postings at
   one company together would tell a student they had applied to something they had not. */
function applicationKey(company: string, role: string): string {
  const flatten = (value: string) =>
    value
      .toLowerCase()
      .replace(/[.,]/g, "")
      .replace(/\b(inc|llc|ltd|corp|corporation|co)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return `${flatten(company)}::${flatten(role)}`;
}

/** Postings first seen since midnight, which is what "new today" means to the person reading it. */
function countNewToday(jobs: MonitoredJob[]): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return jobs.filter((job) => new Date(job.first_seen_at).getTime() >= midnight.getTime()).length;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<MonitoredJob[] | null>(null);
  const [ranked, setRanked] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /* Null until the board answers. An empty Set would mean "you have applied to nothing", which is
     a different claim from "we do not know yet". */
  const [applied, setApplied] = useState<Set<string> | null>(null);
  /* Null while we work out whether this is a QA render, so neither branch fires a request first. */
  const [qaMode, setQaMode] = useState<boolean | null>(null);
  const requestVersion = useRef(0);

  /* Same gate the dashboard shell uses: localhost AND an explicit ?qa=1. Fixtures can never be
     reached in production, and the check is not a hostname test alone. */
  useEffect(() => {
    queueMicrotask(() =>
      setQaMode(
        window.location.hostname === "localhost" &&
          new URLSearchParams(window.location.search).has("qa"),
      ),
    );
  }, []);

  useEffect(() => {
    if (qaMode !== true) return;
    let cancelled = false;
    void import("./qa-data").then(({ qaJobsPage, QA_APPLIED }) => {
      if (cancelled) return;
      const page = qaJobsPage();
      setJobs(page.jobs);
      setRanked(page.ranked);
      setHasMore(page.has_more);
      setApplied(new Set(QA_APPLIED.map((card) => applicationKey(card.company, card.role))));
    });
    return () => {
      cancelled = true;
    };
  }, [qaMode]);

  useEffect(() => {
    if (qaMode !== false) return;
    let cancelled = false;
    const version = ++requestVersion.current;
    const timer = window.setTimeout(() => {
      api<JobsPage>(`/jobs?${jobParams(query, location, remoteOnly, 0).toString()}`)
        .then((result) => {
          if (!cancelled && requestVersion.current === version) {
            setJobs(result.jobs);
            setRanked(result.ranked);
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
  }, [location, qaMode, query, remoteOnly]);

  /* Which of these the student has already applied to. Fetched once, not per filter change: it is
     a fact about their account, not about the query. A failure here leaves it null, and a row that
     does not know simply offers to apply — the worst case is a second visit to a posting, which is
     recoverable, where a wrongly-shown "Applied" is a missed application, which is not. */
  useEffect(() => {
    if (qaMode !== false) return;
    let cancelled = false;
    void fetchBoard()
      .then(({ cards }) => {
        if (cancelled) return;
        setApplied(
          new Set(
            cards
              .filter((card) => card.stage !== "saved")
              .map((card) => applicationKey(card.company, card.role)),
          ),
        );
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [qaMode]);

  const loadMore = useCallback(async () => {
    if (!jobs || loadingMore || !hasMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    try {
      const result = await api<JobsPage>(`/jobs?${jobParams(query, location, remoteOnly, jobs.length).toString()}`);
      if (requestVersion.current !== version) return;
      setJobs((current) => (current ? [...current, ...result.jobs] : result.jobs));
      setHasMore(result.has_more);
      setError(null);
    } catch (reason) {
      if (requestVersion.current === version) setError(reason instanceof Error ? reason.message : "Could not load any more jobs.");
    } finally {
      if (requestVersion.current === version) setLoadingMore(false);
    }
  }, [hasMore, jobs, loadingMore, location, query, remoteOnly]);

  const newToday = useMemo(() => (jobs ? countNewToday(jobs) : 0), [jobs]);
  const filtering = query.trim() !== "" || location.trim() !== "" || remoteOnly;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-label uppercase tracking-[0.08em] text-faint">Jobs</p>
          {/* The headline is the ordering. It only claims to be about fit when the list actually
              was ranked against a resume, which is why it is not a constant. */}
          <h1 className="mt-1.5 text-section font-normal leading-[1.15] tracking-[-0.02em] text-ink">
            {ranked ? "Top matches for you." : "Every job we found."}
          </h1>
        </div>
        {newToday > 0 && (
          <span className="flex min-h-8 items-center gap-2 rounded-full bg-brand-soft px-3.5 font-mono text-[11px] font-medium text-brand-ink">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
            {newToday} new today
          </span>
        )}
      </div>

      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_0.7fr_auto]">
        <input aria-label="Search roles" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, skill, or keyword" className="rounded-inner border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:border-brand focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30" />
        <input aria-label="Filter by location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="rounded-inner border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:border-brand focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30" />
        <label className="flex items-center gap-2 rounded-control border border-border px-4 py-2.5 text-sm text-ink transition-colors hover:border-brand focus-within:ring-2 focus-within:ring-brand/30">
          <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} className="accent-brand" />
          Remote only
        </label>
      </Card>

      {error && <ErrorNote message={error} />}

      {jobs === null ? (
        <ShimmerRows rows={5} />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No matching roles"
          body={
            filtering
              ? "Try a shorter search, or clear the location. New jobs show up here as Litos finds them."
              : "New jobs show up here as Litos finds them."
          }
        />
      ) : (
        <>
          <ul className="grid gap-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobRow job={job} applied={applied?.has(applicationKey(job.company_name, job.title)) ?? false} />
              </li>
            ))}
          </ul>

          {/* One line, and every part of it is a fact: how many are loaded, whether more exist, and
              what put them in this order. It says "your resume", not "your profile", because the
              resume is what the score was computed against and a student can go change it. */}
          <p className="pt-1 text-center text-xs text-muted">
            {jobs.length} role{jobs.length === 1 ? "" : "s"} loaded
            {hasMore ? ", more to load" : ""}
            {ranked ? " · sorted by fit to your resume" : " · newest first"}
          </p>

          {hasMore && (
            <Button type="button" onClick={() => void loadMore()} disabled={loadingMore} variant="secondary" className="mx-auto">
              {loadingMore ? "Loading..." : "Show more roles"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One posting.
 *
 * The row leads with the company's icon and the role, carries the match number beside the title
 * where the eye is already reading, and ends in exactly one control: apply, or the fact that you
 * already did. "View posting" moved onto the role itself — the title of a job is the most obvious
 * thing in the world to click, and giving the row two side-by-side buttons made the student choose
 * between them before they had read the role.
 */
function JobRow({ job, applied }: { job: MonitoredJob; applied: boolean }) {
  const place = [job.location, job.remote && !/remote/i.test(job.location ?? "") ? "Remote" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="flex flex-wrap items-center gap-4 p-4 transition-colors hover:border-faint sm:flex-nowrap sm:p-5">
      <CompanyLogo company={job.company_name} careerUrl={job.career_url} />

      {/* The icon and the role stay on one line at every width. Letting the text block take a full
          basis on mobile put the icon alone on its own row, which read as a bullet with nothing
          after it; it is the action that wraps below instead. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="min-w-0 text-lg font-medium leading-tight text-ink">
            <a
              href={job.posting_url}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-brand-ink"
            >
              {job.title}
            </a>
          </h2>
          <MatchBadge score={job.match_score} />
        </div>
        <p className="mt-1 truncate text-sm text-muted">
          {job.company_name}
          {place ? ` · ${place}` : ""}
        </p>
        <p className="mt-1.5 font-mono text-[11px] text-faint">
          Found {formatRelativeDate(job.first_seen_at)}
          {job.department ? ` · ${job.department}` : ""}
        </p>
      </div>

      {applied ? (
        /* A statement, not a control. It is green because green means "it happened" everywhere
           else in this product, and it is not a button because there is nothing here to press. */
        <span className="flex min-h-11 shrink-0 basis-full items-center justify-center gap-2 rounded-control bg-positive-soft px-5 text-sm font-medium text-positive sm:basis-auto">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m3.2 8.4 3.1 3.1 6.5-6.9" />
          </svg>
          Applied
        </span>
      ) : (
        <Link
          href={`/dashboard/applications?job=${job.id}`}
          className="inline-flex min-h-11 shrink-0 basis-full items-center justify-center rounded-control bg-brand px-6 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:basis-auto"
        >
          Apply now
        </Link>
      )}
    </Card>
  );
}

/**
 * How much of what this posting asks for is already on your resume.
 *
 * Absent, not zero, when there is no score. `match_score` is null for a posting that did not list
 * enough real requirements to judge, and for everyone who has no main resume yet; rendering "0%
 * match" in either case would be a confident claim about someone's resume that nothing supports.
 *
 * A NOTE ON THE COLOUR, because it bends a rule. DESIGN.md reserves blue-soft for "your turn" and
 * for the documents pillar, and says stats appear as bare mono numerals with no badge. This badge
 * is neither a status nor a bare numeral, and it is blue at Mehek's direction (2026-07-28) so the
 * number reads at a glance while scanning a column of rows. What the law still holds onto: the
 * badge never changes colour with the score. A 41% and a 94% look identical, because a colour that
 * shifted from red to green would be the product telling a student how to feel about a number it
 * has already said is not a prediction of anything.
 */
function MatchBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return null;
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <span
      className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 font-mono text-[11px] font-medium text-brand-ink"
      title={`${pct} out of 100 of the requirements in this posting also appear on your resume`}
    >
      {pct}% match
    </span>
  );
}
