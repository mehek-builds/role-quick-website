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

for (const width of [1280, 320]) test(`human input remains inside the dashboard at ${width}px`, async () => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const packet = structuredClone(RESUMES.find(r => r.spec?._review?.status === "ready_for_final_approval"));
  assert.ok(packet);
  packet.spec._review = { ...packet.spec._review, status: "submitting", updated_at: new Date().toISOString(), questions: [] };
  const claim = "aaaaaaaa-1111-4111-8111-111111111111";
  const frameId = "bbbbbbbb-2222-4222-8222-222222222222";
  const commands = [], unexpected = [];
  let nextSequence = 1, lost = false, pending = false;
  const frame = () => ({ state: "waiting", attemptId: claim, frameId, revision: 1, nextSequence,
    pointerDown: false, inputPending: pending, width: 400, height: 300, expiresAt: Date.now() + 60000,
    capturedAt: Date.now(), image, mimeType: "image/jpeg" });
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
      commands.push(command);
      assert.equal(command.attemptId, claim);
      assert.equal(command.frameId, frameId);
      assert.equal(command.sequence, nextSequence);
      nextSequence++;
      if (lost) { lost = false; pending = true; return json({ error: "Synthetic lost acknowledgment" }, 500); }
      return json({ ok: true, nextSequence });
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
  try {
    await page.goto(`${origin}/dashboard/applications?application=${packet.id}&intent=apply`, { waitUntil: "domcontentloaded" });
    const panel = page.getByRole("region", { name: "Employer human verification" });
    await panel.waitFor({ state: "visible", timeout: 25000 });
    const img = panel.getByAltText("Live company human-verification challenge");
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.images].some(i => i.alt === "Live company human-verification challenge" && i.complete && i.naturalWidth > 0));
    await img.evaluate(i => i.scrollIntoView({ block: "center" }));
    await img.click({ trial: true, position: { x: 60, y: 60 } });
    const box = await img.boundingBox();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    for (let n = 0; n < 50 && !commands.some(c => c.phase === "up"); n++) await delay(100);
    assert.ok(commands.length, JSON.stringify({ box, errors, unexpected, diagnostic: await img.evaluate(i => {
      const r = i.getBoundingClientRect();
      return { complete: i.complete, naturalWidth: i.naturalWidth, rect: r.toJSON(),
        hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0,300),
        alerts: [...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent) };
    }) }));
    assert.equal(commands[0].phase, "down");
    assert.ok(Math.abs(commands[0].x - 100) < 2);
    assert.equal(commands.at(-1).phase, "up");
    assert.ok(Math.abs(commands.at(-1).x - 300) < 2);
    await panel.getByText("Keyboard controls", { exact: true }).click();
    await panel.getByRole("button", { name: "Enter challenge", exact: true }).click();
    for (let n = 0; n < 50 && commands.at(-1)?.type !== "focus"; n++) await delay(100);
    assert.equal(commands.at(-1).type, "focus");
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
    assert.equal(new URL(page.url()).origin, origin);
    assert.equal(context.pages().length, 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(unexpected, []);
    await mkdir("test-results/human-verification", { recursive: true });
    await panel.screenshot({ path: `test-results/human-verification/${width}.png` });
  } finally { await context.close(); }
});
