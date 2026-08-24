/**
 * Production browser coverage for the dashboard's highest-risk visual contracts.
 *
 * The suite uses localhost only for the app's explicit QA fixtures and 127.0.0.1 for authenticated
 * routes backed by a fabricated account. Every backend request is intercepted. Unknown traffic
 * fails the run. Passing screenshots are kept in test-results/dashboard-visual-regressions/.
 *
 * Run with: npm run build && npm run test:dashboard-visual-regressions
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import sharp from "sharp";

import { BACKEND_ORIGIN, RESUMES, SESSION_TOKEN, STUB } from "./fixture-data.mjs";
import { compareNormalizedDashboardVisuals, normalizeDashboardVisual } from "./dashboard-visual-comparator.mjs";
import {
  DASHBOARD_VISUAL_CAPTURE_METADATA,
  dashboardVisualArtifactDirectory,
  dashboardVisualBaselineDirectory,
  dashboardVisualBaselineRoot,
} from "./dashboard-visual-paths.mjs";
import { isSanctionedThirdParty } from "./sanctioned-third-parties.mjs";

const ARTIFACT_DIR = dashboardVisualArtifactDirectory();
const VISUAL_BASELINE_DIR = dashboardVisualBaselineDirectory();
const VISUAL_BASELINE_MANIFEST = path.join(dashboardVisualBaselineRoot(), "manifest.json");
const CAPTURE_VISUAL_BASELINES = process.env.DASHBOARD_VISUAL_BASELINE_MODE === "capture";
const contexts = [];
const unknownExternal = [];
const unstubbedBackend = new Set();
let server = null;
let browser = null;
let port = null;
let ORIGIN = null;
let QA_ORIGIN = null;

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
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
      // Still starting.
    }
    await delay(250);
  }
  throw new Error(`next start never answered on ${origin}. Run npm run build first.`);
}

// Cleanup is registered before the server or browser is created.
test.after(async () => {
  await Promise.all(contexts.map((context) => context.close().catch(() => {})));
  await browser?.close().catch(() => {});
  server?.kill("SIGTERM");
  assert.deepEqual(unknownExternal, [], "a browser request tried to leave the test boundary");
  assert.deepEqual([...unstubbedBackend], [], "the backend stub received an unknown request");
  await verifyVisualBaselines();
});

test.before(async () => {
  await rm(ARTIFACT_DIR, { recursive: true, force: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });
  port = await freePort();
  ORIGIN = `http://127.0.0.1:${port}`;
  QA_ORIGIN = `http://localhost:${port}`;
  server = spawn("node_modules/.bin/next", ["start", "-H", "0.0.0.0", "-p", String(port)], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForServer(ORIGIN, server);
  browser = await chromium.launch();
  const playwrightPackage = JSON.parse(await readFile(path.join(process.cwd(), "node_modules", "playwright-core", "package.json"), "utf8"));
  await writeFile(path.join(ARTIFACT_DIR, DASHBOARD_VISUAL_CAPTURE_METADATA), `${JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    playwright: playwrightPackage.version,
    browser: browser.version(),
  }, null, 2)}\n`);
});

const ACCOUNT_FIXTURES = {
  "/email-connections": {
    configured: true,
    connections: [
      { provider: "gmail", connected: false, status: "NOT_CONNECTED" },
      { provider: "outlook", connected: false, status: "NOT_CONNECTED" },
    ],
  },
  "/application-email": {
    configured: true,
    tracking_active: true,
    tracking_blocked_reason: null,
    domain: "applications@trylitos.com",
    forward_to: "fixture@example.invalid",
    aliases: [],
  },
  "/notifications/preferences": {
    strong_match: { enabled: true, granted_at: "2026-08-01T00:00:00.000Z" },
    employer_reply: { enabled: false, granted_at: null },
    deliverable: true,
    unsubscribe_configured: true,
  },
};

const BILLING_STATE_FIXTURE = {
  ...STUB["/billing/state"],
  entitlement: {
    ...STUB["/billing/state"].entitlement,
    features: {
      ...STUB["/billing/state"].entitlement.features,
      ai_resume_tailoring: true,
      ai_cover_letter_generation: true,
      networking_discovery: true,
      referral_paths: true,
    },
  },
};

const LOCKED_BILLING_STATE_FIXTURE = {
  ...BILLING_STATE_FIXTURE,
  entitlement: {
    ...BILLING_STATE_FIXTURE.entitlement,
    access_class: "free_new",
    product: null,
    term: null,
    trial: null,
    subscription: null,
    features: {
      ...BILLING_STATE_FIXTURE.entitlement.features,
      networking_discovery: false,
      referral_paths: false,
    },
  },
};

const APPLICATION_PACKET_BOARD_FIXTURE = {
  stages: ["applied", "interview", "offer"],
  cards: [{
    id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b01",
    job_id: null,
    company: "Acme Labs",
    role: "Product Engineer",
    created_at: "2026-07-21T12:00:00.000Z",
    moved_at: "2026-07-21T12:00:00.000Z",
    reviewable: true,
    submission_status: "questions_ready",
    stage: "applied",
  }],
};

const TRANSCRIPT_PACKET = {
  ...RESUMES[0],
  id: "fixture-packet-transcript",
  job_context: {
    ...RESUMES[0].job_context,
    company: "Fixture Robotics",
    role: "Software Engineer Intern",
  },
  spec: {
    ...RESUMES[0].spec,
    _review: {
      ...RESUMES[0].spec._review,
      status: "needs_attention",
      attention_reason: '"Transcript (PDF)" is required and is still empty',
      attention_categories: ["required_document"],
      questions: [],
      required_documents: [{
        kind: "transcript",
        label: "Transcript (PDF)",
        official_requested: false,
      }],
      transcript_supported: true,
    },
  },
};

const OFFICIAL_TRANSCRIPT_PACKET = {
  ...TRANSCRIPT_PACKET,
  id: "fixture-packet-official-transcript",
  job_context: {
    ...TRANSCRIPT_PACKET.job_context,
    company: "Fixture University",
    role: "Research Engineer Intern",
  },
  spec: {
    ...TRANSCRIPT_PACKET.spec,
    _review: {
      ...TRANSCRIPT_PACKET.spec._review,
      required_documents: [{
        kind: "transcript",
        label: "Official transcript",
        official_requested: true,
      }],
    },
  },
};

const STORED_DOCUMENT_FIXTURE = {
  id: "fixture-document-transcript",
  kind: "transcript",
  file_name: "USC Transcript.pdf",
  byte_size: 124000,
  reusable: true,
  created_at: "2026-08-01T00:00:00.000Z",
  last_used_at: null,
  deleted_at: null,
};

const HOME_JOB_FIXTURE = {
  id: "fixture-home-denial-job",
  company_name: "Focus Labs",
  title: "Product Engineer Intern",
  location: "Dubai",
  department: "Engineering",
  employment_type: "Internship",
  description: "Build accessible product workflows with React, TypeScript, APIs, and careful interaction design.",
  apply_url: "https://jobs.example.com/focus-labs/product-engineer-intern",
  posting_url: "https://jobs.example.com/focus-labs/product-engineer-intern",
  remote: false,
  posted_at: "2026-08-23T00:00:00.000Z",
  first_seen_at: "2026-08-23T00:00:00.000Z",
  ats_name: "greenhouse",
  company_domain: null,
  match_score: null,
  preference_score: null,
  preference_reasons: [],
};

const HOME_BOOTSTRAP_FIXTURE = {
  ...STUB["/dashboard/bootstrap"],
  jobs: { jobs: [HOME_JOB_FIXTURE] },
  profile: {
    ...STUB["/dashboard/bootstrap"].profile,
    full_name: "Fixture Student",
    resume_email: "fixture@example.invalid",
  },
};

const TRANSCRIPT_ATTACH_RESPONSE = {
  document: STORED_DOCUMENT_FIXTURE,
  attachment: {
    kind: "transcript",
    document_id: STORED_DOCUMENT_FIXTURE.id,
    file_name: STORED_DOCUMENT_FIXTURE.file_name,
    attached_at: "2026-08-23T10:00:00.000Z",
    ordered_at: null,
    employer_label: "Transcript (PDF)",
    official_requested: false,
  },
};

const DURABLE_DRAFT_FIXTURE = {
  draft_id: "fixture-durable-draft",
  operation_id: "fixture-durable-operation",
  draft_type: "first_note",
  generation_source: "user_written",
  contact_id: "fixture-contact-priya",
  contact_email: "priya@example.invalid",
  application_id: "fixture-application-notion",
  company_scope_key: "domain:notion.so",
  company_name: "Notion",
  role: "Product Design Intern",
  subject: "Notion product design role",
  body: "Hi Priya, I am applying to the product design role and wanted to introduce myself.",
  word_count: 14,
  warnings: [],
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  contact: {
    id: "fixture-contact-priya",
    full_name: "Priya Sharma",
    title: "Recruiter",
    persona: "recruiter",
    company_domain: "notion.so",
    email: "priya@example.invalid",
  },
};

const OUTREACH_CHECKOUT_FIXTURE = {
  applicationId: "fixture-application-notion",
  contactName: "Priya Sharma",
  contactTitle: "Recruiter",
  contactEmail: "priya@example.invalid",
  company: "Notion",
  companyDomain: "notion.so",
  targetRole: "Product Design Intern",
  subject: "Restored outreach note",
  draft: "This note was restored after checkout.",
  draftType: "first_note",
  editingDraftId: null,
  resolvedContacts: null,
  selectedContact: null,
};

const RESUME_BANK_FIXTURE = {
  entries: [{
    id: "fixture-bank-entry",
    type: "job",
    org: "Acme Labs",
    title: "Product Engineer",
    date_range: "Jun 2025 - Aug 2025",
    location: "Los Angeles, CA",
    bullet_variants: ["Shipped a reliable dashboard flow."],
    tags: ["typescript", "product"],
  }],
};

const COMPLETE_TARGETING_FIXTURE = {
  ...STUB["/profile/targeting"],
  titles: [
    "Software Engineer",
    "Product Engineer",
    "Frontend Engineer",
    "Backend Engineer",
    "Full Stack Engineer",
  ],
};

function onboardingFixture() {
  return {
    automatic_submission_enabled: false,
    automatic_verification_enabled: false,
    automatic_submission_consent_version: null,
    standing_consent_eligibility: null,
    sponsorship_answer: null,
    human_check_consent_granted: false,
  };
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function dashboardContext({
  viewport,
  reducedMotion = "no-preference",
  failBankOnce = false,
  failNetworkOnce = false,
  failBillingAccessOnce = false,
  denyOutreachContacts = false,
  outreachRaceFixtures = false,
  billingStateFixture = BILLING_STATE_FIXTURE,
  boardFixture = STUB["/applications/board"],
  documentsFixture = { documents: [] },
  bankFixture = { entries: [] },
  networkStatusFixture = {
    connected: false,
    source: null,
    data_use_active: false,
    imported_people_count: 0,
    retained_people_count: 0,
    imported_at: null,
  },
  resumeHistoryFixture = null,
  submissionFixtures = {},
  bootstrapFixture = null,
  jobFixture = null,
  profileFixture = STUB["/profile"],
  targetingFixture = STUB["/profile/targeting"],
}) {
  if (!browser || !ORIGIN || !QA_ORIGIN) throw new Error("Chromium did not start");
  const context = await browser.newContext({ viewport, reducedMotion });
  contexts.push(context);
  let pendingResumeHistoryGate = null;
  let pendingTranscriptAttachGate = null;
  let pendingResumeGenerateGate = null;
  let pendingBankSaveGate = null;
  let pendingParsedProfileSaveGate = null;
  let pendingProfileUploadGate = null;
  let pendingNetworkPreviewGate = null;
  let pendingNetworkCommitGate = null;
  let pendingOutreachContactGate = null;
  let pendingOutreachDraftGate = null;
  let pendingOutreachSaveGate = null;
  let pendingOutreachManualSaveGate = null;
  let outreachDraftFixture = {
    ...DURABLE_DRAFT_FIXTURE,
    contact: { ...DURABLE_DRAFT_FIXTURE.contact },
  };
  const state = {
    bankReads: 0,
    bankSaveWrites: 0,
    bankSavesInFlight: 0,
    maxConcurrentBankSaves: 0,
    profileReads: 0,
    parsedProfileWrites: 0,
    parsedProfileWritesInFlight: 0,
    maxConcurrentParsedProfileWrites: 0,
    profileUploadWrites: 0,
    profileUploadsInFlight: 0,
    maxConcurrentProfileUploads: 0,
    historyReads: 0,
    networkStatusReads: 0,
    networkCommitWrites: 0,
    outreachApplicationWrites: [],
    outreachSaveWrites: [],
    outreachManualSaveWrites: [],
    outreachSavesInFlight: 0,
    maxConcurrentOutreachSaves: 0,
    get outreachServerDraft() {
      return outreachDraftFixture;
    },
    billingStateReads: 0,
    billingMeFailures: 0,
    billingRecovered: false,
    pageErrors: [],
    holdNextResumeHistory() {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingResumeHistoryGate = { markStarted, released, markSettled };
      return { started, release, settled };
    },
    holdNextTranscriptAttach(response) {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingTranscriptAttachGate = { markStarted, released, markSettled, response };
      return { started, release, settled };
    },
    holdNextResumeGenerate(response) {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingResumeGenerateGate = { markStarted, released, markSettled, response };
      return { started, release, settled };
    },
    holdNextBankSave() {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingBankSaveGate = { markStarted, released, markSettled };
      return { started, release, settled };
    },
    holdNextParsedProfileSave() {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingParsedProfileSaveGate = { markStarted, released, markSettled };
      return { started, release, settled };
    },
    holdNextProfileUpload(response) {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingProfileUploadGate = { markStarted, released, markSettled, response };
      return { started, release, settled };
    },
    holdNextNetworkPreview() {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingNetworkPreviewGate = { markStarted, released, markSettled };
      return { started, release, settled };
    },
    holdNextNetworkCommit() {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingNetworkCommitGate = { markStarted, released, markSettled };
      return { started, release, settled };
    },
    holdNextOutreachContact() {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingOutreachContactGate = { markStarted, released, markSettled };
      return { started, release, settled };
    },
    holdNextOutreachDraft() {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingOutreachDraftGate = { markStarted, released, markSettled };
      return { started, release, settled };
    },
    holdNextOutreachSave() {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingOutreachSaveGate = { markStarted, released, markSettled };
      return { started, release, settled };
    },
    holdNextOutreachManualSave() {
      let markStarted;
      let release;
      let markSettled;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const settled = new Promise((resolve) => { markSettled = resolve; });
      pendingOutreachManualSaveGate = { markStarted, released, markSettled };
      return { started, release, settled };
    },
  };
  await context.addInitScript((token) => {
    window.localStorage.setItem("rq_token", token);
    window.localStorage.setItem("rq_email", "fixture@example.invalid");
    window.localStorage.setItem("litos_session_mode_v1", "verified");
    window.localStorage.setItem("litos_has_history_v1", "true");
  }, SESSION_TOKEN);
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (
      url.startsWith(ORIGIN)
      || url.startsWith(QA_ORIGIN)
      || url.startsWith("data:")
      || url.startsWith("blob:")
      || url === "about:blank"
    ) {
      await route.continue();
      return;
    }
    if (url.startsWith(BACKEND_ORIGIN)) {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      const method = request.method();

      if (method === "POST" && pathname === "/billing/events") {
        await fulfillJson(route, {});
        return;
      }
      if (method === "POST" && /^\/applications\/[^/]+\/documents$/.test(pathname)) {
        const gate = pendingTranscriptAttachGate;
        if (gate) {
          pendingTranscriptAttachGate = null;
          gate.markStarted();
          await gate.released;
        }
        const response = gate?.response ?? { status: 200, body: TRANSCRIPT_ATTACH_RESPONSE };
        await fulfillJson(route, response.body, response.status);
        gate?.markSettled();
        return;
      }
      if (method === "POST" && pathname === "/resume/generate") {
        const gate = pendingResumeGenerateGate;
        if (gate) {
          pendingResumeGenerateGate = null;
          gate.markStarted();
          await gate.released;
        }
        const response = gate?.response ?? {
          status: 500,
          body: { error: "the visual fixture requires an explicit resume generation response" },
        };
        await fulfillJson(route, response.body, response.status);
        gate?.markSettled();
        return;
      }
      if (denyOutreachContacts && method === "POST" && pathname === "/applications") {
        await fulfillJson(route, { application: { id: "fixture-outreach-application" } });
        return;
      }
      if (outreachRaceFixtures && method === "POST" && pathname === "/applications") {
        const body = request.postDataJSON();
        state.outreachApplicationWrites.push(body);
        await fulfillJson(route, { application: { id: `fixture-outreach-${String(body.company).toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}` } });
        return;
      }
      if (outreachRaceFixtures && method === "POST" && pathname === "/resolve") {
        const gate = pendingOutreachContactGate;
        if (gate) {
          pendingOutreachContactGate = null;
          gate.markStarted();
          await gate.released;
        }
        const body = request.postDataJSON();
        const globex = String(body.domain).includes("globex");
        await fulfillJson(route, {
          contacts: [{
            contact: {
              id: globex ? "fixture-contact-globex" : "fixture-contact-acme",
              full_name: globex ? "Grace Globex" : "Ada Acme",
              title: "Product Engineer",
              persona: "near_peer",
              school_match: false,
              company_domain: String(body.domain),
            },
            email_resolution: {
              email: globex ? "grace@globex.example" : "ada@acme.example",
              tier: "verified",
              status: "verified",
            },
          }],
        });
        gate?.markSettled();
        return;
      }
      if (outreachRaceFixtures && method === "POST" && pathname === "/draft") {
        const gate = pendingOutreachDraftGate;
        if (gate) {
          pendingOutreachDraftGate = null;
          gate.markStarted();
          await gate.released;
        }
        const body = request.postDataJSON();
        const globex = String(body.company).includes("Globex");
        await fulfillJson(route, {
          subject: globex ? "Globex introduction" : "Acme introduction",
          body: globex ? "This is the current Globex draft." : "This stale Acme draft must never render.",
          contact_id: globex ? "fixture-contact-globex" : "fixture-contact-acme",
          draft_id: globex ? "fixture-draft-globex" : "fixture-draft-acme",
          draft_type: "first_note",
        });
        gate?.markSettled();
        return;
      }
      if (method === "PATCH" && /^\/drafts\/[^/]+$/.test(pathname)) {
        const body = request.postDataJSON();
        state.outreachSaveWrites.push(body);
        state.outreachSavesInFlight += 1;
        state.maxConcurrentOutreachSaves = Math.max(
          state.maxConcurrentOutreachSaves,
          state.outreachSavesInFlight,
        );
        const gate = pendingOutreachSaveGate;
        try {
          if (gate) {
            pendingOutreachSaveGate = null;
            gate.markStarted();
            await gate.released;
          }
          outreachDraftFixture = {
            ...outreachDraftFixture,
            subject: String(body.subject ?? outreachDraftFixture.subject),
            body: String(body.body ?? outreachDraftFixture.body),
            contact_email: typeof body.contact_email === "string" ? body.contact_email : null,
            updated_at: "2026-08-24T01:00:00.000Z",
          };
          await fulfillJson(route, { draft: outreachDraftFixture });
          gate?.markSettled();
        } finally {
          state.outreachSavesInFlight -= 1;
        }
        return;
      }
      if (method === "POST" && pathname === "/drafts/manual") {
        const body = request.postDataJSON();
        state.outreachManualSaveWrites.push(body);
        state.outreachSavesInFlight += 1;
        state.maxConcurrentOutreachSaves = Math.max(
          state.maxConcurrentOutreachSaves,
          state.outreachSavesInFlight,
        );
        const gate = pendingOutreachManualSaveGate;
        try {
          if (gate) {
            pendingOutreachManualSaveGate = null;
            gate.markStarted();
            await gate.released;
          }
          outreachDraftFixture = {
            ...DURABLE_DRAFT_FIXTURE,
            draft_id: `fixture-manual-draft-${state.outreachManualSaveWrites.length}`,
            operation_id: String(body.operation_id),
            generation_source: "user_written",
            application_id: String(body.application_id),
            company_name: String(body.contact?.company ?? "Fixture Company"),
            subject: String(body.subject),
            body: String(body.body),
            contact_email: typeof body.contact?.email === "string" ? body.contact.email : null,
            updated_at: "2026-08-24T02:00:00.000Z",
            contact: {
              ...DURABLE_DRAFT_FIXTURE.contact,
              id: String(body.contact?.id ?? "fixture-manual-contact"),
              full_name: String(body.contact?.full_name ?? "Manual Contact"),
              title: String(body.contact?.title ?? "Contact"),
              persona: String(body.contact?.persona ?? "near_peer"),
              company_domain: typeof body.contact?.company_domain === "string" ? body.contact.company_domain : null,
              email: typeof body.contact?.email === "string" ? body.contact.email : null,
            },
          };
          await fulfillJson(route, outreachDraftFixture);
          gate?.markSettled();
        } finally {
          state.outreachSavesInFlight -= 1;
        }
        return;
      }
      if (denyOutreachContacts && method === "POST" && pathname === "/resolve") {
        await delay(75);
        await fulfillJson(route, {
          code: "entitlement_required",
          feature: "contact_discovery",
          reason: "fixture_meter_exhausted",
        }, 402);
        return;
      }

      if (method === "GET" && pathname === "/billing/state") {
        state.billingStateReads += 1;
        if (failBillingAccessOnce && state.billingStateReads === 1) {
          await fulfillJson(route, { error: "fixture billing state failure" }, 500);
        } else {
          state.billingRecovered = true;
          await fulfillJson(route, billingStateFixture);
        }
        return;
      }
      if (method === "GET" && pathname === "/me" && failBillingAccessOnce && !state.billingRecovered) {
        state.billingMeFailures += 1;
        await fulfillJson(route, { error: "fixture legacy access failure" }, 500);
        return;
      }
      if (method === "GET" && pathname === "/profile") {
        state.profileReads += 1;
        await fulfillJson(route, profileFixture);
        return;
      }
      if (method === "POST" && pathname === "/profile") {
        state.profileUploadWrites += 1;
        state.profileUploadsInFlight += 1;
        state.maxConcurrentProfileUploads = Math.max(
          state.maxConcurrentProfileUploads,
          state.profileUploadsInFlight,
        );
        const gate = pendingProfileUploadGate;
        try {
          if (gate) {
            pendingProfileUploadGate = null;
            gate.markStarted();
            await gate.released;
          }
          await fulfillJson(route, gate?.response ?? profileFixture);
          gate?.markSettled();
        } finally {
          state.profileUploadsInFlight -= 1;
        }
        return;
      }
      if (method === "GET" && pathname === "/profile/experience-bank") {
        state.bankReads += 1;
        if (failBankOnce && state.bankReads === 1) {
          await fulfillJson(route, { error: "fixture bank failure" }, 500);
        } else {
          await fulfillJson(route, bankFixture);
        }
        return;
      }
      if (method === "PUT" && pathname === "/profile/experience-bank") {
        state.bankSaveWrites += 1;
        state.bankSavesInFlight += 1;
        state.maxConcurrentBankSaves = Math.max(state.maxConcurrentBankSaves, state.bankSavesInFlight);
        const gate = pendingBankSaveGate;
        try {
          if (gate) {
            pendingBankSaveGate = null;
            gate.markStarted();
            await gate.released;
          }
          const body = request.postDataJSON();
          await fulfillJson(route, { entries: Array.isArray(body.entries) ? body.entries : [] });
          gate?.markSettled();
        } finally {
          state.bankSavesInFlight -= 1;
        }
        return;
      }
      if (method === "PATCH" && pathname === "/profile/parsed") {
        state.parsedProfileWrites += 1;
        state.parsedProfileWritesInFlight += 1;
        state.maxConcurrentParsedProfileWrites = Math.max(
          state.maxConcurrentParsedProfileWrites,
          state.parsedProfileWritesInFlight,
        );
        const gate = pendingParsedProfileSaveGate;
        try {
          if (gate) {
            pendingParsedProfileSaveGate = null;
            gate.markStarted();
            await gate.released;
          }
          await fulfillJson(route, { ...profileFixture, ...request.postDataJSON() });
          gate?.markSettled();
        } finally {
          state.parsedProfileWritesInFlight -= 1;
        }
        return;
      }
      if (method === "GET" && pathname === "/network/linkedin/status") {
        state.networkStatusReads += 1;
        if (failNetworkOnce && state.networkStatusReads === 1) {
          await fulfillJson(route, { error: "fixture network failure" }, 500);
        } else {
          await fulfillJson(route, networkStatusFixture);
        }
        return;
      }
      if (method === "POST" && pathname === "/network/linkedin/import/preview") {
        const gate = pendingNetworkPreviewGate;
        if (gate) {
          pendingNetworkPreviewGate = null;
          gate.markStarted();
          await gate.released;
        }
        await fulfillJson(route, {
          import_id: "fixture-network-preview",
          accepted_rows: 2,
          rejected_rows: 0,
          warnings: [],
        });
        gate?.markSettled();
        return;
      }
      if (method === "POST" && pathname === "/network/linkedin/import/commit") {
        const gate = pendingNetworkCommitGate;
        if (gate) {
          pendingNetworkCommitGate = null;
          gate.markStarted();
          await gate.released;
        }
        state.networkCommitWrites += 1;
        await fulfillJson(route, {
          connected: true,
          source: "csv",
          data_use_active: true,
          imported_people_count: 2,
          retained_people_count: 2,
          imported_at: "2026-08-24T00:00:00.000Z",
        });
        gate?.markSettled();
        return;
      }

      if (method === "GET" && pathname === "/resume/history" && resumeHistoryFixture) {
        state.historyReads += 1;
        const gate = pendingResumeHistoryGate;
        if (gate) {
          pendingResumeHistoryGate = null;
          gate.markStarted();
          await gate.released;
        }
        await fulfillJson(route, { resumes: resumeHistoryFixture });
        if (gate) {
          gate.markSettled();
        }
        return;
      }
      if (method === "GET" && pathname === "/dashboard/bootstrap" && resumeHistoryFixture) {
        await fulfillJson(route, {
          ...STUB["/dashboard/bootstrap"],
          resume_history: { resumes: resumeHistoryFixture },
        });
        return;
      }
      if (method === "GET" && jobFixture && pathname === `/jobs/${jobFixture.id}`) {
        await fulfillJson(route, { job: jobFixture });
        return;
      }
      const submissionMatch = method === "GET"
        ? pathname.match(/^\/applications\/([^/]+)\/submission$/)
        : null;
      if (submissionMatch && submissionFixtures[submissionMatch[1]]) {
        await fulfillJson(route, submissionFixtures[submissionMatch[1]]);
        return;
      }

      const staticBody = {
        ...STUB,
        "/dashboard/bootstrap": bootstrapFixture ?? STUB["/dashboard/bootstrap"],
        "/billing/state": billingStateFixture,
        "/profile": profileFixture,
        "/profile/experience-bank": bankFixture,
        "/profile/targeting": targetingFixture,
        "/cover-letters": { cover_letters: [] },
        "/documents": documentsFixture,
        "/applications/board": boardFixture,
        "/drafts": { drafts: [outreachDraftFixture] },
        "/network/people": { people: [] },
        "/network/companies": { companies: [] },
        "/jobs/facets": { companies: [], titles: [], locations: [], roles: [] },
        "/onboarding/state": onboardingFixture(),
        ...ACCOUNT_FIXTURES,
      }[pathname];
      if (staticBody !== undefined && method === "GET") {
        await fulfillJson(route, staticBody);
        return;
      }
      if (pathname === "/sponsorship" && method === "GET") {
        await fulfillJson(route, { error: "fixture has no sponsorship record" }, 404);
        return;
      }

      unstubbedBackend.add(`${method} ${pathname}`);
      await fulfillJson(route, { error: `unstubbed ${method} ${pathname}` }, 500);
      return;
    }
    if (isSanctionedThirdParty(url)) {
      await route.abort();
      return;
    }
    const externalUrl = new URL(url);
    if (externalUrl.origin === "https://www.google.com" && externalUrl.pathname === "/s2/favicons") {
      // CompanyLogo deliberately uses this image service in production. The visual suite keeps its
      // evidence offline and deterministic by exercising the component's monogram fallback.
      await route.abort();
      return;
    }
    unknownExternal.push(`${request.method()} ${url}`);
    await route.abort();
  });
  return { context, state };
}

async function newDashboardPage(options) {
  const { context, state } = await dashboardContext(options);
  const page = await context.newPage();
  page.on("pageerror", (reason) => state.pageErrors.push(String(reason)));
  return { context, page, state };
}

async function finishDashboardAnimations(page) {
  await page.waitForFunction(() => !document.getAnimations().some((animation) => {
    const name = animation.animationName ?? "";
    return name.startsWith("rq-dashboard") && ["running", "pending"].includes(animation.playState);
  }), null, { timeout: 4_000 });
}

async function startAnimationLog(page) {
  await page.evaluate(() => {
    window.__dashboardVisualAnimationLog = [];
    window.__dashboardVisualAnimationTimer = window.setInterval(() => {
      for (const animation of document.getAnimations()) {
        const name = animation.animationName ?? "";
        if (!name.startsWith("rq-dashboard") || !["running", "pending"].includes(animation.playState)) continue;
        const timing = animation.effect?.getTiming();
        window.__dashboardVisualAnimationLog.push({
          name,
          delay: typeof timing?.delay === "number" ? timing.delay : null,
          duration: typeof timing?.duration === "number" ? timing.duration : null,
          pseudoElement: animation.effect?.pseudoElement ?? null,
          playState: animation.playState,
        });
      }
    }, 4);
  });
}

async function stopAnimationLog(page) {
  return page.evaluate(() => {
    window.clearInterval(window.__dashboardVisualAnimationTimer);
    return window.__dashboardVisualAnimationLog ?? [];
  });
}

async function assertNoLoggedDashboardMotion(page, label) {
  const samples = await stopAnimationLog(page);
  assert.deepEqual(samples, [], `${label} created dashboard motion under reduced motion: ${JSON.stringify(samples)}`);
}

async function normalizedVisualBuffer(filePath) {
  return normalizeDashboardVisual(filePath);
}

async function verifyVisualBaselines() {
  const screenshotNames = (await readdir(ARTIFACT_DIR))
    .filter((name) => name.endsWith(".png"))
    .sort();
  assert.ok(screenshotNames.length >= 70, `visual evidence is incomplete: only ${screenshotNames.length} screenshots were captured`);

  // Capture mode deliberately never writes approved evidence. The package update command runs a
  // separate writer only after this entire browser process exits successfully.
  if (CAPTURE_VISUAL_BASELINES) return;

  const manifest = JSON.parse(await readFile(VISUAL_BASELINE_MANIFEST, "utf8"));
  const baselineNames = (await readdir(VISUAL_BASELINE_DIR))
    .filter((name) => name.endsWith(".png"))
    .sort();
  assert.deepEqual(screenshotNames, baselineNames, "the visual evidence set changed without an approved baseline update");
  assert.deepEqual(screenshotNames, Object.keys(manifest).sort(), "the visual baseline manifest does not match its images");

  const failures = [];
  for (const name of screenshotNames) {
    const currentPath = path.join(ARTIFACT_DIR, name);
    const baselinePath = path.join(VISUAL_BASELINE_DIR, name);
    const metadata = await sharp(currentPath).metadata();
    assert.deepEqual(
      { width: metadata.width, height: metadata.height },
      manifest[name],
      `${name} changed viewport dimensions`,
    );
    const [current, baseline] = await Promise.all([
      normalizedVisualBuffer(currentPath),
      normalizedVisualBuffer(baselinePath),
    ]);
    assert.equal(current.length, baseline.length, `${name} baseline shape changed`);
    const comparison = compareNormalizedDashboardVisuals(current, baseline);
    if (comparison.failed) {
      failures.push({
        name,
        mean: Number(comparison.mean.toFixed(2)),
        p95: Number(comparison.p95.toFixed(2)),
        p99: Number(comparison.p99.toFixed(2)),
        changedRatio: Number(comparison.changedRatio.toFixed(4)),
        maxLocalMean: Number(comparison.maxLocalMean.toFixed(2)),
        maxLocalChangedRatio: Number(comparison.maxLocalChangedRatio.toFixed(4)),
        maxLocalCluster: comparison.maxLocalCluster,
      });
    }
  }
  assert.deepEqual(failures, [], `dashboard visuals drifted beyond the approved tolerance: ${JSON.stringify(failures)}`);
}

async function capturePass(page, name, fullPage = false) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, `${name}.png`),
    fullPage,
    animations: "disabled",
  });
}

async function resetPageScroll(page, { blurActive = true } = {}) {
  const scroll = await page.evaluate(async ({ blurActive }) => {
    document.documentElement.style.scrollBehavior = "auto";
    document.body.style.scrollBehavior = "auto";
    const main = document.querySelector("main");
    if (blurActive && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const reset = () => {
      window.scrollTo(0, 0);
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      if (main instanceof HTMLElement) main.scrollTop = 0;
    };
    reset();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    reset();
    return {
      window: window.scrollY,
      document: document.scrollingElement?.scrollTop ?? 0,
      main: main instanceof HTMLElement ? main.scrollTop : 0,
    };
  }, { blurActive });
  assert.deepEqual(scroll, { window: 0, document: 0, main: 0 }, `page did not reset before capture: ${JSON.stringify(scroll)}`);
}

async function waitForStableGeometry(locator, label) {
  const stable = await locator.evaluate(async (node) => {
    const deadline = performance.now() + 2_000;
    let previous = "";
    let consecutive = 0;
    while (performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const rect = node.getBoundingClientRect();
      const signature = [rect.x, rect.y, rect.width, rect.height]
        .map((value) => value.toFixed(2))
        .join(":");
      if (signature === previous) consecutive += 1;
      else consecutive = 0;
      previous = signature;
      if (consecutive >= 3) return true;
    }
    return false;
  });
  assert.equal(stable, true, `${label} did not settle before visual capture`);
}

async function resizeForCapture(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(
    ({ nextWidth, nextHeight }) => document.documentElement.clientWidth === nextWidth && window.innerHeight === nextHeight,
    { nextWidth: width, nextHeight: height },
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await finishDashboardAnimations(page);
}

async function armOverlayExitCapture(page, selector, { nativeBackdrop = false, hitProbe = null, keyboardShield = false } = {}) {
  await page.evaluate(({ targetSelector, captureNativeBackdrop, pointerProbe, captureKeyboardShield }) => {
    window.__dashboardOverlayExitCapture = null;
    const captureExit = (event) => {
      if (event.animationName !== "rq-dashboard-dialog-exit") return;
      const node = event.target;
      if (!(node instanceof HTMLElement) || !node.matches(targetSelector)) return;
      const dialogAnimation = node.getAnimations().find((item) => item.animationName === "rq-dashboard-dialog-exit");
      if (!dialogAnimation) return;
      const backdropAnimation = document.getAnimations().find((item) => {
        if (item.animationName !== "rq-dashboard-backdrop-exit") return false;
        if (captureNativeBackdrop) return item.effect?.pseudoElement === "::backdrop";
        return item.effect?.target instanceof HTMLElement
          && item.effect.target.classList.contains("rq-dashboard-backdrop");
      });
      const animations = [dialogAnimation, backdropAnimation].filter(Boolean);
      for (const animation of animations) {
        animation.pause();
        const duration = Number(animation.effect?.getTiming().duration ?? 130);
        animation.currentTime = duration / 2;
      }
      const backdrop = captureNativeBackdrop
        ? getComputedStyle(node, "::backdrop")
        : getComputedStyle(document.querySelector(".rq-dashboard-backdrop"));
      const hitTarget = pointerProbe
        ? document.elementFromPoint(pointerProbe.x, pointerProbe.y)
        : null;
      const tabEvent = captureKeyboardShield
        ? new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
        : null;
      if (tabEvent) document.dispatchEvent(tabEvent);
      window.__dashboardOverlayExitCapture = {
        opacity: getComputedStyle(node).opacity,
        transform: getComputedStyle(node).transform,
        ariaHidden: node.getAttribute("aria-hidden"),
        inert: node.hasAttribute("inert"),
        open: node instanceof HTMLDialogElement ? node.open : null,
        pointerEvents: getComputedStyle(node).pointerEvents,
        backdropOpacity: backdrop.opacity,
        dialogAnimation: dialogAnimation.animationName,
        backdropAnimation: backdropAnimation?.animationName ?? null,
        hitTargetProbe: hitTarget instanceof HTMLElement ? hitTarget.getAttribute("data-focus-probe") : null,
        hitTargetTag: hitTarget instanceof HTMLElement ? hitTarget.tagName.toLowerCase() : null,
        selectedTabId: document.querySelector('[role="tab"][aria-selected="true"]')?.id ?? null,
        tabPrevented: tabEvent?.defaultPrevented ?? null,
      };
      if (hitTarget instanceof HTMLElement) hitTarget.click();
      for (const animation of animations) animation.play();
      document.removeEventListener("animationstart", captureExit, true);
    };
    document.addEventListener("animationstart", captureExit, true);
  }, {
    targetSelector: selector,
    captureNativeBackdrop: nativeBackdrop,
    pointerProbe: hitProbe,
    captureKeyboardShield: keyboardShield,
  });
}

async function assertRetainedOverlayExit(page, label, { keyboardShield = false } = {}) {
  await page.waitForFunction(() => window.__dashboardOverlayExitCapture !== null);
  const sample = await page.evaluate(() => window.__dashboardOverlayExitCapture);
  assert.equal(sample.dialogAnimation, "rq-dashboard-dialog-exit", `${label} did not create a dialog exit`);
  assert.equal(sample.backdropAnimation, "rq-dashboard-backdrop-exit", `${label} did not create a backdrop exit`);
  assert.equal(sample.opacity, "1", `${label} ghosted its readable content during exit`);
  assert.notEqual(sample.transform, "none", `${label} did not move during exit`);
  assert.equal(sample.ariaHidden, "true", `${label} stayed exposed to assistive technology during exit`);
  assert.equal(sample.inert, true, `${label} stayed interactive during exit`);
  assert.equal(sample.pointerEvents, "none", `${label} kept pointer interaction during exit`);
  if (keyboardShield) assert.equal(sample.tabPrevented, true, `${label} let Tab enter the page during retained exit`);
  const backdropOpacity = Number(sample.backdropOpacity);
  assert.ok(
    Number.isFinite(backdropOpacity) && backdropOpacity > 0 && backdropOpacity < 1,
    `${label} backdrop did not fade at the exit midpoint: ${JSON.stringify(sample)}`,
  );
  return sample;
}

async function assertContained(page, label) {
  const result = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offenders = [...document.body.querySelectorAll("*")]
      .filter((node) => {
        const style = getComputedStyle(node);
        if (style.position === "fixed" || style.display === "none" || style.visibility === "hidden") return false;
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || (rect.left >= -1 && rect.right <= viewport + 1)) return false;
        let ancestor = node.parentElement;
        while (ancestor && ancestor !== document.body) {
          const overflowX = getComputedStyle(ancestor).overflowX;
          if (["auto", "scroll", "hidden", "clip"].includes(overflowX) && ancestor.scrollWidth > ancestor.clientWidth) {
            return false;
          }
          ancestor = ancestor.parentElement;
        }
        return true;
      })
      .slice(0, 8)
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        id: node.id,
        className: String(node.className).slice(0, 90),
        rect: node.getBoundingClientRect().toJSON(),
      }));
    return {
      viewport,
      scrollWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });
  assert.ok(
    result.scrollWidth <= result.viewport + 1,
    `${label} overflowed ${result.viewport}px: ${JSON.stringify(result)}`,
  );
  assert.deepEqual(result.offenders, [], `${label} painted outside the viewport: ${JSON.stringify(result.offenders)}`);
}

async function assertEveryTabControlsLivePanel(tablist, label) {
  const result = await tablist.evaluate((list) => [...list.querySelectorAll('[role="tab"]')]
    .filter((tab) => {
      const style = getComputedStyle(tab);
      return style.display !== "none" && style.visibility !== "hidden";
    })
    .map((tab) => {
      const controls = tab.getAttribute("aria-controls");
      const panel = controls ? document.getElementById(controls) : null;
      return {
        id: tab.id,
        controls,
        selected: tab.getAttribute("aria-selected") === "true",
        targetExists: panel !== null,
        targetRole: panel?.getAttribute("role") ?? null,
        targetLabelledBy: panel?.getAttribute("aria-labelledby") ?? null,
      };
    }));
  assert.ok(result.length > 1, `${label} did not expose a tab set: ${JSON.stringify(result)}`);
  assert.ok(result.some((tab) => !tab.selected), `${label} did not include an inactive tab`);
  for (const tab of result) {
    assert.ok(tab.controls, `${label} tab ${tab.id} has no aria-controls value`);
    assert.equal(tab.targetExists, true, `${label} tab ${tab.id} controls missing #${tab.controls}`);
    assert.equal(tab.targetRole, "tabpanel", `${label} target #${tab.controls} is not a tabpanel`);
    if (tab.selected) {
      assert.equal(tab.targetLabelledBy, tab.id, `${label} active target #${tab.controls} is not labelled by ${tab.id}`);
    }
  }
}

async function assertSelectedTabVisible(tablist, label) {
  await tablist.evaluate(async (list) => {
    const deadline = performance.now() + 2_000;
    while (performance.now() < deadline) {
      const selected = list.querySelector('[role="tab"][aria-selected="true"]');
      let viewport = list;
      while (viewport.parentElement) {
        const overflowX = getComputedStyle(viewport).overflowX;
        if (["auto", "scroll"].includes(overflowX)) break;
        viewport = viewport.parentElement;
      }
      if (selected instanceof HTMLElement) {
        const selectedRect = selected.getBoundingClientRect();
        const viewportRect = viewport.getBoundingClientRect();
        const cues = [...(viewport.parentElement?.children ?? [])].filter((node) => {
          if (!(node instanceof HTMLElement) || node === viewport || node.getAttribute("aria-hidden") !== "true") return false;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.position === "absolute" && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0;
        });
        const midpoint = viewportRect.left + viewportRect.width / 2;
        const cueRects = cues.map((cue) => cue.getBoundingClientRect());
        const safeLeft = Math.max(
          viewportRect.left,
          ...cueRects.filter((rect) => rect.left < midpoint).map((rect) => rect.right),
        );
        const safeRight = Math.min(
          viewportRect.right,
          ...cueRects.filter((rect) => rect.left >= midpoint).map((rect) => rect.left),
        );
        if (selectedRect.left >= safeLeft - 1 && selectedRect.right <= safeRight + 1) return;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
  const result = await tablist.evaluate((list) => {
    const selected = list.querySelector('[role="tab"][aria-selected="true"]');
    if (!(selected instanceof HTMLElement)) return null;
    let viewport = list;
    while (viewport.parentElement) {
      const overflowX = getComputedStyle(viewport).overflowX;
      if (["auto", "scroll"].includes(overflowX)) break;
      viewport = viewport.parentElement;
    }
    const selectedRect = selected.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const cues = [...(viewport.parentElement?.children ?? [])].filter((node) => {
      if (!(node instanceof HTMLElement) || node === viewport || node.getAttribute("aria-hidden") !== "true") return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.position === "absolute" && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0;
    });
    const midpoint = viewportRect.left + viewportRect.width / 2;
    const cueRects = cues.map((cue) => cue.getBoundingClientRect());
    const safeLeft = Math.max(
      viewportRect.left,
      ...cueRects.filter((rect) => rect.left < midpoint).map((rect) => rect.right),
    );
    const safeRight = Math.min(
      viewportRect.right,
      ...cueRects.filter((rect) => rect.left >= midpoint).map((rect) => rect.left),
    );
    return {
      selectedId: selected.id,
      selected: selectedRect.toJSON(),
      viewport: viewportRect.toJSON(),
      safeLeft,
      safeRight,
      cues: cueRects.map((rect) => rect.toJSON()),
      windowWidth: document.documentElement.clientWidth,
    };
  });
  assert.ok(result, `${label} has no selected tab`);
  assert.ok(
    result.selected.left >= Math.max(0, result.safeLeft) - 1
      && result.selected.right <= Math.min(result.windowWidth, result.safeRight) + 1,
    `${label} selected tab is outside its visible viewport: ${JSON.stringify(result)}`,
  );
}

async function assertOutreachTrayReachable(page, label) {
  const result = await page.locator("[data-outreach-terminal-actions]").evaluate((content) => {
    const tray = content.parentElement;
    const save = [...content.querySelectorAll("button")].find((button) => /^Save (draft|changes)$/.test(button.textContent?.trim() ?? ""));
    const dashboardNav = document.querySelector('nav[aria-label="Dashboard"]');
    if (!(tray instanceof HTMLElement) || !(save instanceof HTMLButtonElement)) return null;
    const trayRect = tray.getBoundingClientRect();
    const saveRect = save.getBoundingClientRect();
    const navStyle = dashboardNav ? getComputedStyle(dashboardNav) : null;
    const navRect = navStyle && navStyle.display !== "none" ? dashboardNav.getBoundingClientRect() : null;
    const hitTarget = document.elementFromPoint(saveRect.left + saveRect.width / 2, saveRect.top + saveRect.height / 2);
    return {
      tray: trayRect.toJSON(),
      save: saveRect.toJSON(),
      safeBottom: navRect?.top ?? window.innerHeight,
      viewportHeight: window.innerHeight,
      hitInsideSave: hitTarget === save || save.contains(hitTarget),
      primaryBackground: getComputedStyle(save).backgroundColor,
    };
  });
  assert.ok(result, `${label} has no terminal save action`);
  assert.ok(result.tray.top >= -1 && result.tray.bottom <= result.safeBottom + 1, `${label} tray is outside its safe viewport: ${JSON.stringify(result)}`);
  assert.ok(result.save.top >= result.tray.top - 1 && result.save.bottom <= result.tray.bottom + 1, `${label} save action escaped its tray: ${JSON.stringify(result)}`);
  assert.equal(result.hitInsideSave, true, `${label} save action is visually covered: ${JSON.stringify(result)}`);
  assert.notEqual(result.primaryBackground, "rgba(0, 0, 0, 0)", `${label} save action lost its primary fill`);
}

async function scrollTablistToEnd(tablist) {
  await tablist.evaluate((list) => {
    let viewport = list;
    while (viewport.parentElement) {
      const overflowX = getComputedStyle(viewport).overflowX;
      if (["auto", "scroll"].includes(overflowX)) break;
      viewport = viewport.parentElement;
    }
    viewport.scrollLeft = viewport.scrollWidth;
    viewport.dispatchEvent(new Event("scroll"));
  });
}

function assertNoPageErrors(state, label) {
  assert.deepEqual(state.pageErrors, [], `${label} raised a page error`);
}

test("hand-built application overlays retain an inert exit and restore their exact triggers", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    boardFixture: APPLICATION_PACKET_BOARD_FIXTURE,
    resumeHistoryFixture: [TRANSCRIPT_PACKET, OFFICIAL_TRANSCRIPT_PACKET],
    submissionFixtures: {
      [TRANSCRIPT_PACKET.id]: {
        application_id: TRANSCRIPT_PACKET.id,
        review: TRANSCRIPT_PACKET.spec._review,
        cover_letter: null,
        documents: {},
      },
      [OFFICIAL_TRANSCRIPT_PACKET.id]: {
        application_id: OFFICIAL_TRANSCRIPT_PACKET.id,
        review: OFFICIAL_TRANSCRIPT_PACKET.spec._review,
        cover_letter: null,
        documents: {},
      },
    },
  });
  try {
    await page.goto(`${QA_ORIGIN}/dashboard/applications?qa=1`, { waitUntil: "domcontentloaded" });
    const allApplications = page.getByRole("button", { name: /All applications/ });
    await allApplications.waitFor({ state: "visible" });
    await allApplications.click();
    const packetTrigger = page.getByRole("button", {
      name: /See the application built for Product Engineer at Acme Labs/,
    });
    await packetTrigger.waitFor({ state: "visible" });
    await packetTrigger.evaluate((node) => node.setAttribute("data-focus-probe", "application-packet-trigger"));
    const packetTriggerPoint = await packetTrigger.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await packetTrigger.click();
    const packetDialog = page.getByRole("dialog", {
      name: "Application packet: Product Engineer at Acme Labs",
    });
    await packetDialog.waitFor({ state: "visible", timeout: 5_000 }).catch(async (reason) => {
      const diagnostic = await page.evaluate(() => ({
        url: location.href,
        activeText: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim(),
        mainText: document.querySelector("main")?.textContent?.trim().slice(0, 2_000),
      }));
      assert.fail(`Application packet did not open: ${reason.message}\n${JSON.stringify(diagnostic)}`);
    });
    await finishDashboardAnimations(page);
    await capturePass(page, "application-packet-overlay-open");
    await resizeForCapture(page, 390, 844);
    await capturePass(page, "application-packet-overlay-mobile");
    await assertContained(page, "Application packet overlay at 390px");
    await resizeForCapture(page, 1280, 900);
    await armOverlayExitCapture(
      page,
      '[role="dialog"][aria-label="Application packet: Product Engineer at Acme Labs"]',
      { hitProbe: packetTriggerPoint, keyboardShield: true },
    );
    await packetDialog.getByRole("button", { name: "Close", exact: true }).click();
    const packetExit = await assertRetainedOverlayExit(page, "Application packet", { keyboardShield: true });
    assert.notEqual(packetExit.hitTargetProbe, "application-packet-trigger", "Application packet exit clicked through to its trigger");
    await packetDialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-focus-probe") === "application-packet-trigger");

    await packetTrigger.click();
    await packetDialog.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await packetTrigger.evaluate((node) => node.remove());
    await packetDialog.getByRole("button", { name: "Close", exact: true }).click();
    await packetDialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.id === "application-ledger-heading");

    await page.goto(`${ORIGIN}/dashboard/applications?application=${TRANSCRIPT_PACKET.id}&intent=apply`, {
      waitUntil: "domcontentloaded",
    });
    const transcriptTrigger = page.getByRole("button", {
      name: /Add the file this employer asks for: .*needs your transcript/i,
    });
    await transcriptTrigger.waitFor({ state: "visible" });
    await transcriptTrigger.evaluate((node) => node.setAttribute("data-focus-probe", "transcript-trigger"));
    const transcriptTriggerPoint = await transcriptTrigger.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await transcriptTrigger.click();
    const transcriptDialog = page.getByRole("dialog", {
      name: "transcript for Software Engineer Intern at Fixture Robotics",
    });
    await transcriptDialog.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await resetPageScroll(page, { blurActive: false });
    await capturePass(page, "transcript-overlay-open");
    await resizeForCapture(page, 390, 844);
    await resetPageScroll(page, { blurActive: false });
    await capturePass(page, "transcript-overlay-mobile");
    await assertContained(page, "Transcript overlay at 390px");
    await resizeForCapture(page, 1280, 900);
    await transcriptDialog.locator('input[type="file"]').setInputFiles({
      name: "USC Transcript.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fixture transcript"),
    });
    const attachAction = transcriptDialog.locator('[data-transcript-action="attach"]');
    const failedAttach = state.holdNextTranscriptAttach({
      status: 503,
      body: { error: "Fixture transcript upload failed." },
    });
    await attachAction.focus();
    await attachAction.click();
    await failedAttach.started;
    assert.deepEqual(await attachAction.evaluate((node) => ({
      focused: document.activeElement === node,
      disabled: node.hasAttribute("disabled"),
      ariaDisabled: node.getAttribute("aria-disabled"),
      ariaBusy: node.getAttribute("aria-busy"),
    })), { focused: true, disabled: false, ariaDisabled: "true", ariaBusy: "true" });
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="transcript for Software Engineer Intern at Fixture Robotics"]');
      return dialog instanceof HTMLElement && dialog.contains(document.activeElement);
    });
    await page.keyboard.press("Shift+Tab");
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-transcript-action") === "attach");
    failedAttach.release();
    await failedAttach.settled;
    await transcriptDialog.getByRole("alert").filter({ hasText: "Fixture transcript upload failed." }).waitFor({ state: "visible" });
    assert.deepEqual(await attachAction.evaluate((node) => ({
      focused: document.activeElement === node,
      ariaDisabled: node.getAttribute("aria-disabled"),
      ariaBusy: node.getAttribute("aria-busy"),
    })), { focused: true, ariaDisabled: "false", ariaBusy: "false" });
    await resetPageScroll(page, { blurActive: false });
    await capturePass(page, "transcript-upload-failure-focus");

    const successfulAttach = state.holdNextTranscriptAttach({ status: 200, body: TRANSCRIPT_ATTACH_RESPONSE });
    await attachAction.click();
    await successfulAttach.started;
    assert.equal(await attachAction.evaluate((node) => document.activeElement === node), true);
    successfulAttach.release();
    await successfulAttach.settled;
    await transcriptDialog.getByRole("heading", { name: "Transcript attached" }).waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Close");
    await resetPageScroll(page, { blurActive: false });
    await capturePass(page, "transcript-upload-success-focus");
    await transcriptDialog.getByRole("button", { name: "Remove this file", exact: true }).click();
    const keepFile = transcriptDialog.getByRole("button", { name: "Keep this file", exact: true });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-confirm-keep") === "true");
    await keepFile.click();
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Close");
    assert.equal(await transcriptDialog.getByRole("heading", { name: "Transcript attached" }).count(), 1);
    await armOverlayExitCapture(
      page,
      '[role="dialog"][aria-label="transcript for Software Engineer Intern at Fixture Robotics"]',
      { hitProbe: transcriptTriggerPoint, keyboardShield: true },
    );
    await transcriptDialog.getByRole("button", { name: "Close", exact: true }).click();
    const transcriptExit = await assertRetainedOverlayExit(page, "Transcript", { keyboardShield: true });
    assert.notEqual(transcriptExit.hitTargetProbe, "transcript-trigger", "Transcript exit clicked through to its trigger");
    await transcriptDialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => {
      const active = document.activeElement;
      return active?.getAttribute("data-focus-probe") === "transcript-trigger"
        || active?.id === "application-ledger-heading";
    });

    await page.goto(`${ORIGIN}/dashboard/applications?application=${OFFICIAL_TRANSCRIPT_PACKET.id}&intent=apply`, {
      waitUntil: "domcontentloaded",
    });
    const officialTrigger = page.getByRole("button", {
      name: "Add the file this employer asks for: Fixture University needs your transcript",
      exact: true,
    });
    await officialTrigger.waitFor({ state: "visible" });
    await officialTrigger.evaluate((node) => node.setAttribute("data-focus-probe", "official-transcript-trigger"));
    await officialTrigger.click();
    const officialDialog = page.getByRole("dialog", {
      name: "transcript for Research Engineer Intern at Fixture University",
    });
    await officialDialog.waitFor({ state: "visible" });
    await officialDialog.getByRole("heading", { name: "This one wants an official transcript" }).waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await waitForStableGeometry(officialDialog, "Official transcript request stage");
    await resetPageScroll(page, { blurActive: false });
    await capturePass(page, "transcript-official-request");
    await officialDialog.getByRole("button", { name: "Attach an unofficial copy anyway", exact: true }).click();
    await page.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="transcript for Research Engineer Intern at Fixture University"]');
      return dialog instanceof HTMLElement
        && dialog.contains(document.activeElement)
        && document.activeElement?.textContent?.trim() === "Close";
    });
    await officialDialog.getByRole("heading", { name: "Fixture University asks for your transcript" }).waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await waitForStableGeometry(officialDialog, "Official transcript upload stage");
    await resetPageScroll(page, { blurActive: false });
    await capturePass(page, "transcript-official-to-upload-focus");
    await officialDialog.getByRole("button", { name: "Close", exact: true }).click();
    await officialDialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-focus-probe") === "official-transcript-trigger");
    assertNoPageErrors(state, "Application overlays");
  } finally {
    await context.close();
  }
});

test("native dashboard dialogs retain their top layer through exit and restore focus", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    billingStateFixture: LOCKED_BILLING_STATE_FIXTURE,
    documentsFixture: { documents: [STORED_DOCUMENT_FIXTURE] },
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/network`, { waitUntil: "domcontentloaded" });
    const upgradeTrigger = page.getByRole("button", { name: "See Litos+", exact: true });
    await upgradeTrigger.waitFor({ state: "visible" });
    await upgradeTrigger.evaluate((node) => node.setAttribute("data-focus-probe", "upgrade-trigger"));
    await upgradeTrigger.click();
    const upgradeDialog = page.getByRole("dialog", { name: /Find referral paths with Litos\+/ });
    await upgradeDialog.waitFor({ state: "visible" });
    await upgradeDialog.evaluate((node) => node.setAttribute("data-overlay-probe", "upgrade"));
    await finishDashboardAnimations(page);
    await capturePass(page, "upgrade-dialog-open");
    await resizeForCapture(page, 390, 844);
    await capturePass(page, "upgrade-dialog-mobile");
    await resizeForCapture(page, 1280, 900);
    await armOverlayExitCapture(page, 'dialog[data-overlay-probe="upgrade"]', { nativeBackdrop: true });
    await upgradeDialog.getByRole("button", { name: "Close Litos+ options" }).click();
    await assertRetainedOverlayExit(page, "Upgrade dialog");
    await upgradeDialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-focus-probe") === "upgrade-trigger");

    await page.goto(`${ORIGIN}/dashboard/settings#sign-in`, { waitUntil: "domcontentloaded" });
    const deleteTrigger = page.getByRole("button", { name: "Delete account", exact: true });
    await deleteTrigger.waitFor({ state: "visible" });
    await deleteTrigger.evaluate((node) => node.setAttribute("data-focus-probe", "delete-account-trigger"));
    await deleteTrigger.click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete your account?" });
    await deleteDialog.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await capturePass(page, "delete-account-dialog-open");
    await resizeForCapture(page, 390, 844);
    await capturePass(page, "delete-account-dialog-mobile");
    await resizeForCapture(page, 1280, 900);
    await armOverlayExitCapture(page, 'dialog[aria-labelledby="delete-title"]', { nativeBackdrop: true });
    await deleteDialog.getByRole("button", { name: "Keep account" }).click();
    await assertRetainedOverlayExit(page, "Delete account dialog");
    await page.waitForFunction(() => {
      const node = document.querySelector('dialog[aria-labelledby="delete-title"]');
      return node instanceof HTMLDialogElement && !node.open;
    });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-focus-probe") === "delete-account-trigger");

    await page.goto(`${ORIGIN}/dashboard/settings#job-search`, { waitUntil: "domcontentloaded" });
    const documentTrigger = page.getByRole("button", { name: "Remove USC Transcript.pdf" });
    await documentTrigger.waitFor({ state: "visible" });
    await documentTrigger.evaluate((node) => node.setAttribute("data-focus-probe", "document-remove-trigger"));
    await documentTrigger.click();
    const documentDialog = page.getByRole("dialog", { name: /Remove USC Transcript\.pdf\?/ });
    await documentDialog.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await capturePass(page, "remove-document-dialog-open");
    await resizeForCapture(page, 390, 844);
    await capturePass(page, "remove-document-dialog-mobile");
    await resizeForCapture(page, 1280, 900);
    await armOverlayExitCapture(page, 'dialog[aria-labelledby="remove-document-title"]', { nativeBackdrop: true });
    await documentDialog.getByRole("button", { name: "Keep this file" }).click();
    await assertRetainedOverlayExit(page, "Remove document dialog");
    await page.waitForFunction(() => {
      const node = document.querySelector('dialog[aria-labelledby="remove-document-title"]');
      return node instanceof HTMLDialogElement && !node.open;
    });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-focus-probe") === "document-remove-trigger");
    assertNoPageErrors(state, "Native dashboard dialogs");
  } finally {
    await context.close();
  }
});

test("Account history waits for native dialog exit before changing tabs", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    documentsFixture: { documents: [STORED_DOCUMENT_FIXTURE] },
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/settings#job-search`, { waitUntil: "domcontentloaded" });
    await page.locator("#tab-sign-in").click();
    await page.locator('#tab-sign-in[aria-selected="true"]').waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    const deleteDialog = page.locator('dialog[aria-labelledby="delete-title"]');
    await deleteDialog.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await armOverlayExitCapture(page, 'dialog[aria-labelledby="delete-title"]', { nativeBackdrop: true });
    await page.goBack({ waitUntil: "commit" });
    const deleteHistoryExit = await assertRetainedOverlayExit(page, "Delete dialog history change");
    assert.equal(deleteHistoryExit.selectedTabId, "tab-sign-in", "Account changed tabs before Delete finished exiting");
    assert.equal(deleteHistoryExit.open, true, "Delete dialog left the top layer before its exit settled");
    await page.waitForFunction(() => {
      const node = document.querySelector('dialog[aria-labelledby="delete-title"]');
      return node instanceof HTMLDialogElement && !node.open;
    });
    await page.waitForFunction(() => document.querySelector('#tab-job-search[aria-selected="true"]') === document.activeElement);

    await page.getByRole("button", { name: "Remove USC Transcript.pdf" }).click();
    const documentDialog = page.locator('dialog[aria-labelledby="remove-document-title"]');
    await documentDialog.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await armOverlayExitCapture(page, 'dialog[aria-labelledby="remove-document-title"]', { nativeBackdrop: true });
    await page.goForward({ waitUntil: "commit" });
    const documentHistoryExit = await assertRetainedOverlayExit(page, "Document dialog history change");
    assert.equal(documentHistoryExit.selectedTabId, "tab-job-search", "Account changed tabs before Remove finished exiting");
    assert.equal(documentHistoryExit.open, true, "Remove dialog left the top layer before its exit settled");
    await page.waitForFunction(() => {
      const node = document.querySelector('dialog[aria-labelledby="remove-document-title"]');
      return node instanceof HTMLDialogElement && !node.open;
    });
    await page.waitForFunction(() => document.querySelector('#tab-sign-in[aria-selected="true"]') === document.activeElement);
    await capturePass(page, "account-native-dialog-history-focus");
    assertNoPageErrors(state, "Account native dialog history");
  } finally {
    await context.close();
  }
});

test("reduced motion closes hand-built and native overlays without retained animation", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    boardFixture: APPLICATION_PACKET_BOARD_FIXTURE,
  });
  try {
    await page.goto(`${QA_ORIGIN}/dashboard/applications?qa=1`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /All applications/ }).click();
    const packetTrigger = page.getByRole("button", {
      name: /See the application built for Product Engineer at Acme Labs/,
    });
    await packetTrigger.waitFor({ state: "visible" });
    await startAnimationLog(page);
    await packetTrigger.click();
    const packetDialog = page.getByRole("dialog", {
      name: "Application packet: Product Engineer at Acme Labs",
    });
    await packetDialog.waitFor({ state: "visible" });
    await assertNoLoggedDashboardMotion(page, "Application packet entry");
    await capturePass(page, "reduced-motion-application-packet-static");
    await startAnimationLog(page);
    await packetDialog.getByRole("button", { name: "Close", exact: true }).click();
    await packetDialog.waitFor({ state: "detached" });
    await assertNoLoggedDashboardMotion(page, "Application packet exit");

    await page.goto(`${ORIGIN}/dashboard/settings#sign-in`, { waitUntil: "domcontentloaded" });
    await startAnimationLog(page);
    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete your account?" });
    await deleteDialog.waitFor({ state: "visible" });
    await assertNoLoggedDashboardMotion(page, "Delete dialog entry");
    await startAnimationLog(page);
    await deleteDialog.getByRole("button", { name: "Keep account" }).click();
    await page.waitForFunction(() => {
      const node = document.querySelector('dialog[aria-labelledby="delete-title"]');
      return node instanceof HTMLDialogElement && !node.open;
    });
    await assertNoLoggedDashboardMotion(page, "Delete dialog exit");

    await page.locator("#tab-job-search").click();
    await page.locator("#tab-sign-in").click();
    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    await page.getByRole("dialog", { name: "Delete your account?" }).waitFor({ state: "visible" });
    await startAnimationLog(page);
    await page.goBack({ waitUntil: "commit" });
    await page.waitForFunction(() => document.querySelector('#tab-job-search[aria-selected="true"]') === document.activeElement);
    await assertNoLoggedDashboardMotion(page, "Delete dialog history exit");
    assertNoPageErrors(state, "Reduced motion overlays");
  } finally {
    await context.close();
  }
});

test("Outreach panel handoff is sequential and restores focus", async () => {
  const { context, page, state } = await newDashboardPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${QA_ORIGIN}/dashboard/outreach?qa=1`, { waitUntil: "domcontentloaded" });
    const start = page.getByRole("button", { name: "Start outreach" });
    await start.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await startAnimationLog(page);
    await start.click();
    await page.waitForFunction(() => (window.__dashboardVisualAnimationLog ?? []).some((sample) => sample.name === "rq-dashboard-panel-enter"));
    await page.waitForFunction(() => document.activeElement?.id === "outreach-composer-title");
    await finishDashboardAnimations(page);
    const samples = await stopAnimationLog(page);
    const exit = samples.find((sample) => sample.name === "rq-dashboard-panel-exit");
    const enter = samples.find((sample) => sample.name === "rq-dashboard-panel-enter");
    assert.ok(exit, `missing panel exit animation: ${JSON.stringify(samples)}`);
    assert.ok(enter, `missing panel entry animation: ${JSON.stringify(samples)}`);
    assert.ok(
      enter.delay >= exit.duration,
      `incoming panel starts before the outgoing panel completes: ${JSON.stringify({ exit, enter })}`,
    );
    await assertOutreachTrayReachable(page, "Outreach composer at 1280px");
    await capturePass(page, "outreach-composer-sequential");
    await resizeForCapture(page, 390, 844);
    await assertOutreachTrayReachable(page, "Outreach composer at 390px");
    await capturePass(page, "outreach-composer-mobile");
    await assertContained(page, "Outreach composer at 390px");
    await resizeForCapture(page, 1280, 900);
    await page.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => document.activeElement?.id === "outreach-start-button");
    await assertContained(page, "Outreach at 1280px");
    assertNoPageErrors(state, "Outreach");
  } finally {
    await context.close();
  }
});

test("editing a durable Outreach draft restores focus to its exact Edit button", async () => {
  const { context, page, state } = await newDashboardPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${ORIGIN}/dashboard/outreach`, { waitUntil: "domcontentloaded" });
    await page.getByText(`Subject: ${DURABLE_DRAFT_FIXTURE.subject}`, { exact: true }).waitFor({ state: "visible", timeout: 5_000 }).catch(async (reason) => {
      const diagnostic = await page.locator("main").innerText().catch(() => "main missing");
      assert.fail(`Durable draft did not render: ${reason.message}\n${diagnostic.slice(0, 2_000)}`);
    });
    const edit = page.getByRole("button", { name: "Edit", exact: true });
    await edit.evaluate((node) => node.setAttribute("data-focus-probe", "durable-draft-edit"));
    await edit.click();
    const draft = page.locator("#outreach-draft-body");
    await page.waitForFunction(() => document.activeElement?.id === "outreach-draft-body");
    assert.equal(await draft.inputValue(), DURABLE_DRAFT_FIXTURE.body);

    const subject = page.getByLabel("Subject", { exact: true });
    await subject.fill("The value sent by the old save");
    await draft.fill("The old save must not overwrite the editor.");
    const heldSave = state.holdNextOutreachSave();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await heldSave.started;
    await subject.fill("The newer subject stays here");
    await draft.fill("The newer message stays here after the old response settles.");
    await capturePass(page, "outreach-saved-draft-newer-edit-during-save");
    heldSave.release();
    await heldSave.settled;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await subject.inputValue(), "The newer subject stays here");
    assert.equal(await draft.inputValue(), "The newer message stays here after the old response settles.");
    assert.equal(
      await page.locator("#outreach-composer").getByRole("alert").count(),
      0,
      "a retired Outreach save published a stale composer error",
    );

    await capturePass(page, "outreach-saved-draft-edit-focus");
    await resizeForCapture(page, 390, 844);
    await capturePass(page, "outreach-saved-draft-mobile");
    await assertContained(page, "Saved Outreach composer at 390px");
    await resizeForCapture(page, 1280, 900);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.waitForFunction((draftId) => {
      const trigger = document.getElementById(`outreach-draft-edit-${encodeURIComponent(draftId)}`);
      return trigger !== null && document.activeElement === trigger;
    }, DURABLE_DRAFT_FIXTURE.draft_id);
    await assertContained(page, "Outreach after closing a saved draft");
    assertNoPageErrors(state, "Saved Outreach draft focus");
  } finally {
    await context.close();
  }
});

test("Outreach save ownership survives route remounts without overlap or stale replacement", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    outreachRaceFixtures: true,
  });
  const leaveAndReturn = async () => {
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await page.waitForURL(`${ORIGIN}/dashboard`);
    await page.getByRole("link", { name: "Outreach", exact: true }).click();
    await page.waitForURL(`${ORIGIN}/dashboard/outreach`);
  };
  try {
    await page.goto(`${ORIGIN}/dashboard/outreach`, { waitUntil: "domcontentloaded" });
    await page.getByText(`Subject: ${DURABLE_DRAFT_FIXTURE.subject}`, { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const originalSubject = "The first PATCH remains serialized";
    const originalBody = "The first PATCH may settle, but it cannot overwrite the remounted editor.";
    await page.getByLabel("Subject", { exact: true }).fill(originalSubject);
    await page.locator("#outreach-draft-body").fill(originalBody);

    const heldPatch = state.holdNextOutreachSave();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await heldPatch.started;
    await leaveAndReturn();
    await page.getByText(`Subject: ${DURABLE_DRAFT_FIXTURE.subject}`, { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const newestSubject = "The newest PATCH wins after remount";
    const newestBody = "This is the newest saved body after the durable lock releases.";
    await page.getByLabel("Subject", { exact: true }).fill(newestSubject);
    await page.locator("#outreach-draft-body").fill(newestBody);
    const heldPatchButton = page.getByRole("button", { name: /Saving draft/ });
    assert.equal(await heldPatchButton.isDisabled(), true, "the remounted page exposed a second PATCH");
    assert.equal(state.outreachSaveWrites.length, 1);
    await capturePass(page, "outreach-held-patch-route-remount");

    heldPatch.release();
    await heldPatch.settled;
    const nextPatch = page.getByRole("button", { name: "Save changes", exact: true });
    await nextPatch.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")]
        .find((node) => node.textContent?.trim() === "Save changes");
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    assert.equal(await page.getByLabel("Subject", { exact: true }).inputValue(), newestSubject);
    assert.equal(await page.locator("#outreach-draft-body").inputValue(), newestBody);
    const secondPatchResponse = page.waitForResponse((response) =>
      response.request().method() === "PATCH" && /\/drafts\/[^/]+$/.test(new URL(response.url()).pathname),
    );
    await nextPatch.click();
    await secondPatchResponse;
    assert.equal(state.outreachSaveWrites.length, 2);
    assert.equal(state.outreachSaveWrites.at(-1).subject, newestSubject);
    assert.equal(state.outreachSaveWrites.at(-1).body, newestBody);
    assert.equal(state.outreachServerDraft.subject, newestSubject);
    assert.equal(state.outreachServerDraft.body, newestBody);

    await leaveAndReturn();
    await page.getByRole("button", { name: "Start outreach", exact: true }).click();
    const fillManualDraft = async (subject, body) => {
      await page.getByLabel("Name", { exact: true }).fill("Jordan Lee");
      await page.getByLabel("Contact title", { exact: true }).fill("Product Engineer");
      await page.getByLabel("Email", { exact: true }).fill("jordan@acme.example");
      await page.getByLabel("Company", { exact: true }).fill("Acme Labs");
      await page.getByLabel("Company domain", { exact: true }).fill("acme.example");
      await page.getByLabel("Role you want", { exact: true }).fill("Product Engineer");
      await page.getByLabel("Subject", { exact: true }).fill(subject);
      await page.locator("#outreach-draft-body").fill(body);
    };
    const firstManualSubject = "The first manual save stays serialized";
    const firstManualBody = "This first manual POST is intentionally held across navigation.";
    await fillManualDraft(firstManualSubject, firstManualBody);
    const heldManual = state.holdNextOutreachManualSave();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await heldManual.started;
    await leaveAndReturn();
    await page.getByRole("button", { name: "Start outreach", exact: true }).click();
    const newestManualSubject = "The newest manual draft wins";
    const newestManualBody = "This is the final manual body after the remounted page takes ownership.";
    await fillManualDraft(newestManualSubject, newestManualBody);
    assert.equal(await page.getByRole("button", { name: /Saving draft/ }).isDisabled(), true);
    assert.equal(state.outreachManualSaveWrites.length, 1);
    assert.equal(state.outreachApplicationWrites.length, 1, "the held manual save should create one canonical application");
    await capturePass(page, "outreach-held-manual-save-route-remount");

    heldManual.release();
    await heldManual.settled;
    const nextManualSave = page.getByRole("button", { name: "Save draft", exact: true });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")]
        .find((node) => node.textContent?.trim() === "Save draft");
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    const secondManualResponse = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/drafts/manual",
    );
    await nextManualSave.click();
    await secondManualResponse;
    assert.equal(state.outreachManualSaveWrites.length, 2);
    assert.equal(state.outreachManualSaveWrites.at(-1).subject, newestManualSubject);
    assert.equal(state.outreachManualSaveWrites.at(-1).body, newestManualBody);
    assert.equal(state.outreachServerDraft.subject, newestManualSubject);
    assert.equal(state.outreachServerDraft.body, newestManualBody);
    assert.equal(state.outreachApplicationWrites.length, 1, "canonical application ownership was lost on remount");
    assert.equal(state.maxConcurrentOutreachSaves, 1, "Outreach PATCH and manual POST work overlapped across a route remount");
    assertNoPageErrors(state, "Outreach durable route ownership");
  } finally {
    await context.close();
  }
});

test("Outreach checkout restoration focuses the reopened composer", async () => {
  const { context, page, state } = await newDashboardPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.addInitScript((fixture) => {
      window.sessionStorage.setItem("litos_outreach_checkout_state_v1", JSON.stringify(fixture));
    }, OUTREACH_CHECKOUT_FIXTURE);
    await page.goto(`${ORIGIN}/dashboard/outreach?checkout_action=write_outreach`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "A note you choose to send." }).waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "outreach-composer-title");
    assert.equal(await page.locator("#outreach-draft-body").inputValue(), OUTREACH_CHECKOUT_FIXTURE.draft);
    await capturePass(page, "outreach-checkout-restored-focus");
    await assertContained(page, "Outreach after checkout restoration");
    assertNoPageErrors(state, "Outreach checkout restoration");
  } finally {
    await context.close();
  }
});

test("Outreach restores focus to the async control after a server-denied upgrade", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    denyOutreachContacts: true,
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/outreach`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Start outreach", exact: true }).click();
    await page.getByLabel("Company", { exact: true }).fill("Acme Labs");
    await page.getByLabel("Company domain", { exact: true }).fill("acme.com");
    await page.getByLabel("Role you want", { exact: true }).fill("Product Engineer");

    const trigger = page.getByRole("button", { name: "Find contacts", exact: true });
    await trigger.evaluate((node) => node.setAttribute("data-focus-probe", "outreach-contact-upgrade"));
    await trigger.click();
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-focus-probe="outreach-contact-upgrade"]');
      return node instanceof HTMLButtonElement && node.disabled;
    });

    const dialog = page.getByRole("dialog", { name: /Find people with Litos\+/ });
    await dialog.waitFor({ state: "visible" });
    await dialog.evaluate((node) => node.setAttribute("data-overlay-probe", "outreach-upgrade"));
    await finishDashboardAnimations(page);
    await resetPageScroll(page, { blurActive: false });
    await capturePass(page, "outreach-server-denial-upgrade-open");
    await armOverlayExitCapture(page, 'dialog[data-overlay-probe="outreach-upgrade"]', { nativeBackdrop: true });
    await dialog.getByRole("button", { name: "Close Litos+ options" }).click();
    await assertRetainedOverlayExit(page, "Outreach server-denial upgrade");
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-focus-probe") === "outreach-contact-upgrade");
    assertNoPageErrors(state, "Outreach server-denial upgrade");
  } finally {
    await context.close();
  }
});

test("mobile More exit stays opaque, inert, and restores focus", async () => {
  const { context, page, state } = await newDashboardPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${QA_ORIGIN}/dashboard?qa=1`, { waitUntil: "domcontentloaded" });
    const more = page.getByRole("button", { name: "More", exact: true });
    await more.waitFor({ state: "visible" });
    assert.equal(await more.getAttribute("aria-controls"), null);
    await more.click();
    const dialog = page.locator("#dashboard-more-dialog");
    await dialog.waitFor({ state: "visible" });
    assert.equal(await more.getAttribute("aria-controls"), "dashboard-more-dialog");
    await finishDashboardAnimations(page);
    await capturePass(page, "more-sheet-open", false);
    const morePoint = await more.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.evaluate(() => {
      window.__dashboardDialogExitCapture = { animation: null, sample: null };
      const captureExit = (event) => {
        if (event.animationName !== "rq-dashboard-dialog-exit") return;
        const node = event.target;
        if (!(node instanceof HTMLElement) || node.id !== "dashboard-more-dialog") return;
        const animation = node.getAnimations().find((item) => item.animationName === "rq-dashboard-dialog-exit");
        if (!animation) return;
        animation.pause();
        const duration = Number(animation.effect?.getTiming().duration ?? 130);
        animation.currentTime = duration / 2;
        const probe = window.__dashboardMoreExitProbe;
        const hitTarget = probe ? document.elementFromPoint(probe.x, probe.y) : null;
        const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
        document.dispatchEvent(tabEvent);
        window.__dashboardDialogExitCapture = {
          animation,
          sample: {
            found: true,
            opacity: getComputedStyle(node).opacity,
            transform: getComputedStyle(node).transform,
            ariaHidden: node.getAttribute("aria-hidden"),
            inert: node.hasAttribute("inert"),
            pointerEvents: getComputedStyle(node).pointerEvents,
            hitShield: hitTarget instanceof HTMLElement && hitTarget.hasAttribute("data-dashboard-exit-shield"),
            tabPrevented: tabEvent.defaultPrevented,
          },
        };
        if (hitTarget instanceof HTMLElement) hitTarget.click();
        animation.play();
        document.removeEventListener("animationstart", captureExit, true);
      };
      document.addEventListener("animationstart", captureExit, true);
    }, null);
    await page.evaluate((probe) => { window.__dashboardMoreExitProbe = probe; }, morePoint);
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => window.__dashboardDialogExitCapture?.sample !== null);
    const midpoint = await page.evaluate(() => window.__dashboardDialogExitCapture.sample);
    assert.equal(midpoint.found, true, "the sheet exit animation was not created");
    assert.equal(midpoint.opacity, "1", `the sheet ghosted at its exit midpoint: ${JSON.stringify(midpoint)}`);
    assert.equal(midpoint.ariaHidden, "true");
    assert.equal(midpoint.inert, true);
    assert.equal(midpoint.pointerEvents, "none");
    assert.equal(midpoint.hitShield, true, "the retained More exit did not shield the page below it");
    assert.equal(midpoint.tabPrevented, true, "the retained More exit let Tab enter the page below it");
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.id === "dashboard-more-button");
    assert.equal(await more.getAttribute("aria-controls"), null);

    await more.click();
    await dialog.waitFor({ state: "visible" });
    const interruptedEntry = await dialog.evaluate((node) => {
      const animation = node.getAnimations().find((item) => item.animationName === "rq-dashboard-dialog-enter");
      if (!animation) return null;
      const duration = Number(animation.effect?.getTiming().duration ?? 240);
      animation.pause();
      animation.currentTime = duration * 0.35;
      return {
        opacity: getComputedStyle(node).opacity,
        transform: getComputedStyle(node).transform,
      };
    });
    assert.ok(interruptedEntry, "the sheet entry animation was not created");
    await page.evaluate(() => {
      window.__dashboardDialogInterruptedExit = null;
      const captureExit = (event) => {
        if (event.animationName !== "rq-dashboard-dialog-exit") return;
        const node = event.target;
        if (!(node instanceof HTMLElement) || node.id !== "dashboard-more-dialog") return;
        const animation = node.getAnimations().find((item) => item.animationName === "rq-dashboard-dialog-exit");
        if (!animation) return;
        animation.pause();
        animation.currentTime = 0;
        window.__dashboardDialogInterruptedExit = {
          opacity: getComputedStyle(node).opacity,
          transform: getComputedStyle(node).transform,
        };
        animation.play();
        document.removeEventListener("animationstart", captureExit, true);
      };
      document.addEventListener("animationstart", captureExit, true);
    });
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => window.__dashboardDialogInterruptedExit !== null);
    const interruptedExit = await page.evaluate(() => window.__dashboardDialogInterruptedExit);
    assert.equal(interruptedExit.opacity, interruptedEntry.opacity, "interrupted entry changed opacity at the exit handoff");
    assert.equal(interruptedExit.transform, interruptedEntry.transform, "interrupted entry snapped at the exit handoff");
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.id === "dashboard-more-button");

    await more.click();
    await dialog.waitFor({ state: "visible" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.closest("aside") !== null);
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-current")), "page");
    await assertContained(page, "Home after the More sheet crosses to desktop");

    await page.setViewportSize({ width: 390, height: 844 });
    await more.waitFor({ state: "visible" });
    await more.click();
    await dialog.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => document.querySelector("#dashboard-more-dialog")?.getAttribute("aria-hidden") === "true");
    await page.setViewportSize({ width: 1280, height: 900 });
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.closest("aside") !== null);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-current")), "page");
    assertNoPageErrors(state, "More sheet");
  } finally {
    await context.close();
  }
});

test("Applications is readable at 320px and suppresses the landing action during a task", async () => {
  const { context, page, state } = await newDashboardPage({ viewport: { width: 320, height: 780 } });
  try {
    await page.goto(`${QA_ORIGIN}/dashboard/applications?qa=1`, { waitUntil: "domcontentloaded" });
    const allApplications = page.getByRole("button", { name: /All applications/ });
    await allApplications.waitFor({ state: "visible" });
    await allApplications.click();
    await page.getByTestId("application-ledger-count").waitFor({ state: "visible" });
    await finishDashboardAnimations(page);

    const geometry = await page.evaluate(() => {
      const heading = [...document.querySelectorAll("h1")].find((node) => node.textContent?.trim() === "Applications");
      const filter = document.getElementById("application-filter");
      const nav = document.querySelector('nav[aria-label="Dashboard"]');
      if (!heading || !filter || !nav) return null;
      const labels = [...nav.querySelectorAll(":scope > a span:last-child, :scope > button span:last-child")]
        .map((node) => {
          const target = node.closest("a, button");
          return {
            text: node.textContent?.trim(),
            label: node.getBoundingClientRect().toJSON(),
            target: target?.getBoundingClientRect().toJSON(),
          };
        });
      return {
        heading: heading.getBoundingClientRect().toJSON(),
        filter: filter.getBoundingClientRect().toJSON(),
        labels,
      };
    });
    assert.ok(geometry, "Applications geometry could not be measured");
    assert.ok(geometry.heading.bottom + 8 <= geometry.filter.top, `heading and filter overlap: ${JSON.stringify(geometry)}`);
    for (const item of geometry.labels) {
      assert.ok(item.target, `mobile nav target missing for ${item.text}`);
      assert.ok(item.label.left >= item.target.left - 1 && item.label.right <= item.target.right + 1, `mobile nav label escaped its target: ${JSON.stringify(item)}`);
    }
    for (let index = 1; index < geometry.labels.length; index += 1) {
      assert.ok(
        geometry.labels[index - 1].label.right + 2 <= geometry.labels[index].label.left,
        `mobile nav labels touch: ${JSON.stringify(geometry.labels)}`,
      );
    }
    await capturePass(page, "applications-320-landing");
    await assertContained(page, "Applications landing at 320px");

    const firstRow = page.locator('section[aria-labelledby="application-ledger-heading"] button[aria-pressed]').first();
    await firstRow.click();
    await allApplications.waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: /All applications/ }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Fill application", exact: true }).count(), 0);
    await finishDashboardAnimations(page);
    await capturePass(page, "applications-320-task");
    await assertContained(page, "Applications task at 320px");
    assertNoPageErrors(state, "Applications");
  } finally {
    await context.close();
  }
});

test("Needs your input keeps unfinished tasks prominent across desktop and mobile", async () => {
  const { context, page, state } = await newDashboardPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${QA_ORIGIN}/dashboard/applications?qa=anduril`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Needs your input", exact: true }).waitFor({ state: "visible" });
    await page.getByText("Action required", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("5 remaining", { exact: true }).waitFor({ state: "visible" });
    const completed = page.getByText(/checks already complete/, { exact: true });
    await completed.waitFor({ state: "visible" });
    assert.equal(await completed.locator("xpath=ancestor::details[1]").getAttribute("open"), null);
    await finishDashboardAnimations(page);
    await capturePass(page, "applications-needs-input-desktop");
    await assertContained(page, "Applications needs-input queue on desktop");

    await resizeForCapture(page, 390, 844);
    const firstAction = page.getByRole("button", { name: /^Answer:/ }).first();
    await firstAction.waitFor({ state: "visible" });
    const mobileGeometry = await firstAction.evaluate((button) => {
      const row = button.closest("li");
      const copy = row?.children[1];
      if (!(row instanceof HTMLElement) || !(copy instanceof HTMLElement)) return null;
      return {
        row: row.getBoundingClientRect().toJSON(),
        copy: copy.getBoundingClientRect().toJSON(),
        action: button.getBoundingClientRect().toJSON(),
      };
    });
    assert.ok(mobileGeometry, "the first needs-input row could not be measured");
    assert.ok(mobileGeometry.action.top >= mobileGeometry.copy.bottom + 6, `mobile task action did not follow its copy: ${JSON.stringify(mobileGeometry)}`);
    await capturePass(page, "applications-needs-input-mobile");
    await assertContained(page, "Applications needs-input queue on mobile");
    assertNoPageErrors(state, "Applications needs-input queue");
  } finally {
    await context.close();
  }
});

test("Application task steps replace sequentially without exposing two readable screens", async () => {
  const { context, page, state } = await newDashboardPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${QA_ORIGIN}/dashboard/applications?qa=anduril`, { waitUntil: "domcontentloaded" });
    const answer = page.getByRole("button", { name: /^Answer:/ }).first();
    await answer.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await startAnimationLog(page);
    await answer.click();
    await page.getByRole("button", { name: /^Save (?:and continue|available answers)$/ }).waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    const samples = await stopAnimationLog(page);
    const exit = samples.find((sample) => sample.name === "rq-dashboard-panel-exit");
    const enter = samples.find((sample) => sample.name === "rq-dashboard-panel-enter");
    assert.ok(exit, `Application task change had no panel exit: ${JSON.stringify(samples)}`);
    assert.ok(enter, `Application task change had no panel entry: ${JSON.stringify(samples)}`);
    assert.ok(enter.delay >= exit.duration, `Application task screens overlapped: ${JSON.stringify({ exit, enter })}`);
    assert.equal(await page.getByRole("button", { name: /^Answer:/ }).count(), 0);
    await resetPageScroll(page, { blurActive: false });
    await capturePass(page, "applications-task-question-handoff");
    await assertContained(page, "Application question handoff");
    assertNoPageErrors(state, "Application task handoff");
  } finally {
    await context.close();
  }
});

test("Application selection, close, and stale history resolve as one task state", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    resumeHistoryFixture: [TRANSCRIPT_PACKET, RESUMES[1]],
  });
  try {
    await page.addInitScript(() => {
      window.__applicationInitialLedgerLeaks = 0;
      window.__applicationInitialObserver = new MutationObserver(() => {
        if (document.querySelector('[data-testid="application-ledger-count"]')) {
          window.__applicationInitialLedgerLeaks += 1;
        }
      });
      window.__applicationInitialObserver.observe(document, { childList: true, subtree: true });
    });
    await page.goto(`${QA_ORIGIN}/dashboard/applications?qa=anduril`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Needs your input", exact: true }).waitFor({ state: "visible" });
    const initialLedgerLeaks = await page.evaluate(() => {
      window.__applicationInitialObserver?.disconnect();
      return window.__applicationInitialLedgerLeaks;
    });
    assert.equal(initialLedgerLeaks, 0, "QA bootstrap exposed the landing ledger before its requested task");

    const switchApplications = page.getByRole("button", { name: "Switch applications", exact: true });
    await switchApplications.waitFor({ state: "visible", timeout: 5_000 }).catch(async (reason) => {
      const diagnostic = await page.locator("main").innerText().catch(() => "main missing");
      assert.fail(`Application switcher did not render: ${reason.message}\n${diagnostic.slice(0, 4_000)}`);
    });
    assert.equal(await switchApplications.getAttribute("aria-controls"), null);
    await switchApplications.click();
    const closeSwitcher = page.getByRole("button", { name: "Done", exact: true });
    await closeSwitcher.waitFor({ state: "visible" });
    assert.equal(await closeSwitcher.getAttribute("aria-controls"), "application-switcher-list");
    assert.equal(await page.locator("#application-switcher-list").count(), 1);
    const stripeRow = page.locator('#application-switcher-list button:visible').filter({ hasText: "Stripe" });
    await stripeRow.waitFor({ state: "visible" });
    await page.evaluate(() => {
      window.__applicationMixedPacketFrames = [];
      const sample = () => {
        const identity = document.getElementById("application-ledger-heading")?.parentElement?.textContent ?? "";
        const task = document.getElementById("application-task-panel")?.textContent ?? "";
        if (identity.includes("Stripe") && task.includes("Needs your input")) {
          window.__applicationMixedPacketFrames.push({ identity, task });
        }
      };
      window.__applicationMixedPacketObserver = new MutationObserver(sample);
      window.__applicationMixedPacketObserver.observe(document.querySelector("main") ?? document.documentElement, { childList: true, subtree: true, characterData: true });
      sample();
    });
    await finishDashboardAnimations(page);
    await startAnimationLog(page);
    await stripeRow.click();
    await page.waitForFunction(() => {
      const identity = document.getElementById("application-ledger-heading")?.parentElement?.textContent ?? "";
      const task = document.getElementById("application-task-panel")?.textContent ?? "";
      return identity.includes("Stripe") && !task.includes("Needs your input");
    });
    await finishDashboardAnimations(page);
    assert.equal(await page.getByRole("button", { name: "Switch applications", exact: true }).getAttribute("aria-controls"), null);
    const switchMotion = await stopAnimationLog(page);
    const mixedPacketFrames = await page.evaluate(() => {
      window.__applicationMixedPacketObserver?.disconnect();
      return window.__applicationMixedPacketFrames;
    });
    assert.deepEqual(mixedPacketFrames, [], "a new packet rendered under the previous packet's task screen");
    const switchExit = switchMotion.find((sample) => sample.name === "rq-dashboard-panel-exit");
    const switchEnter = switchMotion.find((sample) => sample.name === "rq-dashboard-panel-enter");
    assert.ok(switchExit, `packet switch had no panel exit: ${JSON.stringify(switchMotion)}`);
    assert.ok(switchEnter, `packet switch had no panel entry: ${JSON.stringify(switchMotion)}`);
    assert.ok(switchEnter.delay >= switchExit.duration, `packet switch panels overlapped: ${JSON.stringify({ switchExit, switchEnter })}`);
    await capturePass(page, "applications-packet-switch-atomic");

    const allApplications = page.getByRole("button", { name: /All applications/ });
    await allApplications.focus();
    await startAnimationLog(page);
    await allApplications.click();
    await page.getByTestId("application-ledger-count").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-application-row-id") === "d6693be1-9d1d-4f61-9911-8d95f1ad1b02");
    await finishDashboardAnimations(page);
    const closeMotion = await stopAnimationLog(page);
    assert.ok(closeMotion.some((sample) => sample.name === "rq-dashboard-panel-exit"), `application close had no panel exit: ${JSON.stringify(closeMotion)}`);
    assert.ok(closeMotion.some((sample) => sample.name === "rq-dashboard-panel-enter"), `application close had no panel entry: ${JSON.stringify(closeMotion)}`);
    await capturePass(page, "applications-close-focus-landing");

    const stripeLandingRow = page.locator('button[data-application-row-id="d6693be1-9d1d-4f61-9911-8d95f1ad1b02"]:visible');
    await startAnimationLog(page);
    await stripeLandingRow.click();
    await allApplications.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "application-ledger-heading");
    await finishDashboardAnimations(page);
    const reopenMotion = await stopAnimationLog(page);
    assert.ok(reopenMotion.some((sample) => sample.name === "rq-dashboard-panel-exit"), `application reopen had no panel exit: ${JSON.stringify(reopenMotion)}`);
    assert.ok(reopenMotion.some((sample) => sample.name === "rq-dashboard-panel-enter"), `application reopen had no panel entry: ${JSON.stringify(reopenMotion)}`);

    await page.goto(`${ORIGIN}/dashboard/applications`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("application-ledger-count").waitFor({ state: "visible" });
    const sameRowGate = state.holdNextResumeHistory();
    await page.locator('button[data-application-row-id="fixture-packet-transcript"]:visible').click();
    await sameRowGate.started;
    await page.getByRole("button", { name: "Switch applications", exact: true }).click();
    await page.locator('#application-switcher-list button:visible').filter({ hasText: "Fixture Robotics" }).click();
    await allApplications.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "application-ledger-heading");
    await page.goBack();
    await page.getByTestId("application-ledger-count").waitFor({ state: "visible" });
    sameRowGate.release();
    await sameRowGate.settled;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByRole("button", { name: /All applications/ }).count(), 0, "same-row selection blocked Back or reopened after its held refresh");

    const staleSwitchGate = state.holdNextResumeHistory();
    await page.locator('button[data-application-row-id="fixture-packet-transcript"]:visible').click();
    await staleSwitchGate.started;
    await page.getByRole("button", { name: "Switch applications", exact: true }).click();
    await page.locator('#application-switcher-list button:visible').filter({ hasText: "Fixture Company needs-1" }).click();
    await page.waitForFunction(() => (document.getElementById("application-ledger-heading")?.parentElement?.textContent ?? "").includes("Fixture Company needs-1"));
    staleSwitchGate.release();
    await staleSwitchGate.settled;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.match(
      await page.locator("#application-ledger-heading").locator("xpath=..").innerText(),
      /Fixture Company needs-1/,
      "the stale first packet reopened after a newer local selection",
    );

    await allApplications.click();
    await page.getByTestId("application-ledger-count").waitFor({ state: "visible" });
    const staleCloseGate = state.holdNextResumeHistory();
    await page.locator('button[data-application-row-id="fixture-packet-transcript"]:visible').click();
    await staleCloseGate.started;
    await allApplications.click();
    await page.getByTestId("application-ledger-count").waitFor({ state: "visible" });
    staleCloseGate.release();
    await staleCloseGate.settled;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByRole("button", { name: /All applications/ }).count(), 0, "stale history reopened a task after close");
    assert.equal(await page.getByTestId("application-ledger-count").count(), 1);
    assertNoPageErrors(state, "Application atomic selection");
  } finally {
    await context.close();
  }
});

test("Outreach serializes contact discovery, generation, and save work through one application", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    outreachRaceFixtures: true,
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/outreach`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Start outreach", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Jordan Lee");
    await page.getByLabel("Contact title", { exact: true }).fill("Product Engineer");
    await page.getByLabel("Company", { exact: true }).fill("Acme Labs");
    await page.getByLabel("Company domain", { exact: true }).fill("acme.example");
    await page.getByLabel("Role you want", { exact: true }).fill("Product Engineer");
    await page.getByLabel("Subject", { exact: true }).fill("A careful introduction");
    await page.locator("#outreach-draft-body").fill("This message should stay on one application record.");

    const findContacts = page.getByRole("button", { name: "Find contacts", exact: true });
    const generateDraft = page.getByRole("button", { name: "Draft with Litos+", exact: true });
    const saveDraft = page.getByRole("button", { name: "Save draft", exact: true });
    await findContacts.evaluate((node) => node.setAttribute("data-outreach-operation", "contact"));
    await generateDraft.evaluate((node) => node.setAttribute("data-outreach-operation", "draft"));

    const heldContact = state.holdNextOutreachContact();
    await page.evaluate(() => {
      document.querySelector('[data-outreach-operation="contact"]')?.click();
      document.querySelector('[data-outreach-operation="draft"]')?.click();
    });
    await heldContact.started;
    assert.equal(state.outreachApplicationWrites.length, 1, "parallel composer controls created more than one application");
    assert.equal(await generateDraft.isDisabled(), true, "draft generation remained available during contact discovery");
    assert.equal(await saveDraft.isDisabled(), true, "manual save remained available during contact discovery");
    await capturePass(page, "outreach-contact-operation-locked");
    heldContact.release();
    await heldContact.settled;
    await page.getByRole("button", { name: /Ada Acme/ }).waitFor({ state: "visible" });

    const heldDraft = state.holdNextOutreachDraft();
    await findContacts.evaluate((node) => node.setAttribute("data-outreach-operation", "contact"));
    await generateDraft.evaluate((node) => node.setAttribute("data-outreach-operation", "draft"));
    await page.evaluate(() => {
      document.querySelector('[data-outreach-operation="draft"]')?.click();
      document.querySelector('[data-outreach-operation="contact"]')?.click();
    });
    await heldDraft.started;
    assert.equal(state.outreachApplicationWrites.length, 1, "draft generation created a second application for the same composer");
    assert.equal(await findContacts.isDisabled(), true, "contact discovery remained available during draft generation");
    heldDraft.release();
    await heldDraft.settled;
    await page.getByLabel("Subject", { exact: true }).waitFor({ state: "visible" });
    assertNoPageErrors(state, "Outreach serialized operations");
  } finally {
    await context.close();
  }
});

test("Outreach ignores contact and draft responses after their composer scope changes", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    outreachRaceFixtures: true,
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/outreach`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Start outreach", exact: true }).click();
    const company = page.getByLabel("Company", { exact: true });
    const domain = page.getByLabel("Company domain", { exact: true });
    const role = page.getByLabel("Role you want", { exact: true });
    await company.fill("Acme Labs");
    await domain.fill("acme.example");
    await role.fill("Product Engineer");

    const staleContact = state.holdNextOutreachContact();
    await page.getByRole("button", { name: "Find contacts", exact: true }).click();
    await staleContact.started;
    await company.fill("Globex Labs");
    await domain.fill("globex.example");
    assert.equal(
      await page.getByRole("button", { name: /Finding contacts/ }).isDisabled(),
      true,
      "editing released the held contact operation before its server work settled",
    );
    staleContact.release();
    await staleContact.settled;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByRole("button", { name: /Ada Acme/ }).count(), 0, "the stale Acme contact replaced the current Globex result");
    await page.getByRole("button", { name: "Find contacts", exact: true }).click();
    await page.getByRole("button", { name: /Grace Globex/ }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: /Grace Globex/ }).count(), 1);

    await page.getByLabel("Name", { exact: true }).fill("Jordan Lee");
    await page.getByLabel("Contact title", { exact: true }).fill("Product Engineer");
    await company.fill("Acme Draft Company");
    await domain.fill("acme-draft.example");
    const staleDraft = state.holdNextOutreachDraft();
    await page.getByRole("button", { name: "Draft with Litos+", exact: true }).click();
    await staleDraft.started;
    await company.fill("Globex Draft Company");
    await domain.fill("globex-draft.example");
    assert.equal(
      await page.getByRole("button", { name: /Writing draft/ }).isDisabled(),
      true,
      "editing released the held draft operation before its server work settled",
    );
    staleDraft.release();
    await staleDraft.settled;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.notEqual(await page.getByLabel("Subject", { exact: true }).inputValue(), "Acme introduction");
    await page.getByRole("button", { name: "Draft with Litos+", exact: true }).click();
    await page.waitForFunction(() => {
      const subject = document.querySelector('input[value="Globex introduction"]');
      const draft = document.getElementById("outreach-draft-body");
      return subject !== null && draft?.value === "This is the current Globex draft.";
    });
    assert.equal(await page.getByLabel("Subject", { exact: true }).inputValue(), "Globex introduction");
    assert.equal(await page.locator("#outreach-draft-body").inputValue(), "This is the current Globex draft.");
    await resetPageScroll(page);
    await capturePass(page, "outreach-current-scope-wins-stale-responses");
    assertNoPageErrors(state, "Outreach stale request protection");
  } finally {
    await context.close();
  }
});

test("Jobs remains scannable on desktop and the narrowest supported dashboard width", async () => {
  const { context, page, state } = await newDashboardPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${QA_ORIGIN}/dashboard/jobs?qa=1`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Top matches for you\.|Latest jobs\./ }).waitFor({ state: "visible" });
    await page.getByText(/\d+ roles? loaded/).waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await capturePass(page, "jobs-desktop");
    await assertContained(page, "Jobs at 1280px");

    await resizeForCapture(page, 320, 780);
    await capturePass(page, "jobs-320");
    await assertContained(page, "Jobs at 320px");
    assertNoPageErrors(state, "Jobs");
  } finally {
    await context.close();
  }
});

test("Home contains job actions and keeps the page CTA secondary", async () => {
  const { context, page, state } = await newDashboardPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(`${QA_ORIGIN}/dashboard?qa=1`, { waitUntil: "domcontentloaded" });
    const skip = page.locator('button[aria-label^="Skip "]').first();
    await skip.waitFor({ state: "visible" });
    const result = await skip.evaluate((button) => {
      const card = button.closest(".overflow-hidden");
      const pageCta = document.querySelector('main a[href="/dashboard/applications?new=1&intent=fill"]');
      const cardCta = card?.querySelector('a[aria-label^="Fill an application for"]');
      if (!card || !pageCta || !cardCta) return null;
      const buttonRect = button.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      return {
        button: buttonRect.toJSON(),
        card: cardRect.toJSON(),
        cardScrollWidth: card.scrollWidth,
        cardClientWidth: card.clientWidth,
        pageBackground: getComputedStyle(pageCta).backgroundColor,
        cardBackground: getComputedStyle(cardCta).backgroundColor,
      };
    });
    assert.ok(result, "Home action geometry could not be measured");
    assert.ok(result.button.left >= result.card.left - 1 && result.button.right <= result.card.right + 1, `Skip escaped its card: ${JSON.stringify(result)}`);
    assert.ok(result.button.top >= result.card.top - 1 && result.button.bottom <= result.card.bottom + 1, `Skip escaped its card vertically: ${JSON.stringify(result)}`);
    assert.ok(result.cardScrollWidth <= result.cardClientWidth + 1, `Home card overflowed: ${JSON.stringify(result)}`);
    assert.notEqual(result.pageBackground, result.cardBackground, `page and card CTAs have equal emphasis: ${JSON.stringify(result)}`);
    await capturePass(page, "home-action-hierarchy");

    const originalSkip = await skip.getAttribute("aria-label");
    assert.ok(originalSkip, "Home Skip control has no accessible name");
    await finishDashboardAnimations(page);
    await startAnimationLog(page);
    await skip.click();
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await undo.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "dashboard-skip-undo");
    await finishDashboardAnimations(page);
    const skipMotion = await stopAnimationLog(page);
    const skipExit = skipMotion.find((sample) => sample.name === "rq-dashboard-panel-exit");
    const skipEnter = skipMotion.find((sample) => sample.name === "rq-dashboard-panel-enter");
    assert.ok(skipExit, `Home Skip had no panel exit: ${JSON.stringify(skipMotion)}`);
    assert.ok(skipEnter, `Home Skip had no panel entry: ${JSON.stringify(skipMotion)}`);
    assert.ok(skipEnter.delay >= skipExit.duration, `Home Skip states overlapped: ${JSON.stringify({ skipExit, skipEnter })}`);
    assert.equal(await page.locator(`button[aria-label=${JSON.stringify(originalSkip)}]`).count(), 0);
    await capturePass(page, "home-skip-status");

    await startAnimationLog(page);
    await undo.click();
    await page.getByRole("status").filter({ hasText: "Skipped for today." }).waitFor({ state: "detached" });
    await page.locator(`button[aria-label=${JSON.stringify(originalSkip)}]`).waitFor({ state: "visible" });
    await page.waitForFunction((accessibleName) => document.activeElement?.getAttribute("aria-label") === accessibleName, originalSkip);
    await finishDashboardAnimations(page);
    const undoMotion = await stopAnimationLog(page);
    assert.ok(undoMotion.some((sample) => sample.name === "rq-dashboard-panel-exit"), `Home Undo had no panel exit: ${JSON.stringify(undoMotion)}`);
    assert.ok(undoMotion.some((sample) => sample.name === "rq-dashboard-panel-enter"), `Home Undo had no panel entry: ${JSON.stringify(undoMotion)}`);
    await capturePass(page, "home-undo-restored");
    await assertContained(page, "Home at 1440px");
    assertNoPageErrors(state, "Home");
  } finally {
    await context.close();
  }
});

test("delayed resume denials restore focus after the initiating control changes", async () => {
  const denial = {
    status: 402,
    body: {
      code: "entitlement_required",
      feature: "ai_resume_tailoring",
      reason: "fixture_meter_exhausted",
    },
  };

  const home = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    bootstrapFixture: HOME_BOOTSTRAP_FIXTURE,
    jobFixture: HOME_JOB_FIXTURE,
  });
  try {
    await home.page.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
    const tailor = home.page.getByRole("button", {
      name: `Tailor a resume for ${HOME_JOB_FIXTURE.title} at ${HOME_JOB_FIXTURE.company_name}`,
      exact: true,
    });
    await tailor.waitFor({ state: "visible" });
    const homeDenial = home.state.holdNextResumeGenerate(denial);
    await tailor.click();
    await homeDenial.started;
    await home.page.getByText("Getting ready", { exact: true }).last().waitFor({ state: "visible" });
    homeDenial.release();
    await homeDenial.settled;
    const homeUpgrade = home.page.getByRole("dialog", { name: "Tailor this resume with Litos+" });
    await homeUpgrade.waitFor({ state: "visible" });
    await capturePass(home.page, "home-delayed-denial-upgrade");
    await homeUpgrade.getByRole("button", { name: "Close Litos+ options" }).click();
    await homeUpgrade.waitFor({ state: "detached" });
    await home.page.waitForFunction((jobId) => document.activeElement?.getAttribute("data-dashboard-job-focus-id") === jobId, HOME_JOB_FIXTURE.id);
    assertNoPageErrors(home.state, "Home delayed paywall focus");
  } finally {
    await home.context.close();
  }

  const applications = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    profileFixture: {
      ...STUB["/profile"],
      full_name: "Fixture Student",
      resume_email: "fixture@example.invalid",
    },
  });
  try {
    await applications.page.goto(`${ORIGIN}/dashboard/applications?new=1`, { waitUntil: "domcontentloaded" });
    await applications.page.getByRole("heading", { name: "Fill an application." }).waitFor({ state: "visible" });
    await applications.page.getByLabel("Company").fill("Focus Labs");
    await applications.page.getByLabel("Role").fill("Product Engineer Intern");
    await applications.page.getByLabel("Job URL").fill("https://jobs.example.com/focus-labs/product-engineer-intern");
    await applications.page.getByLabel("Job description").fill(HOME_JOB_FIXTURE.description);
    const tailor = applications.page.getByRole("button", { name: "Tailor resume", exact: true });
    await tailor.evaluate((node) => node.setAttribute("data-focus-probe", "application-tailor-trigger"));
    const applicationDenial = applications.state.holdNextResumeGenerate(denial);
    await tailor.click();
    await applicationDenial.started;
    await applications.page.getByText("Tailoring", { exact: true }).waitFor({ state: "visible" });
    applicationDenial.release();
    await applicationDenial.settled;
    const applicationUpgrade = applications.page.getByRole("dialog", { name: "Tailor this resume with Litos+" });
    await applicationUpgrade.waitFor({ state: "visible" });
    await capturePass(applications.page, "applications-delayed-denial-upgrade");
    await applicationUpgrade.getByRole("button", { name: "Close Litos+ options" }).click();
    await applicationUpgrade.waitFor({ state: "detached" });
    await applications.page.waitForFunction(() => document.activeElement?.getAttribute("data-focus-probe") === "application-tailor-trigger");
    assertNoPageErrors(applications.state, "Applications delayed paywall focus");
  } finally {
    await applications.context.close();
  }
});

test("a delayed entitlement denial cannot outlive its initiating route", async () => {
  const denial = {
    status: 402,
    body: {
      code: "entitlement_required",
      feature: "ai_resume_tailoring",
      reason: "fixture_meter_exhausted",
    },
  };
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    bootstrapFixture: HOME_BOOTSTRAP_FIXTURE,
    jobFixture: HOME_JOB_FIXTURE,
  });
  try {
    await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
    const tailor = page.getByRole("button", {
      name: `Tailor a resume for ${HOME_JOB_FIXTURE.title} at ${HOME_JOB_FIXTURE.company_name}`,
      exact: true,
    });
    await tailor.waitFor({ state: "visible" });
    const heldDenial = state.holdNextResumeGenerate(denial);
    await tailor.click();
    await heldDenial.started;

    await page.locator('aside a[href="/dashboard/network"]').click();
    await page.waitForURL(`${ORIGIN}/dashboard/network`);
    await page.getByRole("heading", { name: "Network", exact: true }).waitFor({ state: "visible" });

    const denialResponse = page.waitForResponse((response) => (
      response.url() === `${BACKEND_ORIGIN}/resume/generate`
      && response.request().method() === "POST"
      && response.status() === 402
    ));
    heldDenial.release();
    await Promise.all([heldDenial.settled, denialResponse]);
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));

    assert.equal(
      await page.getByRole("dialog", { name: "Tailor this resume with Litos+" }).count(),
      0,
      "a Home denial opened the persistent paywall after Home unmounted",
    );
    assert.equal(new URL(page.url()).pathname, "/dashboard/network");
    await page.getByRole("heading", { name: "No imported people yet", exact: true }).waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await capturePass(page, "network-after-retired-home-denial");
    assertNoPageErrors(state, "Route-scoped entitlement denial");
  } finally {
    await context.close();
  }
});

test("Documents exposes failed data, retries, and provides operable overflow tabs", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 320, height: 780 },
    failBankOnce: true,
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/documents`, { waitUntil: "domcontentloaded" });
    const failure = page.getByRole("heading", { name: "Work history did not load." });
    await failure.waitFor({ state: "visible" });
    assert.equal(await page.getByRole("heading", { name: "Work experience" }).count(), 0);
    await failure.scrollIntoViewIfNeeded();
    await capturePass(page, "documents-320-work-history-error");
    const retry = failure.locator("xpath=..").getByRole("button", { name: "Try again" });
    await retry.click();
    await failure.waitFor({ state: "detached" });
    await page.getByRole("heading", { name: "Work experience" }).waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.activeElement?.id), "resume-bank-heading");
    assert.equal(state.bankReads, 2);

    const tablist = page.getByRole("tablist", { name: "Document sections" });
    const tabs = tablist.getByRole("tab");
    assert.equal(await tabs.count(), 5);
    assert.equal(await tablist.getByRole("tab", { selected: true }).count(), 1);
    await assertEveryTabControlsLivePanel(tablist, "Documents");
    const cue = page.getByText("›", { exact: true });
    await cue.waitFor({ state: "visible" });
    await capturePass(page, "documents-320-work-history-recovered");
    await tablist.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await capturePass(page, "documents-320-error-recovered-tabs");

    const mainResume = tablist.getByRole("tab", { name: "Main resume" });
    await mainResume.focus();
    await mainResume.press("ArrowRight");
    const tailored = tablist.getByRole("tab", { name: "Tailored resumes" });
    await page.waitForFunction(() => {
      const node = document.getElementById("documents-tab-tailored-resumes");
      return node?.getAttribute("aria-selected") === "true" && document.activeElement === node;
    });
    await assert.doesNotReject(tailored.evaluate((node) => {
      if (node.getAttribute("aria-selected") !== "true") throw new Error("Tailored resumes was not selected");
      if (document.activeElement !== node) throw new Error("keyboard tab movement did not move focus");
      const panel = document.getElementById(node.getAttribute("aria-controls"));
      if (!panel || panel.getAttribute("aria-labelledby") !== node.id) throw new Error("selected tab does not label its panel");
    }));

    await tablist.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
    await cue.waitFor({ state: "detached" });
    await assertContained(page, "Documents at 320px");

    await page.addInitScript(() => {
      window.__documentsWrongDeepLinkFrames = 0;
      const sample = () => {
        if (new URL(location.href).searchParams.get("tab") !== "attachments") return;
        if (document.querySelector('#documents-tab-base-resume[aria-selected="true"]')) {
          window.__documentsWrongDeepLinkFrames += 1;
        }
      };
      window.__documentsDeepLinkObserver = new MutationObserver(sample);
      window.__documentsDeepLinkObserver.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
      sample();
    });
    await page.goto(`${ORIGIN}/dashboard/documents?tab=attachments`, { waitUntil: "domcontentloaded" });
    const attachmentsTabs = page.getByRole("tablist", { name: "Document sections" });
    await page.getByRole("tab", { name: "Attachments", selected: true }).waitFor({ state: "visible" });
    await page.getByText("‹", { exact: true }).waitFor({ state: "visible" });
    const wrongDeepLinkFrames = await page.evaluate(() => {
      window.__documentsDeepLinkObserver?.disconnect();
      return window.__documentsWrongDeepLinkFrames;
    });
    assert.equal(wrongDeepLinkFrames, 0, "Attachments deep link exposed Main resume before its requested panel");
    await assertSelectedTabVisible(attachmentsTabs, "Documents attachments deep link");
    await assertEveryTabControlsLivePanel(attachmentsTabs, "Documents attachments deep link");
    await capturePass(page, "documents-320-attachments-deeplink");
    await assertContained(page, "Documents attachments deep link at 320px");
    assertNoPageErrors(state, "Documents");
  } finally {
    await context.close();
  }
});

test("Resume saves survive a Documents tab remount without overlap or stale replacement", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    bankFixture: RESUME_BANK_FIXTURE,
    targetingFixture: COMPLETE_TARGETING_FIXTURE,
    profileFixture: {
      ...STUB["/profile"],
      full_name: "Fixture Student",
      resume_email: "fixture@example.invalid",
      school: "University of Southern California",
      degree: "BS Computer Science",
      grad_date: "May 2028",
    },
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/documents`, { waitUntil: "domcontentloaded" });
    const organization = page.getByLabel("Organization", { exact: true }).first();
    await organization.waitFor({ state: "visible" });
    const replaceResume = page.getByRole("button", { name: "Replace resume", exact: true });
    await replaceResume.waitFor({ state: "visible" });
    await page.waitForFunction(() => [...document.querySelectorAll("button")]
      .some((node) => node.textContent?.trim() === "Replace resume" && !node.disabled));
    const bankReadsBeforeRemount = state.bankReads;
    await organization.fill("Old server organization");
    await page.getByText("Save work history changes before replacing your resume.", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await replaceResume.isDisabled(), true, "dirty work history did not block resume replacement");
    const heldBankSave = state.holdNextBankSave();
    const bankSave = page.getByRole("button", { name: "Save changes", exact: true });
    await bankSave.click();
    await heldBankSave.started;
    await organization.fill("Newer local organization");

    const documentTabs = page.getByRole("tablist", { name: "Document sections" });
    await documentTabs.getByRole("tab", { name: "Tailored resumes" }).click();
    await page.waitForFunction(() => document.getElementById("documents-tab-tailored-resumes")?.getAttribute("aria-selected") === "true");
    await documentTabs.getByRole("tab", { name: "Main resume" }).click();
    const remountedOrganization = page.getByLabel("Organization", { exact: true }).first();
    await remountedOrganization.waitFor({ state: "visible" });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await remountedOrganization.inputValue(), "Newer local organization", "the tab remount discarded the newer editor state");
    assert.equal(state.bankReads, bankReadsBeforeRemount, "the tab remount read a stale experience bank while its PUT was pending");
    const remountedBankSave = page.locator("section[aria-busy] button").filter({ hasText: /^(Save changes|Saving\.\.\.)$/ }).first();
    await remountedBankSave.waitFor({ state: "visible" });
    assert.equal(
      (await remountedBankSave.innerText()).trim(),
      "Saving...",
      `the remounted workspace lost the held mutation marker after ${state.bankSaveWrites} PUT`,
    );
    assert.equal(await remountedBankSave.isDisabled(), true, "the remounted workspace exposed a second save");
    assert.equal(state.bankSaveWrites, 1, "tab remount started a second experience-bank PUT");
    await resetPageScroll(page, { blurActive: false });
    await capturePass(page, "resume-held-save-tab-remount");

    heldBankSave.release();
    await heldBankSave.settled;
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")]
        .find((node) => node.textContent?.trim() === "Save changes");
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    assert.equal(await remountedOrganization.inputValue(), "Newer local organization");
    assert.equal(state.bankReads, bankReadsBeforeRemount, "the held PUT settling triggered a stale experience-bank refresh");
    assert.equal(await page.getByText("Saved", { exact: true }).count(), 0, "a retired bank save marked newer edits as saved");
    assert.equal(state.bankSaveWrites, 1);
    assert.equal(state.maxConcurrentBankSaves, 1);

    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Saved", { exact: true }).waitFor({ state: "visible" });
    assert.equal(state.bankSaveWrites, 2, "the newer edit did not get its own save after the held PUT settled");
    assert.equal(state.maxConcurrentBankSaves, 1, "experience-bank PUTs overlapped across a tab remount");
    assert.equal(await replaceResume.isDisabled(), false, "saved work history did not restore resume replacement");

    await page.getByRole("button", { name: "Edit parsed details", exact: true }).click();
    await page.getByText("Save or cancel profile edits before replacing your resume.", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await replaceResume.isDisabled(), true, "the parsed-profile editor did not block resume replacement");
    const profileForm = page.locator('form[aria-busy]');
    const name = profileForm.getByLabel("Name", { exact: true });
    const profileReadsBeforeRemount = state.profileReads;
    await name.fill("Old server name");
    const heldProfileSave = state.holdNextParsedProfileSave();
    await profileForm.getByRole("button", { name: "Save changes", exact: true }).click();
    await heldProfileSave.started;
    await name.fill("Newer local name");

    await documentTabs.getByRole("tab", { name: "Tailored resumes" }).click();
    await page.waitForFunction(() => document.getElementById("documents-tab-tailored-resumes")?.getAttribute("aria-selected") === "true");
    await documentTabs.getByRole("tab", { name: "Main resume" }).click();
    const remountedProfileForm = page.locator('form[aria-busy]');
    const remountedName = remountedProfileForm.getByLabel("Name", { exact: true });
    await remountedName.waitFor({ state: "visible" });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await remountedName.inputValue(), "Newer local name", "the tab remount discarded the newer parsed-profile draft");
    assert.equal(state.profileReads, profileReadsBeforeRemount, "the tab remount fetched a stale parsed profile while its PATCH was pending");
    const remountedProfileSave = remountedProfileForm.getByRole("button", { name: /^(Save changes|Saving\.\.\.)$/ });
    assert.equal((await remountedProfileSave.innerText()).trim(), "Saving...", "the tab remount lost parsed-profile pending state");
    assert.equal(await remountedProfileSave.isDisabled(), true, "the remounted editor exposed a second parsed-profile PATCH");
    assert.equal(state.parsedProfileWrites, 1, "tab remount started a second parsed-profile PATCH");
    await capturePass(page, "resume-held-profile-save-tab-remount");

    heldProfileSave.release();
    await heldProfileSave.settled;
    await page.waitForFunction(() => {
      const form = document.querySelector("form[aria-busy]");
      const button = form ? [...form.querySelectorAll("button")]
        .find((node) => node.textContent?.trim() === "Save changes") : null;
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    assert.equal(await remountedName.inputValue(), "Newer local name");
    assert.equal(await remountedProfileForm.count(), 1, "a retired parsed-profile save closed the newer editor");
    assert.equal(state.profileReads, profileReadsBeforeRemount, "the retired parsed-profile response triggered a stale profile read");
    assert.equal(state.parsedProfileWrites, 1);
    assert.equal(state.maxConcurrentParsedProfileWrites, 1);

    await remountedProfileForm.getByRole("button", { name: "Save changes", exact: true }).click();
    await remountedProfileForm.waitFor({ state: "detached" });
    await page.getByText("Newer local name", { exact: true }).first().waitFor({ state: "visible" });
    assert.equal(state.parsedProfileWrites, 2, "the newer parsed-profile draft did not receive its own PATCH");
    assert.equal(state.maxConcurrentParsedProfileWrites, 1, "parsed-profile PATCHes overlapped across a tab remount");
    await capturePass(page, "resume-newer-edits-survive-held-saves");
    assertNoPageErrors(state, "Resume held saves");
  } finally {
    await context.close();
  }
});

test("Resume upload ownership and its parsed profile survive Documents tab and route remounts", async () => {
  const profileFixture = {
    ...STUB["/profile"],
    full_name: "Fixture Student",
    resume_email: "fixture@example.invalid",
    school: "University of Southern California",
    degree: "BS Computer Science",
    grad_date: "May 2028",
  };
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    bankFixture: RESUME_BANK_FIXTURE,
    targetingFixture: COMPLETE_TARGETING_FIXTURE,
    profileFixture,
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/documents`, { waitUntil: "domcontentloaded" });
    const replaceResume = page.getByRole("button", { name: "Replace resume", exact: true });
    await replaceResume.waitFor({ state: "visible" });
    await page.waitForFunction(() => [...document.querySelectorAll("button")]
      .some((node) => node.textContent?.trim() === "Replace resume" && !node.disabled));
    const profileReadsBeforeRemount = state.profileReads;
    const heldUpload = state.holdNextProfileUpload({
      ...profileFixture,
      full_name: "Uploaded Student",
      resume_email: "uploaded@example.invalid",
    });
    await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles({
      name: "new-resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nfixture resume\n%%EOF"),
    });
    await heldUpload.started;
    await page.getByText("new-resume.pdf", { exact: true }).waitFor({ state: "visible" });
    assert.equal(state.profileUploadWrites, 1);

    const documentTabs = page.getByRole("tablist", { name: "Document sections" });
    await documentTabs.getByRole("tab", { name: "Tailored resumes" }).click();
    await page.waitForFunction(() => document.getElementById("documents-tab-tailored-resumes")?.getAttribute("aria-selected") === "true");
    await documentTabs.getByRole("tab", { name: "Main resume" }).click();
    await page.getByText("new-resume.pdf", { exact: true }).waitFor({ state: "visible" });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(state.profileReads, profileReadsBeforeRemount, "the tab remount fetched the stale pre-upload profile");
    assert.equal(await page.getByText("Fixture Student", { exact: true }).count(), 0, "the remounted workspace exposed the stale pre-upload profile");
    const remountedUploadButton = page.locator("button").filter({ hasText: /^Reading\.\.\.$/ }).first();
    await remountedUploadButton.waitFor({ state: "visible" });
    assert.equal(await remountedUploadButton.isDisabled(), true, "the remounted workspace exposed a second profile upload");
    assert.equal(
      await page.locator('input[type="file"][accept="application/pdf"]').isDisabled(),
      true,
      "the remounted file input accepted a second profile upload",
    );
    assert.equal(state.profileUploadWrites, 1, "tab remount started a second profile upload");
    await capturePass(page, "resume-held-upload-tab-remount");

    await page.getByRole("link", { name: "Home", exact: true }).click();
    await page.waitForURL(`${ORIGIN}/dashboard`);
    await page.getByRole("link", { name: "Documents", exact: true }).click();
    await page.waitForURL(/\/dashboard\/documents/);
    await page.getByText("new-resume.pdf", { exact: true }).waitFor({ state: "visible" });
    const routeRemountedUploadButton = page.locator("button").filter({ hasText: /^Reading\.\.\.$/ }).first();
    await routeRemountedUploadButton.waitFor({ state: "visible" });
    assert.equal(await routeRemountedUploadButton.isDisabled(), true, "route remount exposed a second profile upload");
    assert.equal(state.profileReads, profileReadsBeforeRemount, "route remount fetched the stale pre-upload profile");
    assert.equal(state.profileUploadWrites, 1, "route remount started a second profile upload");
    await capturePass(page, "resume-held-upload-route-remount");

    heldUpload.release();
    await heldUpload.settled;
    await page.getByText("Uploaded Student", { exact: true }).first().waitFor({ state: "visible" });
    assert.equal(state.profileReads, profileReadsBeforeRemount, "upload settlement triggered a stale profile GET");
    assert.equal(state.profileUploadWrites, 1);
    assert.equal(state.maxConcurrentProfileUploads, 1, "profile uploads overlapped across a tab or route remount");
    assert.equal(await page.getByText("Fixture Student", { exact: true }).count(), 0, "the old profile replaced the uploaded profile");
    await capturePass(page, "resume-upload-settled-after-tab-remount");
    assertNoPageErrors(state, "Resume held upload");
  } finally {
    await context.close();
  }
});

test("Network distinguishes a request failure from empty data and retries", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 320, height: 780 },
    failNetworkOnce: true,
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/network`, { waitUntil: "domcontentloaded" });
    const failure = page.getByRole("heading", { name: "Could not check your network" });
    await failure.waitFor({ state: "visible" });
    assert.equal(await page.getByRole("heading", { name: "No imported people yet" }).count(), 0);
    await capturePass(page, "network-320-status-error");
    await failure.locator("xpath=..").getByRole("button", { name: "Try again" }).click();
    await failure.waitFor({ state: "detached" });
    await page.getByRole("heading", { name: "No imported people yet" }).waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.activeElement?.id), "network-panel");
    assert.equal(state.networkStatusReads, 2);

    const tablist = page.getByRole("tablist", { name: "Network sections" });
    await assertEveryTabControlsLivePanel(tablist, "Network");
    await page.getByRole("button", { name: "Import connections", exact: true }).click();
    await page.waitForFunction(() => {
      const node = document.getElementById("network-tab-linkedin");
      return node?.getAttribute("aria-selected") === "true" && document.activeElement === node;
    });
    const fileInput = page.locator('input[type="file"][accept*="csv"]');
    assert.equal(await fileInput.evaluate((node) => node.hidden), true, "the programmatic CSV input remained exposed to keyboard or accessibility navigation");
    const consent = page.getByRole("checkbox", { name: /I consent to Litos processing/ });
    const chooseFile = page.getByRole("button", { name: "Choose Connections.csv", exact: true });
    await chooseFile.focus();
    await chooseFile.press("Shift+Tab");
    assert.equal(await consent.evaluate((node) => document.activeElement === node), true, "the hidden CSV input became an invisible keyboard stop");
    await fileInput.setInputFiles({
      name: "Connections.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("First Name,Last Name,Company\nAda,Lovelace,Acme\n"),
    });
    await consent.check();
    await page.getByRole("button", { name: "Preview import", exact: true }).click();
    await page.getByText("2 accepted · 0 rejected", { exact: true }).waitFor({ state: "visible" });
    await consent.uncheck();
    await page.getByText("2 accepted · 0 rejected", { exact: true }).waitFor({ state: "detached" });
    await consent.check();
    const stalePreview = state.holdNextNetworkPreview();
    await page.getByRole("button", { name: "Preview import", exact: true }).click();
    await stalePreview.started;
    await consent.uncheck();
    stalePreview.release();
    await stalePreview.settled;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByText("2 accepted · 0 rejected", { exact: true }).count(), 0, "a stale CSV preview reappeared after consent was revoked");
    assert.equal(state.networkCommitWrites, 0, "revoking visible consent still committed the CSV import");

    await consent.check();
    await page.getByRole("button", { name: "Preview import", exact: true }).click();
    await page.getByText("2 accepted · 0 rejected", { exact: true }).waitFor({ state: "visible" });
    const heldCommit = state.holdNextNetworkCommit();
    await page.getByRole("button", { name: "Import accepted rows", exact: true }).click();
    await heldCommit.started;
    const importCard = page.locator('[data-network-operation="commit"]');
    await importCard.waitFor({ state: "visible" });
    assert.equal(await importCard.getAttribute("aria-busy"), "true");
    assert.equal(await consent.isDisabled(), true, "consent could be revoked while its import commit was active");
    assert.equal(await fileInput.isDisabled(), true, "the CSV could be replaced while its import commit was active");
    assert.equal(await chooseFile.isDisabled(), true, "the visible file chooser remained active during commit");
    await importCard.evaluate(async (node) => {
      document.documentElement.style.scrollBehavior = "auto";
      node.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await waitForStableGeometry(importCard, "Network import lock");
    await capturePass(page, "network-320-commit-locked");
    heldCommit.release();
    await heldCommit.settled;
    await page.getByRole("heading", { name: "2 imported people", exact: true }).waitFor({ state: "visible" });
    assert.equal(state.networkCommitWrites, 1, "the held import did not settle exactly once");

    const people = tablist.getByRole("tab", { name: "People" });
    const companies = tablist.getByRole("tab", { name: "Companies" });
    const linkedin = tablist.getByRole("tab", { name: "LinkedIn" });
    await page.evaluate(() => {
      window.__networkTabIntentLog = [];
      const list = document.querySelector('[role="tablist"][aria-label="Network sections"]');
      list?.addEventListener("keydown", (event) => {
        window.__networkTabIntentLog.push({
          type: "keydown",
          key: event.key,
          target: event.target?.id ?? null,
          active: document.activeElement?.id ?? null,
        });
      }, true);
      const recordSelection = () => window.__networkTabIntentLog.push({
        type: "selection",
        selected: document.querySelector('[role="tab"][aria-selected="true"]')?.id ?? null,
        active: document.activeElement?.id ?? null,
      });
      window.__networkTabIntentObserver = new MutationObserver(recordSelection);
      window.__networkTabIntentObserver.observe(list, { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
      recordSelection();
    });
    await people.click();
    await companies.click();
    await page.waitForFunction(() => {
      const node = document.getElementById("network-tab-companies");
      return node?.getAttribute("aria-selected") === "true" && document.activeElement === node;
    }, null, { timeout: 5_000 });
    await linkedin.click();
    await page.waitForFunction(() => document.getElementById("network-tab-linkedin")?.getAttribute("aria-selected") === "true");
    await people.click();
    await people.focus();
    await people.press("ArrowRight");
    await page.waitForFunction(() => {
      const node = document.getElementById("network-tab-companies");
      return node?.getAttribute("aria-selected") === "true" && document.activeElement === node;
    }, null, { timeout: 5_000 }).catch(async (reason) => {
      const diagnostic = await page.evaluate(() => ({
        activeId: document.activeElement?.id ?? null,
        tabs: [...document.querySelectorAll('[role="tab"]')].map((node) => ({
          id: node.id,
          selected: node.getAttribute("aria-selected"),
          tabIndex: node.getAttribute("tabindex"),
        })),
        panelLabelledBy: document.getElementById("network-panel")?.getAttribute("aria-labelledby") ?? null,
        intentLog: window.__networkTabIntentLog ?? [],
      }));
      assert.fail(`newest Network tab intent did not settle: ${reason.message}; ${JSON.stringify(diagnostic)}`);
    });
    await assert.doesNotReject(companies.evaluate((node) => {
      if (node.getAttribute("aria-selected") !== "true") throw new Error("Companies was not selected");
      if (document.activeElement !== node) throw new Error("keyboard tab movement did not move focus");
      const panel = document.getElementById(node.getAttribute("aria-controls"));
      if (!panel || panel.getAttribute("aria-labelledby") !== node.id) throw new Error("selected tab does not label its panel");
    }));
    await capturePass(page, "network-320-error-recovered");
    await assertContained(page, "Network at 320px");
    assertNoPageErrors(state, "Network");
  } finally {
    await context.close();
  }
});

test("Network retained-data action moves focus to the selected LinkedIn tab", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 320, height: 780 },
    networkStatusFixture: {
      connected: false,
      source: "csv",
      data_use_active: false,
      imported_people_count: 0,
      retained_people_count: 3,
      imported_at: "2026-08-23T10:00:00Z",
    },
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/network`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Network use is disconnected" }).waitFor({ state: "visible" });
    await capturePass(page, "network-320-retained-data");
    await page.getByRole("button", { name: "Review retained data", exact: true }).click();
    const linkedin = page.getByRole("tab", { name: "LinkedIn" });
    await page.waitForFunction(() => {
      const node = document.getElementById("network-tab-linkedin");
      return node?.getAttribute("aria-selected") === "true" && document.activeElement === node;
    });
    assert.equal(await linkedin.getAttribute("aria-selected"), "true");
    await capturePass(page, "network-320-retained-data-linkedin");
    assertNoPageErrors(state, "Network retained data focus");
  } finally {
    await context.close();
  }
});

test("Network announces unknown billing access and recovers through retry", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    failBillingAccessOnce: true,
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/network`, { waitUntil: "domcontentloaded" });
    const failure = page.getByRole("heading", { name: "Could not check your plan access" });
    await failure.waitFor({ state: "visible" });
    const alert = page.getByRole("alert").filter({ has: failure });
    assert.equal(await alert.count(), 1, "unknown billing access was not announced");
    assert.equal(await page.getByRole("heading", { name: "No imported people yet" }).count(), 0);
    assert.equal(await page.locator("#network-panel .rq-shimmer").count(), 0, "billing failure remained an indefinite shimmer");
    assert.equal(state.billingStateReads, 1);
    assert.ok(state.billingMeFailures >= 1, "legacy /me access resolution was not exercised");
    await capturePass(page, "network-plan-access-error");

    await alert.getByRole("button", { name: "Try again" }).click();
    await failure.waitFor({ state: "detached" });
    await page.getByRole("heading", { name: "No imported people yet" }).waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.activeElement?.id), "network-panel");
    assert.equal(state.billingStateReads, 2);
    assert.equal(state.billingRecovered, true);
    const tablist = page.getByRole("tablist", { name: "Network sections" });
    await assertEveryTabControlsLivePanel(tablist, "Network after billing recovery");
    await finishDashboardAnimations(page);
    await capturePass(page, "network-billing-access-recovered");
    assertNoPageErrors(state, "Network billing recovery");
  } finally {
    await context.close();
  }
});

test("Account tabs advertise overflow and Automation scans as three surfaces", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 320, height: 780 },
    billingStateFixture: LOCKED_BILLING_STATE_FIXTURE,
  });
  try {
    await page.goto(`${ORIGIN}/dashboard/settings#automation`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Automation", exact: true }).waitFor({ state: "visible" });
    const tablist = page.getByRole("tablist", { name: "Account categories" });
    assert.equal(await tablist.getByRole("tab").count(), 5);
    assert.equal(await tablist.getByRole("tab", { selected: true }).count(), 1);
    await assertEveryTabControlsLivePanel(tablist, "Account");
    await assertSelectedTabVisible(tablist, "Account Automation deep link");
    const cue = page.getByText("›", { exact: true });
    await cue.waitFor({ state: "visible" });
    await capturePass(page, "account-320-overflow");
    await assertContained(page, "Account at 320px");

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(() => document.documentElement.clientWidth === 1280);
    const density = await page.evaluate(() => {
      const cardFor = (text) => [...document.querySelectorAll("h3")]
        .find((node) => node.textContent?.trim() === text)?.parentElement;
      const sending = cardFor("Sending permissions");
      const inbox = cardFor("Application email and verification inbox");
      const notifications = cardFor("Email notifications");
      if (!sending || !inbox || !notifications) return null;
      return {
        sending: sending.getBoundingClientRect().toJSON(),
        inbox: inbox.getBoundingClientRect().toJSON(),
        notifications: notifications.getBoundingClientRect().toJSON(),
      };
    });
    assert.ok(density, "Automation cards could not be measured");
    assert.ok(Math.abs(density.sending.top - density.inbox.top) <= 2, `Automation columns are not aligned: ${JSON.stringify(density)}`);
    assert.ok(density.notifications.top >= Math.max(density.sending.bottom, density.inbox.bottom) + 12, `notification surface overlaps the top row: ${JSON.stringify(density)}`);
    assert.ok(density.notifications.width >= density.sending.width * 1.8, `notification surface is not full width: ${JSON.stringify(density)}`);
    await capturePass(page, "account-automation-density");

    await finishDashboardAnimations(page);
    await startAnimationLog(page);
    const automationTab = tablist.getByRole("tab", { name: "Automation", exact: true });
    await automationTab.focus();
    await automationTab.press("ArrowRight");
    const planTab = tablist.getByRole("tab", { name: "Plan & usage", exact: true });
    await page.waitForFunction(() => {
      const tab = document.getElementById("tab-plan");
      return tab?.getAttribute("aria-selected") === "true" && document.activeElement === tab;
    });
    await page.getByRole("heading", { name: "Plan and usage", exact: true }).waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    const accountMotion = await stopAnimationLog(page);
    const exit = accountMotion.find((sample) => sample.name === "rq-dashboard-panel-exit");
    const enter = accountMotion.find((sample) => sample.name === "rq-dashboard-panel-enter");
    assert.ok(exit, `Account tab change had no panel exit: ${JSON.stringify(accountMotion)}`);
    assert.ok(enter, `Account tab change had no panel entry: ${JSON.stringify(accountMotion)}`);
    assert.ok(enter.delay >= exit.duration, `Account tab panels overlapped: ${JSON.stringify({ exit, enter })}`);
    assert.equal(await planTab.getAttribute("aria-selected"), "true");
    await assertEveryTabControlsLivePanel(tablist, "Account after keyboard tab change");
    await capturePass(page, "account-plan-tab-motion");

    await page.getByRole("button", { name: "Choose Litos+", exact: true }).click();
    const planUpgrade = page.getByRole("dialog", { name: "Tailor this resume with Litos+" });
    await planUpgrade.waitFor({ state: "visible" });
    await page.goBack();
    await page.locator('#tab-automation[aria-selected="true"]').waitFor({ state: "visible" });
    assert.equal(await planUpgrade.count(), 1, "the global Litos+ dialog did not survive Account history navigation");
    await planUpgrade.getByRole("button", { name: "Close Litos+ options" }).click();
    await planUpgrade.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.id === "tab-automation");
    await capturePass(page, "account-upgrade-history-focus-fallback");
    await assertContained(page, "Account at 1280px");
    assertNoPageErrors(state, "Account");
  } finally {
    await context.close();
  }
});

test("reduced motion is static and 640px reflow stays contained", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 640, height: 900 },
    reducedMotion: "reduce",
  });
  try {
    await page.goto(`${QA_ORIGIN}/dashboard/outreach?qa=1`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    await startAnimationLog(page);
    await page.getByRole("button", { name: "Start outreach" }).click();
    await page.getByRole("heading", { name: "A note you choose to send." }).waitFor({ state: "visible" });
    await assertNoLoggedDashboardMotion(page, "Outreach panel entry");
    const motion = await page.evaluate(() => ({
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      dashboardAnimations: document.getAnimations()
        .filter((animation) => (animation.animationName ?? "").startsWith("rq-dashboard") && ["running", "pending"].includes(animation.playState))
        .map((animation) => animation.animationName),
    }));
    assert.equal(motion.scrollBehavior, "auto");
    assert.deepEqual(motion.dashboardAnimations, []);
    await assertContained(page, "Outreach at the 640px reflow viewport");

    await page.goto(`${QA_ORIGIN}/dashboard?qa=1`, { waitUntil: "domcontentloaded" });
    const reducedSkip = page.locator('button[aria-label^="Skip "]').first();
    await reducedSkip.waitFor({ state: "visible" });
    const reducedSkipName = await reducedSkip.getAttribute("aria-label");
    await startAnimationLog(page);
    await reducedSkip.click();
    const reducedUndo = page.getByRole("button", { name: "Undo", exact: true });
    await reducedUndo.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "dashboard-skip-undo");
    await assertNoLoggedDashboardMotion(page, "Home Skip handoff");
    await startAnimationLog(page);
    await reducedUndo.click();
    await reducedUndo.waitFor({ state: "detached" });
    await page.waitForFunction((accessibleName) => document.activeElement?.getAttribute("aria-label") === accessibleName, reducedSkipName);
    await assertNoLoggedDashboardMotion(page, "Home Undo handoff");
    await assertContained(page, "Home at the 640px reflow viewport");
    await capturePass(page, "reduced-motion-640-reflow");

    await page.goto(`${QA_ORIGIN}/dashboard/applications?qa=anduril`, { waitUntil: "domcontentloaded" });
    const reducedAllApplications = page.getByRole("button", { name: /All applications/ });
    await reducedAllApplications.waitFor({ state: "visible" });
    await startAnimationLog(page);
    await reducedAllApplications.click();
    await page.getByTestId("application-ledger-count").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-application-row-id") === "d6693be1-9d1d-4f61-9911-8d95f1ad1b07");
    await assertNoLoggedDashboardMotion(page, "Applications close handoff");
    await startAnimationLog(page);
    await page.locator('button[data-application-row-id="d6693be1-9d1d-4f61-9911-8d95f1ad1b07"]:visible').click();
    await reducedAllApplications.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "application-ledger-heading");
    await assertNoLoggedDashboardMotion(page, "Applications open handoff");
    await capturePass(page, "applications-reduced-motion-focus");

    await page.goto(`${ORIGIN}/dashboard/documents`, { waitUntil: "domcontentloaded" });
    const documentTabs = page.getByRole("tablist", { name: "Document sections" });
    await documentTabs.waitFor({ state: "visible" });
    const documentCue = page.getByText("›", { exact: true });
    const documentLeftCue = page.getByText("‹", { exact: true });
    await documentCue.waitFor({ state: "visible" });
    await assertContained(page, "Documents at the 640px reflow viewport");
    await capturePass(page, "documents-640-tab-overflow-cue");
    await documentTabs.getByRole("tab", { name: "Saved answers" }).click();
    await assertSelectedTabVisible(documentTabs, "Documents saved answers at 640px");
    await page.setViewportSize({ width: 320, height: 780 });
    await page.waitForFunction(() => document.documentElement.clientWidth === 320);
    await assertSelectedTabVisible(documentTabs, "Documents saved answers after 640px to 320px resize");
    await capturePass(page, "documents-tabs-640-to-320");
    await scrollTablistToEnd(documentTabs);
    await documentCue.waitFor({ state: "detached" });
    await documentLeftCue.waitFor({ state: "visible" });

    await page.setViewportSize({ width: 640, height: 900 });
    await page.waitForFunction(() => document.documentElement.clientWidth === 640);
    await page.goto(`${ORIGIN}/dashboard/settings#automation`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Automation", exact: true }).waitFor({ state: "visible" });
    const accountTabs = page.getByRole("tablist", { name: "Account categories" });
    const accountCue = page.getByText("›", { exact: true });
    await accountCue.waitFor({ state: "visible" });
    await assertContained(page, "Account at the 640px reflow viewport");
    await assertSelectedTabVisible(accountTabs, "Account Automation at 640px");
    await capturePass(page, "account-640-tab-overflow-cue");
    await page.setViewportSize({ width: 320, height: 780 });
    await page.waitForFunction(() => document.documentElement.clientWidth === 320);
    await accountCue.waitFor({ state: "visible" });
    await assertSelectedTabVisible(accountTabs, "Account Automation after 640px to 320px resize");
    await capturePass(page, "account-tabs-640-to-320");
    await scrollTablistToEnd(accountTabs);
    await accountCue.waitFor({ state: "detached" });
    assertNoPageErrors(state, "Reduced motion and reflow");
  } finally {
    await context.close();
  }
});
