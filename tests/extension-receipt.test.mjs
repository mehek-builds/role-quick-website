import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const applications = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

test("Chrome extension receipts do not require a managed-browser screenshot", () => {
  assert.match(api, /screenshot_url\?: string/);
  assert.match(applications, /const receiptScreenshotUrl = safeEvidenceImageUrl\(receipt\?\.screenshot_url\)/);
  assert.match(applications, /receiptScreenshotUrl && <img src=\{receiptScreenshotUrl\}/);
});

test("the new application button does not pass its click event as the draft", () => {
  assert.match(applications, /onFill=\{\(\) => void fillApplication\(\)\}/);
  assert.match(applications, /onTailor=\{\(upgradeTrigger\) => void createApplication\(newApplication, upgradeTrigger\)\}/);
  assert.match(applications, /onClick=\{\(event\) => onTailor\(event\.currentTarget\)\}/);
  assert.doesNotMatch(applications, /onFill=\{fillApplication\}/);
  assert.doesNotMatch(applications, /onTailor=\{createApplication\}/);
});
