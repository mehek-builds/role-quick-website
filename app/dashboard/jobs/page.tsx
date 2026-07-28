"use client";

import { Button } from "@/components/app/Button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, type JobsPage, type MonitoredJob } from "@/lib/api";
import { fetchBoard } from "@/lib/jd-match";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import { buildAppliedIndex, countNewToday, isJobApplied, type AppliedIndex } from "@/lib/job-rows";
import { isQaRender } from "@/lib/qa-mode";
import { Card, EmptyState, ErrorNote, ShimmerRows, formatRelativeDate } from "@/components/app/ui";

/* The filters, as one string. It is the pagination key as well as the query: a page of results
   only belongs to the list on screen if it was fetched under the same filters, and comparing this
   is how a late "load more" response is stopped from appending rows that answer a question the
   student has already changed. */
function jobParams(query: string, location: string, remoteOnly: boolean, offset: number) {
  const params = new URLSearchParams({ offset: String(offset) });
  if (query.trim()) params.set("q", query.trim());
  if (location.trim()) params.set("location", location.trim());
  if (remoteOnly) params.set("remote", "true");
  return params;
}

function filterKey(query: string, location: string, remoteOnly: boolean): string {
  return `${query.trim()}|${location.trim()}|${remoteOnly}`;
}

/* Appending a page can repeat a row. The server ranks a live pool on every request, so a posting
   that was rank 49 when page 1 was served can be rank 51 by the time page 2 is, and arrive twice.
   Two identical React keys is a crash; the same job listed twice is a lie about the board. */
function appendUnseen(current: MonitoredJob[], incoming: MonitoredJob[]): MonitoredJob[] {
  const seen = new Set(current.map((job) => job.id));
  return [...current, ...incoming.filter((job) => !seen.has(job.id))];
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
  /* How many postings the server actually ranked, and whether more existed that it never scored.
     Both are needed to describe the list truthfully: see the footer. */
  const [rankedPool, setRankedPool] = useState<number | null>(null);
  const [poolExhausted, setPoolExhausted] = useState(false);
  /* Whether the board being shown is the sponsor-only one. Read off the RESPONSE rather than off
     the account, because the server is what decides it: an account that declared a need for
     sponsorship at setup gets the filter whether or not this page asks for it. */
  const [sponsorOnly, setSponsorOnly] = useState(false);
  /* Null until the board answers. An empty index would mean "you have applied to nothing", which is
     a different claim from "we do not know yet". */
  const [applied, setApplied] = useState<AppliedIndex | null>(null);
  /* Null while we work out whether this is a QA render, so neither branch fires a request first. */
  const [qaMode, setQaMode] = useState<boolean | null>(null);
  /* The filters a response must have been fetched under to be allowed into the list. A plain
     counter was not enough: the filter effect and loadMore both read the same counter, so neither
     could tell the other's response apart from its own, and a load-more that finished after a
     keystroke appended page 3 of the OLD filter onto page 1 of the NEW one. */
  const activeFilter = useRef(filterKey("", "", false));

  /* Same gate as the rest of the product, in one tested place (lib/qa-mode.ts). */
  useEffect(() => {
    queueMicrotask(() => setQaMode(isQaRender()));
  }, []);

  useEffect(() => {
    if (qaMode !== true) return;
    let cancelled = false;
    void import("./qa-data").then(({ qaJobsPage, QA_APPLIED }) => {
      if (cancelled) return;
      const page = qaJobsPage();
      setJobs(page.jobs);
      setRanked(page.ranked === true);
      setHasMore(page.has_more === true);
      setRankedPool(page.ranked_pool ?? null);
      setPoolExhausted(page.pool_exhausted ?? false);
      setApplied(buildAppliedIndex(QA_APPLIED));
    });
    return () => {
      cancelled = true;
    };
  }, [qaMode]);

  useEffect(() => {
    if (qaMode !== false) return;
    let cancelled = false;
    const key = filterKey(query, location, remoteOnly);
    activeFilter.current = key;
    const timer = window.setTimeout(() => {
      api<JobsPage>(`/jobs?${jobParams(query, location, remoteOnly, 0).toString()}`)
        .then((result) => {
          if (cancelled || activeFilter.current !== key) return;
          setJobs(result.jobs);
          setRanked(result.ranked === true);
          setHasMore(result.has_more === true);
          setRankedPool(result.ranked_pool ?? null);
          setPoolExhausted(result.pool_exhausted === true);
          setSponsorOnly(result.sponsor_only === true);
          /* A new filter starts a new list, so any in-flight "load more" spinner belongs to a list
             that no longer exists. Without this it could stay lit forever. */
          setLoadingMore(false);
          setError(null);
        })
        .catch((reason) => {
          if (cancelled || activeFilter.current !== key) return;
          setError(reason instanceof Error ? reason.message : "Could not load the jobs we watch for you.");
        });
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
        setApplied(buildAppliedIndex(cards));
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [qaMode]);

  const loadMore = useCallback(async () => {
    if (!jobs || loadingMore || !hasMore) return;
    const key = activeFilter.current;
    setLoadingMore(true);
    try {
      const result = await api<JobsPage>(`/jobs?${jobParams(query, location, remoteOnly, jobs.length).toString()}`);
      // Only merge if the student is still looking at the list this answers.
      if (activeFilter.current !== key) return;
      setJobs((current) => (current ? appendUnseen(current, result.jobs) : result.jobs));
      setHasMore(result.has_more === true);
      setRankedPool(result.ranked_pool ?? null);
      setPoolExhausted(result.pool_exhausted === true);
      setError(null);
    } catch (reason) {
      if (activeFilter.current !== key) return;
      setError(reason instanceof Error ? reason.message : "Could not load any more jobs.");
    } finally {
      /* Unconditional. The spinner is this component's state, not the response's: guarding it on
         the filter still matching meant that changing the search mid-request left the button stuck
         reading "Loading..." and disabled for the rest of the session. The filter check belongs on
         the DATA, above, and it is there. */
      setLoadingMore(false);
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

      {/* Said once, above the list, and only when the list is actually filtered. A board that is
          quietly missing a thousand postings is the thing this feature must never be: someone who
          does not know their list is filtered cannot tell "no jobs match" from "we are hiding the
          ones that will not sponsor you". */}
      {sponsorOnly && (
        <p className="rounded-inner border border-border bg-surface-alt px-4 py-3 text-xs leading-5 text-muted">
          Showing only jobs where we could confirm the company sponsors work visas, from H-1B
          filings and what each job post says.{" "}
          <Link href="/dashboard/settings#visa-sponsorship" className="text-brand-ink underline underline-offset-2">
            Why am I seeing this?
          </Link>
        </p>
      )}

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
                <JobRow job={job} applied={isJobApplied(job, applied)} />
              </li>
            ))}
          </ul>

          {/* One line, and every part of it is a fact: how many are loaded, whether more exist, and
              what put them in this order. It says "your resume", not "your profile", because the
              resume is what the score was computed against and a student can go change it.
              It also names the pool. A bare "sorted by fit" reads as a claim about the whole board,
              and the sort only ever saw the newest RANKING_POOL postings — the backend has always
              reported that number and nothing was showing it. */}
          <p className="pt-1 text-center text-xs text-muted">
            {jobs.length} role{jobs.length === 1 ? "" : "s"} loaded
            {hasMore ? ", more to load" : ""}
            {ranked
              ? rankedPool !== null && poolExhausted
                ? ` · best fit of the ${rankedPool} newest roles`
                : " · sorted by fit to your resume"
              : " · newest first"}
          </p>

          {hasMore && (
            <Button type="button" onClick={() => void loadMore()} disabled={loadingMore} variant="secondary" className="mx-auto">
              {loadingMore ? "Loading..." : "Show more roles"}
            </Button>
          )}

          {/* The end of the ranking is not the end of the board, and saying nothing here let the
              list imply it was. Only shown once there is nothing more to page through. */}
          {!hasMore && poolExhausted && (
            <p className="text-center text-xs text-faint">
              More roles exist than Litos ranks at once. Search or filter to rank a different set.
            </p>
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
          <SponsorBadge evidence={job.sponsorship_evidence} />
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
 * Why this posting is on the board of someone who needs a visa sponsored.
 *
 * Absent when nothing confirms it, and that is the common case: most postings say nothing about
 * sponsorship. Absence here means "we do not know", NEVER "they will not sponsor" - inventing an
 * employer's policy from silence is the one claim this whole feature is built to avoid making.
 *
 * Grey, not green. DESIGN.md reserves the positive colour for "it happened", and this is evidence
 * rather than an outcome: a company that filed petitions before has not agreed to sponsor anyone
 * reading this page. The title attribute carries which of the two kinds of evidence it was, because
 * the difference matters to the person deciding whether to spend an evening on the application.
 */
function SponsorBadge({ evidence }: { evidence: MonitoredJob["sponsorship_evidence"] }) {
  if (!evidence) return null;
  return (
    <span
      className="shrink-0 rounded-full bg-surface-alt px-2.5 py-0.5 font-mono text-[11px] font-medium text-muted"
      title={
        evidence === "posting_offers"
          ? "This job post says visa sponsorship is available"
          : "This company has approved H-1B petitions on file with USCIS. That is not a promise to sponsor you."
      }
    >
      {evidence === "posting_offers" ? "Sponsorship offered" : "Sponsors visas"}
    </span>
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
