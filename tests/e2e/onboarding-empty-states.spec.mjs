import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

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
      const response = await fetch(`${origin}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The production server is still starting.
    }
    await delay(250);
  }
  throw new Error(`next start never answered on ${origin}`);
}

const port = await freePort();
const ORIGIN = `http://localhost:${port}`;
const server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "ignore", "inherit"],
});
await waitForServer(ORIGIN, server);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

after(async () => {
  await browser.close();
  server.kill("SIGTERM");
});

/* SEVEN CHECKPOINTS, SIX STEPS, and the two numbers in each rail string are the point of the list.
 *
 * The original six omitted `gaps`, which is why it passed while that screen reported itself as
 * "Setup: step 1 of 6, Your resume": the screen was reinstated by #279 and never added to STEPS,
 * and a checkpoint list that never visits a screen cannot catch the screen lying about where it
 * is. #285 added it and made the denominator a flat 7, which fixed the lying screen and left the
 * printed count skipping a number for everyone who never sees it.
 *
 * So the denominator is now the steps the student's own flow contains (components/start/ui.tsx
 * `flowSteps`), and it is SIX on every checkpoint but one. `gaps` is the conditional screen and is
 * counted only while the flow is standing on it, because the step is derived server-side and
 * backend #116 removed 'gaps' from the union `onboardingStepFrom` can return: no student is routed
 * there, so counting it for the other six screens would promise a screen that never comes.
 *
 * The `gaps` row is therefore "step 6 of 7", and it is the #285 regression guard rather than an
 * inconsistency: `?qa=1&step=gaps` forces the screen to render, and a rendered screen must name its
 * own position correctly. "Step 1 of 6, Your resume" here is the exact bug that fix existed for.
 *
 * The done heading moved from "Your job matches are ready." to "Setup complete." when that screen
 * gained a confirmation: the forward-looking line is still there, below the receipt, as the
 * first-action prompt. The status text below is the sr-only live region, kept from this file's
 * original assertion and shortened with it. */
test("all seven onboarding checkpoints render with a progress indicator", async () => {
  const checkpoints = [
    ["resume", "Start with your resume.", "Setup: step 1 of 6, Your resume"],
    ["impact", "Make your most recent work count.", "Setup: step 2 of 6, Your impact"],
    ["focus", "Here's where we'd start.", "Setup: step 3 of 6, Your roles"],
    ["sponsorship", "Where can you work?", "Setup: step 4 of 6, Work visa"],
    ["base", "One page, ready.", "Setup: step 5 of 6, Your one page"],
    /* The QA fixture reports outstanding gaps on every step but `done`, so the five rows above are
       also the assertion that outstanding gaps DO NOT inflate the denominator: a screen the flow
      cannot route to is not part of the flow, however much the profile is missing. */
    ["gaps", "A few details.", "Setup: step 6 of 7, A few details"],
    ["done", "Setup complete.", "Setup: step 6 of 6, Done"],
  ];

  for (const [step, heading, rail] of checkpoints) {
    await page.goto(`${ORIGIN}/start?qa=1&step=${step}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: heading }).waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(`[aria-label="${rail}"]`).waitFor({ state: "visible" });
  }

  await page.getByText("Setup complete.", { exact: true }).first().waitFor({ state: "visible" });
});

for (const state of [
  ["applications", "No applications yet", "Start an application"],
  ["outreach", "No emails yet", "Add Litos to Chrome"],
  ["jobs", "No matching roles", "Change job preferences"],
]) {
  const [route, heading, action] = state;
  test(`${route} has a distinct first-use state`, async () => {
    await page.goto(`${ORIGIN}/dashboard/${route}?qa=empty`, { waitUntil: "domcontentloaded" });
    const title = page.getByRole("heading", { name: heading });
    await title.waitFor({ state: "visible", timeout: 20_000 });
    assert.equal(await title.locator("xpath=..").locator("svg").count(), 1);
    if (action) await page.getByRole("link", { name: action }).or(page.getByRole("button", { name: action })).waitFor({ state: "visible" });
    if (route === "applications") {
      await page.getByRole("button", { name: "Start an application" }).click();
      await page.getByRole("heading", { name: "Add a job." }).waitFor({ state: "visible" });
    }
  });
}

test("filtered email no-results can return to the full list", async () => {
  await page.goto(`${ORIGIN}/dashboard/outreach?qa=1`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Did not arrive" }).click();
  await page.getByRole("heading", { name: "No emails marked as undelivered" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Clear filter" }).click();
  await page.getByText("Jordan Lee").waitFor({ state: "visible" });
});

for (const state of [
  ["applications", "Applications did not load."],
  ["outreach", "Emails did not load."],
  ["jobs", "Jobs did not load."],
]) {
  const [route, heading] = state;
  test(`${route} load failure is not presented as empty data`, async () => {
    await page.goto(`${ORIGIN}/dashboard/${route}?qa=error`, { waitUntil: "domcontentloaded" });
    const title = page.getByRole("heading", { name: heading });
    await title.waitFor({ state: "visible", timeout: 20_000 });
    assert.equal(await title.locator("xpath=..").locator("svg").count(), 1);
    assert.equal(await page.locator("h1").count(), 1);
    const retry = page.getByRole("button", { name: "Try again" });
    await retry.waitFor({ state: "visible" });
    if (route !== "outreach") {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        retry.click(),
      ]);
      await page.getByRole("heading", { name: heading }).waitFor({ state: "visible" });
    }
  });
}
