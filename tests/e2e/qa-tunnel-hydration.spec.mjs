/**
 * The managed submission runner reaches the local controlled portal through an
 * HTTPS Cloudflare tunnel. Next development mode checks the browser Origin on
 * its HMR WebSocket upgrade. If the exact tunnel hostname is not allowed, the
 * server-rendered form appears but React never runs its effect that publishes
 * data-litos-qa-ready="1". The backend then correctly fails closed before fill.
 *
 * This test exercises that boundary with a real `next dev` process. Chromium
 * resolves one fabricated trycloudflare hostname to 127.0.0.1, Next supplies a
 * local HTTPS certificate, and the browser must hydrate the controlled form.
 * Nothing leaves the machine.
 */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const TUNNEL_HOST = "controlled-origin.trycloudflare.com";
const certificateDirectory = mkdtempSync(join(tmpdir(), "litos-qa-tunnel-cert-"));
const certificateKey = join(certificateDirectory, "key.pem");
const certificate = join(certificateDirectory, "cert.pem");
const certificateResult = spawnSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
  "-subj", `/CN=${TUNNEL_HOST}`,
  "-addext", `subjectAltName=DNS:${TUNNEL_HOST}`,
  "-keyout", certificateKey,
  "-out", certificate,
], { stdio: "ignore" });
if (certificateResult.status !== 0) {
  throw new Error("openssl could not create the local controlled-tunnel test certificate");
}

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

async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`next dev exited early with code ${child.exitCode}`);
    const status = await new Promise((resolve) => {
      const probe = request({
        hostname: "127.0.0.1",
        port,
        path: "/qa/portal-submission?board=greenhouse&shape=security-code",
        method: "GET",
        rejectUnauthorized: false,
        headers: { host: `${TUNNEL_HOST}:${port}` },
      }, (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      probe.once("error", () => resolve(0));
      probe.end();
    });
    if (status > 0 && status < 500) return;
    await delay(250);
  }
  throw new Error("next dev never answered through the controlled tunnel host");
}

const port = await freePort();
const origin = `https://${TUNNEL_HOST}:${port}`;
const serverErrors = [];
const server = spawn(
  "node_modules/.bin/next",
  [
    "dev",
    "--experimental-https",
    "--experimental-https-key", certificateKey,
    "--experimental-https-cert", certificate,
    "-H", "0.0.0.0",
    "-p", String(port),
  ],
  {
    env: {
      ...process.env,
      LITOS_TEST_PORTAL_PUBLIC_ORIGIN: `https://${TUNNEL_HOST}`,
    },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
server.stderr.on("data", (chunk) => serverErrors.push(String(chunk)));

let browser;
let context;

test.after(async () => {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
  rmSync(certificateDirectory, { recursive: true, force: true });
});

test("the exact configured HTTPS tunnel host hydrates the controlled portal", async () => {
  await waitForServer(port, server);
  browser = await chromium.launch({
    args: [`--host-resolver-rules=MAP ${TUNNEL_HOST} 127.0.0.1`],
  });
  context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(`${origin}/qa/portal-submission?board=greenhouse&shape=security-code`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const form = page.locator('form[data-litos-controlled-portal][data-litos-qa-ready="1"]');
  await form.waitFor({ state: "visible", timeout: 15_000 }).catch((error) => {
    throw new Error([
      error.message,
      `Browser errors: ${JSON.stringify(browserErrors)}`,
      `Server errors: ${serverErrors.join("")}`,
    ].join("\n"));
  });

  assert.equal(await form.getAttribute("data-litos-qa-ready"), "1");
  assert.equal(
    browserErrors.some((message) => /WebSocket.*(?:403|502)|blocked cross-origin/i.test(message)),
    false,
    `the tunnel HMR channel was blocked: ${JSON.stringify(browserErrors)}`,
  );
});
