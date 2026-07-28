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
  location: string | null;
  department: string | null;
  employment_type: string | null;
  apply_url: string;
  posting_url: string;
  remote: boolean;
  posted_at: string | null;
  first_seen_at: string;
  ats_name: string;
};

export type JobsPage = {
  jobs: BrowseJob[];
  total: number;
  /* null when the API could not be reached at all, which the page has to show
     as a fault rather than as "no jobs match" — those look identical to a
     reader and only one of them is our problem to fix. */
  ok: boolean;
};

export const PER_PAGE = 24;

export async function fetchJobs({
  q = "",
  page = 1,
}: { q?: string; page?: number } = {}): Promise<JobsPage> {
  const params = new URLSearchParams({
    limit: String(PER_PAGE),
    offset: String((Math.max(1, page) - 1) * PER_PAGE),
  });
  if (q.trim()) params.set("q", q.trim());

  /* Imported here rather than at the top of the file on purpose. The page's
     pure helpers below (agoLabel, pageWindow) are unit-tested by
     tests/browse-jobs.test.mjs under node --experimental-strip-types, which
     cannot resolve `./config`'s extensionless specifier; a top-level value
     import would make the whole module unloadable and the honest choice would
     then be to stop testing it. Nothing else in this module needs config. */
  const { API_URL } = await import("./config");

  try {
    const response = await fetch(`${API_URL}/jobs?${params}`, {
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
      jobs: Array.isArray(body.jobs) ? body.jobs : [],
      total: typeof body.total === "number" ? body.total : (body.jobs?.length ?? 0),
      ok: true,
    };
  } catch {
    return { jobs: [], total: 0, ok: false };
  }
}

/* "POSTED 3 DAYS AGO" beats a date nobody converts in their head, and the
   distinction between the two labels is load-bearing: posted_at is the
   employer's own timestamp, first_seen_at is only when Litos noticed. Calling
   the second one "posted" would be inventing a fact about someone else's
   posting, which is exactly the claim the competitor makes when it stamps
   every row "Just now". */
export function agoLabel(job: Pick<BrowseJob, "posted_at" | "first_seen_at">, now = Date.now()) {
  const stamp = job.posted_at ?? job.first_seen_at;
  const verb = job.posted_at ? "POSTED" : "FOUND";
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
