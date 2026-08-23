/**
 * Browser proof for dashboard route, overlay, and reduced-motion behavior.
 *
 * The source contract pins the CSS shape. This spec proves Chromium actually creates the expected
 * snapshot animations, completes an overlay exit, restores focus, and removes motion when the
 * operating system preference requests it. No real service is contacted.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

import { BACKEND_ORIGIN, SESSION_TOKEN, STUB } from "./fixture-data.mjs";
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
      const response = await fetch(`${origin}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Still starting.
    }
    await delay(250);
  }
  throw new Error(`next start never answered on ${origin}. Run npm run build first.`);
}

const port = await freePort();
const ORIGIN = `http://127.0.0.1:${port}`;
let server = null;
let browser = null;
const contexts = [];
const blockedExternal = [];
const unstubbedBackendPaths = new Set();

test.before(async () => {
  server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForServer(ORIGIN, server);
  browser = await chromium.launch();
});

async function dashboardContext(options) {
  if (!browser) throw new Error("Chromium did not start");
  const context = await browser.newContext(options);
  contexts.push(context);
  await context.addInitScript((token) => {
    window.localStorage.setItem("rq_token", token);
    window.localStorage.setItem("rq_email", "fixture@example.invalid");
    window.localStorage.setItem("litos_session_mode_v1", "verified");
    window.localStorage.setItem("litos_has_history_v1", "true");
  }, SESSION_TOKEN);
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
      await route.continue();
      return;
    }
    if (url.startsWith(BACKEND_ORIGIN)) {
      const pathname = new URL(url).pathname;
      const body = STUB[pathname];
      if (body === undefined) unstubbedBackendPaths.add(pathname);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body ?? {}) });
      return;
    }
    if (isSanctionedThirdParty(url)) {
      await route.abort();
      return;
    }
    blockedExternal.push(url);
    await route.abort();
  });
  return context;
}

async function startMotionSampler(page) {
  await page.evaluate(() => {
    window.__rqStopMotionSampler?.();
    window.__rqMotionSamples = [];
    const sample = () => {
      for (const animation of document.getAnimations()) {
        const name = animation.animationName ?? "";
        if (!name.startsWith("rq-dashboard") || animation.playState === "finished") continue;
        const effect = animation.effect;
        const timing = effect?.getTiming();
        window.__rqMotionSamples.push({
          name,
          playState: animation.playState,
          pseudoElement: effect?.pseudoElement ?? null,
          duration: typeof timing?.duration === "number" ? timing.duration : null,
        });
      }
    };
    const timer = window.setInterval(sample, 4);
    sample();
    window.__rqStopMotionSampler = () => window.clearInterval(timer);
  });
}

async function finishSampledMotion(page) {
  await page.evaluate(async () => {
    const relevant = document.getAnimations().filter((animation) =>
      (animation.animationName ?? "").startsWith("rq-dashboard"),
    );
    await Promise.all(relevant.map((animation) => animation.finished.catch(() => undefined)));
    window.__rqStopMotionSampler?.();
  });
  return page.evaluate(() => window.__rqMotionSamples ?? []);
}

test.after(async () => {
  try {
    assert.deepEqual(blockedExternal, []);
    assert.deepEqual([...unstubbedBackendPaths], []);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
    await browser?.close().catch(() => {});
    server?.kill("SIGTERM");
  }
});

test("route navigation creates a brief page exit and entry", async () => {
  const context = await dashboardContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.locator("main .rq-dashboard-page").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => typeof document.startViewTransition), "function");

  await startMotionSampler(page);
  await page.locator('aside a[href="/dashboard/applications"]').click();
  await page.waitForURL(`${ORIGIN}/dashboard/applications`);
  await page.getByRole("heading", { name: "Applications", exact: true }).waitFor();
  await page.waitForFunction(() =>
    (window.__rqMotionSamples ?? []).some((sample) => sample.name === "rq-dashboard-page-enter"),
  );
  const samples = await finishSampledMotion(page);
  const names = new Set(samples.map((sample) => sample.name));
  assert.ok(names.has("rq-dashboard-page-exit"), `missing page exit animation: ${JSON.stringify(samples)}`);
  assert.ok(names.has("rq-dashboard-page-enter"), `missing page entry animation: ${JSON.stringify(samples)}`);
  assert.ok(
    samples.filter((sample) => sample.duration !== null).every((sample) => sample.duration <= 300),
    `dashboard route motion exceeded 300ms: ${JSON.stringify(samples)}`,
  );
  await context.close();
});

test("the mobile More sheet exits and restores focus", async () => {
  const context = await dashboardContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  const more = page.getByRole("button", { name: "More", exact: true });
  await more.waitFor({ state: "visible" });
  await more.click();
  const dialog = page.getByRole("dialog", { name: "More", exact: true });
  const dialogElement = page.locator("#dashboard-more-dialog");
  await dialog.waitFor({ state: "visible" });
  await page.evaluate(async () => {
    const relevant = document.getAnimations().filter((animation) =>
      (animation.animationName ?? "").startsWith("rq-dashboard"),
    );
    await Promise.all(relevant.map((animation) => animation.finished.catch(() => undefined)));
  });

  await startMotionSampler(page);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForFunction(() => document.getElementById("dashboard-more-dialog")?.hasAttribute("inert"));
  assert.equal(await dialogElement.getAttribute("aria-hidden"), "true");
  await dialogElement.waitFor({ state: "detached" });
  try {
    await page.waitForFunction(() =>
      (window.__rqMotionSamples ?? []).some((sample) =>
        sample.name === "rq-dashboard-dialog-exit"
        && sample.pseudoElement === null),
    null, { timeout: 3_000 });
  } catch {
    const captured = await page.evaluate(() => window.__rqMotionSamples ?? []);
    throw new Error(`sheet exit animation was not created: ${JSON.stringify(captured)}`);
  }
  const samples = await finishSampledMotion(page);
  assert.ok(
    samples.some((sample) =>
      sample.name === "rq-dashboard-dialog-exit"
      && sample.pseudoElement === null),
    `missing sheet exit animation: ${JSON.stringify(samples)}`,
  );
  await assert.doesNotReject(more.evaluate((element) => {
    if (document.activeElement !== element) throw new Error("More did not regain focus");
  }));
  await context.close();
});

test("reduced motion completes the same route with no running dashboard animation", async () => {
  const context = await dashboardContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches), true);

  await page.locator('aside a[href="/dashboard/applications"]').click();
  await page.waitForURL(`${ORIGIN}/dashboard/applications`);
  await page.getByRole("heading", { name: "Applications", exact: true }).waitFor();
  const state = await page.evaluate(() => ({
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    running: document.getAnimations()
      .filter((animation) => (animation.animationName ?? "").startsWith("rq-dashboard") && animation.playState === "running")
      .map((animation) => animation.animationName),
  }));
  assert.equal(state.scrollBehavior, "auto");
  assert.deepEqual(state.running, []);
  await context.close();
});
