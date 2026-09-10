/**
 * A DEAD BUTTON WITH NO CONSOLE ERROR IS A SWALLOWED 409 IN THE NETWORK TAB.
 *
 * Measured live three times now, most recently 2026-08-20 on the Applications tracker: pressing
 * "Approve packet and fill form" fired POST /applications/:id/packet-audit/acknowledge, the server answered
 * 409 with an authored sentence written for the applicant, and the person watching the button saw
 * nothing change. The backend writes those sentences on purpose (applications.ts answers the
 * acknowledge with "This application cannot be acknowledged in its current state" when a run has
 * claimed the row, and PACKET_AUDIT_STALE with its own sentence when the digests moved); a client
 * that drops them turns a stated refusal into a dead control.
 *
 * These cases pin the whole audit -> acknowledge -> submit-request walk from both entry points:
 *
 *   - "Review filled form" (ready_for_final_approval) with the acknowledge answering 409;
 *   - "Approve packet and fill form" (resume_ready, the live 2026-08-20 shape) with the acknowledge
 *     answering the codeless current-state 409;
 *   - the same walk with the acknowledge accepted and submit-request answering 409;
 *   - the same walk succeeding end to end, so the refusal coverage cannot pass by breaking
 *     the path it guards.
 *
 * Codeless state conflicts still show the server's actionable sentence. Coded stale-packet
 * conflicts take a fresh audit and return to review without acknowledging or retrying the send.
 *
 * SAFETY: every backend request is stubbed. Nothing here can reach an employer.
 *
 * RUN IT WITH:  npm run build && npm run test:packet-flow-refusals
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

import { BACKEND_ORIGIN, RESUMES, SESSION_TOKEN, STUB, confirmedAuthorityFor, fixtureAuthority, fixturePacketId } from "./fixture-data.mjs";

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
let browser;
try {
  await waitForServer(ORIGIN, server);
  browser = await chromium.launch();
} catch (reason) {
  // test.after never registers when startup throws, and an orphaned `next start` keeps the
  // port bound for every run after this one.
  server.kill("SIGTERM");
  throw reason;
}
const ARTIFACT_DIR = path.join(process.cwd(), "test-results", "packet-flow-refusals");
let anyFailure = false;

test.after(async () => {
  if (anyFailure) process.stderr.write(`\npacket-flow-refusal artifacts written to ${ARTIFACT_DIR}\n`);
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
});

/* The two entry points into the audited flow. READY approves a filled form; FILL is the packet
   the live 2026-08-20 dead button was measured on, where the same primary control reads
   "Fill the application" and then "Approve packet and fill form". */
const READY = RESUMES.find((r) => r.spec?._review?.status === "ready_for_final_approval");
const FILL = RESUMES.find((r) => r.spec?._review?.status === "resume_ready");
assert.ok(READY, "the fixture must contain a ready_for_final_approval packet");
assert.ok(FILL, "the fixture must contain a resume_ready packet");

/* Digests of public/qa/exact-packet-fixture.pdf, same constants approve-resolves.spec.mjs proves
   the exact-PDF gate with. The audit fixture must bind the real bytes or the acknowledge control
   never renders and every case times out instead of measuring anything. */
const PACKET_DIGEST = "ddcdd437d12d91b9930134d2cc5eb15437bb4bbcfbf2c166b77a4cf8ad1ff89f";
const PACKET_SIZE_BYTES = 3256;
const PACKET_OBJECT_KEY = "qa/exact-packet-fixture.pdf";

function packetAuditResponse(packet) {
  const jd = packet.spec._review.jd_text;
  return {
    packet_audit: {
      version: "packet_audit_v2",
      status: "passed",
      complete: true,
      degraded: false,
      rejectedCount: 0,
      packet_version: PACKET_DIGEST,
      audit_digest: PACKET_DIGEST,
      bindings: {
        ownerSha256: PACKET_DIGEST,
        applicationId: packet.id,
        jdSha256: PACKET_DIGEST,
        specSha256: PACKET_DIGEST,
        jobContextSha256: PACKET_DIGEST,
        questionsSha256: PACKET_DIGEST,
        applicantSnapshotSha256: PACKET_DIGEST,
        resumeContactEmailSha256: PACKET_DIGEST,
        applicantEmailSha256: PACKET_DIGEST,
        pdf: { objectKey: PACKET_OBJECT_KEY, sha256: PACKET_DIGEST, sizeBytes: PACKET_SIZE_BYTES },
        employerDelivery: {
          version: "employer_delivery_v1",
          mode: "browser",
          sha256: PACKET_DIGEST,
        },
      },
      identities: {
        resume_email: "fixture@example.invalid",
        applicant_email: "fixture-route@apply.litos.invalid",
      },
      clauses: [{ text: jd, start: 0, end: jd.length, verdict: "missing", highlight_terms: [] }],
      editedTerms: [],
      terms: { covered: [], missing: [], edited: [] },
    },
    pdf: {
      object_key: PACKET_OBJECT_KEY,
      sha256: PACKET_DIGEST,
      size_bytes: PACKET_SIZE_BYTES,
      download_url: `${ORIGIN}/qa/exact-packet-fixture.pdf`,
    },
  };
}

/* The packet's own envelope travels with every submission response. Without it the dashboard
 * quarantines the packet and renders the needs-attention screen instead of the audited flow. */
function submissionFor(packet, auditResponse) {
  return {
    application_id: packet.id,
    submission_projection: packet.submission_projection,
    retry_safety: packet.retry_safety,
    submission_authority: packet.submission_authority,
    review: { ...packet.spec._review, packet_audit: auditResponse.packet_audit },
    cover_letter: null,
  };
}

const LANDED_CAPTURED_AT = "2026-08-20T12:00:00.000Z";
const LANDED_CONFIRMATION = "Thank you. Your application was received.";
const LANDED_FINAL_URL = "https://jobs.example.com/fixture/confirmation";

/* An accepted send must return authority, not just a "submitted" status. */
function landedResponse(submission, packet) {
  const { attemptId, envelope } = confirmedAuthorityFor(packet.id, `refusals-${packet.id}`, {
    confirmationText: LANDED_CONFIRMATION,
    finalUrl: LANDED_FINAL_URL,
    capturedAt: LANDED_CAPTURED_AT,
  });
  return {
    ...submission,
    ...envelope,
    review: {
      ...submission.review,
      status: "submitted",
      submitted_at: LANDED_CAPTURED_AT,
      submission_claim_id: attemptId,
      receipt: {
        confirmation_text: LANDED_CONFIRMATION,
        final_url: LANDED_FINAL_URL,
        captured_at: LANDED_CAPTURED_AT,
        reference_id: "FIXTURE-0002",
      },
    },
  };
}

/**
 * Walks a packet to the audited primary control, with the acknowledge and the submit-request
 * answered by the caller's choice of acceptance or refusal.
 *
 * @param packet               READY or FILL
 * @param ackResponse          null accepts ({acknowledged:true}); {status, body} refuses
 * @param submitResponse       null answers with a submitted review; {status, body} refuses
 * @param holdSubmitMs         keeps submit-request in flight so its status polling can be measured
 * @param revalidationRefusal  {status, body} answered by every packet-audit AFTER the
 *                             acknowledgement, which is exactly the poll's revalidation
 */
async function openAuditedFlow(packet, { ackResponse = null, submitResponse = null, holdSubmitMs = 0, revalidationRefusal = null, landed = null, generated = null, generateResponse = null, auditReplacementAfterSubmit = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const auditResponse = packetAuditResponse(packet);
  const submission = submissionFor(packet, auditResponse);
  const fixtureResumes = RESUMES.map((stored) => stored.id === packet.id ? packet : stored);
  /* `landed` overrides where the accepted send LANDS (both the submit response and every
     subsequent /submission poll answer), so a case can park the flow on a poll-active screen
     like the needs_attention portal instead of the terminal receipt. */
  const landedSubmission = landed ? { ...submission, review: { ...submission.review, ...landed } } : null;
  const counts = { ack: 0, submit: 0, approve: 0, submissionReads: 0, audits: 0, revalidations: 0, generate: 0, submitBodies: [], generateBodies: [] };
  const rebuildCanonicalId = "8b9b0722-7e23-4aa5-88ea-8877c11df17f";
  const rebuildCanonical = {
    id: rebuildCanonicalId,
    legacy_generated_resume_id: packet.id,
    job_id: packet.job_context.job_id ?? null,
    company: packet.job_context.company,
    role: packet.job_context.role,
    portal_url: packet.spec._review.portal_url,
    tracker_state: "saved",
    review_state: packet.spec._review.status,
    submission_state: packet.spec._review.status,
    created_at: packet.created_at,
    updated_at: packet.created_at,
  };
  let submitInFlight = false;
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
      await route.continue();
      return;
    }
    if (url.startsWith(BACKEND_ORIGIN)) {
      const p = new URL(url).pathname;
      const json = async (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      const replacementAvailable = generated && (counts.generate > 0 || counts.submit > 0);
      const historyResumes = replacementAvailable ? [generated, ...fixtureResumes] : fixtureResumes;
      if (p === "/resume/history") return json({ resumes: historyResumes });
      if (p === "/applications" && (generated || generateResponse)) {
        return json({ applications: [{ ...rebuildCanonical,
          legacy_generated_resume_id: replacementAvailable ? generated.id : packet.id }] });
      }
      /* The rebuild path reads the account's resume identity before it generates anything, and
         refuses without a personal email. The shared PROFILE fixture predates that read. */
      if (p === "/profile") return json({ ...STUB["/profile"], resume_email: "fixture@example.invalid" });
      /* Only the rebuild case needs a tailoring entitlement, so it is granted here rather than in
         the shared fixture: a Free account genuinely meets the upgrade modal on this button, and
         that is the correct product behaviour every other spec should keep measuring. */
      if (p === "/billing/state" && (generated || generateResponse)) {
        const base = STUB[p];
        return json({
          ...base,
          entitlement: { ...base.entitlement, features: { ...base.entitlement.features, ai_resume_tailoring: true } },
        });
      }
      if (p === "/resume/generate") {
        counts.generate += 1;
        counts.generateBodies.push(route.request().postDataJSON());
        if (generateResponse) return json(generateResponse.body, generateResponse.status);
        if (!generated) return json({ error: "no rebuild fixture" }, 500);
        return json({ resume_id: generated.id, application: generated, artifact_id: null,
          canonical_application_id: rebuildCanonicalId });
      }
      if (p === "/dashboard/bootstrap") return json({ ...STUB[p], resume_history: { resumes: historyResumes } });
      if (p.endsWith("/packet-audit/acknowledge")) {
        counts.ack += 1;
        if (ackResponse) return json(ackResponse.body, ackResponse.status);
        return json({ acknowledged: true });
      }
      if (p.endsWith("/packet-audit")) {
        counts.audits += 1;
        if (auditReplacementAfterSubmit && counts.submit > 0) {
          return json({
            error: "Litos rebuilt this packet from the current resume source.",
            code: "CURRENT_PACKET_REQUIRED",
            canonical_application_id: rebuildCanonicalId,
            packet_id: generated.id,
          }, 409);
        }
        if (revalidationRefusal && counts.ack > 0 && counts.revalidations === 0) {
          counts.revalidations += 1;
          return json(revalidationRefusal.body, revalidationRefusal.status);
        }
        return json(auditResponse);
      }
      if (p.endsWith("/submit-request")) {
        counts.submit += 1;
        counts.submitBodies.push(route.request().postDataJSON());
        submitInFlight = true;
        if (holdSubmitMs > 0) await delay(holdSubmitMs);
        submitInFlight = false;
        if (submitResponse) return json(submitResponse.body, submitResponse.status);
        if (landedSubmission) return json(landedSubmission);
        return json(landedResponse(submission, packet));
      }
      /* The rebuilt packet is its own application and must answer for itself. Serving the refused
         packet's envelope here would hand the new row another packet's status and land it on the
         portal screen. */
      if (generated && p === `/applications/${generated.id}/submission`) {
        counts.submissionReads += 1;
        return json({
          application_id: generated.id,
          submission_projection: generated.submission_projection,
          retry_safety: generated.retry_safety,
          submission_authority: generated.submission_authority,
          review: generated.spec._review,
          cover_letter: null,
        });
      }
      if (p.endsWith("/submission/approve")) counts.approve += 1;
      /* The review_edit save that precedes the audit on resume_ready packets. Echo the saved
         review; the flow only needs the envelope back. */
      if (p.endsWith("/review") && route.request().method() === "PUT") return json(submission);
      if (p.endsWith("/submission")) counts.submissionReads += 1;
      if (p.endsWith("/submission") && submitInFlight) {
        return json({ ...submission, review: { ...submission.review, status: "filling" } });
      }
      if (p.endsWith("/submission")) return json(counts.submit > 0 && landedSubmission ? landedSubmission : submission);
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

  const page = await context.newPage();
  await page.goto(`${ORIGIN}/dashboard/applications?application=${packet.id}&intent=apply`, { waitUntil: "domcontentloaded" });
  const prepared = packet.spec._review.status === "ready_for_final_approval";
  const firstLabel = prepared ? "Review and send" : "Fill the application";
  const first = page.getByRole("button", { name: firstLabel, exact: true });
  await first.waitFor({ state: "visible", timeout: 25_000 });
  await first.click();
  await page.getByText("Exact audited PDF loaded, 1 page.", { exact: true })
    .waitFor({ state: "visible", timeout: 25_000 });
  const secondLabel = prepared ? "Review filled form" : "Approve packet and fill form";
  const second = page.getByRole("button", { name: secondLabel, exact: true });
  await second.waitFor({ state: "visible", timeout: 25_000 });

  return { context, page, second, counts };
}

function browserTest(name, body) {
  test(name, async () => {
    /* The page must be in hand BEFORE the assertion that fails, or the failure capture below is
       dead code: a body that returns its page has, by definition, already passed every assertion.
       Each test hands its page over the moment the flow opens, via this holder. */
    let page;
    const hold = (opened) => { page = opened; };
    try {
      await body(hold);
    } catch (reason) {
      anyFailure = true;
      const slug = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await mkdir(ARTIFACT_DIR, { recursive: true }).catch(() => {});
      if (page) {
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${slug}.png`), fullPage: true }).catch(() => {});
        await writeFile(path.join(ARTIFACT_DIR, `${slug}.html`), await page.content()).catch(() => {});
      }
      throw reason;
    }
  });
}

/* The backend's own sentences, verbatim, from student-outreach-backend src/routes/applications.ts.
   The codeless one is what a claimed row answers, and the live 2026-08-20 shape. */
const ACK_CLAIMED = "This application cannot be acknowledged in its current state";
const ACK_STALE = "The rendered packet no longer matches the saved application. Reload it before continuing.";
const SUBMIT_STALE = "This application changed after you approved the exact packet Litos prepared, so it was not sent.";
const REVALIDATION_STALE = "The saved application changed while it was being audited. Reload it and audit again.";

browserTest("a complete optional answer on a prepared form can be edited and refilled", async (hold) => {
  const locationQuestion = {
    id: "location",
    kind: "required",
    required: false,
    question: "Where are you located?",
    answer: "Example City",
    answer_state: "answered",
    portal_input_type: "text",
  };
  const prepared = {
    ...READY,
    spec: {
      ...READY.spec,
      _review: { ...READY.spec._review, questions: [locationQuestion] },
    },
  };
  const { context, page, second, counts } = await openAuditedFlow(prepared, {
    landed: { status: "filling", preview_screenshot_url: undefined },
  });
  hold(page);
  await second.click();

  const edit = page.getByRole("button", { name: "Edit answers", exact: true });
  await edit.waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await page.getByRole("button", { name: "Fix an answer", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Check the answers", exact: true }).count(), 0);
  await edit.click();

  const answer = page.getByRole("textbox", { name: locationQuestion.question, exact: true });
  await answer.waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await answer.inputValue(), "Example City");
  await answer.fill("Example City, Example State, USA");
  await page.getByRole("button", { name: "Save and fill the form again", exact: true }).click();
  await page.getByRole("heading", { name: "Filling form", exact: true }).waitFor({ state: "visible", timeout: 15_000 });

  assert.equal(counts.submit, 1);
  assert.equal(counts.approve, 0, "editing must refill the form without sending it");
  assert.equal(counts.submitBodies[0].restart, true);
  assert.equal(counts.submitBodies[0].questions.find((question) => question.id === locationQuestion.id).answer, "Example City, Example State, USA");
  await context.close();
});

browserTest("a refused acknowledge on Approve packet and fill form says the server's sentence, and keeps saying it", async (hold) => {
  const { context, page, second, counts } = await openAuditedFlow(FILL, {
    ackResponse: { status: 409, body: { error: ACK_CLAIMED } },
  });
  hold(page);
  await second.click();
  await page.getByRole("alert").filter({ hasText: ACK_CLAIMED }).first().waitFor({ state: "visible", timeout: 15_000 });
  /* Three ticks of the 2.5s poll. The Cresta approve refusal survived under two and a half
     seconds, which for someone watching a button is the same as never. */
  await page.waitForTimeout(7000);
  assert.ok(
    (await page.locator("main").innerText()).includes(ACK_CLAIMED),
    "the acknowledge refusal was wiped before a person could read it",
  );
  assert.equal(counts.ack, 1);
  assert.equal(counts.submit, 0, "a refused acknowledgement must never be followed by a send");
  await context.close();
});

browserTest("a coded stale acknowledge refreshes an unacknowledged packet instead of showing the raw sentence", async (hold) => {
  const { context, page, second, counts } = await openAuditedFlow(READY, {
    ackResponse: { status: 409, body: { error: ACK_STALE, code: "PACKET_AUDIT_STALE" } },
  });
  hold(page);
  await second.click();
  await page.getByRole("status").filter({ hasText: "The current exact packet is ready" }).first().waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "Review filled form", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.getByRole("alert").filter({ hasText: ACK_STALE }).count(), 0);
  assert.equal(counts.ack, 1);
  assert.equal(counts.submit, 0);
  assert.ok(counts.audits >= 2, "the initial audit and fresh recovery audit must both run");
  await context.close();
});

browserTest("a coded stale submit-request refreshes review without auto-acknowledging or retrying", async (hold) => {
  const { context, page, second, counts } = await openAuditedFlow(FILL, {
    submitResponse: { status: 409, body: { error: SUBMIT_STALE, code: "PACKET_AUDIT_STALE" } },
  });
  hold(page);
  await second.click();
  await page.getByRole("status").filter({ hasText: "The current exact packet is ready" }).first().waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "Approve packet and fill form", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.getByRole("alert").filter({ hasText: SUBMIT_STALE }).count(), 0);
  assert.equal(counts.ack, 1);
  assert.equal(counts.submit, 1);
  assert.ok(counts.audits >= 2, "the refusal must take one fresh unacknowledged audit");
  await context.close();
});

browserTest("a slow submit-request polls status without re-auditing the packet", async (hold) => {
  const { context, page, second, counts } = await openAuditedFlow(FILL, {
    holdSubmitMs: 8000,
    landed: { status: "ready_for_final_approval", attention_reason: "The company form is ready for review." },
  });
  hold(page);
  const auditsBeforeSubmit = counts.audits;
  const readsBeforeSubmit = counts.submissionReads;
  await second.click();
  await page.getByRole("heading", { name: "Filling form", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  /* More than two 2.5s status ticks. GET /submission must keep running, but packet-audit is a
     mutating revalidation and must wait until the settled portal screen returns. */
  await page.waitForTimeout(6500);
  assert.equal(counts.submit, 1, "the delayed submit-request must still be the one active run");
  assert.ok(
    counts.submissionReads >= readsBeforeSubmit + 2,
    "the progress screen stopped polling submission status while submit-request was in flight",
  );
  assert.equal(
    counts.audits,
    auditsBeforeSubmit,
    "the progress poll re-audited and rewrote the packet while submit-request was still filling it",
  );

  await page.getByRole("button", { name: "Send application", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(3500);
  assert.ok(counts.audits > auditsBeforeSubmit, "the settled portal stopped refreshing its exact packet evidence");
  await context.close();
});

/* A polled revalidation has no button press to return to. A coded stale response now clears the old
   acknowledgement, takes a fresh audit, and routes to review with neutral status. The fresh packet
   must remain unacknowledged, and recovery must not replay either the acknowledgement or the send. */
browserTest("a coded stale packet revalidation returns to fresh review without repeating the send", async (hold) => {
  const { context, page, second, counts } = await openAuditedFlow(FILL, {
    landed: { status: "ready_for_final_approval", attention_reason: "The company form is ready for review." },
    revalidationRefusal: { status: 409, body: { error: REVALIDATION_STALE, code: "PACKET_AUDIT_STALE" } },
  });
  hold(page);
  await second.click();
  await page.getByRole("status").filter({ hasText: "The current exact packet is ready" }).first().waitFor({ state: "visible", timeout: 25_000 });
  await page.getByRole("button", { name: "Review filled form", exact: true }).waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.getByRole("alert").filter({ hasText: REVALIDATION_STALE }).count(), 0);
  assert.ok(counts.revalidations >= 1, "the poll never revalidated the acknowledged packet");
  assert.equal(counts.ack, 1, "recovery must not acknowledge the fresh audit");
  assert.equal(counts.submit, 1, "recovery must not retry the send");
  await context.close();
});

/* THE 2026-09-07 DEAD END. volley-backend PR #1058 put a pre-send resume verification in front of
   submit-request, and every packet this account tailored before that rule existed answers it. The
   dashboard showed the sentence, left "Approve packet and fill form" armed to re-fire the identical
   422, and offered no rebuild control on the review screen at all. */
const PRE_SEND_ERROR = "Verify the resume before sending. The current packet is not ready for submission.";
const PRE_SEND_ISSUE = "grounding: a <entry> metric is stored as a target, plan, or forecast but rendered as an achieved result";
/* features/applications/domain/pre-send-verification.ts, verbatim. Copy on screen, so it is pinned
   here rather than matched loosely: a reworded sentence must fail this, not pass it by substring. */

browserTest("a pre-send refusal repairs through audit and opens the exact replacement without tailoring", async (hold) => {
  /* The rebuilt packet needs its OWN unsent submission-authority envelope. Copying FILL's would
     bind another packet's identity to this id, and packetForSubmissionDisplay quarantines that on
     sight into the needs-attention screen - the review flow would never render. */
  const REBUILT_KEY = "presend-rebuild";
  const rebuilt = {
    ...FILL,
    ...fixtureAuthority(REBUILT_KEY, "resume_ready"),
    id: fixturePacketId(REBUILT_KEY),
    spec: { ...FILL.spec, _review: { ...FILL.spec._review, status: "resume_ready" } },
  };
  const { context, page, second, counts } = await openAuditedFlow(FILL, {
    submitResponse: {
      status: 422,
      body: { error: PRE_SEND_ERROR, code: "PRE_SEND_VERIFICATION_FAILED", issues: [PRE_SEND_ISSUE] },
    },
    generated: rebuilt,
    auditReplacementAfterSubmit: true,
  });
  hold(page);
  await second.click();

  const banner = page.getByRole("alert").filter({ hasText: PRE_SEND_ERROR }).first();
  await banner.waitFor({ state: "visible", timeout: 20_000 });
  /* The rule's own words about the entry it objected to. A refusal she cannot act on is worse than
     no refusal, and "verify the resume" alone does not say which line failed. */
  assert.ok((await banner.innerText()).includes(PRE_SEND_ISSUE), "the banner never named the offending entry");

  /* THE SEND IS WITHDRAWN, not merely captioned. Before this it stayed enabled and every press
     re-fired the same 422. */
  const send = page.getByRole("button", { name: "Approve packet and fill form", exact: true });
  await send.waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await send.isDisabled(), true, "the send stayed armed over a refusal it cannot clear");

  const rebuild = page.getByRole("button", { name: "Check for the updated resume", exact: true });
  await rebuild.waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await rebuild.isDisabled(), false);
  assert.equal(counts.submit, 1);

  await rebuild.click();
  await page.waitForFunction(
    (id) => window.location.search.includes(id),
    rebuilt.id,
    { timeout: 25_000 },
  );
  assert.equal(counts.generate, 0, "a system repair must not spend a tailoring credit");
  assert.equal(counts.submit, 1, "the rebuild must not send anything");
  /* The new packet's own review, with its own send available again. */
  await page.getByRole("button", { name: "Fill the application", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.getByRole("alert").filter({ hasText: PRE_SEND_ERROR }).count(), 0);
  await context.close();
});

browserTest("a submit-request replacement opens fresh review without retrying the send", async (hold) => {
  const replacementKey = "submit-replacement";
  const replacement = {
    ...FILL,
    ...fixtureAuthority(replacementKey, "resume_ready"),
    id: fixturePacketId(replacementKey),
    spec: { ...FILL.spec, _review: { ...FILL.spec._review, status: "resume_ready" } },
  };
  const canonicalApplicationId = "8b9b0722-7e23-4aa5-88ea-8877c11df17f";
  const { context, page, second, counts } = await openAuditedFlow(FILL, {
    submitResponse: {
      status: 409,
      body: {
        error: "Litos rebuilt this packet from the current resume source.",
        code: "GROUNDING_PACKET_REBUILT",
        canonical_application_id: canonicalApplicationId,
        packet_id: replacement.id,
      },
    },
    generated: replacement,
  });
  hold(page);
  await second.click();
  await page.getByRole("status").filter({ hasText: "Review the current PDF" }).first()
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction((id) => window.location.search.includes(id), replacement.id, { timeout: 20_000 });
  assert.equal(counts.submit, 1, "replacement recovery must not retry the submit request");
  assert.equal(counts.generate, 0, "replacement recovery must not call paid tailoring");
  await page.getByRole("button", { name: "Fill the application", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  await context.close();
});

browserTest("the accepted walk still fills and reports the receipt", async (hold) => {
  const { context, page, second, counts } = await openAuditedFlow(FILL);
  hold(page);
  await second.click();
  await page.getByText("Thank you. Your application was received.").waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(counts.ack, 1);
  assert.equal(counts.submit, 1);
  await context.close();
});
