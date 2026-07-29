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
 *    board are precisely the residue an earlier pass already failed on — their
 *    hit rate is reported, not asserted.
 * 3. A company on the denylist stays a monogram. peloton.com sells oil-and-gas
 *    software; a green tick here would mean we are shipping the wrong company's
 *    logo onto a real job.
 * 4. A company that does not exist degrades to a monogram image with a 200,
 *    not a 404 — the tile has no client JavaScript to catch a broken image.
 * 5. Every mark served is really an image, not an HTML error page. Bot-blocked
 *    hosts answer asset requests with 200 and a login wall.
 * 6. The answers are cacheable. Without this the board would re-probe hundreds
 *    of employer sites on every page view.
 */

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const API = `${BASE}/api/company-logo`;
const BOARD =
  process.env.NEXT_PUBLIC_API_URL ?? "https://student-outreach-backend.vercel.app";

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
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
   this would be a worse test, not a better one — see the note below. */
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
const { isDenied, domainCandidates } = await import("../lib/company-logo-source.ts");

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
console.log("\n3. a company whose .com belongs to someone else stays a monogram");
for (const company of ["Peloton", "crisp", "Peloton Interactive"]) {
  const r = await logo(company);
  check(r.isMonogram, `${company} is a monogram`, r.type);
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
   reports the static asset's own header, which is a different question — what
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
   their Greenhouse board links block.xyz, which is the real one. */
const block = await logo("Block", "follow", "https://job-boards.greenhouse.io/block");
check(block.isImage && !block.isMonogram, "Block resolved a real mark", `${block.type}, ${block.bytes}B`);
check(
  block.source.includes("block.xyz"),
  "and it came from block.xyz, not the name-guess block.co",
  block.source,
);

/* Ashby and Lever host the employer's own uploaded logo, keyed to the org. */
const crisp = await logo("crisp", "follow", "https://jobs.ashbyhq.com/crisp");
check(
  crisp.isImage && !crisp.isMonogram,
  "crisp resolved from its Ashby board despite being on the name denylist",
  `${crisp.type}, ${crisp.source}`,
);
check(crisp.source.startsWith("ashby:"), "served from the ATS-hosted logo", crisp.source);

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

console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
