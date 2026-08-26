import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { safeEvidenceImageUrl } from "./evidence-image.ts";

test("accepts only the two controlled same-origin QA fixtures", () => {
  for (const path of [
    "/qa/portal-preview.svg",
    "/qa/portal-receipt.svg",
  ]) assert.equal(safeEvidenceImageUrl(path), path);

  for (const path of [
    "/qa/portal-preview.svg?employer=https://jobs.example",
    "/qa/portal-receipt.svg#receipt",
    "/qa/other.svg",
    "//blob.vercel-storage.com/evidence.png",
    "qa/portal-preview.svg",
  ]) assert.equal(safeEvidenceImageUrl(path), null, path);
});

test("accepts canonical PNG, JPEG, and WebP base64 data images with matching signatures", () => {
  const accepted = [
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/jpeg;base64,/9j/2Q==",
    "data:image/webp;base64,UklGRgAAAABXRUJQ",
  ];

  for (const value of accepted) assert.equal(safeEvidenceImageUrl(value), value);
});

test("rejects active, mismatched, malformed, or noncanonical data payloads", () => {
  for (const value of [
    "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "data:image/png,not-base64",
    "data:image/png;base64,/9j/2Q==",
    "data:image/jpeg;base64,iVBORw0KGgo=",
    "data:image/webp;base64,iVBORw0KGgo=",
    "data:image/png;base64,iVBORw0KGgo",
    "data:image/png;base64,iVBORw0KGgo===",
    "data:image/png;base64,iVBORw0KGgp=",
    "data:image/PNG;base64,iVBORw0KGgo=",
    "data:image/png;BASE64,iVBORw0KGgo=",
    "data:image/png;base64, iVBORw0KGgo=",
    "data:image/png;base64,",
  ]) assert.equal(safeEvidenceImageUrl(value), null, value);
});

test("accepts only HTTPS image paths on exact Vercel Blob hosts", () => {
  const accepted = [
    "https://blob.vercel-storage.com/evidence/receipt.png",
    "https://store.public.blob.vercel-storage.com/runs/preview.JPEG",
    "https://a-b.blob.vercel-storage.com/evidence/image.webp",
  ];

  for (const value of accepted) assert.equal(safeEvidenceImageUrl(value), value);
});

test("rejects employer, lookalike, credentialed, ported, and decorated URLs", () => {
  for (const value of [
    "https://employer.example/evidence.png",
    "https://blob.vercel-storage.com.evil.example/evidence.png",
    "https://evilblob.vercel-storage.com/evidence.png",
    "https://blob.vercel-storage.com@employer.example/evidence.png",
    "https://user:secret@blob.vercel-storage.com/evidence.png",
    "https://blob.vercel-storage.com:443/evidence.png",
    "https://blob.vercel-storage.com:8443/evidence.png",
    "http://blob.vercel-storage.com/evidence.png",
    "https://blob.vercel-storage.com/evidence.svg",
    "https://blob.vercel-storage.com/evidence.pdf",
    "https://blob.vercel-storage.com/evidence.png?download=1",
    "https://blob.vercel-storage.com/evidence.png#employer",
    "https://-bad.blob.vercel-storage.com/evidence.png",
    "https://bad-.blob.vercel-storage.com/evidence.png",
    " https://blob.vercel-storage.com/evidence.png",
    "https://blob.vercel-storage.com/evidence image.png",
    "javascript:alert(1)",
    "not a URL",
  ]) assert.equal(safeEvidenceImageUrl(value), null, value);

  assert.equal(safeEvidenceImageUrl(null), null);
  assert.equal(safeEvidenceImageUrl({}), null);
});

test("both packet viewers sanitize every passive screenshot before an img can render", () => {
  const page = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
  const packet = readFileSync(new URL("../components/app/ApplicationPacket.tsx", import.meta.url), "utf8");
  assert.match(page, /safeEvidenceImageUrl\(review\.preview_screenshot_url\)/);
  assert.match(page, /safeEvidenceImageUrl\(submission\?\.review\.progress_screenshot_url\)/);
  assert.match(page, /safeEvidenceImageUrl\(receipt\?\.screenshot_url\)/);
  assert.doesNotMatch(page, /<img[^>]*src=\{(?:review\.preview_screenshot_url|submission\?\.review\.progress_screenshot_url|receipt\.screenshot_url)\}/);
  assert.match(packet, /const receiptScreenshotUrl = safeEvidenceImageUrl\(receipt\?\.screenshot_url\)/);
  assert.match(packet, /receiptScreenshotUrl && \([\s\S]{0,500}src=\{receiptScreenshotUrl\}/);
  assert.doesNotMatch(packet, /src=\{receipt\.screenshot_url\}/);
});
