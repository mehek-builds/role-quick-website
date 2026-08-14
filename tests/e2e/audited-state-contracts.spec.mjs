/**
 * Browser regression coverage for audited billing, account deletion, and resume upload states.
 *
 * The suite runs the production Next build with a fabricated account. Every backend request is
 * intercepted, unknown network traffic is aborted, and no real credential or service is used.
 * Run with: npm run build -- --webpack && npm run test:audited-state-contracts
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const BACKEND = "https://student-outreach-backend.vercel.app";
const TOKEN = "audited-state-fixture-token";
const EMAIL = "fixture@example.invalid";
const ACCOUNT_ID = "audited-state-fixture-account";
const OFFER_ID = "11111111-2222-4333-8444-555555555555";
const DELETE_CONFIRMATION =
  "I am willingly deleting my account and I confirm that all of my history will be erased.";

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

test.after(async () => {
  await browser.close();
  server.kill("SIGTERM");
});

function account(overrides = {}) {
  return {
    email: EMAIL,
    is_guest: false,
    tier: "free",
    trial_ends_at: null,
    checkout_available: false,
    usage: {
      contacts: { used: 0, limit: 10 },
      drafts: { used: 0, limit: 10 },
      resumes: { used: 0, limit: 10 },
    },
    ...overrides,
  };
}

function billingState(accessClass = "free_new") {
  const paid = accessClass === "plus_paid";
  return {
    account_id: ACCOUNT_ID,
    entitlement: {
      schema_version: 2,
      policy_version: "litos-entitlements-v2",
      revision: "audited-state-fixture",
      evaluated_at: "2026-08-14T00:00:00.000Z",
      access_class: accessClass,
      product: paid ? "litos_plus" : null,
      term: paid ? "month" : null,
      features: {},
      trial: null,
      subscription: paid ? { provider: "stripe", status: "active", management_available: true } : null,
    },
  };
}

function dashboardReadFixture(key) {
  if (key === "GET /billing/state") return billingState();
  if (key === "GET /billing/plans") {
    return {
      checkout_available: true,
      plans: [
        { plan_id: "litos_plus_week", amount_cents: 1999, checkout_available: true },
        { plan_id: "litos_plus_month", amount_cents: 3999, checkout_available: true },
        { plan_id: "litos_plus_quarter", amount_cents: 8999, checkout_available: true },
      ],
    };
  }
  if (key === "GET /resume/history") return { resumes: [] };
  if (key === "GET /cover-letters") return { cover_letters: [] };
  if (key === "GET /applications") return { applications: [] };
  if (key === "GET /documents") return { documents: [] };
  if (key === "GET /profile/application") return {};
  return null;
}

async function fixtureContext({ fastTimers = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(({ token, email, shortenTimers }) => {
    window.localStorage.setItem("rq_token", token);
    window.localStorage.setItem("rq_email", email);
    window.localStorage.setItem("litos_session_mode_v1", "verified");
    window.localStorage.setItem("litos_has_history_v1", "true");
    if (shortenTimers) {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (handler, timeout = 0, ...args) =>
        nativeSetTimeout(handler, timeout >= 1200 ? 5 : timeout, ...args);
    }
  }, { token: TOKEN, email: EMAIL, shortenTimers: fastTimers });
  return context;
}

async function seedBillingReturnContext(context) {
  await context.addInitScript(({ accountId, offerId }) => {
    window.sessionStorage.setItem(`litos_billing_return_v2:${offerId}`, JSON.stringify({
      accountId,
      returnRoute: "/dashboard",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }));
  }, { accountId: ACCOUNT_ID, offerId: OFFER_ID });
}

function isLocal(url) {
  return url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank";
}

async function routeBilling(context, meResponse, {
  offerStatus = "paid",
  stateResponse = billingState("plus_paid"),
} = {}) {
  let meCalls = 0;
  let offerCalls = 0;
  let stateCalls = 0;
  let portalCalls = 0;
  const unknown = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (isLocal(url)) return route.continue();
    if (url.startsWith(BACKEND) && new URL(url).pathname === "/me") {
      meCalls += 1;
      return route.fulfill({ json: meResponse });
    }
    if (url.startsWith(BACKEND) && request.method() === "GET" && new URL(url).pathname === `/billing/offers/${OFFER_ID}`) {
      offerCalls += 1;
      return route.fulfill({ json: {
        offer_id: OFFER_ID,
        status: offerStatus,
        expires_at: "2099-01-01T00:00:00.000Z",
      } });
    }
    if (url.startsWith(BACKEND) && request.method() === "GET" && new URL(url).pathname === "/billing/state") {
      stateCalls += 1;
      return route.fulfill({ json: stateResponse });
    }
    if (url.startsWith(BACKEND) && request.method() === "POST" && new URL(url).pathname === "/billing/portal") {
      portalCalls += 1;
      return route.fulfill({ json: { provider: "stripe", url: "https://billing.stripe.com/p/session/audited-fixture" } });
    }
    if (url.startsWith(BACKEND) && request.method() === "GET" && new URL(url).pathname === "/billing/receipt") {
      return route.fulfill({ json: {
        provider: "stripe",
        plan: "pro",
        interval: "monthly",
        amount_cents: 3999,
        currency: "USD",
        paid_at: "2026-08-14T12:34:00.000Z",
        renews_at: "2026-09-14T12:34:00.000Z",
        reference: "123456789012",
      } });
    }
    if (url.startsWith(BACKEND) && new URL(url).pathname === "/v1/meta") {
      return route.fulfill({ json: { product: "litos" } });
    }
    if (url.startsWith("https://billing.stripe.com/")) return route.abort();
    unknown.push(`${request.method()} ${url}`);
    return route.abort();
  });
  return {
    get meCalls() { return meCalls; },
    get offerCalls() { return offerCalls; },
    get stateCalls() { return stateCalls; },
    get portalCalls() { return portalCalls; },
    unknown,
  };
}

test("cancelled billing return never reads the account", async () => {
  const context = await fixtureContext();
  const traffic = await routeBilling(context, account());
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/billing/return?status=cancelled`);
  await page.getByRole("heading", { name: "Nothing was charged." }).waitFor();
  assert.equal(traffic.meCalls, 0);
  assert.equal(traffic.offerCalls, 0);
  assert.equal(traffic.stateCalls, 0);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});

test("billing return confirms the exact paid offer and account record", async () => {
  const context = await fixtureContext();
  await seedBillingReturnContext(context);
  const traffic = await routeBilling(context, account({ tier: "pro", billing_status: "active", billing_portal_available: true }));
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/billing/return?context=${OFFER_ID}`);
  await page.getByRole("heading", { name: "You're on Litos+." }).waitFor();
  await page.getByLabel("Litos+ payment receipt for $39.99").waitFor();
  await page.getByRole("status").getByText("Payment complete").waitFor();
  assert.equal(await page.locator("[data-receipt-stage]").getAttribute("data-receipt-stage"), "complete");
  await page.getByText("Every month", { exact: true }).first().waitFor();
  await page.getByText("$39.99", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Open billing portal" }).click();
  for (let attempt = 0; attempt < 50 && traffic.portalCalls === 0; attempt += 1) await delay(10);
  assert.equal(traffic.portalCalls, 1);
  assert.equal(traffic.meCalls, 1);
  assert.equal(traffic.offerCalls, 1);
  assert.equal(traffic.stateCalls, 1);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});

test("billing return reaches its bounded timeout state", async () => {
  const context = await fixtureContext({ fastTimers: true });
  await seedBillingReturnContext(context);
  const traffic = await routeBilling(
    context,
    account({ tier: "free", billing_status: "inactive" }),
    { offerStatus: "checkout_created", stateResponse: billingState() },
  );
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/billing/return?context=${OFFER_ID}`);
  await page.getByText(/Payment could not be confirmed yet/).waitFor();
  assert.equal(traffic.meCalls, 6);
  assert.equal(traffic.offerCalls, 6);
  assert.equal(traffic.stateCalls, 6);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});

async function routeSettings(context, deleteResponse, exportResponse = { status: 200, json: { email: EMAIL } }) {
  let deleteCalls = 0;
  const unknown = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (isLocal(url)) return route.continue();
    if (!url.startsWith(BACKEND)) {
      unknown.push(`${request.method()} ${url}`);
      return route.abort();
    }
    const key = `${request.method()} ${new URL(url).pathname}`;
    if (key === "GET /v1/meta") return route.fulfill({ json: { product: "litos" } });
    if (key === "GET /me") return route.fulfill({ json: account() });
    if (key === "GET /profile/application") return route.fulfill({ json: {} });
    if (key === "GET /onboarding/state") return route.fulfill({ json: { automatic_submission_enabled: false, automatic_verification_enabled: false, standing_consent_eligibility: null } });
    if (key === "GET /email-connections") return route.fulfill({ json: { configured: true, connections: [{ provider: "gmail", connected: false, status: "NOT_CONNECTED" }, { provider: "outlook", connected: false, status: "NOT_CONNECTED" }] } });
    if (key === "GET /application-email") return route.fulfill({ json: { configured: true, tracking_active: false, tracking_blocked_reason: "inbound_disabled", domain: "applications@trylitos.com", forward_to: EMAIL, aliases: [] } });
    if (key === "GET /sponsorship") return route.fulfill({ status: 404, json: { error: "fixture" } });
    if (key === "GET /account/export") return route.fulfill(exportResponse);
    if (key === "DELETE /account") {
      deleteCalls += 1;
      const body = JSON.parse(request.postData() ?? "{}");
      assert.deepEqual(body, { confirm_email: EMAIL });
      const response = typeof deleteResponse === "function" ? await deleteResponse() : deleteResponse;
      return route.fulfill(response);
    }
    const dashboardFixture = dashboardReadFixture(key);
    if (dashboardFixture !== null) return route.fulfill({ json: dashboardFixture });
    unknown.push(key);
    return route.fulfill({ status: 500, json: { error: `unstubbed ${key}` } });
  });
  return { get deleteCalls() { return deleteCalls; }, unknown };
}

async function openDeleteDialog(context) {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard/settings#sign-in`);
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await page.getByRole("heading", { name: "Delete your account?" }).waitFor();
  return page;
}

test("account deletion requires the exact confirmation sentence without a request", async () => {
  const context = await fixtureContext();
  const traffic = await routeSettings(context, { status: 204 });
  const page = await openDeleteDialog(context);
  const confirmation = page.getByLabel("Confirmation sentence");
  await confirmation.fill(DELETE_CONFIRMATION.slice(0, -1));
  assert.equal(await page.getByRole("button", { name: "Delete account permanently" }).isDisabled(), true);
  await confirmation.fill(DELETE_CONFIRMATION.toLowerCase());
  assert.equal(await page.getByRole("button", { name: "Delete account permanently" }).isDisabled(), true);
  await confirmation.fill(` ${DELETE_CONFIRMATION}`);
  assert.equal(await page.getByRole("button", { name: "Delete account permanently" }).isDisabled(), true);
  await confirmation.fill(`${DELETE_CONFIRMATION} `);
  assert.equal(await page.getByRole("button", { name: "Delete account permanently" }).isDisabled(), true);
  assert.equal(traffic.deleteCalls, 0);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});

test("account deletion rejection leaves the dialog usable", async () => {
  const context = await fixtureContext();
  const traffic = await routeSettings(context, { status: 409, json: { error: "Deletion could not be completed. Try again." } });
  const page = await openDeleteDialog(context);
  await page.getByLabel("Confirmation sentence").fill(DELETE_CONFIRMATION);
  const submit = page.getByRole("button", { name: "Delete account permanently" });
  await submit.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("alert").filter({ hasText: "Deletion could not be completed. Try again." }).waitFor();
  assert.equal(await dialog.evaluate((element) => element.open), true);
  assert.equal(await submit.isEnabled(), true);
  assert.equal(traffic.deleteCalls, 1);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});

test("account export rejection is announced inside the open deletion dialog", async () => {
  const context = await fixtureContext();
  const traffic = await routeSettings(
    context,
    { status: 204 },
    { status: 503, json: { error: "Export is temporarily unavailable." } },
  );
  const page = await openDeleteDialog(context);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Export data" }).click();
  await dialog.getByRole("alert").filter({ hasText: "Export is temporarily unavailable." }).waitFor();
  assert.equal(await dialog.evaluate((element) => element.open), true);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});

test("account deletion cannot be dismissed while the request is pending", async () => {
  let releaseDelete;
  const pendingDelete = new Promise((resolve) => { releaseDelete = resolve; });
  const context = await fixtureContext();
  const traffic = await routeSettings(context, async () => {
    await pendingDelete;
    return { status: 409, json: { error: "Deletion was not completed." } };
  });
  const page = await openDeleteDialog(context);
  const dialog = page.getByRole("dialog");
  await page.getByLabel("Confirmation sentence").fill(DELETE_CONFIRMATION);
  await page.getByRole("button", { name: "Delete account permanently" }).click();
  await page.getByRole("button", { name: "Deleting..." }).waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Keep account" }).isDisabled(), true);
  assert.equal(await dialog.getByRole("button", { name: "Export data" }).isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await dialog.evaluate((element) => element.open), true);
  releaseDelete();
  await dialog.getByRole("alert").filter({ hasText: "Deletion was not completed." }).waitFor();
  assert.equal(traffic.deleteCalls, 1);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});

test("successful account deletion clears the session and shows completion", async () => {
  const context = await fixtureContext();
  const traffic = await routeSettings(context, { status: 204 });
  const page = await openDeleteDialog(context);
  await page.getByLabel("Confirmation sentence").fill(DELETE_CONFIRMATION);
  await page.getByRole("button", { name: "Delete account permanently" }).click();
  await page.getByRole("heading", { name: "Your Litos account was deleted." }).waitFor();
  const storage = await page.evaluate(() => ({
    token: localStorage.getItem("rq_token"),
    email: localStorage.getItem("rq_email"),
    mode: localStorage.getItem("litos_session_mode_v1"),
  }));
  assert.deepEqual(storage, { token: null, email: null, mode: null });
  assert.equal(traffic.deleteCalls, 1);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});

async function routeResume(context, {
  firstUploadDelay = 250,
  initialBankDelay = 0,
  firstUploadResponse = { status: 200, json: { name: "Fixture Student", school: "Fixture University" } },
} = {}) {
  let profileUploads = 0;
  let bankReads = 0;
  const unknown = [];
  const parsedEntries = [{
    id: "entry-1",
    type: "job",
    org: "Fixture Labs",
    title: "Engineer",
    date_range: "2025",
    location: "Remote",
    bullet_variants: ["Built a tested fixture."],
    tags: ["testing"],
  }];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (isLocal(url)) return route.continue();
    if (!url.startsWith(BACKEND)) {
      unknown.push(`${request.method()} ${url}`);
      return route.abort();
    }
    const key = `${request.method()} ${new URL(url).pathname}`;
    if (key === "GET /v1/meta") return route.fulfill({ json: { product: "litos" } });
    if (key === "GET /me") return route.fulfill({ json: account() });
    if (key === "GET /onboarding/state") {
      return route.fulfill({
        json: {
          step: "done",
          flow_version: 2,
          flow_completed: true,
          requires_onboarding: false,
          automatic_submission_enabled: false,
          automatic_verification_enabled: false,
          standing_consent_eligibility: null,
        },
      });
    }
    if (key === "GET /profile") return route.fulfill({ status: 404, json: { error: "missing" } });
    if (key === "GET /profile/experience-bank") {
      bankReads += 1;
      if (bankReads === 1 && initialBankDelay > 0) await delay(initialBankDelay);
      return route.fulfill({ json: { entries: bankReads > 1 ? parsedEntries : [] } });
    }
    if (key === "GET /profile/targeting") return route.fulfill({ json: { titles: ["Software Engineer"], categories: ["software"] } });
    if (key === "POST /profile") {
      profileUploads += 1;
      if (profileUploads === 1) {
        await delay(firstUploadDelay);
        return route.fulfill(firstUploadResponse);
      }
      return route.fulfill({ json: { name: "Fixture Student", school: "Fixture University" } });
    }
    const dashboardFixture = dashboardReadFixture(key);
    if (dashboardFixture !== null) return route.fulfill({ json: dashboardFixture });
    unknown.push(key);
    return route.fulfill({ status: 500, json: { error: `unstubbed ${key}` } });
  });
  return {
    get profileUploads() { return profileUploads; },
    get bankReads() { return bankReads; },
    unknown,
  };
}

test("resume upload validates PDF input before making a request", async () => {
  const context = await fixtureContext();
  const traffic = await routeResume(context);
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard/resume`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Upload resume PDF" }).waitFor();
  await page.locator('input[type="file"]').setInputFiles({ name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from("not a pdf") });
  await page.getByRole("alert").filter({ hasText: "Choose one PDF no larger than 10 MB." }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Retry" }).isVisible(), true);
  assert.equal(traffic.profileUploads, 0);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});

test("resume upload controls stay disabled until the initial bank read settles", async () => {
  const context = await fixtureContext();
  const traffic = await routeResume(context, { initialBankDelay: 800 });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard/resume`, { waitUntil: "domcontentloaded" });
  const input = page.locator('input[type="file"]');
  const button = page.getByRole("button", { name: /Upload resume PDF|Replace resume/ });
  await input.waitFor({ state: "attached" });
  assert.equal(await input.isDisabled(), true);
  assert.equal(await button.isDisabled(), true);
  assert.equal(await page.getByLabel("Resume PDF upload drop zone").getAttribute("aria-disabled"), "true");
  await page.waitForFunction(() => !document.querySelector('input[type="file"]')?.disabled);
  assert.equal(traffic.profileUploads, 0);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});

test("resume upload accepts a PDF filename with empty or generic MIME metadata", async () => {
  for (const mimeType of ["", "application/octet-stream"]) {
    const context = await fixtureContext();
    const traffic = await routeResume(context);
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/dashboard/resume`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Upload resume PDF" }).waitFor();
    await page.locator('input[type="file"]').setInputFiles({ name: "RESUME.PDF", mimeType, buffer: Buffer.from("%PDF-1.4 fixture") });
    await page.getByText("Upload complete").waitFor();
    const organization = page.getByLabel("Organization").first();
    await organization.waitFor();
    assert.equal(await organization.inputValue(), "Fixture Labs");
    assert.equal(await page.getByRole("button", { name: "Save changes" }).isDisabled(), true);
    assert.equal(traffic.profileUploads, 1);
    assert.deepEqual(traffic.unknown, []);
    await context.close();
  }
});

test("resume upload blocks a concurrent selection, then retries a genuine failure", async () => {
  const context = await fixtureContext();
  const traffic = await routeResume(context, {
    firstUploadDelay: 800,
    firstUploadResponse: { status: 503, json: { error: "Resume service unavailable. Try again." } },
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard/resume`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Upload resume PDF" }).waitFor();
  await page.locator('input[type="file"]').setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fixture") });
  await page.getByText("Reading the PDF...").waitFor();
  assert.equal(await page.locator('input[type="file"]').isDisabled(), true);
  assert.equal(await page.getByLabel("Resume PDF upload drop zone").getAttribute("aria-busy"), "true");
  await page.evaluate(() => {
    const zone = document.querySelector('[aria-label="Resume PDF upload drop zone"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File(["%PDF-1.4 second fixture"], "second.pdf", { type: "application/pdf" }));
    zone?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  assert.equal(traffic.profileUploads, 1);
  assert.equal(await page.getByText("resume.pdf", { exact: true }).isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Cancel" }).count(), 0);
  await page.waitForTimeout(100);
  assert.equal(traffic.profileUploads, 1);
  await page.getByRole("alert").filter({ hasText: "Resume service unavailable. Try again." }).waitFor();
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByText("Upload complete").waitFor();
  const organization = page.getByLabel("Organization").first();
  await organization.waitFor();
  assert.equal(await organization.inputValue(), "Fixture Labs");
  assert.equal(await page.getByRole("button", { name: "Save changes" }).isDisabled(), true);
  assert.equal(traffic.profileUploads, 2);
  assert.equal(traffic.bankReads, 2);
  assert.deepEqual(traffic.unknown, []);
  await context.close();
});
