/**
 * The controlled submission harness enters through the same Guest mode button a
 * person sees. It reaches a local `next dev` server through 127.0.0.1 because
 * every controlled service uses an explicit loopback address.
 *
 * Next rejects development assets when the page origin differs from the dev
 * server's default localhost origin unless next.config.ts permits it. The
 * failure is deceptive: server-rendered sign-in controls appear, but React does
 * not hydrate, Guest mode never appears, and even visible buttons do nothing.
 * A source assertion cannot prove hydration, so this spec renders the current
 * login page, clicks Guest mode, and verifies the resulting guest session.
 *
 * No real backend, account, or external service is contacted. The guest response
 * is fulfilled in the browser with a fabricated token, the Google script is
 * replaced with an empty local response, and any unknown origin fails the test.
 *
 * Run with: npm run test:qa-guest-entry
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const BACKEND_ORIGIN = "https://backend.fixture.invalid";
const GUEST_TOKEN = [
  Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ userId: "qa-guest-user", isGuest: true })).toString("base64url"),
  "fixture-signature",
].join(".");

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
    if (child.exitCode !== null) throw new Error(`next dev exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Not listening yet.
    }
    await delay(250);
  }
  throw new Error(`next dev never answered on ${origin}`);
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn("node_modules/.bin/next", ["dev", "-p", String(port)], {
  env: {
    ...process.env,
    NEXT_PUBLIC_API_URL: BACKEND_ORIGIN,
  },
  stdio: ["ignore", "ignore", "inherit"],
});

let browser;
let context;

test.after(async () => {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
});

test("127.0.0.1 dev entry renders and clicks Guest mode", async () => {
  await waitForServer(origin, server);
  browser = await chromium.launch();
  context = await browser.newContext();

  const unexpectedOrigins = [];
  let guestRequests = 0;
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.startsWith(origin) || requestUrl.startsWith("data:") || requestUrl === "about:blank") {
      await route.continue();
      return;
    }
    if (requestUrl === `${BACKEND_ORIGIN}/auth/guest`) {
      guestRequests += 1;
      const requestBody = route.request().postDataJSON();
      assert.deepEqual(Object.keys(requestBody), ["idempotency_key"]);
      assert.match(requestBody.idempotency_key, /^[0-9a-f-]{36}$/);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: GUEST_TOKEN }),
      });
      return;
    }
    if (requestUrl.startsWith("https://accounts.google.com/gsi/client")) {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    unexpectedOrigins.push(requestUrl);
    await route.abort();
  });

  const page = await context.newPage();
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.evaluate(() => localStorage.length), 0, "the browser must begin without Litos history");

  const guestButton = page.getByRole("button", { name: "Guest mode" });
  await guestButton.waitFor({ state: "visible", timeout: 15_000 });
  await guestButton.click();
  await page.waitForFunction(() => localStorage.getItem("litos_session_mode_v1") === "guest");

  assert.equal(guestRequests, 1);
  assert.equal(await page.evaluate(() => localStorage.getItem("litos_has_history_v1")), "true");
  assert.equal(await page.evaluate(() => localStorage.getItem("rq_token")), GUEST_TOKEN);
  assert.deepEqual(unexpectedOrigins, []);
});
