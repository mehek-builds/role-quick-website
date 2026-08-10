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

/* SEVEN, not six, and the gaps row is the reason this list changed.
 *
 * The original six omitted `gaps`, which is why it passed while that screen reported itself as
 * "Setup: step 1 of 6, Your resume": the screen was reinstated by #279 and never added to STEPS,
 * and a checkpoint list that never visits a screen cannot catch the screen lying about where it
 * is. It is in STEPS now, the denominator is 7, and this list walks it.
 *
 * The done heading moved from "Your job matches are ready." to "Setup complete." when that screen
 * gained a confirmation: the forward-looking line is still there, below the receipt, as the
 * first-action prompt. The status text below is the sr-only live region, kept from this file's
 * original assertion and shortened with it. */
test("all seven onboarding checkpoints render with a progress indicator", async () => {
  const checkpoints = [
    ["resume", "Start with your resume.", "Setup: step 1 of 7, Your resume"],
    ["impact", "Make your most recent work count.", "Setup: step 2 of 7, Your impact"],
    ["focus", "Here's where we'd start.", "Setup: step 3 of 7, Your roles"],
    ["sponsorship", "Do you need a work visa?", "Setup: step 4 of 7, Work visa"],
    ["base", "One page, ready.", "Setup: step 5 of 7, Your one page"],
    ["gaps", "A few details.", "Setup: step 6 of 7, A few details"],
    /* SIX of six, not seven of seven, and the difference is the fixture rather than a bug.
       Each row here is an independent page load, and the QA state reports NO outstanding gaps on
       ?step=done (so the receipt on that screen reviews in its all-clear state). No gaps means the
       gaps screen is not part of that student's flow, so their rail counts six. The row above is
       the same rail for a student who does have gaps. Both are correct; see the case below. */
    ["done", "Setup complete.", "Setup: step 6 of 6, Done"],
  ];

  for (const [step, heading, rail] of checkpoints) {
    await page.goto(`${ORIGIN}/start?qa=1&step=${step}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: heading }).waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(`[aria-label="${rail}"]`).waitFor({ state: "visible" });
  }

  await page.getByText("Setup complete.", { exact: true }).first().waitFor({ state: "visible" });
});

/* The denominator is per-student, and this is the pair that proves it.
 *
 * `gaps` renders only when the server reports outstanding profile gaps, so a student who has none
 * walks six screens and one who does walks seven. Counting STEPS gave everyone 7, which meant the
 * no-gaps student jumped from "Step 5 of 7" to "Step 7 of 7" and never saw a step 6.
 *
 * Asserted as a contrast rather than as two separate numbers, because either figure alone looks
 * arbitrary: what has to hold is that the SAME rail reports a different total for two accounts
 * whose flows genuinely differ. ?step=gaps is the with-gaps fixture, ?step=done the without. */
test("the step total follows the student's own flow, not the full step list", async () => {
  await page.goto(`${ORIGIN}/start?qa=1&step=gaps`, { waitUntil: "domcontentloaded" });
  await page.locator('[aria-label="Setup: step 6 of 7, A few details"]').waitFor({ state: "visible", timeout: 20_000 });

  await page.goto(`${ORIGIN}/start?qa=1&step=done`, { waitUntil: "domcontentloaded" });
  await page.locator('[aria-label="Setup: step 6 of 6, Done"]').waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.locator('[aria-label*="of 7"]').count(), 0, "a no-gaps account was still counted out of seven");
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
