"use client";

import { Button } from "@/components/app/Button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, type JobsPage, type MonitoredJob } from "@/lib/api";
import { fetchBoard, useJobMatchScores, MATCH_WEIGHTING_NOTE, SCORE_BATCH, type JobMatch } from "@/features/applications";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import { activeJobFilters, buildAppliedIndex, countNewToday, emptyJobsBody, isJobApplied, type AppliedIndex } from "@/features/jobs";
import { isQaRender } from "@/lib/qa-mode";
import { Card, EmptyState, ErrorNote, ShimmerRows, formatRelativeDate } from "@/components/app/ui";
import { AutopilotLockNote, AutopilotToggle, useAutopilot } from "@/components/app/Autopilot";
import { EMPLOYMENT_TYPES, formatPay, jobTypeLabel } from "@/features/jobs";
import { trackZeroResultJobSearch } from "@/lib/job-search-demand-client";

/* The filters, as one string. It is the pagination key as well as the query: a page of results
   only belongs to the list on screen if it was fetched under the same filters, and comparing this
   is how a late "load more" response is stopped from appending rows that answer a question the
   student has already changed. */
function jobParams(
  query: string,
  location: string,
  remoteOnly: boolean,
  employmentType: string,
  offset: number,
) {
  const params = new URLSearchParams({ offset: String(offset) });
  if (query.trim()) params.set("title", query.trim());
  if (location.trim()) params.set("location", location.trim());
  if (remoteOnly) params.set("remote", "true");
  if (employmentType) params.set("employment_type", employmentType);
  return params;
}

/* Every filter belongs in this key, not just the ones that were here first. It is what stops a
   late response being appended to a list that now answers a different question, so a filter left
   out of it is a filter whose stale results can still land on screen. */
function filterKey(
  query: string,
  location: string,
  remoteOnly: boolean,
  employmentType: string,
): string {
  return `${query.trim()}|${location.trim()}|${remoteOnly}|${employmentType}`;
}

/* Appending a page can repeat a row. The server ranks a live pool on every request, so a posting
   that was rank 49 when page 1 was served can be rank 51 by the time page 2 is, and arrive twice.
   Two identical React keys is a crash; the same job listed twice is a lie about the board. */
function appendUnseen(current: MonitoredJob[], incoming: MonitoredJob[]): MonitoredJob[] {
  const seen = new Set(current.map((job) => job.id));
  return [...current, ...incoming.filter((job) => !seen.has(job.id))];
}

type BadgeMatch = {
  score: number;
  band?: string | null;
  matched?: number | null;
  total?: number | null;
};

function badgeMatchFor(job: MonitoredJob, detail: JobMatch | null | undefined): BadgeMatch | null | undefined {
  if (job.match_score !== undefined && job.match_score !== null) {
    return {
      score: job.match_score,
      band: detail?.band ?? null,
      matched: detail?.matched ?? null,
      total: detail?.total ?? null,
    };
  }
  return detail;
}

function hasServerMatchScores(jobs: MonitoredJob[] | null): boolean {
  return jobs?.some((job) => job.match_score !== undefined && job.match_score !== null) ?? false;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<MonitoredJob[] | null>(null);
  const [ranked, setRanked] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [employmentType, setEmploymentType] = useState("");
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
  /* Send-without-asking. The setting is server-side and shared with Account and the tracker; this
     page owns the switch because Jobs is the list the sending draws from. Held off until qaMode
     resolves, on the same rule as every other request here. */
  const autopilot = useAutopilot(qaMode === false);
  /* One definition of the number, shared with Home. See use-job-match-scores.ts. Held off until
     qaMode resolves, the same gate autopilot uses: a fixture render has no session and must stay
     self-contained rather than firing real scoring requests that can only fail. */
  /* The batch grows with the list. Scoring a fixed first 8 meant that after one "Load more" every
     row past the eighth resolved to undefined forever, which renders identically to a posting the
     backend declined to score, so the list the badge exists to make comparable was mostly
     unbadged. Growth is bounded by the page size the student actually asked for. */
  const matches = useJobMatchScores(jobs, qaMode === false, Math.max(SCORE_BATCH, jobs?.length ?? 0));
  /* The filters a response must have been fetched under to be allowed into the list. A plain
     counter was not enough: the filter effect and loadMore both read the same counter, so neither
     could tell the other's response apart from its own, and a load-more that finished after a
     keystroke appended page 3 of the OLD filter onto page 1 of the NEW one. */
  const activeFilter = useRef(filterKey("", "", false, ""));
  /* Demand is recorded only after the student commits the title with Enter or blur. The board may
     still filter live, but intermediate keystrokes and half-written titles are not sourcing data. */
  const zeroResultIntent = useRef<string | null>(null);
  const latestResult = useRef<{ key: string; total: number; sponsorOnly: boolean } | null>(null);

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
    const key = filterKey(query, location, remoteOnly, employmentType);
    activeFilter.current = key;
    const timer = window.setTimeout(() => {
      api<JobsPage>(`/jobs?${jobParams(query, location, remoteOnly, employmentType, 0).toString()}`)
        .then((result) => {
          if (cancelled || activeFilter.current !== key) return;
          setJobs(result.jobs);
          setRanked(result.ranked === true);
          setHasMore(result.has_more === true);
          setRankedPool(result.ranked_pool ?? null);
          setPoolExhausted(result.pool_exhausted === true);
          setSponsorOnly(result.sponsor_only === true);
          const completed = {
            key,
            total: result.total ?? result.jobs.length,
            sponsorOnly: result.sponsor_only === true,
          };
          latestResult.current = completed;
          if (zeroResultIntent.current === key) {
            zeroResultIntent.current = null;
            trackZeroResultJobSearch({
              targetRole: query,
              location,
              remoteOnly,
              sponsorOnly: completed.sponsorOnly,
              surface: "dashboard",
              totalResults: completed.total,
            });
          }
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
  }, [employmentType, location, qaMode, query, remoteOnly]);

  /* Which of these the student has already applied to. Fetched once, not per filter change: it is
     a fact about their account, not about the query. A failure here leaves it null, and a row that
     does not know simply offers to apply: the worst case is a second visit to a posting, which is
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
      const result = await api<JobsPage>(`/jobs?${jobParams(query, location, remoteOnly, employmentType, jobs.length).toString()}`);
      // Only merge if the student is still looking at the list this answers.
      if (activeFilter.current !== key) return;
      setJobs((current) => (current ? appendUnseen(current, result.jobs) : result.jobs));
      setHasMore(result.has_more === true);
      setRankedPool(result.ranked_pool ?? null);
      setPoolExhausted(result.pool_exhausted === true);
      /* Carried forward from every page, not just the first. The banner is the only thing telling
         the reader their list is filtered, and leaving it on page one's answer means a filter that
         turns on mid-session shows a filtered list under no explanation. */
      setSponsorOnly(result.sponsor_only === true);
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
  }, [employmentType, hasMore, jobs, loadingMore, location, query, remoteOnly]);

  const newToday = useMemo(() => (jobs ? countNewToday(jobs) : 0), [jobs]);
  const rankedByResume = useMemo(() => hasServerMatchScores(jobs), [jobs]);
  /* One reading of "what is narrowing this list", shared by the branch and by the sentence, so the
     two can never name different filters. See features/jobs/domain/job-filters.ts. */
  const filters = useMemo(
    () => ({ query, location, remoteOnly, employmentType }),
    [employmentType, location, query, remoteOnly],
  );
  const activeFilters = useMemo(() => activeJobFilters(filters), [filters]);
  /* All four, including the two that are not text boxes. A control offering to clear "filters"
     while leaving the job type or Remote only set would leave the student staring at the same
     empty board having done exactly what they were told. */
  const clearFilters = useCallback(() => {
    setQuery("");
    setLocation("");
    setRemoteOnly(false);
    setEmploymentType("");
  }, []);
  const commitTargetRole = () => {
    if (!query.trim()) return;
    const key = filterKey(query, location, remoteOnly, employmentType);
    zeroResultIntent.current = key;
    const completed = latestResult.current;
    if (!completed || completed.key !== key) return;
    zeroResultIntent.current = null;
    trackZeroResultJobSearch({
      targetRole: query,
      location,
      remoteOnly,
      sponsorOnly: completed.sponsorOnly,
      surface: "dashboard",
      totalResults: completed.total,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-label uppercase tracking-[0.08em] text-faint">Jobs</p>
          {/* The headline is the ordering. It only claims to be about fit when the list actually
              was ranked against a resume, which is why it is not a constant. */}
          <h1 className="mt-1.5 text-section font-normal leading-[1.15] tracking-[-0.02em] text-ink">
            {ranked ? "Top matches for you." : "Latest jobs."}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {newToday > 0 && (
            <span className="flex min-h-8 items-center gap-2 rounded-full bg-brand-soft px-3.5 font-mono text-[11px] font-medium text-brand-ink">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
              {newToday} new today
            </span>
          )}
          {/* The switch that decides whether anything in this list gets sent without the student
              being asked first. Same server field and same lock as Account; it sits here because
              Jobs is the list the sending draws from. */}
          <AutopilotToggle
            enabled={autopilot.enabled}
            eligibility={autopilot.eligibility}
            saving={autopilot.saving}
            onToggle={(next) => void autopilot.toggle(next)}
          />
        </div>
      </div>

      {autopilot.error && <ErrorNote message={autopilot.error} />}
      <AutopilotLockNote enabled={autopilot.enabled} eligibility={autopilot.eligibility} />

      {!ranked && (
        <p className="text-sm text-muted">
          Add the jobs you want in <Link href="/dashboard/profile" className="font-medium text-brand-ink underline underline-offset-2">Job search</Link> to rank this list for you.
        </p>
      )}

      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_0.7fr_auto_auto]">
        <input aria-label="Search job titles" value={query} onChange={(event) => setQuery(event.target.value)} onBlur={commitTargetRole} onKeyDown={(event) => { if (event.key === "Enter") commitTargetRole(); }} placeholder="Search job title" className="rounded-inner border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:border-brand focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30" />
        <input aria-label="Filter by location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="rounded-inner border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:border-brand focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30" />
        {/* Same closed vocabulary as /browse-jobs, and the same reason it is a select: the title
            box above already accepts free text, and "intern" typed into it matches "Internal
            Audit" while missing every co-op. This control is the only way to ask the question
            exactly. Both surfaces read GET /jobs, so they cannot disagree about what an
            Internship is. */}
        <select
          aria-label="Filter by job type"
          value={employmentType}
          onChange={(event) => setEmploymentType(event.target.value)}
          className="rounded-inner border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none transition-colors hover:border-brand focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          <option value="">Any job type</option>
          {EMPLOYMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-control border border-border px-4 py-2.5 text-sm text-ink transition-colors hover:border-brand focus-within:ring-2 focus-within:ring-brand/30">
          {/* Named on the input itself, the same way the three controls beside it are. The wrapping
              label reads as an association to a person looking at the markup, but it is the only
              thing carrying the name, and a screen reader announced this control as "on": the
              checkbox's value attribute, which is what the accessible name falls back to when
              nothing else supplies one. A student who cannot see the words next to it was being
              offered a switch with no subject. */}
          <input aria-label="Remote only" type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} className="accent-brand" />
          Remote only
        </label>
      </Card>

      {/* Said once, above the list, and only when the list is actually filtered. A board that is
          quietly missing a thousand postings is the thing this feature must never be: someone who
          does not know their list is filtered cannot tell "no jobs match" from "we are hiding the
          ones that will not sponsor you". */}
      {sponsorOnly && (
        <p className="rounded-inner border border-border bg-surface-alt px-4 py-3 text-xs leading-5 text-muted">
          Showing only jobs where we could confirm the company sponsors work visas, from its H-1B
          filings with the US government and what each job post says.{" "}
          <Link href="/dashboard/settings#visa-sponsorship" className="text-brand-ink underline underline-offset-2">
            Why am I seeing this?
          </Link>
        </p>
      )}

      {error && <ErrorNote message={error} />}

      {jobs === null ? (
        <ShimmerRows rows={5} />
      ) : jobs.length === 0 ? (
        <EmptyState title="No matching roles" body={emptyJobsBody(filters)}>
          {/* No breakpoint gate on this, and no collapsing toolbar to tuck it into. ISSUE-028 was
              a recovery control that only existed on large screens; the only way out of an empty
              board has to be reachable at the width the student is actually holding. */}
          {activeFilters.length > 0 && (
            <Button type="button" onClick={clearFilters} variant="secondary">
              Clear filters
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          {/* grid-cols-1 is load-bearing, not decoration. A bare `grid` leaves the single column
              an `auto` track, and an auto track is floored by the min-content width of its widest
              item: the rows carry `truncate` lines, `truncate` is `white-space: nowrap`, and a
              nowrap line's min-content IS its max-content. So one long "Company · City, State"
              pushed the track past the list, every row with it (they share the column), and the
              Apply button off the right edge of the page. Tailwind's grid-cols-1 is
              `repeat(1, minmax(0, 1fr))`, and that 0 minimum is exactly the fix: the track can no
              longer be argued wider than the list, so the truncation inside the row does its job
              instead of the page scrolling sideways. */}
          <ul className="grid grid-cols-1 gap-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobRow job={job} applied={isJobApplied(job, applied)} match={badgeMatchFor(job, matches[job.id])} />
              </li>
            ))}
          </ul>

          {/* Name the loaded pool and the score family that actually drives its ordering. */}
          <p className="pt-1 text-center text-xs text-muted">
            {jobs.length} role{jobs.length === 1 ? "" : "s"} loaded
            {hasMore ? ", more to load" : ""}
            {ranked
              ? rankedByResume
                ? rankedPool !== null && poolExhausted
                  ? ` · best resume matches from ${rankedPool} recently matched roles`
                  : " · sorted by resume match"
                : rankedPool !== null && poolExhausted
                  ? ` · best preference matches from ${rankedPool} recently matched roles`
                  : " · sorted by your preferences"
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
 * already did. "View posting" moved onto the role itself, since the title of a job is the most
 * obvious thing in the world to click, and giving the row two side-by-side buttons made the student
 * choose between them before they had read the role.
 */
function JobRow({ job, applied, match }: { job: MonitoredJob; applied: boolean; match: BadgeMatch | null | undefined }) {
  const place = [job.location, job.remote && !/remote/i.test(job.location ?? "") ? "Remote" : null]
    .filter(Boolean)
    .join(" · ");
  const pay = formatPay(job);
  const type = jobTypeLabel(job.employment_type);

  return (
    <Card className="flex flex-wrap items-center gap-4 p-4 transition-colors hover:border-faint sm:flex-nowrap sm:p-5">
      <CompanyLogo company={job.company_name} careerUrl={job.career_url} companyDomain={job.company_domain} />

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
          <MatchBadge match={match} />
          <SponsorBadge evidence={job.sponsorship_evidence} />
        </div>
        <p className="mt-1 truncate text-sm text-muted">
          {job.company_name}
          {place ? ` · ${place}` : ""}
        </p>
        {/* Same rule as the public board, same formatter (lib/pay.ts), so the same job cannot read
            one way here and another way on /browse-jobs. Absent pay and absent job type render
            nothing at all rather than "Not listed": most postings publish neither, and a row that
            filled that silence in would be stating something no employer stated. */}
        {(pay || type) && (
          <p className="mt-1 truncate text-sm text-ink">
            {pay && <span className="font-medium">{pay}</span>}
            {pay && type && <span className="text-faint"> · </span>}
            {type && <span className="text-muted">{type}</span>}
          </p>
        )}
        {/* The preference-fit line ("You asked for ...") used to sit here. It repeated the same
            saved search on every row, so it was removed. The rule it existed to keep still holds:
            one metric's score may never carry another metric's reasons, which is why the badge
            above says resume-to-JD coverage and nothing else on this row speaks for it. */}
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
          Apply
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
          : "This company has H-1B filings on record with the US government: an approved petition, or an application it filed and the Labor Department certified. That is not a promise to sponsor you."
      }
    >
      {evidence === "posting_offers" ? "Sponsorship offered" : "Sponsors visas"}
    </span>
  );
}

/**
 * How much of what this posting asks for is already on your resume.
 *
 * ISSUE-014, second answer. The first made Home and Jobs agree on PREFERENCE FIT, which genuinely
 * fixed the contradiction the audit found (fit 40 on Home, 0% match on Jobs, same Databricks
 * posting, same session). Mehek's call, 2026-08-03, is that the number beside a job is the resume
 * against the posting, on every surface: preference fit answers "did we pick this for you", which
 * is a question about our ranking rather than about the student.
 *
 * WHAT THE FIRST ANSWER GOT RIGHT AND IS KEPT HERE:
 *
 *  - ONE METRIC PER CARD'S VOCABULARY. The badge and the sentence under it were resume coverage and
 *    preference fit both wearing the word "match". The sentence was reworded to "You asked for ..."
 *    so the two facts stopped competing for the same word, and has since been removed outright
 *    (it repeated the saved search on every row). The badge is now the only thing on a card that
 *    speaks to fit, and it speaks only for resume coverage. If a preference line ever comes back,
 *    it comes back with its own vocabulary, never the badge's.
 *  - ABSENT, NEVER ZERO. A posting the backend declines to score, and a request that failed, both
 *    arrive as null and render nothing. A zero is a claim that the resume matched no requirement.
 *  - THE NUMBER NEVER CHANGES COLOUR. A 27 and a 74 look identical. A badge that shifted red to
 *    green would be the product telling a student how to feel about a number it has already said is
 *    not a prediction of anything. DESIGN.md's blue-soft exception stands, at Mehek's direction
 *    (2026-07-28), so the number reads at a glance while scanning a column of rows.
 *
 * WHAT IS ADDED, because the objection to a bare percentage in a list was correct: the visible
 * number comes from the server-ranked score, and the tooltip may add the denominator when the
 * detail call has it.
 */
function MatchBadge({ match }: { match: BadgeMatch | null | undefined }) {
  // undefined = still scoring, null = nothing honest to say. Neither prints.
  if (!match) return null;
  const pct = Math.max(0, Math.min(100, Math.round(match.score)));
  const detail =
    match.matched !== undefined && match.matched !== null && match.total !== undefined && match.total !== null
      ? ` Your resume covers ${match.matched} of the ${match.total} requirements Litos counted in this posting. ${MATCH_WEIGHTING_NOTE}`
      : " The list is sorted by the same resume match score shown here.";
  // The weighting clause is APPENDED, not folded in: the sentence before it is pinned literally by
  // tests/match-metric-coherence.regression-1.test.mjs and stays exactly as it was. See
  // MATCH_WEIGHTING_NOTE for why a count beside a weighted score needed saying out loud.
  return (
    <span
      className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 font-mono text-[11px] font-medium text-brand-ink"
      title={`${pct}% match.${detail}`}
    >
      {pct}% match
    </span>
  );
}
