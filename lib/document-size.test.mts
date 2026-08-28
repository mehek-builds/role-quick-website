import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL,
  MAX_APPLICATION_DOCUMENT_BYTES,
  formatDocumentBytes,
  validateApplicationDocument,
  type ApplicationDocumentAccept,
} from "./document-size.ts";

const PDF = { name: "resume.pdf", type: "application/pdf" };

test("the prose label is the enforced cap, written the way the copy writes it", () => {
  assert.equal(APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL, `${Math.floor(MAX_APPLICATION_DOCUMENT_BYTES / 1_000_000)} MB`);
});

test("formatDocumentBytes reports decimal units at every scale", () => {
  assert.equal(formatDocumentBytes(999), "999 B");
  assert.equal(formatDocumentBytes(1_000), "1 KB");
  assert.equal(formatDocumentBytes(999_499), "999 KB");
  assert.equal(formatDocumentBytes(1_200_000), "1.2 MB");
  assert.equal(formatDocumentBytes(4_100_000), "4.1 MB");
});

test("a file at the cap passes and a file one byte over is refused", () => {
  assert.equal(
    validateApplicationDocument({ ...PDF, size: MAX_APPLICATION_DOCUMENT_BYTES }, { accept: "pdf", typeMessage: "Choose one PDF file." }),
    null,
  );
  const refusal = validateApplicationDocument(
    { ...PDF, size: MAX_APPLICATION_DOCUMENT_BYTES + 1 },
    { accept: "pdf", typeMessage: "Choose one PDF file." },
  );
  assert.notEqual(refusal, null);
  assert.match(refusal ?? "", new RegExp(`over the ${APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL} limit`));
});

test("the boundary band never contradicts the stated limit", () => {
  /* 4,000,001 through 4,049,999 bytes format as "4.0 MB". "That file is 4.0 MB and the limit is
     4 MB" reads as a refusal of an allowed file, so the sentence must drop the rounded size and
     say "just over" instead. */
  for (const size of [MAX_APPLICATION_DOCUMENT_BYTES + 1, 4_049_999]) {
    const refusal = validateApplicationDocument({ ...PDF, size }, { accept: "pdf", typeMessage: "x" }) ?? "";
    assert.match(refusal, /just over the 4 MB limit/);
    assert.doesNotMatch(refusal, /That file is 4\.0 MB/);
  }
  const clearlyOver = validateApplicationDocument({ ...PDF, size: 4_100_000 }, { accept: "pdf", typeMessage: "x" }) ?? "";
  assert.match(clearlyOver, /That file is 4\.1 MB, over the 4 MB limit\./);
});

test("the oversize hint follows the shared sentence", () => {
  const refusal = validateApplicationDocument(
    { ...PDF, size: 6_000_000 },
    { accept: "pdf", typeMessage: "x", oversizeHint: "Export a smaller PDF and try again." },
  );
  assert.equal(refusal, `That file is 6.0 MB, over the ${APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL} limit. Export a smaller PDF and try again.`);
});

test("type refusals return the surface's own sentence, size checked only after type", () => {
  const refusal = validateApplicationDocument(
    { name: "resume.txt", type: "text/plain", size: 9_000_000 },
    { accept: "pdf", typeMessage: "Choose one PDF file." },
  );
  assert.equal(refusal, "Choose one PDF file.");
});

test("each accept kind admits its formats by media type or extension", () => {
  const ok = (file: { name: string; type: string }, accept: ApplicationDocumentAccept) =>
    assert.equal(validateApplicationDocument({ ...file, size: 1_000 }, { accept, typeMessage: "no" }), null);
  const no = (file: { name: string; type: string }, accept: ApplicationDocumentAccept) =>
    assert.equal(validateApplicationDocument({ ...file, size: 1_000 }, { accept, typeMessage: "no" }), "no");

  /* A file dragged out of some file managers arrives with an empty type; the extension must be
     enough, in either case. The server checks again. */
  ok({ name: "RESUME.PDF", type: "" }, "pdf");
  ok({ name: "resume.bin", type: "application/pdf" }, "pdf");
  no({ name: "resume.docx", type: "" }, "pdf");

  ok({ name: "resume.docx", type: "" }, "pdf-or-docx");
  ok({ name: "resume.bin", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, "pdf-or-docx");
  ok({ name: "resume.pdf", type: "" }, "pdf-or-docx");
  no({ name: "resume.txt", type: "text/plain" }, "pdf-or-docx");

  ok({ name: "letter.txt", type: "" }, "pdf-or-txt");
  ok({ name: "letter.bin", type: "text/plain" }, "pdf-or-txt");
  ok({ name: "letter.pdf", type: "" }, "pdf-or-txt");
  no({ name: "letter.docx", type: "" }, "pdf-or-txt");

  ok({ name: "Connections.CSV", type: "" }, "csv");
  no({ name: "Connections.xlsx", type: "" }, "csv");
});
