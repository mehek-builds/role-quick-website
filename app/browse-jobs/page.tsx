import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { STORE_URL } from "@/lib/config";
import {
  agoLabel,
  countLabel,
  fetchJobs,
  locationLabel,
  pageCount,
  pageWindow,
  PER_PAGE,
  type BrowseJob,
} from "@/lib/browse-jobs";
import { logoPath, monogram } from "@/lib/company-logos";

export const metadata: Metadata = {
  title: "Browse jobs",
  description:
    "Open roles pulled straight from company job boards and refreshed every day. Search by title, company or city, then let Litos write the resume and fill in the form.",
};

/* The board.
 *
 * Modelled on the shape of jobbie.bot/browse-jobs, the clearest version of this
 * page in the category: a title, a count, one search box, cards, pagination.
 * Two deliberate departures.
 *
 * ONE, the cards are small tiles in a grid rather than full-width bars running
 * straight down the page (Mehek, 2026-07-28). Full-width bars spend one job per
 * ~80px of scroll and leave two thirds of every row empty.
 *
 * TWO, the count is the real row count, and the timestamps say what they mean.
 * Theirs advertises 644,546 jobs "updated hourly" over a list where every card
 * claims it was posted "Just now". Ours prints what the query counted, and each
 * card names its own timestamp honestly: POSTED where the board gave a real
 * publish date, UPDATED on Greenhouse (whose API exposes only updated_at, which
 * moves on every edit), FOUND where there is no employer date at all and the
 * only true statement is when we saw it. See agoLabel in lib/browse-jobs.ts.
 *
 * Server-rendered, plain GET form, no client state: a search is a real URL that
 * can be shared, linked and crawled. */

/* The company's own mark, top-left of the tile (Mehek, 2026-07-28).
 *
 * Served from public/company/, never from a logo API — see lib/company-logos.ts
 * for why. Sized 28px and left un-cropped: these are 49 different companies'
 * marks at 49 different aspect ratios, and `object-contain` inside a fixed box
 * is what stops a wide wordmark from being centre-cropped into nonsense.
 *
 * No border, no tinted chip. DESIGN.md bans icons-in-coloured-circles, and the
 * marks already carry every colour on the page; framing each one would turn a
 * quiet grid into 24 competing badges. */
function CompanyMark({ company, eager }: { company: string; eager?: boolean }) {
  const src = logoPath(company);
  if (!src) {
    return (
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-inner border border-border font-mono text-small text-faint"
      >
        {monogram(company)}
      </span>
    );
  }
  /* eslint-disable-next-line @next/next/no-img-element */
  return (
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className="h-7 w-7 shrink-0 object-contain"
    />
  );
}

function Tile({ job, eager }: { job: BrowseJob; eager?: boolean }) {
  const ago = agoLabel(job);
  return (
    <a
      href={job.apply_url}
      target="_blank"
      rel="noreferrer"
      className="group flex min-w-0 min-h-[132px] flex-col rounded-card border border-border bg-white p-4 shadow-rest transition-shadow duration-200 hover:shadow-raised motion-reduce:transition-none"
    >
      <div className="flex min-w-0 items-start gap-3">
        <CompanyMark company={job.company_name} eager={eager} />
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-snug text-ink">{job.title}</p>
          <p className="mt-1 text-small text-muted">{job.company_name}</p>
        </div>
      </div>
      <p className="mt-auto truncate pt-4 text-small text-faint">
        {locationLabel(job)}
      </p>
      {ago && (
        <p className="mt-1.5 font-mono text-label font-medium uppercase tracking-[0.08em] text-muted">
          {ago}
        </p>
      )}
    </a>
  );
}

function hrefFor(q: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `/browse-jobs?${s}` : "/browse-jobs";
}

export default async function BrowseJobs({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").slice(0, 80);
  const requested = Math.max(1, Number(params.page) || 1);
  const { jobs, total, ok } = await fetchJobs({ q, page: requested });
  const pages = pageCount(total);
  const current = Math.min(requested, pages);

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-[1060px] flex-1 px-6 pb-28 pt-32">
        <p className="font-mono text-label font-medium uppercase tracking-[0.08em] text-faint">
          Browse jobs
        </p>
        <h1 className="mt-3 text-section font-[450] leading-[1.15] tracking-[-0.02em] text-ink">
          Find your next job.
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-7 text-muted">
          {ok ? (
            <>
              <span className="font-mono text-ink">{countLabel(total)}</span>{" "}
              open jobs, read straight off each company&rsquo;s own job board and
              checked again every day. Open one and Litos writes the resume for it
              and fills in the form.
            </>
          ) : (
            <>
              The board is not loading right now. This is our problem, not a
              search that came up empty, and it is worth trying again in a minute.
            </>
          )}
        </p>

        <form
          action="/browse-jobs"
          method="get"
          className="mt-8 flex max-w-[560px] flex-col gap-2 sm:flex-row"
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            aria-label="Search jobs"
            placeholder="Search by title, company or city"
            className="min-h-[44px] flex-1 rounded-inner border border-border bg-white px-4 text-base text-ink placeholder:text-faint focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            className="min-h-[44px] rounded-control bg-brand px-6 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </form>

        {q && ok && (
          <p className="mt-4 font-mono text-machine text-muted">
            {countLabel(total)} {total === 1 ? "match for" : "matches for"}{" "}
            &ldquo;{q}&rdquo;.{" "}
            <a href="/browse-jobs" className="underline underline-offset-2 hover:text-ink">
              Clear
            </a>
          </p>
        )}

        {jobs.length > 0 ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job, i) => (
              /* The first two rows are above the fold on a laptop; lazy-loading
                 those makes the marks pop in after the text, which reads as the
                 page half-failing. */
              <Tile key={job.id} job={job} eager={i < 6} />
            ))}
          </div>
        ) : (
          ok && (
            <div className="mt-8 rounded-card border border-border bg-surface-alt p-8">
              <p className="text-[15px] font-medium text-ink">
                Nothing on the board matches that.
              </p>
              <p className="mt-2 max-w-[52ch] text-base leading-7 text-muted">
                Litos is not limited to the companies on this board. It works on
                any posting you open on Greenhouse, Lever, Ashby, Workday or
                LinkedIn, whether or not it is listed here.
              </p>
              <a
                href="/browse-jobs"
                className="mt-4 inline-flex min-h-[44px] items-center text-small text-brand-ink underline underline-offset-2"
              >
                See every job
              </a>
            </div>
          )
        )}

        {pages > 1 && (
          <nav
            aria-label="Pagination"
            className="mt-10 flex flex-wrap items-center gap-1 font-mono text-machine"
          >
            {pageWindow(current, pages).map((n, i) =>
              n === "gap" ? (
                <span key={`gap-${i}`} className="px-2 text-faint">
                  &hellip;
                </span>
              ) : n === current ? (
                <span
                  key={n}
                  aria-current="page"
                  className="flex h-9 min-w-9 items-center justify-center rounded-control bg-brand-soft px-3 text-brand-ink"
                >
                  {n}
                </span>
              ) : (
                <a
                  key={n}
                  href={hrefFor(q, n)}
                  className="flex h-9 min-w-9 items-center justify-center rounded-control px-3 text-muted transition-colors hover:bg-surface-alt hover:text-ink"
                >
                  {n}
                </a>
              ),
            )}
            {current < pages && (
              <a
                href={hrefFor(q, current + 1)}
                className="ml-2 flex h-9 items-center rounded-control px-3 text-muted transition-colors hover:bg-surface-alt hover:text-ink"
              >
                Next →
              </a>
            )}
            <span className="ml-3 text-faint">
              page {current} of {countLabel(pages)} · {PER_PAGE} per page
            </span>
          </nav>
        )}

        <div className="mt-16 rounded-card border border-border bg-brand-soft p-8">
          <h2 className="text-[15px] font-medium text-ink">
            Litos does the applying.
          </h2>
          <p className="mt-2 max-w-[52ch] text-base leading-7 text-muted">
            Open any of these postings with the extension installed. You get a
            resume rewritten for that job and the form filled in. Nothing is sent
            until you read it and press send yourself.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href={STORE_URL}
              className="inline-flex min-h-[44px] items-center rounded-control bg-brand px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Add to Chrome
            </a>
            <a
              href="/try"
              className="inline-flex min-h-[44px] items-center rounded-control px-4 text-sm font-medium text-ink transition-colors hover:bg-white/70"
            >
              Try it free
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
