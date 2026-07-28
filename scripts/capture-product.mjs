/* Automated capture of REAL product screenshots for the marketing site.
 *
 * Why this exists
 * ---------------
 * public/product/*.png used to be captured by hand: boot two harnesses, size a
 * window, crop, hide an auth-error banner that only appears because the harness
 * had no backend, paste the pixel dimensions into RealCaptures.tsx. Every step
 * was a chance to drift, and it drifted: the captures had to be redone once
 * already when the fixture roles changed, and the Chrome Web Store assets are
 * STILL half re-rendered, three of them carrying the old RoleQuick indigo.
 *
 * Hand-made assets rot. Generated ones cannot. This script boots both harnesses
 * itself, shoots every frame the site and the store listing need, and writes the
 * dimensions to captures.json so no number is ever typed by a person.
 *
 * What is real here, and what is not
 * ----------------------------------
 * The INTERFACE in every frame is the shipped code. The extension frames render
 * the real components out of student-outreach-extension via its own preview
 * harness (`?shot=`), and the dashboard frames render the real pages out of this
 * repo in localhost QA mode (`?qa=1`). The DATA inside is fixture data: Figma,
 * Marcus Lee, Acme Labs, a made-up applicant. That split is what the captions on
 * the site claim and it is all they claim. Do not add a frame here that a user
 * could not reach in the product.
 *
 * There is one deliberate gap: the autofill actually typing into a live
 * Greenhouse form is NOT captured, because doing it honestly needs a real signed
 * in Chrome against a real posting. The site uses a labelled illustration for
 * that one moment. Do not quietly fill the gap with a mockup rendered here.
 *
 * Usage
 * -----
 *   node scripts/capture-product.mjs            # everything
 *   node scripts/capture-product.mjs --only=hero
 *   node scripts/capture-product.mjs --check    # shoot to a temp dir and diff
 *
 * --check exits non-zero if a committed capture no longer matches what the
 * current code renders, so a UI change that silently invalidates the marketing
 * screenshots can be caught rather than discovered months later on the live
 * site. NOTE: this repo has no CI workflow yet, so nothing runs --check
 * automatically. Until one exists, run `npm run capture:check` before shipping
 * a change to the dashboard or the extension popup.
 */

import { chromium } from "playwright";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXT = join(ROOT, "..", "student-outreach-extension");
const OUT = join(ROOT, "public", "product");
const MANIFEST = join(ROOT, "lib", "captures.json");

/* Ports chosen to miss the real backend on :3001 and a running `next dev` on
   :3000. If you change these, change nothing else: every URL is built from
   them. */
const VITE_PORT = 4710;
const MOCK_PORT = 4711;
const SITE_PORT = 4712;

/* Retina. The site serves these into boxes roughly half their pixel width, so
   2x is what makes them sharp rather than merely large. */
const SCALE = 2;

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];
const check = args.includes("--check");

/* Two `next dev` processes cannot share a .next directory, so if you already
   have the site running (which you usually do while working on the hero) this
   script's own server dies on startup with nothing useful in the log. Point it
   at the one you have instead:
     node scripts/capture-product.mjs --site=http://localhost:3000
   CI passes nothing and gets its own server. */
const siteOrigin = args.find((a) => a.startsWith("--site="))?.split("=")[1];
const site = siteOrigin ?? `http://localhost:${SITE_PORT}`;

/* ---------------------------------------------------------------- the shots */

/* `clip` is in CSS pixels and describes the element to photograph, not the
   window. Every extension shot is the popup's real 380x580 box, because that is
   the only size the popup is ever laid out for.

   `story` marks the frames the hero sequence steps through, in order. The rest
   are supporting frames used further down the page and in the store listing. */
const SHOTS = [
  {
    name: "hero-1-job",
    url: () => `http://localhost:${VITE_PORT}/preview.html?shot=job`,
    clip: { width: 380, height: 580 },
    wait: "#shot",
    story: 1,
    cap: "Litos spots the job",
    note: "Open a job posting. Litos reads it off the page, so there is nothing to paste.",
    alt: "The Litos popup open on a Figma software engineer posting, showing the detected role with a Fill this form button and a Find people button.",
  },
  {
    name: "hero-2-review",
    url: () => `${site}/dashboard/applications?qa=1`,
    viewport: { width: 1280, height: 860 },
    wait: "main",
    /* The list of applications is the least interesting thing on this page.
       The claim the hero is making is "you read it before it goes", so frame
       the posting beside the tailored resume with the match legend above. */
    scrollTo: "text=Point at any highlighted term",
    scrollPad: 96,
    /* Crop to the resume panel alone, at 1:1. The whole two-column review
       screen is 1216px wide and had to be scaled to about 0.8 to fit the hero
       stage, which put its 13px type under 11px: the exact "shrink it to fit,
       then animate the blur" failure. The tailored resume with the posting's
       terms lit up on it IS the claim, and on its own it is legible. */
    element: 'section:has(p:text-is("Your resume for this job"))',
    story: 2,
    cap: "You read it before it goes",
    note: "The resume Litos wrote for this one job. The posting's own words are lit up where your work matches. Change anything before it goes.",
    alt: "The resume Litos built for the Acme Labs product engineer job, with terms from the posting highlighted where the applicant's own work matches them.",
  },
  {
    name: "hero-3-contacts",
    url: () => `http://localhost:${VITE_PORT}/preview.html?shot=contacts`,
    clip: { width: 380, height: 580 },
    wait: "#shot",
    story: 3,
    cap: "It finds people to email",
    note: "Real people at that company, with the ones most likely to write back at the top.",
    alt: "The Litos contacts panel listing four people at Figma, ranked by likelihood of a reply, each marked either Email checked or Email is a guess.",
  },
  {
    name: "hero-4-draft",
    url: () => `http://localhost:${VITE_PORT}/preview.html?shot=draft`,
    clip: { width: 380, height: 580 },
    wait: "#shot",
    story: 4,
    cap: "And writes the email",
    note: "A short email drawn from your own work, ready to send from Gmail.",
    alt: "The Litos draft editor showing a short email to Marcus Lee about the software engineer role, ready to edit before sending.",
  },
  {
    name: "dashboard-emails",
    url: () => `${site}/dashboard/outreach?qa=1`,
    viewport: { width: 1400, height: 933 },
    wait: "main",
    cap: "After you send",
    alt: "The Litos dashboard Emails page, listing drafts that were written, sent, and replied to.",
  },
  /* The Chrome Web Store's required 1280x800. Shooting these from the same run
     is the point: the listing and the homepage can no longer disagree, which is
     the open defect this script closes. */
  ...["onboarding", "main", "contacts"].map((s, i) => ({
    name: `store-${i + 1}-${s}`,
    url: () => `http://localhost:${VITE_PORT}/preview.html?store=${s}`,
    viewport: { width: 1280, height: 800 },
    wait: "main",
    store: true,
  })),
];

/* ------------------------------------------------------------ server plumbing */

const procs = [];
function start(cmd, cwdir, env, label) {
  const p = spawn(cmd[0], cmd.slice(1), {
    cwd: cwdir,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", (d) => process.env.VERBOSE && console.log(`[${label}] ${d}`));
  p.stderr.on("data", (d) => process.env.VERBOSE && console.error(`[${label}] ${d}`));
  procs.push(p);
  return p;
}

async function waitFor(url, label, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${label} did not come up at ${url} within ${timeoutMs}ms`);
}

function shutdown() {
  for (const p of procs) {
    try {
      p.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}
process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

/* ------------------------------------------------------------------- capture */

/* Everything that makes a screenshot non-deterministic, killed in one place:
   animation, caret blink, smooth scroll, and the film's scrub. Without this the
   same code produces a different PNG on every run and --check is useless. */
const FREEZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  /* next dev's floating build badge. Real to the developer, invisible to the
     user, and it landed in the bottom-left of every dashboard capture. */
  nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }
`;

/* POST /jd-match scores a resume against a posting on the backend, so in an
   offline capture run it rejects and the panel renders "We could not work out
   how well you fit this one": a failure state, photographed and put on the
   homepage. Fulfilling the request here keeps the branch honest (the component
   takes its normal success path, exactly as a user sees it) without teaching
   the product code about screenshots. The terms are the Acme Labs fixture's. */
const JD_MATCH_FIXTURE = {
  score: 86,
  scorable: true,
  band: { label: "Strong match", tone: "strong" },
  term_count: 14,
  min_scorable_terms: 6,
  matched: [
    { term: "typescript", display: "TypeScript", weight: 3 },
    { term: "react", display: "React", weight: 3 },
    { term: "postgresql", display: "PostgreSQL", weight: 2 },
    { term: "accessible", display: "accessible", weight: 2 },
    { term: "tested", display: "tested code", weight: 2 },
    { term: "workflow", display: "workflow systems", weight: 2 },
  ],
  missing: [{ term: "nodejs", display: "Node.js", weight: 2 }],
};

/* The gap list asks the experience bank what the applicant has actually done
   about each missing requirement. Offline it renders "We could not check your
   saved work just now", which is the same failure-state-on-the-homepage
   problem. `unsupported: true` is the honest fixture: the applicant has not
   done this one, and the interface says so plainly rather than inventing
   evidence. That is the behaviour worth photographing. */
const GAP_EVIDENCE_FIXTURE = {
  answers: [{ term: "nodejs", display: "Node.js", evidence: [], unsupported: true }],
};

async function shoot(browser, shot, outDir) {
  const page = await browser.newPage({
    viewport: shot.viewport ?? { width: 480, height: 700 },
    deviceScaleFactor: SCALE,
    reducedMotion: "reduce",
    colorScheme: "light",
  });

  const problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(String(e)));

  /* Registered general-then-specific: Playwright matches the most recently
     added route first, so the evidence handler has to come second to win. */
  await page.route("**/jd-match", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(JD_MATCH_FIXTURE) }),
  );
  await page.route("**/jd-match/evidence", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GAP_EVIDENCE_FIXTURE) }),
  );

  await page.goto(shot.url(), { waitUntil: "networkidle", timeout: 60_000 });
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.waitForSelector(shot.wait, { timeout: 30_000 });

  /* Some screens put the part worth photographing below the fold. Scroll to it
     by selector rather than by pixel offset, so the capture survives a copy
     change above it. */
  if (shot.scrollTo) {
    const anchor = page.locator(shot.scrollTo).first();
    await anchor.waitFor({ timeout: 30_000 });
    await anchor.evaluate((el, pad) => {
      const y = el.getBoundingClientRect().top + window.scrollY - pad;
      window.scrollTo(0, Math.max(0, y));
    }, shot.scrollPad ?? 24);
    await page.waitForTimeout(250);
  }
  /* Webfonts land after networkidle often enough to matter: an unpatched run
     photographs the fallback face and the whole capture reads as a different
     product. */
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  /* The harness renders an auth-error banner when a screen fetches without a
     session. Previously a person hid these by hand before capturing. Assert
     instead: if one is on screen, the mock backend is not wired up and the
     capture would be a lie about what the product looks like. */
  const banner = await page
    .locator("text=/session expired|please sign in|failed to load/i")
    .count();
  if (banner > 0) {
    throw new Error(
      `${shot.name}: an auth/error banner is visible. The mock backend is not answering; fix the harness rather than hiding the banner.`,
    );
  }

  /* `element` photographs ONE region of the page at its real size rather than
     the whole viewport.
   *
   * This is the single most important option in the file, and it exists
     because of how these heroes fail. A full 1280px dashboard window shrunk
     into a 1024px stage renders 13px type at about 10px, and then the hero is
     animating pixels nobody can resolve. Every product site that reads as
     credible refuses to shrink: Linear runs its frame off the right edge,
     Attio past the bottom fold, Grammarly and Simplify crop to one widget and
     discard the rest. The bar to clear is that a first-time visitor can read
     one specific, meaningful string within two seconds.

     So: crop to the region that carries the claim, keep it at 1:1, and let the
     stage clip whatever does not fit. */
  const selector = shot.element ?? (shot.clip ? shot.wait : null);
  const target = selector ? page.locator(selector).first() : page;
  const file = join(outDir, `${shot.name}.png`);
  await target.screenshot({ path: file, ...(selector ? {} : { fullPage: false }) });

  /* WebP alongside the PNG, because these land above the fold and the hero
     frame is a live LCP candidate. The film frames are already webp at ~62KB
     for a full-bleed 1080p frame; a 380x580 popup has no business being 86KB.
     Lossless keeps the type crisp — these are UI screenshots, not photographs,
     and lossy webp smears 13px text at exactly the sizes that matter. */
  await sharp(file).webp({ lossless: true, effort: 6 }).toFile(file.replace(/\.png$/, ".webp"));

  /* Measure what was actually shot rather than trusting a hand-written box.
     An `element` region has no declared size, and a stale number here silently
     rescales the capture on the page. */
  let box = shot.clip ?? shot.viewport;
  if (shot.element) {
    const measured = await target.boundingBox();
    if (!measured) throw new Error(`${shot.name}: element ${shot.element} has no box`);
    box = { width: Math.round(measured.width), height: Math.round(measured.height) };
  }
  await page.close();

  if (problems.length && process.env.VERBOSE) {
    console.warn(`  ! ${shot.name} console: ${problems.slice(0, 3).join(" | ")}`);
  }
  /* Dimensions recorded in CSS pixels, which is the aspect ratio the site
     reserves. The PNG on disk is SCALE times this. */
  return { w: box.width, h: box.height };
}

/* ---------------------------------------------------------------------- main */

async function main() {
  const outDir = check ? join(ROOT, ".capture-check") : OUT;
  mkdirSync(outDir, { recursive: true });

  const wanted = SHOTS.filter((s) => {
    if (!only) return true;
    if (only === "hero") return Boolean(s.story);
    if (only === "store") return Boolean(s.store);
    return s.name === only;
  });
  if (!wanted.length) throw new Error(`--only=${only} matched no shots`);

  const needsExt = wanted.some((s) => s.url().includes(`:${VITE_PORT}`));
  const needsSite = wanted.some((s) => s.url().startsWith(site));

  if (needsExt) {
    if (!existsSync(EXT)) throw new Error(`extension repo not found at ${EXT}`);
    console.log("· starting extension preview harness");
    start(["node", "preview/mock-server.mjs"], EXT, { PREVIEW_MOCK_PORT: String(MOCK_PORT) }, "mock");
    start(
      ["npx", "vite", "--port", String(VITE_PORT), "--strictPort"],
      EXT,
      { VITE_API_BASE: `http://localhost:${MOCK_PORT}` },
      "vite",
    );
    await waitFor(`http://localhost:${MOCK_PORT}/track/events`, "mock backend");
    await waitFor(`http://localhost:${VITE_PORT}/preview.html`, "vite");
  }

  if (needsSite && siteOrigin) {
    console.log(`· reusing site at ${site}`);
    await waitFor(`${site}/`, `the site at ${site}`, 20_000);
  } else if (needsSite) {
    console.log("· starting site dev server");
    start(["npx", "next", "dev", "-p", String(SITE_PORT)], ROOT, {}, "next");
    try {
      await waitFor(`${site}/`, "next dev");
    } catch (e) {
      throw new Error(
        `${e.message}\n\nThe usual cause is another \`next dev\` already running: two of them cannot share .next. Stop it, or point this run at it with --site=http://localhost:<port>.`,
      );
    }
  }

  const browser = await chromium.launch();
  const manifest = {};
  for (const shot of wanted) {
    process.stdout.write(`· ${shot.name} `);
    const dims = await shoot(browser, shot, outDir);
    manifest[shot.name] = {
      ...dims,
      src: `/product/${shot.name}.webp`,
      ...(shot.cap ? { cap: shot.cap } : {}),
      ...(shot.note ? { note: shot.note } : {}),
      ...(shot.alt ? { alt: shot.alt } : {}),
      ...(shot.story ? { story: shot.story } : {}),
    };
    console.log(`→ ${dims.width ?? dims.w}x${dims.height ?? dims.h}`);
  }
  await browser.close();

  if (check) {
    const prev = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const drift = [];
    for (const [name, meta] of Object.entries(manifest)) {
      const a = join(OUT, `${name}.png`);
      if (!existsSync(a)) {
        drift.push(`${name}: no committed capture`);
        continue;
      }
      const before = readFileSync(a);
      const after = readFileSync(join(outDir, `${name}.png`));
      if (!before.equals(after)) drift.push(`${name}: pixels changed`);
      if (JSON.stringify(prev[name]) !== JSON.stringify(meta)) drift.push(`${name}: metadata changed`);
    }
    rmSync(outDir, { recursive: true, force: true });
    if (drift.length) {
      console.error(
        `\nCaptures are stale. The product renders differently than the committed screenshots:\n  ${drift.join("\n  ")}\n\nRun: node scripts/capture-product.mjs\n`,
      );
      process.exit(1);
    }
    console.log("\nCaptures match the product.");
    return;
  }

  /* Merge rather than replace, so --only does not silently drop the shots it
     did not take. */
  const existing = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
  writeFileSync(MANIFEST, JSON.stringify({ ...existing, ...manifest }, null, 2) + "\n");
  console.log(`\nWrote ${Object.keys(manifest).length} captures + lib/captures.json`);
}

main()
  .then(() => {
    shutdown();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    shutdown();
    process.exit(1);
  });
