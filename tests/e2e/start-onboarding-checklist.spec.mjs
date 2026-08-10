/**
 * The whole /start flow, walked end to end in a real browser, against the six criteria in the
 * Checklist Design onboarding checklist (https://www.checklist.design/web-app/onboarding):
 *
 *   1. Progress indicator      how many steps, and where the student is in them
 *   2. Welcome message         what this is, and what the product does
 *   3. Account setup           the minimum needed to personalise, and nothing else
 *   4. Product highlights      the key features, with a skip route
 *   5. First action prompt     the quickest step to understanding the value
 *   6. Completion confirmation setup is over, and the product begins
 *
 * WHY THIS IS ONE WALK RATHER THAN SIX UNIT TESTS
 * ===============================================
 * Four of the six are properties of the FLOW, not of a component. "Step 3 of 6" is only correct if
 * the student actually arrives at the third screen third; a welcome message only welcomes if it is
 * on the first screen a real arrival lands on; a completion confirmation only confirms if the flow
 * genuinely ends there. Rendering DoneStep in isolation and reading its heading would assert the
 * heading and prove nothing about onboarding. So the spec drives the real screens in order, through
 * the real derived-step machinery in app/start/page.tsx, and checks each criterion at the point in
 * the walk where a student would meet it.
 *
 * It also pins the rail's arithmetic, which is the one thing here that can rot silently: STEPS in
 * components/start/ui.tsx is the denominator, and adding a screen without adding it to that list
 * would leave the flow claiming six steps while walking seven. The walk counts the screens it
 * visits and asserts the count against the denominator the rail prints.
 *
 * CONSTRAINTS, THE SAME ONES start-base-build.spec.mjs HOLDS
 * =========================================================
 *  - No production backend, no database, no real credentials, no model call. A catch-all route
 *    serves same-origin requests from the local `next start`, answers backend requests from a
 *    fabricated fixture, and ABORTS everything else into `blockedExternal`, asserted empty.
 *  - Production build (`npm run build` then `next start`), never `next dev`, so StrictMode's
 *    double-invoke cannot be mistaken for a defect or for its absence.
 *  - 127.0.0.1 rather than localhost, which keeps the ?qa= canned-fixture door in app/start/page.tsx
 *    shut by construction. A walk replayed from the QA fixture never touches the derived-step
 *    machinery and would make the whole spec vacuous.
 *  - A failing case writes a screenshot, the DOM and a context file into test-results/start-checklist/.
 *
 * RUN IT WITH:  npm run build && npm run test:start-checklist
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

import { SESSION_TOKEN } from "./fixture-data.mjs";

/* ── The fabricated student ──────────────────────────────────────────────────
   Invented for this file. No real person, school, employer or resume.

   Five distinct target roles and a non-zero bank are not decoration: ResumeStep mirrors the
   server's has_resume gate with `full_name && distinctRoles >= 5 && bank_total > 0`, and a fixture
   that misses it parks the walk on step 1 behind "We couldn't read enough from that file." */
const PARSED_PROFILE = {
  full_name: "Fixture Student",
  school: "Fixture University",
  degree: "B.S. Fixture Studies",
  grad_year: 2029,
  grad_date: "May 2029",
  coursework: ["Fixture Systems", "Fixture Algorithms"],
  target_roles: ["Software Engineer", "Product Engineer", "Frontend Engineer", "Backend Engineer", "Data Engineer"],
  currently_enrolled: true,
  skills: ["TypeScript", "Python", "SQL", "React"],
  projects: [],
  experience: [{ company: "Fixture Labs", title: "Intern", start: "May 2028", end: "Aug 2028", description: "Fixture work" }],
  bank_total: 2,
  bank_seeded: 2,
};

const ENTRY_ID = "11111111-1111-4111-8111-111111111111";

const RECENT_EXPERIENCE = (completed) => ({
  status: completed ? "complete" : "needs_input",
  selected_entry_id: ENTRY_ID,
  user_selected: false,
  impact_candidate: {
    draft: "Built the fixture pipeline.",
    score: completed ? 4 : 2,
    components: {
      action: { present: true, evidence: "Built" },
      noun: { present: true, evidence: "the fixture pipeline" },
      metric_or_scope: { present: completed, evidence: completed ? "across two teams" : null },
      outcome: { present: completed, evidence: completed ? "cut review time" : null },
    },
  },
  grounded_bullet_count: 1,
  missing_bullets: completed ? 0 : 1,
  completed,
  continue_with_found: false,
  candidates: [{
    entry_id: ENTRY_ID,
    type: "job",
    org: "Fixture Labs",
    title: "Software Engineering Intern",
    date_range: "May 2028 - Aug 2028",
    bullet_variants: ["Built the fixture pipeline."],
  }],
});

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
  skills: ["TypeScript", "Python", "SQL", "React"],
};

const BUILT_ATS = {
  passed: true,
  issues: [],
  pages: 1,
  extractable_chars: 1234,
  keyword_coverage_pct: 37,
  scored_against: "target roles",
};

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
  { event: "done", built_at: "2026-08-09T00:00:00.000Z", warnings: [], ats: BUILT_ATS, metrics: [], spec: BUILT_SPEC },
]
  .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
  .join("");

/* ── The account's progress, which is what makes the walk a walk ─────────────
   The real backend DERIVES the step from data that exists rather than storing a cursor
   (routes/onboarding.ts), so the stub does the same: every screen's save flips a flag, and the
   step falls out of the flags in rail order. A stub that returned a canned sequence of steps
   would walk the same screens while testing none of the routing that puts them in that order. */
const progress = {
  resume: false,
  impact: false,
  focus: false,
  sponsorship: false,
  base: false,
  gaps: false,
  completed: false,
};

function resetProgress() {
  for (const key of Object.keys(progress)) progress[key] = false;
}

/* Overrides for the partial-account case below. `forceStep` reproduces the rolling-deploy path
   app/start/page.tsx routes to DoneStep (a legacy step name arriving from an older backend), and
   `omitSponsorshipFlag` reproduces that same backend not sending a field the TS type calls
   non-optional. Both are the states the receipt's pending and unknown branches exist for, and
   neither is reachable through the happy-path walk. */
let forceStep = null;
let omitSponsorshipFlag = false;
/* Overrides the outstanding-gaps list so a walk can report gaps the GAPS SCREEN does not own. */
let forceGaps = null;

/** Rail order, and it must stay rail order: components/start/ui.tsx STEPS is the same sequence. */
function derivedStep() {
  if (forceStep) return forceStep;
  if (!progress.resume) return "resume";
  if (!progress.impact) return "impact";
  if (!progress.focus) return "focus";
  if (!progress.sponsorship) return "sponsorship";
  if (!progress.base) return "base";
  if (!progress.gaps) return "gaps";
  return "done";
}

function onboardingState() {
  return {
    step: derivedStep(),
    completed_at: progress.completed ? "2026-08-09T00:00:00.000Z" : null,
    has_focus: progress.focus,
    ...(omitSponsorshipFlag ? {} : { has_sponsorship_answer: progress.sponsorship }),
    sponsorship_answer: progress.sponsorship ? "no" : null,
    sponsorship_required: progress.sponsorship ? false : null,
    has_resume: progress.resume,
    has_impact_review: progress.impact,
    has_base_resume: progress.base,
    has_applied: false,
    has_targeting: progress.focus,
    learned: [],
    /* What is STILL outstanding, so it empties as the gaps screen is answered. Languages is left
       out deliberately: that one gap turns the BASE step into a second question screen, and this
       walk is measuring the flow's shape rather than that screen's branch. */
    gaps: forceGaps ?? (progress.gaps ? [] : ["gpa", "gpa_scale", "major"]),
    gap_suggestions: {},
    source_pages: 3,
    source_resume_url: null,
    harvest_active: false,
    automatic_submission_enabled: false,
    automatic_submission_consented_at: null,
    automatic_submission_consent_version: null,
    automatic_verification_enabled: false,
  };
}

const EMPTY_TARGETING = {
  categories: null,
  titles: null,
  role_types: null,
  locations: null,
  remote_only: false,
  primary_period: null,
  backup_period: null,
};
let savedTargeting = { ...EMPTY_TARGETING };

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

/** Every request that was neither the app nor the backend nor analytics. Asserted empty. */
const blockedExternal = [];
/** Analytics, blocked on purpose and NOT a failure. See the note on ANALYTICS_HOSTS below. */
const blockedAnalytics = [];
/** Backend paths the stub had no canned answer for. Asserted empty. */
const unstubbedBackendPaths = new Set();
/** Set when the flow's terminal POST lands, which is the only proof the walk finished. */
let completePosts = 0;

/* THE BACKEND IS IDENTIFIED BY PATH, NOT BY ORIGIN, and that is deliberate.
 *
 * lib/config.ts reads NEXT_PUBLIC_API_URL and only falls back to the Vercel origin when it is
 * unset, so the API origin baked into a build is whatever the machine's .env.local said at build
 * time. On this tree that is a localhost port. A spec that recognised the backend by matching
 * BACKEND_ORIGIN therefore aborted every API call, the page never received an onboarding state,
 * and all five cases failed on a shimmer with nothing to say about onboarding.
 *
 * Matching the PATH instead makes the fixture independent of that env var, which is the property
 * actually wanted: this spec is about the flow, and the flow is the same whichever host serves it.
 * Anything cross-origin whose path the stub does not recognise still gets aborted and asserted. */
const BACKEND_PATHS = new Set([
  "/v1/meta",
  "/onboarding/state",
  "/onboarding/sponsorship",
  "/onboarding/complete",
  "/profile",
  "/profile/application",
  "/profile/targeting",
  "/profile/recent-experience",
  "/resume/base",
  "/resume/base/stream",
  "/me",
]);

/* PostHog. Blocking it is correct (no third party sees a test run) and it is not a defect, so it
   is recorded apart from blockedExternal rather than failing the "never left the fixture" case.
   lib/analytics.ts is fire-and-forget, so the flow does not notice the abort. */
const ANALYTICS_HOSTS = [/(^|\.)posthog\.com$/i, /(^|\.)i\.posthog\.com$/i];

const jsonRoute = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

await context.route("**/*", async (route) => {
  const url = route.request().url();
  if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
    await route.continue();
    return;
  }

  const { pathname, hostname } = new URL(url);
  const method = route.request().method();

  if (!BACKEND_PATHS.has(pathname)) {
    if (ANALYTICS_HOSTS.some((pattern) => pattern.test(hostname))) blockedAnalytics.push(url);
    else blockedExternal.push(url);
    await route.abort();
    return;
  }

  if (pathname === "/v1/meta") {
    await jsonRoute(route, {
      product: { name: "Litos" },
      api: { version: "1.0.0", compatibility: { extension: { minimum: "0.0.1" }, web: { minimum: "0.0.1" } } },
    });
    return;
  }
  if (pathname === "/onboarding/state") {
    await jsonRoute(route, onboardingState());
    return;
  }
  /* The resume upload. Same path as GET /profile, distinguished by method, which is how lib/api.ts
     sends it (uploadResume POSTs a FormData to /profile). */
  if (pathname === "/profile" && method === "POST") {
    progress.resume = true;
    await jsonRoute(route, PARSED_PROFILE);
    return;
  }
  if (pathname === "/profile" && method === "GET") {
    await jsonRoute(route, PARSED_PROFILE);
    return;
  }
  if (pathname === "/profile/application" && method === "GET") {
    await jsonRoute(route, { phone: "+1 555 0100", address_city: "Fixture City", address_country: "Fixtureland" });
    return;
  }
  if (pathname === "/profile/application" && method === "PUT") {
    /* NOT every write to this path closes the gaps.
     *
     * The base step PUTs here too (languages, self-ID), so flipping the flag on any write to
     * /profile/application marked the gaps answered before their screen had rendered, and the walk
     * went base -> done with the sixth screen silently skipped. It flips only when the body
     * actually carries one of the fields the gaps screen asks for, which is what "the gaps are
     * closed" means. */
    const body = route.request().postDataJSON() ?? {};
    if (["gpa", "gpa_scale", "major"].some((field) => field in body)) progress.gaps = true;
    await jsonRoute(route, { ok: true });
    return;
  }
  if (pathname === "/profile/targeting" && method === "GET") {
    await jsonRoute(route, savedTargeting);
    return;
  }
  if (pathname === "/profile/targeting" && method === "PUT") {
    savedTargeting = { ...savedTargeting, ...(route.request().postDataJSON() ?? {}) };
    progress.focus = true;
    await jsonRoute(route, savedTargeting);
    return;
  }
  if (pathname === "/profile/recent-experience" && method === "GET") {
    await jsonRoute(route, RECENT_EXPERIENCE(progress.impact));
    return;
  }
  if (pathname === "/profile/recent-experience" && method === "PUT") {
    /* A pick (empty answers) must NOT complete the step: the component re-reads the server's
       verdict and only "Save and continue" advances. Completing on the pick would let the walk
       skip the screen and would hide exactly the mis-click bug that screen was fixed for. */
    const body = route.request().postDataJSON() ?? {};
    const answered = (body.answers ?? []).length > 0 || body.continue_with_found === true;
    if (answered) progress.impact = true;
    await jsonRoute(route, RECENT_EXPERIENCE(answered));
    return;
  }
  if (pathname === "/onboarding/sponsorship" && method === "POST") {
    progress.sponsorship = true;
    await jsonRoute(route, { answer: "no", required: false, filter_enabled: false });
    return;
  }
  if (pathname === "/resume/base" && method === "GET") {
    if (progress.base) await jsonRoute(route, { spec: BUILT_SPEC, built_at: "2026-08-09T00:00:00.000Z", source_pages: 3 });
    else await jsonRoute(route, { detail: "no base resume stored" }, 404);
    return;
  }
  if (pathname === "/resume/base" && method === "PUT") {
    progress.base = true;
    await jsonRoute(route, { ok: true });
    return;
  }
  if (pathname === "/resume/base/stream" && method === "POST") {
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: STREAM_BODY });
    return;
  }
  if (pathname === "/onboarding/complete" && method === "POST") {
    completePosts += 1;
    progress.completed = true;
    await jsonRoute(route, { ok: true, automatic_verification_enabled: false });
    return;
  }
  /* The dashboard the flow hands off to. Answered thinly and deliberately: this spec ends when
     /dashboard is reached, and stubbing it richly would drift from the dashboard's own spec. */
  if (pathname === "/me") {
    await jsonRoute(route, { email: "fixture@example.invalid", plan: "free", usage: { resumes: { used: 0 } } });
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

const page = await context.newPage();
page.on("pageerror", (reason) => {
  throw new Error(`uncaught error on the page under test: ${reason}`);
});

const ARTIFACT_DIR = path.join(process.cwd(), "test-results", "start-checklist");
let anyFailure = false;

async function captureFailure(label) {
  anyFailure = true;
  const slug = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  try {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${slug}.png`), fullPage: true });
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.html`), await page.content());
    await writeFile(path.join(ARTIFACT_DIR, `${slug}.txt`), [
      `case:      ${label}`,
      `url:       ${page.url()}`,
      `progress:  ${JSON.stringify(progress)}`,
      `rail:      ${await page.locator("[aria-label^='Setup: step']").first().getAttribute("aria-label").catch(() => "none")}`,
      `heading:   ${await page.locator("h1").first().textContent().catch(() => "none")}`,
      `buttons:   ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent.trim())).catch(() => "unknown"))}`,
      "",
    ].join("\n"));
  } catch {
    /* An artifact write must never mask the assertion that caused it. */
  }
}

/** The rail, read as the student reads it: "Setup: step N of M, Label". */
async function rail() {
  const label = await page.locator("[aria-label^='Setup: step']").first().getAttribute("aria-label");
  const match = /^Setup: step (\d+) of (\d+), (.+)$/.exec(label ?? "");
  assert.ok(match, `the step rail is missing or unreadable, got ${JSON.stringify(label)}`);
  return { step: Number(match[1]), total: Number(match[2]), label: match[3], raw: label };
}

/** Waits for the flow to settle on the screen whose rail label is `label`. */
async function screen(label) {
  await page.locator(`[aria-label^='Setup: step'][aria-label$=', ${label}']`).first().waitFor({ timeout: 20000 });
  return rail();
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE WALK
   ═══════════════════════════════════════════════════════════════════════════ */

/** Every rail reading the walk collects, so the arithmetic can be checked as a whole at the end. */
const visited = [];

test("criteria 1-4: the first screen welcomes, orients, and asks for one thing", async () => {
  try {
    resetProgress();
    savedTargeting = { ...EMPTY_TARGETING };
    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });

    const first = await screen("Your resume");
    visited.push(first);

    /* ── 1. Progress indicator ─────────────────────────────────────────────
       Both halves of it: the machine-readable rail for assistive tech, and the printed count a
       sighted student reads. They have to agree, because two wayfinding devices that disagree are
       worse than one. */
    assert.equal(first.step, 1, "a cold arrival must land on the first step");
    assert.ok(first.total >= 3, "a flow that does not say how many steps it has has no indicator");
    const printed = await page.locator("text=/^Step \\d+ of \\d+$/i").first().textContent();
    assert.equal(
      printed.trim().toLowerCase(),
      `step ${first.step} of ${first.total}`,
      "the printed step count and the rail's accessible name disagree",
    );

    /* ── 2. Welcome message ────────────────────────────────────────────────
       Two jobs, asserted separately, because a line that does one and not the other is the failure
       this criterion describes: say where you are, and say what the product does. */
    const body = await page.locator("main").innerText();
    // The greeting half: this is a new experience and the student is being told so.
    assert.match(body, /Welcome to Litos\./, "the first screen never greets the student");
    // The orientation half: what the product actually does with what it is about to be given.
    assert.match(
      body,
      /reads your resume, finds the jobs that match it, and fills in the applications/i,
      "the first screen never says what Litos does",
    );

    /* ── 3. Account setup, and specifically the DELAY half of it ───────────
       "Delay any fields not genuinely needed to start using the product." The resume is the one
       input that personalises everything downstream, so it is the only one allowed on screen. Any
       text, email, tel or number input here is a field that should have waited. */
    const fileInputs = await page.locator("input[type=file]").count();
    assert.equal(fileInputs, 1, "the first screen must ask for the resume, and ask for it once");
    const prematureFields = await page.locator(
      "main input[type=text], main input[type=email], main input[type=tel], main input[type=number], main input:not([type])",
    ).count();
    assert.equal(prematureFields, 0, "the first screen asks for fields that are not needed to start");

    /* ── 4. Product highlights, and its skip route ─────────────────────────*/
    const highlights = page.locator("section[aria-labelledby='how-litos-works']");
    await highlights.waitFor({ timeout: 10000 });
    /* By content, not by `div.grid`: counting a Tailwind utility means switching a row to flex, or
       nesting any unrelated grid, silently changes the number without changing what a student
       reads. These three strings ARE the criterion. */
    const walkthrough = await highlights.innerText();
    for (const feature of ["One page", "Your matches", "The forms"]) {
      assert.match(walkthrough, new RegExp(feature), `the walkthrough never introduces "${feature}"`);
    }
    assert.match(walkthrough, /you review before anything is submitted/i, "the walkthrough never reaches the review promise");

    const skip = highlights.locator("button", { hasText: "Skip" });
    await skip.click();
    await highlights.waitFor({ state: "detached", timeout: 5000 });
    const reopen = page.locator("button", { hasText: "How Litos works" });
    await reopen.waitFor({ timeout: 5000 });

    /* The skip has to SURVIVE, or it is a toggle rather than a skip: a student who has seen the
       walkthrough should not have to dismiss it on every return to setup. */
    await page.reload({ waitUntil: "domcontentloaded" });
    await screen("Your resume");
    await page.locator("button", { hasText: "How Litos works" }).waitFor({ timeout: 10000 });
    assert.equal(
      await page.locator("section[aria-labelledby='how-litos-works']").count(),
      0,
      "the walkthrough came back after being skipped",
    );

    /* ...and it has to be reversible, so a skip is never a one-way door. */
    await page.locator("button", { hasText: "How Litos works" }).click();
    await page.locator("section[aria-labelledby='how-litos-works']").waitFor({ timeout: 5000 });
  } catch (reason) {
    await captureFailure("first-screen");
    throw reason;
  }
});

test("the walk: every step in order, each one advancing the rail by one", async () => {
  try {
    /* ── Step 1, Your resume ───────────────────────────────────────────────*/
    await page.locator("input[type=file]").setInputFiles({
      name: "fixture-resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fixture, never parsed: the backend is stubbed"),
    });
    await page.locator("button", { hasText: "See my matches" }).click();

    /* ── Step 2, Your impact ───────────────────────────────────────────────
       The entry chooser only renders when the server could not tell which experience is newest
       (status "choose_entry"). This fixture answers "needs_input" with an entry already selected,
       which is the ordinary arrival, so the walk takes the ordinary exit: keep the found bullet
       and move on. */
    visited.push(await screen("Your impact"));
    const chooser = page.locator("input[name='recent-experience']");
    if (await chooser.count()) await chooser.first().check();
    await page.locator("button", { hasText: "Continue with what you found." }).click();

    /* ── Step 3, Your roles ────────────────────────────────────────────────*/
    visited.push(await screen("Your roles"));
    const rolesContinue = page.locator("button", { hasText: "Continue" });
    /* The screen seeds itself from the resume inference, so Continue is normally live on arrival.
       Picking explicitly when it is not keeps the walk about the FLOW rather than about whether
       the inference happened to produce a role type for this fixture. */
    if (await rolesContinue.isDisabled()) {
      await page.locator("button[aria-pressed]").first().click();
      await page.locator("button[aria-pressed]").last().click();
    }
    await rolesContinue.click();

    /* ── Step 4, Work visa ─────────────────────────────────────────────────*/
    visited.push(await screen("Work visa"));
    await page.locator("input[name='sponsorship'][value='no']").check();
    await page.locator("button", { hasText: "Continue" }).click();

    /* ── Step 5, Your one page ─────────────────────────────────────────────*/
    visited.push(await screen("Your one page"));
    const useThis = page.locator("button", { hasText: "Use this resume" }).first();
    await useThis.waitFor({ timeout: 25000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Use this resume" && !b.disabled),
      undefined,
      { timeout: 25000 },
    );
    await useThis.click();
    const looksRight = page.locator("button", { hasText: "Looks right" });
    await looksRight.waitFor({ timeout: 25000 });
    await looksRight.click();

    /* ── Step 6, A few details ─────────────────────────────────────────────
       The conditional screen. It renders only because this fixture reports outstanding gaps, and
       it is in the walk precisely because it is the one that used to misreport itself as step 1:
       `screen()` resolves on the rail's own accessible name, so a regression there fails here
       rather than passing quietly. GPA and its scale go together or the screen refuses to save. */
    visited.push(await screen("A few details"));
    await page.locator("#gap-gpa").fill("3.89");
    await page.locator("#gap-gpa_scale").fill("4.0");
    await page.locator("#gap-major").fill("Fixture Studies");
    await page.locator("button", { hasText: "Continue" }).click();

    /* ── Step 7, Done ──────────────────────────────────────────────────────*/
    visited.push(await screen("Done"));
  } catch (reason) {
    await captureFailure("walk");
    throw reason;
  }
});

test("criteria 5-6: the last screen confirms setup is over, then names the first action", async () => {
  try {
    const last = await rail();
    assert.equal(last.label, "Done", "the walk did not finish on the last screen");

    const main = await page.locator("main").innerText();

    /* ── 6. Completion confirmation ────────────────────────────────────────
       A heading that says setup is over, and a receipt that says what it consisted of. The receipt
       is the part that matters: "Setup complete." over an empty screen is an assertion, and the
       rows are the evidence for it. Each one is checked against the flag the walk actually set,
       so a receipt printed from constants rather than from state fails here. */
    assert.match(main, /Setup complete\./, "the flow never acknowledges that setup is finished");
    for (const [label, value] of [
      ["Your resume", "Read"],
      ["Your impact", "Reviewed"],
      ["Your roles", "Saved"],
      ["Work visa", "Answered"],
      ["Your one page", "Built"],
      ["A few details", "None missing"],
    ]) {
      assert.match(
        main,
        new RegExp(`${label}\\s*\\n?\\s*${value}`, "i"),
        `the setup receipt does not confirm "${label}" as "${value}"`,
      );
    }

    /* ── 5. First action prompt ────────────────────────────────────────────
       The button label alone names a destination. The criterion asks for the ACTION, so the prompt
       has to say what to do once there. */
    assert.match(
      main,
      /Open a match on your dashboard and Litos builds the application for you to review\./,
      "the last screen never tells the student what to do first",
    );

    const cta = page.locator("button", { hasText: "See my jobs" });
    await cta.waitFor({ timeout: 5000 });
    await cta.click();

    /* The transition into the main product, which is the other half of criterion 6. */
    await page.waitForURL(/\/dashboard$/, { timeout: 20000 });
    assert.equal(completePosts, 1, "finishing setup must complete onboarding exactly once");
  } catch (reason) {
    await captureFailure("last-screen");
    throw reason;
  }
});

/* The case that stops the receipt being decorative.
 *
 * WHY IT EXISTS: without it the six receipt assertions in the previous test are satisfied by a
 * receipt printed from constants. Measured, on this tree: replacing the row value expression with
 * a flat `spec.done` left all five other cases green, because the happy-path walk sets every flag
 * true and therefore never renders a single pending or unknown value. A receipt whose whole claim
 * is "these rows are derived from your account" needs at least one case where the account says no.
 *
 * It drives the rolling-deploy path deliberately: a legacy step name that app/start/page.tsx routes
 * to DoneStep, carrying a payload with one flag false, one list non-empty, and one field missing
 * entirely. That is the exact shape the `flag()` helper and the NOT_RECORDED value were written
 * for, and it is unreachable from the ordinary walk. */
test("criterion 6: the receipt reports the account, not a fixed list", async () => {
  try {
    forceStep = "targeting";        // legacy step -> routed to DoneStep
    omitSponsorshipFlag = true;     // older backend omits a field the type calls non-optional
    progress.base = false;          // resume never built
    progress.gaps = false;          // details still outstanding

    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
    await screen("Done");
    const main = await page.locator("main").innerText();

    assert.match(main, /Your one page\s*\n?\s*Not built/i, "a resume that was never built reports as Built");
    assert.match(main, /A few details\s*\n?\s*Some outstanding/i, "outstanding details report as complete");
    /* The unknown branch. "Answered" here would be the receipt stating that a student answered a
       work-authorization question they were never asked, which is the worst row on the screen to
       invent. */
    assert.match(main, /Work visa\s*\n?\s*Not recorded/i, "a missing flag is reported as answered");
    assert.doesNotMatch(main, /Not built[\s\S]*Built(?!\w)/, "both the pending and done values rendered");

    // The rows that ARE true still say so, so this is not just "everything reads pending".
    assert.match(main, /Your resume\s*\n?\s*Read/i, "a finished step stopped reporting as finished");
  } catch (reason) {
    await captureFailure("partial-receipt");
    throw reason;
  } finally {
    forceStep = null;
    omitSponsorshipFlag = false;
    progress.base = true;
    progress.gaps = true;
  }
});

/* Not every outstanding gap means the gaps SCREEN is coming.
 *
 * `languages` and `referral_source_default` are asked on the base screen as well
 * (BaseResumeStep writes both), so a student whose only outstanding keys are those answers them
 * there and the server never routes to the gaps screen. Counting them into the flow promised a
 * seventh screen that never arrives, which is the same bug this change removes for the no-gaps
 * case, just for a narrower cohort. The rail must read six here, on a state that is NOT empty. */
test("gaps the base screen closes do not add a step to the rail", async () => {
  try {
    forceGaps = ["languages", "referral_source_default"];
    forceStep = "base";

    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
    const rail = await screen("Your one page");
    assert.equal(rail.total, 6, `an outstanding list of only base-closed keys was counted as a step (${rail.raw})`);
    assert.equal(rail.step, 5, `the one-page screen should be fifth of six, got ${rail.raw}`);
  } catch (reason) {
    await captureFailure("base-closed-gaps");
    throw reason;
  } finally {
    forceGaps = null;
    forceStep = null;
  }
});

test("the rail's arithmetic matches the flow that was actually walked", async () => {
  try {
    assert.equal(visited.length, 7, `the walk visited ${visited.length} screens`);
    const total = visited[0].total;
    assert.equal(
      visited.length,
      total,
      `the rail claims ${total} steps and the walk found ${visited.length}: STEPS in components/start/ui.tsx is out of sync with the flow`,
    );
    visited.forEach((entry, index) => {
      assert.equal(entry.step, index + 1, `screen ${index + 1} reported itself as step ${entry.step}`);
      /* THE TOTAL MUST NOT MOVE, and this is the assertion that makes the flow list monotonic.
       *
       * `gaps` is the outstanding list, so it empties the moment that screen is finished. Deriving
       * the denominator from it directly would read 7 while the student stood on the gaps screen
       * and 6 on the very next one, so the count would appear to shrink under them. The latch in
       * app/start/page.tsx only ever turns on, and this walk crosses exactly that boundary: it
       * fills the gaps screen in and then lands on Done. */
      assert.equal(entry.total, total, `the step total moved mid-flow: screen ${index + 1} says ${entry.total}, the first said ${total}`);
    });
    assert.equal(total, 7, "this fixture reports gaps, so its student walks all seven screens");
  } catch (reason) {
    await captureFailure("rail-arithmetic");
    throw reason;
  }
});

test("the walk never left the fixture", () => {
  /* Positive evidence FIRST. Two empty arrays are trivially empty on a run that never got far
     enough to make a request, and this case reported ok while three others failed the first time
     a regression was injected upstream. `completePosts` is the one counter that can only be 1 if
     the flow actually finished. */
  assert.equal(completePosts, 1, "the walk never completed, so the assertions below prove nothing");
  assert.deepEqual(blockedExternal, [], "the page reached for a third-party origin");
  assert.deepEqual([...unstubbedBackendPaths], [], "the flow called backend paths this fixture does not answer");
});

test.after(async () => {
  await context.close();
  await browser.close();
  server.kill("SIGTERM");
  if (anyFailure) console.error(`\nartifacts written to ${ARTIFACT_DIR}`);
});
