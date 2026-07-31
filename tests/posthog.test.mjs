import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PostHog initializes before hydration with privacy-sensitive collection disabled", async () => {
  const source = await read("instrumentation-client.ts");
  assert.match(source, /NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN/);
  assert.match(source, /NEXT_PUBLIC_POSTHOG_HOST/);
  assert.match(source, /autocapture:\s*false/);
  assert.match(source, /capture_exceptions:\s*false/);
  assert.match(source, /disable_external_dependency_loading:\s*true/);
  assert.match(source, /disable_session_recording:\s*true/);
  assert.match(source, /posthog\.init/);
});

test("analytics use the shared PostHog client instead of the legacy capture endpoint", async () => {
  const source = await read("lib/analytics.ts");
  assert.match(source, /posthog\.capture\(event, payload\)/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_POSTHOG_KEY/);
  assert.doesNotMatch(source, /sendBeacon/);
});

test("cleared or changed sessions reset anonymous analytics identity without sending email", async () => {
  const source = await read("lib/api.ts");
  assert.match(source, /resetAnalytics\(\)/);
  assert.doesNotMatch(source, /posthog\.identify/);
  assert.doesNotMatch(source, /email:\s*distinctId/);
});

test("completed applications are captured on submission transitions, not receipt rendering", async () => {
  const source = await read("app/dashboard/applications/page.tsx");
  assert.match(source, /captureCompletedSubmission\(result, "poll"\)/);
  assert.match(source, /captureCompletedSubmission\(result, "autopilot"\)/);
  assert.match(source, /captureCompletedSubmission\(result, "review"\)/);
  assert.match(source, /captureCompletedSubmission\(result, "final_approval"\)/);
  const receipt = source.slice(source.indexOf("function SubmissionReceipt"));
  assert.doesNotMatch(receipt, /track\("application_submission_completed"/);
});

test("the privacy policy discloses PostHog and the disabled collection features", async () => {
  const source = await read("app/privacy/page.tsx");
  assert.match(source, /We use PostHog/);
  assert.match(source, /Automatic click and form tracking, session recording, and automatic/);
  assert.match(source, /We do\s+not send your email address or account identity to PostHog/);
});

test("the core conversion events remain instrumented", async () => {
  const files = await Promise.all([
    read("app/login/page.tsx"),
    read("app/contact/page.tsx"),
    read("app/dashboard/applications/page.tsx"),
    read("app/dashboard/settings/page.tsx"),
  ]);
  const source = files.join("\n");
  for (const event of [
    "authentication_completed",
    "contact_form_submitted",
    "application_generation_completed",
    "application_submission_requested",
    "application_submission_completed",
    "checkout_started",
    "account_data_exported",
    "account_deleted",
  ]) {
    assert.match(source, new RegExp(`track\\(\\"${event}\\"`));
  }
});
