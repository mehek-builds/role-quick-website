import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PostHog initializes before hydration with error capture enabled", async () => {
  const source = await read("instrumentation-client.ts");
  assert.match(source, /NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN/);
  assert.match(source, /NEXT_PUBLIC_POSTHOG_HOST/);
  assert.match(source, /capture_exceptions:\s*true/);
  assert.match(source, /posthog\.init/);
});

test("analytics use the shared PostHog client instead of the legacy capture endpoint", async () => {
  const source = await read("lib/analytics.ts");
  assert.match(source, /posthog\.capture\(event, payload\)/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_POSTHOG_KEY/);
  assert.doesNotMatch(source, /sendBeacon/);
});

test("verified sessions identify users and cleared sessions reset identity", async () => {
  const source = await read("lib/api.ts");
  assert.match(source, /posthog\.identify/);
  assert.match(source, /posthog\.reset/);
  assert.match(source, /identifyVerifiedUser\(normalizedEmail\)/);
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
