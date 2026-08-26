import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("identityless resolution controls require the server availability flag", async () => {
  const panel = await readFile(
    new URL("../components/app/SubmissionOrphanRiskPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    panel,
    /const resolutionControlsAvailable = submissionOrphanResolutionControlsAvailable\(risk\);/,
  );
  assert.match(panel, /const needsAttribution = identityless && resolutionControlsAvailable;/);
  assert.doesNotMatch(panel, /const needsAttribution = identityless && !attributed;/);
});

test("posting-scoped negative resolution attests to the exact destination check", async () => {
  const panel = await readFile(
    new URL("../components/app/SubmissionOrphanRiskPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(panel, /found: false,[\s\S]{0,80}checked_exact_destination: true/);
  assert.match(
    panel,
    /I checked this exact employer portal and confirmation email\. Nothing was sent/,
  );
  assert.doesNotMatch(panel, />\s*It was not sent\s*</);
});
