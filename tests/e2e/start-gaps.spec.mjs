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
/* The stamp that records the screen as SHOWN. Counted rather than ignored because it is the whole
   reason this screen can be left at all: skipping saves no fields, so a flow that derived the step
   from the missing fields alone would answer 'gaps' again forever - the defect that had the step
   deleted in backend #116. */
let gapsAskedPosts = 0;
let savedBody = null;
/* Set by the case below to reproduce a backend that CANNOT record the stamp: deployed ahead of its
   migration, or an older one with no such route. The state stub then keeps answering 'gaps', which
   is exactly the shape of the #116 dead end. */
let gapsAskedFails = false;
/* WHICH GAPS THE SERVER REPORTS, mutable so a test can ask for the screen it needs. It was a
   literal inside the /onboarding/state stub, which meant the only gap block any e2e could reach was
   the one that literal named. */
let stateGaps = ["gpa", "gpa_scale", "major"];
let stateStep = "done";

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
  if (pathname === "/onboarding/gaps-asked" && route.request().method() === "POST") {
    gapsAskedPosts += 1;
    if (gapsAskedFails) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "no such column" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ recorded: true }) });
    return;
  }
  if (pathname === "/onboarding/state") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...doneState, step: stateStep, gaps: stateStep === "gaps" ? stateGaps : [] }),
    });
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

/* The heading this waits on is the done screen's, and it is "Setup complete." rather than the
 * old "Your job matches are ready.": that screen now confirms setup before it hands off, and the
 * forward-looking line moved into the first-action prompt below the receipt. See DoneStep.
 *
 * Matched by ROLE, not by text: the phrase appears twice on that screen now, once as the heading
 * and once in the sr-only live region, and a bare getByText is a strict-mode violation. */
test("the referral gap renders, saves the typed source, and advances", async (t) => {
  try {
    await page.goto(`${PAGE_ORIGIN}/start?qa=1&step=gaps`, { waitUntil: "networkidle" });
    const input = page.getByLabel("Default referral source");
    await input.waitFor({ state: "visible" });
    assert.equal(await page.getByRole("heading", { name: "Setup complete." }).count(), 0);

    await input.fill("LinkedIn");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Setup complete." }).waitFor({ state: "visible" });

    assert.deepEqual(savedBody, { referral_source_default: "LinkedIn" });
    assert.equal(gapsAskedPosts, 1, "the screen advanced without recording that it had been shown");
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

/* THE DEAD END THIS WHOLE CHANGE EXISTS TO PREVENT, reproduced.
 *
 * A backend that deployed ahead of its migration has nowhere to put the stamp. It answers the POST
 * with a failure, and - because nothing was recorded - GET /onboarding/state keeps deriving 'gaps'
 * from the same three missing fields. Re-reading `state.step` there puts the student straight back
 * on the screen they just finished, forever. That is #116 verbatim.
 *
 * `gapsHandled` in app/start/page.tsx is the only thing standing between that state and a trapped
 * student, and until this case existed the whole suite stayed green with it deleted: every other
 * fixture answers the stamp with 200 and then stops deriving 'gaps', so the server's own answer was
 * doing the work and the override was never the reason anything passed.
 *
 * Skip rather than Save on purpose. Saving closes the gaps by writing the fields, which would let a
 * broken override pass on the strength of the save; skipping writes nothing, so advancing can only
 * come from the override. */
test("a stamp the backend cannot record still lets the student leave the screen", async (t) => {
  try {
    gapsAskedFails = true;
    stateStep = "gaps";
    savedBody = null;
    const before = gapsAskedPosts;

    await page.goto(`${PAGE_ORIGIN}/start?qa=1&step=gaps`, { waitUntil: "networkidle" });
    await page.getByLabel("Default referral source").waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("heading", { name: "Setup complete." }).waitFor({ state: "visible", timeout: 15000 });

    assert.equal(savedBody, null, "Skip wrote fields it should not have");
    assert.equal(gapsAskedPosts, before + 1, "the screen advanced without even attempting the stamp");
    assert.deepEqual(blockedExternal, []);
    assert.deepEqual(unstubbedBackend, []);
  } catch (reason) {
    const artifactDir = path.join(process.cwd(), "test-results", "start-gaps");
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, "unrecorded-stamp.png"), fullPage: true }).catch(() => {});
    t.diagnostic(String(reason?.stack ?? reason));
    throw reason;
  } finally {
    gapsAskedFails = false;
    stateStep = "done";
  }
});


/* WHAT THE APPLICANT ACTUALLY SEES IN THE TEST-TYPE SELECT, rendered by the production client.
 *
 * THE BLIND SPOT THIS CLOSES. Every other test for this change asserts the exported constants, or
 * matches a pattern against components/start/steps.tsx. Mutation-tested: putting `{option}` back in
 * the JSX, so the select renders the raw enum member "None" again and the entire point of the
 * change is reverted, left the whole website suite green, plus tsc and eslint. The constants stayed
 * correct; the component simply did not have to use them. Nothing under `npm test` can see this,
 * because node's type stripping cannot load a .tsx, so the assertion belongs here.
 *
 * "None" one row under "Prefer not to answer" is the defect. They are the two most different
 * answers on the list, one row apart, and they were the two that looked alike. */
test("the test-type select shows the answers in words, not as enum members", async (t) => {
  const previousGaps = stateGaps;
  try {
    stateGaps = ["standardized_test_type", "sat_score", "act_score"];
    await page.goto(`${PAGE_ORIGIN}/start?qa=1&step=gaps`, { waitUntil: "networkidle" });
    const select = page.locator("#gap-standardized_test_type");
    await select.waitFor({ state: "visible" });

    const options = await select.locator("option").evaluateAll((nodes) => nodes.map((node) => ({
      value: node.value,
      text: node.textContent.trim(),
    })));

    assert.deepEqual(options, [
      { value: "", text: "Prefer not to answer" },
      { value: "SAT", text: "SAT" },
      { value: "ACT", text: "ACT" },
      { value: "Both", text: "Both the SAT and the ACT" },
      { value: "None", text: "I have not taken either" },
    ], "the select must offer the backend enum as values and the sentences as text");

    // Stated separately so a failure names the defect rather than a whole array diff.
    assert.ok(
      !options.some((option) => option.text === "None"),
      'no option may read "None": it is one row under "Prefer not to answer" and means the opposite',
    );

    // And the declaration really is selectable and really does post the enum member.
    await select.selectOption("None");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Setup complete." }).waitFor({ state: "visible" });
    assert.deepEqual(savedBody, { standardized_test_type: "None" });

    assert.deepEqual(blockedExternal, []);
    assert.deepEqual(unstubbedBackend, []);
  } catch (reason) {
    const artifactDir = path.join(process.cwd(), "test-results", "start-gaps");
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, "test-type-select.png"), fullPage: true }).catch(() => {});
    await writeFile(path.join(artifactDir, "test-type-select.html"), await page.content()).catch(() => {});
    throw reason;
  } finally {
    stateGaps = previousGaps;
    t.diagnostic("test-type select assertions complete");
  }
});
