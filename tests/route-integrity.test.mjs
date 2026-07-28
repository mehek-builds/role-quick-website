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
    for (const m of readFileSync(file, "utf8").matchAll(/href="\/#([a-z-]+)"/g)) {
      anchors.add(m[1]);
    }
  }

  assert.ok(anchors.size > 0, "expected homepage anchor links to exist");
  for (const anchor of anchors) {
    assert.ok(ids.has(anchor), `href="/#${anchor}" has no matching id on the homepage`);
  }
});
