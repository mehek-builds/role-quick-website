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
 * So the denominator is the steps the student's own flow contains (components/start/ui.tsx
 * `flowSteps`), and the QA fixture describes ONE flow: the ten-screen one, whose first employer
 * does not ask about work eligibility. Every row below reads "of 10" for that reason, and the run
 * is the regression guard for the count being STABLE across the whole flow. A denominator that
 * counted the work-visa screen only while the student stood on it would read 9 here and 10 on that
 * one row, which is the count growing underneath them - the exact bug #285 existed for.
 *
 * A flow that does NOT contain that screen is the other half, and it is covered where a fixture can
 * vary: tests/e2e/start-onboarding-checklist.spec.mjs, and tests/start-rail-denominator.test.mjs
 * pins both against `flowSteps` directly.
 *
 * The done heading moved from "Your job matches are ready." to "Setup complete." when that screen
 * gained a confirmation: the forward-looking line is still there, below the receipt, as the
 * first-action prompt. The status text below is the sr-only live region, kept from this file's
 * original assertion and shortened with it. */
test("every onboarding checkpoint renders with a progress indicator", async () => {
  const checkpoints = [
    /* TEN, and the QA fixture walks the full ten because it describes a student whose first
       employer did NOT ask about work eligibility. Nine is the other flow, for the ~40% whose
       employer asks both halves itself; that one is pinned in start-onboarding-checklist.spec.mjs
       and against `flowSteps` directly in tests/start-rail-denominator.test.mjs.
     *
       The number is spelled out on every row rather than computed, so adding or cutting a screen
       shows up here as a deliberate edit: the rail is a wayfinding device, and one that counts
       wrong is worse than none (#285). It read 14 until the cut removed the one-page and details
       screens and the merges folded `build` into `match` and `impact` into `resume`. */
    ["focus", "What are you going after?", "Setup: step 1 of 10, Your roles"],
    ["resume", "Start with your resume.", "Setup: step 2 of 10, Your resume"],
    ["sponsorship", "Where can you work?", "Setup: step 5 of 10, Work visa"],
    ["done", "Setup complete.", "Setup: step 10 of 10, Done"],
  ];


  for (const [step, heading, rail] of checkpoints) {
    await page.goto(`${ORIGIN}/start?qa=1&step=${step}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: heading }).waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(`[aria-label="${rail}"]`).waitFor({ state: "visible" });
  }

  await page.getByText("Setup complete.", { exact: true }).first().waitFor({ state: "visible" });
});

for (const state of [
  ["applications", "No applications yet", "Fill application"],
  ["outreach", "No emails yet", null],
  ["jobs", "No matching roles", "Change job preferences"],
]) {
  const [route, heading, action] = state;
  test(`${route} has a distinct first-use state`, async () => {
    await page.goto(`${ORIGIN}/dashboard/${route}?qa=empty`, { waitUntil: "domcontentloaded" });
    const title = page.getByRole("heading", { name: heading });
    await title.waitFor({ state: "visible", timeout: 20_000 });
    const emptyState = title.locator("xpath=..");
    assert.equal(await emptyState.locator("svg").count(), 1);
    if (action) await emptyState.getByRole("link", { name: action }).or(emptyState.getByRole("button", { name: action })).waitFor({ state: "visible" });
    if (route === "outreach") {
      const startOutreach = page.getByRole("button", { name: "Start outreach", exact: true });
      await startOutreach.waitFor({ state: "visible" });
      assert.equal(await startOutreach.count(), 1, "Outreach should expose one clear first-use action");
    }
    if (route === "applications") {
      await emptyState.getByRole("button", { name: "Fill application" }).click();
      await page.getByRole("heading", { name: "Fill an application." }).waitFor({ state: "visible" });
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
    const title = route === "outreach"
      ? page.getByRole("alert").getByText(heading, { exact: true })
      : page.getByRole("heading", { name: heading });
    await title.waitFor({ state: "visible", timeout: 20_000 });
    if (route === "outreach") {
      assert.equal(await page.getByRole("alert").filter({ hasText: heading }).count(), 1);
      assert.equal(await page.getByRole("heading", { name: "Outreach", exact: true }).count(), 1);
    } else {
      assert.equal(await title.locator("xpath=..").locator("svg").count(), 1);
    }
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
