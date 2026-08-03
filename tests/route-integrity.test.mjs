import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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
 * Raised 2026-08-03 against /litos-vs-simplify and /for-career-centres, which
 * turned out to be linked all along, from the homepage footer, and deliberately
 * kept out of the header (reasoning recorded beside both <li>s in app/page.tsx,
 * and in the header's own comment in components/Header.tsx). The finding was
 * wrong but the gap it implied was real: nothing checked. Now something does,
 * and the next route added without a link fails here instead of shipping dark.
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
 * Footer counts: it is site navigation, and the audience arrives on the
 * homepage. Header placement is a positioning question this test has no opinion
 * about, deliberately, because it has no right answer.
 *
 * Worth being precise about what the footer buys, though, because it is less
 * than it sounds: the footer lives inside app/page.tsx and renders on the
 * HOMEPAGE ONLY (components/Header.tsx says the same, at more length, as the
 * reason the phone hamburger came back). So both audience pages are reachable
 * from exactly one page. From /try or /browse-jobs the only route to them is
 * back through the wordmark to the homepage. That is defensible for pages
 * written to be found by search and entered directly, and it is the state this
 * test pins; it is not the same claim as "reachable site-wide".
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
  /* Internal QA harnesses. Linking them from a public surface is the bug. */
  ["/qa/packet", "internal QA harness, must not be linked from a public surface"],
  ["/qa/packet/dashboard", "internal QA harness, must not be linked from a public surface"],
  ["/qa/portal-submission", "internal QA harness, must not be linked from a public surface"],
  ["/qa/portal-submission/[board]/[case]", "internal QA harness, must not be linked from a public surface"],
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

test("the two audience pages are reachable without typing a URL", () => {
  /* Named rather than left to the sweep above, because these two are the ones
     that got filed, and because the sweep would go green again if the footer
     lost them and the header gained them. What matters is that a human can
     click to them, not which chrome carries the link.

     Shipped source on both files, for the reason in the section header: the
     comments beside these two <li>s in app/page.tsx both quote the route they
     sit next to, so read raw, this assertion is satisfied by the comment
     explaining the link even after the link itself is gone. Verified by
     deleting the real <li> and leaving the comment: raw source passes, shipped
     source fails. */
  const home = shippedSource(readFileSync(join(APP, "page.tsx"), "utf8"));
  const header = shippedSource(readFileSync(join(ROOT, "components/Header.tsx"), "utf8"));
  for (const route of ["/litos-vs-simplify", "/for-career-centres"]) {
    assert.ok(
      home.includes(`href="${route}"`) || header.includes(`href="${route}"`),
      `${route} ships but neither the homepage nor the header links to it`,
    );
  }
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
