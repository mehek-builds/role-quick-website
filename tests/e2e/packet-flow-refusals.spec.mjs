/**
 * A DEAD BUTTON WITH NO CONSOLE ERROR IS A SWALLOWED 409 IN THE NETWORK TAB.
 *
 * Measured live three times now, most recently 2026-08-20 on the Applications tracker: pressing
 * "Fill company form" fired POST /applications/:id/packet-audit/acknowledge, the server answered
 * 409 with an authored sentence written for the applicant, and the person watching the button saw
 * nothing change. The backend writes those sentences on purpose (applications.ts answers the
 * acknowledge with "This application cannot be acknowledged in its current state" when a run has
 * claimed the row, and PACKET_AUDIT_STALE with its own sentence when the digests moved); a client
 * that drops them turns a stated refusal into a dead control.
 *
 * These cases pin the whole audit -> acknowledge -> submit-request walk from both entry points:
 *
 *   - "Review filled form" (ready_for_final_approval) with the acknowledge answering 409;
 *   - "Fill company form" (resume_ready, the live 2026-08-20 shape) with the acknowledge
 *     answering the codeless current-state 409;
 *   - the same walk with the acknowledge accepted and submit-request answering 409;
 *   - the same walk succeeding end to end, so the refusal coverage cannot pass by breaking
 *     the path it guards.
 *
 * Every refusal assertion demands the SERVER'S OWN SENTENCE inside the page's one error banner
 * (role=alert), not a generic failure, and re-reads it seconds later because the Cresta finding
 * (approve-resolves.spec.mjs) showed a poll can wipe a banner faster than a person reads it.
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
const ARTIFACT_DIR = path.join(process.cwd(), "test-results", "packet-flow-refusals");
let anyFailure = false;

test.after(async () => {
  if (anyFailure) process.stderr.write(`\npacket-flow-refusal artifacts written to ${ARTIFACT_DIR}\n`);
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
});

/* The two entry points into the audited flow. READY approves a filled form; FILL is the packet
   the live 2026-08-20 dead button was measured on, where the same primary control reads
   "Review and fill" and then "Fill company form". */
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
      version: "packet_audit_v1",
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

function submissionFor(packet, auditResponse) {
  return {
    application_id: packet.id,
    review: { ...packet.spec._review, packet_audit: auditResponse.packet_audit },
    cover_letter: null,
  };
}

/**
 * Walks a packet to the audited primary control, with the acknowledge and the submit-request
 * answered by the caller's choice of acceptance or refusal.
 *
 * @param packet               READY or FILL
 * @param ackResponse          null accepts ({acknowledged:true}); {status, body} refuses
 * @param submitResponse       null answers with a submitted review; {status, body} refuses
 * @param revalidationRefusal  {status, body} answered by every packet-audit AFTER the
 *                             acknowledgement, which is exactly the poll's revalidation
 */
async function openAuditedFlow(packet, { ackResponse = null, submitResponse = null, revalidationRefusal = null, landed = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const auditResponse = packetAuditResponse(packet);
  const submission = submissionFor(packet, auditResponse);
  /* `landed` overrides where the accepted send LANDS (both the submit response and every
     subsequent /submission poll answer), so a case can park the flow on a poll-active screen
     like the needs_attention portal instead of the terminal receipt. */
  const landedSubmission = landed ? { ...submission, review: { ...submission.review, ...landed } } : null;
  const counts = { ack: 0, submit: 0, revalidations: 0 };
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank") {
      await route.continue();
      return;
    }
    if (url.startsWith(BACKEND_ORIGIN)) {
      const p = new URL(url).pathname;
      const json = async (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (p.endsWith("/packet-audit/acknowledge")) {
        counts.ack += 1;
        if (ackResponse) return json(ackResponse.body, ackResponse.status);
        return json({ acknowledged: true });
      }
      if (p.endsWith("/packet-audit")) {
        if (revalidationRefusal && counts.ack > 0) {
          counts.revalidations += 1;
          return json(revalidationRefusal.body, revalidationRefusal.status);
        }
        return json(auditResponse);
      }
      if (p.endsWith("/submit-request")) {
        counts.submit += 1;
        if (submitResponse) return json(submitResponse.body, submitResponse.status);
        if (landedSubmission) return json(landedSubmission);
        return json({
          ...submission,
          review: {
            ...submission.review,
            status: "submitted",
            submitted_at: "2026-08-20T12:00:00.000Z",
            receipt: {
              confirmation_text: "Thank you. Your application was received.",
              final_url: "https://jobs.example.com/fixture/confirmation",
              captured_at: "2026-08-20T12:00:00.000Z",
              reference_id: "FIXTURE-0002",
            },
          },
        });
      }
      /* The review_edit save that precedes the audit on resume_ready packets. Echo the saved
         review; the flow only needs the envelope back. */
      if (p.endsWith("/review") && route.request().method() === "PUT") return json(submission);
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
  const firstLabel = packet === READY ? "Review and send" : "Review and fill";
  const first = page.getByRole("button", { name: firstLabel, exact: true });
  await first.waitFor({ state: "visible", timeout: 25_000 });
  await first.click();
  await page.getByText("Exact audited PDF loaded, 1 page.", { exact: true })
    .waitFor({ state: "visible", timeout: 25_000 });
  const secondLabel = packet === READY ? "Review filled form" : "Fill company form";
  const second = page.getByRole("button", { name: secondLabel, exact: true });
  await second.waitFor({ state: "visible", timeout: 25_000 });

  return { context, page, second, counts };
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

browserTest("a refused acknowledge on Fill company form says the server's sentence, and keeps saying it", async () => {
  const { context, page, second, counts } = await openAuditedFlow(FILL, {
    ackResponse: { status: 409, body: { error: ACK_CLAIMED } },
  });
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
  return page;
});

browserTest("a refused acknowledge on Review filled form says the server's sentence", async () => {
  const { context, page, second, counts } = await openAuditedFlow(READY, {
    ackResponse: { status: 409, body: { error: ACK_STALE, code: "PACKET_AUDIT_STALE" } },
  });
  await second.click();
  await page.getByRole("alert").filter({ hasText: ACK_STALE }).first().waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(counts.ack, 1);
  assert.equal(counts.submit, 0);
  await context.close();
  return page;
});

browserTest("a refused submit-request after an accepted acknowledge says the server's sentence", async () => {
  const { context, page, second, counts } = await openAuditedFlow(FILL, {
    submitResponse: { status: 409, body: { error: SUBMIT_STALE, code: "PACKET_AUDIT_STALE" } },
  });
  await second.click();
  await page.getByRole("alert").filter({ hasText: SUBMIT_STALE }).first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(7000);
  assert.ok(
    (await page.locator("main").innerText()).includes(SUBMIT_STALE),
    "the submit refusal was wiped before a person could read it",
  );
  assert.equal(counts.ack, 1);
  assert.equal(counts.submit, 1);
  await context.close();
  return page;
});

/* The polled revalidation, which was the one member of this class with NO catch that spoke. After
   an accepted acknowledgement the 2.5s poll re-audits the exact packet, and a refusal there used
   to clear the acknowledged evidence and say nothing: the send gate closed and the controls
   changed shape with no words anywhere on screen. The sentence must appear AND survive later
   ticks, because the refusal destroys the very evidence whose revalidation raised it, so the next
   tick reports a clean poll and the old unconditional banner-clear blanked it within one round. */
browserTest("a refused packet revalidation says the server's sentence, and later ticks do not blank it", async () => {
  const { context, page, second, counts } = await openAuditedFlow(FILL, {
    landed: { status: "needs_attention", attention_reason: "The company's form asked for something new." },
    revalidationRefusal: { status: 409, body: { error: REVALIDATION_STALE, code: "PACKET_AUDIT_STALE" } },
  });
  await second.click();
  await page.getByRole("alert").filter({ hasText: REVALIDATION_STALE }).first().waitFor({ state: "visible", timeout: 20_000 });
  /* Two more poll rounds, each of which has no acknowledged evidence left to revalidate and
     would have cleared the banner before this fix. */
  await page.waitForTimeout(6000);
  assert.ok(
    (await page.locator("main").innerText()).includes(REVALIDATION_STALE),
    "the revalidation refusal was blanked by a later clean poll tick",
  );
  assert.ok(counts.revalidations >= 1, "the poll never revalidated the acknowledged packet");
  await context.close();
  return page;
});

browserTest("the accepted walk still fills and reports the receipt", async () => {
  const { context, page, second, counts } = await openAuditedFlow(FILL);
  await second.click();
  await page.getByText("Thank you. Your application was received.").waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(counts.ack, 1);
  assert.equal(counts.submit, 1);
  await context.close();
  return page;
});
