/**
 * The four Home Overview controls, driven by a real click.
 *
 * WHY THIS FILE EXISTS, AND WHY IT CANNOT BE A SOURCE-LEVEL TEST
 * =============================================================
 * ISSUE-042 shipped to production having passed a thorough verification: 22 killed mutations, 5
 * killed predicate probes, heading visibility measured in pixels. It was still dead when a student
 * clicked the button, because every test and every live probe entered /dashboard/applications by
 * HARD-LOADING a URL.
 *
 * In the Next.js App Router a hard load and a client-side navigation are genuinely different code
 * paths. The router renders the incoming route inside a transition BEFORE it commits the new URL,
 * so a first-mount-only read of `window.location.search` samples the OLD location and resolves to
 * "all". `page.goto("/dashboard/applications?state=action")` passes, because there the URL is
 * already correct at first render. A click fails. THAT ASYMMETRY IS THE ENTIRE POINT OF THIS FILE,
 * which is why the goto cases are kept here beside the click cases rather than left implicit.
 *
 * Every other regression test in this repo is static analysis of source text, so it pins the SHAPE
 * of today's implementation rather than its behaviour.
 *
 * BE PRECISE ABOUT WHAT THAT DOES AND DOES NOT BUY, because an earlier draft of this comment
 * overclaimed and the overclaim was believed. tests/application-state-deeplink.regression-1.test.mjs
 * DOES catch a literal reversion: revert the fix in source and `npm test` goes to 644 pass / 2 fail
 * on "the page actually reads its filter from the URL" and "the filter is not read once at mount".
 * That assertion is real and it is load-bearing.
 *
 * What it cannot catch is BEHAVIOUR: a different implementation carrying the same defect, or a
 * correct-looking one that breaks the click path some other way. A mutation that hard-coded the
 * filter while leaving the correct expression behind in a COMMENT stayed green against that suite,
 * and ISSUE-037 shipped green through the whole suite before any such assertion existed. So the
 * honest claim is the narrow one: this is the only artifact that catches this defect class by
 * BEHAVIOUR rather than by source shape.
 *
 * PROOF THAT THIS SPEC CAN SEE THE DEFECT
 * =======================================
 * The defect was temporarily restored in app/dashboard/applications/page.tsx, swapping the
 * useSearchParams-derived filter back for the old first-mount-only initialiser:
 *
 *     const [applicationFilter, setApplicationFilter] =
 *       useState(() => applicationFilterFromSearch(window.location.search));
 *
 * Against that production build, measured on 2026-08-04:
 *   - all four CLICK cases went RED. The URL was right every time and the sentinel survived every
 *     time, so the click genuinely was a client-side transition, and the filter still resolved to
 *     "all". On "all" the ledger does not render at all, so the observed state on all four was: no
 *     ledger section, no filter select, zero rows. Nothing on screen answered the click.
 *   - the GOTO parity case, loading those same four URLs with page.goto, stayed GREEN and read
 *     "Applications that need you"/action/5, "Applications ready to send"/ready/2 and
 *     "Applications you have sent"/submitted/4 exactly as it does on the fixed build.
 * A suite made only of goto would have shipped the defect a second time.
 *
 * CONSTRAINTS THIS FILE HOLDS ITSELF TO
 * =====================================
 *  - No production backend, no database, no real credentials. Every request passes through one
 *    catch-all route: same-origin requests are served by the local `next start`, backend requests
 *    are fulfilled from the fabricated fixture, and anything else is ABORTED and recorded.
 *    `blockedExternal` must be empty at the end of every case, so nothing leaves this machine.
 *  - Production build (`npm run build` then `next start`), never `next dev`, so the transition
 *    behaviour under test is the behaviour that ships.
 *  - `document.visibilityState === "visible"` is asserted before any measurement. A background tab
 *    suspends rAF, ResizeObserver and smooth scrolling, which has already produced two false
 *    findings on this audit.
 *  - Fixture counts are DISTINCT per view (2 ready, 5 needs you, 4 sent, 11 reviewable), so a
 *    filtered list has a unique signature and mere presence cannot be mistaken for correctness.
 *  - A sentinel planted on `window` before the click must SURVIVE the navigation. If it does not,
 *    the browser did a full document load and the case proved nothing about the click path.
 *  - A failing case must leave something to LOOK at. The entire value of this spec is observing
 *    rendered behaviour, and on a CI runner nobody can reproduce the run by hand, so a bare locator
 *    timeout with no picture is close to useless. Every case writes a full-page screenshot, the
 *    serialised DOM and a short context file into test-results/click-path/ on failure, and the whole
 *    run's Playwright trace is saved alongside them.
 *
 * RUN IT WITH:  npm run build && npm run test:click-path
 * Deliberately outside `npm test`: that suite is hundreds of fast static tests and must never
 * depend on a browser binary being present.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

import { BACKEND_ORIGIN, COUNTS, REVIEWABLE_TOTAL, SESSION_TOKEN, STUB } from "./fixture-data.mjs";

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
/* 127.0.0.1, not localhost. The applications page treats hostname "localhost" plus a ?qa parameter
   as its canned-fixture mode; running off the loopback IP keeps that door shut by construction. */
const ORIGIN = `http://127.0.0.1:${port}`;

const server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "ignore", "inherit"],
});
await waitForServer(ORIGIN, server);

const browser = await chromium.launch();
const context = await browser.newContext({
  /* Wide enough for the ledger's desktop table. Below lg the same rows render as a scrolling chip
     strip instead, and the row count would be measuring a different control. */
  viewport: { width: 1280, height: 900 },
});

/** Every non-localhost request that got aborted. Asserted empty by every case. */
const blockedExternal = [];
/** Backend paths the stub had no canned answer for. Fails the last case rather than passing `{}`. */
const unstubbedBackendPaths = new Set();

await context.route("**/*", async (route) => {
  const url = route.request().url();
  if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
    await route.continue();
    return;
  }
  if (url.startsWith(BACKEND_ORIGIN)) {
    const path = new URL(url).pathname;
    const body = STUB[path];
    if (body === undefined) unstubbedBackendPaths.add(path);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body ?? {}) });
    return;
  }
  blockedExternal.push(url);
  await route.abort();
});

/* Runs before any page script on every navigation, so a session exists by the time the dashboard
   layout's auth guard reads it. A fabricated string; it is never sent anywhere real. */
await context.addInitScript((token) => {
  window.localStorage.setItem("rq_token", token);
  window.localStorage.setItem("rq_email", "fixture@example.invalid");
  window.localStorage.setItem("litos_session_mode_v1", "verified");
  window.localStorage.setItem("litos_has_history_v1", "true");
}, SESSION_TOKEN);

/* Started before the first case and only ever WRITTEN OUT on failure, so a green run leaves no
   megabytes behind and a red one leaves a scrubbable recording of every click. */
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

const page = await context.newPage();
page.on("pageerror", (reason) => {
  throw new Error(`uncaught error on the page under test: ${reason}`);
});

const ARTIFACT_DIR = path.join(process.cwd(), "test-results", "click-path");
let anyFailure = false;

/**
 * Leave evidence.
 *
 * The first failure of this spec will almost certainly happen on a runner, where nobody can open
 * the page and look. A locator timeout on its own does not say whether the route errored, the
 * fixture went stale, the layout bounced to /login, or the control genuinely did nothing, and all
 * four have already happened at least once while this file was being written.
 */
async function captureFailure(label, reason) {
  anyFailure = true;
  const slug = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${slug}.png`), fullPage: true });
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.html`), await page.content());
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.txt`), [
      `case:      ${label}`,
      `url:       ${page.url()}`,
      `visibility ${await page.evaluate(() => document.visibilityState).catch(() => "unknown")}`,
      `sentinel:  ${await page.evaluate(() => window.__clickPathSentinel ?? null).catch(() => "unknown")}`,
      `blocked:   ${JSON.stringify(blockedExternal)}`,
      `unstubbed: ${JSON.stringify([...unstubbedBackendPaths])}`,
      "",
      String(reason?.stack ?? reason),
      "",
    ].join("\n"));
  } catch (captureFault) {
    /* Never let the evidence gathering replace the real failure. */
    process.stderr.write(`could not capture artifacts for "${label}": ${captureFault}\n`);
  }
}

/** Every case runs through here, so no failure can escape without leaving a picture behind. */
function browserTest(name, body) {
  test(name, async () => {
    try {
      await body();
    } catch (reason) {
      await captureFailure(name, reason);
      throw reason;
    }
  });
}

test.after(async () => {
  if (anyFailure) {
    await mkdir(ARTIFACT_DIR, { recursive: true }).catch(() => {});
    await context.tracing.stop({ path: path.join(ARTIFACT_DIR, "trace.zip") }).catch(() => {});
    process.stderr.write(`\nclick-path artifacts written to ${ARTIFACT_DIR}\n`);
  } else {
    await context.tracing.stop().catch(() => {});
  }
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
});

const TRACKER = 'section[aria-labelledby="applications-summary"]';
const LEDGER = 'section[aria-labelledby="application-ledger-heading"]';

/** Heading, filter value and row count, read off the Tracker the way a student sees them. */
async function readLedger() {
  await page.locator(LEDGER).waitFor({ state: "visible", timeout: 15_000 });
  const heading = (await page.locator("#application-ledger-heading").textContent())?.trim();
  const select = await page.locator("#application-filter").inputValue();
  /* :visible matters. Below lg the same packets render again as a horizontally scrolling chip
     strip, and counting the DOM blind would double every number. */
  const rows = await page.locator(`${LEDGER} button[aria-pressed]:visible`).count();
  const counter = (await page.locator(`${LEDGER} span.font-mono`).first().textContent())?.trim();
  return { heading, select, rows, counter };
}

/** Land on Home with the fixture loaded and a sentinel planted on window. */
async function openHome() {
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.locator(TRACKER).waitFor({ state: "visible", timeout: 15_000 });
  await page.evaluate(() => { window.__clickPathSentinel = "planted"; });
  assert.equal(
    await page.evaluate(() => document.visibilityState),
    "visible",
    "the page must be foregrounded: a background tab suspends rAF, ResizeObserver and smooth scrolling",
  );
}

/** A control inside the Tracker column, matched on its own text and required to be unique.
 *
 * Still text-matched, and deliberately so: the three tiles are matched on their METRIC LABELS
 * ("Ready", "Needs you", "Sent"), which are the same strings the fixture-signature case above
 * asserts against. Those labels are the vocabulary of the feature rather than prose about it, so
 * pinning them is the point. If one of them changes, a test that no longer mentions it is a test
 * that stopped describing the product. */
function trackerControl(text) {
  return page.locator(TRACKER).getByRole("link").filter({ hasText: text });
}

/* The action banner, matched by STRUCTURE rather than by its words.
 *
 * This is the one place in this file that breaks the match-what-a-student-reads rule, so here is
 * the reasoning rather than just the exception.
 *
 * The banner's copy has now broken this spec twice. ISSUE-042-era copy read "Finish the missing
 * answers"; 8ea7edd renamed it to "Review the stopped applications" for a CAPTCHA stall, which is
 * the more accurate line. Both renames were correct product decisions, and both turned this file
 * red without a single thing having changed about the click path it exists to protect. A selector
 * that fails on an IMPROVEMENT to the copy is not testing the student's click, it is taxing the
 * writer, and the failure it produces ("must resolve to exactly one control") points at the test
 * rather than at anything a reader can act on.
 *
 * The tiles above keep their text match because their labels ARE the assertion. The banner's
 * detail line is prose: it explains the same href the "Needs you" tile already carries. There is
 * nothing about the click path that the exact wording proves.
 *
 * Why `>` and not just the href: the "Needs you" tile points at this identical URL, so href alone
 * matches two links and the exactly-one assertion fails. The banner is the only link that is a
 * DIRECT child of the column's section - "View all" sits inside the heading row's div, the three
 * tiles inside the metrics grid - so the child combinator is what separates them. That is a claim
 * about OverviewColumn's markup, and if someone reparents the banner this locator goes to zero and
 * the exactly-one assertion fails loudly, which is the correct outcome: the banner moving IS a
 * change to the click path, unlike the banner being reworded. */
function trackerBanner() {
  return page.locator(`${TRACKER} > a[href="/dashboard/applications?state=action"]`);
}

const CASES = [
  {
    name: "the action banner",
    control: trackerBanner,
    url: "/dashboard/applications?state=action",
    heading: "Applications that need you",
    select: "action",
    rows: COUNTS.action,
  },
  {
    name: 'tile "Ready"',
    control: () => trackerControl("Ready"),
    url: "/dashboard/applications?state=ready",
    heading: "Applications ready to send",
    select: "ready",
    rows: COUNTS.ready,
  },
  {
    name: 'tile "Needs you"',
    control: () => trackerControl("Needs you"),
    url: "/dashboard/applications?state=action",
    heading: "Applications that need you",
    select: "action",
    rows: COUNTS.action,
  },
  {
    name: 'tile "Sent"',
    control: () => trackerControl("Sent"),
    url: "/dashboard/applications?state=submitted",
    heading: "Applications you have sent",
    select: "submitted",
    rows: COUNTS.submitted,
  },
];

browserTest("the fixture gives each Overview view a distinct signature", async () => {
  await openHome();
  const tracker = (await page.locator(TRACKER).textContent()) ?? "";
  assert.match(tracker, new RegExp(`${COUNTS.ready}Ready`), "Ready tile should print the fixture's ready count");
  assert.match(tracker, new RegExp(`${COUNTS.action}Needs you`), "Needs you tile should print the fixture's action count");
  assert.match(tracker, new RegExp(`${COUNTS.submitted}Sent`), "Sent tile should print the fixture's submitted count");
  assert.notEqual(COUNTS.ready, COUNTS.action);
  assert.notEqual(COUNTS.ready, COUNTS.submitted);
  assert.notEqual(COUNTS.action, COUNTS.submitted);
  assert.deepEqual(blockedExternal, []);
});

for (const item of CASES) {
  browserTest(`CLICK: ${item.name} filters the Tracker`, async () => {
    await openHome();

    const control = item.control();
    assert.equal(await control.count(), 1, `${item.name} must resolve to exactly one control on Home`);
    await control.waitFor({ state: "visible", timeout: 10_000 });
    await control.click();
    await page.waitForURL(`${ORIGIN}${item.url}`, { timeout: 15_000 });

    /* The whole reason this file exists. If the sentinel is gone the browser did a full document
       load, which is the code path that has always passed and the one students never take. */
    assert.equal(
      await page.evaluate(() => window.__clickPathSentinel ?? null),
      "planted",
      `${item.name} navigated by hard load, not by a client-side transition: this case proved nothing`,
    );
    assert.equal(await page.evaluate(() => document.visibilityState), "visible");

    const ledger = await readLedger();
    assert.equal(ledger.heading, item.heading, `${item.name}: heading`);
    assert.equal(ledger.select, item.select, `${item.name}: filter select value`);
    assert.equal(ledger.rows, item.rows, `${item.name}: row count`);
    assert.equal(ledger.counter, `${item.rows} of ${REVIEWABLE_TOTAL}`, `${item.name}: "N of M" counter`);
    assert.deepEqual(blockedExternal, [], "no request may leave this machine");
  });
}

/* The contrast case. These four URLs are the ones a hard load has ALWAYS got right, including on
   the shipped-broken build. Keeping it in the suite records the asymmetry instead of relying on a
   note about it: if this ever goes red at the same time as the click cases, the fault is in the
   fixture or the harness rather than in the transition. */
browserTest("GOTO parity: the same four URLs also work on a hard load", async () => {
  for (const item of CASES) {
    await page.goto(`${ORIGIN}${item.url}`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.evaluate(() => document.visibilityState), "visible");
    const ledger = await readLedger();
    assert.equal(ledger.heading, item.heading, `goto ${item.url}: heading`);
    assert.equal(ledger.select, item.select, `goto ${item.url}: filter select value`);
    assert.equal(ledger.rows, item.rows, `goto ${item.url}: row count`);
  }
  assert.deepEqual(blockedExternal, []);
});

browserTest("nothing reached the network and nothing reached a real backend", async () => {
  assert.deepEqual(blockedExternal, [], "external requests were attempted during this run");
  assert.deepEqual([...unstubbedBackendPaths], [], "a backend path was hit with no canned answer");
});
