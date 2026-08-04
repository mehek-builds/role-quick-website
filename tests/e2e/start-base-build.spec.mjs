/**
 * The base resume step starts its build on a cold arrival, driven by a real browser.
 *
 * WHY THIS FILE EXISTS, AND WHY IT CANNOT BE A SOURCE-LEVEL TEST
 * =============================================================
 * The defect it pins is a RACE between two independent fetches, and no amount of grepping
 * components/start/BaseResumeStep.tsx can see it.
 *
 * app/start/page.tsx renders the base case with `parsed={profile}`, and `profile` is null until
 * GET /profile lands. When it lands, `onFrame` is rebuilt, so `run` was rebuilt, so the mount
 * effect that starts the build had its dependencies changed WHILE its one and only run was still
 * awaiting GET /resume/base. React does not re-enter the body on a dependency change; it runs the
 * CLEANUP first, and that cleanup sets `cancelled = true` on the in-flight read. The re-run then
 * returns at the `started.current` guard, so nothing restarts it. POST /resume/base/stream is never
 * issued, the screen sits on "Making..." forever, and the only control left is "Finish later".
 *
 * It bites only when nothing is stored, which is every new student's FIRST arrival at this step,
 * and it bites only on the ordering where /profile resolves first. So a spec that lets the two
 * requests race proves nothing on a green run. This one FORCES the losing ordering: the stub holds
 * GET /resume/base open until GET /profile has been answered.
 *
 * PROOF THAT THIS SPEC CAN SEE THE DEFECT
 * =======================================
 * Measured on 2026-08-04 against production builds of this tree:
 *   - with the fix reverted (the mount effect's dependency list back to [run, onFrame, demo] and
 *     `onFrame` passed straight to buildBaseResume), the first case is RED. The artifact it wrote
 *     read `streamPosts: 0` and `buttons: ["Making...","Finish later"]`, the second of which is the
 *     student's only way off the screen, because the first is disabled until the build finishes.
 *   - with the fix in place both cases are GREEN: exactly 1 POST, and the built resume renders.
 * The second case forces the OPPOSITE ordering, which was already green before the fix, and is kept
 * for the same reason the click-path spec keeps its goto cases: without it a reader cannot tell
 * whether the first case is measuring the race or merely measuring that the page loads.
 *
 * CONSTRAINTS THIS FILE HOLDS ITSELF TO
 * =====================================
 * The same ones as dashboard-click-path.spec.mjs, and for the same reasons:
 *  - No production backend, no database, no real credentials, no model call. One catch-all route
 *    serves same-origin requests from the local `next start`, answers backend requests from a
 *    fabricated fixture, and ABORTS everything else into `blockedExternal`, asserted empty.
 *  - Production build (`npm run build` then `next start`), never `next dev`, so React StrictMode's
 *    development-only double-invoke cannot be mistaken for the defect or for its absence.
 *  - 127.0.0.1 rather than localhost, which keeps the ?qa= canned-fixture door in app/start/page.tsx
 *    shut by construction. A build replayed from the QA fixture never touches the network and would
 *    make this whole spec vacuous.
 *  - A failing case writes a screenshot, the DOM and a context file into test-results/start-base/.
 *
 * RUN IT WITH:  npm run build && npm run test:start-base
 * Deliberately outside `npm test`, which must never depend on a browser binary being present.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

import { BACKEND_ORIGIN, SESSION_TOKEN } from "./fixture-data.mjs";

/* ── The fabricated student ──────────────────────────────────────────────────
   Invented for this file. No real person, school, employer or resume. */

const PARSED_PROFILE = {
  full_name: "Fixture Student",
  school: "Fixture University",
  degree: "B.S. Fixture Studies",
  grad_year: 2029,
  grad_date: "May 2029",
  coursework: ["Fixture Systems", "Fixture Algorithms"],
  target_roles: ["Software Engineer"],
  currently_enrolled: true,
  skills: ["TypeScript", "Python"],
  projects: [],
  experience: [{ company: "Fixture Labs", title: "Intern", start: "May 2028", end: "Aug 2028", description: "Fixture work" }],
};

const BUILT_ENTRY = {
  type: "job",
  org: "Fixture Labs",
  title: "Software Engineering Intern",
  date_range: "May 2028 - Aug 2028",
  bullets: ["Built the fixture pipeline end to end", "Wrote the fixture regression suite"],
};

const BUILT_SPEC = {
  school: "Fixture University",
  degree: "B.S. Fixture Studies",
  grad_date: "May 2029",
  coursework: "Fixture Systems, Fixture Algorithms",
  education_position: "top",
  experience: [BUILT_ENTRY],
  skills: ["TypeScript", "Python"],
};

const BUILT_ATS = {
  passed: true,
  issues: [],
  pages: 1,
  extractable_chars: 1234,
  keyword_coverage_pct: 37,
  scored_against: "target roles",
};

const ONBOARDING_STATE = {
  step: "base",
  completed_at: null,
  has_focus: true,
  has_resume: true,
  has_impact_review: true,
  has_base_resume: false,
  has_applied: false,
  has_targeting: false,
  learned: [],
  gaps: [],
  gap_suggestions: {},
  source_pages: 3,
  source_resume_url: null,
  harvest_active: false,
  automatic_submission_enabled: false,
  automatic_submission_consented_at: null,
  automatic_submission_consent_version: null,
  automatic_verification_enabled: false,
};

/** The build stream, in the wire format lib/base-resume-stream.ts reads: `data: <json>\n\n`. */
const STREAM_BODY = [
  { event: "stage", stage: "reading" },
  { event: "source", bank_entries: 2, source_pages: 3, declared_skills: 4 },
  { event: "stage", stage: "selecting" },
  { event: "piece", type: "education", education_position: "top" },
  { event: "stage", stage: "writing" },
  { event: "piece", type: "entry", index: 0, entry: BUILT_ENTRY },
  { event: "piece", type: "skills", skills: BUILT_SPEC.skills },
  { event: "stage", stage: "fitting" },
  { event: "ats", ...BUILT_ATS },
  { event: "done", built_at: "2026-08-04T00:00:00.000Z", warnings: [], ats: BUILT_ATS, metrics: [], spec: BUILT_SPEC },
]
  .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
  .join("");

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
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

/** Every non-localhost, non-backend request that got aborted. Asserted empty by every case. */
const blockedExternal = [];
/** Backend paths the stub had no canned answer for. Asserted empty by every case. */
const unstubbedBackendPaths = new Set();

/* The ordering knob, and the whole reason this spec can see the defect.
 *
 * "profile-first" is the losing ordering: GET /resume/base is held until GET /profile has been
 * answered, so `parsed` changes while the mount effect is mid-flight. "profile-last" is the
 * opposite, and was already green before the fix. */
let ordering = "profile-first";
let profileAnswered = null;
/** Every POST to the build stream, which is the measurement. */
let streamPosts = 0;
/** Every GET of the stored resume. Two per load under StrictMode, one in production. */
let baseGets = 0;
/* Failure and pacing knobs for the adversarial cases below. `stored` makes GET /resume/base answer
   200 with a resume, which must suppress the build entirely; the two `...Fails` knobs turn a read
   into a 500, which must NOT suppress it, because a student whose profile or stored-resume read
   failed still needs a resume. `streamDelayMs` holds the stream response open so a reload can land
   in the middle of one. */
let stored = false;
let baseGetFails = false;
let profileFails = false;
let streamDelayMs = 0;

function resetTraffic(options = {}) {
  ({ ordering = "profile-first", stored = false, baseGetFails = false, profileFails = false, streamDelayMs = 0 } =
    typeof options === "string" ? { ordering: options } : options);
  streamPosts = 0;
  baseGets = 0;
  blockedExternal.length = 0;
  unstubbedBackendPaths.clear();
  let release;
  profileAnswered = new Promise((resolve) => { release = resolve; });
  profileAnswered.release = release;
}
resetTraffic();

const jsonRoute = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

await context.route("**/*", async (route) => {
  const url = route.request().url();
  if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
    await route.continue();
    return;
  }
  if (!url.startsWith(BACKEND_ORIGIN)) {
    blockedExternal.push(url);
    await route.abort();
    return;
  }

  const { pathname } = new URL(url);
  const method = route.request().method();

  if (pathname === "/v1/meta") {
    await jsonRoute(route, {
      product: { name: "Litos" },
      api: { version: "1.0.0", compatibility: { extension: { minimum: "0.0.1" }, web: { minimum: "0.0.1" } } },
    });
    return;
  }
  if (pathname === "/onboarding/state") {
    await jsonRoute(route, ONBOARDING_STATE);
    return;
  }
  if (pathname === "/profile") {
    if (ordering === "profile-last") await delay(1500);
    if (profileFails) await jsonRoute(route, { detail: "fixture failure" }, 500);
    else await jsonRoute(route, PARSED_PROFILE);
    /* Released on the failure path too. It is a latch meaning "GET /profile has been ANSWERED",
       and a 500 answers it: the page sets profileLoadError and `parsed` stays null, which is
       exactly the arrival this ordering exists to force. Leaving it unreleased would deadlock the
       held GET /resume/base and turn a real assertion into a timeout. */
    profileAnswered.release();
    return;
  }
  if (pathname === "/profile/application") {
    await jsonRoute(route, { phone: "+1 555 0100", address_city: "Fixture City", address_country: "Fixtureland" });
    return;
  }
  if (pathname === "/resume/base" && method === "GET") {
    baseGets += 1;
    /* THE FORCED ORDERING. Holding this until /profile has been answered is what makes `parsed`
       change while the mount effect is awaiting this very response. Without it the two fetches
       race and a green run would mean nothing. */
    if (ordering === "profile-first") await profileAnswered;
    if (baseGetFails) await jsonRoute(route, { detail: "fixture failure" }, 500);
    else if (stored) await jsonRoute(route, { spec: BUILT_SPEC, built_at: "2026-08-04T00:00:00.000Z", source_pages: 3 });
    else await jsonRoute(route, { detail: "no base resume stored" }, 404);
    return;
  }
  if (pathname === "/resume/base" && method === "PUT") {
    await jsonRoute(route, { ok: true });
    return;
  }
  if (pathname === "/resume/base/stream" && method === "POST") {
    streamPosts += 1;
    if (streamDelayMs > 0) await delay(streamDelayMs);
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: STREAM_BODY });
    return;
  }

  unstubbedBackendPaths.add(`${method} ${pathname}`);
  await jsonRoute(route, {}, 404);
});

await context.addInitScript((token) => {
  window.localStorage.setItem("rq_token", token);
  window.localStorage.setItem("rq_email", "fixture@example.invalid");
  window.localStorage.setItem("litos_session_mode_v1", "verified");
  window.localStorage.setItem("litos_has_history_v1", "true");
}, SESSION_TOKEN);

await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

const page = await context.newPage();
page.on("pageerror", (reason) => {
  throw new Error(`uncaught error on the page under test: ${reason}`);
});

const ARTIFACT_DIR = path.join(process.cwd(), "test-results", "start-base");
let anyFailure = false;

async function captureFailure(label, reason) {
  anyFailure = true;
  const slug = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${slug}.png`), fullPage: true });
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.html`), await page.content());
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.txt`), [
      `case:        ${label}`,
      `url:         ${page.url()}`,
      `ordering:    ${ordering}`,
      `knobs:       ${JSON.stringify({ stored, baseGetFails, profileFails, streamDelayMs })}`,
      `streamPosts: ${streamPosts}`,
      `baseGets:    ${baseGets}`,
      `visibility:  ${await page.evaluate(() => document.visibilityState).catch(() => "unknown")}`,
      `buttons:     ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent.trim())).catch(() => "unknown"))}`,
      `blocked:     ${JSON.stringify(blockedExternal)}`,
      `unstubbed:   ${JSON.stringify([...unstubbedBackendPaths])}`,
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

/* The sheet itself is a button labelled "Use this resume" and so is the primary control beside it,
   which is two matches for one accessible name. `.first()` is the sheet, and it only exists once
   the build has finished, which is the thing being measured either way. */
const builtResumeSheet = () => page.getByRole("button", { name: "Use this resume" }).first();

/** One arrival at /start under the given knobs. */
async function coldArrival(options) {
  resetTraffic(options);
  await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.evaluate(() => document.visibilityState), "visible");
  /* The built resume is the observable end of the build, so waiting for it rather than for a fixed
     duration is what keeps this from being a sleep dressed as an assertion. On the defect it never
     appears, and the case fails on the streamPosts assertion below with the timeout's evidence
     already written out. */
  await builtResumeSheet()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => {});
}

browserTest("a first arrival with nothing stored starts the build, even when the profile lands first", async () => {
  await coldArrival("profile-first");

  assert.equal(
    streamPosts,
    1,
    "POST /resume/base/stream must be issued exactly once on a cold arrival: a student with no " +
      "stored base resume has nothing to show unless the build runs",
  );
  /* And it must have actually finished on screen. A POST that was issued and then abandoned would
     satisfy the count above while leaving the student on the same dead "Making..." screen. */
  await assert.doesNotReject(builtResumeSheet().waitFor({ state: "visible", timeout: 10000 }));
  assert.match(await page.locator("body").innerText(), /Built the fixture pipeline end to end/);
  assert.deepEqual(blockedExternal, []);
  assert.deepEqual([...unstubbedBackendPaths], []);
});

browserTest("the opposite ordering, which never had the defect, still builds exactly once", async () => {
  await coldArrival("profile-last");

  assert.equal(streamPosts, 1, "one arrival must produce one build, never zero and never two");
  assert.match(await page.locator("body").innerText(), /Built the fixture pipeline end to end/);
  assert.deepEqual(blockedExternal, []);
  assert.deepEqual([...unstubbedBackendPaths], []);
});

/* ── The other half of the invariant: never TWICE ──────────────────────────────
 *
 * The cleanup releases the one-shot guard (`started.current = false`) rather than only cancelling
 * the read, which is what un-breaks this screen under `next dev`, where StrictMode's simulated
 * remount runs the cleanup on every load. A released guard is exactly the shape that could
 * double-build, and a duplicate build is a duplicate model call charged to the student and a second
 * resume overwriting the first. Zero is the defect these cases were added for; two would be a worse
 * one, so every arrival below asserts an exact count, never "at least one".
 * ───────────────────────────────────────────────────────────────────────────── */

browserTest("a stored resume is shown and never rebuilt", async () => {
  await coldArrival({ stored: true });

  assert.equal(streamPosts, 0, "a student who already has a resume must not be charged a second build");
  assert.match(await page.locator("body").innerText(), /Built the fixture pipeline end to end/);
  assert.deepEqual(blockedExternal, []);
});

browserTest("a 500 reading the stored resume still gets the student a build, exactly one", async () => {
  // The read failing is not evidence that no resume is needed. getBaseResume's .catch runs run(),
  // and that path has its own `cancelled` guard, so it is a second place a released guard could
  // double-fire.
  await coldArrival({ baseGetFails: true });

  assert.equal(streamPosts, 1);
  assert.match(await page.locator("body").innerText(), /Built the fixture pipeline end to end/);
  assert.deepEqual(blockedExternal, []);
});

browserTest("a 500 reading the profile still gets the student a build, exactly one", async () => {
  /* `parsed` stays null for the whole arrival here, which is the state the original defect left the
     component in permanently. The build must still run: the contact line and education block
     degrade, and the server's own done frame carries school, degree and grad date anyway. */
  await coldArrival({ profileFails: true });

  assert.equal(streamPosts, 1);
  assert.match(await page.locator("body").innerText(), /Built the fixture pipeline end to end/);
  assert.deepEqual(blockedExternal, []);
});

browserTest("a reload landing mid-build starts one build for the new page and no more", async () => {
  // The stream is held open for a second, and the reload lands inside that window. The abandoned
  // first document must not leave anything behind that makes the second one build twice.
  resetTraffic({ streamDelayMs: 1000 });
  await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
  await delay(400);
  const beforeReload = streamPosts;
  assert.equal(beforeReload, 1, "the first load should be mid-stream at this point");

  resetTraffic({});
  await page.reload({ waitUntil: "domcontentloaded" });
  await builtResumeSheet().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

  assert.equal(streamPosts, 1, "the reloaded page builds once, not once per abandoned document");
  assert.match(await page.locator("body").innerText(), /Built the fixture pipeline end to end/);
  assert.deepEqual(blockedExternal, []);
});

browserTest("leaving the step and coming back with the browser Back button builds once", async () => {
  await coldArrival({});
  assert.equal(streamPosts, 1);

  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  resetTraffic({});
  await page.goBack({ waitUntil: "domcontentloaded" });
  await builtResumeSheet().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

  /* Exactly one. A remount is a legitimate reason to build, because the component comes back with
     empty state and nothing to show; what it must not do is build twice for the one return. */
  assert.equal(streamPosts, 1);
  assert.match(await page.locator("body").innerText(), /Built the fixture pipeline end to end/);
  assert.deepEqual(blockedExternal, []);
});

browserTest("every arrival above read the stored resume exactly once, so the guard is not looping", async () => {
  /* A production build has no StrictMode remount, so one arrival is one GET /resume/base. If the
     released guard ever started re-entering its own effect this count would climb, and it is the
     cheapest possible tripwire for that. Under `next dev` the same arrival reads twice, which is
     measured by hand rather than here: this spec runs a production build on purpose. */
  await coldArrival({});
  assert.equal(baseGets, 1);
  assert.equal(streamPosts, 1);
});

test.after(async () => {
  if (anyFailure) {
    await mkdir(ARTIFACT_DIR, { recursive: true }).catch(() => {});
    await context.tracing.stop({ path: path.join(ARTIFACT_DIR, "trace.zip") }).catch(() => {});
    process.stderr.write(`\nstart-base artifacts written to ${ARTIFACT_DIR}\n`);
  } else {
    await context.tracing.stop().catch(() => {});
  }
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
});
