/* The backend's verified logo evidence, looked up per company-board source.
 *
 * WHY THIS EXISTS. The backend gates every surfaced job on its own logo verifier
 * (volley-backend's jobSourceLogoVerification.ts): a source only reaches the board
 * once a first-party logo URL has been proven for it, and every /jobs row already
 * carries that URL as `company_logo_url`. Meanwhile this app's /api/company-logo
 * route re-derived logos from scratch and could only extract Ashby and Lever
 * hosted marks, so the Workable, Rippling, Recruitee, Breezy and Crelate sources
 * added in the 2026-08 expansion rendered monograms on rows whose verified logo
 * was sitting unused in the very JSON the board page fetches. Measured 2026-09-01:
 * 46.94% of live postings resolved through this route while 100% of sampled rows
 * carried verified backend evidence. This module closes that gap by asking the
 * backend first.
 *
 * WHY THE ROUTE ASKS THE BACKEND ITSELF rather than trusting a URL passed by the
 * client: the route's inputs stay exactly what they were (a company name and a
 * board URL), so no new client-controlled fetch surface is created. The evidence
 * URL only ever arrives in a response from our own API.
 *
 * THE HOST GATE IS STILL HERE, as defense in depth rather than as the primary
 * barrier. Evidence URLs come from our backend, but this process should still
 * refuse to fetch an address that is not recognisably one of the places verified
 * evidence lives: a fixed set of ATS asset hosts, our own API origin (durable
 * copies are served from /storage/logo/ there), or the employer domain the same
 * backend row asserts. Anything else falls back to the route's own resolution
 * chain instead of being fetched.
 */

import { API_URL } from "./config.ts";

/* Where first-party ATS evidence actually lives, measured across 1,100 live rows
   on 2026-09-01. Exact hostnames, matched exactly. Lever appears under three
   spellings of the same S3 bucket because that is what their boards emit. */
export const ATS_EVIDENCE_HOSTS = new Set([
  "app.ashbyhq.com",
  "lever-client-logos.s3.us-west-2.amazonaws.com",
  "lever-client-logos.s3-us-west-2.amazonaws.com",
  "lever-client-logos.s3.amazonaws.com",
  "workablehr.s3.amazonaws.com",
  "careers.recruiteecdn.com",
  "gallery-cdn.breezy.hr",
  "recruiting.cdn.greenhouse.io",
  "jobs.crelate.com",
]);

export type LogoEvidence = {
  /** The proven image URL, already checked against the host gate. */
  url: string | null;
  /** The employer domain the backend verified for this source, when it has one. */
  domain: string | null;
  /** The backend's verification method, forwarded into X-Logo-Source for observability. */
  method: string | null;
};

/** The subset of a /jobs row this module reads. Every field is optional on purpose:
    the backend owns the shape and a missing field must degrade, never throw. */
type JobsRow = {
  company_name?: unknown;
  career_url?: unknown;
  company_domain?: unknown;
  company_logo_url?: unknown;
  company_logo_verification_status?: unknown;
  company_logo_verification_method?: unknown;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** A bare registrable domain, the only shape company_domain is trusted in. */
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function hostMatchesDomain(host: string, domain: string | null): boolean {
  if (!domain || !BARE_DOMAIN.test(domain)) return false;
  const h = host.toLowerCase();
  const d = domain.toLowerCase().replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
}

/* Our own backend, where durable logo copies are served from /storage/logo/.
 *
 * BOTH production names are listed, not just the configured API_URL: the backend
 * writes durable-copy URLs as absolute api.trylitos.com addresses, while this
 * app is configured to call the same service as student-outreach-backend
 * .vercel.app until the DNS cutover completes (see CLAUDE.md). Live Rippling
 * rows carry the trylitos form today, so gating on the configured host alone
 * refused our own storage and turned every Rippling logo into a monogram, which
 * is exactly how it failed in local verification on 2026-09-01. */
const BACKEND_EVIDENCE_HOSTS = new Set(
  ["api.trylitos.com", "student-outreach-backend.vercel.app"].concat(
    (() => {
      try {
        return [new URL(API_URL).hostname];
      } catch {
        return [];
      }
    })(),
  ),
);

/**
 * The evidence URL, if it points somewhere this process is willing to fetch:
 * https only, and the host is a known ATS asset host, our own API, or the
 * employer domain the same backend row asserts. Null means "do not fetch this
 * URL"; the caller falls back to resolving the domain or to the legacy chain.
 */
export function evidenceImageUrl(raw: string | null, companyDomain: string | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (ATS_EVIDENCE_HOSTS.has(host)) return url.href;
  if (BACKEND_EVIDENCE_HOSTS.has(host)) return url.href;
  if (hostMatchesDomain(host, companyDomain)) return url.href;
  return null;
}

/**
 * Choose the row whose evidence answers for this (company, board) pair.
 *
 * The company name must match EXACTLY: the tile and the coverage check both send
 * company_name verbatim from the same API these rows come from, and an ilike
 * match on the backend side may have swept in unrelated companies whose names
 * merely contain the query. The board URL then picks between sources that share
 * a name (two "Shield AI" sources are on the live board today); when no row
 * carries this exact board, any verified row for the exact same company name is
 * still that company's evidence and is used.
 */
export function pickEvidence(
  rows: readonly JobsRow[],
  company: string,
  boardUrl: string | null,
): LogoEvidence | null {
  const name = company.trim();
  let sameCompany: JobsRow | null = null;
  let sameBoard: JobsRow | null = null;
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    if (str(row.company_name)?.trim() !== name) continue;
    if (str(row.company_logo_verification_status) !== "verified") continue;
    if (!str(row.company_logo_url) && !str(row.company_domain)) continue;
    sameCompany ??= row;
    if (boardUrl && str(row.career_url) === boardUrl) {
      sameBoard = row;
      break;
    }
  }
  const row = sameBoard ?? sameCompany;
  if (!row) return null;
  const domain = str(row.company_domain);
  return {
    url: evidenceImageUrl(str(row.company_logo_url), domain),
    domain: domain && BARE_DOMAIN.test(domain) ? domain : null,
    method: str(row.company_logo_verification_method),
  };
}

/**
 * Ask the backend for this source's verified evidence.
 *
 * One page of 100 rows: the company filter is a substring match on the backend,
 * so a short name can match more companies than one page holds, and in that case
 * the exact-match selection above may find nothing. That is a fallthrough to the
 * route's own resolution, never a wrong answer. Any network or shape problem
 * returns null for the same reason: this lookup can only ever ADD a logo the
 * legacy chain would have missed.
 */
export async function backendLogoEvidence(
  company: string,
  boardUrl: string | null,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<LogoEvidence | null> {
  const query = new URLSearchParams({ limit: "100", company: company.trim() });
  try {
    const res = await fetcher(`${API_URL}/jobs?${query}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const jobs = (body as { jobs?: unknown })?.jobs;
    if (!Array.isArray(jobs)) return null;
    return pickEvidence(jobs as JobsRow[], company, boardUrl);
  } catch {
    return null;
  }
}
