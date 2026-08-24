import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documents = await readFile(new URL("../app/dashboard/documents/page.tsx", import.meta.url), "utf8");
const resume = await readFile(new URL("../app/dashboard/resume/page.tsx", import.meta.url), "utf8");
const dashboardShell = await readFile(new URL("../app/dashboard/dashboard-shell.tsx", import.meta.url), "utf8");
const resumeMutations = await readFile(new URL("../app/dashboard/resume/mutation-controller.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../lib/api.ts", import.meta.url), "utf8");

function shippedCode(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("Documents keeps failed resources distinct from valid empty libraries", () => {
  const shipped = shippedCode(documents);

  for (const swallowedFailure of [
    /\/resume\/history"\)\.catch\(\(\) => \(\{ resumes: \[\] \}\)\)/,
    /\/cover-letters"\)\.catch\(\(\) => \(\{ cover_letters: \[\] \}\)\)/,
    /\/applications\?limit=200"\)\.catch\(\(\) => \(\{ applications: \[\] \}\)\)/,
    /\/documents"\)\.catch\(\(\) => \[\]\)/,
    /\/profile\/application"\)\.catch\(\(\) => \(\{\}\)\)/,
  ]) {
    assert.equal(swallowedFailure.test(shipped), false, `${swallowedFailure} must not turn a failure into empty data`);
  }

  assert.match(shipped, /type DocumentResource = "resumes" \| "coverLetters" \| "applications" \| "attachments" \| "profile"/);
  assert.match(shipped, /"profile",\s*getApplicationProfile,\s*setProfile,/);
  assert.match(api, /if \(e instanceof ApiError && e\.status === 404\) return \{\} as ApplicationProfile/);
  assert.match(shipped, /title="Tailored resumes did not load\."[\s\S]{0,220}?onRetry=\{\(\) => retryDocumentResource\(loadResumes\)\}/);
  assert.match(shipped, /title="Saved answers did not load\."[\s\S]{0,220}?onRetry=\{\(\) => retryDocumentResource\(loadProfile\)\}/);
  assert.match(shipped, /title="Attachments did not load\."[\s\S]{0,220}?onRetry=\{\(\) => retryDocumentResource\(loadAttachments\)\}/);
});

test("Cover letters retain successful partial data while missing dependencies are retryable", () => {
  const shipped = shippedCode(documents);

  assert.match(shipped, /const coverLetterResourcesFailed = Boolean\(resourceErrors\.coverLetters \|\| resourceErrors\.resumes \|\| resourceErrors\.applications\)/);
  assert.match(shipped, /\(!coverLetterResourcesFailed \|\| hasCoverLetterContent\) && \(/);
  assert.match(shipped, /canonical=\{resourceErrors\.coverLetters \? \[\] : coverLetters\}/);
  assert.match(shipped, /legacy=\{resourceErrors\.resumes \? \[\] : legacyCoverLetters\}/);
  assert.match(shipped, /title="Cover letters did not fully load\."[\s\S]{0,260}?onRetry=\{retryCoverLetterResources\}/);
});

test("Resume load failures render recovery instead of missing or empty data", () => {
  const shipped = shippedCode(resume);

  assert.match(shipped, /if \(reason instanceof ApiError && reason\.status === 404\) return "missing" as const;\s*throw reason;/);
  assert.equal(/experience-bank"\)\.catch\([\s\S]{0,100}?entries: \[\]/.test(shipped), false);
  assert.match(shipped, /title="Your resume did not load\."[\s\S]{0,220}?onRetry=\{retryProfile\}/);
  assert.match(shipped, /title="Work history did not load\."[\s\S]{0,220}?onRetry=\{retryBank\}/);
  assert.match(shipped, /entries === null \? \(\s*bankLoadError \? null :\s*<ShimmerRows rows=\{3\} \/>/);
});

test("A successful upload exposes failures from its follow-up refresh", () => {
  const shipped = shippedCode(resume);

  assert.match(shipped, /setEntries\(null\);\s*await refreshUploadedProfile\(\);/);
  assert.match(shipped, /loadBank\("Your resume uploaded, but its refreshed work history could not load\.", true\)/);
  assert.match(shipped, /loadTargeting\("Your resume uploaded, but target roles could not refresh\.", true, true\)/);
  assert.match(shipped, /delete parsedProfileWithoutTargetRoles\.target_roles/);
  assert.match(shipped, /return base \? \{ \.\.\.base, target_roles: targeting\.titles \} : current/);
  assert.match(shipped, /return base \? \{ \.\.\.base, target_roles: inferredRoles \} : current/);
  assert.match(shipped, /onClick=\{retryTargeting\}>\s*Try refresh again/);
});

test("A failed authoritative targeting read cannot expose parser guesses for editing", () => {
  const shipped = shippedCode(resume);

  assert.match(shipped, /delete profileWithoutTargetRoles\.target_roles/);
  assert.match(shipped, /targetingError: userFacingError\(reason, "Your resume loaded, but target roles could not load\."\)/);
  assert.match(shipped, /profile !== null && profile !== "missing" && !uploadPending && !profileRefreshing && targetingRefreshError === null/);
});

test("all retryable document reads share pending and latest-response coordination", () => {
  const shippedDocuments = shippedCode(documents);
  const shippedResume = shippedCode(resume);
  const mutationBoundary = shippedCode(resumeMutations);

  assert.match(shippedDocuments, /createLatestRequestCoordinator<DocumentResource>\(\)/);
  assert.match(shippedDocuments, /resourceRequests\.run\(resource, request/);
  assert.match(shippedDocuments, /setResourcePending\(resource, true\);\s*setResourceError\(resource, null\)/);
  assert.match(shippedDocuments, /onSettled: \(\) => setResourcePending\(resource, false\)/);
  assert.match(shippedDocuments, /onChanged=\{\(\) => void loadCoverLetters\(true\)\}/);
  assert.match(shippedDocuments, /aria-busy=\{tab === null \|\| activeTabPending\}/);

  assert.match(mutationBoundary, /type ResumeResource = "profile" \| "bank" \| "targeting"/);
  assert.match(mutationBoundary, /createLatestRequestCoordinator<ResumeResource>\(\)/);
  assert.match(mutationBoundary, /resourceRequests:/);
  for (const resource of ["profile", "bank", "targeting"]) {
    assert.match(shippedResume, new RegExp(`resourceRequests\\.run(?:<ProfileLoadResult>)?\\(\\s*"${resource}"`));
    assert.match(shippedResume, new RegExp(`setResourcePending\\("${resource}", true\\)`));
    assert.match(shippedResume, new RegExp(`onSettled: \\(\\) => setResourcePending\\("${resource}", false\\)`));
  }
  assert.match(shippedResume, /const uploadReady = [\s\S]{0,260}?&& !profileRefreshing\s*&& !bankRefreshing/);
  assert.match(shippedResume, /disabled=\{mutationBusy \|\| bankRefreshing \|\| entries === null/);
});

test("resume upload, bank save, and parsed-profile save cannot replace each other concurrently", () => {
  const shipped = shippedCode(resume);
  const mutationBoundary = shippedCode(resumeMutations);

  assert.match(mutationBoundary, /createExclusiveMutationCoordinator<ResumeMutation>\(\)/);
  assert.match(mutationBoundary, /if \(coordinator\.isActive\(\)\) return "blocked";/);
  assert.match(mutationBoundary, /const \[profile, setProfile\] = useState<ResumeParsedProfile \| null \| "missing">\(null\)/);
  assert.match(mutationBoundary, /const \[uploading, setUploading\] = useState\(false\)/);
  assert.match(mutationBoundary, /const \[parsedProfileEditing, setParsedProfileEditing\] = useState\(false\)/);
  assert.match(mutationBoundary, /const parsedProfileDraftRevisionRef = useRef\(0\)/);
  assert.match(mutationBoundary, /const \[entries, setEntries\] = useState<ExperienceEntry\[\] \| null>\(null\)/);
  assert.match(dashboardShell, /<OutreachOperationProvider>[\s\S]*<ResumeMutationProvider>/);
  assert.match(dashboardShell, /<main[^>]*>\{children\}<\/main>[\s\S]*<\/ResumeMutationProvider>/);
  assert.doesNotMatch(documents, /ResumeMutationProvider/);
  assert.match(documents, /<MotionPanel key=\{tab \?\? "loading"\}/);
  assert.match(shipped, /const shouldLoadProfileOnMount = useRef\([\s\S]{0,180}?profile === null[\s\S]{0,180}?!mutations\.isActive\(\)/);
  assert.match(shipped, /const shouldLoadBankOnMount = useRef\([\s\S]{0,180}?entries === null[\s\S]{0,180}?!mutations\.isActive\(\)/);
  assert.match(shipped, /if \(shouldLoadProfileOnMount\.current\) requests\.push\(loadProfile\(\)\)/);
  assert.match(shipped, /if \(shouldLoadBankOnMount\.current\) requests\.push\(loadBank\(\)\)/);
  assert.match(shipped, /mutations\.run\("upload", async \(\) =>/);
  assert.match(shipped, /if \(!entries \|\| mutations\.isActive\(\)\) return;[\s\S]{0,180}?await mutations\.run\("save", async \(\) =>/);
  assert.match(shipped, /mutations\.run\("parsed-profile", operation\)/);
  assert.match(shipped, /runMutation\(async \(\) =>[\s\S]{0,160}?onSavingChange\(true\)/);
  const parsedMutation = shipped.slice(shipped.indexOf("const result = await runMutation"), shipped.indexOf('if (result === "blocked")'));
  assert.ok(parsedMutation.indexOf("onSaved({ ...updated") >= 0);
  assert.ok(parsedMutation.indexOf("onSavingChange(false)") > parsedMutation.indexOf("onSaved({ ...updated"));
  assert.match(shipped, /function chooseUpload[\s\S]{0,140}?mutations\.isActive\(\)/);
  assert.match(shipped, /disabled=\{mutationBusy \|\| !uploadReady\}/);
  assert.match(shipped, /disabled=\{mutationBusy \|\| bankRefreshing/);
});

test("retries move focus away from controls that unmount for pending state", () => {
  const shippedDocuments = shippedCode(documents);
  const shippedResume = shippedCode(resume);

  assert.match(shippedDocuments, /function retryDocumentResource[\s\S]{0,180}?restoreFocusAfterRetry\("documents-panel"\)/);
  assert.match(shippedDocuments, /function retryCoverLetterResources[\s\S]{0,420}?restoreFocusAfterRetry\("documents-panel"\)/);
  assert.match(shippedDocuments, /id="documents-panel"[\s\S]{0,300}?role="tabpanel"[\s\S]{0,300}?tabIndex=\{0\}/);

  assert.match(shippedResume, /function retryProfile[\s\S]{0,160}?restoreFocusAfterRetry\("resume-profile-heading"\)/);
  assert.match(shippedResume, /function retryBank[\s\S]{0,160}?restoreFocusAfterRetry\("resume-bank-heading"\)/);
  assert.match(shippedResume, /function retryTargeting[\s\S]{0,200}?restoreFocusAfterRetry\("resume-profile-heading"\)/);
  assert.match(shippedResume, /id="resume-profile-heading" tabIndex=\{-1\}/);
  assert.match(shippedResume, /id="resume-bank-heading" tabIndex=\{-1\}/);
});
