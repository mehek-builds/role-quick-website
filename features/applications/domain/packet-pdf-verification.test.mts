import assert from "node:assert/strict";
import test from "node:test";

import { verifyPacketPdfBytes } from "./packet-pdf-verification.ts";

const bytes = new TextEncoder().encode("%PDF-1.7\nexact packet bytes\n%%EOF").buffer;
const sha256 = "0ebebfa80d9cd85bf28626e9558ffda0185ad715c17453a209a48c5cb2d39ef6";

test("accepts only the exact audited PDF bytes", async () => {
  assert.deepEqual(await verifyPacketPdfBytes(bytes, { sha256, size_bytes: bytes.byteLength }), {
    ok: true,
    sha256,
    size_bytes: bytes.byteLength,
  });
});

test("rejects a different PDF with the same size", async () => {
  const replacement = new TextEncoder().encode("%PDF-1.7\nother packet bytes\n%%EOF").buffer;
  assert.equal(replacement.byteLength, bytes.byteLength);
  assert.deepEqual(await verifyPacketPdfBytes(replacement, { sha256, size_bytes: bytes.byteLength }), {
    ok: false,
    reason: "digest_mismatch",
  });
});

test("rejects a truncated PDF before hashing it", async () => {
  assert.deepEqual(await verifyPacketPdfBytes(bytes.slice(0, 4), { sha256, size_bytes: bytes.byteLength }), {
    ok: false,
    reason: "size_mismatch",
  });
});

test("rejects malformed server bindings", async () => {
  assert.deepEqual(await verifyPacketPdfBytes(bytes, { sha256: "not-a-digest", size_bytes: bytes.byteLength }), {
    ok: false,
    reason: "invalid_binding",
  });
  assert.deepEqual(await verifyPacketPdfBytes(bytes, { sha256, size_bytes: 0 }), {
    ok: false,
    reason: "invalid_binding",
  });
});

test("rejects exact non-PDF bytes even if their binding matches", async () => {
  const nonPdf = new TextEncoder().encode("plain text").buffer;
  const digest = "a116c9ed46d6207734a43317d30fd88f52ac8634c9ac06e8b588afef3a5f5cd7";
  assert.deepEqual(await verifyPacketPdfBytes(nonPdf, { sha256: digest, size_bytes: nonPdf.byteLength }), {
    ok: false,
    reason: "invalid_pdf",
  });
});
