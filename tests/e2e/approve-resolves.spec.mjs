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
 * @param approveRefusal   {status, body} to answer the approve with instead of SENT, for the cases
 *                         where the interesting behaviour is what the screen does with a REFUSAL
 */
async function openApproval(hidden, { holdApproveMs = 0, pollAnswer = AWAITING, approveRefusal = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const approveCalls = [];
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
        approveCalls.push(Date.now ? 1 : 1);
        if (holdApproveMs) await delay(holdApproveMs);
        if (approveRefusal) {
          await route.fulfill({
            status: approveRefusal.status,
            contentType: "application/json",
            body: JSON.stringify(approveRefusal.body),
          });
          return;
        }
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

  return { context, page, sendIt, approveCalls };
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
  await page.getByText("Waiting for confirmation.").waitFor({ state: "visible", timeout: 10_000 });
  const body = await page.locator("main").innerText();
  assert.ok(
    !body.includes("Not sent yet."),
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


/**
 * The one that matters: a real application must not be sent twice.
 *
 * The 2.5s submission poll runs while the sending screen is up, and during an approve the server
 * still reports `ready_for_final_approval`, which screenForStatus maps to "portal". So the poll
 * used to take the student OFF the sending screen and back to SubmissionScreen with a live
 * "Send it" roughly 2.5 seconds into every send slower than that, and nothing guarded a second
 * press. This case holds the approve open for 8 seconds, which is three poll ticks, and asserts
 * both that the screen does not walk backwards and that a second click cannot fire a second POST.
 *
 * Pre-fix, measured 2026-08-04: the sending screen was replaced by "Check it over before it goes."
 * with an enabled Send it, and clicking it produced a SECOND /submission/approve.
 */
browserTest("a slow send cannot be sent twice", async () => {
  const { context, page, sendIt, approveCalls } = await openApproval(false, { holdApproveMs: 8000, pollAnswer: AWAITING });
  await sendIt.click();

  /* Past three poll ticks, the student must still be on the sending screen. */
  await page.waitForTimeout(7000);
  const sendItVisibleMidFlight = await page.getByRole("button", { name: "Send it" }).isVisible().catch(() => false);
  const sendItEnabledMidFlight = sendItVisibleMidFlight
    ? await page.getByRole("button", { name: "Send it" }).isEnabled().catch(() => false)
    : false;
  assert.equal(
    sendItEnabledMidFlight,
    false,
    "the poll walked the user back to a live Send it while their send was still in flight, which is a duplicate application to a real employer",
  );

  await page.getByText("Thank you. Your application was received.").waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(approveCalls.length, 1, `the approve endpoint was called ${approveCalls.length} times; it must be exactly once`);
  await context.close();
  return page;
});

/**
 * The progress clock measures the send, not the review that preceded it.
 *
 * It was anchored to `review.updated_at`, stamped when preparation finished. A student who reads
 * the packet for six minutes before approving therefore opened the sending screen already showing
 * six minutes elapsed, and past five minutes the screen tells them to start the application again,
 * which for a send that is genuinely in flight is the worst possible instruction.
 */
browserTest("the sending clock starts when Send it is pressed", async () => {
  const STALE = {
    ...AWAITING,
    review: { ...AWAITING.review, updated_at: "2020-01-01T00:00:00.000Z" },
  };
  const { context, page, sendIt } = await openApproval(false, { holdApproveMs: 6000, pollAnswer: STALE });
  await sendIt.click();
  await page.getByText("Waiting for confirmation.").waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(1500);
  const elapsedText = await page.locator("main").innerText();
  const shown = elapsedText.match(/(\d+)m (\d+)s elapsed|(\d+)s elapsed/);
  assert.ok(shown, `no elapsed clock rendered: ${elapsedText.slice(0, 300)}`);
  assert.ok(
    !/\dm \d\ds elapsed/.test(shown[0]),
    `the clock is anchored to the pre-send timestamp and read "${shown[0]}" seconds into the send`,
  );
  await context.close();
  return page;
});


/**
 * A REFUSAL THE STUDENT CAN ACTUALLY READ, past the poll that used to erase it.
 *
 * Cresta packet 8142004c-3358-4538-8778-16df5e31c5bb, production 2026-08-09 03:06:19:
 * POST /submission/approve -> 409, "That took too long and timed out. Start the application again."
 * The screen showed nothing. No error, no toast, no change, and a Send it that stayed enabled. The
 * refusal was findable only by reading server logs.
 *
 * The catch was never the problem: it set the sentence exactly as the server wrote it.
 * `refreshSubmission` ended with an unconditional `setError(null)` on every successful tick, and it
 * ticks every 2.5 seconds while this screen is up. The message was on screen for under one poll
 * round, which for someone watching a button is the same as never.
 *
 * So the wait here is SEVEN SECONDS, three poll ticks, and the assertion is that the sentence is
 * still there. Pre-fix that is the whole defect and this case goes red; a one-second check would
 * have passed against the bug.
 *
 * The 422 rides along in the second case because it is the same catch and the same channel, and
 * because its `issues` array is the more valuable payload: a list of named, fixable blockers that
 * apiErrorMessage would otherwise fold into one sentence.
 */
const TIMED_OUT = "That took too long and timed out. Start the application again.";

browserTest("a refused send says why, and is still saying it three poll ticks later", async () => {
  const { context, page, sendIt } = await openApproval(false, {
    pollAnswer: AWAITING,
    approveRefusal: {
      status: 409,
      body: { error: TIMED_OUT, code: "PREPARED_RUN_HANDOFF_EXPIRED", restartable: true },
    },
  });
  await sendIt.click();
  await page.getByText(TIMED_OUT).waitFor({ state: "visible", timeout: 15_000 });
  // Three ticks of the 2.5s poll, each of which used to clear this.
  await page.waitForTimeout(7000);
  const body = await page.locator("main").innerText();
  assert.ok(
    body.includes(TIMED_OUT),
    `the server's refusal was wiped by the poll within three ticks:\n${body.slice(0, 800)}`,
  );
  await context.close();
  return page;
});

browserTest("a 422 brings its issue list with it rather than a generic failure", async () => {
  const { context, page, sendIt } = await openApproval(false, {
    pollAnswer: AWAITING,
    approveRefusal: {
      status: 422,
      body: {
        error: "Verify the complete application before sending. The current packet is not ready for final approval.",
        code: "FINAL_APPROVAL_VERIFICATION_FAILED",
        issues: ["The filled form preview is missing.", "A required application answer is still blank."],
      },
    },
  });
  await sendIt.click();
  // The <li>, not the folded-up sentence: apiErrorMessage also splices the first five issues into
  // the message string, so a bare getByText matches both and trips strict mode. Rendering it as a
  // LIST is the point of carrying `issues` separately.
  await page.locator("li", { hasText: "The filled form preview is missing." }).first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(7000);
  const body = await page.locator("main").innerText();
  for (const issue of ["The filled form preview is missing.", "A required application answer is still blank."]) {
    assert.ok(body.includes(issue), `the 422 issue list did not survive on screen:\n${body.slice(0, 800)}`);
  }
  await context.close();
  return page;
});

/*
 * NOT COVERED, deliberately and with the reason written down.
 *
 * `approveFinalSubmission` re-checks `selectedIdRef` after its await before installing the result,
 * so a send that resolves once the student has switched packets cannot render A's confirmation
 * text and reference id under B's role and company (SubmissionReceipt takes its heading from
 * `selected` and its body from `submission`).
 *
 * A case for it was written and then DELETED rather than kept, because it could not see the
 * defect: driving a packet switch through the ledger from the sending screen returns this fixture
 * to the list rather than opening a second detail pane, so with the guard removed the receipt never
 * rendered either and the case passed both ways. A test that passes against the bug is worse than
 * no test, because it reads as coverage.
 *
 * What the guard rests on instead: `refreshSubmission` has carried the identical check since the
 * wrong-employer finding, with a comment calling the failure "an application sent to the wrong
 * employer", and this path reaches the same state through the same await. Anyone able to drive a
 * mid-send packet switch in this harness should write the case and delete this note.
 */
