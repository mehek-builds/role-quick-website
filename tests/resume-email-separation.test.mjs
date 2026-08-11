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
    assert.match(dashboard, /resumeGenerationBody\(completeJob, identity, applicationProfile\)/);
    assert.match(dashboard, /if \(!identity\.resume_email\?\.trim\(\)\) return/);
  });

  test("the resume screen edits the personal address without relabeling the login", () => {
    assert.match(resumePage, /resumeEmail=\{str\("resume_email"\) \?\? ""\}/);
    assert.match(resumePage, /resume_email: draft\.resume_email/);
    assert.match(resumePage, /label="Resume email"/);
    assert.match(resumePage, /Litos login email:/);
  });

  test("the attended application panel labels the generated address as portal-only", () => {
    assert.match(applications, /manualTrialPacket=\{manualTrialEvidence\?\.response \?\? null\}/);
    assert.match(applications, /manualTrialPacketEvidenceIsFresh\(selected\.id, activePacketEvidence\)/);
    assert.match(applications, /\/packet-audit`, \{ method: "POST" \}/);
    assert.match(applications, /serverRevalidatedAt: Date\.now\(\)/);
    assert.match(applications, /async function openManualAttendedHandoff\(\)/);
    assert.match(applications, /await api<ManualHandoffResponse>\(`\/applications\/\$\{submission\.application_id\}\/submission\/manual-handoff`, \{ method: "POST" \}\)/);
    assert.match(applications, /manualHandoffMatchesPacket\(current, attendedHandoffUrl, manualTrialPacket\)/);
    assert.match(applications, /companyTab\.location\.replace\(handoff\.url\)/);
    assert.match(applications, /<Button onClick=\{\(\) => void openManualAttendedHandoff\(\)\}/);
    assert.doesNotMatch(applications, /<ButtonLink href=\{attendedHandoffUrl\}[\s\S]{0,120}Open manually/);
    assert.doesNotMatch(applications, /Portal routing email:[\s\S]{0,120}review\.applicant_email\?\.address/);
    assert.match(applications, /Resume email:/);
    assert.match(applications, /Portal routing email:/);
    assert.match(applications, /The PDF keeps your personal resume email\./);
  });
});
