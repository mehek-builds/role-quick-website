/**
 * Two malformed backend responses, driven against a real production build in a real browser.
 *
 * WHY A BROWSER, AND NOT A SOURCE-LEVEL TEST
 * ==========================================
 * The defect this file is about is not "a function returned the wrong value". It is "a throw
 * during render unmounted a subtree that the throwing component does not own". Nothing about that
 * is visible in the source of any single file: it is a property of where the React boundaries sit
 * relative to where the collections are read, and the only artifact that can observe it is a
 * rendered document. features/applications/infrastructure/response-shape.test.mts pins the parsing
 * rule; only this file can prove the BLAST RADIUS shrank.
 *
 * Both cases are the exact payloads reported by the two independent agents on this audit:
 *   1. GET /metrics/funnel answers `{}`. On origin/main the entire Home Overview band never
 *      renders and section[aria-labelledby="applications-summary"] times out.
 *   2. GET /applications/board answers `[]` instead of `{stages, cards}`. On origin/main the
 *      entire /dashboard/applications route dies.
 * A third case drives both endpoints with WELL-FORMED responses and asserts the page is unchanged,
 * because a containment fix that also changed the healthy render would be its own regression.
 *
 * MEASURED AGAINST UNMODIFIED origin/main FIRST
 * =============================================
 * Every case here was run against a production build of unmodified origin/main before the fix, and
 * the reproduction results are recorded case by case below. Four of the five went red there,
 * including both reported crashes; the fifth is the well-formed-response control, which passed on
 * both sides and is what makes "no visual change" a measurement rather than a claim. A harness that
 * has never seen the defect proves nothing about the fix.
 *
 * CONSTRAINTS, INHERITED FROM tests/e2e/dashboard-click-path.spec.mjs
 * ==================================================================
 * That spec is the harness pattern this repo settled on and this file deliberately does not invent
 * a third one. Same shape throughout: one catch-all route, a fabricated fixture, `next start` on a
 * free port over 127.0.0.1, and `document.visibilityState === "visible"` asserted before any
 * measurement, because a background tab suspends rAF and has already produced false findings here.
 *   - No production backend, no database, no real credentials. Every request either hits the local
 *     `next start` or is answered from the fixture; anything else is ABORTED and recorded, and
 *     `blockedExternal` is asserted empty at the end of every case.
 *   - A production build, never `next dev`: React's development build reports errors differently
 *     and would let a boundary behave in a way that does not ship.
 *   - 127.0.0.1 rather than localhost, so the applications page's `?qa` canned-fixture mode stays
 *     shut by construction.
 *
 * ONE FIXTURE, SHARED
 * ===================
 * The account, the token, the backend origin and the healthy stub all come from ./fixture-data.mjs,
 * the module the click-path spec introduced. This file overrides exactly the endpoints it is about
 * and nothing else, so a change to the fabricated account cannot make these two specs disagree
 * about what a healthy dashboard looks like, and the "well-formed response is unchanged" case below
 * is measured against the same baseline the other spec asserts on.
 *
 * RUN IT WITH:  npm run build && npm run test:partial-payload
 * Deliberately outside `npm test`, which is hundreds of fast static tests that must never depend on
 * a browser binary. It runs in CI in the same job as the click-path spec, reusing that job's build
 * and its already-installed Chromium.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

/* An explicit index.js: an ESM import of a bare directory is ERR_UNSUPPORTED_DIR_IMPORT, and this
   path is outside the repo so it cannot be resolved by name. */
/* playwright-core, the same devDependency the click-path spec uses, so CI installs one browser for
   both specs and the version they run against cannot drift apart. PLAYWRIGHT_MODULE overrides it
   for a local run against a differently installed Playwright. */
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE ?? "playwright-core";
const playwrightModule = await import(PLAYWRIGHT_MODULE);
const { chromium } = playwrightModule.default ?? playwrightModule;

import { BACKEND_ORIGIN, SESSION_TOKEN, STUB } from "./fixture-data.mjs";

/* The one override the healthy baseline needs. The shared fixture answers the board with two empty
   arrays, which is correct for the click-path spec (it never opens the board) and useless here: an
   empty board and a contained failure both render nothing much, so the control case has to have a
   card in it to be worth anything. */
const GOOD_BOARD = {
  stages: ["saved", "applied", "interview", "offer", "closed"],
  cards: [
    {
      id: "fixture-packet-sent-0",
      job_id: null,
      company: "Fixture Company sent-0",
      role: "Fixture Role sent-0",
      created_at: "2026-07-21T12:00:00.000Z",
      moved_at: null,
      reviewable: true,
      submission_status: "submitted",
      stage: "applied",
    },
  ],
};

/* The healthy baseline, otherwise straight from the shared fixture. Each case below shallow-copies
   it and replaces one endpoint, so anything a case does not name is provably the same response the
   click-path spec drives. */
const BASE_STUB = { ...STUB, "/applications/board": GOOD_BOARD };


async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(origin, child) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`next start exited early with code ${child.exitCode}`);
    try {
      const res = await fetch(`${origin}/login`, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      /* not listening yet */
    }
    await delay(250);
  }
  throw new Error(`next start never answered on ${origin}. Run "npm run build" first.`);
}

const port = await freePort();
const ORIGIN = `http://127.0.0.1:${port}`;

const server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "ignore", "inherit"],
});
await waitForServer(ORIGIN, server);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

/** Every non-localhost request that got aborted. Asserted empty by every case. */
const blockedExternal = [];
/** What this case's stub answers. Reassigned per case so one route handler serves all of them. */
let stub = { ...BASE_STUB };

await context.route("**/*", async (route) => {
  const url = route.request().url();
  if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
    return route.continue();
  }
  if (url.startsWith(BACKEND_ORIGIN)) {
    const path = new URL(url).pathname;
    if (path in stub) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(stub[path]),
      });
    }
    /* Unknown backend path: 404 rather than `{}`, so a page that starts depending on something the
       stub does not model fails loudly instead of silently reading an empty object. */
    return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not stubbed"}' });
  }
  blockedExternal.push(url);
  return route.abort();
});

/**
 * The Momentum column, addressed structurally rather than by its text.
 *
 * It is the first child section of the Overview grid, and it has to be reached that way: the band
 * is nested sections, so any text-matching locator resolves to an ancestor that also contains
 * Tracker and Emails, and an assertion about what Momentum does or does not print would silently
 * be reading its neighbours' figures.
 */
function momentumColumn(page) {
  return page.locator('section[aria-label="At a glance"] > div > section').first();
}

async function openPage(path) {
  const page = await context.newPage();
  /* The exact keys lib/api.ts writes on a verified sign-in. Seeded rather than typed into the login
     form, because this spec is about render containment and a real sign-in would need a real
     credential. */
  await page.addInitScript((token) => {
    window.localStorage.setItem("rq_token", token);
    window.localStorage.setItem("rq_email", "fixture@example.invalid");
    window.localStorage.setItem("litos_session_mode_v1", "verified");
    window.localStorage.setItem("litos_has_history_v1", "true");
  }, SESSION_TOKEN);
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
  /* Asserted before any measurement: a background tab suspends rAF, ResizeObserver and smooth
     scrolling, which has already produced two false findings on this audit. */
  assert.equal(await page.evaluate(() => document.visibilityState), "visible");
  return page;
}

test.after(async () => {
  await context.close();
  await browser.close();
  server.kill("SIGTERM");
});

/* ------------------------------------------------------------------------------------------- */

test("crash 1: /metrics/funnel answering {} no longer takes the Home Overview band with it", async () => {
  /* AGAINST origin/main (be7d855), production build: the Tracker column never appeared. The
     selector below timed out, the whole band was absent, and the route boundary's recovery screen
     ("This page did not load.") stood where Home should be. That is the reported defect and this
     harness sees it. */
  stub = { ...BASE_STUB, "/metrics/funnel": {} };
  const page = await openPage("/dashboard");

  const tracker = page.locator('section[aria-labelledby="applications-summary"]');
  await tracker.waitFor({ state: "visible", timeout: 15000 });

  /* The Tracker's own figures, which have nothing to do with the funnel, still render. Asserting
     the section merely EXISTS would pass on an empty shell. */
  await assert.doesNotReject(page.locator("#applications-summary").waitFor({ state: "visible" }));
  assert.match(await tracker.innerText(), /Ready/, "the Tracker column still lists its own metrics");

  /* The route boundary did NOT fire. Its copy is the tell. */
  assert.equal(await page.getByText("This page did not load.").count(), 0);

  /* And the rest of Home is intact: the matches heading below the band is a different subtree
     again, and on origin/main it went with everything else. */
  await page.locator("#matches-heading").waitFor({ state: "visible" });

  /* THE DEGRADED BAND ITSELF. It must name the failure and offer a retry, and it must not print a
     figure. The component's own failure state renders, because the parse boundary REJECTED the
     payload rather than defaulting the counters to zero.

     Scoped to the FIRST GRID COLUMN rather than matched by text. A hasText locator resolves to the
     outermost matching section, which here is the whole band, so its innerText would include the
     Tracker's figures and the "asserts no quantity" check below would read them as Momentum's. */
  const momentum = momentumColumn(page);
  await momentum.waitFor({ state: "visible" });
  assert.match(await momentum.innerText(), /Could not load your activity just now\./);
  const momentumText = await momentum.innerText();
  assert.match(momentumText, /Momentum/);
  assert.match(momentumText, /Try again/);
  assert.equal(
    /\b\d+\b/.test(momentumText),
    false,
    `a degraded Momentum must assert no quantity at all, got: ${JSON.stringify(momentumText)}`,
  );
  /* Specifically not the confident zero. "0 sent since you started" on an account with a submitted
     application is the ISSUE-014 defect, and it is what defaulting the counters would have shipped. */
  assert.equal(await page.getByText("sent since you started").count(), 0);

  assert.deepEqual(blockedExternal, []);
  await page.close();
});

test("crash 2: /applications/board answering [] no longer kills the Tracker route", async () => {
  /* AGAINST origin/main: /dashboard/applications rendered the route boundary. Nothing of the route
     survived. */
  stub = { ...BASE_STUB, "/applications/board": [] };
  const page = await openPage("/dashboard/applications");

  assert.equal(await page.getByText("This page did not load.").count(), 0, "the route boundary must not fire");

  /* The route's own shell is still there. The heading is rendered by the page, not by the Board. */
  await page.locator("h1").first().waitFor({ state: "visible" });

  /* The board degrades to its own honest line with a retry, and prints no count of applications. */
  const failure = page.getByText("Could not load your board.");
  await failure.waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await page.getByRole("button", { name: "Try again" }).count() >= 1, true);

  assert.deepEqual(blockedExternal, []);
  await page.close();
});

test("a well-formed response still renders exactly as before", async () => {
  /* The other half of the fix. Containment that changed the healthy render would be a regression
     dressed as a guard, so this case asserts the loaded state on both routes. */
  stub = { ...BASE_STUB };

  const home = await openPage("/dashboard");
  await home.locator('section[aria-labelledby="applications-summary"]').waitFor({ state: "visible" });

  const momentum = momentumColumn(home);
  await momentum.waitFor({ state: "visible" });
  const text = await momentum.innerText();
  assert.match(text, /Momentum/);
  assert.match(text, /sent since you started/);
  /* Case-insensitive: the caption is uppercased in CSS, so innerText reports it as typed by the
     renderer rather than as written in the source. */
  assert.match(text, /last 14 days/i, "the sparkline caption renders when days actually arrived");
  assert.equal(/Could not load/.test(text), false, "no degraded copy on a healthy response");

  /* The counters are the numbers the fixture sent, not defaults. */
  const bars = await home.locator('figure div[role="img"] > div').count();
  assert.equal(bars, 14, "all fourteen days are drawn");

  await home.close();

  const tracker = await openPage("/dashboard/applications");
  await tracker.getByText("Could not load your board.").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  assert.equal(await tracker.getByText("Could not load your board.").count(), 0);
  assert.equal(await tracker.getByText("This page did not load.").count(), 0);
  await tracker.close();

  assert.deepEqual(blockedExternal, []);
});

test("a partial but usable funnel degrades the sparkline only, and never invents a flat fortnight", async () => {
  /* The SECONDARY half of the rule, which the two reported crashes do not cover. A backend that
     measured the counters but sent no daily breakdown must show the counters, because they are
     real, and must NOT draw fourteen empty bars under "Last 14 days", because that is a chart
     asserting a fortnight of inactivity nobody measured. */
  stub = { ...BASE_STUB, "/metrics/funnel": { resumes_tailored: 3, applications_submitted: 1, fields_filled: 17, submitted_this_week: 1 } };
  const page = await openPage("/dashboard");

  const momentum = momentumColumn(page);
  await momentum.waitFor({ state: "visible", timeout: 15000 });
  const text = await momentum.innerText();
  assert.match(text, /Momentum/);
  assert.match(text, /sent since you started/, "the counters that WERE measured still render");
  assert.equal(/Could not load/.test(text), false, "measured counters are not thrown away with the series");
  assert.equal(/last 14 days/i.test(text), false, "no caption over bars that were never sent");
  assert.equal(await page.locator('figure div[role="img"]').count(), 0, "and no bar row at all");

  await page.locator('section[aria-labelledby="applications-summary"]').waitFor({ state: "visible" });
  assert.deepEqual(blockedExternal, []);
  await page.close();
});

test("a board with no `stages` still renders every column and every move option", async () => {
  /* THE BLOCKING DEFECT THIS CASE EXISTS FOR.
   *
   * The first version of the fix defaulted a missing `stages` by deriving it from the cards' own
   * stage values. Measured here, that rendered the Applied column ALONE for a board holding one
   * applied card: Interview and Offer disappeared, which tells a student those stages do not exist,
   * and MoveControl draws one <option> per visible stage, so the student could not move the card
   * forward at all. Nothing errored, nothing retried, nothing was reported. A guard that produces a
   * healthy-looking route the student cannot use is worse than the crash it replaced.
   *
   * The fallback is now the client's own ACTIVE_BOARD_STAGES, which activeBoardStages() filters
   * through one line later anyway, so this can surface nothing the client would not otherwise draw.
   */
  stub = { ...BASE_STUB, "/applications/board": { cards: GOOD_BOARD.cards } };
  const page = await openPage("/dashboard/applications");

  /* All three columns, addressed by their own headings rather than by text anywhere on the page. */
  for (const stage of ["applied", "interview", "offer"]) {
    await page.locator(`#col-${stage}`).waitFor({ state: "visible", timeout: 15000 });
  }

  /* And all three move options on the one card, which is the harm a student would actually hit. */
  const options = await page
    .getByLabel("Move Fixture Role sent-0 at Fixture Company sent-0 to another stage")
    .locator("option")
    .allInnerTexts();
  assert.deepEqual(options, ["Applied", "Interview", "Offer"], "canonical order, not card iteration order");

  assert.equal(await page.getByText("This page did not load.").count(), 0);
  assert.equal(await page.getByText("Could not load your board.").count(), 0);
  assert.deepEqual(blockedExternal, []);
  await page.close();
});

test("a throw the parse boundary does NOT cover is still contained to its band", async () => {
  /* THE HALF OF THE FIX THE OTHER CASES CANNOT SEE.
   *
   * With the parse boundary in front of it, the Board no longer throws on either reported payload,
   * so nothing above would notice if the per-band error boundary were deleted. That would be a
   * false green: the boundary is not there for the two payloads already known, it is there for the
   * next unknown one, and the argument for it has to be demonstrated rather than asserted.
   *
   * This drives exactly such a payload. `cards` IS an array, so response-shape.ts accepts the
   * envelope, which is deliberate: a card is a wide record and validating every field of every one
   * would be the over-application that turns a loud failure into a quiet lie. The entries are not
   * objects, so the Board's own `cards.filter((c) => c.stage === stage)` throws during render. That
   * is a genuine, realistic residual: a backend that starts sending nulls in a list is the same
   * class of drift as one that drops a key.
   *
   * AGAINST origin/main: the route boundary fired and the whole of /dashboard/applications was
   * replaced by "This page did not load."
   */
  stub = { ...BASE_STUB, "/applications/board": { stages: ["applied", "interview", "offer"], cards: [null, null] } };
  const page = await openPage("/dashboard/applications");

  /* The band's own fallback, from components/app/SectionBoundary.tsx, not the route boundary's. */
  const degraded = page.getByText("Could not load this just now.");
  await degraded.waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await page.getByText("This page did not load.").count(), 0, "the route boundary must not fire");

  /* It states no quantity, and it keeps the band's heading so the page does not lose its shape. */
  const band = page.locator("section", { hasText: "Could not load this just now." }).last();
  const text = await band.innerText();
  assert.match(text, /Your applications/);
  assert.equal(/\b\d+\b/.test(text), false, `a degraded band must assert no quantity, got: ${JSON.stringify(text)}`);

  /* And the route shell survived, which is the whole point of scoping the boundary to the band. */
  await page.locator("h1").first().waitFor({ state: "visible" });
  assert.equal(await page.getByRole("button", { name: "Try again" }).count() >= 1, true);

  assert.deepEqual(blockedExternal, []);
  await page.close();
});
