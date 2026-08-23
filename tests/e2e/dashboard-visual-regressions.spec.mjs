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
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

import { BACKEND_ORIGIN, RESUMES, SESSION_TOKEN, STUB } from "./fixture-data.mjs";
import { isSanctionedThirdParty } from "./sanctioned-third-parties.mjs";

const ARTIFACT_DIR = path.join(process.cwd(), "test-results", "dashboard-visual-regressions");
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
  billingStateFixture = BILLING_STATE_FIXTURE,
  boardFixture = STUB["/applications/board"],
  documentsFixture = { documents: [] },
  resumeHistoryFixture = null,
  submissionFixtures = {},
}) {
  if (!browser || !ORIGIN || !QA_ORIGIN) throw new Error("Chromium did not start");
  const context = await browser.newContext({ viewport, reducedMotion });
  contexts.push(context);
  const state = {
    bankReads: 0,
    networkStatusReads: 0,
    billingStateReads: 0,
    billingMeFailures: 0,
    billingRecovered: false,
    pageErrors: [],
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
      if (denyOutreachContacts && method === "POST" && pathname === "/applications") {
        await fulfillJson(route, { application: { id: "fixture-outreach-application" } });
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
      if (method === "GET" && pathname === "/profile/experience-bank") {
        state.bankReads += 1;
        if (failBankOnce && state.bankReads === 1) {
          await fulfillJson(route, { error: "fixture bank failure" }, 500);
        } else {
          await fulfillJson(route, { entries: [] });
        }
        return;
      }
      if (method === "GET" && pathname === "/network/linkedin/status") {
        state.networkStatusReads += 1;
        if (failNetworkOnce && state.networkStatusReads === 1) {
          await fulfillJson(route, { error: "fixture network failure" }, 500);
        } else {
          await fulfillJson(route, {
            connected: false,
            source: null,
            data_use_active: false,
            imported_people_count: 0,
            retained_people_count: 0,
            imported_at: null,
          });
        }
        return;
      }

      if (method === "GET" && pathname === "/resume/history" && resumeHistoryFixture) {
        await fulfillJson(route, { resumes: resumeHistoryFixture });
        return;
      }
      if (method === "GET" && pathname === "/dashboard/bootstrap" && resumeHistoryFixture) {
        await fulfillJson(route, {
          ...STUB["/dashboard/bootstrap"],
          resume_history: { resumes: resumeHistoryFixture },
        });
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
        "/billing/state": billingStateFixture,
        "/profile/experience-bank": { entries: [] },
        "/cover-letters": { cover_letters: [] },
        "/documents": documentsFixture,
        "/applications/board": boardFixture,
        "/drafts": { drafts: [DURABLE_DRAFT_FIXTURE] },
        "/network/people": { people: [] },
        "/network/companies": { companies: [] },
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
        if (!name.startsWith("rq-dashboard")) continue;
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

async function capturePass(page, name, fullPage = false) {
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, `${name}.png`),
    fullPage,
    animations: "disabled",
  });
}

async function armOverlayExitCapture(page, selector, { nativeBackdrop = false } = {}) {
  await page.evaluate(({ targetSelector, captureNativeBackdrop }) => {
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
      window.__dashboardOverlayExitCapture = {
        opacity: getComputedStyle(node).opacity,
        transform: getComputedStyle(node).transform,
        ariaHidden: node.getAttribute("aria-hidden"),
        inert: node.hasAttribute("inert"),
        pointerEvents: getComputedStyle(node).pointerEvents,
        backdropOpacity: backdrop.opacity,
        dialogAnimation: dialogAnimation.animationName,
        backdropAnimation: backdropAnimation?.animationName ?? null,
      };
      for (const animation of animations) animation.play();
      document.removeEventListener("animationstart", captureExit, true);
    };
    document.addEventListener("animationstart", captureExit, true);
  }, { targetSelector: selector, captureNativeBackdrop: nativeBackdrop });
}

async function assertRetainedOverlayExit(page, label) {
  await page.waitForFunction(() => window.__dashboardOverlayExitCapture !== null);
  const sample = await page.evaluate(() => window.__dashboardOverlayExitCapture);
  assert.equal(sample.dialogAnimation, "rq-dashboard-dialog-exit", `${label} did not create a dialog exit`);
  assert.equal(sample.backdropAnimation, "rq-dashboard-backdrop-exit", `${label} did not create a backdrop exit`);
  assert.equal(sample.opacity, "1", `${label} ghosted its readable content during exit`);
  assert.notEqual(sample.transform, "none", `${label} did not move during exit`);
  assert.equal(sample.ariaHidden, "true", `${label} stayed exposed to assistive technology during exit`);
  assert.equal(sample.inert, true, `${label} stayed interactive during exit`);
  assert.equal(sample.pointerEvents, "none", `${label} kept pointer interaction during exit`);
  const backdropOpacity = Number(sample.backdropOpacity);
  assert.ok(
    Number.isFinite(backdropOpacity) && backdropOpacity > 0 && backdropOpacity < 1,
    `${label} backdrop did not fade at the exit midpoint: ${JSON.stringify(sample)}`,
  );
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
        if (selectedRect.left >= viewportRect.left - 1 && selectedRect.right <= viewportRect.right + 1) return;
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
    return {
      selectedId: selected.id,
      selected: selectedRect.toJSON(),
      viewport: viewportRect.toJSON(),
      windowWidth: document.documentElement.clientWidth,
    };
  });
  assert.ok(result, `${label} has no selected tab`);
  assert.ok(
    result.selected.left >= Math.max(0, result.viewport.left) - 1
      && result.selected.right <= Math.min(result.windowWidth, result.viewport.right) + 1,
    `${label} selected tab is outside its visible viewport: ${JSON.stringify(result)}`,
  );
}

function assertNoPageErrors(state, label) {
  assert.deepEqual(state.pageErrors, [], `${label} raised a page error`);
}

test("hand-built application overlays retain an inert exit and restore their exact triggers", async () => {
  const { context, page, state } = await newDashboardPage({
    viewport: { width: 1280, height: 900 },
    boardFixture: APPLICATION_PACKET_BOARD_FIXTURE,
    resumeHistoryFixture: [TRANSCRIPT_PACKET],
    submissionFixtures: {
      [TRANSCRIPT_PACKET.id]: {
        application_id: TRANSCRIPT_PACKET.id,
        review: TRANSCRIPT_PACKET.spec._review,
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
    await packetTrigger.click();
    const packetDialog = page.getByRole("dialog", {
      name: "Application packet: Product Engineer at Acme Labs",
    });
    await packetDialog.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await capturePass(page, "application-packet-overlay-open");
    await armOverlayExitCapture(
      page,
      '[role="dialog"][aria-label="Application packet: Product Engineer at Acme Labs"]',
    );
    await packetDialog.getByRole("button", { name: "Close", exact: true }).click();
    await assertRetainedOverlayExit(page, "Application packet");
    await packetDialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-focus-probe") === "application-packet-trigger");

    await page.goto(`${ORIGIN}/dashboard/applications?application=${TRANSCRIPT_PACKET.id}&intent=apply`, {
      waitUntil: "domcontentloaded",
    });
    const transcriptTrigger = page.getByRole("button", {
      name: /Add the file this employer asks for: .*needs your transcript/i,
    });
    await transcriptTrigger.waitFor({ state: "visible" });
    await transcriptTrigger.evaluate((node) => node.setAttribute("data-focus-probe", "transcript-trigger"));
    await transcriptTrigger.click();
    const transcriptDialog = page.getByRole("dialog", {
      name: "transcript for Software Engineer Intern at Fixture Robotics",
    });
    await transcriptDialog.waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    await capturePass(page, "transcript-overlay-open");
    await armOverlayExitCapture(
      page,
      '[role="dialog"][aria-label="transcript for Software Engineer Intern at Fixture Robotics"]',
    );
    await transcriptDialog.getByRole("button", { name: "Close", exact: true }).click();
    await assertRetainedOverlayExit(page, "Transcript");
    await transcriptDialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-focus-probe") === "transcript-trigger");
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
    await packetTrigger.click();
    const packetDialog = page.getByRole("dialog", {
      name: "Application packet: Product Engineer at Acme Labs",
    });
    await packetDialog.waitFor({ state: "visible" });
    await capturePass(page, "reduced-motion-application-packet-static");
    await packetDialog.getByRole("button", { name: "Close", exact: true }).click();
    await packetDialog.waitFor({ state: "detached" });
    assert.deepEqual(await page.evaluate(() => document.getAnimations()
      .filter((animation) => (animation.animationName ?? "").startsWith("rq-dashboard")
        && ["running", "pending"].includes(animation.playState))
      .map((animation) => animation.animationName)), []);

    await page.goto(`${ORIGIN}/dashboard/settings#sign-in`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete your account?" });
    await deleteDialog.waitFor({ state: "visible" });
    await deleteDialog.getByRole("button", { name: "Keep account" }).click();
    await page.waitForFunction(() => {
      const node = document.querySelector('dialog[aria-labelledby="delete-title"]');
      return node instanceof HTMLDialogElement && !node.open;
    });
    assert.deepEqual(await page.evaluate(() => document.getAnimations()
      .filter((animation) => (animation.animationName ?? "").startsWith("rq-dashboard")
        && ["running", "pending"].includes(animation.playState))
      .map((animation) => animation.animationName)), []);
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
    await capturePass(page, "outreach-composer-sequential");
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
    await page.getByText(DURABLE_DRAFT_FIXTURE.subject, { exact: true }).waitFor({ state: "visible" });
    const edit = page.getByRole("button", { name: "Edit", exact: true });
    await edit.evaluate((node) => node.setAttribute("data-focus-probe", "durable-draft-edit"));
    await edit.click();
    const draft = page.locator("#outreach-draft-body");
    await page.waitForFunction(() => document.activeElement?.id === "outreach-draft-body");
    assert.equal(await draft.inputValue(), DURABLE_DRAFT_FIXTURE.body);
    await capturePass(page, "outreach-saved-draft-edit-focus");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.waitForFunction(() => {
      const trigger = document.querySelector('[data-focus-probe="durable-draft-edit"]');
      return trigger !== null && document.activeElement === trigger;
    });
    await assertContained(page, "Outreach after closing a saved draft");
    assertNoPageErrors(state, "Saved Outreach draft focus");
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
        window.__dashboardDialogExitCapture = {
          animation,
          sample: {
            found: true,
            opacity: getComputedStyle(node).opacity,
            transform: getComputedStyle(node).transform,
            ariaHidden: node.getAttribute("aria-hidden"),
            inert: node.hasAttribute("inert"),
            pointerEvents: getComputedStyle(node).pointerEvents,
          },
        };
        animation.play();
        document.removeEventListener("animationstart", captureExit, true);
      };
      document.addEventListener("animationstart", captureExit, true);
    });
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.waitForFunction(() => window.__dashboardDialogExitCapture?.sample !== null);
    const midpoint = await page.evaluate(() => window.__dashboardDialogExitCapture.sample);
    assert.equal(midpoint.found, true, "the sheet exit animation was not created");
    assert.equal(midpoint.opacity, "1", `the sheet ghosted at its exit midpoint: ${JSON.stringify(midpoint)}`);
    assert.equal(midpoint.ariaHidden, "true");
    assert.equal(midpoint.inert, true);
    assert.equal(midpoint.pointerEvents, "none");
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
    await capturePass(page, "applications-320-task");
    await assertContained(page, "Applications task at 320px");
    assertNoPageErrors(state, "Applications");
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
    await page.getByRole("button", { name: "Save", exact: true }).waitFor({ state: "visible" });
    await finishDashboardAnimations(page);
    const samples = await stopAnimationLog(page);
    const exit = samples.find((sample) => sample.name === "rq-dashboard-panel-exit");
    const enter = samples.find((sample) => sample.name === "rq-dashboard-panel-enter");
    assert.ok(exit, `Application task change had no panel exit: ${JSON.stringify(samples)}`);
    assert.ok(enter, `Application task change had no panel entry: ${JSON.stringify(samples)}`);
    assert.ok(enter.delay >= exit.duration, `Application task screens overlapped: ${JSON.stringify({ exit, enter })}`);
    assert.equal(await page.getByRole("button", { name: /^Answer:/ }).count(), 0);
    await capturePass(page, "applications-task-question-handoff");
    await assertContained(page, "Application question handoff");
    assertNoPageErrors(state, "Application task handoff");
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

    await page.goto(`${ORIGIN}/dashboard/documents?tab=attachments`, { waitUntil: "domcontentloaded" });
    const attachmentsTabs = page.getByRole("tablist", { name: "Document sections" });
    await page.getByRole("tab", { name: "Attachments", selected: true }).waitFor({ state: "visible" });
    await assertSelectedTabVisible(attachmentsTabs, "Documents attachments deep link");
    await assertEveryTabControlsLivePanel(attachmentsTabs, "Documents attachments deep link");
    await capturePass(page, "documents-320-attachments-deeplink");
    await assertContained(page, "Documents attachments deep link at 320px");
    assertNoPageErrors(state, "Documents");
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
    const people = tablist.getByRole("tab", { name: "People" });
    await people.focus();
    await people.press("ArrowRight");
    const companies = tablist.getByRole("tab", { name: "Companies" });
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
    await capturePass(page, "network-billing-access-recovered");
    assertNoPageErrors(state, "Network billing recovery");
  } finally {
    await context.close();
  }
});

test("Account tabs advertise overflow and Automation scans as three surfaces", async () => {
  const { context, page, state } = await newDashboardPage({ viewport: { width: 320, height: 780 } });
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
    await page.getByRole("button", { name: "Start outreach" }).click();
    await page.getByRole("heading", { name: "A note you choose to send." }).waitFor({ state: "visible" });
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
    await reducedSkip.click();
    const reducedUndo = page.getByRole("button", { name: "Undo", exact: true });
    await reducedUndo.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "dashboard-skip-undo");
    assert.deepEqual(await page.evaluate(() => document.getAnimations()
      .filter((animation) => (animation.animationName ?? "").startsWith("rq-dashboard")
        && ["running", "pending"].includes(animation.playState))
      .map((animation) => animation.animationName)), []);
    await reducedUndo.click();
    await reducedUndo.waitFor({ state: "detached" });
    await page.waitForFunction((accessibleName) => document.activeElement?.getAttribute("aria-label") === accessibleName, reducedSkipName);
    assert.deepEqual(await page.evaluate(() => document.getAnimations()
      .filter((animation) => (animation.animationName ?? "").startsWith("rq-dashboard")
        && ["running", "pending"].includes(animation.playState))
      .map((animation) => animation.animationName)), []);
    await assertContained(page, "Home at the 640px reflow viewport");
    await capturePass(page, "reduced-motion-640-reflow");

    await page.goto(`${ORIGIN}/dashboard/documents`, { waitUntil: "domcontentloaded" });
    const documentTabs = page.getByRole("tablist", { name: "Document sections" });
    await documentTabs.waitFor({ state: "visible" });
    const documentCue = page.getByText("›", { exact: true });
    await documentCue.waitFor({ state: "visible" });
    await assertContained(page, "Documents at the 640px reflow viewport");
    await capturePass(page, "documents-640-tab-overflow-cue");
    await documentTabs.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
    await documentCue.waitFor({ state: "detached" });

    await page.goto(`${ORIGIN}/dashboard/settings#automation`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Automation", exact: true }).waitFor({ state: "visible" });
    const accountTabs = page.getByRole("tablist", { name: "Account categories" });
    const accountCue = page.getByText("›", { exact: true });
    await accountCue.waitFor({ state: "visible" });
    await assertContained(page, "Account at the 640px reflow viewport");
    await capturePass(page, "account-640-tab-overflow-cue");
    await accountTabs.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
    await accountCue.waitFor({ state: "detached" });
    assertNoPageErrors(state, "Reduced motion and reflow");
  } finally {
    await context.close();
  }
});
