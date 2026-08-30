import assert from "node:assert/strict";
import test from "node:test";

import { resumeUploadState } from "./resume-upload-state.ts";

test("a grounded local parse advances without model-inferred roles and explains the fallback", () => {
  assert.deepEqual(
    resumeUploadState({ full_name: "Mehek Mandal", bank_total: 4, parse_method: "local_fallback" }),
    { ready: true, showFallbackWarning: true },
  );
});

test("a model parse advances without showing the fallback warning", () => {
  assert.deepEqual(
    resumeUploadState({ full_name: "Mehek Mandal", bank_total: 4, parse_method: "model" }),
    { ready: true, showFallbackWarning: false },
  );
});

test("readiness requires both a name and grounded experience evidence", () => {
  assert.equal(resumeUploadState({ full_name: " ", bank_total: 4 }).ready, false);
  assert.equal(resumeUploadState({ full_name: "Mehek Mandal" }).ready, false);
  assert.equal(resumeUploadState({ full_name: "Mehek Mandal", bank_total: 0 }).ready, false);
});

test("the persisted bank total is authoritative and the seed count covers older responses", () => {
  assert.equal(resumeUploadState({ full_name: "Mehek Mandal", bank_total: 0, bank_seeded: 3 }).ready, false);
  assert.equal(resumeUploadState({ full_name: "Mehek Mandal", bank_seeded: 3 }).ready, true);
});

test("a failed readiness check never shows a misleading fallback-success warning", () => {
  assert.deepEqual(
    resumeUploadState({ full_name: "Mehek Mandal", bank_total: 0, parse_method: "local_fallback" }),
    { ready: false, showFallbackWarning: false },
  );
});

test("a server-confirmed saved fallback profile keeps its warning without upload-only bank counts", () => {
  assert.deepEqual(
    resumeUploadState(
      { full_name: "Mehek Mandal", parse_method: "local_fallback" },
      { knownReady: true },
    ),
    { ready: true, showFallbackWarning: true },
  );
});
