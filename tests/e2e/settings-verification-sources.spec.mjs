/**
 * Browser proof for the two verification routes on Settings.
 *
 * This suite uses a production Next build and a fabricated account. Every backend request is
 * intercepted, every unknown route fails the case, and no request can reach a real service.
 * Run with: npm run build && npm run test:settings-verification-sources
 */

import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { isSanctionedThirdParty } from "./sanctioned-third-parties.mjs";

const BACKEND = "https://student-outreach-backend.vercel.app";
const TOKEN = "settings-verification-fixture-token";

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
    if (child.exitCode !== null) throw new Error(`next start exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/login`);
      if (response.status < 500) return;
    } catch {
      // Still starting.
    }
    await delay(250);
  }
  throw new Error("next start did not become ready");
}

const port = await freePort();
const ORIGIN = `http://127.0.0.1:${port}`;
const server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "ignore", "inherit"],
});
await waitForServer(ORIGIN, server);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript((token) => {
  window.localStorage.setItem("rq_token", token);
  window.localStorage.setItem("rq_email", "fixture@example.invalid");
  window.localStorage.setItem("litos_session_mode_v1", "verified");
  window.localStorage.setItem("litos_has_history_v1", "true");
}, TOKEN);

const baseConnections = (connected = false, configured = true) => ({
  configured,
  connections: [
    { provider: "gmail", connected, status: connected ? "ACTIVE" : "NOT_CONNECTED" },
    { provider: "outlook", connected: false, status: "NOT_CONNECTED" },
  ],
});

const outlookConnected = {
  configured: true,
  connections: [
    { provider: "gmail", connected: false, status: "NOT_CONNECTED" },
    { provider: "outlook", connected: true, status: "ACTIVE" },
  ],
};

const activeAlias = {
  configured: true,
  tracking_active: true,
  tracking_blocked_reason: null,
  domain: "applications@trylitos.com",
  forward_to: "fixture@example.invalid",
  aliases: [],
};

const inactiveAlias = {
  configured: true,
  tracking_active: false,
  tracking_blocked_reason: "inbound_disabled",
  domain: "applications@trylitos.com",
  forward_to: "fixture@example.invalid",
  aliases: [],
};

let scenario;
const unknownRequests = [];

await context.route("**/*", async (route) => {
  const request = route.request();
  const url = request.url();
  if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
    await route.continue();
    return;
  }
  if (!url.startsWith(BACKEND)) {
    if (isSanctionedThirdParty(url)) return route.abort();
    unknownRequests.push(`${request.method()} ${url}`);
    await route.abort();
    return;
  }

  const pathname = new URL(url).pathname;
  const method = request.method();
  const key = `${method} ${pathname}`;
  if (key === "GET /v1/meta") {
    await route.fulfill({ json: { product: "litos" } });
    return;
  }
  if (key === "GET /me") {
    await route.fulfill({ json: { email: "fixture@example.invalid", is_guest: false, tier: "free", trial_ends_at: null, checkout_available: false, usage: { contacts: { used: 0, limit: 10 }, drafts: { used: 0, limit: 10 }, resumes: { used: 0, limit: 10 } } } });
    return;
  }
  if (key === "GET /billing/state") {
    await route.fulfill({ json: {
      account_id: "settings-verification-fixture-account",
      entitlement: {
        schema_version: 2,
        policy_version: "litos-entitlements-v2",
        revision: "settings-verification-fixture",
        evaluated_at: "2026-08-14T00:00:00.000Z",
        access_class: "free_new",
        product: null,
        term: null,
        features: {},
        trial: null,
        subscription: null,
      },
    } });
    return;
  }
  if (key === "GET /billing/plans") {
    await route.fulfill({ json: {
      checkout_available: true,
      plans: [
        { plan_id: "litos_plus_week", amount_cents: 1999, checkout_available: true },
        { plan_id: "litos_plus_month", amount_cents: 3999, checkout_available: true },
        { plan_id: "litos_plus_quarter", amount_cents: 8999, checkout_available: true },
      ],
    } });
    return;
  }
  if (key === "GET /profile/application") {
    await route.fulfill({ json: {} });
    return;
  }
  if (key === "GET /onboarding/state") {
    scenario.onboardingReads += 1;
    await route.fulfill({ json: { automatic_submission_enabled: false, automatic_verification_enabled: scenario.consent, standing_consent_eligibility: null } });
    return;
  }
  if (key === "GET /email-connections") {
    scenario.connectionReads += 1;
    await route.fulfill({ json: scenario.connections });
    return;
  }
  if (key === "GET /application-email") {
    scenario.applicationEmailReads += 1;
    const response = scenario.applicationEmailResponses?.shift() ?? scenario.applicationEmail;
    await route.fulfill({ json: response });
    return;
  }
  /* Settings reads the notification permissions to draw the two controls under Automation. An
     expected read belongs in the stub rather than in `unknown`: this fixture's job is to fail when
     the page asks for something nobody sanctioned. Both off, which is what a fresh account holds. */
  if (key === "GET /notifications/preferences") {
    return route.fulfill({ json: {
      strong_match: { enabled: false, granted_at: null },
      employer_reply: { enabled: false, granted_at: null },
      deliverable: true,
      unsubscribe_configured: true,
    } });
  }
  if (key === "GET /sponsorship") {
    await route.fulfill({ status: 404, json: { error: "fixture" } });
    return;
  }
  if (key === "PUT /onboarding/automation") {
    scenario.automationWrites.push(JSON.parse(request.postData() ?? "{}"));
    scenario.consent = scenario.automationWrites.at(-1).automatic_verification_enabled;
    await route.fulfill({ json: { automatic_submission_enabled: false, automatic_verification_enabled: scenario.consent, automatic_submission_consent_version: null } });
    return;
  }
  if (key === "DELETE /email-connections/gmail") {
    scenario.disconnects += 1;
    scenario.connections = baseConnections(false, true);
    scenario.applicationEmail = scenario.disconnectApplicationEmail;
    scenario.consent = scenario.disconnectConsent;
    await route.fulfill({ json: { ok: true } });
    return;
  }

  unknownRequests.push(key);
  await route.fulfill({ status: 500, json: { error: `unstubbed ${key}` } });
});

function freshScenario(overrides = {}) {
  return {
    applicationEmail: inactiveAlias,
    connections: baseConnections(false, true),
    consent: false,
    applicationEmailReads: 0,
    connectionReads: 0,
    onboardingReads: 0,
    automationWrites: [],
    disconnects: 0,
    disconnectApplicationEmail: inactiveAlias,
    disconnectConsent: false,
    ...overrides,
  };
}

async function openSettings(search = "") {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard/settings${search}#automation`);
  await page.getByRole("heading", { name: "Automation" }).waitFor();
  return page;
}

test("healthy Litos alias works without personal-inbox consent", async () => {
  scenario = freshScenario({ applicationEmail: activeAlias });
  const page = await openSettings();
  const fallback = page.getByRole("checkbox", { name: "Use my connected inbox as a fallback" });
  assert.equal(await fallback.isChecked(), false);
  await page.getByText("The Litos application inbox is active. Codes sent to its packet-specific address do not require access to Gmail or Outlook.").waitFor();
  assert.equal(await page.getByText(/Reconnect Gmail or Outlook/).count(), 0);
  assert.deepEqual(scenario.automationWrites, []);
  await page.close();
});

test("unhealthy alias does not claim a verification route", async () => {
  scenario = freshScenario({ applicationEmail: inactiveAlias });
  const page = await openSettings();
  await page.getByText("No verification inbox is active. Litos will stop and ask you for the code.").waitFor();
  assert.equal(await page.getByText(/Litos application inbox is active/).count(), 0);
  await page.close();
});

test("connected personal inbox is used only with saved consent", async () => {
  scenario = freshScenario({ applicationEmail: inactiveAlias, connections: baseConnections(true, true), consent: true });
  const page = await openSettings();
  assert.equal(await page.getByRole("checkbox", { name: "Use my connected inbox as a fallback" }).isChecked(), true);
  await page.getByText("Your connected personal inbox is available as a fallback.").waitFor();
  await page.close();
});

test("no source leaves personal-inbox consent off and unavailable", async () => {
  scenario = freshScenario({
    applicationEmail: { configured: false, tracking_active: false, domain: null, aliases: [] },
    connections: baseConnections(false, false),
  });
  const page = await openSettings();
  const fallback = page.getByRole("checkbox", { name: "Use my connected inbox as a fallback" });
  assert.equal(await fallback.isChecked(), false);
  assert.equal(await fallback.isDisabled(), true);
  await page.getByText("No verification inbox is active. Litos will stop and ask you for the code.").waitFor();
  await page.close();
});

test("disconnect refreshes alias health and consent instead of retaining stale green state", async () => {
  scenario = freshScenario({ applicationEmail: activeAlias, connections: baseConnections(true, true), consent: true });
  const page = await openSettings();
  await page.getByText(/Litos application inbox is active/).waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Disconnect" }).click();
  await page.getByText("No verification inbox is active. Litos will stop and ask you for the code.").waitFor();
  assert.equal(await page.getByText(/Litos application inbox is active/).count(), 0);
  assert.equal(await page.getByRole("checkbox", { name: "Use my connected inbox as a fallback" }).isChecked(), false);
  assert.equal(scenario.disconnects, 1);
  assert.ok(scenario.applicationEmailReads >= 2, `expected a fresh application-email read, saw ${scenario.applicationEmailReads}`);
  assert.ok(scenario.connectionReads >= 2, `expected a fresh connection read, saw ${scenario.connectionReads}`);
  assert.ok(scenario.onboardingReads >= 2, `expected a fresh consent read, saw ${scenario.onboardingReads}`);
  await page.close();
});

test("disconnect keeps healthy Litos inbox status separate from personal fallback consent", async () => {
  scenario = freshScenario({
    applicationEmail: activeAlias,
    connections: baseConnections(true, true),
    consent: true,
    disconnectApplicationEmail: activeAlias,
    disconnectConsent: false,
  });
  const page = await openSettings();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Disconnect" }).click();
  await page.getByText("Gmail disconnected. Personal inbox fallback is off. The Litos application inbox remains active.").waitFor();
  await page.getByText(/The Litos application inbox is active/).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: "Use my connected inbox as a fallback" }).isChecked(), false);
  assert.equal(await page.getByText(/Email verification is off/).count(), 0);
  await page.close();
});

test("connection callback refreshes application-email health instead of retaining stale green state", async () => {
  scenario = freshScenario({
    applicationEmail: inactiveAlias,
    applicationEmailResponses: [activeAlias, inactiveAlias],
  });
  const page = await openSettings("?connection=gmail&status=failed");
  await page.getByText("No verification inbox is active. Litos will stop and ask you for the code.").waitFor();
  assert.equal(await page.getByText(/Litos application inbox is active/).count(), 0);
  assert.equal(scenario.applicationEmailReads, 2);
  await page.close();
});

test("failed personal-inbox callback preserves truthful healthy Litos inbox copy", async () => {
  scenario = freshScenario({
    applicationEmail: activeAlias,
    applicationEmailResponses: [activeAlias, activeAlias],
  });
  const page = await openSettings("?connection=gmail&status=failed");
  await page.getByText("Gmail connection was not completed. Personal inbox fallback is unchanged. The Litos application inbox remains active.").waitFor();
  await page.getByText(/The Litos application inbox is active/).waitFor();
  assert.equal(await page.getByText(/Email verification is still off/).count(), 0);
  assert.equal(scenario.applicationEmailReads, 2);
  await page.close();
});

test("failed callback preserves another consented personal inbox as the active fallback", async () => {
  scenario = freshScenario({
    applicationEmail: inactiveAlias,
    applicationEmailResponses: [inactiveAlias, inactiveAlias],
    connections: outlookConnected,
    consent: true,
  });
  const page = await openSettings("?connection=gmail&status=failed");
  await page.getByText("Gmail connection was not completed. Your other connected personal inbox remains available as a fallback.").waitFor();
  await page.getByText("Your connected personal inbox is available as a fallback.").waitFor();
  assert.equal(await page.getByText(/Email verification is still off/).count(), 0);
  assert.equal(await page.getByRole("checkbox", { name: "Use my connected inbox as a fallback" }).isChecked(), true);
  await page.close();
});

test.after(async () => {
  try {
    assert.deepEqual(unknownRequests, []);
  } finally {
    await context.close();
    await browser.close();
    server.kill("SIGTERM");
  }
});
