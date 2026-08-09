import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const GAPS_STEP = readFileSync(new URL("../components/start/steps.tsx", import.meta.url), "utf8");
const BASE_STEP = readFileSync(new URL("../components/start/BaseResumeStep.tsx", import.meta.url), "utf8");

describe("referral source onboarding gap", () => {
  test("the backend gap has a reachable input on the dedicated gap screen", () => {
    assert.match(GAPS_STEP, /referral_source_default:\s*\{/);
    assert.match(GAPS_STEP, /gaps\.includes\("referral_source_default"\)/);
    assert.match(GAPS_STEP, /htmlFor="gap-referral_source_default"/);
    assert.match(GAPS_STEP, /field\("referral_source_default"\)/);
  });

  test("gap saving writes the exact typed profile field through the generic contract", () => {
    assert.match(GAPS_STEP, /for \(const \[k, v\] of Object\.entries\(values\)\)/);
    assert.match(GAPS_STEP, /\(body as Record<string, string>\)\[k\] = v\.trim\(\)/);
    assert.match(GAPS_STEP, /putApplicationProfile\(body\)/);
  });

  test("onboarding does not suggest reusable job-board or company-site claims", () => {
    assert.match(GAPS_STEP, /Litos detects job boards for each application\./);
    assert.match(BASE_STEP, /Litos detects job boards for each application\./);
    assert.doesNotMatch(BASE_STEP, /placeholder="[^"]*(?:Job board|Company website)/i);
    assert.doesNotMatch(GAPS_STEP, /placeholder:\s*"[^"]*(?:Job board|Company website)/i);
  });
});
