import type { MonitoredJob } from "./api";

/* The pure logic behind a row on the jobs list.
 *
 * These lived in `app/dashboard/jobs/page.tsx` and `components/app/CompanyLogo.tsx` and were
 * therefore untestable: this repo's runner is `node --experimental-strip-types`, which strips
 * types but cannot parse JSX, so nothing in a .tsx file can be imported by a test. They carry the
 * two decisions on that page a student would actually notice getting wrong — whether a row says
 * "Applied", and whose logo is on it — so "untestable" was the wrong place for them. */

/** Job boards, not employers. A careers URL on one of these tells us nothing about the company. */
const ATS_HOSTS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "myworkdaysite.com",
  "workday.com",
  "workable.com",
  "jazzhr.com",
  "applytojob.com",
  "paylocity.com",
  "bamboohr.com",
  "smartrecruiters.com",
  "icims.com",
  "taleo.net",
  "jobvite.com",
  "recruitee.com",
  "breezy.hr",
  "teamtailor.com",
  "successfactors.com",
  "avature.net",
  "oraclecloud.com",
  "rippling.com",
  "ripplingats.com",
];

/**
 * The host a careers URL is served from, lowercased and minus `www.`, or null when the URL does not
 * identify a company.
 *
 * NOT the registrable domain, despite how it reads. Reducing `careers.acme.co.uk` to `acme.co.uk`
 * needs a public-suffix list, which is deliberately not shipped here, so subdomain variants of one
 * employer are distinct results and will fetch distinct icons. That is a cosmetic cost; the thing
 * this function exists to prevent is worse and it does prevent it.
 *
 * What it prevents: a posting's apply and posting URLs both point at the job board, so anything
 * derived from them paints one board's icon on every row in the list. Only the careers URL can
 * carry the employer's own domain, and operators sometimes register the board URL there too, which
 * is why ATS hosts are rejected rather than trusted. A wrong logo is worse than no logo: it tells
 * the student this row is a different company than it is.
 */
export function companyDomain(careerUrl: string | null | undefined): string | null {
  if (!careerUrl) return null;
  let host: string;
  try {
    host = new URL(careerUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  /* The trailing dot is the fully-qualified form of the same host ("greenhouse.io." is
     "greenhouse.io"), and it matches neither arm of the check below, so without stripping it the
     board's own domain sails through and every row from that source draws the board's logo. */
  host = host.replace(/\.$/, "");
  if (!host.includes(".")) return null;
  if (ATS_HOSTS.some((ats) => host === ats || host.endsWith(`.${ats}`))) return null;
  return host;
}

/* Legal suffixes, stripped only as a trailing token. */
const LEGAL_SUFFIX = /\s+(inc|llc|ltd|corp|corporation|co)$/;

function flatten(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEGAL_SUFFIX, "")
    .trim();
}

/**
 * The identity two records of the same application share, so a row the student already applied to
 * can say so.
 *
 * KNOWN AND ACCEPTED IMPRECISION. The board stores only `{company, role}` per application — there
 * is no job id and no location on that side — so two postings that share a company and a title are
 * indistinguishable here, and applying to one marks both. Large employers repost one title across
 * cities, so this is not exotic. Fixing it properly means carrying the monitored job's id into the
 * generated resume's `job_context`, which is a schema change and is tracked separately.
 *
 * Given that, the flattening stays as narrow as it can be. It folds "Airbnb, Inc." into "Airbnb"
 * and collapses runs of whitespace, and nothing else:
 *
 *  - a legal suffix is stripped only at the END, never mid-string. The earlier `\b(...)\b` form
 *    treated hyphens as word boundaries, so "Co-op Software Engineer" became "-op software
 *    engineer" and "Corp Dev Analyst" became "dev analyst", which then collided with a genuinely
 *    different "Dev Analyst" posting at the same company.
 *  - flattening never returns an empty string for a non-empty input, because a company literally
 *    named "Co" would otherwise share one key with every other such employer.
 */
export function applicationKey(company: string, role: string): string {
  const safeFlatten = (value: string) => {
    const flat = flatten(value);
    return flat.length > 0 ? flat : value.toLowerCase().trim();
  };
  return `${safeFlatten(company)}::${safeFlatten(role)}`;
}

/** Board stages that mean an application was actually sent.
 *
 *  A WHITELIST, deliberately. The previous rule was `stage !== "saved"`, which counted `closed` as
 *  applied — and `closed` is where a student puts a posting that expired, that they lost interest
 *  in, or that was a duplicate. Those they never applied to, and the row would have shown the green
 *  "Applied" statement with no control on it at all, so they could not have applied even if they
 *  wanted to. A missed application is the one failure on this page that cannot be undone. */
const APPLIED_STAGES = new Set(["applied", "interview", "offer"]);

export function isAppliedStage(stage: string): boolean {
  return APPLIED_STAGES.has(stage);
}

/**
 * How many of these postings were first seen since local midnight.
 *
 * Counts THE ROWS IT IS GIVEN, which is the page currently loaded, not the whole board. On a
 * ranked list those rows are the best-fitting ones rather than the newest, so this is "new today
 * among the roles in view" — which is what the badge says, because a number the reader cannot
 * reconcile with what is on screen is worse than a smaller true one.
 */
export function countNewToday(jobs: Pick<MonitoredJob, "first_seen_at">[]): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return jobs.filter((job) => {
    const seen = new Date(job.first_seen_at).getTime();
    // NaN fails this comparison, so a row we cannot date is never counted as new.
    return seen >= midnight.getTime();
  }).length;
}
