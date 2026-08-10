import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { QA_GATE_HEADER, QA_GATE_PARAM, qaAccessAllowed } from "../lib/qa-gate.ts";

/* Every internal link on a public surface must point at a route that exists.
 *
 * Why this test exists, in one sentence: on 2026-07-27 Jobright.ai's entire
 * acquisition funnel was dead, and nobody there had noticed. Both primary CTAs
 * did nothing, /signup and /onboarding both 404'd, and /jobs redirected to the
 * homepage. Reproduced in two browsers. That is the single most expensive bug
 * in the whole ten-product audit (vault: competitor-flow-audit-2026-07-27), and
 * it is the class of bug that is invisible in review, survives a green build,
 * and costs every acquisition dollar spent while it is live.
 *
 * Litos has already shipped its own smaller version of this: /start and /login
 * were reachable, but simplify.jobs/auth/sign-up-style dead paths are exactly
 * what the audit caught elsewhere, and this repo gained three new internal
 * links in one evening (the pillar CTAs to /try?step=...). Nothing checked them
 * except me, by hand, once.
 *
 * Static on purpose. A server-driven smoke test would catch more, but it needs
 * a build, a port and a running app, so it gets skipped when it matters most.
 * This runs in milliseconds on every `npm test`, needs nothing, and cannot rot.
 */

const ROOT = new URL("..", import.meta.url).pathname;
const APP = join(ROOT, "app");

/* ---------- 1. what routes actually exist ---------- */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const appFiles = walk(APP);

/* A route exists where a page.tsx does. Route groups (parens) contribute no
   URL segment; dynamic segments are matched separately below. */
const routes = new Set(
  appFiles
    .filter((f) => /(^|\/)page\.tsx$/.test(f))
    .map((f) => {
      /* The anchor has to allow a bare "page.tsx", which is the root route:
         relative(APP, "app/page.tsx") is "page.tsx" with no leading slash, so a
         /\/page\.tsx$/ anchor silently drops "/" from the route set. Caught by
         this test's own critical-routes assertion on the first run. */
      const rel = relative(APP, f).replace(/(^|\/)page\.tsx$/, "");
      const url =
        "/" +
        rel
          .split("/")
          .filter((seg) => seg && !/^\(.*\)$/.test(seg))
          .join("/");
      return url === "/" ? "/" : url.replace(/\/$/, "");
    }),
);

/* Files served from public/ are legitimate link targets too. */
const publicFiles = new Set(
  walk(join(ROOT, "public")).map((f) => "/" + relative(join(ROOT, "public"), f)),
);

/* Routes that exist but are not page.tsx files. Kept explicit and short so an
   unknown link fails rather than being waved through by a loose pattern. */
const NON_PAGE_ROUTES = new Set(["/sitemap.xml", "/robots.txt"]);

function routeExists(pathname) {
  if (routes.has(pathname) || NON_PAGE_ROUTES.has(pathname)) return true;
  if (publicFiles.has(pathname)) return true;
  /* dynamic segments: /qa/portal-submission/[board]/[case] */
  for (const r of routes) {
    if (!r.includes("[")) continue;
    const rx = new RegExp(
      "^" + r.replace(/\[[^\]]+\]/g, "[^/]+").replace(/\//g, "\\/") + "$",
    );
    if (rx.test(pathname)) return true;
  }
  return false;
}

/* ---------- 2. every internal href in the source ---------- */

const SOURCE_DIRS = [join(ROOT, "app"), join(ROOT, "components")];
const sources = SOURCE_DIRS.flatMap((d) => walk(d)).filter((f) =>
  /\.tsx?$/.test(f) && !/\.test\.[mc]?tsx?$/.test(f),
);

function internalHrefs(text) {
  const out = [];
  /* Only literal hrefs. A templated href cannot be checked statically and is
     deliberately not guessed at; see the note in the skipped-count assertion. */
  for (const m of text.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
    out.push(m[1]);
  }
  return out;
}

test("every internal link points at a route that exists", () => {
  const broken = [];
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    for (const href of internalHrefs(text)) {
      const clean = href.length > 1 ? href.replace(/\/$/, "") : href;
      if (!routeExists(clean)) {
        broken.push(`${relative(ROOT, file)} -> ${href}`);
      }
    }
  }
  assert.deepEqual(
    broken,
    [],
    `Internal links with no matching route:\n  ${broken.join("\n  ")}`,
  );
});

/* ---------- 2b. every in-page anchor points at an id that exists ---------- */

/* Why this exists, and it is not hypothetical: on 2026-07-28 the #formats band
 * was deleted and folded into #documents, and TWO "skip ahead" controls kept
 * pointing at href="#formats". Both shipped to production. Both did nothing
 * when clicked.
 *
 * This file already existed to prevent exactly that class of bug, and it missed
 * it, because internalHrefs() only matches hrefs beginning with "/" and
 * explicitly strips the fragment: `href="(\/[^"#?]*)(?:[?#][^"]*)?"`. A bare
 * href="#formats" never entered the check at all, and "/#pricing" was checked
 * as "/" with the fragment thrown away.
 *
 * A dead fragment is quieter than a dead route: no 404, no error, the page just
 * sits there. That is worse, not better. */

function fragments(text) {
  const out = [];
  for (const m of text.matchAll(/href="[^"]*#([A-Za-z][\w-]*)"/g)) out.push(m[1]);
  return out;
}

function definedIds(text) {
  const out = [];
  for (const m of text.matchAll(/\bid="([A-Za-z][\w-]*)"/g)) out.push(m[1]);
  return out;
}

test("every in-page anchor points at an id that exists", () => {
  /* Ids are collected across the whole source tree rather than per-file: a
     section id lives in app/page.tsx while the link to it lives in
     components/cinema/CinematicHero.tsx, and both render into one document. */
  const ids = new Set();
  for (const f of sources) for (const id of definedIds(readFileSync(f, "utf8"))) ids.add(id);

  const dead = [];
  for (const file of sources) {
    for (const frag of fragments(readFileSync(file, "utf8"))) {
      if (!ids.has(frag)) dead.push(`${relative(ROOT, file)} -> #${frag}`);
    }
  }
  assert.deepEqual(
    dead,
    [],
    `Anchors pointing at an id that does not exist:\n  ${dead.join("\n  ")}`,
  );
});

/* ---------- 3. the routes a stranger must be able to reach ---------- */

/* These are the funnel. If any one of them stops existing, acquisition breaks
   silently, which is precisely what happened to Jobright. Listed by hand rather
   than derived, so deleting a route fails this test instead of shrinking the
   list it is checked against. */
const CRITICAL_ROUTES = ["/", "/try", "/login", "/start", "/install", "/privacy"];

test("the acquisition funnel routes all exist", () => {
  for (const r of CRITICAL_ROUTES) {
    assert.ok(routeExists(r), `critical route missing: ${r}`);
  }
});

/* ---------- 4. the homepage's primary CTAs actually go somewhere ---------- */

test("homepage pillar CTAs point at real /try steps", () => {
  const home = readFileSync(join(APP, "page.tsx"), "utf8");
  const steps = [...home.matchAll(/href="\/try\?step=([a-z]+)"/g)].map((m) => m[1]);

  assert.ok(steps.length >= 3, `expected the three pillar CTAs, found ${steps.length}`);

  /* The step names must be ones TrySimulator will actually honour. Its deep-link
     allowlist is the source of truth; a CTA naming a step outside it silently
     drops the visitor on the chooser, which is the quiet version of a dead
     link and would never show up in a build. */
  const sim = readFileSync(join(ROOT, "components/try/TrySimulator.tsx"), "utf8");
  const allow = sim.match(/const deepLink = \(\[([^\]]+)\]/);
  assert.ok(allow, "could not find TrySimulator's deep-link allowlist");
  const allowed = [...allow[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);

  for (const s of steps) {
    assert.ok(
      allowed.includes(s),
      `/try?step=${s} is not in TrySimulator's allowlist [${allowed.join(", ")}]`,
    );
  }
});

/* ---------- 5. every #anchor a link points at exists on the page ---------- */

test("internal #anchors resolve to a real id on the homepage", () => {
  /* Check 1 above deliberately strips the hash, so it proves "/" exists and
     says nothing about whether "#pricing" does. An anchor that points at no id
     is a link that silently does nothing, which is the same failure as a 404
     with none of the evidence: no error, no redirect, the page just sits
     there. Two new anchors shipped on 2026-07-28 (#pricing, #dashboard) and
     nothing but this test would have caught a typo in either. */
  /* The homepage's ids are no longer all in page.tsx. When the packet demo
     moved into the hero frame, the #product section it used to open went away
     and id="product" moved onto the hero wrapper in CinematicHero, which
     page.tsx renders. Scanning page.tsx alone reported the header's "Product"
     link as broken while it resolved correctly in the browser, so the id
     sources track the render tree rather than one file. Any future component
     that owns a homepage anchor target belongs in this list. */
  const idSources = [
    join(APP, "page.tsx"),
    join(ROOT, "components/cinema/CinematicHero.tsx"),
  ];
  const ids = new Set(
    idSources.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/id="([a-z-]+)"/g)].map((m) => m[1])
    )
  );

  const sources = [join(APP, "page.tsx"), join(ROOT, "components/Header.tsx")];
  const anchors = new Set();
  for (const file of sources) {
    /* Both spellings of the same link: the JSX attribute `href="/#faq"` and the
       object-literal `href: "/#faq"`. The header now declares its four
       destinations once as data and renders that list twice (pill nav and phone
       sheet), so an attribute-only pattern would have quietly stopped checking
       the header's anchors while still passing on the homepage's. */
    for (const m of readFileSync(file, "utf8").matchAll(/href[=:]\s*"\/#([a-z-]+)"/g)) {
      anchors.add(m[1]);
    }
  }

  assert.ok(anchors.size > 0, "expected homepage anchor links to exist");
  for (const anchor of anchors) {
    assert.ok(ids.has(anchor), `href="/#${anchor}" has no matching id on the homepage`);
  }
});

/* ---------- 5. every shipped page is reachable by clicking ---------- */

/* Sections 1 and 2b ask "does every link land somewhere?". This asks the
 * mirror question, which is the one nobody was asking: "does every page have a
 * link pointing AT it?". A route that ships, renders and 200s but appears in no
 * navigation at any width is invisible to anyone who is not typing URLs, and
 * unlike a 404 it produces no error anywhere to notice.
 *
 * Raised 2026-08-03 against /litos-vs-simplify and /for-career-centres. The
 * first pass closed it as a false premise, because the homepage footer does
 * link both. That closure was wrong, and this comment used to carry the wrong
 * version of it: counting a link is not the same as counting the pages the link
 * renders on. Each route had exactly one inbound link, in a footer that lived
 * inline in app/page.tsx and therefore rendered on the homepage and nowhere
 * else, while <Header /> rendered on ten routes and carried neither. From /try
 * or /browse-jobs there was no click path at all.
 *
 * Fixed 2026-08-04 by lifting that same footer into components/SiteFooter.tsx
 * and rendering it on the marketing routes that had no footer. No link was
 * added, removed or promoted into the header; the footer simply renders where
 * the header does. Section 5b below pins the result page by page, which is the
 * assertion whose absence let the wrong closure stand.
 *
 * "Reachable" means a literal internal href in the SHIPPED source of app/ or
 * components/, comments stripped. That qualifier is the whole difference
 * between this test working and this test lying: the first version of it read
 * raw source, so deleting the real footer <li> and leaving any commented-out
 * href="/litos-vs-simplify" anywhere in the tree kept it green. This repo
 * comments its deletions heavily and quotes what it deleted while doing so, so
 * that is not a hypothetical, it is the house style. A route counts as reachable
 * only if the link RENDERS.
 *
 * Footer counts: it is site navigation. Header placement is a positioning
 * question this test has no opinion about, deliberately, because it has no
 * right answer.
 *
 * This sweep stays tree-wide on purpose: for a brand new route, one link
 * anywhere is the bar, and demanding site-wide chrome for every page would be
 * the wrong default. Section 5b is where the stricter claim lives.
 */

/* Shipped source: comments removed, so an assertion about what the site LINKS
   cannot be satisfied by a comment mentioning the link. Same helper, same
   argument, as shippedCopy() in tests/review-highlighting.test.mjs.

   Used by section 5 only, deliberately. Sections 1 and 2b ask the opposite
   question, "does this href resolve?", and there a commented-out href pointing
   at a deleted route is still worth failing on, because it is about to be
   uncommented by whoever is reading that comment. */
function shippedSource(text) {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

/* Routes that legitimately have no inbound link, each with the reason it is
   exempt. Kept explicit and short, so adding a route to it is a decision
   somebody has to write down rather than a pattern that waves it through. */
const UNLINKED_BY_DESIGN = new Map([
  /* The Chrome Web Store listing is the real install destination, and every
     CTA points there via InstallLink/STORE_URL. /install is the fallback page
     for people who reach it from the extension itself or from a QR code. */
  ["/install", "install CTAs point at STORE_URL; this route is the off-site fallback"],
  /* Onboarding, entered by redirect and not by link: app/login/page.tsx does
     router.replace("/start") for a new account, and google-session.ts routes a
     first-time Google sign-in there. Nothing should link to it, since arriving
     without a session is the one way to see it broken. robots.ts disallows it
     for the same reason. */
  ["/start", "post-sign-in redirect target, never a link; see app/login/page.tsx"],
  ["/billing/return", "hosted checkout return target, reached only after the payment provider redirects"],
  ["/maintenance", "direct preview of the deploy-flag maintenance screen, never public navigation"],
  /* Internal QA harnesses. Linking them from a public surface is the bug. */
  ["/qa/packet", "internal QA harness, must not be linked from a public surface"],
  ["/qa/packet/dashboard", "internal QA harness, must not be linked from a public surface"],
  ["/qa/waiting-on-you", "internal QA harness, must not be linked from a public surface"],
  ["/qa/portal-submission", "internal QA harness, must not be linked from a public surface"],
  ["/qa/portal-submission/[board]/[case]", "internal QA harness, must not be linked from a public surface"],
  /* The 404 for a mistyped /dashboard address. Nothing can link to it by definition: it is reached
     by typing a path that is not a page. It exists because an unmatched URL under /dashboard would
     otherwise fall to the root app/not-found.tsx, which renders the marketing header and a "Get
     started" button at someone who is signed in. Measured on 2026-08-08 with /dashboard/account,
     which nothing in this codebase links to and which reads as having been signed out. */
  ["/dashboard/[...unknown]", "404 catch-all; reached by typing a path, never by a link"],
]);

test("every shipped route is either linked from somewhere or exempt on purpose", () => {
  const linked = new Set();
  for (const file of sources) {
    for (const href of internalHrefs(shippedSource(readFileSync(file, "utf8")))) {
      linked.add(href.length > 1 ? href.replace(/\/$/, "") : href);
    }
  }

  const orphans = [...routes].filter(
    (r) => r !== "/" && !linked.has(r) && !UNLINKED_BY_DESIGN.has(r),
  );

  assert.deepEqual(
    orphans,
    [],
    `Routes that ship but nothing links to. Add a link, or add the route to\n` +
      `UNLINKED_BY_DESIGN with the reason:\n  ${orphans.join("\n  ")}`,
  );
});

/* ---------- 5b. reachable FROM SOMEWHERE ELSE, not just from the homepage ---------- */

/* The assertion that had to exist and did not.
 *
 * Its predecessor read app/page.tsx and components/Header.tsx and passed if
 * either mentioned the route. That is satisfied by one link on one page, which
 * is exactly the state ISSUE-026 was reopened over, so it went green through
 * the entire defect and could not have gone red. The gap is not "is there a
 * link" but "can a visitor who is not on the homepage get there by clicking".
 *
 * So this resolves the render tree instead of grepping a file. For a given
 * page.tsx it collects the hrefs that page renders itself, then follows its
 * "@/..." imports and collects theirs, transitively. A link inside
 * SiteFooter counts for a page only if that page actually renders SiteFooter.
 * Move the footer back inline into app/page.tsx and every route below fails.
 *
 * Comments are stripped at every hop, for the reason in the section header: the
 * <li>s carrying these two routes sit beside long comments that quote the very
 * href they explain, so a raw-source version of this test is green on a tree
 * where the links have been deleted and only the explanation is left. Verified
 * by mutant, not assumed; see the mutant table in the change notes.
 *
 * Deliberately does not check the header. Which chrome carries the link is a
 * positioning call with reasons written down on both sides. This only asks
 * whether a human elsewhere on the site has a path.
 *
 * WHAT THIS TEST CANNOT DO, stated plainly because the first draft of this
 * comment overclaimed it. It reads source text; it does not evaluate the
 * program, so it cannot decide whether a tag that appears in the file actually
 * renders. Three mutants were measured passing with the footer NOT on the page:
 *
 *   {false && <SiteFooter />}          dead branch, tag present
 *   const _unused = <SiteFooter />;    module scope, never returned
 *   {step ? null : <SiteFooter />}     the realistic one, a conditional render
 *
 * All three are green here. That is a property of static analysis, not a bug to
 * be patched: deciding reachability needs the program run, and the honest
 * alternative is a build-and-crawl test, which is a different test with a
 * different cost. What this DOES buy is that the link and the render site have
 * to exist in the same file that claims them, which is what the predecessor
 * assertion failed to require, and which is the shape the actual defect took.
 * The browser check in the change notes is what covers the rest.
 *
 * One known false FAILURE in the other direction: IMPORT_RX matches
 * `import ... from "@/..."` only, so a barrel that re-exports the footer with
 * `export { SiteFooter } from "@/components/SiteFooter"` breaks the chain and
 * fails this test even though the page renders correctly. Measured, not
 * theorised. Left unhandled because there is no barrel in this repo today and a
 * red test on a working tree is a loud, five-minute fix; if one is introduced,
 * extend IMPORT_RX to match the export form rather than deleting the test. */

/* Captures the imported bindings as well as the module, because an import on
   its own proves nothing. The first version of this walker followed every
   "@/..." import, and a mutant caught it out immediately: deleting
   <SiteFooter /> from app/try/page.tsx while leaving the now-unused import line
   kept the test green, which is the same shape of lie as satisfying it with a
   comment. An import is only followed when one of the names it binds is
   actually used as a JSX tag in the shipped source.

   That is "named as a tag", which is strictly weaker than "renders". See the
   three measured survivors in the section header: this closes the stale-import
   hole and nothing more. */
const IMPORT_RX = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+"(@\/[^"]+)"/g;

function boundNames(clause) {
  return [...clause.matchAll(/[A-Za-z_$][\w$]*/g)]
    .map((m) => m[0])
    .filter((n) => n !== "as" && n !== "type" && n !== "default");
}

function rendersTag(text, name) {
  return new RegExp(`<${name}[\\s/>]`).test(text);
}

function resolveAlias(spec) {
  const base = join(ROOT, spec.replace(/^@\//, ""));
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    try {
      if (statSync(base + ext).isFile()) return base + ext;
    } catch {
      /* not this extension */
    }
  }
  return null;
}

/* Every literal internal href a route renders, following local component
   imports. Cycles are impossible in an import graph Next.js can build, but the
   seen-set makes that assumption cheap rather than load-bearing. */
function hrefsRenderedBy(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const shipped = shippedSource(readFileSync(file, "utf8"));
  const out = new Set(internalHrefs(shipped));
  for (const m of shipped.matchAll(IMPORT_RX)) {
    if (!boundNames(m[1]).some((n) => rendersTag(shipped, n))) continue;
    const resolved = resolveAlias(m[2]);
    if (!resolved) continue;
    for (const href of hrefsRenderedBy(resolved, seen)) out.add(href);
  }
  return out;
}

/* The marketing pages a visitor can be standing on that are NOT the homepage.
   Each must offer a click path to both audience pages, or the pages are only
   findable by people who already arrived at the front door. */
const IN_APP_MARKETING_ROUTES = [
  "browse-jobs",
  "try",
  "terms",
  "privacy",
  "contact",
  "litos-vs-simplify",
  "for-career-centres",
];

const AUDIENCE_ROUTES = ["/litos-vs-simplify", "/for-career-centres"];

test("both audience pages are reachable by clicking from inside the site, not only from the homepage", () => {
  const missing = [];
  for (const route of IN_APP_MARKETING_ROUTES) {
    const file = join(APP, route, "page.tsx");
    const rendered = hrefsRenderedBy(file);
    for (const target of AUDIENCE_ROUTES) {
      /* A page linking to itself is not a path anywhere, so it is not asked
         for. Every other pairing is. */
      if (`/${route}` === target) continue;
      if (!rendered.has(target)) missing.push(`/${route} -> ${target}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `Pages with no click path to an audience page. The site footer is what\n` +
      `carries these; check the page renders <SiteFooter />:\n  ${missing.join("\n  ")}`,
  );
});

test("the homepage is not the only page that renders the site footer", () => {
  /* The single fact the previous closure got wrong, pinned directly so it
     cannot be re-argued from a link count. If the footer is ever inlined into
     one page again, this fails before the pairing sweep above does, and says
     why. */
  const renderers = sources.filter(
    (f) =>
      /(^|\/)page\.tsx$/.test(f) &&
      /<SiteFooter\b/.test(shippedSource(readFileSync(f, "utf8"))),
  );
  assert.ok(
    renderers.length > 1,
    `the site footer renders on ${renderers.length} page(s). It is site ` +
      `navigation; a footer on one page is not navigation.`,
  );
});

test("the exemption list does not quietly cover a public page", () => {
  /* The escape hatch above is only safe while it stays small. The definition of
     "public" is not re-litigated here: app/sitemap.ts already maintains it, by
     hand and with reasons, and a page that is worth submitting to a search
     engine is by definition one a visitor should be able to click to. So the
     two lists must not intersect. That also means an author cannot silence this
     sweep for a marketing page without first removing it from the sitemap,
     which is a conspicuous thing to have to do. */
  const sitemap = readFileSync(join(APP, "sitemap.ts"), "utf8");
  const publicPaths = new Set(
    [...sitemap.matchAll(/path:\s*"([^"]*)"/g)].map((m) => m[1] || "/"),
  );
  assert.ok(publicPaths.size > 3, "could not read the sitemap's route list");

  for (const route of UNLINKED_BY_DESIGN.keys()) {
    assert.ok(
      !publicPaths.has(route),
      `${route} is in the sitemap, so it is a page meant to be found; ` +
        `link it instead of exempting it from the reachability sweep`,
    );
    assert.ok(routeExists(route), `exempt route ${route} no longer exists; drop it from the list`);
    assert.ok(
      (UNLINKED_BY_DESIGN.get(route) ?? "").length > 20,
      `${route} is exempt with no reason written down`,
    );
  }
});

/* ---------- 6. nothing under /qa/ answers a stranger ---------- */

/* The other half of the exemptions above, and the half that was missing.
 *
 * UNLINKED_BY_DESIGN says the four QA harnesses must not be LINKED from a public surface, and that
 * assertion passed for months while every one of them was SERVED to the public internet. Measured
 * on 2026-08-09: https://trylitos.com/qa/portal-submission?board=ashby&shape=security-code returned
 * 200 to anonymous traffic and rendered a complete fabricated job application headed "Software
 * Engineering Intern, Summer 2027", one shape of which ends on a "Thank you for submitting your
 * application" panel. Not linking a page is not the same as not shipping it, exactly as the section
 * 5 header says in the other direction.
 *
 * The belief at the time was that /qa/ was gated by an environment variable called
 * LITOS_ENABLE_TEST_PORTAL. That variable is real, but it lives in the BACKEND repo and gates
 * whether the backend will treat such a URL as a controlled portal. It has never existed in this
 * project and gated nothing here. The only thing here was app/robots.ts, which is a request made of
 * crawlers.
 *
 * So this section pins both halves: that the decision function refuses an anonymous request, and
 * that every route under app/qa/ actually calls it. The second half is what stops the next harness
 * page from shipping open, which is the way this failed the first time. */

const QA_DIR = join(APP, "qa");
const qaFiles = walk(QA_DIR);
const qaPages = qaFiles.filter((f) => /(^|\/)page\.tsx$/.test(f));
const qaRouteHandlers = qaFiles.filter((f) => /(^|\/)route\.ts$/.test(f));

test("the QA gate 404s an anonymous request in production and stays open in local dev", () => {
  const secret = "L".repeat(48);
  const prod = { VERCEL_ENV: "production", NODE_ENV: "production", LITOS_QA_PORTAL_SECRET: secret };

  /* The measured defect, as an assertion: no key, production, must not be allowed. */
  assert.equal(qaAccessAllowed(undefined, prod), false);
  assert.equal(qaAccessAllowed(null, prod), false);
  assert.equal(qaAccessAllowed("", prod), false);
  assert.equal(qaAccessAllowed("wrong", prod), false);
  assert.equal(qaAccessAllowed(secret.slice(0, -1) + "M", prod), false);
  assert.equal(qaAccessAllowed(secret, prod), true);

  /* Unset secret fails CLOSED anywhere Vercel is running the code, preview included: a preview URL
     is public, and "it is only a preview" is how the fixtures got out the first time. */
  for (const env of [
    { VERCEL_ENV: "production", NODE_ENV: "production" },
    { VERCEL_ENV: "preview", NODE_ENV: "production" },
    { VERCEL_ENV: "development", NODE_ENV: "development" },
    { NODE_ENV: "production" },
  ]) {
    assert.equal(qaAccessAllowed(undefined, env), false, `open with no secret under ${JSON.stringify(env)}`);
    assert.equal(qaAccessAllowed("anything", env), false, `open with no secret under ${JSON.stringify(env)}`);
  }

  /* A secret that is too short or oddly shaped is treated as unset rather than accepted, so
     LITOS_QA_PORTAL_SECRET=1 cannot look like protection. */
  for (const bad of ["1", "short", "L".repeat(31), "L".repeat(129), `${"L".repeat(47)}!`]) {
    const env = { VERCEL_ENV: "production", NODE_ENV: "production", LITOS_QA_PORTAL_SECRET: bad };
    assert.equal(qaAccessAllowed(bad, env), false, `accepted a malformed secret: ${JSON.stringify(bad)}`);
  }

  /* npm run dev keeps working untouched. */
  assert.equal(qaAccessAllowed(undefined, { NODE_ENV: "development" }), true);
});

test("every page under app/qa calls the gate before it renders anything", () => {
  assert.ok(qaPages.length >= 4, `expected the QA harness pages, found ${qaPages.length}`);
  const ungated = [];
  for (const file of qaPages) {
    const shipped = shippedSource(readFileSync(file, "utf8"));
    if (!/\bawait requireQaAccess\(/.test(shipped)) ungated.push(`${relative(ROOT, file)}: no requireQaAccess call`);
    if (!/from "[^"]*\/gate"/.test(shipped)) ungated.push(`${relative(ROOT, file)}: does not import app/qa/gate`);
    /* A page Next can prerender answers from the build's environment forever, which is not a gate.
       requireQaAccess reads headers() and opts out on its own, but that is a side effect one
       refactor away from disappearing, so each page states it. */
    if (!/export const dynamic = "force-dynamic"/.test(shipped)) {
      ungated.push(`${relative(ROOT, file)}: no force-dynamic, so the gate could be prerendered past`);
    }
  }
  assert.deepEqual(
    ungated,
    [],
    `QA pages that a stranger can reach. Every page under app/qa must start with\n` +
      `await requireQaAccess(searchParams):\n  ${ungated.join("\n  ")}`,
  );
});

test("every route handler under app/qa checks the gate", () => {
  assert.ok(qaRouteHandlers.length >= 1, "expected at least the security-code route handler");
  const ungated = [];
  for (const file of qaRouteHandlers) {
    const shipped = shippedSource(readFileSync(file, "utf8"));
    if (!/if \(!qaRequestAllowed\(request\)\) notFound\(\);/.test(shipped)) {
      ungated.push(relative(ROOT, file));
    }
  }
  assert.deepEqual(
    ungated,
    [],
    `QA route handlers that answer anyone:\n  ${ungated.join("\n  ")}`,
  );
});

test("the gate's contract names are the ones the harness is told to send", () => {
  /* The harness in the backend repo (scripts/trial-portal-shapes.mts) appends these by literal
     name. Renaming either here without renaming it there is a silent 404 on every managed case,
     so the names are pinned rather than merely exported. */
  assert.equal(QA_GATE_PARAM, "litos_qa_key");
  assert.equal(QA_GATE_HEADER, "x-litos-qa-key");
});
