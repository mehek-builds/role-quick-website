/* The jobs board behind /browse-jobs.
 *
 * Reads the same public GET /jobs the extension uses, so the board is the live
 * contents of monitored_jobs: postings pulled straight off each company's own
 * Greenhouse, Lever or Ashby board by the daily job-monitor cron. Nothing here
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
  /* Every city this exact role at this exact company is open in. The API groups
     by (company, title), so one tile is one job even when the employer posted it
     once per office — MongoDB posts a single role in 23 places. */
  locations: string[];
  openings: number;
  apply_url: string;
  remote: boolean;
  posted_at: string | null;
  first_seen_at: string;
  ats_name: string;
};

/* The board's three fields. All optional, all AND together, any combination
   works on its own — a visitor who fills in only "city" and presses Search gets
   every role in that city. */
export type Filters = { title?: string; company?: string; location?: string; q?: string };

export type JobsPage = {
  jobs: BrowseJob[];
  total: number;
  /* null when the API could not be reached at all, which the page has to show
     as a fault rather than as "no jobs match" — those look identical to a
     reader and only one of them is our problem to fix. */
  ok: boolean;
};

export const PER_PAGE = 24;

export async function fetchJobs(
  filters: Filters = {},
  page = 1,
): Promise<JobsPage> {
  const params = new URLSearchParams({
    limit: String(PER_PAGE),
    offset: String((Math.max(1, page) - 1) * PER_PAGE),
  });
  for (const key of ["title", "company", "location", "q"] as const) {
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
    const response = await fetch(`${API_URL}/jobs/grouped?${params}`, {
      headers: { Accept: "application/json" },
      /* Postings move slowly (the source refreshes once a day) but the board is
         the first thing a visitor sees, so a short window keeps it cheap
         without ever showing yesterday's page after a refresh has landed. */
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { jobs: [], total: 0, ok: false };
    const body = await response.json();
    return {
      jobs: Array.isArray(body.jobs)
        ? body.jobs.map((j: BrowseJob) => ({ ...j, locations: j.locations ?? [] }))
        : [],
      total: typeof body.total === "number" ? body.total : (body.jobs?.length ?? 0),
      ok: true,
    };
  } catch {
    return { jobs: [], total: 0, ok: false };
  }
}

/* "POSTED 3 DAYS AGO" beats a date nobody converts in their head, and which
   word goes in front of it is load-bearing.

   posted_at does not mean the same thing on all three boards, which the first
   version of this page got wrong. Lever gives createdAt and Ashby gives
   publishedAt: both are genuinely when the job went up, and both go back years
   in our data. Greenhouse's board API exposes only updated_at, which moves
   every time anyone edits the posting — 620 of 5,920 Greenhouse rows carried
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

/* A board of 7,000 postings is ~300 pages, so the numbered strip that fitted
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
   tile without burying the job title, so it names a few and counts the rest —
   the count is the honest part, and it is why the number is shown rather than
   the list being silently cut. */
export function locationSummary(
  job: Pick<BrowseJob, "locations" | "remote">,
  show = 3,
): { shown: string[]; extra: number } {
  const all = locationList(job);
  return { shown: all.slice(0, show), extra: Math.max(0, all.length - show) };
}

/* Bare mono numerals, per DESIGN.md. Deliberately no thousands separator: in
   Azeret Mono every glyph gets the same advance, so a comma sits alone in a
   full-width cell and "7,106" reads on the page as "7 , 106", which looks like
   a typo in the one number the page is judged on. */
export function countLabel(n: number): string {
  return String(n);
}


/* Suggestions for the three fields. A miss is not an error: the fields take
   free text, so an empty datalist costs a visitor nothing but the convenience.
   Cached for an hour — the company list changes when a source is added, which
   is a manual act, and the city and title lists move only as slowly as the
   board does. */
export type Facets = { companies: string[]; locations: string[]; titles: string[] };

export async function fetchFacets(): Promise<Facets> {
  const { API_URL } = await import("./config");
  try {
    const response = await fetch(`${API_URL}/jobs/facets`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { companies: [], locations: [], titles: [] };
    const body = await response.json();
    return {
      companies: Array.isArray(body.companies) ? body.companies : [],
      locations: Array.isArray(body.locations) ? body.locations : [],
      titles: Array.isArray(body.titles) ? body.titles : [],
    };
  } catch {
    return { companies: [], locations: [], titles: [] };
  }
}
