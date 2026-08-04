/**
 * The primary action on /dashboard/applications, measured at the widths real students use.
 *
 * WHAT WENT WRONG, AND WHY IT NEEDS A BROWSER
 * ===========================================
 * "Fill the form" is the product's core action. It is the LAST element of the review screen, which
 * also contains a job description, an editable resume and a cover letter, so at 744x789 that screen
 * is roughly 2,900px and the action is about 2,100px of scrolling away. Two separate things then
 * made it worse, and neither is visible in source:
 *
 *  1. `main` carried `px-4 py-7 pb-24 sm:px-6 sm:py-10 lg:pb-10`. The `pb-24` reserves room for the
 *     mobile tab bar, which is `lg:hidden`. The `sm:py-10` shorthand SILENTLY CANCELLED it from
 *     640px up, while the bar itself stays on screen until 1024px. Measured on 2026-08-04 against
 *     the pre-fix build: from 640px to 1023px, main's padding-bottom was 40px against a 61px bar,
 *     so the last 21px of EVERY dashboard page sat underneath it. On this screen those 21px are
 *     where the action lives. Nothing in the class list looks wrong; you have to measure it.
 *  2. Even with the clearance correct, the action was still at the end of a document whose middle
 *     is an editable resume. Focus lands in a textarea and Page_Down and End go to the textarea,
 *     not the page, so the keyboard route to the action does not work either.
 *
 * The fix is a bottom-sticky action bar below lg (`TerminalActionBar` in components/app/ui.tsx) and
 * one shared `--dashboard-bottom-bar` variable that both the clearance and the sticky offset read,
 * so a shorthand cannot cancel one of them again.
 *
 * WHY THIS IS NOT A SOURCE-SHAPE TEST
 * ===================================
 * Every cheap regression test in this repo asserts on source text, and a source-shape assertion
 * here would pin the class list rather than the outcome. The defect WAS a class list that reads
 * correctly. What has to hold is geometric: the button's rect is inside the viewport and the button
 * is the topmost thing at its own five probe points. Only a browser can say that.
 *
 * PROOF THAT THIS SPEC CAN SEE THE DEFECT
 * =======================================
 * Measured against the pre-fix build on 2026-08-04, with the same fixture, at 744x789:
 *   - with no scrolling the button sat at top 2771 in a 789px viewport, so the "reachable without
 *     scrolling" assertion went RED at every narrow width.
 *   - scrolled to the very end it sat at top 688 / bottom 732 against a tab bar whose top edge is
 *     728, so `occludedByNav` was TRUE and the overlap assertion went RED as well.
 * With the fix both are green at 375x812, 744x789, 900x700 and 1023x800, and the desktop case
 * (1440x1000, where the bar is deliberately static) is green scrolled to the end.
 *
 * A NOTE ON HOW THE ORIGINAL REPORT MIS-MEASURED THIS, so nobody repeats it
 * ========================================================================
 * The report concluded the document "runs out of scroll" because `scrollIntoView({block:'center'})`
 * returned the same rect six calls in a row. `html { scroll-behavior: smooth }` (app/globals.css)
 * makes scrollIntoView ASYNCHRONOUS, and each new call restarts the animation, so reading the rect
 * immediately after reads a position the page is still travelling away from. Reproduced here on
 * 2026-08-04: six calls then an immediate read gave top 2771 and scrollY 0; the same page 1.2s
 * later had scrollY 2083 and the button at top 688. The document scrolls fine. Let the scroll
 * SETTLE before measuring, which is what this spec does.
 *
 * CONSTRAINTS THIS FILE HOLDS ITSELF TO
 * =====================================
 *  - Same as tests/e2e/dashboard-click-path.spec.mjs: production build, no real backend, every
 *    external request aborted and asserted empty, artifacts written on failure.
 *  - 127.0.0.1, never localhost, so the applications page's canned-fixture door (lib/qa-mode.ts)
 *    stays shut by construction and this measures the real render path.
 *  - `document.visibilityState === "visible"` is asserted before any measurement. A background tab
 *    suspends rAF and smooth scrolling and has already produced false findings on this audit.
 *  - The screen under test must actually OVERFLOW the viewport, asserted per case. A review screen
 *    that fits on screen cannot demonstrate anything about reaching its own end.
 *  - IT NEVER CLICKS THE BUTTON. "Fill the form" starts a real run against a real employer's page.
 *    This spec proves the control is reachable and hittable; it stops one pixel short of pressing.
 *
 * RUN IT WITH:  npm run build && npm run test:narrow-viewport
 * Deliberately outside `npm test`, for the same reason as the click-path spec: that suite is
 * hundreds of fast static tests and must never depend on a browser binary being present.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

import { BACKEND_ORIGIN, SESSION_TOKEN, STUB } from "./fixture-data.mjs";

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
const blockedExternal = [];
/** Backend paths the stub had no canned answer for. A silent `{}` is how the review screen dies. */
const unstubbedBackendPaths = new Set();
/** Uncaught page errors, so an error boundary shows up as its cause rather than as a locator timeout. */
const pageErrors = [];

const ARTIFACT_DIR = path.join(process.cwd(), "test-results", "narrow-viewport");
let anyFailure = false;

test.after(async () => {
  if (anyFailure) process.stderr.write(`\nnarrow-viewport artifacts written to ${ARTIFACT_DIR}\n`);
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
});

/**
 * The measurement, run inside the page.
 *
 * The five probe points are the four EDGE MIDPOINTS just inside the border plus the centre, and
 * not the rect corners: the button is `rounded-control` (999px), so its rect corners fall outside
 * the painted pill and would report a miss on a perfectly healthy button.
 */
const PROBE = (label) => {
  const btn = [...document.querySelectorAll("button")].find((b) => /Fill the form/i.test(b.textContent ?? ""));
  if (!btn) return { found: false, label };
  const r = btn.getBoundingClientRect();
  const nav = document.querySelector("nav.fixed");
  const navShown = nav ? getComputedStyle(nav).display !== "none" : false;
  const navRect = navShown ? nav.getBoundingClientRect() : null;
  const main = document.querySelector("main");
  const points = [
    [r.left + r.width / 2, r.top + 3],
    [r.left + r.width / 2, r.bottom - 3],
    [r.left + 3, r.top + r.height / 2],
    [r.right - 3, r.top + r.height / 2],
    [r.left + r.width / 2, r.top + r.height / 2],
  ];
  const misses = [];
  for (const [x, y] of points) {
    const el = document.elementFromPoint(Math.round(x), Math.round(y));
    if (!(el === btn || btn.contains(el))) {
      misses.push({ x: Math.round(x), y: Math.round(y), hit: el ? `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}` : null });
    }
  }
  return {
    found: true,
    label,
    visibility: document.visibilityState,
    scrollY: Math.round(window.scrollY),
    maxScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    viewportH: window.innerHeight,
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    fullyInViewport: r.top >= 0 && r.bottom <= window.innerHeight,
    navShown,
    navHeight: navRect ? Math.round(navRect.height) : 0,
    navTop: navRect ? Math.round(navRect.top) : null,
    occludedByNav: navRect ? r.bottom > navRect.top : false,
    mainPadBottom: main ? Math.round(parseFloat(getComputedStyle(main).paddingBottom)) : null,
    misses,
  };
};

/** Land on the review screen the way a student does: open the ledger, then open a packet. */
async function openAPacket(page) {
  await page.goto(`${ORIGIN}/dashboard/applications?state=ready`, { waitUntil: "domcontentloaded" });
  const rows = page.locator('section[aria-labelledby="application-ledger-heading"] button[aria-pressed]:visible');
  await rows.first().waitFor({ state: "visible", timeout: 20_000 });
  await rows.first().click();
  await page.getByRole("button", { name: "Fill the form" }).waitFor({ state: "visible", timeout: 20_000 });
  /* Any scroll the router or an anchor kicked off must SETTLE before anything is measured. See the
     smooth-scroll note in the header: measuring mid-animation is how this was mis-diagnosed. */
  await page.waitForTimeout(600);
}

async function captureFailure(label, page, reason) {
  anyFailure = true;
  const slug = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    /* Both pictures matter here. The viewport shot is what the student sees and is where an
       overlap shows up; the full-page shot is where "the action is 2,000px down" shows up. */
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${slug}.png`) });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${slug}-full.png`), fullPage: true });
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.html`), await page.content());
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.txt`), [
      `case:      ${label}`,
      `url:       ${page.url()}`,
      `blocked:   ${JSON.stringify(blockedExternal)}`,
      `unstubbed: ${JSON.stringify([...unstubbedBackendPaths])}`,
      `pageErrors:${JSON.stringify(pageErrors)}`,
      "",
      String(reason?.stack ?? reason),
      "",
    ].join("\n"));
  } catch (captureFault) {
    process.stderr.write(`could not capture artifacts for "${label}": ${captureFault}\n`);
  }
}

/**
 * Every viewport this runs at, and what each one is here to prove.
 *
 * `stickyExpected` is the lg breakpoint, not a preference. Below lg the bar is sticky and the
 * action must be on screen BEFORE any scrolling, because that is the whole fix. At lg and up the
 * bar is deliberately static: the desktop screen is about one and a half viewports and the
 * two-pane review has a measured height budget (`xl:max-h-[calc(100vh-15.5rem)]`) that a permanent
 * bar would eat. Asserting stickiness there would pin a behaviour the design deliberately declines.
 */
const VIEWPORTS = [
  { width: 375, height: 812, why: "phone, the common case for TikTok and Instagram traffic" },
  { width: 744, height: 789, why: "the width the defect was reported at" },
  { width: 900, height: 700, why: "mid-band: tab bar still on, sm padding rules already applied" },
  { width: 1023, height: 800, why: "one pixel below lg, the last width the tab bar is shown at" },
  { width: 1440, height: 1000, why: "desktop, where the bar is static by design" },
];

for (const vp of VIEWPORTS) {
  const label = `${vp.width}x${vp.height}`;
  const stickyExpected = vp.width < 1024;

  test(`"Fill the form" is reachable at ${label} (${vp.why})`, async () => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
        await route.continue();
        return;
      }
      if (url.startsWith(BACKEND_ORIGIN)) {
        const backendPath = new URL(url).pathname;
        const body = STUB[backendPath];
        if (body === undefined) unstubbedBackendPaths.add(backendPath);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body ?? {}) });
        return;
      }
      blockedExternal.push(url);
      await route.abort();
    });
    await context.addInitScript((token) => {
      window.localStorage.setItem("rq_token", token);
      window.localStorage.setItem("rq_email", "fixture@example.invalid");
      window.localStorage.setItem("litos_session_mode_v1", "verified");
      window.localStorage.setItem("litos_has_history_v1", "true");
    }, SESSION_TOKEN);

    const page = await context.newPage();
    page.on("pageerror", (reason) => pageErrors.push(String(reason)));
    try {
      await openAPacket(page);

      const atRest = await page.evaluate(PROBE, "no scrolling at all");
      assert.equal(atRest.found, true, "the review screen did not render a Fill the form button");
      assert.equal(atRest.visibility, "visible", "a background tab suspends rAF and smooth scrolling; nothing measured here would mean anything");

      /* The case is only meaningful if the screen is longer than the screen. */
      assert.ok(
        atRest.maxScroll > 200,
        `the review screen must overflow the viewport for this case to prove anything, and it only had ${atRest.maxScroll}px of scroll. Check REALISTIC_JD in fixture-data.mjs.`,
      );

      /* The clearance invariant, stated on its own so a regression here names itself rather than
         showing up as a confusing overlap somewhere downstream. */
      if (atRest.navShown) {
        assert.ok(
          atRest.mainPadBottom >= atRest.navHeight,
          `main reserves ${atRest.mainPadBottom}px for a ${atRest.navHeight}px tab bar at ${label}, so the end of every dashboard page sits under it. A py-* shorthand has probably cancelled the bottom padding again.`,
        );
      }

      if (stickyExpected) {
        assert.ok(
          atRest.fullyInViewport,
          `at ${label} the action must be on screen before any scrolling, and its rect was top ${atRest.top} / bottom ${atRest.bottom} in a ${atRest.viewportH}px viewport: ${JSON.stringify(atRest)}`,
        );
        assert.deepEqual(atRest.misses, [], `something is painted over the action at ${label}: ${JSON.stringify(atRest.misses)}`);
        assert.equal(atRest.occludedByNav, false, `the action overlaps the mobile tab bar at ${label}: ${JSON.stringify(atRest)}`);
      }

      /* And at the end of the document, where the bar comes to rest, on every width. */
      await page.evaluate(() => { document.documentElement.scrollTop = 1e7; });
      await page.waitForTimeout(600);
      const atEnd = await page.evaluate(PROBE, "scrolled to the end");
      assert.ok(
        atEnd.fullyInViewport,
        `at ${label}, scrolled to the very end, the action was still not fully in the viewport: ${JSON.stringify(atEnd)}`,
      );
      assert.deepEqual(atEnd.misses, [], `something is painted over the action at ${label} at the end of the document: ${JSON.stringify(atEnd.misses)}`);
      assert.equal(atEnd.occludedByNav, false, `the action overlaps the mobile tab bar at ${label} at the end of the document: ${JSON.stringify(atEnd)}`);

      assert.deepEqual(blockedExternal, [], "a request tried to leave this machine");
      assert.deepEqual(pageErrors, [], "the page under test threw");
      assert.deepEqual([...unstubbedBackendPaths], [], "the stub answered {} to a path the review screen depends on");
    } catch (reason) {
      await captureFailure(label, page, reason);
      throw reason;
    } finally {
      await context.close().catch(() => {});
    }
  });
}
