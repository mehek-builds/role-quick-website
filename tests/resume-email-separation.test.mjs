import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const applications = readFileSync("app/dashboard/applications/page.tsx", "utf8");
const dashboard = readFileSync("app/dashboard/page.tsx", "utf8");
const dailyMatches = readFileSync("features/applications/domain/daily-matches.ts", "utf8");
const resumePage = readFileSync("app/dashboard/resume/page.tsx", "utf8");

describe("personal resume email and portal routing email stay separate", () => {
  test("every dashboard generation path sends resume_email as the resume contact", () => {
    assert.match(applications, /const resumeEmail = identity\.resume_email\?\.trim\(\)/);
    assert.match(applications, /email: resumeEmail/);
    assert.match(applications, /if \(!resumeEmail\) throw new Error\("Add the personal email/);
    assert.doesNotMatch(applications, /email: identity\.email\?\.trim\(\) \|\| getStoredEmail\(\)/);
    assert.match(dailyMatches, /const resumeEmail = identity\.resume_email\?\.trim\(\)/);
    assert.match(dailyMatches, /if \(!resumeEmail\) throw new Error/);
    assert.doesNotMatch(dailyMatches, /email: identity\.email\?\.trim\(\) \|\| storedEmail/);
    assert.match(dashboard, /resumeGenerationBody\(completeJob, identity, applicationProfile, "hover_prewarm", operationId\)/);
    assert.match(dashboard, /resumeGenerationBody\(completeJob, identity, applicationProfile, initiation, operationId\)/);
    assert.match(dashboard, /if \(!identity\.resume_email\?\.trim\(\)\) \{/);
  });

  test("the resume screen edits the personal address without relabeling the login", () => {
    assert.match(resumePage, /resumeEmail=\{str\("resume_email"\) \?\? ""\}/);
    assert.match(resumePage, /resume_email: submittedDraft\.resume_email/);
    assert.match(resumePage, /label="Resume email"/);
    assert.match(resumePage, /Litos login email:/);
  });

  test("application recovery keeps the generated portal address internal", () => {
    assert.match(applications, /\/packet-audit`, \{ method: "POST" \}/);
    assert.match(applications, /revalidateAcknowledgedPacketEvidence\(currentEvidence, requestedId, currentAudit, Date\.now\(\)\)/);
    assert.doesNotMatch(applications, /manualTrialPacket/);
    assert.doesNotMatch(applications, /\/submission\/manual-handoff/);
    assert.doesNotMatch(applications, /Portal routing email:/);
    assert.doesNotMatch(applications, /review\.applicant_email\?\.address/);
    assert.match(applications, /<ResumePaper spec=\{stripMetadata\(packet\.spec\)\}/);
  });
});
