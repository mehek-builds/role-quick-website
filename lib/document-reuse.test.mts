import assert from "node:assert/strict";
import test from "node:test";
import { reusableDocumentsForAsk } from "./document-reuse.ts";
import type { DocumentSummary } from "./api.ts";

function stored(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: "doc-1",
    kind: "transcript",
    file_name: "transcript.pdf",
    byte_size: 120_000,
    reusable: true,
    created_at: "2026-08-30T00:00:00.000Z",
    last_used_at: null,
    deleted_at: null,
    ...overrides,
  };
}

/* The four terms POST /applications/:id/documents/attach matches on are user, kind, `reusable = true`
   and no tombstone, and it answers all four failures with one 404 that does not say which. The user
   is the token's, so the three the client can see are the three below. A row this filter lets through
   that the endpoint would refuse is a control that dies on press. */

test("a stored file of the asked-for kind is offered", () => {
  assert.deepEqual(
    reusableDocumentsForAsk([stored()], "transcript").map((file) => file.id),
    ["doc-1"],
  );
});

test("a file of another kind is not offered", () => {
  /* One upload writes one `spec._documents` key, so a kind mismatch is a refusal rather than a
     near miss. Only 'transcript' exists today; this holds the rule against the field so that a
     second kind does not silently inherit the first one's files. */
  assert.deepEqual(reusableDocumentsForAsk([stored({ kind: "writing_sample" })], "transcript"), []);
});

test("a single-use file is never offered", () => {
  /* The upload modal's checkbox ships default ON and unticking it is told back to her as "Attached
     to this application only. Litos will ask again the next time an employer wants one." Offering
     that file here would make the sentence false on the surface that made it. */
  assert.deepEqual(reusableDocumentsForAsk([stored({ reusable: false })], "transcript"), []);
});

test("a removed file is never offered", () => {
  /* listUserDocuments excludes tombstones server-side, so this is belt and braces: the column ships
     on the row, and reading a field the client can see costs nothing over trusting a filter it
     cannot. */
  assert.deepEqual(
    reusableDocumentsForAsk([stored({ deleted_at: "2026-09-01T00:00:00.000Z" })], "transcript"),
    [],
  );
});

test("an unloaded library offers nothing rather than throwing", () => {
  /* `null` is the modal's "not loaded", which is a different fact from "none stored" and must not
     be reported to her as one. Both render no picker; only this one may still become a list. */
  assert.deepEqual(reusableDocumentsForAsk(null, "transcript"), []);
  assert.deepEqual(reusableDocumentsForAsk(undefined, "transcript"), []);
});

test("the server's order survives the filter", () => {
  /* GET /documents orders by `coalesce(last_used_at, created_at) desc`, the file she reached for
     most recently first. Re-sorting here would give the picker and the account page two different
     answers to "which is my current transcript". */
  const ordered = [
    stored({ id: "newest", last_used_at: "2026-09-02T00:00:00.000Z" }),
    stored({ id: "single-use", reusable: false }),
    stored({ id: "older", last_used_at: "2026-08-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(
    reusableDocumentsForAsk(ordered, "transcript").map((file) => file.id),
    ["newest", "older"],
  );
});

test("the offered rows are the caller's own objects, not copies", () => {
  /* The picker keys its list on `file.id` and hands the whole row back to the attach call. A filter
     that rebuilt the rows would be a second source of truth for a shape the API already defines. */
  const file = stored();
  assert.equal(reusableDocumentsForAsk([file], "transcript")[0], file);
});
