/**
 * Browser regressions for the render-purity cleanup and controlled Rippling fixture.
 *
 * These checks stay outside `npm test`, like the repository's other browser specs. They need a
 * Chromium binary and a live Next development server because the risks are hydration, effect
 * cleanup, media-query transitions, and App Router navigation. A source assertion cannot prove
 * any of those behaviors.
 *
 * Run with: node --test tests/e2e/quality-refactor-regressions.spec.mjs
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const RIPPLING_FIELD_TEST_IDS = [
  "input-first_name",
  "input-last_name",
  "input-email",
  "input-phone_number",
  "input-current_company",
  "input-select-search-input",
  "input-select-search-input",
  "input-select-search-input",
];

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
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`next dev exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/try?step=resume`, { redirect: "manual" });
      if (response.status > 0 && response.status < 500) return;
    } catch {
      // Not listening yet.
    }
    await delay(250);
  }
  throw new Error(`next dev never answered on ${origin}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(5_000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

function ripplingIdentitiesFromHtml(html) {
  const inputTags = html.match(/<input\b[^>]*>/g) ?? [];
  const seen = new Map();
  return RIPPLING_FIELD_TEST_IDS.map((testId) => {
    const ordinal = seen.get(testId) ?? 0;
    seen.set(testId, ordinal + 1);
    const tag = inputTags.filter((candidate) => candidate.includes(`data-testid="${testId}"`))[ordinal];
    assert.ok(tag, `SSR omitted Rippling ${testId} occurrence ${ordinal}`);
    const id = tag.match(/\bid="(field-\d+)"/)?.[1];
    const name = tag.match(/\bname="([a-f0-9]{10})"/)?.[1];
    assert.ok(id, `SSR ${testId} occurrence ${ordinal} did not carry an opaque field id`);
    assert.ok(name, `SSR ${testId} occurrence ${ordinal} did not carry a ten-character opaque name`);
    return { id, name };
  });
}

function watchBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function blockExternalTraffic(context) {
  const unexpected = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("data:") || url === "about:blank") {
      await route.continue();
      return;
    }
    if (url.startsWith("https://analytics.tiktok.com/")) {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    unexpected.push(url);
    await route.abort();
  });
  return unexpected;
}

const port = await freePort();
const origin = `http://localhost:${port}`;
const serverErrors = [];
const server = spawn("node_modules/.bin/next", ["dev", "-H", "127.0.0.1", "-p", String(port)], {
  env: { ...process.env },
  stdio: ["ignore", "ignore", "pipe"],
});
server.stderr.on("data", (chunk) => serverErrors.push(String(chunk)));

let browser;

test.before(async () => {
  await waitForServer(origin, server);
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close().catch(() => {});
  await stopChild(server);
});

test("the quality refactor preserves hydrated behavior", async (suite) => {
  await suite.test("Rippling ids and names are stable through hydration and fresh across every route form", async () => {
    const context = await browser.newContext();
    const unexpected = await blockExternalTraffic(context);
    const page = await context.newPage();
    const browserErrors = watchBrowserErrors(page);
    const idSets = [];
    const nameSets = [];
    const routes = [
      { path: "/qa/portal-submission?board=rippling&case=query-case", shape: false },
      { path: "/qa/portal-submission/rippling/path-case", shape: false },
      { path: "/qa/portal-submission?board=rippling&shape=security-code", shape: true },
      { path: "/qa/portal-submission/rippling/security-code", shape: true },
    ];

    try {
      for (const route of routes) {
        const response = await page.goto(`${origin}${route.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        assert.equal(response?.status(), 200, `${route.path} did not render`);
        const serverIdentities = ripplingIdentitiesFromHtml(await response.text());
        assert.equal(new Set(serverIdentities.map(({ id }) => id)).size, RIPPLING_FIELD_TEST_IDS.length);
        assert.equal(new Set(serverIdentities.map(({ name }) => name)).size, RIPPLING_FIELD_TEST_IDS.length);

        const form = page.locator("form[data-litos-controlled-portal]");
        await form.waitFor({ state: "visible", timeout: 15_000 });
        if (route.shape) {
          await page.locator('form[data-litos-qa-ready="1"]').waitFor({ state: "visible", timeout: 15_000 });
        } else {
          await page.waitForFunction(() => {
            const portal = document.querySelector("form[data-litos-controlled-portal]");
            return portal && Object.keys(portal).some((key) => key.startsWith("__reactProps$"));
          });
        }

        const hydratedIdentities = await page.evaluate((testIds) => {
          const seen = new Map();
          return testIds.map((testId) => {
            const ordinal = seen.get(testId) ?? 0;
            seen.set(testId, ordinal + 1);
            const input = document.querySelectorAll(`[data-testid="${testId}"]`)[ordinal];
            return { id: input?.getAttribute("id"), name: input?.getAttribute("name") };
          });
        }, RIPPLING_FIELD_TEST_IDS);
        assert.deepEqual(hydratedIdentities, serverIdentities, `${route.path} changed opaque identities during hydration`);
        idSets.push(JSON.stringify(serverIdentities.map(({ id }) => id)));
        nameSets.push(JSON.stringify(serverIdentities.map(({ name }) => name)));

      }

      assert.equal(new Set(idSets).size, routes.length, "independent SSR renders reused opaque ids");
      assert.equal(new Set(nameSets).size, routes.length, "independent SSR renders reused opaque names");
      assert.equal(
        browserErrors.some((message) => /hydration|server rendered html|did not match/i.test(message)),
        false,
        `hydration errors: ${JSON.stringify(browserErrors)}`,
      );
      assert.deepEqual(unexpected, []);
    } finally {
      await context.close();
    }
  });

  await suite.test("ScrollProgress hides for reduced motion and releases its scroll listeners", async () => {
    const reducedContext = await browser.newContext({ reducedMotion: "reduce" });
    const reducedUnexpected = await blockExternalTraffic(reducedContext);
    const reducedPage = await reducedContext.newPage();
    try {
      const response = await reducedPage.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
      assert.equal(response?.status(), 200);
      assert.doesNotMatch(await response.text(), /rq-progress/, "the server snapshot rendered a progress bar");
      await reducedPage.waitForTimeout(250);
      assert.equal(await reducedPage.locator(".rq-progress").count(), 0);
      assert.deepEqual(reducedUnexpected, []);
    } finally {
      await reducedContext.close();
    }

    const context = await browser.newContext({ reducedMotion: "no-preference" });
    await context.addInitScript(() => {
      const originalAdd = window.addEventListener;
      const originalRemove = window.removeEventListener;
      const listenerIds = new WeakMap();
      let nextListenerId = 1;
      const trace = [];
      const listenerId = (listener) => {
        if (!listenerIds.has(listener)) listenerIds.set(listener, nextListenerId++);
        return listenerIds.get(listener);
      };
      window.__qualityListenerTrace = trace;
      window.addEventListener = function addEventListener(type, listener, options) {
        trace.push({ action: "add", type, listenerId: listenerId(listener) });
        return originalAdd.call(this, type, listener, options);
      };
      window.removeEventListener = function removeEventListener(type, listener, options) {
        trace.push({ action: "remove", type, listenerId: listenerId(listener) });
        return originalRemove.call(this, type, listener, options);
      };
    });
    const unexpected = await blockExternalTraffic(context);
    const page = await context.newPage();
    try {
      await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const bar = page.locator(".rq-progress");
      await bar.waitFor({ state: "attached", timeout: 15_000 });
      await page.evaluate(() => window.scrollTo(0, Math.max(1, document.documentElement.scrollHeight / 2)));
      await page.waitForFunction(() => {
        const fill = document.querySelector(".rq-progress > div");
        return fill instanceof HTMLElement && fill.style.transform !== "scaleX(0)";
      });

      const initialPairs = await page.evaluate(() => {
        const trace = window.__qualityListenerTrace;
        const ids = new Set(trace.filter((entry) => entry.action === "add" && entry.type === "scroll").map((entry) => entry.listenerId));
        return [...ids].filter((id) => trace.some((entry) => entry.action === "add" && entry.type === "resize" && entry.listenerId === id));
      });
      assert.ok(initialPairs.length > 0, "no shared scroll and resize listener was registered");

      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => !document.querySelector(".rq-progress"));
      const removedPair = await page.evaluate((ids) => {
        const trace = window.__qualityListenerTrace;
        return ids.some((id) =>
          trace.some((entry) => entry.action === "remove" && entry.type === "scroll" && entry.listenerId === id)
          && trace.some((entry) => entry.action === "remove" && entry.type === "resize" && entry.listenerId === id));
      }, initialPairs);
      assert.equal(removedPair, true, "reduced motion did not release both progress listeners");

      const traceLengthBeforeRestore = await page.evaluate(() => window.__qualityListenerTrace.length);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await bar.waitFor({ state: "attached", timeout: 15_000 });
      const restoredPair = await page.evaluate((start) => {
        const trace = window.__qualityListenerTrace.slice(start);
        const ids = new Set(trace.filter((entry) => entry.action === "add" && entry.type === "scroll").map((entry) => entry.listenerId));
        return [...ids].some((id) => trace.some((entry) => entry.action === "add" && entry.type === "resize" && entry.listenerId === id));
      }, traceLengthBeforeRestore);
      assert.equal(restoredPair, true, "restoring motion did not attach a fresh progress listener pair");
      assert.deepEqual(unexpected, []);
    } finally {
      await context.close();
    }
  });

  await suite.test("WaitingOnYou defers its clock and clears both timers on client navigation", async () => {
    const ssrResponse = await fetch(`${origin}/qa/waiting-on-you`);
    assert.equal(ssrResponse.status, 200);
    const ssrHtml = await ssrResponse.text();
    assert.match(ssrHtml, />Waiting<!-- -->/);
    assert.doesNotMatch(ssrHtml, /Waiting (?:since today|\d+ (?:hours?|days?))/);

    const context = await browser.newContext();
    await context.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout;
      const nativeSetInterval = window.setInterval;
      const nativeClearTimeout = window.clearTimeout;
      const nativeClearInterval = window.clearInterval;
      const sets = [];
      const clears = [];
      window.__qualityDocumentIdentity = crypto.randomUUID();
      window.__qualityTimerTrace = { sets, clears };
      window.setTimeout = function setTimeout(callback, delay, ...args) {
        const id = nativeSetTimeout.call(this, callback, delay, ...args);
        sets.push({ kind: "timeout", id, delay: Number(delay ?? 0) });
        return id;
      };
      window.setInterval = function setInterval(callback, delay, ...args) {
        const id = nativeSetInterval.call(this, callback, delay, ...args);
        sets.push({ kind: "interval", id, delay: Number(delay ?? 0) });
        return id;
      };
      window.clearTimeout = function clearTimeout(id) {
        clears.push({ kind: "timeout", id });
        return nativeClearTimeout.call(this, id);
      };
      window.clearInterval = function clearInterval(id) {
        clears.push({ kind: "interval", id });
        return nativeClearInterval.call(this, id);
      };
    });
    const unexpected = await blockExternalTraffic(context);
    const page = await context.newPage();
    try {
      await page.goto(`${origin}/qa/waiting-on-you`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.getByText(/^Waiting 3 days\./).waitFor({ state: "visible", timeout: 15_000 });
      const timerPair = await page.evaluate(() => {
        const sets = window.__qualityTimerTrace.sets;
        const intervalIndex = sets.findIndex((entry) => entry.kind === "interval" && entry.delay === 60_000);
        return { initial: sets[intervalIndex - 1], interval: sets[intervalIndex] };
      });
      assert.deepEqual(
        { kind: timerPair.initial?.kind, delay: timerPair.initial?.delay },
        { kind: "timeout", delay: 0 },
      );
      assert.equal(timerPair.interval?.kind, "interval");
      const documentIdentity = await page.evaluate(() => window.__qualityDocumentIdentity);

      await page.getByRole("link", { name: /Continue Data Analyst at Northwind Systems in Litos/ }).click();
      await page.waitForFunction(() => !location.pathname.startsWith("/qa/waiting-on-you"));
      await page.waitForFunction(({ initialId, intervalId }) => {
        const clears = window.__qualityTimerTrace.clears;
        return clears.some((entry) => entry.kind === "timeout" && entry.id === initialId)
          && clears.some((entry) => entry.kind === "interval" && entry.id === intervalId);
      }, { initialId: timerPair.initial.id, intervalId: timerPair.interval.id });

      assert.equal(await page.evaluate(() => window.__qualityDocumentIdentity), documentIdentity);
      assert.deepEqual(unexpected, []);
    } finally {
      await context.close();
    }
  });

  await suite.test("FocusForm resets its active match and the home mark uses client navigation", async () => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.__qualityDocumentIdentity = crypto.randomUUID();
    });
    const unexpected = await blockExternalTraffic(context);
    const page = await context.newPage();
    const browserErrors = watchBrowserErrors(page);
    try {
      await page.goto(`${origin}/start?qa=1&step=focus`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const input = page.locator("#additional-role");
      await input.waitFor({ state: "visible", timeout: 15_000 });

      await input.fill("engineer");
      assert.equal(await input.getAttribute("aria-activedescendant"), "additional-role-option-0");
      await input.press("ArrowDown");
      await input.press("ArrowDown");
      assert.equal(await input.getAttribute("aria-activedescendant"), "additional-role-option-2");

      await input.press("Backspace");
      assert.equal(await input.getAttribute("aria-activedescendant"), "additional-role-option-0");
      await input.press("ArrowDown");
      const selectedTitle = await page.locator('[role="option"][aria-selected="true"]').textContent();
      assert.ok(selectedTitle?.trim());
      await input.press("Enter");
      assert.equal(await input.inputValue(), "");
      assert.equal(await input.getAttribute("aria-expanded"), "false");

      await page.getByText("Field", { exact: true }).click();
      await input.focus();
      assert.equal(await input.getAttribute("aria-expanded"), "true");
      assert.equal(await input.getAttribute("aria-activedescendant"), "additional-role-option-0");
      assert.ok(await page.getByRole("button", { name: selectedTitle.trim(), exact: true }).count());

      const documentIdentity = await page.evaluate(() => window.__qualityDocumentIdentity);
      let documentRequests = 0;
      page.on("request", (request) => {
        if (request.resourceType() === "document") documentRequests += 1;
      });
      await page.getByRole("link", { name: "Litos home" }).click();
      await page.waitForFunction(() => location.pathname === "/", undefined, { timeout: 30_000 });
      assert.equal(await page.evaluate(() => window.__qualityDocumentIdentity), documentIdentity);
      assert.equal(documentRequests, 0, "the internal home link caused a document navigation");
      assert.equal(
        browserErrors.some((message) => /hydration|server rendered html|did not match/i.test(message)),
        false,
        `hydration errors: ${JSON.stringify(browserErrors)}`,
      );
      assert.deepEqual(unexpected, []);
    } finally {
      await context.close();
    }
  });

  await suite.test("a deep-linked TrySimulator starts its clock after mount and keeps advancing", async () => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const nativeSetInterval = window.setInterval;
      const intervals = [];
      window.__qualityIntervalTrace = intervals;
      window.setInterval = function setInterval(callback, interval, ...args) {
        const record = { interval: Number(interval ?? 0), ticks: 0 };
        const id = nativeSetInterval.call(this, (...callbackArgs) => {
          record.ticks += 1;
          if (typeof callback === "function") callback(...callbackArgs);
        }, interval, ...args);
        intervals.push(record);
        return id;
      };
    });
    const unexpected = await blockExternalTraffic(context);
    const page = await context.newPage();
    const browserErrors = watchBrowserErrors(page);
    try {
      const response = await page.goto(`${origin}/try?step=resume`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      assert.equal(response?.status(), 200);
      assert.match(await response.text(), /Making your application/);

      const autofillLabel = page.getByText("Application filled", { exact: true });
      await autofillLabel.waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForFunction(() => {
        const clock = window.__qualityIntervalTrace.find((entry) => entry.interval === 100);
        return clock && clock.ticks >= 2;
      }, undefined, { timeout: 5_000 });
      const clock = await page.evaluate(() =>
        window.__qualityIntervalTrace.find((entry) => entry.interval === 100),
      );
      assert.ok(clock?.ticks >= 2, `deep-link clock ticked ${clock?.ticks ?? 0} times`);
      assert.equal(
        browserErrors.some((message) => /hydration|server rendered html|did not match/i.test(message)),
        false,
        `hydration errors: ${JSON.stringify(browserErrors)}`,
      );
      assert.deepEqual(unexpected, []);
    } finally {
      await context.close();
    }
  });
});

process.on("exit", () => {
  if (server.exitCode === null) server.kill("SIGKILL");
  if (serverErrors.length > 0 && server.exitCode && server.exitCode !== 0) {
    process.stderr.write(serverErrors.join(""));
  }
});
