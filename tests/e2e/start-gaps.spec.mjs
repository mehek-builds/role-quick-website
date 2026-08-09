/**
 * The server's gaps step must render, save, and advance in the production client.
 * Every backend request is intercepted and no real account or service is contacted.
 *
 * Run with: npm run build && npm run test:start-gaps
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { BACKEND_ORIGIN } from "./fixture-data.mjs";

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
      // Not listening yet.
    }
    await delay(250);
  }
  throw new Error(`next start never answered on ${origin}`);
}

const port = await freePort();
const SERVER_ORIGIN = `http://127.0.0.1:${port}`;
const PAGE_ORIGIN = `http://localhost:${port}`;
const server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "ignore", "inherit"],
});
await waitForServer(SERVER_ORIGIN, server);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
const page = await context.newPage();
const blockedExternal = [];
const unstubbedBackend = [];
let savedBody = null;

const doneState = {
  step: "done",
  completed_at: null,
  has_focus: true,
  has_resume: true,
  has_impact_review: true,
  has_base_resume: true,
  has_applied: false,
  has_targeting: true,
  learned: [],
  gaps: [],
  gap_suggestions: {},
  source_pages: 1,
  source_resume_url: null,
  harvest_active: false,
  automatic_submission_enabled: false,
  automatic_submission_consented_at: null,
  automatic_submission_consent_version: null,
  automatic_verification_enabled: false,
};

await context.route("**/*", async (route) => {
  const url = route.request().url();
  if (url.startsWith(SERVER_ORIGIN) || url.startsWith(PAGE_ORIGIN) || url.startsWith("data:") || url.startsWith("blob:")) {
    await route.continue();
    return;
  }
  if (!url.startsWith(BACKEND_ORIGIN)) {
    blockedExternal.push(url);
    await route.abort();
    return;
  }
  const pathname = new URL(url).pathname;
  if (pathname === "/profile/application" && route.request().method() === "PUT") {
    savedBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(savedBody) });
    return;
  }
  if (pathname === "/onboarding/state") {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(doneState) });
    return;
  }
  if (pathname === "/v1/meta") {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ product: "litos" }) });
    return;
  }
  unstubbedBackend.push(`${route.request().method()} ${pathname}`);
  await route.abort();
});

test.after(async () => {
  await context.close();
  await browser.close();
  server.kill("SIGTERM");
});

test("the referral gap renders, saves the typed source, and advances", async (t) => {
  try {
    await page.goto(`${PAGE_ORIGIN}/start?qa=1&step=gaps`, { waitUntil: "networkidle" });
    const input = page.getByLabel("Default referral source");
    await input.waitFor({ state: "visible" });
    assert.equal(await page.getByText("Your job matches are ready.").count(), 0);

    await input.fill("LinkedIn");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Your job matches are ready.").waitFor({ state: "visible" });

    assert.deepEqual(savedBody, { referral_source_default: "LinkedIn" });
    assert.deepEqual(blockedExternal, []);
    assert.deepEqual(unstubbedBackend, []);
  } catch (reason) {
    const artifactDir = path.join(process.cwd(), "test-results", "start-gaps");
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, "failure.png"), fullPage: true }).catch(() => {});
    await writeFile(path.join(artifactDir, "failure.html"), await page.content()).catch(() => {});
    t.diagnostic(String(reason?.stack ?? reason));
    throw reason;
  }
});
