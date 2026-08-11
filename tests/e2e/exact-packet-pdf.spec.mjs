/**
 * Browser coverage for the send gate's exact PDF viewer.
 *
 * This viewer decides whether Litos is allowed to fill any employer form. On 2026-08-11 it hung
 * forever in production: the audit passed, the PDF downloaded and hashed clean, PDF.js parsed it
 * and sized a canvas at 918 x 1188, and then the render never finished. No error, no timeout, no
 * console output, over ninety seconds, and every application was blocked behind it.
 *
 * The viewer was covered at the time, by a file that read its own source and matched regular
 * expressions against it. Those assertions were green for the entire life of that defect, because
 * a regular expression can confirm that `await page.render(...).promise` is written down and can
 * never confirm that the promise settles. So this suite renders instead: real bytes, a real digest
 * check, a real parse, and painted pixels counted off the canvas.
 *
 * The suite runs the production Next build against a committed fixture PDF. No account, no
 * backend, no credential, and the only network the page makes is for the fixture and the worker.
 * Run with: npm run build -- --webpack && npm run test:exact-packet-pdf
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

/* Shaped to satisfy lib/qa-gate.ts SECRET_SHAPE. Fabricated, and only ever reaches this local
   server, which is started and killed by this file. */
const QA_SECRET = "exact-packet-pdf-spec-secret-0123456789";

const FIXTURE_SHA256 = "ddcdd437d12d91b9930134d2cc5eb15437bb4bbcfbf2c166b77a4cf8ad1ff89f";

/* Short, so a stalled render is proven inside a test rather than inside the production deadline. */
const TIMEOUT_MS = 2_000;

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

const port = await freePort();
const ORIGIN = `http://127.0.0.1:${port}`;
const server = spawn("node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, LITOS_QA_PORTAL_SECRET: QA_SECRET },
});

for (let attempt = 0; attempt < 160; attempt += 1) {
  if (server.exitCode !== null) throw new Error(`next start exited with ${server.exitCode}`);
  try {
    const response = await fetch(`${ORIGIN}/login`);
    if (response.status < 500) break;
  } catch {
    // Still starting.
  }
  await delay(250);
}

const browser = await chromium.launch();

test.after(async () => {
  await browser.close();
  server.kill("SIGTERM");
});

function harnessUrl(query = {}) {
  const params = new URLSearchParams({ litos_qa_key: QA_SECRET, timeout: String(TIMEOUT_MS), ...query });
  return `${ORIGIN}/qa/exact-packet-pdf?${params}`;
}

/* Swallows the operator list request inside the worker. PDF.js resolves the document and the page
   from messages that still answer, sizes the canvas, and then waits on a stream that never
   arrives: `PDFPageProxy.render` gates painting behind `displayReadyCapability`, which nothing
   ever rejects. That is the production signature reproduced exactly. */
const STALLING_WORKER = `
const origAdd = self.addEventListener.bind(self);
self.addEventListener = (type, listener, opts) => {
  if (type === "message") {
    origAdd(type, (event) => {
      const message = event && event.data;
      if (message && message.action === "GetOperatorList") return;
      return listener(event);
    }, opts);
    return;
  }
  origAdd(type, listener, opts);
};
await import("/vendor/pdf.worker.min.mjs?passthrough=1");
`;

async function stallTheRender(page) {
  await page.route("**/vendor/pdf.worker.min.mjs**", async (route) => {
    if (route.request().url().includes("passthrough=1")) return route.continue();
    await route.fulfill({ status: 200, contentType: "text/javascript", body: STALLING_WORKER });
  });
}

/** Ink actually painted onto the page canvas. Zero means PDF.js sized it and never drew. */
async function inkPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    const pixels = canvas.getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] !== 0 && (pixels[i] < 200 || pixels[i + 1] < 200 || pixels[i + 2] < 200)) ink += 1;
    }
    return ink;
  });
}

const gateState = (page) => page.getByTestId("gate-state");

/* Scoped to the harness, because Next renders its own empty `role="alert"` route announcer into a
   shadow root. Playwright pierces shadow DOM, so an unscoped getByRole("alert") matches that
   announcer, resolves instantly and reads as empty text. One case in this file passed against it
   before the scope was added, which would have made it green with the defect still in place. */
const failureAlert = (page) => page.locator("main").getByRole("alert");

test("a real audited PDF renders and the send gate reports ready", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(harnessUrl());
    await gateState(page).filter({ hasText: "ready" }).waitFor({ timeout: 20_000 });

    assert.equal(await page.getByTestId("gate-sha256").textContent(), FIXTURE_SHA256);
    await page.getByText("Exact audited PDF loaded, 1 page.").waitFor({ timeout: 5_000 });

    const canvas = page.locator("canvas");
    assert.equal(await canvas.count(), 1, "expected exactly one page canvas");
    const box = await canvas.evaluate((node) => `${node.width}x${node.height}`);
    assert.equal(box, "918x1188", "the canvas is not the audited page at the expected scale");

    /* The assertion the source-reading tests could never make: the bytes were actually drawn. */
    const ink = await inkPixels(page);
    assert.ok(ink > 10_000, `expected the audited page to be painted, counted ${ink} ink pixels`);
  } finally {
    await page.close();
  }
});

test("a render that never finishes becomes a visible error, not an endless loading state", async () => {
  const page = await browser.newPage();
  try {
    await stallTheRender(page);
    await page.goto(harnessUrl());

    /* It has to get far enough to be the real hang: parsed, sized, and waiting to paint. */
    await page.locator("canvas").waitFor({ timeout: 20_000 });
    assert.equal(await inkPixels(page), 0, "the stall did not reproduce, the canvas was painted");

    const alert = failureAlert(page);
    await alert.waitFor({ timeout: TIMEOUT_MS * 8 });
    assert.match(await alert.textContent(), /could not finish showing the exact audited PDF in time/);

    /* A stalled render must never be read as a pass. */
    assert.equal(await gateState(page).textContent(), "blocked");
    assert.ok(Number(await page.getByTestId("gate-revocations").textContent()) > 0);
    await page.getByText("Litos will not fill any form until the exact audited PDF is shown here.")
      .waitFor({ timeout: 5_000 });
  } finally {
    await page.close();
  }
});

test("the gate stays blocked for as long as the render keeps stalling", async () => {
  const page = await browser.newPage();
  try {
    await stallTheRender(page);
    await page.goto(harnessUrl());
    await failureAlert(page).waitFor({ timeout: TIMEOUT_MS * 8 });

    /* The defect was an indefinite wait, so the fix is worth nothing if it merely moves the
       moment at which the gate silently flips to ready. */
    await delay(TIMEOUT_MS * 3);
    assert.equal(await gateState(page).textContent(), "blocked");
    assert.equal(await page.getByTestId("gate-sha256").textContent(), "");
  } finally {
    await page.close();
  }
});

test("retrying after a stalled render reaches ready once the render can finish", async () => {
  const page = await browser.newPage();
  try {
    await stallTheRender(page);
    await page.goto(harnessUrl());
    await failureAlert(page).waitFor({ timeout: TIMEOUT_MS * 8 });
    assert.equal(await gateState(page).textContent(), "blocked");

    await page.unroute("**/vendor/pdf.worker.min.mjs**");
    await page.getByRole("button", { name: "Try showing it again" }).click();

    await gateState(page).filter({ hasText: "ready" }).waitFor({ timeout: 20_000 });
    assert.equal(await page.getByTestId("gate-sha256").textContent(), FIXTURE_SHA256);
    assert.ok(await inkPixels(page) > 10_000, "the retried render did not paint the page");
  } finally {
    await page.close();
  }
});

test("bytes that do not match the audit are refused and offer no retry", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(harnessUrl({ sha256: "0".repeat(64) }));

    const alert = failureAlert(page);
    await alert.waitFor({ timeout: 20_000 });
    assert.match(await alert.textContent(), /does not match the audited packet/);
    assert.equal(await gateState(page).textContent(), "blocked");

    /* Retrying the same mismatched bytes would only fail again, so the way forward offered is to
       audit the packet, not to press a button that cannot change the answer. */
    assert.equal(await page.getByRole("button", { name: "Try showing it again" }).count(), 0);
  } finally {
    await page.close();
  }
});

/**
 * The case that was actually happening in production.
 *
 * PDF.js drives its paint loop through window.requestAnimationFrame for the default "display"
 * intent, so a tab that is not producing frames, which is any backgrounded, occluded or
 * automation-driven tab, sizes the canvas, fills it white in a microtask and then stops. The
 * captured production packet reproduces it exactly this way: 918 x 1188 backing, 1,090,584 white
 * pixels, zero ink, no error and no console output, for as long as anyone cares to wait.
 *
 * Stubbing requestAnimationFrame to never fire is not a contrived condition. It is what the
 * browser does to a tab it is not painting, and it is the difference between this gate working
 * and this gate timing out on every packet.
 */
test("the page still renders when the tab is never painting a frame", async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      window.requestAnimationFrame = () => 0;
      window.cancelAnimationFrame = () => {};
    });
    await page.goto(harnessUrl());

    await gateState(page).filter({ hasText: "ready" }).waitFor({ timeout: 20_000 });
    assert.equal(await page.getByTestId("gate-sha256").textContent(), FIXTURE_SHA256);
    assert.ok(await inkPixels(page) > 10_000, "the page was not painted without animation frames");
  } finally {
    await page.close();
  }
});

/**
 * A valid PDF that draws nothing must not pass.
 *
 * The gate's promise settling is not evidence. A document whose content stream paints no marks
 * parses, renders and resolves perfectly happily, and without an ink check the student is told
 * their resume is verified while looking at a blank sheet. This fixture is a real PDF with a real
 * cross reference table and a real, deliberately empty content stream, built here so its emptiness
 * is readable rather than hidden in a committed binary.
 */
function blankPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startxref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

test("a valid PDF that paints nothing is refused instead of passing the gate", async () => {
  const page = await browser.newPage();
  const blank = blankPdf();
  try {
    await page.route("**/qa/exact-packet-fixture.pdf", (route) =>
      route.fulfill({ status: 200, contentType: "application/pdf", body: blank }));
    await page.goto(harnessUrl({
      sha256: createHash("sha256").update(blank).digest("hex"),
      size: String(blank.byteLength),
    }));

    const alert = failureAlert(page);
    await alert.waitFor({ timeout: 20_000 });
    /* This exact message is the discriminator. It is only reachable when PDF.js parsed the
       document and the render promise resolved, which is what separates a blank page from a
       document that failed to parse. */
    assert.match(await alert.textContent(), /drew a blank page/);
    assert.equal(await gateState(page).textContent(), "blocked");
    assert.equal(await page.getByTestId("gate-sha256").textContent(), "");
    assert.equal(await page.getByRole("button", { name: "Try showing it again" }).count(), 0);
  } finally {
    await page.close();
  }
});
