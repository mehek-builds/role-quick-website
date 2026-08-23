import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documents = await readFile(new URL("../app/dashboard/documents/page.tsx", import.meta.url), "utf8");
const resume = await readFile(new URL("../app/dashboard/resume/page.tsx", import.meta.url), "utf8");
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
  assert.match(shipped, /setProfile\(await getApplicationProfile\(\)\)/);
  assert.match(api, /if \(e instanceof ApiError && e\.status === 404\) return \{\} as ApplicationProfile/);
  assert.match(shipped, /title="Tailored resumes did not load\."[\s\S]{0,220}?onRetry=\{\(\) => void loadResumes\(\)\}/);
  assert.match(shipped, /title="Saved answers did not load\."[\s\S]{0,220}?onRetry=\{\(\) => void loadProfile\(\)\}/);
  assert.match(shipped, /title="Attachments did not load\."[\s\S]{0,220}?onRetry=\{\(\) => void loadAttachments\(\)\}/);
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
  assert.match(shipped, /title="Your resume did not load\."[\s\S]{0,220}?onRetry=\{\(\) => void loadProfile\(\)\}/);
  assert.match(shipped, /title="Work history did not load\."[\s\S]{0,220}?onRetry=\{\(\) => void loadBank\(\)\}/);
  assert.match(shipped, /entries === null \? \(\s*bankLoadError \? null :\s*<ShimmerRows rows=\{3\} \/>/);
});

test("A successful upload exposes failures from its follow-up refresh", () => {
  const shipped = shippedCode(resume);

  assert.match(shipped, /setEntries\(null\);\s*await refreshUploadedProfile\(\);/);
  assert.match(shipped, /loadBank\("Your resume uploaded, but its refreshed work history could not load\."\)/);
  assert.match(shipped, /loadTargeting\("Your resume uploaded, but target roles could not refresh\.", true\)/);
  assert.match(shipped, /delete parsedProfileWithoutTargetRoles\.target_roles/);
  assert.match(shipped, /return base \? \{ \.\.\.base, target_roles: targeting\.titles \} : current/);
  assert.match(shipped, /return base \? \{ \.\.\.base, target_roles: inferredRoles \} : current/);
  assert.match(shipped, /onClick=\{\(\) => void loadTargeting\("Target roles could not load\.", true\)\}>\s*Try refresh again/);
});

test("A failed authoritative targeting read cannot expose parser guesses for editing", () => {
  const shipped = shippedCode(resume);

  assert.match(shipped, /delete profileWithoutTargetRoles\.target_roles/);
  assert.match(shipped, /setTargetingRefreshError\(userFacingError\(reason, "Your resume loaded, but target roles could not load\."\)\)/);
  assert.match(shipped, /profile !== null && profile !== "missing" && !uploading && targetingRefreshError === null/);
});
