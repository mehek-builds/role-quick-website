import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/dashboard/resume/page.tsx", import.meta.url), "utf8");
const documents = await readFile(new URL("../app/dashboard/documents/page.tsx", import.meta.url), "utf8");
const dashboardShell = await readFile(new URL("../app/dashboard/dashboard-shell.tsx", import.meta.url), "utf8");
const mutationController = await readFile(new URL("../app/dashboard/resume/mutation-controller.tsx", import.meta.url), "utf8");

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

test("work-history save snapshots the submitted revision and cannot replace later edits", () => {
  const save = between("async function saveBank", "function patchEntry");

  assert.match(mutationController, /const entriesRevisionRef = useRef\(0\)/);
  assert.match(save, /const editorRevision = entriesRevisionRef\.current;\s*const submittedEntries = entries;/);
  assert.ok(save.indexOf("const submittedEntries = entries;") < save.indexOf('mutations.run("save"'));
  assert.match(save, /const cleaned = submittedEntries\s*\.map/);
  assert.equal(
    save.match(/if \(entriesRevisionRef\.current !== editorRevision\) return;/g)?.length,
    2,
    "both a late success and a late failure must be inert after another edit",
  );
  const successGuard = save.indexOf("if (entriesRevisionRef.current !== editorRevision) return;");
  assert.ok(successGuard < save.indexOf("setEntries(res.entries)"));
  const catchGuard = save.lastIndexOf("if (entriesRevisionRef.current !== editorRevision) return;");
  assert.ok(catchGuard < save.indexOf('setError(err instanceof Error ? err.message : "Could not save.")'));
  assert.match(save, /finally \{\s*setSaving\(false\);\s*\}/);
});

test("every work-history edit and replacement advances the editor revision", () => {
  for (const [start, end] of [
    ["function patchEntry", "function removeEntry"],
    ["function removeEntry", "function addEntry"],
    ["function addEntry", "/* One array in"],
  ]) {
    assert.match(between(start, end), /entriesRevisionRef\.current \+= 1/);
  }

  const loadBank = between("const loadBank", "const loadTargeting");
  assert.match(loadBank, /const requestRevision = entriesRevisionRef\.current/);
  assert.match(loadBank, /onSuccess: \(bank\) => \{\s*if \(entriesRevisionRef\.current !== requestRevision\) return;\s*entriesRevisionRef\.current \+= 1;\s*setEntries\(bank\.entries\)/);
  const upload = between("async function upload", "async function saveBank");
  assert.match(upload, /entriesRevisionRef\.current \+= 1;\s*setEntries\(null\)/);
  assert.match(source, /savedAt && !bankSavePending && !entriesDirty/);
});

test("parsed-profile save uses one immutable draft and rejects a later editor revision", () => {
  const editor = between("function ParsedProfileEditor", "function TextAreaField");
  const save = between("async function save()", "if (!editing)");

  assert.match(mutationController, /const parsedProfileDraftRevisionRef = useRef\(0\)/);
  assert.match(editor, /parsedProfileDraftRevisionRef: draftRevisionRef/);
  assert.match(editor, /parsedProfileDraft: draft/);
  assert.match(editor, /parsedProfileEditing: editing/);
  assert.match(editor, /function changeDraft[\s\S]*draftRevisionRef\.current \+= 1;\s*setDraft\(\(current\) => \(\{ \.\.\.current, \.\.\.patch \}\)\)/);
  assert.equal(
    editor.match(/onChange=\{\([^)]*\) => changeDraft\(\{/g)?.length,
    11,
    "every editable parsed-profile field must advance the revision",
  );
  assert.doesNotMatch(editor, /onChange=\{[^}]*setDraft/);

  assert.match(save, /const editorRevision = draftRevisionRef\.current;\s*const submittedDraft = \{ \.\.\.draft \};/);
  assert.ok(save.indexOf("const submittedDraft = { ...draft };") < save.indexOf("await runMutation"));
  for (const field of ["full_name", "resume_email", "phone", "school", "degree", "grad_date", "coursework", "objective", "skills", "languages"]) {
    assert.match(save, new RegExp(`submittedDraft\\.${field}`), `${field} must come from the submitted snapshot`);
  }
  assert.match(save, /parseEditableLines\(submittedDraft\.target_roles\)/);
  assert.equal(
    save.match(/if \(draftRevisionRef\.current !== editorRevision\) return;/g)?.length,
    2,
    "both a late profile success and a late failure must be inert after another edit",
  );
  const successGuard = save.indexOf("if (draftRevisionRef.current !== editorRevision) return;");
  assert.ok(successGuard < save.indexOf("onSaved({ ...updated"));
  assert.ok(successGuard < save.indexOf("setEditing(false)"));
  assert.match(save, /finally \{\s*onSavingChange\(false\);\s*\}/);
});

test("profile reads cannot replace an uploaded or newly saved durable profile", () => {
  const loadProfile = between("const loadProfile", "const loadBank");
  const upload = between("async function upload", "async function saveBank");

  assert.match(mutationController, /const profileRevisionRef = useRef\(0\)/);
  assert.match(loadProfile, /const requestRevision = profileRevisionRef\.current/);
  assert.equal(
    loadProfile.match(/if \(profileRevisionRef\.current !== requestRevision\) return;/g)?.length,
    2,
    "both a stale profile success and failure must be inert",
  );
  const loadSuccessGuard = loadProfile.indexOf("if (profileRevisionRef.current !== requestRevision) return;");
  assert.ok(loadSuccessGuard < loadProfile.indexOf("setProfile(result.profile)"));
  assert.match(upload, /profileRevisionRef\.current \+= 1;\s*setProfile\(/);
  assert.match(source, /onProfileChange=\{\(next\) => \{\s*profileRevisionRef\.current \+= 1;\s*setProfile\(next\)/);
});

test("resume upload waits until both editors have settled without breaking retry", () => {
  const chooseUpload = between("function chooseUpload", "return (");

  assert.match(source, /const uploadBlockedReason = parsedProfileEditing && entriesDirty/);
  assert.match(source, /const uploadReady = [\s\S]{0,300}?&& !parsedProfileEditing\s*&& !entriesDirty/);
  assert.match(chooseUpload, /if \(!file \|\| !uploadReady \|\| mutations\.isActive\(\)\) return/);
  assert.match(source, /Save or cancel profile edits before replacing your resume\./);
  assert.match(source, /Save work history changes before replacing your resume\./);
  assert.match(source, /aria-describedby=\{uploadBlockedReason \? "resume-upload-blocked-reason" : undefined\}/);
  /* Retry re-runs chooseUpload only for a request that genuinely failed; a client-rejected file
     re-opens the picker instead, because revalidating the same File can only fail again. Both
     arms stay behind the uploadReady disable. */
  assert.match(source, /chooseUpload\(selectedFile\);[\s\S]{0,220}?disabled=\{!uploadReady\}/);
  assert.match(source, /selectedFileRejected[\s\S]{0,80}?fileRef\.current\?\.click\(\)/);
});

test("revision guards retain the exclusive resume mutation boundary across tab and route remounts", () => {
  assert.match(mutationController, /createExclusiveMutationCoordinator<ResumeMutation>\(\)/);
  assert.match(mutationController, /if \(coordinator\.isActive\(\)\) return "blocked";/);
  assert.match(mutationController, /setActiveMutation\(mutation\);[\s\S]{0,180}?await coordinator\.run\(mutation, operation\)/);
  assert.match(mutationController, /if \(!coordinator\.isActive\(\)\) setActiveMutation\(null\)/);
  assert.match(mutationController, /const \[profile, setProfile\] = useState<ResumeParsedProfile \| null \| "missing">\(null\)/);
  assert.match(mutationController, /const profileRevisionRef = useRef\(0\)/);
  assert.match(mutationController, /const \[uploading, setUploading\] = useState\(false\)/);
  assert.match(mutationController, /const \[selectedFile, setSelectedFile\] = useState<File \| null>\(null\)/);
  assert.match(mutationController, /const \[parsedProfileEditing, setParsedProfileEditing\] = useState\(false\)/);
  assert.match(mutationController, /const \[parsedProfileDraft, setParsedProfileDraft\] = useState<ResumeParsedProfileDraft>/);
  assert.match(mutationController, /const \[entries, setEntries\] = useState<ExperienceEntry\[\] \| null>\(null\)/);
  assert.match(mutationController, /const \[savedEntriesJson, setSavedEntriesJson\] = useState\(""\)/);
  assert.match(mutationController, /if \(!controller\) throw new Error\("useResumeMutationController must be used within ResumeMutationProvider"\)/);
  assert.match(dashboardShell, /<BillingProvider>[\s\S]*<OutreachOperationProvider>[\s\S]*<ResumeMutationProvider>/);
  assert.match(dashboardShell, /<main[^>]*>\{children\}<\/main>[\s\S]*<\/ResumeMutationProvider>[\s\S]*<\/OutreachOperationProvider>/);
  assert.doesNotMatch(documents, /ResumeMutationProvider/);
  assert.match(documents, /<MotionPanel key=\{tab \?\? "loading"\}/);
  assert.match(source, /const mutations = useResumeMutationController\(\)/);
  assert.match(source, /const shouldLoadProfileOnMount = useRef\([\s\S]{0,180}?profile === null[\s\S]{0,180}?!mutations\.isActive\(\)/);
  assert.match(source, /const shouldLoadBankOnMount = useRef\([\s\S]{0,180}?entries === null[\s\S]{0,180}?!mutations\.isActive\(\)/);
  assert.match(source, /if \(shouldLoadProfileOnMount\.current\) requests\.push\(loadProfile\(\)\)/);
  assert.match(source, /if \(shouldLoadBankOnMount\.current\) requests\.push\(loadBank\(\)\)/);
  assert.match(source, /resumeSession=\{mutations\}/);
  assert.match(source, /if \(!entries \|\| mutations\.isActive\(\)\) return;[\s\S]*mutations\.run\("save"/);
  assert.match(source, /mutations\.run\("parsed-profile", operation\)/);
  assert.match(source, /function chooseUpload[\s\S]{0,160}mutations\.isActive\(\)/);
  assert.match(source, /const bankSavePending = saving \|\| mutations\.activeMutation === "save"/);
  assert.match(source, /disabled=\{mutationBusy \|\| bankRefreshing/);
});
