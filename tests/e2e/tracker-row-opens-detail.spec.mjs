/**
 * A Tracker row must open its application, whatever the row's status is.
 *
 * WHAT WENT WRONG
 * ===============
 * Reported from a real account on 2026-08-11: on /dashboard/applications the SENT row opened its
 * detail in place, and rows reading NEEDS YOU did not open at all. That split is not a coincidence
 * and it is not about the row. `submitted` is the ONE reviewable status that routes to
 * SubmissionReceipt; needs_attention, ready_for_final_approval, awaiting_security_code and failed
 * all route to SubmissionScreen (features/applications/domain/application-review.ts,
 * screenForStatus). SubmissionScreen read `review.questions.length` and `review.questions.some(...)`
 * with no guard, so a packet whose stored `_review` carries no `questions` key threw
 * "Cannot read properties of undefined" during render, React unmounted the route, and
 * app/dashboard/error.tsx replaced the whole Tracker. Every other application on the page went
 * with it. SubmissionReceipt never touches `questions`, which is why exactly one row worked.
 *
 * `questions` is optional on the wire in practice: /resume/history serves whatever the backend
 * stored on the packet, the two repos deploy independently, and this page already conceded the
 * point on the line above the bug (selectPacket does `packet.spec._review?.questions ?? []`). The
 * seeded submission it builds one line later did not get the same treatment.
 *
 * WHY THIS IS AN E2E SPEC AND NOT A SOURCE-SHAPE TEST
 * ==================================================
 * The defect is a render-time throw reached by a click. Nothing about the SOURCE of page.tsx is
 * wrong to look at: the expression `review.questions.length` is what any reasonable version of
 * this screen would contain. The only thing that distinguishes the broken build from the fixed one
 * is what the browser does when a student presses the row, so that is what is measured here.
 *
 * PROOF THIS SPEC SEES THE DEFECT
 * ===============================
 * Run against the pre-fix production build (origin/main 63c56cc), measured 2026-08-11:
 *   - "a needs_attention row opens in place"          RED, uncaught TypeError on the page,
 *                                                     "This page did not load." on screen.
 *   - "a ready_for_final_approval row opens in place" RED, same throw.
 *   - "a submitted row still opens in place"          GREEN, both before and after. It is the
 *                                                     contrast case and it is kept green on both
 *                                                     sides deliberately, so a failure here means
 *                                                     the harness broke rather than the fix.
 *
 * SAFETY
 * ======
 * No backend, no database, no credentials. One catch-all route serves same-origin requests from
 * the local `next start`, answers backend requests from a fabricated fixture, and ABORTS anything
 * else; `blockedExternal` is asserted empty. Nothing is submitted: no case presses Send.
 *
 * RUN IT WITH:  npm run build && npm run test:tracker-row
 * Outside `npm test` for the same reason every spec in this folder is: that suite is hundreds of
 * fast static tests and must never depend on a browser binary being present.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

import { BACKEND_ORIGIN, BOOTSTRAP, SESSION_TOKEN, STUB } from "./fixture-data.mjs";

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

/**
 * A packet as the reported account actually holds them: sparse.
 *
 * `questions`, `filled_fields` and `skipped_reasons` are ABSENT rather than empty, and there is no
 * `_contact` block. That is the whole fixture design. A packet carrying empty arrays exercises none
 * of this, which is why tests/e2e/fixture-data.mjs, which always sends `questions`, was green
 * against the shipped defect.
 */
function thinPacket(key, status, { role, company }) {
  return {
    id: `thin-packet-${key}`,
    job_context: { company, role, jd_hash: `hash-${key}` },
    resume_object_key: `fixture/${key}`,
    created_at: "2026-08-10T12:00:00.000Z",
    download_url: "#",
    spec: {
      school: "Fixture University",
      degree: "B.S. Fixture Studies",
      grad_date: "May 2027",
      education_position: "top",
      experience: [],
      skills: [],
      _review: {
        jd_text: `Fixture posting ${key}. The company builds accessible TypeScript interfaces.`,
        status,
        updated_at: "2026-08-10T12:30:00.000Z",
        ...(status === "submitted" ? { submitted_at: "2026-08-10T12:40:00.000Z" } : {}),
      },
    },
  };
}

const NEEDS_YOU = thinPacket("needs", "needs_attention", {
  role: "Software Engineer Internship, Testing and Automation",
  company: "Fixture Robotics",
});
const READY = thinPacket("ready", "ready_for_final_approval", {
  role: "Software Engineering Internship, Fall 2026",
  company: "Fixture Audio",
});
const SENT = thinPacket("sent", "submitted", {
  role: "Data Science Intern, Customer Success",
  company: "Fixture Analytics",
});

const RESUMES = [NEEDS_YOU, READY, SENT];

/**
 * The rows under test, and the heading each must produce.
 *
 * The heading is SubmissionScreen's own h2 for that status, so a case cannot pass on the page
 * merely surviving: it has to have drawn the detail for the row that was pressed.
 */
const CASES = [
  { name: "a needs_attention row opens in place", packet: NEEDS_YOU, heading: "Needs your input" },
  { name: "a ready_for_final_approval row opens in place", packet: READY, heading: "Review" },
  /* The contrast case. Green before the fix and after it. */
  { name: "a submitted row still opens in place", packet: SENT, heading: "Sent" },
];

const port = await freePort();
/* 127.0.0.1, not localhost: hostname "localhost" plus a ?qa parameter is this page's canned-fixture
   mode, and running off the loopback IP keeps that door shut by construction. */
const ORIGIN = `http://127.0.0.1:${port}`;

const server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "ignore", "inherit"],
});
await waitForServer(ORIGIN, server);

const browser = await chromium.launch();
const context = await browser.newContext({
  /* Wide enough for the ledger's desktop table. Below lg the same packets render as a scrolling
     chip strip instead, which is a different control. */
  viewport: { width: 1280, height: 900 },
});

/** Every non-local request that got aborted. Asserted empty by every case. */
const blockedExternal = [];
/** Every backend path the page asked for, so a case can assert what was NOT asked. */
let backendPaths = [];

await context.route("**/*", async (route) => {
  const url = route.request().url();
  if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
    await route.continue();
    return;
  }
  if (url.startsWith(BACKEND_ORIGIN)) {
    const pathname = new URL(url).pathname;
    backendPaths.push(pathname);
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname.startsWith("/jobs/")) {
      /* The real backend's answer to an id that is not a posting, message included. It is the
         message that used to reach the screen verbatim, so the fixture has to carry it or the case
         cannot tell the fix from a rewording. */
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Job not found" }) });
      return;
    }
    if (pathname === "/resume/history") {
      await json({ resumes: RESUMES });
      return;
    }
    if (pathname === "/dashboard/bootstrap") {
      await json({ ...BOOTSTRAP, resume_history: { resumes: RESUMES } });
      return;
    }
    if (pathname.endsWith("/submission")) {
      /* The poll answers with the SAME sparse review the packet carries. A backend that stored no
         questions does not invent them 2.5 seconds later, and an answer that quietly filled the
         gap would let the poll paper over the very defect under test. */
      const id = pathname.split("/")[2];
      const packet = RESUMES.find((item) => item.id === id) ?? NEEDS_YOU;
      await json({ application_id: id, review: packet.spec._review, cover_letter: null });
      return;
    }
    await json(STUB[pathname] ?? {});
    return;
  }
  blockedExternal.push(url);
  await route.abort();
});

/* Runs before any page script, so a session exists by the time the dashboard layout's auth guard
   reads it. A fabricated string; it is never sent anywhere real. */
await context.addInitScript((token) => {
  window.localStorage.setItem("rq_token", token);
  window.localStorage.setItem("rq_email", "fixture@example.invalid");
  window.localStorage.setItem("litos_session_mode_v1", "verified");
  window.localStorage.setItem("litos_has_history_v1", "true");
}, SESSION_TOKEN);

const page = await context.newPage();
/** Uncaught throws, collected rather than thrown, so the assertion can name the row that caused it. */
let pageErrors = [];
page.on("pageerror", (reason) => pageErrors.push(String(reason?.stack ?? reason)));

const ARTIFACT_DIR = path.join(process.cwd(), "test-results", "tracker-row");
let anyFailure = false;

async function captureFailure(label, reason) {
  anyFailure = true;
  const slug = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${slug}.png`), fullPage: true });
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.html`), await page.content());
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.txt`), [
      `case:      ${label}`,
      `url:       ${page.url()}`,
      `blocked:   ${JSON.stringify(blockedExternal)}`,
      `pageErrors:${JSON.stringify(pageErrors, null, 2)}`,
      "",
      String(reason?.stack ?? reason),
      "",
    ].join("\n"));
  } catch (captureFault) {
    process.stderr.write(`could not capture artifacts for "${label}": ${captureFault}\n`);
  }
}

function browserTest(name, body) {
  test(name, async () => {
    try {
      await body();
    } catch (reason) {
      await captureFailure(name, reason);
      throw reason;
    }
  });
}

test.after(async () => {
  if (anyFailure) process.stderr.write(`\ntracker-row artifacts written to ${ARTIFACT_DIR}\n`);
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
});

const LEDGER = 'section[aria-labelledby="application-ledger-heading"]';

/** Land on the Tracker with the sparse fixture loaded and every row drawn. */
async function openTracker() {
  pageErrors = [];
  await page.goto(`${ORIGIN}/dashboard/applications`, { waitUntil: "domcontentloaded" });
  await page.locator(LEDGER).waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(`${LEDGER} button[aria-pressed]:visible`).first().waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.evaluate(() => document.visibilityState), "visible");
}

for (const item of CASES) {
  browserTest(item.name, async () => {
    await openTracker();

    const row = page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: item.packet.job_context.role });
    assert.equal(await row.count(), 1, `${item.packet.job_context.role} must be exactly one visible row`);
    await row.click();

    /* THE EJECTION CHECK. The report was that the browser left the product entirely on this click,
       so the address is asserted before anything about what rendered. */
    assert.equal(
      page.url(),
      `${ORIGIN}/dashboard/applications`,
      `pressing the row navigated away from the Tracker, to ${page.url()}`,
    );

    /* The route boundary, by its own words. If this is on screen the click destroyed the page. */
    const boundary = await page.getByText("This page did not load.").isVisible().catch(() => false);
    assert.equal(boundary, false, `the row took the whole Tracker into its error boundary. Page errors: ${JSON.stringify(pageErrors, null, 2)}`);

    assert.deepEqual(pageErrors, [], "the click threw on the page");

    /* And it opened THIS row, not merely something. */
    await page.getByRole("heading", { name: item.heading, exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await row.getAttribute("aria-pressed"), "true", "the pressed row must read as selected");

    assert.deepEqual(blockedExternal, [], "no request may leave this machine");
  });
}

/**
 * The second half of the report: a ?job= link that is really an application.
 *
 * /dashboard/applications?job=<generated_resume_id> asked the postings endpoint, got a 404, and put
 * the backend's own "Job not found" across the top of the page in red, over a Tracker that was in
 * the same frame listing that exact application. Two statements on one screen, one of them false,
 * and the false one was the one a student would act on.
 */
browserTest("a ?job= link carrying an application id opens the application, and says no error", async () => {
  pageErrors = [];
  backendPaths = [];
  await page.goto(`${ORIGIN}/dashboard/applications?job=${NEEDS_YOU.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Needs your input", exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });

  const alerts = (await page.locator('[role="alert"]').allInnerTexts()).filter((text) => text.trim());
  assert.deepEqual(alerts, [], `the page contradicted itself: it opened the application and reported a failure. ${JSON.stringify(alerts)}`);
  const body = await page.locator("main").innerText();
  assert.ok(!body.includes("Job not found"), "the backend's wording must not reach the screen");

  /* Not asked at all. The 404 is avoided rather than caught, which is the difference between a
     quieter error and no error. */
  assert.deepEqual(backendPaths.filter((item) => item.startsWith("/jobs/")), [], "an application id must not be sent to the postings endpoint");

  /* And the parameter is gone, so a reload does not ask the postings endpoint about it again. */
  assert.equal(new URL(page.url()).searchParams.get("job"), null, `the job parameter survived: ${page.url()}`);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(blockedExternal, []);
});

browserTest("a ?job= link that is neither still says so, in words a student can act on", async () => {
  pageErrors = [];
  await page.goto(`${ORIGIN}/dashboard/applications?job=not-a-real-id`, { waitUntil: "domcontentloaded" });
  await page.getByText("We could not open that job link. Everything you have already built is listed below.").waitFor({ state: "visible", timeout: 20_000 });
  /* The claim in that sentence has to be true on the same screen. */
  await page.locator(LEDGER).waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await page.locator(`${LEDGER} button[aria-pressed]:visible`).count(), RESUMES.length);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(blockedExternal, []);
});

/* Once every row has been opened, the ledger must still be intact and every row still pressable.
   A fix that survived one click and then wedged the switcher would pass every case above. */
browserTest("the switcher still moves between the rows after each has been opened", async () => {
  await openTracker();
  for (const item of [...CASES, ...CASES].map((c) => c.packet)) {
    const row = page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: item.job_context.role });
    await row.click();
    assert.equal(page.url(), `${ORIGIN}/dashboard/applications`);
    assert.equal(await row.getAttribute("aria-pressed"), "true", `${item.job_context.role} did not become the selected row`);
  }
  assert.deepEqual(pageErrors, [], "switching between rows threw on the page");
  assert.deepEqual(blockedExternal, []);
});
