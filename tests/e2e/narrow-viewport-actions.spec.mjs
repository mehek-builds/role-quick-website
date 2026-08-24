/**
 * The primary action on /dashboard/applications, measured at the widths real students use.
 *
 * WHAT WENT WRONG, AND WHY IT NEEDS A BROWSER
 * ===========================================
 * "Review and fill" is the product's core pre-fill review action. It used to be the last element of the review screen, which
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
 * With the fix the sticky action is green at 375x812, 744x789, 900x700 and 1023x800. The desktop
 * action is in the first review card and is green before any scrolling.
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
 *  - IT NEVER CLICKS THE BUTTON. "Review and fill" starts the exact packet review gate.
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

import { BACKEND_ORIGIN, RESUMES, SESSION_TOKEN, STUB } from "./fixture-data.mjs";
import { isSanctionedThirdParty } from "./sanctioned-third-parties.mjs";

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
const PROBE = ({ label, action }) => {
  const btn = [...document.querySelectorAll("button")].find((b) => {
    const rect = b.getBoundingClientRect();
    return (b.textContent ?? "").trim().startsWith(action)
      && rect.width > 0
      && rect.height > 0
      && getComputedStyle(b).visibility !== "hidden";
  });
  if (!btn) return { found: false, label, action };
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
    action,
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
  await page.getByRole("button", { name: "Review and fill" }).waitFor({ state: "visible", timeout: 20_000 });
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
 * `stickyExpected` is the lg breakpoint, not a preference. Below lg the bar is sticky. At lg and
 * up the action sits in the first review card, where it must be visible before any scrolling.
 */
const VIEWPORTS = [
  { width: 375, height: 812, why: "phone, the common case for TikTok and Instagram traffic" },
  { width: 744, height: 789, why: "the width the defect was reported at" },
  { width: 900, height: 700, why: "mid-band: tab bar still on, sm padding rules already applied" },
  { width: 1023, height: 800, why: "one pixel below lg, the last width the tab bar is shown at" },
  { width: 1440, height: 1000, why: "desktop, where the action belongs in the first review card" },
];

for (const vp of VIEWPORTS) {
  const label = `${vp.width}x${vp.height}`;
  const stickyExpected = vp.width < 1024;

  test(`"Review and fill" is reachable at ${label} (${vp.why})`, async () => {
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
      // The sanctioned analytics origin, aborted without being recorded.
      // See ./sanctioned-third-parties.mjs for the list and the call behind it.
      if (isSanctionedThirdParty(url)) return route.abort();
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

      const atRest = await page.evaluate(PROBE, { label: "no scrolling at all", action: "Review and fill" });
      assert.equal(atRest.found, true, "the review screen did not render a Review and fill button");
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

      assert.ok(
        atRest.fullyInViewport,
        `at ${label} the action must be on screen before any scrolling, and its rect was top ${atRest.top} / bottom ${atRest.bottom} in a ${atRest.viewportH}px viewport: ${JSON.stringify(atRest)}`,
      );
      assert.deepEqual(atRest.misses, [], `something is painted over the action at ${label}: ${JSON.stringify(atRest.misses)}`);
      assert.equal(atRest.occludedByNav, false, `the action overlaps the mobile tab bar at ${label}: ${JSON.stringify(atRest)}`);

      if (!stickyExpected) {
        /* A focused application intentionally replaces the browsing ledger with a compact
           identity row. Return through the real escape control before checking that the landing
           ledger count still keeps its no-wrap contract. */
        await page.getByRole("button", { name: /All applications/ }).click();
        await page.getByTestId("application-ledger-count").waitFor();
        const ledgerCountLines = await page.getByTestId("application-ledger-count").evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        });
        assert.equal(
          ledgerCountLines,
          1,
          `the application count wrapped onto ${ledgerCountLines} lines at ${label}`,
        );
      }

      if (stickyExpected) {
        /* And at the end of the document, where the narrow action bar comes to rest. */
        await page.evaluate(() => { document.documentElement.scrollTop = 1e7; });
        await page.waitForTimeout(600);
        const atEnd = await page.evaluate(PROBE, { label: "scrolled to the end", action: "Review and fill" });
        assert.ok(
          atEnd.fullyInViewport,
          `at ${label}, scrolled to the very end, the action was still not fully in the viewport: ${JSON.stringify(atEnd)}`,
        );
        assert.deepEqual(atEnd.misses, [], `something is painted over the action at ${label} at the end of the document: ${JSON.stringify(atEnd.misses)}`);
        assert.equal(atEnd.occludedByNav, false, `the action overlaps the mobile tab bar at ${label} at the end of the document: ${JSON.stringify(atEnd)}`);
      }

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


/**
 * A stopped application now asks one trusted employer question directly. The action must be
 * reachable without first finding a checklist row, and the compact prompt must keep that action
 * clear of the mobile navigation both before and after the user scrolls.
 */
for (const vp of [{ width: 375, height: 812 }, { width: 744, height: 789 }]) {
  const label = `${vp.width}x${vp.height}`;
  test(`the direct answer action is reachable at ${label}`, async () => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
        await route.continue();
        return;
      }
      if (url.startsWith(BACKEND_ORIGIN)) {
        const backendPath = new URL(url).pathname;
        /* The submission poll's path carries the packet id, so it cannot be a key in the static
           STUB map. Answer it from the same fixture the ledger was built from, so the portal
           screen sees the packet the user actually opened. */
        const poll = backendPath.match(/^\/applications\/([^/]+)\/submission$/);
        if (poll) {
          const packet = RESUMES.find((r) => r.id === poll[1]);
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ application_id: poll[1], review: packet?.spec?._review ?? {}, cover_letter: null }),
          });
          return;
        }
        const body = STUB[backendPath];
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body ?? {}) });
        return;
      }
      // Sanctioned analytics origin: aborted, not recorded. See sanctioned-third-parties.mjs.
      if (isSanctionedThirdParty(url)) return route.abort();
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
    try {
      /* A needs_attention packet exposes its one safe question immediately. Filling the local
         draft makes the primary action real without pressing anything that writes or sends. */
      await page.goto(`${ORIGIN}/dashboard/applications?state=action`, { waitUntil: "domcontentloaded" });
      const rows = page.locator('section[aria-labelledby="application-ledger-heading"] button[aria-pressed]:visible');
      await rows.first().waitFor({ state: "visible", timeout: 20_000 });
      await rows.first().click();
      const prompt = page.locator('main section[aria-labelledby^="direct-application-question-"]');
      await prompt.waitFor({ state: "visible", timeout: 20_000 });
      assert.equal(await prompt.count(), 1, "the application exposed more than one direct question");
      assert.equal(await page.getByRole("button", { name: /^Answer:/ }).count(), 0, "the old checklist action returned");
      await prompt.getByRole("textbox").fill("Dubai, United Arab Emirates");

      const save = prompt.getByRole("button", { name: "Save to application", exact: true });
      await save.waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(600);

      const atRest = await page.evaluate(PROBE, { label: "direct answer, no scrolling", action: "Save to application" });
      assert.equal(atRest.found, true, "the direct prompt did not render its save action");
      assert.equal(atRest.visibility, "visible");
      assert.ok(atRest.fullyInViewport, `the direct answer action was not on screen at ${label}: ${JSON.stringify(atRest)}`);
      assert.deepEqual(atRest.misses, [], `something is painted over the direct answer action at ${label}: ${JSON.stringify(atRest.misses)}`);
      assert.equal(atRest.occludedByNav, false, `the direct answer action overlaps the tab bar at ${label}: ${JSON.stringify(atRest)}`);

      await page.evaluate(() => { document.documentElement.scrollTop = 1e7; });
      await page.waitForTimeout(600);
      const atEnd = await page.evaluate(PROBE, { label: "direct answer, scrolled to the end", action: "Save to application" });
      assert.ok(atEnd.fullyInViewport, `at the end of the direct prompt the action was off screen at ${label}: ${JSON.stringify(atEnd)}`);
      assert.deepEqual(atEnd.misses, [], JSON.stringify(atEnd.misses));
      assert.equal(atEnd.occludedByNav, false, JSON.stringify(atEnd));

      assert.deepEqual(blockedExternal, [], "a request tried to leave this machine");
    } catch (reason) {
      await captureFailure(`direct-answer-${label}`, page, reason);
      throw reason;
    } finally {
      await context.close().catch(() => {});
    }
  });
}


/**
 * The keyboard case, driven through the same variable the shell writes.
 *
 * A real software keyboard cannot be opened in headless Chromium, and `visualViewport` cannot be
 * resized from script, so this asserts the half that is actually this repo's: given a keyboard
 * inset, does the sticky bar clear it? The other half, turning viewport geometry into that number,
 * is a pure function unit-tested in lib/keyboard-inset.test.mts with real device measurements.
 * Splitting it that way is the only honest option here; a single test claiming to prove "works on
 * iPhone" would be claiming something no machine in this pipeline can observe.
 */
test("a terminal action bar clears a software keyboard", async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
      await route.continue();
      return;
    }
    if (url.startsWith(BACKEND_ORIGIN)) {
      const body = STUB[new URL(url).pathname];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body ?? {}) });
      return;
    }
    // Sanctioned analytics origin: aborted, not recorded. See sanctioned-third-parties.mjs.
    if (isSanctionedThirdParty(url)) return route.abort();
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
  try {
    await openAPacket(page);
    const closed = await page.evaluate(PROBE, { label: "keyboard closed", action: "Review and fill" });
    assert.ok(closed.fullyInViewport, JSON.stringify(closed));

    /* 336px is an iPhone 14 Pro portrait keyboard. */
    await page.evaluate(() => { document.documentElement.style.setProperty("--keyboard-inset", "336px"); });
    await page.waitForTimeout(300);
    const open = await page.evaluate(PROBE, { label: "keyboard open", action: "Review and fill" });

    const keyboardTop = open.viewportH - 336;
    assert.ok(
      open.bottom <= keyboardTop,
      `the action bar is behind the keyboard: its bottom is ${open.bottom} and the keyboard starts at ${keyboardTop}. ${JSON.stringify(open)}`,
    );
    assert.ok(open.top >= 0, `the bar was pushed off the top of the screen: ${JSON.stringify(open)}`);
    /* The BAR's own edge, not the button's: the button sits 16px inside the bar's padding, and
       measuring it made the first version of this assertion look like a 17px discrepancy that was
       simply the padding. The tab bar is behind the keyboard too, so its height must NOT be added
       on top of the keyboard's (max(), not a sum); anything beyond the 40px gutter is dead space. */
    const barBottom = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => /Review and fill/i.test(b.textContent ?? "") && b.getBoundingClientRect().height > 0);
      const bar = btn.closest("[class*='sticky']");
      return Math.round(bar.getBoundingClientRect().bottom);
    });
    const slack = keyboardTop - barBottom;
    assert.ok(
      slack >= 0 && slack <= 48,
      `the bar's own bottom edge sits ${slack}px above the keyboard; expected the 40px gutter. A much larger number means the tab bar's height is being added to the keyboard's instead of max()'d with it.`,
    );

    /* And `main`'s reservation must NOT have moved, or the document would shift under a student
       mid-keystroke. */
    const padUnchanged = await page.evaluate(() => {
      const main = document.querySelector("main");
      return getComputedStyle(main).paddingBottom;
    });
    await page.evaluate(() => { document.documentElement.style.removeProperty("--keyboard-inset"); });
    await page.waitForTimeout(200);
    const restored = await page.evaluate(() => getComputedStyle(document.querySelector("main")).paddingBottom);
    assert.equal(padUnchanged, restored, "main's bottom padding changed with the keyboard; it must be keyboard-independent");
  } catch (reason) {
    await captureFailure("keyboard", page, reason);
    throw reason;
  } finally {
    await context.close().catch(() => {});
  }
});
