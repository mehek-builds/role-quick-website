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
 * chain instead of being fetched. The gate is enforced twice by the route: on the
 * URL before the fetch, and again on the FINAL URL after redirects, so a hop off
 * an admitted host cannot smuggle bytes past it.
 *
 * IDENTITY BEFORE COVERAGE. A row is only this request's evidence when its board
 * URL matches the one the tile asked about. Company name alone is NOT identity:
 * the live board carries two distinct companies both named exactly "Crisp"
 * (crisp.com and crispheights.com, review finding 2026-09-01), so a name-keyed
 * fallback would put one company's logo on the other's jobs, the one failure this
 * codebase's docs rank worse than showing nothing. When the request has no board
 * URL at all, same-named rows are used only if every one of them asserts the same
 * evidence, which makes a collision impossible to serve.
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

/* Never an employer's web domain, whatever a backend row says. `internal` and
   friends are private-network suffixes, and an all-numeric final label is an
   IPv4 literal wearing a domain's shape: 169.254.169.254 passes BARE_DOMAIN,
   and fetching it from here is a server-side request to the metadata service.
   The legacy chain could never produce such a host (its inputs are token-checked
   board pages and <slug>.com guesses), so this list is what keeps the evidence
   path from widening the fetch surface when a backend row is wrong. */
const INTERNAL_TLDS = new Set(["internal", "local", "localhost", "lan", "home", "corp", "intranet"]);

/* Suffixes under which a "domain" is a registry, not a company. `www.co.uk`
   passes BARE_DOMAIN and strips to `co.uk`, and a suffix match against that
   admits every .co.uk host. This is deliberately a short list of the common
   multi-label public suffixes rather than the full PSL: a miss here costs one
   company a subdomain-hosted logo (the exact-host match still works), never a
   wrong fetch. */
const PUBLIC_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.jp",
  "com.br", "co.in", "co.nz", "com.mx", "com.sg", "co.za", "com.cn", "com.tr",
]);

/**
 * The employer domain a backend row asserts, normalized and vetted, or null.
 * The `www.` strip happens BEFORE validation on purpose: stripping after let
 * `www.com` pass the two-label check and then collapse to `com`, at which point
 * the suffix match admitted every .com host (review finding 2026-09-01).
 */
export function normalizedDomain(raw: unknown): string | null {
  const stripped = str(raw)?.trim().toLowerCase().replace(/^www\./, "") ?? null;
  if (!stripped || !BARE_DOMAIN.test(stripped)) return null;
  const labels = stripped.split(".");
  const tld = labels[labels.length - 1];
  if (!/^[a-z][a-z0-9-]*$/.test(tld) || tld.length < 2) return null;
  if (INTERNAL_TLDS.has(tld)) return null;
  if (PUBLIC_SUFFIXES.has(stripped)) return null;
  return stripped;
}

function hostMatchesDomain(host: string, domain: string | null): boolean {
  if (!domain) return false;
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h === domain) return true;
  /* Subdomains only under a domain that is not itself a shared registry. */
  return h.endsWith(`.${domain}`) && !PUBLIC_SUFFIXES.has(domain);
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
const BACKEND_EVIDENCE_HOSTS = new Set(["api.trylitos.com", "student-outreach-backend.vercel.app"]);
try {
  BACKEND_EVIDENCE_HOSTS.add(new URL(API_URL).hostname);
} catch {
  /* an unparseable API_URL already breaks the lookup itself; nothing to add */
}

/**
 * The evidence URL, if it points somewhere this process is willing to fetch:
 * https only, and the host is a known ATS asset host, our own API, or the
 * employer domain the same backend row asserts. Null means "do not fetch this
 * URL"; the caller falls back to resolving the domain or to the legacy chain.
 *
 * The route calls this twice per evidence fetch: once on the URL it is about to
 * request, and once on the response's FINAL URL, because the fetch follows
 * redirects and a gate that only sees the first hop guarantees nothing.
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
  if (hostMatchesDomain(host, normalizedDomain(companyDomain))) return url.href;
  return null;
}

/* One board URL, in the form used for identity comparison: https host lowercased,
   default port and trailing slashes dropped, query and fragment ignored. The raw
   query param and the stored career_url come from the same API today, but byte
   equality broke the moment either side gained a trailing slash, and a missed
   match here used to fall through to the name-keyed pick that finding 1 removed. */
function normalizedBoardUrl(raw: string | null): string | null {
  const s = str(raw);
  if (!s) return null;
  try {
    const url = new URL(s);
    if (url.protocol !== "https:") return null;
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

/**
 * Choose the row whose evidence answers for this (company, board) pair.
 *
 * The company name must match EXACTLY: the tile and the coverage check both send
 * company_name verbatim from the same API these rows come from, and an ilike
 * match on the backend side may have swept in unrelated companies whose names
 * merely contain the query.
 *
 * When the request names a board, only the row with that board answers; a request
 * whose source is not in these rows gets null, never a same-named neighbour (see
 * the header: two distinct companies named "Crisp" are live right now). When the
 * request has no board, same-named rows answer only unanimously: every verified
 * row must assert the same logo URL and domain, which two colliding companies
 * cannot do.
 */
export function pickEvidence(
  rows: readonly JobsRow[],
  company: string,
  boardUrl: string | null,
): LogoEvidence | null {
  const name = company.trim();
  const wantedBoard = normalizedBoardUrl(boardUrl);
  const candidates: JobsRow[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    if (str(row.company_name)?.trim() !== name) continue;
    if (str(row.company_logo_verification_status) !== "verified") continue;
    if (!str(row.company_logo_url) && !str(row.company_domain)) continue;
    if (wantedBoard) {
      if (normalizedBoardUrl(str(row.career_url)) === wantedBoard) {
        candidates.push(row);
        break;
      }
      continue;
    }
    candidates.push(row);
  }
  if (boardUrl && !wantedBoard) return null;
  const first = candidates[0];
  if (!first) return null;
  if (!wantedBoard) {
    const agree = candidates.every(
      (row) =>
        str(row.company_logo_url) === str(first.company_logo_url)
        && str(row.company_domain) === str(first.company_domain),
    );
    if (!agree) return null;
  }
  const domain = normalizedDomain(first.company_domain);
  const url = evidenceImageUrl(str(first.company_logo_url), domain);
  /* A row whose URL failed the gate AND whose domain failed normalization has
     nothing the route could act on; null keeps the caller's evidence check
     honest instead of handing it an empty shell. */
  if (!url && !domain) return null;
  return { url, domain, method: str(first.company_logo_verification_method) };
}

/* One instance answers repeats. This server runs standalone on Railway with no
   shared CDN in front of it, so the route's s-maxage never lands anywhere: every
   visitor's board page re-asks for the same two dozen companies, and each ask was
   a fresh backend query. Misses are cached as firmly as hits, or junk names (and
   anyone looping them) would still reach the backend once per request. Bounded
   FIFO because the working set is the live board's source list, not unbounded. */
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5000;
const lookupCache = new Map<string, { at: number; value: LogoEvidence | null }>();

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
  const key = `${company.trim()}\n${boardUrl ?? ""}`;
  const cached = lookupCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
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
    const value = pickEvidence(jobs as JobsRow[], company, boardUrl);
    if (lookupCache.size >= CACHE_MAX_ENTRIES) {
      const oldest = lookupCache.keys().next().value;
      if (oldest !== undefined) lookupCache.delete(oldest);
    }
    lookupCache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    /* Not cached: an abort or network blip should not suppress the next try. */
    return null;
  }
}
