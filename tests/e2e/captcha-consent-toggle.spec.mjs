/**
 * Browser proof for the human-check permission, on both surfaces that grant it.
 *
 * The point of running this in a browser rather than reading the source: the assertions are the
 * checkbox an applicant would see and the request body the server would receive, so a screen that
 * renders the words without wiring them, or wires them to the wrong column, fails here. Before this
 * shipped, nothing on any surface wrote `automatic_captcha_enabled` at all.
 *
 * The scenario this suite is really built around is the STALE GRANT: roughly 25 production accounts
 * hold a real consent stamped with a version the backend constant has since superseded. The API
 * answers false for them with the original date still attached. Two things must be true on screen,
 * and both are asserted below: the box reads unticked with no date printed, and ticking it writes a
 * fresh grant.
 *
 * This suite uses a production Next build and a fabricated account. Every backend request is
 * intercepted, every unknown route is recorded and refused, and no request can reach a real service.
 * Run with: npm run build && npm run test:captcha-consent
 */

import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { isSanctionedThirdParty } from "./sanctioned-third-parties.mjs";

const BACKEND = "https://student-outreach-backend.vercel.app";
const TOKEN = "captcha-consent-fixture-token";

const CAPTCHA_LABEL = "Pick my application back up after I clear a check";

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
const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
await context.addInitScript((token) => {
  window.localStorage.setItem("rq_token", token);
  window.localStorage.setItem("rq_email", "fixture@example.invalid");
  window.localStorage.setItem("litos_session_mode_v1", "verified");
  window.localStorage.setItem("litos_has_history_v1", "true");
}, TOKEN);

/** The live wording version, as AUTOMATIC_CAPTCHA_CONSENT_VERSION pins it in the API. */
const LIVE_VERSION = "2026-08-04";
const GRANT_STAMP = "2026-08-12T09:14:00.000Z";

function onboardingState(overrides = {}) {
  return {
    step: "done",
    completed_at: null,
    has_focus: true,
    has_resume: true,
    has_impact_review: true,
    has_sponsorship_answer: true,
    has_base_resume: true,
    has_applied: false,
    has_targeting: true,
    learned: [],
    gaps: [],
    includes_gaps_step: false,
    source_pages: 1,
    source_resume_url: null,
    harvest_active: false,
    standing_consent_eligibility: null,
    automatic_submission_enabled: false,
    automatic_submission_consented_at: null,
    automatic_submission_consent_version: null,
    automatic_verification_enabled: false,
    automatic_captcha_enabled: false,
    automatic_captcha_consented_at: null,
    automatic_captcha_consent_version: LIVE_VERSION,
    ...overrides,
  };
}

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
    if (isSanctionedThirdParty(url)) {
      await route.abort();
      return;
    }
    unknownRequests.push(`${request.method()} ${url}`);
    await route.abort();
    return;
  }

  const pathname = new URL(url).pathname;
  const key = `${request.method()} ${pathname}`;
  if (key === "GET /v1/meta") {
    await route.fulfill({ json: { product: "litos" } });
    return;
  }
  if (key === "GET /me") {
    await route.fulfill({ json: { email: "fixture@example.invalid", is_guest: false, tier: "free", trial_ends_at: null, checkout_available: false, usage: { contacts: { used: 0, limit: 10 }, drafts: { used: 0, limit: 10 }, resumes: { used: 0, limit: 10 } } } });
    return;
  }
  if (key === "GET /profile/application") {
    await route.fulfill({ json: {} });
    return;
  }
  if (key === "GET /profile") {
    await route.fulfill({ json: { full_name: "Fixture Student", school: "USC", grad_year: 2028, target_roles: ["Software Engineer"], currently_enrolled: true, skills: [], projects: [], experience: [] } });
    return;
  }
  if (key === "GET /profile/targeting") {
    await route.fulfill({ json: { categories: null, titles: ["Software Engineer"], role_types: ["internship"], locations: null, remote_only: false, primary_period: null, backup_period: null } });
    return;
  }
  if (key === "GET /onboarding/state") {
    await route.fulfill({ json: scenario.state });
    return;
  }
  if (key === "GET /email-connections") {
    await route.fulfill({ json: { configured: true, connections: [{ provider: "gmail", connected: false, status: "NOT_CONNECTED" }, { provider: "outlook", connected: false, status: "NOT_CONNECTED" }] } });
    return;
  }
  if (key === "GET /application-email") {
    await route.fulfill({ json: { configured: true, tracking_active: false, tracking_blocked_reason: "inbound_disabled", domain: "applications@trylitos.com", forward_to: "fixture@example.invalid", aliases: [] } });
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
    const body = JSON.parse(request.postData() ?? "{}");
    scenario.automationWrites.push(body);
    /* The write refuses, so the screen has to put itself back. Nothing is applied to the state. */
    if (scenario.failAutomationWrite) {
      await route.fulfill({ status: 500, json: { error: "fixture refused the write" } });
      return;
    }
    /* An API deployed before this column echoes neither field. The screen must keep what it had
       rather than read the silence as a revocation, and that applies to the date too. */
    if (scenario.omitCaptchaFieldsOnWrite) {
      await route.fulfill({
        json: {
          automatic_submission_enabled: scenario.state.automatic_submission_enabled,
          automatic_submission_consent_version: null,
          automatic_verification_enabled: scenario.state.automatic_verification_enabled,
        },
      });
      return;
    }
    /* The server applies each named field and echoes the VERSION-CHECKED VERDICT, exactly as
       routes/onboarding.ts does. An unnamed field is left alone. A fresh grant is stamped with the
       CURRENT version, which is what makes ticking the box the repair for a stale row. */
    if (body.automatic_captcha_enabled !== undefined) {
      scenario.state.automatic_captcha_enabled = body.automatic_captcha_enabled;
      scenario.state.automatic_captcha_consented_at = body.automatic_captcha_enabled ? GRANT_STAMP : null;
      scenario.state.automatic_captcha_consent_version = LIVE_VERSION;
    }
    if (body.automatic_submission_enabled !== undefined) {
      scenario.state.automatic_submission_enabled = body.automatic_submission_enabled;
    }
    if (body.automatic_verification_enabled !== undefined) {
      scenario.state.automatic_verification_enabled = body.automatic_verification_enabled;
    }
    await route.fulfill({
      json: {
        automatic_submission_enabled: scenario.state.automatic_submission_enabled,
        automatic_submission_consent_version: null,
        automatic_verification_enabled: scenario.state.automatic_verification_enabled,
        automatic_captcha_enabled: scenario.state.automatic_captcha_enabled,
        automatic_captcha_consented_at: scenario.state.automatic_captcha_consented_at,
      },
    });
    return;
  }
  if (key === "POST /onboarding/complete") {
    scenario.completeWrites.push(JSON.parse(request.postData() ?? "{}"));
    await route.fulfill({ json: { ok: true, automatic_verification_enabled: false } });
    return;
  }

  /* Everything the dashboard asks for after "See my jobs" navigates. Answered emptily rather than
     500'd so the completion case does not fail on a screen it is not testing. */
  await route.fulfill({ status: 200, json: {} });
});

function freshScenario(stateOverrides = {}, options = {}) {
  return {
    state: onboardingState(stateOverrides),
    automationWrites: [],
    completeWrites: [],
    failAutomationWrite: false,
    omitCaptchaFieldsOnWrite: false,
    ...options,
  };
}

async function openSettings() {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard/settings#automation`);
  await page.getByRole("heading", { name: "Automation" }).waitFor();
  return page;
}

test("Settings has the control at all, and it reflects the server's verdict", async () => {
  scenario = freshScenario({
    automatic_captcha_enabled: true,
    automatic_captcha_consented_at: GRANT_STAMP,
  });
  const page = await openSettings();
  assert.equal(await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).isChecked(), true);
  assert.equal(await page.getByText(/^Granted /).count(), 1);
  // Reading the screen writes nothing.
  assert.deepEqual(scenario.automationWrites, []);
  await page.close();
});

/* THE CASE THE VERSION CHECK EXISTS FOR, and the live state of the accounts stamped by the unmerged
 * branch. The box was ticked on a real day; the constant has since moved, so the server answers
 * false with the original date still attached. */
test("a grant against superseded wording reads as not granted, with no date on screen", async () => {
  scenario = freshScenario({
    automatic_captcha_enabled: false,
    automatic_captcha_consented_at: "2026-08-04T11:02:00.000Z",
  });
  const page = await openSettings();
  assert.equal(await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).isChecked(), false);
  assert.equal(await page.getByText(/^Granted /).count(), 0);
  await page.close();
});

/* The repair, end to end: the whole reason this control had to reach Settings and not /start alone.
 * Every account in the stale population finished setup long ago. */
test("a stale account can re-consent from Settings, and the new grant is dated", async () => {
  scenario = freshScenario({
    automatic_captcha_enabled: false,
    automatic_captcha_consented_at: "2026-08-04T11:02:00.000Z",
  });
  const page = await openSettings();
  await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).check();
  await page.getByText(/^Granted /).waitFor();
  assert.deepEqual(scenario.automationWrites, [{ automatic_captcha_enabled: true }]);
  assert.equal(scenario.state.automatic_captcha_enabled, true);
  assert.equal(scenario.state.automatic_captcha_consent_version, LIVE_VERSION);
  assert.equal(await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).isChecked(), true);
  await page.close();
});

test("granting names one column and leaves the other automation permissions alone", async () => {
  scenario = freshScenario();
  const page = await openSettings();
  await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).check();
  await page.getByText(/^Granted /).waitFor();
  // One key, always: an omitted field is "leave it alone" and an explicit false is a revocation, so
  // naming a neighbour here would revoke a permission nobody touched.
  assert.deepEqual(scenario.automationWrites, [{ automatic_captcha_enabled: true }]);
  assert.equal(scenario.state.automatic_submission_enabled, false);
  assert.equal(scenario.state.automatic_verification_enabled, false);
  await page.close();
});

test("revoking sends an explicit false for that column only", async () => {
  scenario = freshScenario({
    automatic_captcha_enabled: true,
    automatic_captcha_consented_at: GRANT_STAMP,
  });
  const page = await openSettings();
  assert.equal(await page.getByText(/^Granted /).count(), 1);
  await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).uncheck();
  await page.waitForFunction(() => {
    const checkbox = document.getElementById("settings-captcha-consent");
    return checkbox instanceof HTMLInputElement
      && !checkbox.checked
      && !checkbox.parentElement?.textContent?.includes("Granted ");
  });
  assert.deepEqual(scenario.automationWrites, [{ automatic_captcha_enabled: false }]);
  assert.equal(await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).isChecked(), false);
  await page.close();
});

/* The copy is the consent, so the two claims that make it honest have to be on the screen that
 * takes the grant, not in a doc comment. */
/* A refused write must put the screen back where it was. Without this the box would keep showing a
 * grant the server rejected, which is the misreport the whole module exists to prevent. */
test("a refused write rolls the box and its date back, and says so", async () => {
  scenario = freshScenario(
    { automatic_captcha_enabled: true, automatic_captcha_consented_at: GRANT_STAMP },
    { failAutomationWrite: true },
  );
  const page = await openSettings();
  assert.equal(await page.getByText(/^Granted /).count(), 1);
  // `uncheck()` requires the box to remain unchecked after its click. This fixture rejects the
  // request immediately, so the correct rollback can finish before Playwright checks that
  // intermediate state. A plain click still exercises the real control without misclassifying the
  // deliberately fast rollback as a failed interaction.
  await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).click();
  await page.getByText(/fixture refused the write/).waitFor();
  assert.deepEqual(scenario.automationWrites, [{ automatic_captcha_enabled: false }]);
  // Back to granted, date and all: the server never accepted the revocation.
  assert.equal(await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).isChecked(), true);
  assert.equal(await page.getByText(/^Granted /).count(), 1);
  await page.close();
});

/* Deploy skew, write side: the API answers without the column. Silence is not a revocation, and it
 * is not a cleared date either. */
test("a write response that omits the column changes nothing on screen", async () => {
  scenario = freshScenario(
    { automatic_captcha_enabled: true, automatic_captcha_consented_at: GRANT_STAMP },
    { omitCaptchaFieldsOnWrite: true },
  );
  const page = await openSettings();
  const writeResponse = page.waitForResponse((response) => (
    response.request().method() === "PUT"
    && new URL(response.url()).pathname.endsWith("/onboarding/automation")
  ));
  await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).click();
  await writeResponse;
  assert.deepEqual(scenario.automationWrites, [{ automatic_captcha_enabled: false }]);
  // The optimistic uncheck is reconciled back to what the screen already held, date included.
  await page.waitForFunction((label) => {
    const control = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((node) => node.getAttribute("aria-label") === label);
    return control instanceof HTMLInputElement && control.checked;
  }, CAPTCHA_LABEL);
  assert.equal(await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).isChecked(), true);
  assert.equal(await page.getByText(/^Granted /).count(), 1);
  await page.close();
});

test("the boundary is on the screen that grants the permission", async () => {
  scenario = freshScenario();
  const page = await openSettings();
  await page.getByText(
    /Litos never solves it: you clear it yourself, in your own browser\./,
  ).waitFor();
  await page.locator("#settings-captcha-consent-boundary").filter({
    hasText: /never solves the check, never reads its token, and never answers it for you/,
  }).waitFor();
  await page.locator("#settings-captcha-consent-boundary").filter({
    hasText: /whether an application is ever submitted is a separate permission/,
  }).waitFor();
  // Off is not silence, and the screen says so.
  await page.locator("#settings-captcha-consent-off").filter({
    hasText: /still tells you the check is there and what is left to do/,
  }).waitFor();
  await page.locator("#settings-captcha-consent-revocable").filter({
    hasText: /You can turn this off at any time in Settings\./,
  }).waitFor();
  await page.close();
});

test("onboarding asks once and sends the answer through onboarding complete", async () => {
  scenario = freshScenario();
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/start`);
  await page.getByRole("heading", { name: "Setup complete." }).waitFor();
  await page.getByText("Optional permissions", { exact: true }).click();
  assert.equal(await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).isChecked(), false);
  await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).check();
  await page.getByRole("button", { name: "See my jobs" }).click();
  await page.waitForFunction(() => window.location.pathname !== "/start");
  assert.equal(scenario.completeWrites.length, 1);
  assert.equal(scenario.completeWrites[0].automatic_captcha_enabled, true);
  // Setup never grants it silently: nothing was written before the button was pressed.
  assert.deepEqual(scenario.automationWrites, []);
  await page.close();
});

test("onboarding leaves an unchanged false permission untouched", async () => {
  scenario = freshScenario();
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/start`);
  await page.getByRole("heading", { name: "Setup complete." }).waitFor();
  await page.getByRole("button", { name: "See my jobs" }).click();
  await page.waitForFunction(() => window.location.pathname !== "/start");
  // The server already reported false. An untouched control writes nothing and leaves that verdict
  // unchanged, just as an untouched true permission must remain granted.
  assert.equal("automatic_captcha_enabled" in scenario.completeWrites[0], false);
  await page.close();
});

/* THE SILENT REVOCATION, and it is why setup sends nothing rather than false here. GET lands on an
 * instance that predates the column, so the box renders unticked for an account that may well hold
 * the permission. Pressing the button must not write that guess back as a revocation. */
test("setup omits the field entirely when the server never reported it", async () => {
  scenario = freshScenario();
  delete scenario.state.automatic_captcha_enabled;
  delete scenario.state.automatic_captcha_consented_at;
  delete scenario.state.automatic_captcha_consent_version;
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/start`);
  await page.getByRole("heading", { name: "Setup complete." }).waitFor();
  await page.getByText("Optional permissions", { exact: true }).click();
  assert.equal(await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).isChecked(), false);
  await page.getByRole("button", { name: "See my jobs" }).click();
  await page.waitForFunction(() => window.location.pathname !== "/start");
  // Not false. Absent, so the server leaves whatever is stored exactly as it is.
  assert.equal("automatic_captcha_enabled" in scenario.completeWrites[0], false);
  await page.close();
});

test("a ticked box is still sent as true against a server that reported nothing", async () => {
  scenario = freshScenario();
  delete scenario.state.automatic_captcha_enabled;
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/start`);
  await page.getByRole("heading", { name: "Setup complete." }).waitFor();
  await page.getByText("Optional permissions", { exact: true }).click();
  await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).check();
  await page.getByRole("button", { name: "See my jobs" }).click();
  await page.waitForFunction(() => window.location.pathname !== "/start");
  // A tick is a grant just performed, so it is never silence.
  assert.equal(scenario.completeWrites[0].automatic_captcha_enabled, true);
  await page.close();
});

test("the disclosure is tied to the checkbox for assistive tech", async () => {
  scenario = freshScenario();
  const page = await openSettings();
  const described = await page.evaluate(() => {
    const box = document.getElementById("settings-captcha-consent");
    const ids = (box?.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
  });
  // The two claims that make this consent honest have to be in what a screen reader announces.
  assert.match(described, /never solves the check, never reads its token/);
  assert.match(described, /separate permission/);
  assert.match(described, /still tells you the check is there/);
  await page.close();
});

test("onboarding seeds from a permission already granted in Settings", async () => {
  scenario = freshScenario({
    automatic_captcha_enabled: true,
    automatic_captcha_consented_at: GRANT_STAMP,
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/start`);
  await page.getByRole("heading", { name: "Setup complete." }).waitFor();
  // Walking back through setup must not silently revoke what is already held.
  assert.equal(await page.getByRole("checkbox", { name: CAPTCHA_LABEL }).isChecked(), true);
  await page.getByRole("button", { name: "See my jobs" }).click();
  await page.waitForFunction(() => window.location.pathname !== "/start");
  assert.equal("automatic_captcha_enabled" in scenario.completeWrites[0], false);
  assert.equal(scenario.state.automatic_captcha_enabled, true);
  await page.close();
});

test("no request left the fixture", () => {
  assert.deepEqual(unknownRequests, []);
});

test.after(async () => {
  await context.close();
  await browser.close();
  server.kill("SIGTERM");
});
