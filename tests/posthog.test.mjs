import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PostHog initializes before hydration with autocapture and exception capture disabled", async () => {
  const source = await read("instrumentation-client.ts");
  assert.match(source, /NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN/);
  assert.match(source, /NEXT_PUBLIC_POSTHOG_HOST/);
  assert.match(source, /autocapture:\s*false/);
  assert.match(source, /capture_exceptions:\s*false/);
  assert.match(source, /capture_pageview:\s*"history_change"/);
  assert.match(source, /disable_external_dependency_loading:\s*true/);
  assert.match(source, /before_send:\s*sanitizePostHogEvent/);
  assert.match(source, /posthog\.init/);
});

test("PostHog does not force session recording off in code", async () => {
  /* Session recording is controlled from the PostHog project settings
     (Mehek, 2026-08-27), not from a client-side flag - this guards against
     someone reflexively re-adding disable_session_recording. */
  const source = await read("instrumentation-client.ts");
  assert.doesNotMatch(source, /disable_session_recording:\s*(true|false)/);
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

test("identify has exactly one call site, and it is the one carrying the no-PII invariant", async () => {
  /* This guard existed for lib/api.ts only, and a change that added an identify
   * call to the instrumentation entry point sailed past it: the wrapper is
   * named identifyUser, so /posthog\.identify/ never matched, and CI stayed
   * green while a second identify path appeared. Both callers are pinned now. */
  for (const file of ["lib/api.ts", "instrumentation-client.ts"]) {
    const source = await read(file);
    // Match a CALL, not the words: this file's own comment explains the rule
    // and would otherwise trip the guard it documents.
    assert.doesNotMatch(
      source,
      /posthog\.identify\s*\(/,
      `${file} must call identifyUser from lib/analytics, not posthog.identify directly`,
    );
  }

  const analytics = await read("lib/analytics.ts");
  assert.match(analytics, /export function identifyUser/);
  // identify takes an optional property bag; the obvious thing to put in it is
  // the email address, which is exactly what must never be sent.
  assert.match(analytics, /posthog\.identify\(userId\)/);
  assert.doesNotMatch(analytics, /posthog\.identify\(userId,/);
});

test("an expired or malformed token never names a person", async () => {
  const source = await read("lib/session-identity.ts");
  // Shared-browser and forged-token protection. posthog person merges are
  // irreversible, so these two checks are the difference between naming the
  // right account and permanently fusing two people's profiles.
  assert.match(source, /exp \* 1000 <= now/);
  assert.match(source, /UUID_RE\.test\(id\)/);
});

test("completed applications are captured on submission transitions, not receipt rendering", async () => {
  const source = await read("app/dashboard/applications/page.tsx");
  assert.match(source, /captureCompletedSubmission\(result, "poll"\)/);
  assert.match(source, /captureCompletedSubmission\(result, "autopilot"\)/);
  // "review" and "restart" are the same call site: a restart is prepareApplication with one extra
  // flag, deliberately, so there is no second submit-request path. The source still distinguishes
  // them, because a run started by a timed-out packet is not the same funnel step as a first fill.
  assert.match(source, /captureCompletedSubmission\(result, options\.restart \? "restart" : "review"\)/);
  assert.match(source, /captureCompletedSubmission\(result, "final_approval"\)/);
  const receipt = source.slice(source.indexOf("function SubmissionReceipt"));
  assert.doesNotMatch(receipt, /track\("application_submission_completed"/);
});

test("the privacy policy discloses PostHog, the disabled collection features, and session recording", async () => {
  const source = await read("app/privacy/page.tsx");
  assert.match(source, /We use PostHog/);
  assert.match(source, /Automatic click and form tracking and automatic error capture are\s+turned off/);

  /* Pins the same fact the code comment in instrumentation-client.ts states:
     recording masks typed input, not rendered text or images. Session
     recording went from disclosed-as-off to disclosed-as-on with masking
     caveats (Mehek, 2026-08-27) - this assertion is the guard against the
     code and the policy drifting apart the way the account-identity
     disclosure below already did once. */
  assert.match(source, /Session recording is on/);
  assert.match(source, /does not mask rendered page text or images/);

  /* This assertion used to pin "We do not send your email address or account
   * identity to PostHog". That sentence stopped being true the moment identify
   * shipped, and the test kept passing because it only greps the policy file,
   * never the behaviour. It now pins the disclosure that matches what the code
   * actually does: the account id IS sent, the email is NOT, and deleting the
   * account deletes the profile. */
  assert.match(source, /we send PostHog your Litos\s+account identifier/);
  assert.match(source, /We do not send your email address, your name, or anything\s+you have typed/);
  assert.match(source, /we delete the linked PostHog profile/);
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
    read("components/billing/BillingProvider.tsx"),
    read("components/pricing/PlanCards.tsx"),
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
