/** Production-browser proof for onboarding save, advance, reload, and Settings edit. */
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
const context = await browser.newContext({ viewport: { width: 1180, height: 900 } });
await context.addInitScript(() => {
  window.localStorage.setItem("rq_token", "country-flow-fixture-token");
  window.localStorage.setItem("rq_email", "fixture@example.invalid");
  window.localStorage.setItem("litos_session_mode_v1", "verified");
  window.localStorage.setItem("litos_has_history_v1", "true");
});
const page = await context.newPage();
const unknown = [];
const onboardingWrites = [];
const settingsWrites = [];
let step = "sponsorship";
let applicationProfile = {};

const onboardingState = () => ({
  step,
  completed_at: null,
  has_focus: true,
  has_sponsorship_answer: step !== "sponsorship",
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
  standing_consent_eligibility: null,
});

await context.route("**/*", async (route) => {
  const request = route.request();
  const url = request.url();
  if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
    await route.continue();
    return;
  }
  if (!url.startsWith(BACKEND_ORIGIN)) {
    unknown.push(`${request.method()} ${url}`);
    await route.abort();
    return;
  }
  const pathname = new URL(url).pathname;
  const key = `${request.method()} ${pathname}`;
  if (key === "GET /v1/meta") return route.fulfill({ json: { product: "litos" } });
  if (key === "GET /onboarding/state") return route.fulfill({ json: onboardingState() });
  if (key === "GET /profile") return route.fulfill({ json: {
    full_name: "Fixture Applicant", school: "Fixture University", grad_year: 2028,
    target_roles: ["Software Engineer", "Product Engineer", "Frontend Engineer", "Data Engineer", "Backend Engineer"],
    experience: [], projects: [], skills: ["TypeScript"], currently_enrolled: true,
  } });
  if (key === "GET /profile/application") return route.fulfill({ json: applicationProfile });
  if (key === "PUT /onboarding/work-eligibility") {
    const body = request.postDataJSON();
    onboardingWrites.push(body);
    applicationProfile = { ...applicationProfile, work_eligibility_by_country: body.records };
    step = "done";
    return route.fulfill({ json: body });
  }
  if (key === "PUT /profile/application") {
    const body = request.postDataJSON();
    settingsWrites.push(body);
    applicationProfile = { ...applicationProfile, ...body };
    return route.fulfill({ json: applicationProfile });
  }
  if (key === "GET /me") return route.fulfill({ json: {
    email: "fixture@example.invalid", is_guest: false, tier: "free", trial_ends_at: null,
    checkout_available: false, usage: { contacts: { used: 0, limit: 10 }, drafts: { used: 0, limit: 10 }, resumes: { used: 0, limit: 10 } },
  } });
  if (key === "GET /email-connections") return route.fulfill({ json: { configured: false, connections: [] } });
  if (key === "GET /application-email") return route.fulfill({ json: { configured: false, tracking_active: false, domain: null, aliases: [] } });
  if (key === "GET /sponsorship") return route.fulfill({ status: 404, json: { error: "fixture" } });
  unknown.push(key);
  return route.fulfill({ status: 500, json: { error: `unstubbed ${key}` } });
});

test.after(async () => {
  await context.close();
  await browser.close();
  server.kill("SIGTERM");
});

test("country repeater saves, advances, reloads, and remains editable in Settings", async (t) => {
  try {
    await page.goto(`${ORIGIN}/start`, { waitUntil: "networkidle" });
    await page.getByRole("combobox", { name: "Country", exact: true }).selectOption("US");
    await page.getByLabel("Authorized to work now?").selectOption("yes");
    await page.getByLabel("Need sponsorship before starting?").selectOption("no");
    await page.getByLabel("Need sponsorship later?").selectOption("yes");
    await page.getByLabel("Authorization type (optional)").fill("F-1 CPT");
    await page.getByLabel("Authorization expires (optional)").fill("2099-05-12");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Setup complete." }).waitFor();
    assert.equal(onboardingWrites.length, 1);
    assert.equal(onboardingWrites[0].records[0].country_code, "US");

    step = "sponsorship";
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("combobox", { name: "Country", exact: true }).waitFor();
    assert.equal(await page.getByRole("combobox", { name: "Country", exact: true }).inputValue(), "US");
    assert.equal(await page.getByLabel("Authorization type (optional)").inputValue(), "F-1 CPT");

    await page.goto(`${ORIGIN}/dashboard/settings#application-details`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Application details" }).waitFor();
    assert.equal(await page.getByRole("combobox", { name: "Country", exact: true }).inputValue(), "US");
    await page.getByLabel("Need sponsorship later?").selectOption("no");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Saved", { exact: true }).waitFor();
    assert.equal(settingsWrites.length, 1);
    assert.equal(settingsWrites[0].work_eligibility_by_country[0].needs_sponsorship_future, false);
    assert.deepEqual(unknown, []);
  } catch (reason) {
    const artifactDir = path.join(process.cwd(), "test-results", "country-eligibility-flow");
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, "failure.png"), fullPage: true }).catch(() => {});
    await writeFile(path.join(artifactDir, "failure.html"), await page.content()).catch(() => {});
    t.diagnostic(String(reason?.stack ?? reason));
    throw reason;
  }
});
