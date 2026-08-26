import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

function coverLetterEditor(initialApplicationId, initialBody) {
  let applicationId = initialApplicationId;
  let editorRevision = 0;
  let body = initialBody;
  let loading = false;
  let editorOpen = true;
  let dirty = false;
  const generations = { "cover-letter": 0, tailoring: 0 };
  const writes = [];
  const ledgerWrites = [];
  const errors = [];
  const upgrades = [];

  function mayPublish(request) {
    return generations[request.channel] === request.requestGeneration
      && applicationId === request.applicationId
      && editorRevision === request.editorRevision;
  }

  return {
    startRequest(channel = "cover-letter") {
      generations[channel] += 1;
      return { applicationId, editorRevision, requestGeneration: generations[channel], channel };
    },
    edit(nextBody) {
      editorRevision += 1;
      dirty = true;
      body = nextBody;
    },
    select(nextApplicationId, nextBody) {
      if (applicationId !== nextApplicationId) {
        applicationId = nextApplicationId;
        editorRevision += 1;
      }
      dirty = false;
      loading = false;
      body = nextBody;
    },
    selectPending(nextApplicationId) {
      if (applicationId !== nextApplicationId) {
        applicationId = nextApplicationId;
        editorRevision += 1;
      }
      dirty = false;
      body = "";
      editorOpen = false;
      loading = true;
    },
    startHydration() {
      return { applicationId, editorRevision };
    },
    releaseHydration(request, hydratedBody) {
      if (applicationId !== request.applicationId || editorRevision !== request.editorRevision || dirty) return;
      body = hydratedBody;
      loading = false;
    },
    release(request, generatedBody) {
      if (!mayPublish(request)) return;
      body = generatedBody;
      writes.push({ applicationId, body: generatedBody });
    },
    releaseTailoring(request) {
      ledgerWrites.push(request.applicationId);
      if (!mayPublish(request)) return;
      writes.push({ applicationId, tailored: true });
    },
    fail(request, message) {
      if (mayPublish(request)) errors.push(message);
    },
    deny(request) {
      if (mayPublish(request)) upgrades.push(request.applicationId);
    },
    snapshot() {
      return {
        applicationId,
        body,
        writes: [...writes],
        ledgerWrites: [...ledgerWrites],
        errors: [...errors],
        upgrades: [...upgrades],
      };
    },
    hydrationSnapshot() {
      return { applicationId, body, loading, editorOpen, mutationAllowed: !loading };
    },
  };
}

function packetCoverLetterEditor(initialBody) {
  let applicationId = "packet-a";
  let editorRevision = 0;
  let requestGeneration = 0;
  let body = initialBody;
  let busy = false;
  let error = null;
  let notice = null;
  const serverWrites = [];

  function ownsLifecycle(request) {
    return requestGeneration === request.requestGeneration;
  }

  function mayPublish(request) {
    return ownsLifecycle(request)
      && applicationId === request.applicationId
      && editorRevision === request.editorRevision;
  }

  function finish(request) {
    if (ownsLifecycle(request)) busy = false;
  }

  return {
    start(kind) {
      busy = true;
      error = null;
      requestGeneration += 1;
      return { applicationId, editorRevision, requestGeneration, kind };
    },
    edit(nextBody) {
      editorRevision += 1;
      body = nextBody;
    },
    release(request, responseBody) {
      if (mayPublish(request)) {
        serverWrites.push({ kind: request.kind, body: responseBody });
        body = responseBody;
        notice = `${request.kind} complete`;
      }
      finish(request);
    },
    fail(request, message) {
      if (mayPublish(request)) error = message;
      finish(request);
    },
    snapshot() {
      return { body, busy, error, notice, serverWrites: [...serverWrites] };
    },
  };
}

test("canonical selection and every editable generation input advance one ownership revision", () => {
  assert.match(source, /const canonicalSelectedIdRef = useRef<string \| null>\(null\);/);
  assert.match(source, /const canonicalCoverLetterEditorRevisionRef = useRef\(0\);/);

  const selection = between("const commitCanonicalSelection", "/* Keyed by canonical application id");
  assert.match(selection, /if \(canonicalSelectedIdRef\.current !== nextId\) \{/);
  assert.match(selection, /canonicalSelectedIdRef\.current = nextId;\s*canonicalCoverLetterEditorRevisionRef\.current \+= 1;/);
  assert.ok(selection.indexOf("canonicalCoverLetterEditorRevisionRef.current += 1;") < selection.indexOf("setCanonicalSelected(next);"));
  assert.match(selection, /setCanonicalCoverLetter\(null\);\s*setCanonicalCoverLetterBody\(""\);\s*setCanonicalCoverLetterJd\(""\);\s*setCanonicalCoverLetterEditorOpen\(false\);\s*setCanonicalCoverLetterLoading\(nextId !== null\);/);

  const bodyEdit = between("const editCanonicalCoverLetterBody", "const editCanonicalCoverLetterJd");
  const jdEdit = between("const editCanonicalCoverLetterJd", "const [canonicalCoverLetterEditorOpen");
  assert.match(bodyEdit, /canonicalCoverLetterEditorRevisionRef\.current \+= 1;\s*canonicalCoverLetterEditorDirtyRef\.current = true;\s*setCanonicalCoverLetterBody\(body\);/);
  assert.match(jdEdit, /canonicalCoverLetterEditorRevisionRef\.current \+= 1;\s*canonicalCoverLetterEditorDirtyRef\.current = true;\s*setCanonicalCoverLetterJd\(jobDescription\);/);
  assert.match(source, /onCoverLetterBodyChange=\{editCanonicalCoverLetterBody\}/);
  assert.match(source, /onCoverLetterJdChange=\{editCanonicalCoverLetterJd\}/);
});

test("one ownership helper combines selected id, editor revision, request generation, and route lifetime", () => {
  const begin = between("function beginCanonicalRequest", "function canonicalRequestOwnsLifecycle");
  const lifecycle = between("function canonicalRequestOwnsLifecycle", "function canonicalRequestMayPublish");
  const publish = between("function canonicalRequestMayPublish", "/* Writes the choice back");

  assert.match(begin, /requestGeneration: \+\+generationRef\.current/);
  assert.match(lifecycle, /applicationsMountedRef\.current && generation === scope\.requestGeneration/);
  assert.match(publish, /canonicalRequestOwnsLifecycle\(scope\)/);
  assert.match(publish, /canonicalSelectedIdRef\.current === scope\.applicationId/);
  assert.match(publish, /canonicalCoverLetterEditorRevisionRef\.current === scope\.editorRevision/);
});

test("packet cover-letter ownership advances on typing and every packet identity transition", () => {
  assert.match(source, /const packetCoverLetterEditorRevisionRef = useRef\(0\);/);
  assert.match(source, /const coverLetterRequestGenerationRef = useRef\(0\);/);

  const edit = between("const editPacketCoverLetterBody", "const [coverLetterDownloadUrl");
  assert.match(edit, /packetCoverLetterEditorRevisionRef\.current \+= 1;\s*setCoverLetterBody\(body\);/);
  assert.match(source, /onChange=\{\(event\) => editPacketCoverLetterBody\(event\.target\.value\)\}/);

  const selection = between("const selectPacket", "/* User navigation writes local state");
  assert.equal(
    (selection.match(/packetCoverLetterEditorRevisionRef\.current \+= 1;/g) ?? []).length,
    2,
    "canonical and packet selection must both retire the old packet editor scope",
  );
  const reset = between("const resetApplicationWorkflow", "const closeApplication");
  assert.match(
    reset,
    /selectedIdRef\.current = null;\s*resumeEditSaveApplicationRef\.current = null;\s*editorRevisionRef\.current \+= 1;\s*packetCoverLetterEditorRevisionRef\.current \+= 1;/,
  );
});

test("packet request ownership combines application id, editor revision, shared generation, and lifetime", () => {
  const begin = between("function beginPacketCoverLetterRequest", "function packetCoverLetterRequestOwnsLifecycle");
  const lifecycle = between("function packetCoverLetterRequestOwnsLifecycle", "function packetCoverLetterRequestMayPublish");
  const publish = between("function packetCoverLetterRequestMayPublish", "/* Writes the choice back");

  assert.match(begin, /editorRevision: packetCoverLetterEditorRevisionRef\.current/);
  assert.match(begin, /requestGeneration: \+\+coverLetterRequestGenerationRef\.current/);
  assert.match(lifecycle, /applicationsMountedRef\.current/);
  assert.match(lifecycle, /coverLetterRequestGenerationRef\.current === scope\.requestGeneration/);
  assert.match(publish, /packetCoverLetterRequestOwnsLifecycle\(scope\)/);
  assert.match(publish, /selectedIdRef\.current === scope\.applicationId/);
  assert.match(publish, /packetCoverLetterEditorRevisionRef\.current === scope\.editorRevision/);
});

test("generation rejects a stale canonical response before any packet, submission, editor, or notice publish", () => {
  const generation = between("async function generateCoverLetter(", "async function saveCanonicalCoverLetter(");

  assert.match(generation, /const canonicalRequestScope = options\.canonicalApplicationId\s*\? beginCanonicalRequest\(targetApplicationId, "cover-letter"\)/);
  assert.match(generation, /canonicalRequestMayPublish\(canonicalRequestScope\)/);

  const successGuard = generation.indexOf("if (!requestMayPublish()) {");
  assert.notEqual(successGuard, -1);
  for (const mutation of [
    "setPackets((current)",
    "applyCoverLetterToSubmission(applicationId, result.cover_letter)",
    "setCanonicalCoverLetter(result as CanonicalCoverLetterResponse)",
    "setCanonicalCoverLetterBody(result.cover_letter.body)",
    "setNotice(\"Cover letter written",
  ]) {
    assert.ok(successGuard < generation.indexOf(mutation), `${mutation} must follow the ownership guard`);
  }
  assert.match(generation, /if \(!requestMayPublish\(\)\) \{\s*completeOperationId\(coverLetterOperationIds\.current, operationKey\);\s*return;\s*\}/);
  assert.match(generation, /catch \(reason\) \{\s*if \(!requestMayPublish\(\)\) return;/);
  assert.match(generation, /finally \{\s*if \(requestOwnsLifecycle\(\)\) setCoverLetterBusy\(false\);/);
});

test("packet generation uses packet editor ownership for success, failure, and busy cleanup", () => {
  const generation = between("async function generateCoverLetter(", "async function saveCanonicalCoverLetter(");
  assert.match(generation, /const packetRequestScope = options\.canonicalApplicationId\s*\? null\s*: beginPacketCoverLetterRequest\(applicationId\);/);
  assert.match(generation, /packetCoverLetterRequestMayPublish\(packetRequestScope\)/);
  assert.match(generation, /packetCoverLetterRequestOwnsLifecycle\(packetRequestScope\)/);

  const successGuard = generation.indexOf("if (!requestMayPublish()) {");
  assert.notEqual(successGuard, -1);
  for (const mutation of [
    "setPackets((current)",
    "applyCoverLetterToSubmission(applicationId, result.cover_letter)",
    "setCoverLetterBody(result.cover_letter.body)",
    "setCoverLetterDownloadUrl(result.download_url)",
    "setNotice(\"Cover letter written",
  ]) {
    assert.ok(successGuard < generation.indexOf(mutation), `${mutation} must follow the packet ownership guard`);
  }
  assert.match(generation, /catch \(reason\) \{\s*if \(!requestMayPublish\(\)\) return;/);
  assert.match(generation, /finally \{\s*if \(requestOwnsLifecycle\(\)\) setCoverLetterBusy\(false\);/);
});

test("save, upload, and delete share the canonical ownership guard on success, failure, and cleanup", () => {
  const regions = [
    between("async function saveCanonicalCoverLetter", "async function uploadCanonicalCoverLetter"),
    between("async function uploadCanonicalCoverLetter", "async function deleteCanonicalCoverLetter"),
    between("async function deleteCanonicalCoverLetter", "async function saveCoverLetter"),
  ];

  for (const operation of regions) {
    assert.match(operation, /const requestScope = beginCanonicalRequest\(applicationId, "cover-letter"\);/);
    assert.match(operation, /if \(!canonicalRequestMayPublish\(requestScope\)\) return;/);
    assert.match(operation, /catch \(reason\) \{\s*if \(!canonicalRequestMayPublish\(requestScope\)\) return;/);
    assert.match(operation, /finally \{\s*if \(canonicalRequestOwnsLifecycle\(requestScope\)\) setCoverLetterBusy\(false\);/);
    assert.ok(
      operation.indexOf("if (!canonicalRequestMayPublish(requestScope)) return;")
        < operation.indexOf("canonicalCoverLetterEditorDirtyRef.current = false;"),
      "a response must prove ownership before replacing editor state",
    );
  }
});

test("packet save snapshots the submitted body and guards delete, patch, failure, and cleanup", () => {
  const save = between("async function saveCoverLetter", "function patchEntry");
  assert.match(save, /if \(selectedIdRef\.current !== applicationId\) return false;/);
  assert.match(save, /const requestScope = beginPacketCoverLetterRequest\(applicationId\);/);
  assert.match(save, /const submittedBody = coverLetterBody;/);
  assert.match(save, /JSON\.stringify\(\{ body: submittedBody \}\)/);

  const deleteRequest = save.indexOf("await api(`/applications/${applicationId}/cover-letter`, { method: \"DELETE\" })");
  const deleteGuard = save.indexOf("if (!packetCoverLetterRequestMayPublish(requestScope)) return false;", deleteRequest);
  const patchRequest = save.indexOf("const result = await api<CoverLetterResponse>");
  const patchGuard = save.indexOf("if (!packetCoverLetterRequestMayPublish(requestScope)) return false;", patchRequest);
  assert.ok(deleteRequest >= 0 && deleteGuard > deleteRequest);
  assert.ok(patchRequest >= 0 && patchGuard > patchRequest);
  assert.ok(deleteGuard < save.indexOf("applyCoverLetterToSubmission(applicationId, null)"));
  assert.ok(patchGuard < save.indexOf("applyCoverLetterToSubmission(applicationId, result.cover_letter)"));
  assert.ok(patchGuard < save.indexOf("setCoverLetterBody(result.cover_letter.body)"));
  assert.match(save, /catch \(reason\) \{\s*if \(!packetCoverLetterRequestMayPublish\(requestScope\)\) return false;\s*setError/);
  assert.match(save, /finally \{\s*if \(packetCoverLetterRequestOwnsLifecycle\(requestScope\)\) setCoverLetterBusy\(false\);/);
});

test("canonical tailoring keeps durable ledger data but gates selection, notice, errors, and upgrade denial", () => {
  const preflight = between("async function tailorCanonicalApplication", "/* Takes the draft explicitly");
  const creation = between("async function createApplication(", "async function generateCoverLetter(");

  assert.match(preflight, /const requestScope = beginCanonicalRequest\(application\.id, "tailoring"\);/);
  assert.match(preflight, /createApplication\(\{ \.\.\.draft, jobDescription \}, upgradeTrigger, requestScope\)/);
  assert.match(preflight, /catch \(reason\) \{\s*if \(!canonicalRequestMayPublish\(requestScope\)\) return;/);
  assert.match(creation, /inheritedCanonicalRequestScope \?\? beginCanonicalRequest\(draft\.canonicalApplicationId, "tailoring"\)/);

  const safeMerge = creation.indexOf("setPackets((current)");
  const surfaceGuard = creation.indexOf("if (!requestMayPublish()) return;", safeMerge);
  assert.ok(safeMerge >= 0 && surfaceGuard > safeMerge, "the durable packet may merge before the task-surface ownership guard");
  for (const mutation of [
    "commitCanonicalSelection(updatedCanonical)",
    "openApplication(created",
    "setNewApplication(EMPTY_APPLICATION_DRAFT)",
    "setShowNewApplication(false)",
    "setNotice(keepCanonicalDetail",
  ]) {
    assert.ok(surfaceGuard < creation.indexOf(mutation, surfaceGuard), `${mutation} must follow the task-surface guard`);
  }
  assert.match(creation, /catch \(reason\) \{\s*if \(!requestMayPublish\(\)\) return;\s*if \(isStructuredUpgradeDenial/);
});

test("canonical hydration cannot replace a dirty editor after a safe tailoring merge", () => {
  const hydration = between("useEffect(() => {\n    const applicationId = canonicalSelected?.id;", "/* ROUTING HYDRATION");
  assert.match(hydration, /canonicalCoverLetterEditorRevisionRef\.current === editorRevision/);
  assert.match(hydration, /!canonicalCoverLetterEditorDirtyRef\.current/);
  const publishGuard = hydration.indexOf("if (!requestMayPublish()) return;");
  const bodyPublish = hydration.indexOf("setCanonicalCoverLetterBody(result.cover_letter.body");
  assert.ok(publishGuard >= 0 && bodyPublish >= 0, "hydration needs both a stale-request guard and editor publish");
  assert.ok(publishGuard < bodyPublish, "hydration must reject a stale request before publishing into the editor");

  const detail = between("function CanonicalApplicationDetail", "function NewApplicationPanel");
  assert.match(detail, /disabled=\{coverLetterBusy \|\| coverLetterLoading \|\| !coverLetterBody\.trim\(\)\}/);
  assert.match(detail, /disabled=\{coverLetterBusy \|\| coverLetterLoading \|\| \(!hasTailoredResume && !coverLetterJd\.trim\(\)\)\}/);
  assert.match(detail, /disabled=\{coverLetterBusy \|\| coverLetterLoading\}[\s\S]*onChange=\{\(event\) =>/);
  assert.match(detail, /variant="quiet" disabled=\{coverLetterBusy \|\| coverLetterLoading\} onClick=\{onDeleteCoverLetter\}/);
});

test("switching from A to B clears A synchronously and blocks mutations until B hydration owns the editor", () => {
  const editor = coverLetterEditor("application-a", "Saved A");
  const hydrationA = editor.startHydration();

  editor.selectPending("application-b");
  const hydrationB = editor.startHydration();
  assert.deepEqual(editor.hydrationSnapshot(), {
    applicationId: "application-b",
    body: "",
    loading: true,
    editorOpen: false,
    mutationAllowed: false,
  });

  editor.releaseHydration(hydrationA, "Stale hydrated A");
  assert.equal(editor.hydrationSnapshot().body, "");
  assert.equal(editor.hydrationSnapshot().mutationAllowed, false);

  editor.releaseHydration(hydrationB, "Saved B");
  assert.deepEqual(editor.hydrationSnapshot(), {
    applicationId: "application-b",
    body: "Saved B",
    loading: false,
    editorOpen: false,
    mutationAllowed: true,
  });
});

test("editing A while its request is held keeps the newer textarea and publishes nothing on release", () => {
  const editor = coverLetterEditor("application-a", "Original A");
  const requestA = editor.startRequest();

  editor.edit("Newer manual A");
  editor.release(requestA, "Stale generated A");

  assert.deepEqual(editor.snapshot(), {
    applicationId: "application-a",
    body: "Newer manual A",
    writes: [],
    ledgerWrites: [],
    errors: [],
    upgrades: [],
  });
});

test("held packet save cannot replace text typed after the request began", () => {
  const editor = packetCoverLetterEditor("Saved packet text");
  const save = editor.start("save");

  editor.edit("Newer packet edit");
  editor.release(save, "Stale saved response");

  assert.deepEqual(editor.snapshot(), {
    body: "Newer packet edit",
    busy: false,
    error: null,
    notice: null,
    serverWrites: [],
  });
});

test("held packet generation cannot replace text typed after the request began", () => {
  const editor = packetCoverLetterEditor("Starting packet text");
  const generation = editor.start("generate");

  editor.edit("Manual text typed while generating");
  editor.release(generation, "Stale generated response");

  assert.deepEqual(editor.snapshot(), {
    body: "Manual text typed while generating",
    busy: false,
    error: null,
    notice: null,
    serverWrites: [],
  });
});

test("an older packet callback cannot clear a newer request busy state or replace its error", () => {
  const editor = packetCoverLetterEditor("Starting packet text");
  const older = editor.start("generate");
  editor.edit("Newer packet edit");
  const newer = editor.start("save");

  editor.release(older, "Stale generated response");
  assert.equal(editor.snapshot().busy, true);

  editor.fail(newer, "Newest save failed");
  editor.fail(older, "Stale generation failed");
  assert.deepEqual(editor.snapshot(), {
    body: "Newer packet edit",
    busy: false,
    error: "Newest save failed",
    notice: null,
    serverWrites: [],
  });
});

test("switching from A to B, including A to B to A, cannot publish A's held response", () => {
  const editor = coverLetterEditor("application-a", "Original A");
  const requestA = editor.startRequest();

  editor.select("application-b", "Manual B");
  editor.release(requestA, "Stale generated A");
  assert.deepEqual(editor.snapshot(), {
    applicationId: "application-b",
    body: "Manual B",
    writes: [],
    ledgerWrites: [],
    errors: [],
    upgrades: [],
  });

  editor.select("application-a", "Newer A after returning");
  editor.release(requestA, "Stale generated A");
  assert.deepEqual(editor.snapshot(), {
    applicationId: "application-a",
    body: "Newer A after returning",
    writes: [],
    ledgerWrites: [],
    errors: [],
    upgrades: [],
  });
});

test("held save, upload, and delete responses cannot replace a newer canonical editor scope", () => {
  const saveEditor = coverLetterEditor("application-a", "Original A");
  const saveA = saveEditor.startRequest();
  saveEditor.edit("Newer manual A");
  saveEditor.release(saveA, "Stale saved A");
  saveEditor.fail(saveA, "Stale save failure");
  assert.deepEqual(saveEditor.snapshot().writes, []);
  assert.deepEqual(saveEditor.snapshot().errors, []);
  assert.equal(saveEditor.snapshot().body, "Newer manual A");

  const uploadEditor = coverLetterEditor("application-a", "Original A");
  const uploadA = uploadEditor.startRequest();
  uploadEditor.select("application-b", "Manual B");
  uploadEditor.release(uploadA, "Stale uploaded A");
  uploadEditor.fail(uploadA, "Stale upload failure");
  assert.deepEqual(uploadEditor.snapshot().writes, []);
  assert.deepEqual(uploadEditor.snapshot().errors, []);
  assert.deepEqual(uploadEditor.snapshot().applicationId, "application-b");
  assert.equal(uploadEditor.snapshot().body, "Manual B");

  const deleteEditor = coverLetterEditor("application-a", "Original A");
  const deleteA = deleteEditor.startRequest();
  deleteEditor.select("application-b", "Manual B");
  deleteEditor.select("application-a", "Newer A after returning");
  deleteEditor.release(deleteA, "");
  deleteEditor.fail(deleteA, "Stale delete failure");
  assert.deepEqual(deleteEditor.snapshot().writes, []);
  assert.deepEqual(deleteEditor.snapshot().errors, []);
  assert.equal(deleteEditor.snapshot().body, "Newer A after returning");
});

test("held canonical tailoring may merge its durable packet but cannot reopen A or surface stale failures and denials", () => {
  const switched = coverLetterEditor("application-a", "Original A");
  const tailoringA = switched.startRequest("tailoring");
  switched.select("application-b", "Manual B");
  switched.releaseTailoring(tailoringA);
  switched.fail(tailoringA, "Stale tailoring failure");
  switched.deny(tailoringA);
  assert.deepEqual(switched.snapshot(), {
    applicationId: "application-b",
    body: "Manual B",
    writes: [],
    ledgerWrites: ["application-a"],
    errors: [],
    upgrades: [],
  });

  const edited = coverLetterEditor("application-a", "Original A");
  const editedTailoringA = edited.startRequest("tailoring");
  edited.edit("Newer manual A");
  edited.releaseTailoring(editedTailoringA);
  assert.deepEqual(edited.snapshot(), {
    applicationId: "application-a",
    body: "Newer manual A",
    writes: [],
    ledgerWrites: ["application-a"],
    errors: [],
    upgrades: [],
  });
});
