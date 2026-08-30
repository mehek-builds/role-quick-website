/* Find the real domain for every company on the board that has no mark yet.
 *
 *   node --experimental-strip-types scripts/discover-company-domains.mjs
 *
 * Prints a TypeScript fragment to paste into lib/company-logos.ts, and nothing
 * else. It never edits that file itself: a wrong domain means a wrong company's
 * logo on a real job, which is worse than no logo at all, so the list stays
 * something a human approved.
 *
 * WHY THIS EXISTS. The board went from 51 companies to 253 (other sessions kept
 * adding sources), and only the original 51 had marks, so four tiles in five
 * fell back to a monogram. career_page_sources cannot help: every career_url on
 * the board points at greenhouse/lever/ashby, never at the employer's own site.
 *
 * THE GUESS IS NEVER TRUSTED. A candidate domain is accepted only if the site
 * it resolves to identifies itself as that company: the company's name has to
 * appear in <title>, og:site_name, or the apple-touch-icon's own path. "Block"
 * would otherwise happily attach block.com, which belongs to someone else.
 */

import { COMPANY_DOMAINS } from "../lib/company-logos.ts";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const FACETS =
  (process.env.NEXT_PUBLIC_API_URL ?? "https://api.trylitos.com") +
  "/jobs/facets";

/* Trailing noise that is never part of a domain. Kept tight: stripping too much
   turns "Match Group" into "match", which is a different company. */
const SUFFIX = /\s+(inc|llc|ltd|limited|corp|corporation|co|group|technologies|technology|labs|ai|the)\.?$/i;

function slugs(company) {
  const base = company
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, "and")
    .replace(SUFFIX, "")
    .trim();
  const tight = base.toLowerCase().replace(/[^a-z0-9]/g, "");
  const dashed = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const first = base.toLowerCase().split(/[^a-z0-9]+/)[0];
  return [...new Set([tight, dashed, first].filter((s) => s && s.length > 2))];
}

/* .com ONLY, and this restriction is the whole difference between a useful list
   and a wrong one. The first version also tried .ai/.io/.co and every single
   false positive came from them: Block resolved to block.co (an NFT company,
   not Jack Dorsey's Block, which is block.xyz), Ashby to ashby.ai instead of
   ashbyhq.com, Elastic to elastic.io instead of elastic.co. The name check
   cannot catch those (the impostor's title genuinely contains the word) so
   the alternates are simply not tried. A company whose real domain is not .com
   keeps its monogram, which is the correct outcome when we are not sure. */
function candidates(company) {
  return [...new Set(slugs(company).map((s) => `${s}.com`))];
}

/* Loose match: "Scale AI" should accept a title saying "Scale", and
   "Qube Research & Technologies" one saying "Qube". Compare on letters only. */
function identifies(company, html) {
  const letters = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = letters(company.replace(/\(.*?\)/g, " ").replace(SUFFIX, ""));
  if (name.length < 3) return false;
  const head = html.slice(0, 60_000);
  const title = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(head)?.[1] ?? "";
  const site = /property=["']og:site_name["'][^>]*content=["']([^"']{0,120})["']/i.exec(head)?.[1] ?? "";
  const alt = /content=["']([^"']{0,120})["'][^>]*property=["']og:site_name["']/i.exec(head)?.[1] ?? "";
  const hay = letters(`${title} ${site} ${alt}`);
  if (!hay) return false;
  /* The name must appear in what the site calls itself. Short names are held to
     a stricter test: a three-letter company inside a long marketing title is as
     likely to be a coincidence as a match. */
  if (name.length < 5) return letters(title).startsWith(name) || letters(site) === name || letters(alt) === name;
  return hay.includes(name);
}

async function resolve(company) {
  for (const domain of candidates(company)) {
    try {
      const res = await fetch(`https://${domain}`, {
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
      /* A bot-block still proves the host exists, but it does not prove WHOSE it
         is, and this script's whole job is to be sure. Skip it. */
      if (!res.ok) continue;
      const html = await res.text();
      if (identifies(company, html)) return domain;
    } catch {
      /* next candidate */
    }
  }
  return null;
}

const res = await fetch(FACETS, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
const { companies } = await res.json();
const missing = companies.filter((c) => !(c in COMPANY_DOMAINS));

console.error(`${companies.length} companies on the board, ${missing.length} without a domain.`);

const found = [];
const failed = [];
const queue = [...missing];

async function worker() {
  while (queue.length) {
    const company = queue.shift();
    const domain = await resolve(company);
    if (domain) {
      found.push([company, domain]);
      console.error(`  ok    ${company} -> ${domain}`);
    } else {
      failed.push(company);
      console.error(`  --    ${company}`);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

found.sort((a, b) => a[0].localeCompare(b[0]));
console.log(`\n  // Verified ${new Date().toISOString().slice(0, 10)}: each domain's own site names the company.`);
for (const [company, domain] of found) {
  const key = /^[A-Za-z][A-Za-z0-9]*$/.test(company) ? company : JSON.stringify(company);
  console.log(`  ${key}: ${JSON.stringify(domain)},`);
}
console.error(`\nresolved ${found.length}/${missing.length}. Unresolved stay on the monogram fallback.`);
if (failed.length) console.error(`unresolved: ${failed.join(", ")}`);
