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
 * It also pins the rail's arithmetic, which is the one thing here that can rot silently. The walk
 * counts the screens it visits and asserts that count against the denominator the rail prints, so
 * a screen added to the flow but not to STEPS in components/start/ui.tsx fails here. Since that
 * denominator became the steps a given student's flow CONTAINS rather than the length of STEPS,
 * the walk pins the other direction too: it runs against an account with details outstanding and
 * requires the total to stay six, because the flow does not route to the screen that collects
 * them. The two cases after it hold the ends: a profile with no gaps at all, and the gaps screen
 * rendering anyway.
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
  /* Distinct from `gaps`, and the distinction is the whole fix. `gaps` means the fields were
     ANSWERED; this means the screen was SHOWN. Skipping sets only the second, which is why gating
     the step on the first alone derived it forever - see backend #116. */
  gapsAsked: false,
  completed: false,
};

function resetProgress() {
  for (const key of Object.keys(progress)) progress[key] = false;
}

/* An account that has finished every screen the flow routes to, set explicitly rather than
   inherited from whatever the previous test left behind.
 *
 * The cases after the walk each need a particular account, and reading it off the walk's leftovers
 * made them silently order-dependent: run one alone with --test-name-pattern, or let the walk fail
 * early, and derivedStep() answers "resume" instead of "done", so the case fails on a 20-second
 * locator timeout that says nothing about the rail it was written to check. `details` is the one
 * axis they actually vary, so it is the one argument. */
function finishedAccount({ details }) {
  resetProgress();
  Object.assign(progress, { resume: true, impact: true, focus: true, sponsorship: true, base: true });
  noGaps = details === "none";
}

/* Overrides for the partial-account case below. `forceStep` reproduces the rolling-deploy path
   app/start/page.tsx routes to DoneStep (a legacy step name arriving from an older backend), and
   `omitSponsorshipFlag` reproduces that same backend not sending a field the TS type calls
   non-optional. Both are the states the receipt's pending and unknown branches exist for, and
   neither is reachable through the happy-path walk. */
let forceStep = null;
let omitSponsorshipFlag = false;
/** Clears `gaps` without walking a screen: the student whose profile had no holes to begin with. */
let noGaps = false;
/* Holds GET /onboarding/state open so the pre-state render is observable, and holds it open for
   exactly as long as the assertions need rather than for a fixed number of milliseconds.
 *
 * A timer cannot do this job. The first version slept 5000ms and then set the delay back to 0 to
 * "release" it, which released nothing: the handler had already read the value and was sitting
 * inside the sleep. That left the case as a race in both directions - it always burned the full
 * five seconds, and if page load plus three Playwright round-trips ever exceeded them on a loaded
 * runner, the state would land mid-assertion and fail a correct implementation. A promise the
 * handler awaits inverts it: the test decides when the answer arrives. */
let releaseState = null;
function holdState() {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  releaseState = () => { release(); releaseState = null; };
  return held;
}
let heldState = null;

/** Rail order, and it must stay rail order: components/start/ui.tsx STEPS is the same sequence.
 *
 * THE `gaps` BRANCH, and the two conditions on it. This stub mirrors the real derivation, which is
 * `onboardingStepFrom` in the backend's routes/onboarding.ts. Backend #116 had removed 'gaps' from
 * that union, for a reason its diff recorded: the fields are optional and skippable, so gating on
 * `gaps.length` derived 'gaps' forever and parked the student on a screen they had already
 * dismissed. It is derived again now because both halves of that failure were fixed:
 *
 *   - the gate is the ACADEMIC three (gpa, gpa_scale, major), not the whole gap list. The old gate
 *     counted desired_salary, which is optional and blank for nearly everyone, so the screen
 *     appeared for nearly everyone and never went away;
 *   - being ASKED is recorded separately from the fields being answered (`gapsAsked` above, and
 *     application_profile.setup_gaps_asked_at in the real backend), so a skip is permanent.
 *
 * Mirror both here or this stub stops testing the routing it exists to test: a branch that checked
 * only the gap list would park this walk on the sixth screen forever. */
function derivedStep() {
  if (forceStep) return forceStep;
  if (!progress.resume) return "resume";
  if (!progress.impact) return "impact";
  if (!progress.focus) return "focus";
  if (!progress.sponsorship) return "sponsorship";
  if (!progress.base) return "base";
  if (hasSetupGaps() && !progress.gapsAsked) return "gaps";
  return "done";
}

/** The academic three, which are the only fields that route anyone to the gaps screen. */
function hasSetupGaps() {
  return ["gpa", "gpa_scale", "major"].some((f) => currentGaps().includes(f));
}

function currentGaps() {
  return noGaps || progress.gaps ? [] : ["gpa", "gpa_scale", "major"];
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
    /* What is STILL outstanding. Non-empty for the whole walk, on purpose: nothing in the derived
       flow closes these, and that is the case the rail's denominator has to get right. A student
       finishes setup with details outstanding and is asked for them later, in context.
       Languages is left out deliberately: that one gap turns the BASE step into a second question
       screen, and this walk is measuring the flow's shape rather than that screen's branch. */
    gaps: currentGaps(),
    /* The rail's denominator, and NOT a re-reading of `gaps` above: it stays true once the screen
       has been shown, whether the student answered it or skipped it. Read `gaps` instead and the
       printed total drops from seven to six on the last screen of setup. */
    includes_gaps_step: hasSetupGaps() || progress.gapsAsked,
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
  "/onboarding/work-eligibility",
  "/onboarding/complete",
  "/onboarding/gaps-asked",
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
    if (heldState) await heldState;
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
  if (pathname === "/onboarding/gaps-asked" && method === "POST") {
    // Save AND Skip both send this. It is what lets the student leave the screen at all.
    progress.gapsAsked = true;
    await jsonRoute(route, { recorded: true });
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
  if (pathname === "/onboarding/work-eligibility" && method === "PUT") {
    const records = route.request().postDataJSON()?.records;
    assert.equal(records?.[0]?.country_code, "US");
    progress.sponsorship = true;
    await jsonRoute(route, { records });
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

    /* ── Step 4, country-scoped work eligibility ──────────────────────────*/
    visited.push(await screen("Work visa"));
    await page.getByRole("heading", { name: "Where can you work?" }).waitFor();
    await page.getByRole("combobox", { name: "Country", exact: true }).selectOption("US");
    await page.getByLabel("Authorized to work now?").selectOption("yes");
    await page.getByLabel("Need sponsorship before starting?").selectOption("no");
    await page.getByLabel("Need sponsorship later?").selectOption("no");
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
       The fixture's resume printed no GPA, scale or major, so this student is routed here once.
       The walk SKIPS rather than fills, on purpose and in two directions at once: it leaves the
       account with details outstanding, which is the state every case after the walk reads, and it
       is the exact path that used to be a dead end. Skipping saves nothing, so a flow that derived
       this screen from the missing fields alone would answer 'gaps' again on the next state read
       and park the walk here forever. */
    visited.push(await screen("A few details"));
    await page.locator("button", { hasText: "Skip" }).click();

    /* ── Step 7, Done ──────────────────────────────────────────────────────
       Reached from a skip, with gpa, gpa_scale and major still outstanding. That is the ordinary
       end of setup rather than a shortcut through it: the details are collected later, in context,
       when an application actually needs them. */
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
      /* The one row the walk does NOT set, and it belongs here rather than only in the partial
         case below. The receipt lists every entry in STEPS, which is deliberately WIDER than the
         rail: the rail counts screens this student was walked through, and `gaps` is the screen the
         flow does not route to, so the rail omits it while the receipt still reports it. That is
         the right split, because the row is a fact about the account's details rather than a record
         of a screen. An honest walk therefore ends with it outstanding. */
      ["A few details", "Some outstanding"],
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
 * a flat `spec.done` left all five other cases green, because the happy-path walk then set every
 * flag true and therefore never rendered a single pending or unknown value. (The walk now ends
 * with the details row outstanding, so one pending value is covered there, but "unknown" and the
 * rest of the pending branches still are not.) A receipt whose whole claim is "these rows are
 * derived from your account" needs a case where the account says no to more than one of them.
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
    /* Back to where the walk left it, which is outstanding. Restoring it to `true` would leave the
       cases below reading an account no walk in this file ever produced. */
    progress.gaps = false;
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
    /* THE ASSERTION THIS FILE WAS MISSING, and the reason the count used to skip a number.
     *
     * This account IS routed to the gaps screen, so seven is the honest total - and it has to be
     * seven from the FIRST screen, not from the sixth. The per-screen loop below is what pins that:
     * a denominator that starts counting the gaps screen only once the student is standing on it
     * reads 6 on the resume screen and 7 here, which is the count growing underneath them. The
     * count printed on screen has to be the count of screens they will actually be shown, from the
     * first screen to the last. */
    assert.equal(
      total,
      7,
      `the rail claims ${total} steps for an account routed through the details screen`,
    );
    visited.forEach((entry, index) => {
      assert.equal(entry.step, index + 1, `screen ${index + 1} reported itself as step ${entry.step}`);
      assert.equal(entry.total, total, `screen ${index + 1} claims a different total (${entry.total} vs ${total})`);
    });
  } catch (reason) {
    await captureFailure("rail-arithmetic");
    throw reason;
  }
});

/* The other half of the denominator, and the case neither spec covered before this one.
 *
 * The walk proves a flow that CONTAINS the details screen reads seven on every screen of it. This
 * proves a flow that does not contain it reads six on every screen of it, and never seven. Together
 * the two say the denominator is a property of the flow's SHAPE - which screens this student will
 * be shown - and not of how complete their profile happens to be at the moment the rail is drawn.
 * A student who skips the screen still has every field outstanding and still reads seven; a student
 * whose resume printed all three never sees it and reads six throughout.
 *
 * The rail numbers here are also asserted by tests/start-rail-denominator.test.mjs against
 * `flowSteps` directly, which is the cheaper guard and the one that runs on every push. What only
 * this case can show is the RECEIPT's finished branch, which the walk no longer reaches: an
 * account with nothing outstanding is the one that renders "None missing". */
test("a profile with no gaps at all reads six steps, never seven", async () => {
  try {
    finishedAccount({ details: "none" });
    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
    const done = await screen("Done");
    assert.equal(done.total, 6, `an account with no outstanding details reads a total of ${done.total}`);
    assert.equal(done.step, 6, "the last screen is not the last step");

    const main = await page.locator("main").innerText();
    assert.match(main, /A few details\s*\n?\s*None missing/i, "an account with no gaps reports details outstanding");
    /* The receipt's gutter, which is a cross-reference to the rail and has to agree with it. The
       details row is not a screen this student walked, so it carries no step number: a "06" here
       under a rail reading "Step 6 of 6, Done" would be two different sixes on one screen. */
    assert.match(main, /05\s*\n?\s*Your one page/i, "the receipt gutter stopped tracking the rail");
    assert.doesNotMatch(main, /06\s*\n?\s*A few details/i, "an uncounted screen was given a rail step number");
  } catch (reason) {
    await captureFailure("no-gaps");
    throw reason;
  } finally {
    noGaps = false;
  }
});

/* THE #285 REGRESSION GUARD, and the gaps FORM, which the walk deliberately skips past.
 *
 * The walk takes the SKIP exit, because that is the path that used to be a dead end. This case
 * takes the other one and covers what only it can: GPA and its scale go together or the screen
 * refuses to save (components/start/steps.tsx `hasGpa !== hasGpaScale`).
 *
 * `forceStep` is kept rather than leaning on the derivation, so the case still holds if the routing
 * changes again: what #285 fixed is that a rendered screen missing from STEPS could not say where
 * it was - it resolved through `Math.max(0, findIndex)` to index 0 and reported itself as the FIRST
 * step. That clamp is gone, so the symptom today would be a rail with no position rather than a
 * wrong one, but the requirement is the same, and it applies to every path that renders this screen
 * including ?qa=1&step=gaps and an older backend mid-rolling-deploy. */
test("a gaps screen that does render names its own position, and still saves", async () => {
  try {
    finishedAccount({ details: "outstanding" });
    forceStep = "gaps";
    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
    const here = await screen("A few details");
    assert.equal(here.step, 6, `the gaps screen reported itself as step ${here.step}`);
    assert.equal(here.total, 7, `the flow standing on the gaps screen claims ${here.total} steps`);

    /* GPA without its scale is the refusal case: a number with no denominator is not an answer, so
       Continue must not produce a save. Asserted before the happy path so a screen that saved
       anything at all here fails rather than passing on the second attempt. */
    await page.locator("#gap-gpa").fill("3.89");
    await page.locator("button", { hasText: "Continue" }).click();
    assert.equal(progress.gaps, false, "a GPA with no scale was accepted as an answer");

    await page.locator("#gap-gpa_scale").fill("4.0");
    await page.locator("#gap-major").fill("Fixture Studies");
    await page.locator("button", { hasText: "Continue" }).click();
    await page.waitForFunction(() => true);
    // The fixture flips this only when the PUT body carries the fields this screen asks for.
    await page.waitForTimeout(500);
    assert.equal(progress.gaps, true, "the completed gaps form never reached /profile/application");
  } catch (reason) {
    await captureFailure("rendered-gaps");
    throw reason;
  } finally {
    forceStep = null;
    progress.gaps = false;
  }
});

/* The rail before there is anything to say.
 *
 * app/start/page.tsx renders it while GET /onboarding/state is still in flight, and it used to
 * pass "resume" as a stand-in step. For a returning student halfway through setup that is the one
 * device on the screen whose entire job is to say where they are, telling them the wrong thing for
 * the length of a request. It now draws the shape of the flow and makes no claim inside it. */
test("the rail claims no position before the state arrives", async () => {
  try {
    finishedAccount({ details: "outstanding" });
    /* The state request hangs here until this test releases it, so the assertions below run under
       no time pressure at all and the case costs whatever they cost rather than a fixed sleep. */
    heldState = holdState();
    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });

    const loading = page.locator("[aria-busy='true'][aria-label='Setup']");
    await loading.first().waitFor({ timeout: 20000 });
    assert.equal(
      await page.locator("[aria-label^='Setup: step']").count(),
      0,
      "the rail named a step before the state that determines it had arrived",
    );
    assert.equal(
      await page.locator("text=/^Step \\d+ of \\d+$/i").count(),
      0,
      "the rail printed a step count before the state that determines it had arrived",
    );
    /* Silence for a sighted user is the shimmer; silence for a screen reader has to be a sentence,
       or the rail is simply missing rather than waiting. */
    assert.equal(
      await page.getByText("Loading your setup progress").count(),
      1,
      "the loading rail says nothing at all to a screen reader",
    );

    /* Then it has to actually resolve, or every assertion above is satisfied by a rail that never
       says anything. Same request, released: nothing is reloaded.

       It resolves on the details screen rather than on Done because that is where this account is
       routed: `details: "outstanding"` means gpa, gpa_scale and major are missing and the screen
       has not been shown yet. Which screen it lands on is incidental to this case - what matters is
       that the rail stops claiming nothing and names a real position. */
    releaseState();
    heldState = null;
    await screen("A few details");
    await loading.first().waitFor({ state: "detached", timeout: 20000 });
  } catch (reason) {
    await captureFailure("loading-rail");
    throw reason;
  } finally {
    if (releaseState) releaseState();
    heldState = null;
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
