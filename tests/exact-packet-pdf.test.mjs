import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("../components/app/ExactPacketPdf.tsx", import.meta.url);

test("the exact PDF viewer fetches, hashes, parses every page, and reports one audit binding", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /fetch\(downloadUrl, \{ credentials: "same-origin", signal: controller\.signal \}\)/);
  assert.match(source, /verifyPacketPdfBytes\(bytes, \{\s*sha256: binding\.sha256,\s*size_bytes: binding\.size_bytes,\s*\}\)/);
  assert.match(source, /import\("pdfjs-dist"\)/);
  assert.match(source, /loadingTask = pdfjs\.getDocument\(\{ data: renderSource\.bytes\.slice\(\) \}\);\s*documentProxy = await loadingTask\.promise/);
  assert.match(source, /documentProxy\.numPages < 1/);
  assert.match(source, /pageNumber <= documentProxy\.numPages/);
  assert.match(source, /await page\.render\(\{ canvas, viewport \}\)\.promise/);
  assert.match(source, /onVerifiedRef\.current\(\{[\s\S]{0,180}auditDigest,[\s\S]{0,180}sha256: renderSource\.sha256/);
});

test("a changed audit or parse or render failure revokes submission readiness", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /onVerifiedRef\.current\(null\);/);
  assert.match(source, /view\.key === verificationKey \? view : \{ key: verificationKey, state: "loading" \}/);
  assert.match(source, /\[auditDigest, binding\.sha256, binding\.size_bytes, downloadUrl, verificationKey\]/);
  assert.match(source, /documentProxy\.cleanup\(\)/);
  assert.match(source, /loadingTask\.destroy\(\)/);
  assert.match(source, /The exact PDF could not be parsed and rendered/);
});

test("header-shaped bytes are not accepted as a rendered PDF", async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const fake = new TextEncoder().encode("%PDF-1.7\nexact packet bytes\n%%EOF");
  await assert.rejects(pdfjs.getDocument({ data: fake }).promise, /Invalid PDF|InvalidPDFException/);
});
