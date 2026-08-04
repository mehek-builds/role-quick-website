/**
 * Pressing "Send it" must leave the progress screen, and must not deny what it is doing.
 *
 * TWO DEFECTS, AND THEY ARE NOT THE SAME SHAPE
 * ============================================
 * 1. ROUTING. `approveFinalSubmission` awaited /submission/approve, installed the response into
 *    state, and never routed off it. The QA branch beside it has always called moveToScreen; the
 *    real one did not. What made this survive is the submission poll, which ALSO routes off the
 *    status and rescues a foregrounded tab within its 2.5s tick. That poll is deliberately
 *    suppressed while `document.visibilityState !== "visible"`, so the screen that never resolves
 *    is the BACKGROUNDED one, which is the ordinary case: a portal run takes minutes and the copy
 *    invites you to go away and come back.
 *
 *    This is why the routing case below runs with `document.visibilityState` forced to "hidden",
 *    which is the opposite of the house rule in dashboard-click-path.spec.mjs. That rule exists
 *    because a hidden tab suspends timers and produces false PASSES. Here hiddenness IS the
 *    condition under test, and the assertion is about routing in a promise continuation rather
 *    than on a timer, so nothing being suspended is being measured. The visible case is asserted
 *    too, so a regression cannot hide behind either one.
 *
 * 2. COPY. The progress screen chooses between "Getting the company's page ready ... Nothing is
 *    sent yet" and "Sending it to the company now" by reading `submission.review.status`. During an
 *    approve that status is still `ready_for_final_approval` for the WHOLE request, because the
 *    response that changes it is the thing being awaited. So the screen spent the entire send
 *    promising that nothing was being sent. Unlike (1) the poll cannot mask this, because the
 *    status genuinely has not changed yet, and it is wrong in a foregrounded tab too.
 *
 *    The file already carries a comment about this exact sentence being false "at exactly the
 *    moment it mattered most". That fix keyed off the status and so only covered the path where the
 *    status had already moved.
 *
 * PROOF THESE CASES SEE THE DEFECTS
 * =================================
 * Against the pre-fix build, measured 2026-08-04:
 *   - hidden-tab routing: stayed on "Getting the company's page ready." indefinitely. RED.
 *   - copy: read "Nothing is sent yet." for the full duration of the approve request. RED.
 *   - poll rescue (visible tab, poll allowed to report submitted): PASSED pre-fix, which is the
 *     reason this shipped unnoticed. Kept green on both sides, so the rescue is pinned rather than
 *     assumed. An earlier draft of this case fed the poll a STALE status and then claimed it
 *     proved the rescue; it failed pre-fix and the claim was wrong. It feeds SENT now.
 *
 * SAFETY
 * ======
 * The approve endpoint is stubbed. No backend, no portal, no employer. The click is safe here in a
 * way it is not anywhere else, which is the only reason this spec is allowed to press the button.
 *
 * RUN IT WITH:  npm run build && npm run test:approve
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

import { BACKEND_ORIGIN, RESUMES, SESSION_TOKEN, STUB } from "./fixture-data.mjs";

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
      const res = await fetch(`${origin}/login`, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      /* not listening yet */
    }
    await delay(250);
  }
  throw new Error(`next start never answered on ${origin}. Run "npm run build" first.`);
}

const port = await freePort();
const ORIGIN = `http://127.0.0.1:${port}`;
const server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "ignore", "inherit"],
});
await waitForServer(ORIGIN, server);

const browser = await chromium.launch();
const ARTIFACT_DIR = path.join(process.cwd(), "test-results", "approve");
let anyFailure = false;

test.after(async () => {
  if (anyFailure) process.stderr.write(`\napprove artifacts written to ${ARTIFACT_DIR}\n`);
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
});

/** The one packet the flow can legally approve from. */
const APPROVABLE = RESUMES.find((r) => r.spec?._review?.status === "ready_for_final_approval");
assert.ok(APPROVABLE, "the fixture must contain a ready_for_final_approval packet");

const AWAITING = {
  application_id: APPROVABLE.id,
  review: { ...APPROVABLE.spec._review, status: "ready_for_final_approval", filled_fields: ["name", "email", "resume"] },
  cover_letter: null,
};
const SENT = {
  application_id: APPROVABLE.id,
  review: {
    ...APPROVABLE.spec._review,
    status: "submitted",
    submitted_at: "2026-08-04T12:00:00.000Z",
    receipt: {
      confirmation_text: "Thank you. Your application was received.",
      final_url: "https://jobs.example.com/fixture/confirmation",
      captured_at: "2026-08-04T12:00:00.000Z",
      reference_id: "FIXTURE-0001",
    },
  },
  cover_letter: null,
};

/**
 * @param hidden           run the case with the tab backgrounded
 * @param holdApproveMs    keep the approve request in flight this long, so the copy can be read
 *                         while it is still going
 * @param pollAnswer       what the submission poll reports; SENT lets the poll rescue a broken
 *                         route, AWAITING keeps the poll honest about lagging behind the response
 */
async function openApproval(hidden, { holdApproveMs = 0, pollAnswer = AWAITING } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
      await route.continue();
      return;
    }
    if (url.startsWith(BACKEND_ORIGIN)) {
      const p = new URL(url).pathname;
      const json = async (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      if (p.endsWith("/submission/approve")) {
        if (holdApproveMs) await delay(holdApproveMs);
        await json(SENT);
        return;
      }
      if (p.endsWith("/submission")) {
        await json(pollAnswer);
        return;
      }
      await json(STUB[p] ?? {});
      return;
    }
    await route.abort();
  });
  await context.addInitScript((token) => {
    window.localStorage.setItem("rq_token", token);
    window.localStorage.setItem("rq_email", "fixture@example.invalid");
    window.localStorage.setItem("litos_session_mode_v1", "verified");
    window.localStorage.setItem("litos_has_history_v1", "true");
  }, SESSION_TOKEN);

  if (hidden) {
    /* An OVERRIDE, not a genuinely backgrounded tab, and the distinction is worth stating because
       the first draft of this file tried the real thing and was wrong: headless Chromium reports
       every page as visible, `bringToFront` on a decoy changes nothing, and the precondition
       assertion caught it. What is being tested is a guard whose ONLY input is
       `document.visibilityState`, so overriding that property exercises the exact branch. It does
       not reproduce timer throttling, and nothing here depends on timers: the assertion is that a
       promise continuation routes the screen. */
    await context.addInitScript(() => {
      Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true });
      Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
    });
  }

  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard/applications?application=${APPROVABLE.id}`, { waitUntil: "domcontentloaded" });
  const sendIt = page.getByRole("button", { name: "Send it" });
  await sendIt.waitFor({ state: "visible", timeout: 25_000 });

  return { context, page, sendIt };
}

function browserTest(name, body) {
  test(name, async () => {
    let page;
    try {
      page = await body();
    } catch (reason) {
      anyFailure = true;
      const slug = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await mkdir(ARTIFACT_DIR, { recursive: true }).catch(() => {});
      if (page) {
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${slug}.png`) }).catch(() => {});
        await writeFile(path.join(ARTIFACT_DIR, `${slug}.html`), await page.content()).catch(() => {});
      }
      throw reason;
    }
  });
}

browserTest("a hidden tab still leaves the progress screen once the send returns", async () => {
  const { context, page, sendIt } = await openApproval(true);
  await sendIt.click();
  /* The poll answers ready_for_final_approval throughout, so nothing but the approve response
     itself can move this screen on. That is the point. */
  await page.getByText("Thank you. Your application was received.").waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.evaluate(() => document.visibilityState), "hidden", "the override must still be in force at the assertion");
  await context.close();
  return page;
});

browserTest("the progress screen does not claim nothing is sent while it is sending", async () => {
  const { context, page, sendIt } = await openApproval(false, { holdApproveMs: 4000 });
  await sendIt.click();
  await page.getByText("Sending it to the company now.").waitFor({ state: "visible", timeout: 10_000 });
  const body = await page.locator("main").innerText();
  assert.ok(
    !body.includes("Nothing is sent yet"),
    `the send was in flight and the screen still said nothing was sent:\n${body.slice(0, 600)}`,
  );
  await context.close();
  return page;
});

/* The rescue itself, pinned rather than assumed. `pollAnswer: SENT` is the whole case: the poll is
   allowed to see the finished submission, which is what let the broken route go unnoticed. If this
   ever goes red the poll has stopped covering for anything, and the routing cases above become the
   only thing standing between a student and a permanent spinner. */
browserTest("a visible tab is still rescued by the submission poll", async () => {
  const { context, page, sendIt } = await openApproval(false, { pollAnswer: SENT });
  await sendIt.click();
  await page.getByText("Thank you. Your application was received.").waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.evaluate(() => document.visibilityState), "visible");
  await context.close();
  return page;
});
