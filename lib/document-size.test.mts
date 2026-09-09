import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_DOCUMENT_ACCEPT_ATTRIBUTE,
  APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL,
  MAX_APPLICATION_DOCUMENT_BYTES,
  MAX_RESUME_PHOTO_SOURCE_BYTES,
  RESUME_PHOTO_CAPTURE_ACCEPT_ATTRIBUTE,
  formatDocumentBytes,
  validateApplicationDocument,
  type ApplicationDocumentAccept,
} from "./document-size.ts";

const PDF = { name: "resume.pdf", type: "application/pdf" };

test("the prose label is the enforced cap, written the way the copy writes it", () => {
  assert.equal(APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL, `${Math.floor(MAX_APPLICATION_DOCUMENT_BYTES / 1_000_000)} MB`);
  /* The label floors to whole MB. A cap that is not a round number of MB would make every surface
     promise less than the gate accepts, and the floor-derived assertion above could never catch
     it: this is the guard that keeps the label honest. */
  assert.equal(MAX_APPLICATION_DOCUMENT_BYTES % 1_000_000, 0, "the cap must stay a whole number of MB or the prose label understates it");
});

test("formatDocumentBytes reports decimal units at every scale", () => {
  assert.equal(formatDocumentBytes(999), "999 B");
  assert.equal(formatDocumentBytes(1_000), "1 KB");
  assert.equal(formatDocumentBytes(999_499), "999 KB");
  /* 999,500-999,999 would round to "1000 KB", a unit no file manager prints; the MB arm takes
     them instead. */
  assert.equal(formatDocumentBytes(999_600), "1.0 MB");
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
  ok({ name: "connections", type: "text/csv" }, "csv");
  no({ name: "Connections.xlsx", type: "" }, "csv");
});

test("every file the picker's accept filter offers is a file the gate admits", () => {
  /* The accept attribute and the gate are exported side by side so they cannot drift: a kind
     widened in one but not the other would leave the picker offering files the gate refuses, or
     hiding files the gate was written to admit. Each attribute token must therefore pass its own
     kind's validation, whether the file arrives with only that media type or only that
     extension. */
  for (const [accept, attribute] of Object.entries(APPLICATION_DOCUMENT_ACCEPT_ATTRIBUTE)) {
    for (const token of attribute.split(",")) {
      const file = token.startsWith(".")
        ? { name: `export${token}`, type: "", size: 1_000 }
        : { name: "export.bin", type: token, size: 1_000 };
      assert.equal(
        validateApplicationDocument(file, { accept: accept as ApplicationDocumentAccept, typeMessage: "refused" }),
        null,
        `accept="${token}" offers a file the "${accept}" gate refuses`,
      );
    }
  }
});

test("the resume step admits a photograph alongside a document", () => {
  const ok = (file: { name: string; type: string }) =>
    assert.equal(
      validateApplicationDocument({ ...file, size: 1_000 }, { accept: "resume-or-photo", typeMessage: "no" }),
      null,
    );
  const no = (file: { name: string; type: string }) =>
    assert.equal(
      validateApplicationDocument({ ...file, size: 1_000 }, { accept: "resume-or-photo", typeMessage: "no" }),
      "no",
    );

  /* What a camera capture actually arrives as, including the Android pickers that send a generic
     or empty type and leave only the extension to go on. */
  ok({ name: "resume-photo.jpg", type: "image/jpeg" });
  ok({ name: "IMG_0421.JPEG", type: "" });
  ok({ name: "scan.png", type: "image/png" });
  ok({ name: "shot.bin", type: "image/webp" });
  /* The documents this step already took keep working. */
  ok({ name: "resume.pdf", type: "" });
  ok({ name: "resume.docx", type: "" });

  /* HEIC IS ADMITTED, and that is the fix for a real defect: an earlier version refused it here,
     which made the HEIC conversion in lib/resume-photo.ts unreachable and refused an iPhone user's
     own photo library for a format Safari converts natively. A browser that cannot decode it fails
     in the re-encode instead, where the message can say "take a new one". */
  ok({ name: "IMG_0421.heic", type: "image/heic" });
  ok({ name: "IMG_0421.HEIF", type: "" });
  /* Any image subtype, because the re-encode is the arbiter of what is readable, not this list. */
  ok({ name: "capture", type: "image/avif" });

  no({ name: "resume.txt", type: "text/plain" });
  no({ name: "clip.mp4", type: "video/mp4" });
});

test("the camera attribute offers photos only, and nothing it offers is refused", () => {
  /* Deliberately narrower than the resume-or-photo attribute: an accept list carrying PDFs would
     make the capture control open a file picker on some browsers, which is the one thing that
     button must never do. The wildcard is on purpose - iOS picks the format of its own capture,
     and an enumerated list can make it refuse what it just took. */
  assert.doesNotMatch(RESUME_PHOTO_CAPTURE_ACCEPT_ATTRIBUTE, /pdf|docx/i);
  assert.match(RESUME_PHOTO_CAPTURE_ACCEPT_ATTRIBUTE, /^image\//);
  /* Whatever the camera hands back under that wildcard has to clear the gate, or the button opens
     a camera whose output the next line refuses. */
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]) {
    assert.equal(
      validateApplicationDocument({ name: "capture", type, size: 1_000 }, { accept: "resume-or-photo", typeMessage: "refused" }),
      null,
      `${type} can come back from the camera but the gate refuses it`,
    );
  }
});

test("a raw camera capture is bounded for decoding, not by the upload cap", () => {
  /* THE REGRESSION THIS PINS: the first version measured the raw capture against
     MAX_APPLICATION_DOCUMENT_BYTES before re-encoding it, so an ordinary 9 MB phone photo was
     refused with "export a smaller file" and the downscale that would have made it ~400 KB never
     ran. The upload cap belongs to the re-encoded file; what the raw file gets is a much higher
     ceiling that only exists to stop a decode large enough to hang the tab. */
  assert.ok(
    MAX_RESUME_PHOTO_SOURCE_BYTES > MAX_APPLICATION_DOCUMENT_BYTES,
    "a raw capture routinely exceeds the upload cap, so its own ceiling must be higher",
  );
  /* A 9 MB capture is a normal phone photo, not an abuse case. */
  assert.ok(9_000_000 < MAX_RESUME_PHOTO_SOURCE_BYTES);
});
