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
  assert.match(source, /capture_pageview:\s*"history_change"/);
  assert.match(source, /disable_external_dependency_loading:\s*true/);
  assert.match(source, /disable_session_recording:\s*true/);
  assert.match(source, /before_send:\s*sanitizePostHogEvent/);
  assert.match(source, /posthog\.init/);
});

test("PostHog URL properties discard account IDs, queries, fragments, and referrers", async () => {
  const { sanitizePostHogEvent } = await import("../lib/posthog-privacy.ts");
  const event = sanitizePostHogEvent({
    event: "$pageview",
    properties: {
      $current_url: "https://trylitos.com/dashboard/settings?connected_account_id=secret#done",
      $initial_current_url: "https://trylitos.com/dashboard/applications?application=private-id",
      $referrer: "https://accounts.example/callback?code=secret",
      $utm_source: "private-campaign",
      $set_once: {
        $initial_current_url: "https://trylitos.com/dashboard/jobs?job=private-id",
        $initial_referrer: "https://accounts.example/callback?code=secret",
      },
    },
  });
  assert.equal(event.properties.$current_url, "/dashboard/settings");
  assert.equal(event.properties.$initial_current_url, "/dashboard/applications");
  assert.deepEqual(event.properties.$set_once, { $initial_current_url: "/dashboard/jobs" });
  assert.equal(event.properties.$referrer, undefined);
  assert.equal(event.properties.$utm_source, undefined);
  assert.doesNotMatch(JSON.stringify(event), /secret|private-id/);
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

test("the privacy policy discloses extension analytics and its local retry queue", async () => {
  const source = await read("app/privacy/page.tsx");
  assert.match(source, /Chrome\s+extension actions/);
  assert.match(source, /random browser or extension\s+installation identifier/);
  assert.match(source, /does not\s+include the job URL, company or role name, resume, or form answers/);
  assert.match(source, /queues up to 50 sanitized events/);
  assert.match(source, /identifier changes when you sign out/);
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

test("zero-result target roles are monitored on both job surfaces with session deduplication", async () => {
  const [analytics, demandClient, demandTracker, publicBoard, dashboard] = await Promise.all([
    read("lib/analytics.ts"),
    read("lib/job-search-demand-client.ts"),
    read("lib/job-search-demand.ts"),
    read("app/browse-jobs/page.tsx"),
    read("app/dashboard/jobs/page.tsx"),
  ]);
  assert.match(analytics, /job_search_zero_results/);
  assert.match(demandClient, /window\.sessionStorage/);
  assert.match(demandClient, /track\("job_search_zero_results", properties\)/);
  assert.match(demandTracker, /runtime\.seen\.has/);
  assert.match(publicBoard, /ZeroResultJobSearchMonitor/);
  assert.match(dashboard, /trackZeroResultJobSearch/);
  assert.match(dashboard, /params\.set\("title", query\.trim\(\)\)/);
  assert.doesNotMatch(dashboard, /params\.set\("q", query\.trim\(\)\)/);
});

test("the privacy policy discloses zero-result job-title monitoring", async () => {
  const source = await read("app/privacy/page.tsx");
  assert.match(source, /job-title search returns no matches/);
  assert.match(source, /normalized job title/);
  assert.match(source, /email address, phone number, or website/);
});
