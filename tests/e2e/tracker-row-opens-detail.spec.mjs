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
import { isSanctionedThirdParty } from "./sanctioned-third-parties.mjs";

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
/* Every fixture carries a submission-authority envelope, because the dashboard no longer trusts a
 * bare `_review.status`. `packetForSubmissionDisplay` routes the stored review through
 * `reviewForSubmissionProjection`, which downgrades any review that CLAIMS sent to
 * `needs_attention` unless the projection is confirmed for that exact identity, and quarantines a
 * packet whose envelope does not parse. A fixture without one therefore renders the
 * needs-attention screen no matter what status it sets, which is what made this suite red.
 *
 * The ids are UUIDs for the same reason: the envelope is rejected outright when the application id
 * is not one, before any field of it is read. */
const UUID_TAIL = "-4000-8000-000000000000";
/* Hex only. The pattern is /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
 * so a key like "sent" cannot be spelled into the id directly. */
const KEY_HEX = {
  needs: "11111111",
  ready: "22222222",
  sent: "33333333",
  unverified: "44444444",
  "question-metadata": "55555555",
  "single-direct-question": "66666666",
  "legacy-question-metadata": "77777777",
  "hydrated-ready": "88888888",
};
/* Every key must be mapped. A shared fallback gave five distinct fixtures one packet id, and an
 * envelope is bound to a packet BY id, so the wrong authority can be matched to the wrong row and
 * the suite still goes green. Fail loudly instead. */
const keyHex = (key) => {
  const hex = KEY_HEX[key];
  if (!hex) throw new Error(`No fixture UUID mapped for packet key "${key}". Add one to KEY_HEX.`);
  return hex;
};
const packetUuid = (key) => `${keyHex(key)}-0000${UUID_TAIL}`;
const attemptUuid = (key) => `${keyHex(key)}-1111${UUID_TAIL}`;
/* A confirmed projection requires a UUID canonical id. null is rejected, which is the trap:
 * the packet has no canonical application, but the projection still has to carry one. */
const canonicalUuid = (key) => `${keyHex(key)}-2222${UUID_TAIL}`;

const SUBMITTED_AT = "2026-08-10T12:40:00.000Z";
const CAPTURED_AT = "2026-08-10T12:40:05.000Z";

/* A confirmed projection has an exact key set, and its receipt source has to agree with the
 * projection source, so this cannot be trimmed. */
function confirmedAuthority(key) {
  const packetId = packetUuid(key);
  const attemptId = attemptUuid(key);
  const projection = {
    state: "confirmed",
    attempt_id: attemptId,
    canonical_application_id: canonicalUuid(key),
    packet_id: packetId,
    submitted_at: SUBMITTED_AT,
    receipt: {
      confirmation_text: "Your application has been received.",
      final_url: "https://jobs.example.com/confirmation",
      captured_at: CAPTURED_AT,
      source: "managed_browser",
    },
    source: "managed_browser",
    tracker_stage: "applied",
  };
  const retrySafety = { kind: "blocked_confirmed", attemptId, confirmedAt: CAPTURED_AT };
  return {
    submission_projection: projection,
    retry_safety: retrySafety,
    submission_authority: {
      schema_version: "submission-authority-v1",
      revision: "12",
      state: "confirmed",
      application_id: packetId,
      packet_id: packetId,
      projection,
      retry_safety: retrySafety,
    },
  };
}

/* Valid, parses, and asserts nothing was ever sent. A review that makes no sent claim is returned
 * unchanged through this, which is what keeps "Review and send" on screen for a ready packet. */
function noSubmissionAuthority(key) {
  const packetId = packetUuid(key);
  const projection = { state: "none" };
  /* Not null. A "none" projection is only accepted alongside a retry verdict of `no_evidence` or
   * `safe_not_sent`; with null the envelope is rejected and the packet is quarantined, which puts
   * the needs-attention screen up even though the review itself was never downgraded. */
  const retrySafety = { kind: "no_evidence" };
  return {
    submission_projection: projection,
    retry_safety: retrySafety,
    submission_authority: {
      schema_version: "submission-authority-v1",
      revision: "12",
      state: "none",
      application_id: packetId,
      packet_id: packetId,
      projection,
      retry_safety: retrySafety,
    },
  };
}

function thinPacket(key, status, { role, company }) {
  const packetId = packetUuid(key);
  const authority = status === "submitted" ? confirmedAuthority(key) : noSubmissionAuthority(key);
  return {
    id: packetId,
    job_context: { company, role, jd_hash: `hash-${key}` },
    resume_object_key: `fixture/${key}`,
    created_at: "2026-08-10T12:00:00.000Z",
    download_url: "#",
    ...authority,
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
        ...(status === "submitted"
          ? { submitted_at: SUBMITTED_AT, submission_claim_id: attemptUuid(key) }
          : {}),
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
const FRESHLY_SENT_READY = thinPacket("ready", "submitted", {
  role: "Software Engineering Internship, Fall 2026",
  company: "Fixture Audio",
});
const UNVERIFIED_BASE = thinPacket("unverified", "needs_attention", {
  role: "Verification Evidence Engineer",
  company: "Fixture Evidence",
});
const UNVERIFIED = {
  ...UNVERIFIED_BASE,
  spec: {
    ...UNVERIFIED_BASE.spec,
    _review: {
      ...UNVERIFIED_BASE.spec._review,
      attention_reason: "Litos pressed Send and could not confirm what came back. Inspect the proof below.",
      attention_categories: ["unverified_submission"],
      portal_supported: true,
      preview_screenshot_url: "/qa/portal-preview.svg",
      unverified_submission: {
        at: "2026-08-10T12:35:00.000Z",
        cause: "no_confirmation_state",
        portal_url: "https://jobs.example.invalid/evidence",
      },
    },
  },
};
const METADATA_BLOCKED_BASE = thinPacket("question-metadata", "needs_attention", {
  role: "Question Metadata Engineer",
  company: "Fixture Choices",
});
const METADATA_BLOCKED = {
  ...METADATA_BLOCKED_BASE,
  spec: {
    ...METADATA_BLOCKED_BASE.spec,
    _review: {
      ...METADATA_BLOCKED_BASE.spec._review,
      edited_terms: [],
      skipped_reasons: [],
      filled_fields: ["name", "email", "resume"],
      questions: [{
        id: "internship-dates",
        question: "What dates are you available for an internship?",
        answer: "",
        kind: "required",
        required: true,
      }],
      question_metadata_blockers: [{
        kind: "missing_exact_options",
        required: true,
        portal_input_type: "select-one",
        control_id: "location_preference",
        portal_selector: "#location_preference",
        question: "What is your top location preference?",
      }],
    },
  },
};
const SINGLE_DIRECT_BASE = thinPacket("single-direct-question", "needs_attention", {
  role: "Application Answers Engineer",
  company: "Fixture Forms",
});
const SINGLE_DIRECT = {
  ...SINGLE_DIRECT_BASE,
  spec: {
    ...SINGLE_DIRECT_BASE.spec,
    _review: {
      ...SINGLE_DIRECT_BASE.spec._review,
      attention_reason: '"When can you start this internship?" is required and is still empty',
      attention_categories: ["required_field"],
      edited_terms: [],
      skipped_reasons: [],
      filled_fields: ["name", "email", "resume"],
      question_metadata_blockers: [],
      questions: [{
        id: "single-direct-start-date",
        question: "When can you start this internship?",
        answer: "",
        kind: "required",
        required: true,
        portal_input_type: "text",
        portal_selector: "#start_date",
      }],
    },
  },
};
const LEGACY_METADATA_BLOCKED_BASE = thinPacket("legacy-question-metadata", "needs_attention", {
  role: "Legacy Question Contract Engineer",
  company: "Fixture Historical Choices",
});
const LEGACY_METADATA_BLOCKED = {
  ...LEGACY_METADATA_BLOCKED_BASE,
  spec: {
    ...LEGACY_METADATA_BLOCKED_BASE.spec,
    _review: {
      ...LEGACY_METADATA_BLOCKED_BASE.spec._review,
      edited_terms: [],
      skipped_reasons: [],
      filled_fields: ["name", "email", "resume"],
      questions: [{
        id: "prior-application",
        question: "Have you applied here before?",
        answer: "",
        kind: "required",
        required: true,
        portal_input_type: "select-one",
        portal_selector: "#prior_application",
        options: null,
      }, {
        id: "generic-control-label",
        question: "Type your response",
        answer: "",
        kind: "required",
        required: true,
        portal_input_type: "textarea",
        portal_selector: "#unread_question",
        options: null,
      }, {
        id: "open-question",
        question: "Why this role?",
        answer: "",
        kind: "required",
        required: true,
        portal_input_type: "textarea",
        portal_selector: "#why_this_role",
        options: null,
      }],
    },
  },
};

const RESUMES = [NEEDS_YOU, READY, SENT];
let resumeHistoryOverride = null;
const HYDRATED_READY_BASE = thinPacket("hydrated-ready", "ready_to_submit", {
  role: "Hydrated Application Engineer",
  company: "Canonical Hydration",
});
const HYDRATED_READY = {
  ...HYDRATED_READY_BASE,
  spec: {
    ...HYDRATED_READY_BASE.spec,
    _review: {
      ...HYDRATED_READY_BASE.spec._review,
      portal_supported: true,
    },
  },
};
const CANONICAL_A = {
  id: "canonical-application-a",
  legacy_generated_resume_id: null,
  company: "Canonical Alpha",
  role: "Canonical Product Engineer",
  portal_url: "https://jobs.example.invalid/canonical-a",
  tracker_state: "tracked",
  review_state: "needs_attention",
  submission_state: "not_started",
  created_at: "2026-08-10T12:00:00.000Z",
  updated_at: "2026-08-10T12:30:00.000Z",
};
const CANONICAL_B = {
  ...CANONICAL_A,
  id: "canonical-application-b",
  company: "Canonical Beta",
  role: "Canonical Platform Engineer",
  portal_url: "https://jobs.example.invalid/canonical-b",
};
const CANONICAL_HYDRATED_READY = {
  ...CANONICAL_A,
  id: "canonical-hydrated-ready",
  legacy_generated_resume_id: HYDRATED_READY.id,
  company: HYDRATED_READY.job_context.company,
  role: HYDRATED_READY.job_context.role,
  portal_url: "https://jobs.example.invalid/hydrated-ready",
  review_state: "ready_to_submit",
  submission_state: "ready_to_submit",
};
let canonicalApplicationsOverride = null;
let failApplicationHistory = false;
let delayedExactHistory = null;
const submissionReviewOverrides = new Map();
let applicationMutationRequests = [];

/**
 * The rows under test, and the screen-specific control each must produce.
 *
 * Each control belongs to the selected packet's screen, so a case cannot pass on the page merely
 * surviving: it has to have drawn the detail for the row that was pressed.
 */
const CASES = [
  { name: "a needs_attention row opens in place", packet: NEEDS_YOU, expected: { role: "heading", name: "One thing to finish" } },
  { name: "a ready_for_final_approval row opens in place", packet: READY, expected: { role: "button", name: "Review and send" } },
  /* The contrast case. Green before the fix and after it. */
  { name: "a submitted row still opens in place", packet: SENT, expected: { role: "heading", name: "Sent" } },
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
  const request = route.request();
  const url = request.url();
  if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
    await route.continue();
    return;
  }
  if (url.startsWith(BACKEND_ORIGIN)) {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const method = request.method();
    backendPaths.push(pathname);
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (method !== "GET" && /^\/applications(?:\/|$)/.test(pathname)) {
      applicationMutationRequests.push({ method, pathname });
    }
    const reviewAnswerMatch = method === "PUT"
      ? pathname.match(/^\/applications\/([^/]+)\/review\/answers$/)
      : null;
    if (reviewAnswerMatch) {
      const id = reviewAnswerMatch[1];
      const packet = (resumeHistoryOverride ?? RESUMES).find((item) => item.id === id);
      const currentReview = submissionReviewOverrides.get(id) ?? packet?.spec?._review;
      const submittedQuestions = request.postDataJSON()?.questions ?? [];
      const review = {
        ...currentReview,
        questions: (currentReview?.questions ?? []).map((storedQuestion) => {
          const submitted = submittedQuestions.find((question) => question?.id === storedQuestion.id);
          return submitted ? { ...storedQuestion, ...submitted } : storedQuestion;
        }),
        updated_at: "2026-08-24T12:00:00.000Z",
      };
      submissionReviewOverrides.set(id, review);
      await json({ application_id: id, review });
      return;
    }
    if (pathname.startsWith("/jobs/")) {
      /* The real backend's answer to an id that is not a posting, message included. It is the
         message that used to reach the screen verbatim, so the fixture has to carry it or the case
         cannot tell the fix from a rewording. */
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Job not found" }) });
      return;
    }
    if (pathname === "/resume/history") {
      if (failApplicationHistory) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "fixture history failure" }) });
        return;
      }
      const exactApplicationId = parsedUrl.searchParams.get("application");
      if (delayedExactHistory?.id === exactApplicationId) {
        delayedExactHistory.reads += 1;
        await json({ resumes: delayedExactHistory.reads > delayedExactHistory.emptyReads ? [delayedExactHistory.packet] : [] });
        return;
      }
      await json({ resumes: resumeHistoryOverride ?? RESUMES });
      return;
    }
    if (pathname === "/applications") {
      if (failApplicationHistory) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "fixture ledger failure" }) });
        return;
      }
      await json({ applications: canonicalApplicationsOverride ?? [] });
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
      const packet = [...(resumeHistoryOverride ?? RESUMES), delayedExactHistory?.packet].find((item) => item?.id === id) ?? NEEDS_YOU;
      await json({ application_id: id, review: submissionReviewOverrides.get(id) ?? packet.spec._review, cover_letter: null });
      return;
    }
    await json(STUB[pathname] ?? {});
    return;
  }
  // The sanctioned analytics origin, aborted without being recorded.
  // See ./sanctioned-third-parties.mjs for the list and the call behind it.
  if (isSanctionedThirdParty(url)) return route.abort();
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
const VISUAL_OUTPUT_DIR = process.env.LITOS_VISUAL_OUTPUT_DIR?.trim() || null;
let anyFailure = false;

async function captureVisual(name) {
  if (!VISUAL_OUTPUT_DIR) return;
  await mkdir(VISUAL_OUTPUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(VISUAL_OUTPUT_DIR, name), fullPage: false });
}

async function assertInsideViewport(locator, label) {
  const box = await locator.boundingBox();
  assert.ok(box, `${label} must have a rendered box`);
  const viewport = page.viewportSize();
  assert.ok(viewport, "the viewport must be measurable");
  assert.ok(box.y >= 0 && box.y + box.height <= viewport.height, `${label} must be visible without vertical scrolling`);
  assert.ok(box.x >= 0 && box.x + box.width <= viewport.width, `${label} must be visible without horizontal scrolling`);
}

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

/* EVERY waitForURL IN THIS FILE PASSES waitUntil, AND HAS TO.
 *
 * page.waitForURL defaults to waitUntil: "load", so without it the call waits for the URL to match
 * AND for the document's load event. Every navigation in this file is deliberately only taken to
 * "domcontentloaded" - openTracker below, and the three direct gotos - so the load event is a thing
 * the spec never waited for and never needed. Asking waitForURL for it silently reintroduced that
 * wait after the click, against a 10s budget.
 *
 * That is a race the suite loses only when the server is cold. It failed on main at 38ad9f11 in
 * exactly the shape this predicts: "a needs_attention row opens in place" - the FIRST test in the
 * file, so the one paying for route compilation and a cold chunk fetch - timed out at
 * `page.waitForURL: Timeout 10000ms exceeded / waiting for navigation until "load"` after 11.6s,
 * while all four tests behind it passed in about a second each on the warmed server. The same tree
 * had passed on the PR run twelve minutes earlier, which is what a cold-start race looks like from
 * the outside: identical code, opposite results.
 *
 * These are same-document router pushes that add a query string, so the assertion the tests
 * actually make is about the ADDRESS, and DOMContentLoaded has long since fired by the time one
 * happens. Matching the navigations' own lifecycle keeps the wait on the URL, which is the thing
 * being asserted, instead of on a lifecycle event that is incidental to it.
 */

/** Wait for the address to name `applicationId`, and SAY WHAT HAPPENED when it never does.
 *
 * THE BUDGET. 10s here has now failed twice on CI, both times on the first case in this file and
 * both times at about 11.6s: once at 38ad9f11 waiting on "load" (the note above), once on
 * 2026-09-03 waiting on "domcontentloaded" after that was fixed. Two different lifecycles, the same
 * ~11.6s, which says the lifecycle was never the thing - the address itself had not changed yet.
 * Every other wait in this file that covers a cold first paint is given 20s; this one covers a cold
 * FIRST NAVIGATION and was given half that, which is the inconsistency rather than a measured
 * choice. It is 20s now, and only the first case pays it: cases 2 and 3 return in about a second.
 *
 * WHY IT CAN BE SLOW AT ALL, which is not obvious from here. The row does not navigate. It calls
 * window.history.pushState INSIDE runDashboardTransition (app/dashboard/applications/page.tsx),
 * and Next patches native history writes into its own transition, so the address is written when
 * REACT commits that transition rather than when the click returns. A cold, loaded runner can defer
 * that commit; a warm one commits it in a frame.
 *
 * AND THE DIAGNOSTIC, which matters more than the budget. A bare waitForURL timeout reports "the
 * URL did not change", which is the one fact that cannot separate the two ways this fails: a click
 * that was swallowed, and a history write that committed late. Those want opposite fixes. The
 * workspace and the pressed row tell them apart, so they are read on the way out and put in the
 * message. Both CI failures left nothing behind to say which it was, and that is why this note has
 * to speculate about the second one.
 *
 * NOT REPRODUCED LOCALLY, and the attempts are recorded so the next person does not repeat them:
 * delaying the client chunks 3s and 12s, delaying every _rsc navigation 12s, and 20x CPU throttling
 * all left this file at 17/17. React replays a click captured during hydration, and openTracker
 * already waits for rows that only exist after the client fetch, so neither a hydration gap nor a
 * slow document reproduces it from outside. */
async function waitForApplicationUrl(applicationId, { intent = null, timeout = 20_000 } = {}) {
  const matches = (url) => (
    url.pathname === "/dashboard/applications"
    && url.searchParams.get("application") === applicationId
    && (intent === null || url.searchParams.get("intent") === intent)
  );
  try {
    await page.waitForURL(matches, { timeout, waitUntil: "domcontentloaded" });
  } catch (reason) {
    const workspaceOpen = await page.getByRole("button", { name: "Switch applications", exact: true })
      .isVisible().catch(() => false);
    const pressedRows = await page.locator(`${LEDGER} button[aria-pressed="true"]:visible`).count().catch(() => -1);
    reason.message += [
      "",
      "",
      `at timeout: url=${page.url()}`,
      `            workspaceOpen=${workspaceOpen} pressedRows=${pressedRows}`,
      "workspaceOpen true with the old address means the click LANDED and the history write was",
      "deferred, so the budget is the problem. workspaceOpen false means the click never took",
      "effect at all, which is a different bug and a different fix.",
    ].join("\n");
    throw reason;
  }
}

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

    await waitForApplicationUrl(item.packet.id, { intent: "apply" });

    /* THE EJECTION CHECK. The report was that the browser left the product entirely on this click,
       so the address is asserted before anything about what rendered. */
    assert.equal(new URL(page.url()).pathname, "/dashboard/applications", `pressing the row navigated away from the Tracker, to ${page.url()}`);

    /* The route boundary, by its own words. If this is on screen the click destroyed the page. */
    const boundary = await page.getByText("This page did not load.").isVisible().catch(() => false);
    assert.equal(boundary, false, `the row took the whole Tracker into its error boundary. Page errors: ${JSON.stringify(pageErrors, null, 2)}`);

    assert.deepEqual(pageErrors, [], "the click threw on the page");

    /* And it opened THIS row, not merely something. */
    await page.getByRole(item.expected.role, { name: item.expected.name, exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: "Switch applications", exact: true }).click();
    const selectedRow = page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: item.packet.job_context.role });
    assert.equal(await selectedRow.getAttribute("aria-pressed"), "true", "the pressed row must read as selected");

    assert.deepEqual(blockedExternal, [], "no request may leave this machine");
  });
}

browserTest("the focused workspace keeps its identity and primary action above the fold on desktop", async () => {
  await page.setViewportSize({ width: 1512, height: 684 });
  try {
    await openTracker();
    await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: READY.job_context.role }).click();
    const switcher = page.getByRole("button", { name: "Switch applications", exact: true });
    const primary = page.getByRole("button", { name: "Review and send", exact: true });
    await primary.waitFor({ state: "visible", timeout: 10_000 });
    await assertInsideViewport(switcher, "the selected application switcher");
    await assertInsideViewport(primary, "the primary review action");
    await captureVisual("applications-focused-desktop-1512x684.png");
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

browserTest("the focused workspace keeps its identity and primary action above the fold on mobile", async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  try {
    await openTracker();
    await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: READY.job_context.role }).click();
    const switcher = page.getByRole("button", { name: "Switch applications", exact: true });
    const primary = page.getByRole("button", { name: "Review and send", exact: true });
    await primary.waitFor({ state: "visible", timeout: 10_000 });
    await assertInsideViewport(switcher, "the selected application switcher");
    await assertInsideViewport(primary, "the primary review action");
    await captureVisual("applications-focused-mobile-375x812.png");
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

browserTest("mobile unverified-send choices appear only after the filled-form proof", async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  resumeHistoryOverride = [UNVERIFIED];
  try {
    await openTracker();
    await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: UNVERIFIED.job_context.role }).click();
    const proofHeading = page.getByText("What the form looked like after we filled it in", { exact: true });
    const decision = page.getByRole("button", { name: "I found it there", exact: true });
    await proofHeading.waitFor({ state: "visible", timeout: 10_000 });
    await decision.waitFor({ state: "visible", timeout: 10_000 });
    const proofBox = await proofHeading.boundingBox();
    const decisionBox = await decision.boundingBox();
    assert.ok(proofBox && decisionBox && proofBox.y < decisionBox.y, "the outcome controls appeared before the proof they ask the applicant to inspect");
  } finally {
    resumeHistoryOverride = null;
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

browserTest("mobile question review prompts one safe answer and never guesses unread choices", async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  resumeHistoryOverride = [METADATA_BLOCKED];
  try {
    await openTracker();
    await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: METADATA_BLOCKED.job_context.role }).click();
    const prompt = page.locator('main section[aria-labelledby^="direct-application-question-"]');
    const screenHeading = page.getByRole("heading", { name: "What dates are you available for an internship?", exact: true });
    const editableAnswer = page.getByRole("textbox", { name: "What dates are you available for an internship?", exact: true });
    await prompt.waitFor({ state: "visible", timeout: 10_000 });
    await editableAnswer.waitFor({ state: "visible", timeout: 10_000 });
    await assertInsideViewport(screenHeading, "the answer screen heading");
    assert.equal(await prompt.count(), 1, "the application must show one direct prompt at a time");
    await prompt.getByText("1 of 1", { exact: true }).waitFor({ state: "visible" });
    await prompt.getByRole("button", { name: "Save answer", exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Check the answers", exact: true }).count(), 0);
    const screenHeadingBox = await screenHeading.boundingBox();
    const layoutState = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      activeText: document.activeElement?.textContent?.trim(),
      headers: [...document.querySelectorAll("header")].map((header) => header.getBoundingClientRect().toJSON()),
    }));
    await captureVisual("applications-question-metadata-mobile-375x812.png");
    assert.ok(screenHeadingBox && screenHeadingBox.y >= 56, `the fixed mobile header must not cover the answer screen heading: ${JSON.stringify({ screenHeadingBox, layoutState })}`);
    assert.equal(await page.getByRole("textbox", { name: "What is your top location preference?", exact: true }).count(), 0, "an unread closed choice list must not become a free-text field");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "the direct prompt must not create horizontal scrolling");
  } finally {
    resumeHistoryOverride = null;
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

browserTest("a one-question application stays on its saved answer until review", async () => {
  resumeHistoryOverride = [SINGLE_DIRECT];
  submissionReviewOverrides.delete(SINGLE_DIRECT.id);
  applicationMutationRequests = [];
  const question = "When can you start this internship?";
  const answer = "June 1, 2027";
  try {
    await openTracker();
    await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: SINGLE_DIRECT.job_context.role }).click();
    const prompt = page.locator('main section[aria-labelledby^="direct-application-question-"]');
    const heading = page.getByRole("heading", { name: question, exact: true });
    const textbox = page.getByRole("textbox", { name: question, exact: true });
    await heading.waitFor({ state: "visible", timeout: 10_000 });
    await textbox.fill(answer);
    await prompt.getByRole("button", { name: "Save answer", exact: true }).click();

    const reviewApplication = prompt.getByRole("button", { name: "Review application", exact: true });
    await reviewApplication.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await prompt.count(), 1, "saving the only answer left its question flow");
    assert.equal(await heading.count(), 1, "saving the only answer removed its question");
    assert.equal(await textbox.inputValue(), answer, "the saved one-question answer did not remain visible");
    assert.equal(await prompt.getByText("1 of 1", { exact: true }).count(), 1, "the final question lost its stable position");
    assert.equal(await prompt.getByText("Saved to this application.", { exact: true }).count(), 1, "the final question did not show its saved receipt");
    assert.equal(await page.getByRole("button", { name: "Previous question", exact: true }).count(), 0, "a one-question application rendered Previous");
    assert.equal(await page.getByRole("button", { name: "Next question", exact: true }).count(), 0, "a one-question application rendered Next");
    assert.deepEqual(applicationMutationRequests, [{
      method: "PUT",
      pathname: `/applications/${SINGLE_DIRECT.id}/review/answers`,
    }], "saving one answer issued a submit or approval mutation");
    assert.deepEqual(pageErrors, [], "saving the one-question application threw on the page");
    assert.deepEqual(blockedExternal, [], "no request may leave this machine");
  } finally {
    submissionReviewOverrides.delete(SINGLE_DIRECT.id);
    applicationMutationRequests = [];
    resumeHistoryOverride = null;
  }
});

browserTest("historical closed questions fail closed instead of rendering as textareas", async () => {
  resumeHistoryOverride = [LEGACY_METADATA_BLOCKED];
  try {
    await openTracker();
    await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: LEGACY_METADATA_BLOCKED.job_context.role }).click();
    const prompt = page.locator('main section[aria-labelledby^="direct-application-question-"]');
    const openAnswer = page.getByRole("textbox", { name: "Why this role?", exact: true });
    await prompt.waitFor({ state: "visible", timeout: 10_000 });
    await openAnswer.waitFor({ state: "visible", timeout: 10_000 });

    assert.equal(await page.getByRole("textbox", { name: "Have you applied here before?", exact: true }).count(), 0);
    assert.equal(await page.getByRole("textbox", { name: "Type your response", exact: true }).count(), 0);
    assert.equal(await prompt.getByRole("button", { name: "Save answer", exact: true }).count(), 1);
    assert.equal(await prompt.getByText("1 of 1", { exact: true }).count(), 1);
  } finally {
    resumeHistoryOverride = null;
  }
});

browserTest("fresh server state replaces an immediately opened stale row", async () => {
  await openTracker();
  resumeHistoryOverride = [NEEDS_YOU, FRESHLY_SENT_READY, SENT];
  try {
    await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: READY.job_context.role }).click();
    await page.getByRole("heading", { name: "Sent", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await page.getByRole("button", { name: "Review and send", exact: true }).count(), 0, "stale review controls must be replaced by the fresh submitted state");
  } finally {
    resumeHistoryOverride = null;
  }
});

browserTest("browser Back returns from an application to the ledger and Forward restores it", async () => {
  await openTracker();
  await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: READY.job_context.role }).click();
  await page.waitForURL((url) => url.searchParams.get("application") === READY.id, { timeout: 10_000, waitUntil: "domcontentloaded" });
  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/dashboard/applications" && !url.searchParams.has("application"), { timeout: 10_000, waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Your applications", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  await page.goForward();
  await page.waitForURL((url) => url.searchParams.get("application") === READY.id, { timeout: 10_000, waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Review and send", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
});

browserTest("closing one application and immediately opening another keeps the URL and workspace together", async () => {
  await openTracker();
  await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: NEEDS_YOU.job_context.role }).click();
  await page.waitForURL((url) => url.searchParams.get("application") === NEEDS_YOU.id, { timeout: 10_000, waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: NEEDS_YOU.job_context.role, exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });

  /* Production repro, Celerant after Truveta: the close paints the ledger synchronously, before its
     query-only navigation has necessarily settled. The next row is therefore pressable while the
     prior application id can still be in the address bar. Opening that row must replace the route
     immediately instead of leaving the new controls under the previous employer's id. */
  await page.getByRole("button", { name: /All applications/, exact: true }).click();
  await page.locator(LEDGER).waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(new URL(page.url()).searchParams.get("application"), null, "the ledger became interactive while the prior application id still named the page");
  await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: READY.job_context.role }).click();

  await page.waitForURL((url) => (
    url.searchParams.get("application") === READY.id
    && url.searchParams.get("intent") === "apply"
  ), { timeout: 10_000, waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Review and send", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(new URL(page.url()).searchParams.get("application"), READY.id);
  assert.equal(await page.getByRole("heading", { name: NEEDS_YOU.job_context.role, exact: true }).count(), 0, "the prior application's identity survived under the new URL");
});

browserTest("a failed canonical Back load never leaves the prior application's controls under the new URL", async () => {
  canonicalApplicationsOverride = [CANONICAL_A, CANONICAL_B];
  try {
    await openTracker();
    await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: CANONICAL_A.role }).click();
    await page.waitForURL((url) => url.searchParams.get("application") === CANONICAL_A.id, { timeout: 10_000, waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open and fill application", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await page.getByRole("button", { name: /All applications/ }).count(), 1, "a canonical detail must not repeat the page-level application escape");

    await page.getByRole("button", { name: "Switch applications", exact: true }).click();
    await page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: CANONICAL_B.role }).click();
    await page.waitForURL((url) => url.searchParams.get("application") === CANONICAL_B.id, { timeout: 10_000, waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: CANONICAL_B.role, exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });

    failApplicationHistory = true;
    await page.goBack();
    await page.waitForURL((url) => url.searchParams.get("application") === CANONICAL_A.id, { timeout: 10_000, waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open and fill application", exact: true }).waitFor({ state: "hidden", timeout: 10_000 });
    assert.equal(await page.getByRole("button", { name: "Tailor resume", exact: true }).count(), 0, "the previous canonical application kept an active Tailor control after the route changed");
    /* waitFor hidden, not an instant count. The defect this case exists to catch is B's identity
     * SURVIVING under A's URL, and waitFor still fails on that. An instant count also fails when
     * B's teardown lags one render behind the button above, which is a timing artifact of the
     * runner, not the defect: this exact line was the suite's one CI-only failure on 2026-08-31,
     * green twice locally on the same commit. */
    await page.getByRole("heading", { name: CANONICAL_B.role, exact: true }).first().waitFor({ state: "hidden", timeout: 10_000 });

    failApplicationHistory = false;
    await page.goForward();
    await page.waitForURL((url) => url.searchParams.get("application") === CANONICAL_B.id, { timeout: 10_000, waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open and fill application", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  } finally {
    failApplicationHistory = false;
    canonicalApplicationsOverride = null;
  }
});

browserTest("Continue to send opens a packet when hydration finishes on its already-current URL", async () => {
  canonicalApplicationsOverride = [CANONICAL_HYDRATED_READY];
  resumeHistoryOverride = [];
  delayedExactHistory = {
    id: HYDRATED_READY.id,
    packet: HYDRATED_READY,
    /* The apply-route bootstrap performs the first two exact reads. Returning the packet on the
       next routing-hydration read reproduces the production state: the canonical summary is still
       open, the browser already names the restored packet id, and Continue to send appears later. */
    emptyReads: 2,
    reads: 0,
  };
  try {
    pageErrors = [];
    await page.goto(`${ORIGIN}/dashboard/applications?application=${HYDRATED_READY.id}&intent=apply`, { waitUntil: "domcontentloaded" });
    const continueButton = page.getByRole("button", { name: "Continue to send", exact: true });
    await continueButton.waitFor({ state: "visible", timeout: 20_000 });
    assert.equal(new URL(page.url()).searchParams.get("application"), HYDRATED_READY.id);
    assert.ok(delayedExactHistory.reads >= 3, "the row never reached the delayed routing-hydration state");

    await continueButton.click();

    await page.getByRole("button", { name: "Review and fill", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(new URL(page.url()).searchParams.get("application"), HYDRATED_READY.id, "the packet workspace and URL diverged");
    assert.equal(await continueButton.count(), 0, "the canonical summary stayed open after the explicit handoff");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(blockedExternal, []);
  } finally {
    delayedExactHistory = null;
    resumeHistoryOverride = null;
    canonicalApplicationsOverride = null;
  }
});

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
  await page.getByRole("heading", { name: "One thing to finish", exact: true }).first().waitFor({ state: "visible", timeout: 20_000 });
  /* `openApplication` publishes its local selection immediately, while the App Router commits the
     query-only replacement asynchronously. Wait for that navigation itself before reading the URL,
     rather than treating the task heading as a router-settlement signal. */
  await page.waitForURL((url) => (
    !url.searchParams.has("job")
    && url.searchParams.get("application") === NEEDS_YOU.id
    && url.searchParams.get("intent") === "apply"
  ), { timeout: 10_000, waitUntil: "domcontentloaded" });

  const alerts = (await page.locator('[role="alert"]').allInnerTexts()).filter((text) => text.trim());
  assert.deepEqual(alerts, [], `the page contradicted itself: it opened the application and reported a failure. ${JSON.stringify(alerts)}`);
  const body = await page.locator("main").innerText();
  assert.ok(!body.includes("Job not found"), "the backend's wording must not reach the screen");

  /* Not asked at all. The 404 is avoided rather than caught, which is the difference between a
     quieter error and no error. */
  assert.deepEqual(backendPaths.filter((item) => item.startsWith("/jobs/")), [], "an application id must not be sent to the postings endpoint");

  /* And the parameter is gone, so a reload does not ask the postings endpoint about it again. */
  assert.equal(new URL(page.url()).searchParams.get("job"), null, `the job parameter survived: ${page.url()}`);
  assert.equal(new URL(page.url()).searchParams.get("application"), NEEDS_YOU.id, "the opened application must replace the job parameter");
  assert.equal(new URL(page.url()).searchParams.get("intent"), "apply");
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
    const switchButton = page.getByRole("button", { name: "Switch applications", exact: true });
    if (await switchButton.isVisible().catch(() => false)) await switchButton.click();
    const row = page.locator(`${LEDGER} button[aria-pressed]:visible`).filter({ hasText: item.job_context.role });
    await row.click();
    await page.waitForURL((url) => url.searchParams.get("application") === item.id && url.searchParams.get("intent") === "apply", { timeout: 10_000, waitUntil: "domcontentloaded" });
    assert.equal(new URL(page.url()).pathname, "/dashboard/applications");
    const selectedHeading = page.getByRole("heading", { name: item.job_context.role, exact: true }).first();
    await selectedHeading.waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForFunction(
      (role) => document.activeElement?.tagName === "H2" && document.activeElement.textContent?.trim() === role,
      item.job_context.role,
      { timeout: 10_000 },
    );
  }
  assert.deepEqual(pageErrors, [], "switching between rows threw on the page");
  assert.deepEqual(blockedExternal, []);
});
