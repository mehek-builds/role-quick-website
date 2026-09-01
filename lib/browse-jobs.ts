/* The jobs board behind /browse-jobs.
 *
 * Reads the public GET /jobs/grouped endpoint, so the board is the live
 * contents of monitored_jobs: postings pulled straight off each company's own
 * Greenhouse, Lever, Ashby, or Workable board by the daily job-monitor cron. Nothing here
 * is typed in by hand and nothing is invented.
 *
 * This page shipped once against a 47-row file checked into the repo, which is
 * why the copy has to be careful now: a board fed by a crawl must not describe
 * itself as hand-checked, and a board this size must not be described as
 * curated. It says where the postings come from and how often they refresh,
 * and that is all it claims.
 */

export type BrowseJob = {
  id: string;
  company_name: string;
  title: string;
  /* Every city this exact role at this exact company and ATS family is open in. The API groups
     by (company, title, ATS), so one tile is one job even when the employer posted it
     once per office: MongoDB posts a single role in 23 places. */
  locations: string[];
  openings: number;
  apply_url: string;
  /* Why this role is safe to show somebody who needs a visa sponsored, or null when nothing
     confirms it. Null is "we do not know", never "they will not sponsor": most postings say
     nothing, and a card that read "no sponsorship" off the back of silence would be inventing an
     employer's policy. A group whose copies disagree also gets null, because a single tile cannot
     honestly speak for a role that is open in a country the company sponsors in and one it is
     not. */
  sponsorship_evidence?: "posting_offers" | "employer_h1b_filings" | null;
  /** ISO-3166 jurisdictions shared by the sponsorship evidence behind this grouped role. */
  sponsorship_country_codes?: string[];
  remote: boolean;
  posted_at: string | null;
  first_seen_at: string;
  ats_name: string;
  /* What the employer published about pay, and what kind of job it is. Null on most rows, and
     rendered as nothing at all, see lib/pay.ts.
     On this endpoint these are GROUP aggregates: one tile is one role that may be open in 23
     cities, and the API only fills them in when every city that published a figure agreed on the
     currency and the period. A role paying USD in Austin and CAD in Toronto has no single range,
     so it gets none rather than an invented one. */
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_interval?: string | null;
  employment_type?: string | null;
  /* The employer's board on their ATS, the URL we poll. Carried onto the tile
     so the logo service can ask that board who the company is, instead of
     guessing from the name. */
  career_url?: string | null;
};

/* The board's three fields. All optional, all AND together, any combination
   works on its own: a visitor who fills in only "city" and presses Search gets
   every role in that city. */
export type Filters = {
  title?: string;
  company?: string;
  location?: string;
  q?: string;
  /* "only show me employers who sponsor a work visa". A string rather than a boolean because it is
     read from and written back into a query string by a plain GET form, and "true"/undefined is
     what a checkbox in such a form produces. */
  sponsor_only?: string;
  /* One of the five words the API's employment_type enum accepts, or absent for no filter.
     A string for the same reason sponsor_only is: it round-trips through a plain GET form. */
  employment_type?: string;
};

export type JobsPage = {
  jobs: BrowseJob[];
  /** Distinct company-title-ATS groups, which is also the number of board tiles. */
  total: number;
  /** Raw postings behind those groups. Null only while an older backend is still deploying. */
  postingsTotal: number | null;
  /* null when the API could not be reached at all, which the page has to show
     as a fault rather than as "no jobs match": those look identical to a
     reader and only one of them is our problem to fix. */
  ok: boolean;
};

export const PER_PAGE = 24;

/**
 * HOW STALE EACH HALF OF THE BOARD IS ALLOWED TO BE, in seconds.
 *
 * Two numbers, not one, because the two fetches are nothing alike in cost.
 *
 * The suggestions are ONE query behind two cache keys (with and without the
 * sponsor filter). The listings key on page x title x company x city x q x
 * sponsor, and the three text filters are free text off the query string, so
 * their key space is effectively unbounded: every distinct search is its own
 * entry and its own origin miss. Giving both the same window would have bought
 * the listings a 5x increase in grouped aggregates against a Hobby-tier Neon
 * for freshness nobody asked for: the postings themselves only move on the
 * 06:00 UTC poll, and the lag that was actually reported was the dropdown.
 *
 * A shared number would not even have bought consistency. Each cache entry is
 * populated on its own first-request clock, so a common TTL does not
 * synchronise them; the dropdown and the list can disagree by up to a window
 * either way regardless.
 *
 * WHAT ABSORBS THE LOAD, stated correctly because the first version of this
 * comment got it wrong: /browse-jobs reads searchParams and sets no route-level
 * `revalidate`, so it is dynamically rendered per request and there is NO
 * edge-cached HTML. The only thing between a visitor and the backend is Next's
 * Data Cache, which is per-deployment and not shared across regions; it is
 * cold after every deploy.
 *
 * And SWR means "fresh on the NEXT load", not "fresh in 60 seconds": on a
 * dynamic route Next serves the stale body and refreshes in the background, so
 * the first visitor after expiry still sees the old value.
 */
export const SUGGESTIONS_REVALIDATE = 60;
export const LISTINGS_REVALIDATE = 300;

export function parseJobsPageBody(body: unknown): JobsPage {
  const failure: JobsPage = { jobs: [], total: 0, postingsTotal: null, ok: false };
  if (typeof body !== "object" || body === null) return failure;
  const payload = body as { jobs?: unknown; total?: unknown; postings_total?: unknown };
  if (
    !Array.isArray(payload.jobs)
    || !payload.jobs.every((job) => typeof job === "object" && job !== null)
    || !Number.isInteger(payload.total)
    || (payload.total as number) < 0
    || (payload.total as number) < payload.jobs.length
    || (
      payload.postings_total !== undefined
      && (
        !Number.isInteger(payload.postings_total)
        || (payload.postings_total as number) < (payload.total as number)
      )
    )
  ) return failure;
  const jobs = Array.isArray(payload.jobs)
    ? payload.jobs.map((job: BrowseJob) => ({ ...job, locations: job.locations ?? [] }))
    : [];

  return {
    jobs,
    total: payload.total as number,
    postingsTotal: typeof payload.postings_total === "number" ? payload.postings_total : null,
    ok: true,
  };
}

/* HOW LONG THE BOARD WAITS BEFORE ITS ONE RETRY, in milliseconds.
 *
 * The retry exists for exactly one measured failure mode. For the first minutes
 * after a litos-api deploy, a cold /jobs/grouped query (empty ranking cache)
 * intermittently exceeds the 10s timeout, and the SAME url succeeds seconds
 * later at 0.7-3s warm (measured 2026-09-01): the aborted first query still ran
 * to completion on the backend and warmed the cache for the second. So a
 * visitor landing right after any deploy was shown the failure page for a
 * backend that was seconds from healthy.
 *
 * One retry, not a loop: a backend that fails twice in a row eleven seconds
 * apart is genuinely down, and the failure copy exists to say so. And only a
 * request that died in transit (timeout, network fault) or a 5xx is worth
 * asking again; a 4xx is the API answering that the request itself is wrong,
 * and repeating it cannot change its mind. */
export const RETRY_PAUSE_MS = 750;

/* Exported because fetchJobs itself cannot be unit-tested: it imports ./config,
   whose extensionless specifier the strip-types test runner cannot resolve.
   `send` is a thunk rather than a Response so each attempt builds its OWN
   AbortSignal.timeout: a signal created once would carry the first attempt's
   spent clock, or its abort, into the second.
   Null means both attempts died in transit, which callers must map to their
   own failure value. */
export async function fetchWithOneRetry(
  send: () => Promise<Response>,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<Response | null> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await send();
      if (response.ok || response.status < 500 || attempt > 0) return response;
      /* This 5xx is about to be replaced by the retry's answer, but undici
         holds its connection until the body is read or collected. Cancel it. */
      await response.body?.cancel().catch(() => {});
    } catch {
      if (attempt > 0) return null;
    }
    await pause(RETRY_PAUSE_MS);
  }
}

export async function fetchJobs(
  filters: Filters = {},
  page = 1,
): Promise<JobsPage> {
  const params = new URLSearchParams({
    limit: String(PER_PAGE),
    offset: String((Math.max(1, page) - 1) * PER_PAGE),
  });
  for (const key of ["title", "company", "location", "q", "sponsor_only", "employment_type"] as const) {
    const value = filters[key]?.trim();
    if (value) params.set(key, value);
  }

  /* Imported here rather than at the top of the file on purpose. The page's
     pure helpers below (agoLabel, pageWindow) are unit-tested by
     tests/browse-jobs.test.mjs under node --experimental-strip-types, which
     cannot resolve `./config`'s extensionless specifier; a top-level value
     import would make the whole module unloadable and the honest choice would
     then be to stop testing it. Nothing else in this module needs config. */
  const { API_URL } = await import("./config");

  try {
    const response = await fetchWithOneRetry(() =>
      fetch(`${API_URL}/jobs/grouped?${params}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: LISTINGS_REVALIDATE },
        signal: AbortSignal.timeout(10_000),
      }),
    );
    if (!response?.ok) return { jobs: [], total: 0, postingsTotal: null, ok: false };
    return parseJobsPageBody(await response.json());
  } catch {
    return { jobs: [], total: 0, postingsTotal: null, ok: false };
  }
}

/* "POSTED 3 DAYS AGO" beats a date nobody converts in their head, and which
   word goes in front of it is load-bearing.

   posted_at does not mean the same thing across board families, which the first
   version of this page got wrong. Lever gives createdAt, Ashby gives publishedAt,
   and Workable gives published_on: all are genuinely when the job went up.
   Greenhouse's board API exposes only updated_at, which moves
   every time anyone edits the posting: 620 of 5,920 Greenhouse rows carried
   today's date on the day they were first pulled. Printing POSTED TODAY across
   a whole page off the back of that is precisely the claim this page exists
   not to make, so Greenhouse says UPDATED, which is what the number is.

   And when there is no employer timestamp at all, the honest sentence is about
   us: FOUND, meaning when Litos first saw it. */
export function agoLabel(
  job: Pick<BrowseJob, "posted_at" | "first_seen_at" | "ats_name">,
  now = Date.now(),
) {
  const stamp = job.posted_at ?? job.first_seen_at;
  const verb = !job.posted_at ? "FOUND" : job.ats_name === "greenhouse" ? "UPDATED" : "POSTED";
  const at = Date.parse(stamp);
  if (Number.isNaN(at)) return null;
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return `${verb} TODAY`;
  if (days === 1) return `${verb} YESTERDAY`;
  if (days < 30) return `${verb} ${days} DAYS AGO`;
  const months = Math.floor(days / 30);
  return `${verb} ${months} MONTH${months === 1 ? "" : "S"} AGO`;
}

/* A board of 7,000 grouped roles is ~300 pages, so the numbered strip that fitted
   two pages cannot be printed in full: it would be a wall of links nobody uses
   and a slow render. First, last, and a window around wherever you are. */
export function pageWindow(current: number, pages: number, span = 2): (number | "gap")[] {
  if (pages <= 1) return [1];
  const wanted = new Set<number>([1, pages]);
  for (let n = current - span; n <= current + span; n += 1) {
    if (n >= 1 && n <= pages) wanted.add(n);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const n of sorted) {
    if (previous && n - previous > 1) out.push("gap");
    out.push(n);
    previous = n;
  }
  return out;
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PER_PAGE));
}

/* Employers leave the template text in. Stripe publishes three live postings
   whose location is the literal word "LOCATION", and rendering that verbatim
   makes our page look broken for a mistake made on theirs. Anything that is
   plainly a placeholder falls back to what we do know. */
const PLACEHOLDER = /^(location|city|remote\?|n\/?a|tbd|various|multiple)$/i;

/* One role's cities, flattened and tidied.
 *
 * Two things make this less trivial than it looks. A single posting's location
 * is often already a list ("Auckland; Melbourne", "Boston; New York City;
 * Pennsylvania"), so grouping alone gives an array of lists; and the same city
 * then appears under several postings. Split, trim, drop placeholders, dedupe
 * case-insensitively, and keep first-seen order so the newest posting's cities
 * lead. */
export function locationList(job: Pick<BrowseJob, "locations" | "remote">): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of job.locations ?? []) {
    for (const part of String(raw).split(/[;|]/)) {
      const city = part.trim().replace(/\s+/g, " ");
      if (!city || PLACEHOLDER.test(city)) continue;
      const key = city.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(city);
    }
  }
  if (out.length) return out;
  return [job.remote ? "Remote" : "Location not given"];
}

/* What the tile actually prints. A role open in 23 cities cannot list 23 on a
   tile without burying the job title, so it names a few and counts the rest:
   the count is the honest part, and it is why the number is shown rather than
   the list being silently cut. */
export function locationSummary(
  job: Pick<BrowseJob, "locations" | "remote">,
  show = 3,
): { shown: string[]; extra: number } {
  const all = locationList(job);
  return { shown: all.slice(0, show), extra: Math.max(0, all.length - show) };
}

/* Inventory is read as a quantity, not an identifier. Thousands separators make the distinction
   between 8,221 grouped roles and 10,246 openings scannable in the board headline. */
export function countLabel(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}


/* Suggestions for the three fields. A miss is not an error: the fields take
   free text, so an empty datalist costs a visitor nothing but the convenience.
   Cached for one minute because the board inventory changes daily and dropdown freshness is cheap.
   The company list changes when a source is added, which
   is a manual act, and the city and title lists move only as slowly as the
   board does. */
/* `titles` is gone from the API deliberately: it returned the board's most
   common RAW posting titles, and the field now offers a curated vocabulary of
   role families from lib/job-titles.ts instead. */
export type Facets = { companies: string[]; locations: string[] };

export async function fetchFacets(sponsorOnly = false): Promise<Facets> {
  const { API_URL } = await import("./config");
  try {
    /* The suggestions have to describe the board being looked at. Offering a company we cannot
       confirm sponsors, to somebody browsing with the filter on, sends them to a search that
       returns nothing and reads as a broken board. */
    /* `v` is a cache key, not a parameter the API reads.
       Next's Data Cache survives a deployment, so when /jobs/facets changed
       shape: 202 alphabetical companies and a `titles` field became 50 ranked
       companies and no titles, the board went on serving the OLD payload for
       an hour after both sides had shipped: the title dropdown was correct
       while the company one still opened on "AQR" with 203 entries. Stale would
       have been tolerable; the wrong shape is not, and another deploy does not
       clear it. Bump this whenever the response shape changes. */
    const query = sponsorOnly ? "?v=2&sponsor_only=true" : "?v=2";
    const response = await fetch(`${API_URL}/jobs/facets${query}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: SUGGESTIONS_REVALIDATE },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { companies: [], locations: [] };
    const body = await response.json();
    return {
      companies: Array.isArray(body.companies) ? body.companies : [],
      locations: Array.isArray(body.locations) ? body.locations : [],
    };
  } catch {
    return { companies: [], locations: [] };
  }
}
