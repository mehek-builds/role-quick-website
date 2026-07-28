import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { STORE_URL } from "@/lib/config";
import {
  agoLabel,
  countLabel,
  fetchFacets,
  fetchJobs,
  locationSummary,
  pageCount,
  pageWindow,
  PER_PAGE,
  type BrowseJob,
  type Filters,
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
  const { shown, extra } = locationSummary(job);
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
      <p className="mt-auto pt-4 text-small leading-snug text-faint">
        {shown.join(" · ")}
        {extra > 0 && (
          <span className="text-faint/80"> +{extra} more</span>
        )}
      </p>
      <p className="mt-1.5 font-mono text-label font-medium uppercase tracking-[0.08em] text-muted">
        {job.openings > 1 && (
          <span>{job.openings} openings{ago ? " · " : ""}</span>
        )}
        {ago}
      </p>
      {/* Only ever shown when there IS evidence. Silence stays silent: a tile that said "no
          sponsorship" because a posting did not mention it would be stating an employer's policy
          that nobody at that employer has stated. */}
      {job.sponsorship_evidence && (
        <p className="mt-1.5 font-mono text-label font-medium uppercase tracking-[0.08em] text-faint">
          {job.sponsorship_evidence === "posting_offers" ? "Sponsorship offered" : "Sponsors visas"}
        </p>
      )}
    </a>
  );
}

/* One search field: a label, an input, and a datalist of real values from the
 * board. The datalist is what makes this both a dropdown and a free-text box at
 * once — the browser offers the suggestions on focus and filters them as you
 * type, but nothing is rejected, so "Berlin" works whether or not it is in the
 * list. No JS, no combobox library, and it stays usable with the keyboard.
 *
 * The suggestions are capped server-side at 120 per field: a datalist of every
 * one of ~5,000 titles is slower to render than it is useful to read. */
function Field({
  name,
  label,
  placeholder,
  value,
  options,
}: {
  name: string;
  label: string;
  placeholder: string;
  value: string;
  options: string[];
}) {
  const listId = `${name}-options`;
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-label font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </span>
      <input
        type="search"
        name={name}
        defaultValue={value}
        placeholder={placeholder}
        list={options.length ? listId : undefined}
        autoComplete="off"
        className="min-h-[44px] w-full rounded-inner border border-border bg-white px-4 text-base text-ink placeholder:text-faint focus:border-brand focus:outline-none"
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </label>
  );
}

/* "Job title “software engineer” and City “New York”" — the fields are named back
 * so the reader can see which one narrowed the result, which matters most when
 * a search returns nothing and they need to know which box to change. */
function describeFilters(filters: Filters): string {
  const named: [string, string | undefined][] = [
    ["Job title", filters.title],
    ["Company", filters.company],
    ["City", filters.location],
    ["", filters.q],
  ];
  const parts = named
    .filter(([, v]) => v)
    .map(([label, v]) => (label ? `${label} “${v}”` : `“${v}”`));
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function hrefFor(filters: Filters, page: number) {
  const params = new URLSearchParams();
  /* Every filter has to survive pagination, or page 2 of a search silently
     becomes page 2 of the whole board. */
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `/browse-jobs?${s}` : "/browse-jobs";
}

export default async function BrowseJobs({
  searchParams,
}: {
  searchParams: Promise<{
    title?: string;
    company?: string;
    location?: string;
    q?: string;
    page?: string;
    sponsor_only?: string;
  }>;
}) {
  const params = await searchParams;
  const clean = (v?: string) => (v ?? "").slice(0, 80).trim();
  /* `q` is still read, unlabelled, so links minted while the board had one
     general search box keep working instead of silently returning everything. */
  /* Only ever the literal "true". Echoing whatever arrived would put an attacker-chosen string in
     the checkbox's value and in every pagination link on the page. */
  const sponsorOnly = params.sponsor_only === "true";
  const filters: Filters = {
    title: clean(params.title),
    company: clean(params.company),
    location: clean(params.location),
    q: clean(params.q),
    sponsor_only: sponsorOnly ? "true" : "",
  };
  const searching = Boolean(filters.title || filters.company || filters.location || filters.q);
  const requested = Math.max(1, Number(params.page) || 1);
  const [{ jobs, total, ok }, facets] = await Promise.all([
    fetchJobs(filters, requested),
    fetchFacets(sponsorOnly),
  ]);
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
              open roles, read straight off each company&rsquo;s own job board and
              checked again every day. A role open in several cities is one card
              here, not one per city. Open any of them and Litos writes the
              resume for it and fills in the form.
            </>
          ) : (
            <>
              The board is not loading right now. This is our problem, not a
              search that came up empty, and it is worth trying again in a minute.
            </>
          )}
        </p>

        {/* Three fields, not one box (Mehek, 2026-07-28). Each is a native
            combobox: an <input> with a <datalist>, so a visitor can pick a
            suggestion OR type anything they like, and the same markup does
            both with no JavaScript. They AND together and each works alone, so
            filling in only the city and pressing Search is a valid search.
            A plain GET form, so every result stays a shareable URL. */}
        <form
          action="/browse-jobs"
          method="get"
          className="mt-8 grid gap-2 sm:grid-cols-3 lg:max-w-[900px] lg:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <Field
            name="title"
            label="Job title"
            placeholder="e.g. software engineer"
            value={filters.title ?? ""}
            options={facets.titles}
          />
          <Field
            name="company"
            label="Company"
            placeholder="e.g. Stripe"
            value={filters.company ?? ""}
            options={facets.companies}
          />
          <Field
            name="location"
            label="City"
            placeholder="e.g. New York"
            value={filters.location ?? ""}
            options={facets.locations}
          />
          {filters.q && <input type="hidden" name="q" value={filters.q} />}
          {/* A fourth control, and the only one that is not a search term: it changes which jobs
              are eligible rather than which match. It sits on its own row under the three fields
              so it is not read as a fourth thing to type in.
              A checkbox in a GET form submits nothing when unticked, which is exactly the wanted
              behaviour: the parameter simply disappears from the URL. */}
          <label className="flex min-h-[44px] items-center gap-2.5 text-small text-muted sm:col-span-3 lg:col-span-4">
            <input
              type="checkbox"
              name="sponsor_only"
              value="true"
              defaultChecked={sponsorOnly}
              className="size-4 accent-brand"
            />
            Only jobs where the company sponsors a work visa
          </label>
          <button
            type="submit"
            className="min-h-[44px] rounded-control bg-brand px-6 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:col-span-3 lg:col-span-1 lg:self-end"
          >
            Search
          </button>
        </form>

        {sponsorOnly && ok && (
          <p className="mt-4 max-w-[62ch] text-small leading-6 text-muted">
            Showing only companies with approved H-1B petitions on file with USCIS, plus roles whose
            job post says sponsorship is available. A post that rules sponsorship out is hidden even
            when the company sponsors for other roles. A filing record is not a promise to sponsor
            you.
          </p>
        )}

        {searching && ok && (
          <p className="mt-4 font-mono text-machine text-muted">
            {countLabel(total)} {total === 1 ? "role" : "roles"} matching{" "}
            {describeFilters(filters)}.{" "}
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
                  href={hrefFor(filters, n)}
                  className="flex h-9 min-w-9 items-center justify-center rounded-control px-3 text-muted transition-colors hover:bg-surface-alt hover:text-ink"
                >
                  {n}
                </a>
              ),
            )}
            {current < pages && (
              <a
                href={hrefFor(filters, current + 1)}
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
