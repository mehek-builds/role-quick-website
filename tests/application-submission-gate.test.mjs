import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("one dashboard click authorizes preparation and employer-portal submission", async () => {
  const dashboard = await readFile(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /await prepareApplication\(questions\)/);
  assert.match(dashboard, /missingRequiredAnswers\.length > 0/);
  assert.match(dashboard, /Complete only the answers Litos does not know yet/);
  assert.match(dashboard, /Saved profile answers and completed drafts are entered automatically/);
  assert.match(dashboard, /"Submit application"/);
  assert.match(dashboard, /Your click authorizes Litos to complete this application on the employer portal/);
  assert.match(dashboard, /submission_authorized_at/);
  assert.match(dashboard, /status === "ready_for_final_approval"[\s\S]*>Continue authorized submission</);
  assert.match(dashboard, /status === "failed"[\s\S]*>Retry preparation</);
  assert.match(dashboard, /\/submit-request/);
  assert.match(dashboard, /\/submission\/approve/);
  assert.match(dashboard, /I completed the portal step/);
  assert.match(dashboard, /will not bypass CAPTCHA, MFA, login, or legal declarations/);
  assert.doesNotMatch(dashboard, /Review the answers that need your voice/);
  assert.doesNotMatch(dashboard, /Continue to \$\{questions\.length\} question/);
});

test("cover letters wait for a detected attachment field, including optional fields", async () => {
  const dashboard = await readFile(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /\/cover-letter/);
  assert.match(dashboard, /Tailored cover letter/);
  assert.match(dashboard, /saveCoverLetter/);
  assert.match(dashboard, /coverLetterDownloadUrl/);
  assert.match(dashboard, /review\.cover_letter_supported === true/);
  assert.match(dashboard, /even when the field is marked optional/);
  const creation = dashboard.slice(dashboard.indexOf("async function createApplication"), dashboard.indexOf("async function generateCoverLetter"));
  assert.doesNotMatch(creation, /\/cover-letter/);
  assert.doesNotMatch(creation, /generateCoverLetter/);
});

test("application creation uses the single-response packet and polling cannot overlap", async () => {
  const dashboard = await readFile(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /application:\s*\{\s*ats_name:/);
  assert.match(dashboard, /const created = generated\.application;[\s\S]*created\?\.spec\._review/);
  assert.match(dashboard, /window\.setTimeout\(poll/);
  assert.match(dashboard, /document\.visibilityState/);
  assert.doesNotMatch(dashboard, /setInterval\(/);
});
