/* End-to-end proof that the board's logos keep themselves current.
 *
 *   node --experimental-strip-types scripts/verify-logo-service.mjs [baseUrl]
 *
 * Defaults to http://localhost:3000; pass https://trylitos.com to check prod.
 * Exits non-zero on any failure, so it can gate a deploy.
 *
 * WHAT IT ACTUALLY PROVES, and why each case is here:
 *
 * 1. A curated company still serves its committed file. The live resolver must
 *    never override a mark a human approved.
 * 2. A company the map has NEVER heard of resolves live. This is the whole
 *    point: the job monitor added 202 employers in a day and every one of them
 *    showed a monogram until somebody noticed. If this case fails, the system
 *    has silently gone back to being a snapshot. Asserted with a control name
 *    rather than a live board company, because the uncurated companies on the
 *    board are precisely the residue an earlier pass already failed on: their
 *    hit rate is reported, not asserted.
 * 3. A company on the denylist stays a monogram. peloton.com sells oil-and-gas
 *    software; a green tick here would mean we are shipping the wrong company's
 *    logo onto a real job.
 * 4. A company that does not exist degrades to a monogram image with a 200,
 *    not a 404: the tile has no client JavaScript to catch a broken image.
 * 5. Every mark served is really an image, not an HTML error page. Bot-blocked
 *    hosts answer asset requests with 200 and a login wall.
 * 6. The answers are cacheable. Without this the board would re-probe hundreds
 *    of employer sites on every page view.
 */

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const API = `${BASE}/api/company-logo`;
const BOARD =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.trylitos.com";

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures += 1;
};

async function logo(company, redirect = "follow", board = null) {
  const qs = new URLSearchParams({ c: company });
  if (board) qs.set("board", board);
  const res = await fetch(`${API}?${qs}`, {
    redirect,
    signal: AbortSignal.timeout(30_000),
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  const type = res.headers.get("content-type") ?? "";
  const head = new TextDecoder().decode(buf.subarray(0, 120)).trim().toLowerCase();
  return {
    status: res.status,
    source: res.headers.get("x-logo-source") ?? "",
    type,
    bytes: buf.length,
    cache: res.headers.get("cache-control") ?? "",
    url: res.url,
    isMonogram: type.includes("svg") && head.includes("<rect"),
    isImage:
      type.startsWith("image/") &&
      !head.startsWith("<!doctype") &&
      !head.startsWith("<html"),
  };
}

console.log(`Logo service end-to-end against ${BASE}\n`);

/* --- 1. curated marks are still served from the committed file --- */
console.log("1. a curated company keeps its approved mark");
const stripe = await logo("Stripe");
check(stripe.isImage, "Stripe returns an image", `${stripe.type}, ${stripe.bytes}B`);
check(
  stripe.url.includes("/company/"),
  "served from the committed set, not re-resolved",
  stripe.url.replace(BASE, ""),
);

/* --- 2a. the mechanism itself: a name the map has never heard of --- */
console.log("\n2. a company the map has never heard of resolves live");
/* A control, deliberately NOT a board company and NOT in COMPANY_DOMAINS. It
   stands in for the next employer the job monitor adds: if this resolves, the
   route can dress a company nobody prepared for. Using a live board company for
   this would be a worse test, not a better one, see the note below. */
for (const control of ["Shopify", "Atlassian"]) {
  const r = await logo(control);
  check(
    r.isImage && !r.isMonogram,
    `${control} (never curated) resolved to a real mark`,
    `${r.type}, ${r.bytes}B`,
  );
}

console.log("\n   coverage across the companies actually on the board:");
const { companies } = await (
  await fetch(`${BOARD}/jobs/facets`, { signal: AbortSignal.timeout(30_000) })
).json();
const { COMPANY_DOMAINS } = await import("../lib/company-logos.ts");
const { isDenied, domainCandidates, parseBoardUrl } = await import("../lib/company-logo-source.ts");

const unmapped = companies.filter(
  (c) => !(c in COMPANY_DOMAINS) && !isDenied(c) && domainCandidates(c).length > 0,
);
check(unmapped.length > 0, `the board has ${unmapped.length} uncurated companies`);

/* Reported, NOT asserted, and the distinction matters. The uncurated set is by
   definition the residue: every company here is one an earlier curation pass
   already failed to resolve, so a low hit rate is the expected shape and not a
   regression. What must hold is that the mechanism works (asserted above) and
   that every answer is a valid image (asserted below). */
let resolved = 0;
const sample = unmapped.slice(0, 6);
for (const company of sample) {
  const r = await logo(company);
  if (r.isImage && !r.isMonogram) resolved += 1;
  console.log(`     ${company}: ${r.isMonogram ? "monogram" : r.type} (${r.bytes}B)`);
}
console.log(`     ${resolved}/${sample.length} of the residue resolved (informational)`);

/* --- 3. the denylist holds --- */
console.log("\n3. a company whose .com belongs to someone else is never name-guessed");
/* The denylist protects the NAME GUESS, and that is all it has to protect. A
   monogram passes. So does a mark served as `verified:*`: backend evidence is
   keyed to the exact row on our own board, not to whoever owns the .com, and a
   real Peloton joining the board is allowed its real logo. What must never
   appear here is a name-guessed image, which is how peloton.com's oil-and-gas
   software nearly got a fitness company's rows. */
for (const company of ["Peloton", "crisp", "Peloton Interactive"]) {
  const r = await logo(company);
  check(
    r.isMonogram || (r.isImage && r.source.startsWith("verified")),
    `${company} is a monogram or backend-verified, never a guess`,
    r.source || r.type,
  );
}

/* --- 4. the unknown case is an image, not an error --- */
console.log("\n4. an unknown company degrades to an image, not a 404");
const nonsense = await logo("Zzzq Nonexistent Holdings");
check(nonsense.status === 200, "status is 200", String(nonsense.status));
check(nonsense.isMonogram, "body is a monogram SVG", nonsense.type);

/* --- 5. nothing served is secretly an HTML page --- */
console.log("\n5. everything served is really an image");
const all = [stripe, nonsense, ...(await Promise.all(sample.slice(0, 3).map((c) => logo(c))))];
check(
  all.every((r) => r.isImage),
  "no HTML error page was passed off as a logo",
);

/* --- 6. cacheable, or the board re-probes the internet on every view --- */
console.log("\n6. answers are cacheable");
/* Measured on the REDIRECT itself, not on the file it points at. Following it
   reports the static asset's own header, which is a different question: what
   matters is that the browser does not come back to this route. */
const stripeRedirect = await logo("Stripe", "manual");
check(
  /max-age=\d\d+/.test(stripeRedirect.cache),
  "the curated redirect is cacheable",
  `${stripeRedirect.status} ${stripeRedirect.cache.slice(0, 44)}`,
);
check(
  /max-age=\d\d+/.test(nonsense.cache),
  "the monogram is cached too, so failures are not re-probed",
  nonsense.cache.slice(0, 48),
);

/* --- 7. the board we poll beats guessing the name --- */
console.log("\n7. the mark comes from the board we poll, not from the name");

/* Block is THE case. Guessing from the name gives block.co, an NFT company;
   their Greenhouse board links block.xyz, which is the real one. Whether Block
   resolves AT ALL is board data, not code: Block has left the board before
   (measured 2026-09-01: no exact "Block" row among 204 substring matches, and
   this check sat red against production for it). The invariant a deploy can
   actually gate on is that whatever answers is never the name guess. */
const block = await logo("Block", "follow", "https://job-boards.greenhouse.io/block");
check(
  block.isMonogram
    || (!block.source.startsWith("name-guess") && !block.source.includes("block.co")),
  "Block is never served from the name-guess block.co",
  block.source || block.type,
);

/* Ashby hosts the employer's own uploaded logo, keyed to the org, and the
   backend's evidence records that same URL: either source label proves the
   mark did not come from the name. */
const crisp = await logo("crisp", "follow", "https://jobs.ashbyhq.com/crisp");
check(
  crisp.isImage && !crisp.isMonogram,
  "crisp resolved from its Ashby board despite being on the name denylist",
  `${crisp.type}, ${crisp.source}`,
);
check(
  crisp.source.startsWith("ashby:") || crisp.source.startsWith("verified"),
  "served from the ATS-hosted logo or its verified evidence",
  crisp.source,
);

/* --- 8. the board parameter cannot be pointed anywhere --- */
console.log("\n8. the board parameter is not an open fetch");
/* Our server fetches whatever `board` says, so the allowlist is the whole
   defence. A refused board must fall back, never proxy. */
for (const evil of [
  "https://169.254.169.254/latest/meta-data/",
  "http://localhost/admin",
  "https://job-boards.greenhouse.io.evil.com/stripe",
]) {
  const r = await logo("Zzzq Nonexistent Holdings", "follow", evil);
  check(
    r.isMonogram && !r.source.includes("evil") && !r.source.includes("169.254"),
    `refused ${evil.slice(0, 42)}`,
    r.source || "no source header",
  );
}

/* --- 9. the contract that feeds all of this --- */
console.log("\n9. the API still hands the board URL to the page");
/* The cross-repo join, and the one thing a website test cannot hold on its own.
   If the backend stops selecting career_url on /jobs/grouped, the tile passes
   nothing, the route silently falls back to guessing a domain from the name,
   and the board keeps rendering logos, some of them the wrong company's. No
   unit test anywhere would fail. This is the check that would. */
const grouped = await (
  await fetch(`${BOARD}/jobs/grouped?limit=5`, { signal: AbortSignal.timeout(30_000) })
).json();
const rows = grouped.jobs ?? [];
check(rows.length > 0, "the board API returned rows", String(rows.length));
const withBoardUrl = rows.filter((j) => typeof j.career_url === "string" && j.career_url);
check(
  withBoardUrl.length === rows.length,
  "every row carries career_url",
  `${withBoardUrl.length}/${rows.length}`,
);
const parsable = withBoardUrl.filter((j) => parseBoardUrl(j.career_url));
check(
  parsable.length === withBoardUrl.length,
  "and every one is a board the logo service will accept",
  `${parsable.length}/${withBoardUrl.length}`,
);

/* --- 10. the backend's verified evidence actually dresses the board --- */
console.log("\n10. a live board row resolves through the backend's evidence");
/* The feature the evidence path exists for, held end to end: the backend
   refuses to surface a row without verified logo evidence, so a row it just
   handed us must come back as a real image, and from the evidence or the board,
   never from the name. Probed on rows the API returned seconds ago so the case
   tracks the live board instead of pinning a company that can churn off it. */
const liveRows = withBoardUrl.filter((j) => typeof j.company_name === "string" && j.company_name);
check(liveRows.length > 0, "the grouped rows carry company_name", String(liveRows.length));
let evidenceHits = 0;
for (const rowUnderTest of liveRows.slice(0, 3)) {
  const r = await logo(rowUnderTest.company_name, "follow", rowUnderTest.career_url);
  const fromEvidence = r.source.startsWith("verified");
  if (fromEvidence) evidenceHits += 1;
  check(
    r.status === 200 && !r.source.startsWith("name-guess"),
    `${rowUnderTest.company_name} answered without a name guess`,
    r.source || r.type,
  );
}
check(
  evidenceHits > 0,
  "at least one of them was served from backend evidence",
  `${evidenceHits}/${Math.min(3, liveRows.length)}`,
);

console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
