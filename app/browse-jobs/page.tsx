import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { ComboField } from "@/components/browse/ComboField";
import { ZeroResultJobSearchMonitor } from "@/components/browse/ZeroResultJobSearchMonitor";
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
import { logoSrc } from "@/lib/company-logos";
import { isOther, JOB_TITLES, withOther } from "@/lib/job-titles";
import { EMPLOYMENT_TYPES, formatPay, jobTypeLabel } from "@/features/jobs";

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
 * Served from public/company/, never from a logo API, see lib/company-logos.ts
 * for why. Sized 28px and left un-cropped: these are 49 different companies'
 * marks at 49 different aspect ratios, and `object-contain` inside a fixed box
 * is what stops a wide wordmark from being centre-cropped into nonsense.
 *
 * No border, no tinted chip. DESIGN.md bans icons-in-coloured-circles, and the
 * marks already carry every colour on the page; framing each one would turn a
 * quiet grid into 24 competing badges. */
/* The company's own mark, top-left of the tile (Mehek, 2026-07-28).
 *
 * Sized 28px and left un-cropped: these are hundreds of companies' marks at
 * hundreds of aspect ratios, and `object-contain` inside a fixed box is what
 * stops a wide wordmark being centre-cropped into nonsense.
 *
 * No border, no tinted chip. DESIGN.md bans icons-in-coloured-circles, and the
 * marks already carry every colour on the page; framing each one would turn a
 * quiet grid into 24 competing badges.
 *
 * There is no fallback branch here any more. logoSrc always returns a URL, and
 * /api/company-logo answers with a monogram image when it cannot find a mark, so
 * an unknown company degrades inside the request rather than in the browser. */
function CompanyMark({
  company,
  boardUrl,
  eager,
}: {
  company: string;
  boardUrl?: string | null;
  eager?: boolean;
}) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return (
    <img
      src={logoSrc(company, boardUrl)}
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
  const pay = formatPay(job);
  const type = jobTypeLabel(job.employment_type);
  return (
    <a
      href={job.apply_url}
      target="_blank"
      rel="noreferrer"
      className="group flex min-w-0 min-h-[132px] flex-col rounded-card border border-border bg-white p-4 shadow-rest transition-shadow duration-200 hover:shadow-raised motion-reduce:transition-none"
    >
      <div className="flex min-w-0 items-start gap-3">
        <CompanyMark company={job.company_name} boardUrl={job.career_url} eager={eager} />
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
      {/* Pay and job type, on the line under the location, the position Handshake gives them, and
          the one a reader's eye is already travelling down.
          Either can be absent and usually is: two thirds of the board publishes no pay, and
          Greenhouse states no job type at all. An absent one renders NOTHING rather than "Not
          listed", so a figure on a tile always means the employer published one. When neither is
          present the line does not render, and the tile looks exactly as it did before. */}
      {(pay || type) && (
        <p className="mt-1.5 text-small leading-snug text-ink">
          {pay && <span className="font-medium">{pay}</span>}
          {pay && type && <span className="text-faint"> · </span>}
          {type && <span className="text-muted">{type}</span>}
        </p>
      )}
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
        /* The qualification lives ON the badge, the way it already does on the
           dashboard, rather than in a paragraph under the search fields. The
           explanation was removed from the page (Mehek, 2026-07-29: people know
           what "sponsors visas" means, they do not need it spelled out) but a
           claim about an employer's immigration practice still cannot travel
           without it: "has filings on record" is evidence, never an offer. */
        <p
          title={
            job.sponsorship_evidence === "posting_offers"
              ? "This job post says visa sponsorship is available"
              : "This company has H-1B filings on record with the US government: an approved petition, or an application it filed and the Labor Department certified. That is not a promise to sponsor you."
          }
          className="mt-1.5 font-mono text-label font-medium uppercase tracking-[0.08em] text-faint"
        >
          {job.sponsorship_evidence === "posting_offers" ? "Sponsorship offered" : "Company has sponsored visas"}
        </p>
      )}
    </a>
  );
}

/* "Job title “software engineer” and City “New York”": the fields are named back
 * so the reader can see which one narrowed the result, which matters most when
 * a search returns nothing and they need to know which box to change. */
function describeFilters(filters: Filters): string {
  const named: [string, string | undefined][] = [
    ["Job title", filters.title],
    ["Company", filters.company],
    ["City", filters.location],
    ["Job type", filters.employment_type],
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
    employment_type?: string;
  }>;
}) {
  const params = await searchParams;
  /* "Other" is the last entry in all three dropdowns, and it has to mean NO
     FILTER. Searching for the literal word would return the few postings with
     "other" in the title, which is the opposite of what someone picking it
     wants: they are being told the box is theirs to type in. */
  const clean = (v?: string) => {
    const value = (v ?? "").slice(0, 80).trim();
    return isOther(value) ? "" : value;
  };
  /* `q` is still read, unlabelled, so links minted while the board had one
     general search box keep working instead of silently returning everything. */
  /* Only ever the literal "true". Echoing whatever arrived would put an attacker-chosen string in
     the checkbox's value and in every pagination link on the page. */
  const sponsorOnly = params.sponsor_only === "true";
  /* Allow-listed against the API's own enum rather than echoed. Same reasoning as sponsor_only:
     an unrecognised value would otherwise be reflected into the select and into every pagination
     link, and the backend would 400 the whole board rather than ignore one filter. */
  const employmentType: string =
    (EMPLOYMENT_TYPES as readonly string[]).includes(params.employment_type ?? "")
      ? (params.employment_type as string)
      : "";
  const filters: Filters = {
    title: clean(params.title),
    company: clean(params.company),
    location: clean(params.location),
    q: clean(params.q),
    sponsor_only: sponsorOnly ? "true" : "",
    employment_type: employmentType,
  };
  const searching = Boolean(
    filters.title || filters.company || filters.location || filters.q || employmentType,
  );
  const requested = Math.max(1, Number(params.page) || 1);
  const [{ jobs, total, postingsTotal, ok }, facets] = await Promise.all([
    fetchJobs(filters, requested),
    fetchFacets(sponsorOnly),
  ]);
  const pages = pageCount(total);
  const current = Math.min(requested, pages);
  /* Only the explicitly labeled title field is unmet role demand. Legacy `q` links can contain
     companies, skills, or arbitrary keywords and must not be recast as target roles. */
  const monitoredTargetRole = filters.title;

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-[1060px] flex-1 px-6 pb-28 pt-32">
        {searching && ok && total === 0 && monitoredTargetRole && (
          <ZeroResultJobSearchMonitor
            targetRole={monitoredTargetRole}
            location={filters.location}
            sponsorOnly={sponsorOnly}
          />
        )}
        <p className="font-mono text-label font-medium uppercase tracking-[0.08em] text-faint">
          Browse jobs
        </p>
        <h1 className="mt-3 text-section font-[450] leading-[1.15] tracking-[-0.02em] text-ink">
          Find your next job.
        </h1>
        <p className="mt-4 max-w-[62ch] text-base leading-7 text-muted">
          {ok ? (
            <>
              {/* Just the number (Mehek, 2026-07-29). The sentence used to
                  explain where the postings come from, that a multi-city role is
                  one card, and what Litos then does with it. All three are already
                  on the page: the tiles carry "N openings", and the band at the
                  bottom makes the offer. */}
              <span className="font-mono text-ink">{countLabel(total)}</span>{" "}
              {total === 1 ? "role" : "roles"}
              {postingsTotal === null ? "." : (
                <>
                  {" "}across{" "}
                  <span className="font-mono text-ink">{countLabel(postingsTotal)}</span>{" "}
                  {postingsTotal === 1 ? "opening" : "openings"}.
                </>
              )}
            </>
          ) : (
            <>
              The board is not loading right now. This is our problem, not a
              search that came up empty, and it is worth trying again in a minute.
            </>
          )}
        </p>

        {/* Three fields, not one box (Mehek, 2026-07-28). Each is a combobox the
            page owns rather than one the browser draws, see ComboField for why
            a datalist could not be made to sit under its field or wear our
            type. A visitor can pick a suggestion or type anything; the fields
            AND together and each works alone, so filling in only the city and
            pressing Search is a valid search. Still a plain GET form, so every
            result stays a shareable URL. */}
        <form
          action="/browse-jobs"
          method="get"
          className="mt-8 grid gap-2 sm:grid-cols-3 lg:max-w-[1100px] lg:grid-cols-[1fr_1fr_1fr_minmax(0,0.8fr)_auto]"
        >
          <ComboField
            name="title"
            label="Job title"
            placeholder="e.g. Software Engineer"
            value={filters.title ?? ""}
            options={withOther(JOB_TITLES)}
          />
          <ComboField
            name="company"
            label="Company"
            placeholder="e.g. Stripe"
            value={filters.company ?? ""}
            options={withOther(facets.companies)}
          />
          <ComboField
            name="location"
            label="City"
            placeholder="e.g. New York"
            value={filters.location ?? ""}
            options={withOther(facets.locations)}
          />
          {/* A SELECT, not a ComboField, and that is the point of the control. The other three
              fields are free text with suggestions because a visitor may legitimately search a
              title or city we have never seen. Employment type is a CLOSED vocabulary of five
              words the backend will accept, so offering a text box would invite "intern",
              "Interns" and "INTERNSHIP" - three spellings that all return nothing while looking
              like a search that simply found no jobs.

              Internship is why this control exists. It was renderable on every tile and queryable
              on none, so the one category a student most needs to isolate could only be reached by
              typing "intern" into the Job title box, which also matched "Internal Audit" and
              missed every co-op. */}
          <div className="relative flex min-w-0 flex-col gap-1.5">
            <label
              htmlFor="employment_type"
              className="font-mono text-label font-medium uppercase tracking-[0.08em] text-faint"
            >
              Job type
            </label>
            <select
              id="employment_type"
              name="employment_type"
              defaultValue={employmentType}
              className="min-h-[44px] w-full rounded-inner border border-border bg-white px-4 text-base text-ink focus:border-brand focus:outline-none"
            >
              {/* Empty value, so an unset filter submits nothing and simply leaves the URL. Worded
                  "Any" rather than "Other": the three comboboxes use "Other" to mean "no filter,
                  type your own", and there is nothing here to type. */}
              <option value="">Any</option>
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          {filters.q && <input type="hidden" name="q" value={filters.q} />}
          {/* A fourth control, and the only one that is not a search term: it changes which jobs
              are eligible rather than which match. It sits on its own row under the three fields
              so it is not read as a fourth thing to type in.
              A checkbox in a GET form submits nothing when unticked, which is exactly the wanted
              behaviour: the parameter simply disappears from the URL. */}
          <label className="flex min-h-[44px] items-center gap-2.5 text-small text-muted sm:col-span-3 lg:col-span-5">
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


        {searching && ok && (
          <p className="mt-4 font-mono text-machine text-muted">
            {countLabel(total)} {total === 1 ? "role" : "roles"}
            {postingsTotal === null
              ? " matching "
              : ` across ${countLabel(postingsTotal)} ${postingsTotal === 1 ? "opening" : "openings"} matching `}
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
            {/* Was the store link. The install ask lives once now, in the
                #packet demo on the landing page, where the extension is
                visibly doing the work. This page is a job list, so the account
                is the right door: it is also where the jobs below get watched
                for you whether or not the browser is open. */}
            <a
              href="/login"
              className="inline-flex min-h-[44px] items-center rounded-control bg-brand px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Get started
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
      <SiteFooter />
    </div>
  );
}
