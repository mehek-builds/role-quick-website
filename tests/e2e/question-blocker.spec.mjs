/**
 * Browser coverage for the employer question blocker, via /qa/question-blocker.
 *
 * This is the state the product is judged on: a question Litos declined to guess, handed back with
 * the employer's own option list. Until 2026-08-31 nothing in CI rendered it - not one of the 39
 * dashboard-visual scenarios - which is how DirectApplicationQuestion ignored options_complete and
 * presented a partial employer list as the whole menu with nothing going red (fixed in 3a90a2e).
 * The harness page fixes the reachability half; this spec is the CI half.
 *
 * The four fixtures on that page are the render paths that actually differ, and each is asserted
 * by the control set only it produces:
 *
 *   short-choice-list   radios, one per employer option, and nothing else
 *   long-choice-list    a native select opening on a disabled placeholder, never a fake answer
 *   incomplete-options  the partial-list warning, because options_complete is false
 *   optional-unknown    free text with an explicit Skip: a decision, not a default
 *
 * Runs the production Next build with the QA gate satisfied by a fabricated local secret. The
 * backend is stubbed by a catch-all route that RECORDS what it answers, so an on-mount fetch
 * growing into this component fails the run instead of being silently fed an empty object; the
 * fixtures are inline in the page anyway. On failure each case writes a screenshot, the DOM and
 * the reason to test-results/question-blocker/, because nobody can reproduce a CI runner by hand.
 * Run with: npm run build && npm run test:question-blocker
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { isSanctionedThirdParty } from "./sanctioned-third-parties.mjs";

/* Shaped to satisfy lib/qa-gate.ts SECRET_SHAPE. Fabricated, and only ever reaches this local
   server, which is started and killed by this file. */
const QA_SECRET = "question-blocker-spec-secret-0123456789abcdef";

const ARTIFACT_DIR = path.join(process.cwd(), "test-results", "question-blocker");
let anyFailure = false;

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

const port = await freePort();
const ORIGIN = `http://127.0.0.1:${port}`;
const server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, LITOS_QA_PORTAL_SECRET: QA_SECRET },
});

/* Named when it fails, not just when it succeeds: falling through this loop and letting the first
   goto time out reports a browser problem for what is a server one. */
{
  let ready = false;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`next start exited with ${server.exitCode}`);
    try {
      const response = await fetch(`${ORIGIN}/login`);
      if (response.status < 500) {
        ready = true;
        break;
      }
    } catch {
      // Still starting.
    }
    await delay(250);
  }
  if (!ready) {
    server.kill("SIGTERM");
    throw new Error(`next start never answered on ${ORIGIN}`);
  }
}

const browser = await chromium.launch();
const context = await browser.newContext();

/* The catch-all backend stub. The harness carries its fixtures inline and its handlers are no-ops,
   so nothing on this page has a REASON to call out; anything that tries anyway gets an empty
   answer so the page stays usable, and the URL is kept so the last test can refuse the run. A
   stub that answers silently would hide a new on-mount fetch, and hide whatever its empty answer
   breaks, for as long as nobody looks. Known third-party noise is aborted without being counted,
   the same list qa-guest-entry uses. */
const unexpectedRequests = [];
await context.route((url) => !url.href.startsWith(ORIGIN), async (route) => {
  const requestUrl = route.request().url();
  if (isSanctionedThirdParty(requestUrl)) {
    await route.abort();
    return;
  }
  unexpectedRequests.push(requestUrl);
  await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

test.after(async () => {
  if (anyFailure) process.stderr.write(`\nquestion-blocker artifacts written to ${ARTIFACT_DIR}\n`);
  /* Guarded, because a crashed Chromium makes close() throw, and an unguarded first line here
     would skip the kill and leak the next start process. Same shape as qa-guest-entry. */
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
});

/* One distinctive substring per fixture. Headings pass through displayQuestionLabel, which cleans
   scraped ATS noise, so the match is a stable phrase rather than the byte-exact sentence. */
const HEADINGS = {
  "short-choice-list": /work authorization in Germany/i,
  "long-choice-list": /notice are you required to give/i,
  "incomplete-options": /office location would you prefer/i,
  "optional-unknown": /someone referred you/i,
};

const INCOMPLETE_WARNING = /could not read this employer.+full list of choices/is;

const heading = (page, id) => page.locator("main h2").filter({ hasText: HEADINGS[id] });

async function openHarness(page) {
  await page.goto(`${ORIGIN}/qa/question-blocker?litos_qa_key=${QA_SECRET}`, {
    waitUntil: "domcontentloaded",
  });
  /* Hydration, not just paint. The server-rendered page shows every control before React attaches
     a single handler, and a click in that window is silently lost: the tab press becomes a no-op
     10-second heading timeout, and a checked radio gets reverted when hydration replays the blank
     state over it. The harness publishes this attribute from an effect, so its presence means the
     handlers are live; the controlled portal makes the same promise the same way (see
     tests/e2e/qa-tunnel-hydration.spec.mjs). */
  await page.locator('[data-litos-qa-ready="1"]').waitFor({ timeout: 20_000 });
  await heading(page, "short-choice-list").waitFor({ timeout: 20_000 });
}

/* Tab to another fixture and wait out the teardown of the one leaving.
 *
 * WAITED FOR, NOT COUNTED. Switching fixtures unmounts one DirectApplicationQuestion and mounts
 * another; on a CI runner the old panel can lag the new heading by a render, so an instant count
 * of the old case's controls taken the moment the new heading appears races that teardown. That
 * exact pattern was this repo's one CI-only flake on 2026-08-31 (see 0bc0c8d): waitFor hidden
 * keeps the contract - a control that genuinely survives the switch still fails the wait - and
 * only the one-frame timing artifact stops failing. */
async function openCase(page, fromId, toId) {
  await page.getByRole("button", { name: toId, exact: true }).click();
  await heading(page, toId).waitFor({ timeout: 10_000 });
  await heading(page, fromId).waitFor({ state: "hidden", timeout: 10_000 });
}

/* The control set a fixture rendered, which is the identity each case is asserted by. */
async function controlFingerprint(page) {
  return {
    radios: await page.locator('main input[type="radio"]').count(),
    selects: await page.locator("main select").count(),
    textareas: await page.locator("main textarea").count(),
    incompleteWarning: (await page.locator("main").innerText()).match(INCOMPLETE_WARNING) !== null,
  };
}

async function captureFailure(label, page, pageErrors, reason) {
  anyFailure = true;
  const slug = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${slug}.png`), fullPage: true });
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.html`), await page.content());
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.txt`), [
      `case:       ${label}`,
      `url:        ${page.url()}`,
      `unexpected: ${JSON.stringify(unexpectedRequests)}`,
      `pageErrors: ${JSON.stringify(pageErrors)}`,
      "",
      String(reason?.stack ?? reason),
      "",
    ].join("\n"));
  } catch (captureFault) {
    process.stderr.write(`could not capture artifacts for "${label}": ${captureFault}\n`);
  }
}

/* Every case gets a fresh page, and a failing one leaves a picture behind. A CI-only failure
   without one is a bare locator timeout nobody can reproduce by hand. */
function blockerTest(label, run) {
  test(label, async () => {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
      await run(page);
    } catch (failure) {
      await captureFailure(label, page, pageErrors, failure);
      throw failure;
    } finally {
      /* Guarded: a throw out of a finally block REPLACES the propagating assertion error, so an
         unguarded close here would report a teardown fault instead of the actual failure. */
      await page.close().catch(() => {});
    }
  });
}

blockerTest("short choice list: the employer's own options as radios, and the save waits for a pick", async (page) => {
  await openHarness(page);

  assert.deepEqual(await controlFingerprint(page), {
    radios: 5,
    selects: 0,
    textareas: 0,
    incompleteWarning: false,
  });
  /* The employer's vocabulary, not a paraphrase. */
  const labels = await page.locator('main input[type="radio"]').evaluateAll(
    (inputs) => inputs.map((input) => input.value));
  assert.deepEqual(labels, [
    "German or EU citizen",
    "Permanent residence permit",
    "Work permit tied to an employer",
    "Student visa with work allowance",
    "No current authorization",
  ]);
  assert.equal(await page.locator('main input[type="radio"]:checked').count(), 0,
    "an unanswered question arrived with a choice already made");

  /* Required and blank blocks the save; picking one of the employer's options unblocks it.
     This is what separates wired radios from painted ones. "Save and next", because this fixture
     is first of four; only the last case's button reads "Save answer". */
  const save = page.getByRole("button", { name: "Save and next" });
  assert.equal(await save.isDisabled(), true, "a blank required answer was saveable");
  await page.getByRole("radio", { name: "Permanent residence permit" }).check();
  assert.equal(await save.isDisabled(), false);
  assert.equal(await page.getByRole("button", { name: "Skip" }).count(), 0,
    "a required question offered a way past itself");
});

blockerTest("long choice list: past the limit it collapses to a select that reads unanswered", async (page) => {
  await openHarness(page);
  await openCase(page, "short-choice-list", "long-choice-list");

  assert.deepEqual(await controlFingerprint(page), {
    radios: 0,
    selects: 1,
    textareas: 0,
    incompleteWarning: false,
  });

  const select = page.locator("main select");
  /* All twelve employer choices plus the placeholder. */
  assert.equal(await select.locator("option").count(), 13);
  /* The Five Rings contract: no answer must read as no answer. A select whose value matched no
     option would land on the first real entry and impersonate a choice nobody made; the
     placeholder is disabled so it can never be saved as one. */
  assert.equal(await select.inputValue(), "");
  const placeholder = select.locator("option").first();
  assert.equal(await placeholder.textContent(), "Choose an answer");
  assert.equal(await placeholder.isDisabled(), true);
});

blockerTest("incomplete options: the partial list is presented as partial, not as the whole menu", async (page) => {
  await openHarness(page);
  await openCase(page, "short-choice-list", "incomplete-options");

  /* The 3a90a2e defect, pinned: options_complete false must produce the warning. The three
     choices discovery DID read exactly still render, because they are real and usually contain
     her answer; what changed is that the list stops claiming to be complete. */
  const body = await page.locator("main").innerText();
  assert.match(body, INCOMPLETE_WARNING,
    "a partial employer option list rendered with no mark that it is partial");
  assert.match(body, /will not guess on your behalf/i);

  assert.deepEqual(await controlFingerprint(page), {
    radios: 3,
    selects: 0,
    textareas: 0,
    incompleteWarning: true,
  });
  const labels = await page.locator('main input[type="radio"]').evaluateAll(
    (inputs) => inputs.map((input) => input.value));
  assert.deepEqual(labels, ["Amsterdam", "Rotterdam", "Utrecht"]);
});

blockerTest("optional unknown: free text with an explicit answer-or-skip decision", async (page) => {
  await openHarness(page);
  await openCase(page, "short-choice-list", "optional-unknown");

  assert.deepEqual(await controlFingerprint(page), {
    radios: 0,
    selects: 0,
    textareas: 1,
    incompleteWarning: false,
  });
  assert.match(await page.locator("main").innerText(), /Optional\. Answer it or skip it\./);

  /* Blank is not an answer here either: the save stays blocked until she types one, and Skip is
     the live control, so leaving it empty is a decision she makes rather than a default she
     falls into. */
  assert.equal(await page.getByRole("button", { name: "Save answer" }).isDisabled(), true);
  const skip = page.getByRole("button", { name: "Skip" });
  assert.equal(await skip.isDisabled(), false, "the optional escape is not offered");
  await page.locator("main textarea").fill("Alex Chen");
  assert.equal(await page.getByRole("button", { name: "Save answer" }).isDisabled(), false);
});

blockerTest("the four cases are four different renders, not four coats of the same paint", async (page) => {
  await openHarness(page);

  /* The direct jumps above never traverse 2 to 3 or 3 to 4, and a fingerprint measured after
     ARRIVING differently is the one place order-dependent contamination between fixtures could
     show. So this walks the tabs adjacently and re-measures every case on the path. */
  const order = ["short-choice-list", "long-choice-list", "incomplete-options", "optional-unknown"];
  const fingerprints = new Map([[order[0], await controlFingerprint(page)]]);
  for (let i = 1; i < order.length; i += 1) {
    await openCase(page, order[i - 1], order[i]);
    fingerprints.set(order[i], await controlFingerprint(page));
  }

  /* Pairwise distinct. If two fixtures ever collapse into the same control set, the harness has
     stopped exercising a path and one render mode is again unobservable. */
  for (const [leftId, left] of fingerprints) {
    for (const [rightId, right] of fingerprints) {
      if (leftId === rightId) continue;
      assert.notDeepEqual(left, right,
        `${leftId} and ${rightId} rendered identically; a render path went dark`);
    }
  }
});

/* Deliberately last: every page above has already opened and closed. An entry here means the
   harness page called something beyond its own origin, which is a new network dependency this
   spec then answered with a lie; the run must go red rather than absorb it. */
test("nothing on the harness page ever called out", () => {
  assert.deepEqual(unexpectedRequests, [],
    "the question-blocker page made requests its stub silently answered");
});
