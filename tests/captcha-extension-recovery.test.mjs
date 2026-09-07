import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

describe("a managed run stopped by a rendered CAPTCHA stays inside Litos", () => {
  const applications = readFileSync(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );
  const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

  test("the frontend type retains the challenge_on_screen fact recorded by the backend", () => {
    assert.match(
      api,
      /unverified_submission\?:\s*\{[\s\S]*?challenge_on_screen\?:\s*true;[\s\S]*?\};/,
    );
  });

  test("only a live dashboard handoff grants a human-check action", () => {
    assert.match(applications, /const canFinishInDashboard = Boolean\(handoffUrl\);/);
    assert.match(applications, /dashboardHandoffAvailable: canFinishInDashboard/);
    assert.doesNotMatch(applications, /const captchaBlockedLastAttempt/);
  });

  test("the application screen never offers an extension recovery button", () => {
    const start = applications.indexOf("function SubmissionScreen(");
    const end = applications.indexOf("\nfunction SubmissionReceipt(", start);
    const screen = applications.slice(start, end);
    assert.match(screen, /Finish in this dashboard/);
    assert.match(screen, /I cleared the check/);
    assert.doesNotMatch(screen, /Open and fill with extension/);
    assert.doesNotMatch(screen, /onOpenWithExtension/);
  });

  test("clearing the embedded check records only the cleared outcome", () => {
    const start = applications.indexOf("async function completeHandoff()");
    const end = applications.indexOf("async function retryPreparation", start);
    const completion = applications.slice(start, end);
    assert.match(completion, /\/submission\/handoff-complete/);
    assert.match(completion, /JSON\.stringify\(\{ outcome: "cleared" \}\)/);
    assert.doesNotMatch(completion, /window\.open|location\.replace/);
  });

  test("a CAPTCHA without a live dashboard panel stays paused", () => {
    assert.match(applications, /Litos was not sure it finished this step\. Complete it in the browser panel here when it is available\. Otherwise, this application stays paused\./);
    assert.match(applications, /Litos cannot complete this required employer step in the dashboard\. The application stays blocked here and is not marked sent\./);
  });

  test("switching packets clears stale fill errors without creating an employer recovery path", () => {
    const selectPacket = applications.match(/const selectPacket = useCallback\(\(incoming: GeneratedResume\) => \{[\s\S]*?\n {2}\}, \[[^\]]*moveToScreen[^\]]*\]\);/)?.[0];
    assert.ok(selectPacket, "could not find the selectPacket body");
    const resets = [...selectPacket.matchAll(/setCanonicalFillError\(null\);\n\s*setSubmissionFillError\(null\);/g)];
    assert.equal(resets.length, 2);
    assert.doesNotMatch(applications, /\/submission\/manual-handoff/);
  });
});
