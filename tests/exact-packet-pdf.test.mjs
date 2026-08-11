import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyPacketPdfBytes } from "../features/applications/domain/packet-pdf-verification.ts";

/* What this file used to be, and why it is not that any more.
 *
 * Every assertion here read components/app/ExactPacketPdf.tsx as text and matched regular
 * expressions against it: that `await page.render({ canvas, viewport }).promise` appears, that a
 * catch block appears, that a dependency array is spelled a particular way. All of them passed
 * while the viewer hung forever in production on 2026-08-11 and blocked every application the
 * product could send, because the defect was that the promise never settled and no regular
 * expression can observe a promise settling. The test was measuring that the code had been
 * written, not that it worked, and it also froze the component's exact formatting, so fixing the
 * defect would have failed the test that was supposed to protect it.
 *
 * What is left is behaviour. The fixture is parsed and drawn by the real PDF.js, and the digest
 * gate is exercised against real bytes. The viewer itself is driven in a browser by
 * tests/e2e/exact-packet-pdf.spec.mjs, which counts painted pixels.
 */

const FIXTURE_URL = new URL("../public/qa/exact-packet-fixture.pdf", import.meta.url);
const FIXTURE_SHA256 = "ddcdd437d12d91b9930134d2cc5eb15437bb4bbcfbf2c166b77a4cf8ad1ff89f";
const FIXTURE_SIZE_BYTES = 3256;

async function loadPdfjs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

test("the committed fixture is a PDF that really parses and really draws", async () => {
  const bytes = await readFile(FIXTURE_URL);

  /* The harness and the browser spec both hard-code these, so a regenerated fixture that nobody
     re-measured fails here rather than failing as an unexplained digest mismatch in a browser. */
  assert.equal(bytes.byteLength, FIXTURE_SIZE_BYTES);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), FIXTURE_SHA256);

  const pdfjs = await loadPdfjs();
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  assert.equal(document.numPages, 1);

  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  assert.equal(Math.ceil(viewport.width), 918);
  assert.equal(Math.ceil(viewport.height), 1188);

  /* The point of the whole file. A stub carrying a "%PDF-" header clears a byte check and then
     draws nothing, which is exactly the fake that satisfied an earlier test here. Ink is the only
     assertion that separates a real document from a plausible one. */
  const { createCanvas } = await import("canvas");
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let ink = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 200) ink += 1;
  assert.ok(ink > 10_000, `the fixture drew almost nothing, counted ${ink} ink pixels`);
});

test("header-shaped bytes are not accepted as a rendered PDF", async () => {
  const pdfjs = await loadPdfjs();
  const fake = new TextEncoder().encode("%PDF-1.7\nexact packet bytes\n%%EOF");
  await assert.rejects(pdfjs.getDocument({ data: fake }).promise, /Invalid PDF|InvalidPDFException/);
});

test("the digest gate accepts the exact audited bytes and refuses everything else", async () => {
  const bytes = await readFile(FIXTURE_URL);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  const accepted = await verifyPacketPdfBytes(buffer, { sha256: FIXTURE_SHA256, size_bytes: FIXTURE_SIZE_BYTES });
  assert.deepEqual(accepted, { ok: true, sha256: FIXTURE_SHA256, size_bytes: FIXTURE_SIZE_BYTES });

  /* Right length, wrong bytes: the size check alone would pass this, which is the case a digest
     exists to catch. */
  const tampered = new Uint8Array(buffer.slice(0));
  tampered[tampered.length - 12] ^= 0xff;
  assert.deepEqual(
    await verifyPacketPdfBytes(tampered.buffer, { sha256: FIXTURE_SHA256, size_bytes: FIXTURE_SIZE_BYTES }),
    { ok: false, reason: "digest_mismatch" },
  );

  assert.deepEqual(
    await verifyPacketPdfBytes(buffer, { sha256: FIXTURE_SHA256, size_bytes: FIXTURE_SIZE_BYTES - 1 }),
    { ok: false, reason: "size_mismatch" },
  );

  const notAPdf = new TextEncoder().encode("x".repeat(FIXTURE_SIZE_BYTES));
  assert.deepEqual(
    await verifyPacketPdfBytes(notAPdf.buffer, { sha256: FIXTURE_SHA256, size_bytes: FIXTURE_SIZE_BYTES }),
    { ok: false, reason: "invalid_pdf" },
  );

  assert.deepEqual(
    await verifyPacketPdfBytes(buffer, { sha256: "not-a-digest", size_bytes: FIXTURE_SIZE_BYTES }),
    { ok: false, reason: "invalid_binding" },
  );
});
