import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* The company logo on a job row shipped BROKEN TWICE, in two different ways, and neither showed up
   as a failing test, a console error, or a red build. Both are pinned here.

   Source assertions rather than a rendering test on purpose: this repo's runner is
   `node --experimental-strip-types`, which cannot parse JSX, so `components/app/CompanyLogo.tsx`
   is not importable. `tests/typography-policy.test.mjs` guards its own laws the same way. */

const componentUrl = new URL("../components/app/CompanyLogo.tsx", import.meta.url);
const homeUrl = new URL("../app/dashboard/page.tsx", import.meta.url);

/* Comments are stripped before anything is asserted. These checks describe what the component
   DOES, and the comments here explain the bugs it must not repeat by quoting them verbatim, so a
   naive search matches the explanation and reports a failure that is not real. That happened on
   the first run of this file. */
async function code() {
  const source = await readFile(componentUrl, "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

test("the row logo is never lazy-loaded", async () => {
  /* FAILURE 1, measured on trylitos.com 2026-07-29: with loading="lazy", not one of the 41 logos
     on the first page ever loaded. Every circle rendered empty, including rows sitting in the
     viewport, and because the image never errored the monogram fallback never ran either, so the
     row showed nothing at all rather than a letter. Forcing the same element to eager painted it
     immediately, and probing the URL from that page returned a 64px image.

     These icons are ~1KB, sit at the left edge of every row, and are the row's identity. Deferring
     them buys nothing and cost the whole feature. */
  const source = await code();
  assert.doesNotMatch(
    source,
    /loading=["']lazy["']/,
    'the logo must not be lazy-loaded: on production not one lazy logo ever loaded',
  );
});

test("a logo that fails still leaves something in the circle", async () => {
  /* The circle must never be empty. If the image errors we fall back to the company's initial, so
     onError has to set that state: without it a dead icon leaves a blank disc with no clue whose
     row it is. */
  const source = await code();
  assert.match(source, /onError=\{\(\) => setBroken\(true\)\}/);
  assert.match(source, /charAt\(0\)\.toUpperCase\(\)/, "the fallback renders the company initial");
});

test("the component resolves no domain of its own", async () => {
  /* FAILURE 2: the component derived the domain from `career_url`, which on every polled source
     holds the JOB BOARD, so the resolver correctly returned null on 100 rows out of 100 and no
     logo ever appeared. The rule was moved to lib/job-rows.ts where it is tested, and the component
     was told not to grow its own copy.

     It now has no copy to grow. The component sends a company name and, when the row has one, a
     board URL; every question about which domain that is belongs to app/api/company-logo, which
     answers it from the employer's own board page rather than from a name. So the original rule is
     satisfied more completely than it was: there is no domain parsing here at all. */
  const source = await code();
  assert.doesNotMatch(source, /new URL\(/, "URL parsing belongs in the route, where it has tests");
  assert.doesNotMatch(source, /companyDomainForRow/, "the component no longer resolves a domain");
});

test("the logo is fetched from us, never from a third party", async () => {
  /* THE TRADE lib/company-logos.ts REFUSED IN WRITING when the board tiles were built: a
     third-party logo API "puts a request to somebody else's server in every visitor's browser, on a
     page that lists 24 employers at a time, which hands a third party a log of who is looking at
     which jobs."

     The dashboard shipped a second component that made exactly that trade, pointing at Google's
     favicon endpoint - so the LOGGED-IN surfaces, the ones that know who the student is and every
     employer she has applied to, were the only place doing it. Measured 2026-08-29: the browser
     re-asked Google for every unique employer roughly every half hour of use, because the redirect
     that locates the icon carries max-age=1800 while the icon behind it is cached for a week. */
  const source = await code();
  assert.match(source, /const LOGO_ENDPOINT = "\/api\/company-logo"/);
  assert.doesNotMatch(source, /https?:\/\//, "the icon must come from our own origin");
  assert.doesNotMatch(source, /favicon|gstatic|clearbit/i);
});

test("a row hands the route its board URL when it has one", async () => {
  /* Identity by construction rather than by guessing a domain from a name: we poll each employer's
     board under a token we chose, so the page at that token is that company's. It is what recovers
     akunacapital.com and the Lever-hosted mark for mytos. */
  const source = await code();
  assert.match(source, /boardUrl \? `&board=\$\{encodeURIComponent\(boardUrl\)\}` : ""/);
});

test("a company with no findable mark falls back to this component's own circle", async () => {
  /* The route answers a miss with a monogram IMAGE by default, because the board tiles have no
     client JavaScript to swap anything in. This component does, and its monogram is drawn for a
     circle - so it asks for the 404 instead. Nesting the route's bordered rounded square inside
     this circle would read as a square in a circle. */
  const source = await code();
  assert.match(source, /&miss=404/);
});

test("the request never carries the dashboard URL with it", async () => {
  /* Same-origin now, so the referrer would only reach us. Kept because it costs nothing and is the
     line that stops a dashboard URL - which carries an application id - riding along if this ever
     points somewhere else again. */
  const source = await code();
  assert.match(source, /referrerPolicy="no-referrer"/);
});

test("the Home recommendation card leads with the company logo", async () => {
  const home = await readFile(homeUrl, "utf8");
  const card = home.slice(home.indexOf("function JobMatchCard"), home.indexOf("function dailyDismissalKey"));

  assert.match(card, /<CompanyLogo company=\{job\.company_name\} boardUrl=\{job\.career_url\} \/>/);
  assert.ok(
    card.indexOf("<CompanyLogo") < card.indexOf("<ScoreRing"),
    "the company mark should occupy the leading slot before the top-right fit score",
  );
});

/* The route's side of the same contract. */
const routeUrl = new URL("../app/api/company-logo/route.ts", import.meta.url);

test("a miss is cached exactly like a hit, whichever shape it takes", async () => {
  /* Without this, every dashboard render re-probes the same handful of companies that have no
     findable mark - which is the whole failure this route exists to end, pointed at ourselves
     instead of at Google. */
  const route = await readFile(routeUrl, "utf8");
  const fn = route.slice(route.indexOf("function miss("));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /status: 404, headers: \{ "Cache-Control": CACHE \}/);
  assert.match(body, /!== "404"\) return svg\(company\)/, "the board tiles keep the image default");
});

test("the board tiles still get an image on a miss, because they have no JavaScript", async () => {
  /* A 404 there would leave a broken-image icon with nothing to swap it out. Only a caller that
     opts in with miss=404 gets the status. */
  const route = await readFile(routeUrl, "utf8");
  assert.match(route, /if \(!company\) return miss\("\?", request\)/);
  assert.doesNotMatch(route, /return svg\(company\);\n\}/, "the final answer routes through miss()");
});

test("the board URL is still gated by the ATS allowlist", async () => {
  /* The dashboard now passes an employer portal URL straight through from stored application data,
     so the SSRF gate on that parameter is load-bearing for a second surface. It must stay an
     exact-match hostname allowlist. */
  const source = await readFile(new URL("../lib/company-logo-source.ts", import.meta.url), "utf8");
  assert.match(source, /const BOARD_HOSTS: Record<string, BoardAts> = \{/);
  assert.match(source, /let ats = BOARD_HOSTS\[u\.hostname\];/, "fixed board hosts use an exact lookup");
  assert.match(source, /\^\(\[A-Za-z0-9-\]\{1,100\}\)\\\.\(breezy\\\.hr\|recruitee\\\.com\)\$/, "tenant board hosts use an anchored allowlist");
  assert.match(source, /if \(u\.protocol !== "https:"\) return null;/);
});

test("a QA render draws the monogram and resolves nothing", async () => {
  /* The fixture companies are invented, but the route cannot tell: it resolved a real mark for
     "Acme Labs" off a live site, which put third-party content inside the dashboard's visual
     baselines. Those run against a locally built app, so CI would re-fetch employer sites on every
     run under an 8s budget and go red whenever one was slow - a gate failing for a reason unrelated
     to the change under test. */
  const source = await code();
  /* Decided on the first render, never flipped after mount: an effect-based swap raced the
     screenshot and produced a logo in one CI run and a monogram in the next, which is worse than
     the nondeterminism it was added to remove. */
  assert.match(source, /const \[qa\] = useState\(isQaRender\);/);
  assert.doesNotMatch(source, /setQa\(/, "a post-mount flip is a race against anything that reads the DOM");
  assert.match(source, /const showIcon = name\.length > 0 && !broken && !qa;/);
});

test("the committed-logo redirect never carries the origin the server saw", async () => {
  /* THE THIRD WAY THIS SHIPPED BROKEN, and like the first two it was silent.
     The route answered a committed mark with
       NextResponse.redirect(new URL(committed, request.url), { status: 308 })
     and request.url is the origin the SERVER saw, not the one the browser asked for. On Vercel
     that was rewritten to the public origin and the redirect was correct. Behind Railway's proxy
     it is the container's own http://localhost:3000, so production answered every committed logo
     with `Location: https://localhost:3000/company/<slug>.png` and sent each visitor to port 3000
     on their own machine. Measured in production on 2026-08-31. No exception, no console error,
     no red build: just the column of empty circles this file exists to prevent, on the employers
     that DO have a curated mark. A relative Location is resolved by the browser against the URL it
     actually requested, so it is correct on every host and trusts no x-forwarded-* header. */
  const raw = await readFile(new URL("../app/api/company-logo/route.ts", import.meta.url), "utf8");
  /* Stripped like code() above. The route now carries a comment quoting the broken call verbatim,
     and this file has already been bitten once by an explanation matching its own assertion. */
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.doesNotMatch(
    source,
    /redirect\(new URL\([^)]*request\.url/,
    "a redirect built from request.url points at whatever origin the server saw",
  );
  assert.match(source, /headers: \{ Location: committed,/, "the committed mark redirects relatively");
  assert.match(source, /status: 308,/);
});
