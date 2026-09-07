// Real dashboard, synthetic live original attempt. No employer, CAPTCHA or backend
// receives requests. Exercises displayed image coordinates, human controls and no replay.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { BACKEND_ORIGIN, RESUMES, SESSION_TOKEN, STUB } from "./fixture-data.mjs";

const port = await new Promise(resolve => {
  const server = createServer();
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const origin = `http://127.0.0.1:${port}`;
const server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], { stdio: ["ignore", "ignore", "inherit"] });
for (let n = 0; n < 160; n++) {
  if (server.exitCode !== null) throw new Error("Local Next server exited");
  try { if ((await fetch(`${origin}/login`)).status < 500) break; } catch {}
  await delay(250);
}
const browser = await chromium.launch();
test.after(async () => { await browser.close(); server.kill("SIGTERM"); });
const image = (await sharp({ create: { width: 400, height: 300, channels: 3, background: "#eeeeee" } }).jpeg().toBuffer()).toString("base64");
const replacementImage = (await sharp({ create: { width: 400, height: 300, channels: 3, background: "#4477aa" } }).jpeg().toBuffer()).toString("base64");
const pointerAckDelay = Number(process.env.HUMAN_VERIFICATION_POINTER_ACK_DELAY_MS ?? 0);
const completionTimeout = Number(process.env.HUMAN_VERIFICATION_COMPLETION_TIMEOUT_MS ?? 15000);
assert.ok(Number.isFinite(pointerAckDelay) && pointerAckDelay >= 0, "pointer acknowledgment delay must be a non-negative number");
assert.ok(Number.isFinite(completionTimeout) && completionTimeout > 0, "completion timeout must be a positive number");

async function completesWithin(signal, timeout) {
  let timer;
  const elapsed = new Promise(resolve => { timer = setTimeout(() => resolve(false), timeout); });
  try { return await Promise.race([signal.then(() => true), elapsed]); }
  finally { clearTimeout(timer); }
}

async function stableBoundingBox(locator, timeout = 5000, stableFor = 300) {
  const deadline = Date.now() + timeout;
  let previous = null, stableSince = Date.now();
  while (Date.now() < deadline) {
    const current = await locator.boundingBox();
    assert.ok(current, "challenge image must have a bounding box");
    const changed = !previous || ["x", "y", "width", "height"].some(key => Math.abs(current[key] - previous[key]) > 0.25);
    if (changed) { previous = current; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= stableFor) return current;
    await delay(50);
  }
  assert.fail(`challenge image did not settle within ${timeout}ms: ${JSON.stringify(previous)}`);
}

for (const mode of ["lost acknowledgment", "stale frame replacement"])
for (const width of [1280, 320]) test(`human input handles ${mode} inside the dashboard at ${width}px`, async () => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const packet = structuredClone(RESUMES.find(r => r.spec?._review?.status === "ready_for_final_approval"));
  assert.ok(packet);
  packet.spec._review = { ...packet.spec._review, status: "submitting", updated_at: new Date().toISOString(), questions: [] };
  const claim = "aaaaaaaa-1111-4111-8111-111111111111";
  const frameId = "bbbbbbbb-2222-4222-8222-222222222222";
  const replacementFrameId = "cccccccc-3333-4333-8333-333333333333";
  const commands = [], commandTrace = [], unexpected = [];
  let nextSequence = 1, lost = false, pending = false, remotePointerDown = false;
  let activeFrameId = frameId, activeRevision = 1, activeImage = image;
  let resolvePointerUp, resolveFocus, resolveReplacementFocus;
  const pointerUpReceived = new Promise(resolve => { resolvePointerUp = resolve; });
  const focusReceived = new Promise(resolve => { resolveFocus = resolve; });
  const replacementFocusReceived = new Promise(resolve => { resolveReplacementFocus = resolve; });
  const frame = () => ({ state: "waiting", attemptId: claim, frameId: activeFrameId, revision: activeRevision, nextSequence,
    pointerDown: remotePointerDown, inputPending: pending, width: 400, height: 300, expiresAt: Date.now() + 60000,
    capturedAt: Date.now(), image: activeImage, mimeType: "image/jpeg" });
  const result = { application_id: packet.id, review: packet.spec._review,
    submission_projection: { state: "none" }, retry_safety: { kind: "no_evidence" },
    submission_authority: { schema_version: "submission-authority-v1", revision: "12", state: "none",
      application_id: packet.id, packet_id: packet.id, projection: { state: "none" }, retry_safety: { kind: "no_evidence" } } };
  await context.route("**/*", async route => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    if (!url.startsWith(BACKEND_ORIGIN)) {
      if (!new URL(url).hostname.endsWith('tiktok.com')) unexpected.push(url);
      return route.abort();
    }
    const p = new URL(url).pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === `/applications/${packet.id}/human-verification`) return json(frame());
    if (p === `/applications/${packet.id}/human-verification/input`) {
      const command = route.request().postDataJSON();
      const trace = { command, receivedAt: Date.now(), respondedAt: null, status: null };
      commands.push(command);
      commandTrace.push(trace);
      assert.equal(command.attemptId, claim);
      assert.equal(command.frameId, activeFrameId);
      assert.equal(command.revision, activeRevision);
      assert.equal(command.sequence, nextSequence);
      nextSequence++;
      if (command.type === "pointer" && command.phase === "down") remotePointerDown = true;
      if (command.type === "pointer" && command.phase === "up") remotePointerDown = false;
      if (command.type === "pointer" && command.phase === "up") resolvePointerUp();
      if (command.type === "focus" && command.frameId === frameId) resolveFocus();
      if (command.type === "focus" && command.frameId === replacementFrameId) resolveReplacementFocus();
      if (pointerAckDelay && command.type === "pointer") await delay(pointerAckDelay);
      if (lost) {
        lost = false;
        if (mode === "stale frame replacement") {
          activeFrameId = replacementFrameId;
          activeRevision = 2;
          activeImage = replacementImage;
          nextSequence = 41;
          remotePointerDown = false;
          pending = false;
          trace.status = 409;
          await json({ error: "Synthetic stale frame", code: "HUMAN_VERIFICATION_FRAME_STALE" }, 409);
        } else {
          pending = true;
          trace.status = 500;
          await json({ error: "Synthetic lost acknowledgment" }, 500);
        }
      } else {
        trace.status = 200;
        await json({ ok: true, nextSequence });
      }
      trace.respondedAt = Date.now();
      return;
    }
    if (route.request().method() !== "GET" && route.request().method() !== "OPTIONS") {
      unexpected.push(`${route.request().method()} ${p}`); return route.abort();
    }
    if (p.endsWith("/submission")) return json(result);
    if (p === "/resume/history") return json({ resumes: [packet] });
    if (p === "/dashboard/bootstrap") return json({ ...STUB[p], resume_history: { ...STUB[p].resume_history, resumes: [packet] } });
    return json(STUB[p] ?? {});
  });
  await context.addInitScript(token => {
    localStorage.setItem("rq_token", token);
    localStorage.setItem("rq_email", "fixture@example.invalid");
    localStorage.setItem("litos_session_mode_v1", "verified");
    localStorage.setItem("litos_has_history_v1", "true");
  }, SESSION_TOKEN);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__humanVerificationPointerTrace = [];
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "gotpointercapture", "lostpointercapture"]) {
      document.addEventListener(type, event => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement) || target.alt !== "Live company human-verification challenge") return;
        const rect = target.getBoundingClientRect();
        window.__humanVerificationPointerTrace.push({ type, at: performance.now(), pointerId: event.pointerId,
          button: event.button, buttons: event.buttons, clientX: event.clientX, clientY: event.clientY,
          scrollX, scrollY, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          hasPointerCapture: target.hasPointerCapture(event.pointerId) });
      }, true);
    }
  });
  try {
    await page.goto(`${origin}/dashboard/applications?application=${packet.id}&intent=apply`, { waitUntil: "domcontentloaded" });
    const panel = page.getByRole("region", { name: "Employer human verification" });
    await panel.waitFor({ state: "visible", timeout: 25000 });
    const img = panel.getByAltText("Live company human-verification challenge");
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.images].some(i => i.alt === "Live company human-verification challenge" && i.complete && i.naturalWidth > 0));
    await img.evaluate(i => i.scrollIntoView({ block: "center", behavior: "instant" }));
    await img.click({ trial: true, position: { x: 60, y: 60 } });
    const box = await stableBoundingBox(img);
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    const diagnostics = async () => ({ box, commands, commandTrace, errors, unexpected,
      pointerTrace: await page.evaluate(() => window.__humanVerificationPointerTrace),
      alerts: await panel.getByRole("alert").allTextContents(), image: await img.evaluate(i => {
      const r = i.getBoundingClientRect();
      return { complete: i.complete, naturalWidth: i.naturalWidth, rect: r.toJSON(),
        hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0,300),
        alerts: [...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent) };
    }) });
    if (!await completesWithin(pointerUpReceived, completionTimeout)) {
      assert.fail(`pointer queue did not send up within ${completionTimeout}ms: ${JSON.stringify(await diagnostics())}`);
    }
    const pointerCommands = commands.filter(command => command.type === "pointer");
    const pointerDiagnostic = JSON.stringify(await diagnostics());
    assert.ok(pointerCommands.length, pointerDiagnostic);
    assert.equal(pointerCommands[0].phase, "down", pointerDiagnostic);
    assert.ok(Math.abs(pointerCommands[0].x - 100) < 2, pointerDiagnostic);
    assert.ok(pointerCommands.slice(1, -1).every(command => command.phase === "move"), pointerDiagnostic);
    assert.equal(pointerCommands.at(-1).phase, "up", pointerDiagnostic);
    assert.ok(Math.abs(pointerCommands.at(-1).x - 300) < 2, pointerDiagnostic);
    assert.deepEqual(pointerCommands.map(command => command.sequence),
      pointerCommands.map((_, index) => index + 1), pointerDiagnostic);
    await panel.getByText("Keyboard controls", { exact: true }).click();
    await panel.getByRole("button", { name: "Enter challenge", exact: true }).click();
    if (!await completesWithin(focusReceived, completionTimeout)) {
      assert.fail(`pointer queue did not reach focus within ${completionTimeout}ms: ${JSON.stringify(await diagnostics())}`);
    }
    assert.equal(commands.at(-1).type, "focus", JSON.stringify(await diagnostics()));
    lost = true;
    await panel.getByRole("button", { name: "Next control", exact: true }).click();
    await panel.getByRole("alert").filter({ hasText: "last action could not be confirmed" }).waitFor();
    const count = commands.length;
    await delay(1000);
    assert.equal(commands.length, count, "no automatic input retry");
    pending = false;
    await panel.getByRole("button", { name: "Refresh verification view" }).click();
    await page.waitForFunction(() => !document.querySelector('[role="alert"]')?.textContent);
    assert.equal(commands.length, count, "refresh sends no human command");
    if (mode === "stale frame replacement") {
      await page.waitForFunction(expected => {
        const challenge = [...document.images].find(node => node.alt === "Live company human-verification challenge");
        return challenge?.complete && challenge.naturalWidth > 0 && challenge.src === `data:image/jpeg;base64,${expected}`;
      }, replacementImage);
      await panel.getByRole("button", { name: "Enter challenge", exact: true }).click();
      assert.equal(await completesWithin(replacementFocusReceived, completionTimeout), true,
        `replacement focus did not arrive: ${JSON.stringify(await diagnostics())}`);
      const replacementCommand = commands.at(-1);
      assert.equal(replacementCommand.frameId, replacementFrameId);
      assert.equal(replacementCommand.revision, 2);
      assert.equal(replacementCommand.sequence, 41);
    }
    assert.equal(new URL(page.url()).origin, origin);
    assert.equal(context.pages().length, 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(unexpected, []);
    await mkdir("test-results/human-verification", { recursive: true });
    await panel.screenshot({ path: `test-results/human-verification/${width}.png` });
  } finally { await context.close(); }
});
