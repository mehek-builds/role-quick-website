import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatDocumentBytes } from "./document-size.ts";

test("a size reads the way the student's own file manager reads it", () => {
  assert.equal(formatDocumentBytes(842), "842 B");
  assert.equal(formatDocumentBytes(184_320), "184 KB");
  assert.equal(formatDocumentBytes(1_178_000), "1.2 MB");
});

test("the cap and the sizes are measured on the same scale", () => {
  /* The upload modal refuses anything over MAX_APPLICATION_DOCUMENT_BYTES and prints the limit in
     the same sentence as the file's size. On a binary scale a file one byte over the cap would read
     as "3.9 MB" beside a refusal saying the limit is 4 MB, which is a product calling a student
     wrong about arithmetic she can check.

     The constant is read out of the source rather than imported: lib/api.ts reaches for
     localStorage and the analytics client at module scope, so loading it under
     `node --experimental-strip-types` fails before a single assertion runs. */
  const api = readFileSync(fileURLToPath(new URL("./api.ts", import.meta.url)), "utf8");
  assert.match(api, /export const MAX_APPLICATION_DOCUMENT_BYTES = 4_000_000;/);

  assert.equal(formatDocumentBytes(4_000_000), "4.0 MB");
  assert.equal(formatDocumentBytes(4_600_000), "4.6 MB");
});
