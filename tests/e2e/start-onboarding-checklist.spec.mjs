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
  /* FOCUS LEADS, mirroring onboardingStepFrom as of flow version 3. The order in this stub is the
     product's real routing as far as this file is concerned, so it moves whenever the backend's
     does or the walk below stops testing anything. */
  if (!progress.focus) return "focus";
  if (!progress.resume) return "resume";
  if (!progress.impact) return "impact";
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

/** Every body POSTed to /onboarding/complete, so a test can assert what setup actually wrote. */
const completeBodies = [];
let applicationProfileGetStatus = 200;
const applicationProfilePutBodies = [];

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
    /* THE TWO CONSENT GRANTS, reported the way production reports them for the account owner:
       granted, dated, on the current version. This fixture is the adversary for the revocation
       test below, and it has to be a real grant or that test asserts nothing. */
    ...consentGrantState,
  };
}

/* Spread into the state above. Default is the owner's real production shape. A test that needs an
   API predating these columns sets it to {}. */
let consentGrantState = {
  automatic_consent_acceptance_enabled: true,
  automatic_consent_acceptance_consented_at: "2026-08-12T13:15:07.000Z",
  automatic_consent_acceptance_consent_version: "2026-08-12",
  automatic_conduct_acceptance_enabled: true,
  automatic_conduct_acceptance_consented_at: "2026-08-12T13:15:07.000Z",
  automatic_conduct_acceptance_consent_version: "2026-08-12",
};

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
    if (applicationProfileGetStatus !== 200) {
      await jsonRoute(route, { error: "Application profile temporarily unavailable" }, applicationProfileGetStatus);
      return;
    }
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
    applicationProfilePutBodies.push(body);
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
    completeBodies.push(route.request().postDataJSON());
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

    const first = await screen("Your roles");
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
       "Delay any fields not genuinely needed to start using the product."

       This criterion did not change; the screen it lands on did. Roles leads as of flow version 3,
       so the first screen's one ask is a field, a stage and a title or two, all of them taps. The
       resume is now the SECOND screen, and asking for a file before asking what someone is looking
       for is exactly the delay this criterion is about - so the file input must NOT be here.

       The one text input allowed is the title search, and it is allowed because it is part of this
       screen's single ask rather than a second one: a student whose title is not in the offered
       list types it there. Anything asking for an email, a phone number or a figure is a field
       that should have waited, and there must be none. */
    const fileInputs = await page.locator("input[type=file]").count();
    assert.equal(fileInputs, 0, "the first screen asks for a file before asking what the student wants");
    /* VISIBLE fields, because the criterion is about what the screen ASKS for and a collapsed
       optional disclosure is not an ask. The roles screen keeps locations, remote work and
       recruiting periods inside a shut <details> labelled OPTIONAL; their inputs are in the DOM
       the whole time, so a raw count would fail a screen that is behaving correctly. Scoped this
       way the assertion also gets STRICTER in the direction that matters: move one of those fields
       into the open and this fails, which is exactly when it should. */
    const prematureFields = await page.locator(
      "main input[type=email]:visible, main input[type=tel]:visible, main input[type=number]:visible, "
      + "main input[type=text]:not(#additional-role):visible, main input:not([type]):not(#additional-role):visible",
    ).count();
    assert.equal(prematureFields, 0, "the first screen asks for fields that are not needed to start");
    /* On ARRIVAL there is no free-text input at all, and that is the gate doing its job rather
       than an accident: the title search lives inside the titles block, and the titles block is
       withheld until a field and a stage are chosen. A cold first screen is therefore taps only,
       which is the strongest form this criterion can take. The search is asserted where it
       actually appears, in the walk below, after the two answers that summon it. */
    assert.equal(
      await page.locator("main #additional-role:visible").count(),
      0,
      "the title search is offered before a field and a stage have been chosen",
    );

    /* And the resume still gets asked for, one screen later. A reorder that quietly dropped the
       upload would satisfy every assertion above and break the product, so the walk below picks it
       up as its second screen and this file's own rail readings prove the order. */

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
    await screen("Your roles");
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

test("the first step remains operable at 320px and its walkthrough discloses accessibly", async () => {
  try {
    await page.setViewportSize({ width: 320, height: 700 });
    resetProgress();
    savedTargeting = { ...EMPTY_TARGETING };
    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
    await screen("Your roles");

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(
      geometry.scrollWidth <= geometry.clientWidth + 1,
      `the 320px onboarding screen scrolls sideways: ${JSON.stringify(geometry)}`,
    );

    const later = page.getByRole("button", { name: "Finish later" });
    await later.waitFor({ state: "visible", timeout: 20_000 });
    const laterBox = await later.boundingBox();
    assert.ok(laterBox, "Finish later has no rendered box at 320px");
    assert.ok(laterBox.height >= 44, `Finish later is only ${laterBox.height}px tall at 320px`);
    assert.ok(laterBox.x >= 0 && laterBox.x + laterBox.width <= 320, "Finish later is clipped at 320px");

    const hide = page.getByRole("button", { name: "Skip" });
    assert.equal(await hide.getAttribute("aria-expanded"), "true");
    const controlledId = await hide.getAttribute("aria-controls");
    assert.ok(controlledId, "the expanded walkthrough control names no region");
    assert.equal(await page.locator(`#${controlledId}`).count(), 1, "the expanded walkthrough region is missing");

    await hide.click();
    const show = page.getByRole("button", { name: "How Litos works" });
    await show.waitFor({ state: "visible" });
    assert.equal(await show.getAttribute("aria-expanded"), "false");
    assert.equal(await show.getAttribute("aria-controls"), controlledId);

    await show.click();
    const reopened = page.getByRole("button", { name: "Skip" });
    await reopened.waitFor({ state: "visible" });
    assert.equal(await reopened.getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator(`#${controlledId}`).count(), 1, "the walkthrough did not return");
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

test("a failed application-profile read blocks approval instead of clearing saved preferences", async () => {
  try {
    resetProgress();
    Object.assign(progress, { resume: true, impact: true, focus: true, sponsorship: true });
    applicationProfileGetStatus = 503;
    applicationProfilePutBodies.length = 0;

    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
    await page.getByText("Application profile temporarily unavailable", { exact: false }).waitFor({ timeout: 20_000 });

    assert.equal(await page.getByRole("button", { name: "Looks right" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Try loading again" }).count(), 1);
    assert.equal(applicationProfilePutBodies.length, 0, "the failed read still wrote an application profile");
  } finally {
    applicationProfileGetStatus = 200;
    resetProgress();
    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
    await screen("Your roles");
  }
});

test("the walk: every step in order, each one advancing the rail by one", async () => {
  try {
    /* ── Step 1, Your roles ────────────────────────────────────────────────
       Answered in the order the screen asks: a field, then a stage, and only then a title. The
       title assertion in the middle is the point of the screen - the offer is DERIVED from the
       field, so a walk that could pick a title before choosing a field would mean the gate is not
       real. */
    /* NOT pushed: the criteria test above already recorded this screen as `first`, and the rail
       arithmetic at the end counts each screen once. Roles is the first screen now, so it is that
       test's reading rather than this walk's. */
    await screen("Your roles");
    const softwareEngineer = page.getByRole("button", { name: "Software Engineer", exact: true });
    assert.equal(
      await softwareEngineer.count(),
      0,
      "titles were offered before a field was chosen",
    );

    await page.getByRole("button", { name: "Software & AI", exact: true }).click();
    await page.getByRole("button", { name: "Internship", exact: true }).click();
    await softwareEngineer.waitFor({ timeout: 10_000 });
    await softwareEngineer.click();

    const rolesContinue = page.locator("button", { hasText: "Continue" });
    await rolesContinue.click();

    /* ── Step 2, Your resume ───────────────────────────────────────────────*/
    visited.push(await screen("Your resume"));
    await page.locator("input[type=file]").setInputFiles({
      name: "fixture-resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fixture, never parsed: the backend is stubbed"),
    });
    await page.locator("button", { hasText: "See my matches" }).click();

    /* ── Step 3, Your impact ───────────────────────────────────────────────
       The entry chooser only renders when the server could not tell which experience is newest
       (status "choose_entry"). This fixture answers "needs_input" with an entry already selected,
       which is the ordinary arrival, so the walk takes the ordinary exit: keep the found bullet
       and move on. */
    visited.push(await screen("Your impact"));
    const chooser = page.locator("input[name='recent-experience']");
    if (await chooser.count()) await chooser.first().check();
    await page.locator("button", { hasText: "Continue with what you found." }).click();

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


/* FINISHING SETUP MUST NOT REVOKE A LIVE GRANT, ASSERTED IN THE PRODUCTION CLIENT.
 *
 * THE DEFECT. The first version of this screen seeded its boxes from a hardcoded "nothing granted"
 * and sent explicit falses on finish. Measured against the account owner's real row:
 *
 *   finish payload : {"automatic_consent_acceptance_enabled":false,
 *                     "automatic_conduct_acceptance_enabled":false}
 *   row BEFORE     : {"enabled":true,"at":"2026-08-12T13:15:07.000Z","ver":"2026-08-12"}
 *   row AFTER      : {"enabled":false,"at":null,"ver":null}
 *
 * /start has no completed-user guard, so one visit was enough to destroy a dated legal permission.
 *
 * WHY THIS IS AN E2E AND NOT A UNIT TEST. The unit tests assert the module, and the module was not
 * where the bug was: the component has to SEED FROM THE SERVER, and a component that ignores the
 * module and hardcodes its own default passes every unit test in the repo. That is exactly the
 * blind spot mutation testing found on the sibling change. This drives the real screen.
 */
test("finishing setup again does not revoke a consent the account already holds", async (t) => {
  try {
    finishedAccount({ details: "none" });

    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Setup complete." }).waitFor({ state: "visible" });

    /* SEEDED FROM THE SERVER. Both boxes must arrive ticked, because the account holds both. A
       screen that opens them unticked is the defect, before a single click. */
    const privacy = page.locator("#start-automatic_consent_acceptance_enabled");
    const conduct = page.locator("#start-automatic_conduct_acceptance_enabled");
    assert.equal(await privacy.isChecked(), true, "a held privacy grant must arrive ticked");
    assert.equal(await conduct.isChecked(), true, "a held conduct grant must arrive ticked");

    const before = completeBodies.length;
    await page.getByRole("button", { name: "See my jobs" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    const body = completeBodies[before];
    assert.ok(body, "setup must have posted");
    /* NOT REVOKED, and NOT RE-DATED EITHER. The first repair asserted `=== true` here, which was
       wrong for the second reason: the backend stamps consented_at = now on any write that names
       the column, so a redundant true moves a live grant's date to today with no deliberate act,
       and that date is written onto every control the runner ticks. She changed nothing, so the
       payload must say nothing about either grant. */
    assert.notEqual(body.automatic_consent_acceptance_enabled, false, "setup revoked the privacy grant");
    assert.notEqual(body.automatic_conduct_acceptance_enabled, false, "setup revoked the conduct grant");
    assert.equal(
      "automatic_consent_acceptance_enabled" in body,
      false,
      "setup re-dated the privacy grant by naming a column it had no news about",
    );
    assert.equal(
      "automatic_conduct_acceptance_enabled" in body,
      false,
      "setup re-dated the conduct grant by naming a column it had no news about",
    );
  } catch (reason) {
    t.diagnostic(`complete bodies: ${JSON.stringify(completeBodies)}`);
    throw reason;
  }
});

/* THE ROLLING-DEPLOY CASE, which is the one no screenshot can show. GET lands on an instance that
 * predates these columns while POST lands on one that does not. Absent reads as not granted for
 * DISPLAY, and writing that back as false revokes whatever is really stored, decided by a screen
 * that was never shown the real value. */
test("an API that never reported the columns is never told to turn them off", async (t) => {
  const previous = consentGrantState;
  try {
    consentGrantState = {};
    finishedAccount({ details: "none" });

    await page.goto(`${ORIGIN}/start`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Setup complete." }).waitFor({ state: "visible" });
    assert.equal(await page.locator("#start-automatic_consent_acceptance_enabled").isChecked(), false);

    const before = completeBodies.length;
    await page.getByRole("button", { name: "See my jobs" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    const body = completeBodies[before];
    assert.ok(body, "setup must have posted");
    assert.equal("automatic_consent_acceptance_enabled" in body, false, "an unreported column must not be written");
    assert.equal("automatic_conduct_acceptance_enabled" in body, false, "an unreported column must not be written");
  } catch (reason) {
    t.diagnostic(`complete bodies: ${JSON.stringify(completeBodies)}`);
    throw reason;
  } finally {
    consentGrantState = previous;
  }
});
