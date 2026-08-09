import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression: ISSUE-044, onboarding and first-use states missed checklist guidance.
// Found by /qa on 2026-08-09.
// Report: .gstack/qa-reports/qa-report-trylitos-com-2026-08-09.md

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the first step welcomes the user, explains the path, and keeps the exit visible", async () => {
  const steps = await read("components/start/steps.tsx");
  const resume = steps.slice(steps.indexOf("export function ResumeStep"), steps.indexOf("export function InstallStep"));

  assert.match(resume, /title="Start with your resume\."/);
  assert.match(resume, /Welcome to Litos\./);
  assert.match(resume, /review the one-page version/);
  assert.match(resume, /Finish later any time\./);
  assert.match(resume, /<LaterLink onClick=\{onLater\} \/>/);
});

test("completion says setup is complete before sending the user to their jobs", async () => {
  const steps = await read("components/start/steps.tsx");
  const done = steps.slice(steps.indexOf("export function DoneStep"));

  assert.match(done, /Setup complete\. Your resume and role choices are saved\./);
  assert.match(done, /role="status"/);
  assert.match(done, /"See my jobs"/);
});

test("every shared empty state names a contextual visual", async () => {
  const paths = [
    "app/dashboard/applications/page.tsx",
    "app/dashboard/error.tsx",
    "app/dashboard/jobs/page.tsx",
    "app/dashboard/outreach/page.tsx",
    "app/dashboard/page.tsx",
  ];

  for (const path of paths) {
    const source = await read(path);
    const openings = source.match(/<EmptyState[\s\S]*?(?=>)>/g) ?? [];
    assert.ok(openings.length > 0, `${path} has no empty state`);
    for (const opening of openings) {
      assert.match(opening, /visual="(?:applications|emails|jobs|profile|error)"/, `${path} has an unillustrated empty state`);
    }
  }
});

test("filtered email results explain the filter and provide an escape route", async () => {
  const outreach = await read("app/dashboard/outreach/page.tsx");

  assert.match(outreach, /Clear the filter to see every email\./);
  assert.match(outreach, /onClick=\{\(\) => setFilter\("all"\)\}/);
  assert.match(outreach, />\s*Clear filter\s*</);
});

test("load failures are separate from empty data and offer retry actions", async () => {
  const applications = await read("app/dashboard/applications/page.tsx");
  const outreach = await read("app/dashboard/outreach/page.tsx");
  const jobs = await read("app/dashboard/jobs/page.tsx");
  const home = await read("app/dashboard/page.tsx");

  assert.match(applications, /title="Applications did not load\."/);
  assert.match(outreach, /title="Emails did not load\."/);
  assert.match(jobs, /<DataErrorState[\s\S]*?title="Jobs did not load\."/);
  assert.match(home, /title="Your dashboard did not load\."/);
  for (const source of [applications, outreach, home]) {
    assert.match(source, /visual="error"/);
    assert.match(source, />\s*Try again\s*</);
  }
  assert.match(jobs, /onRetry=\{\(\) => window\.location\.reload\(\)\}/);
});

test("an empty Tracker filter can always return to all applications", async () => {
  const applications = await read("app/dashboard/applications/page.tsx");

  assert.match(applications, /No applications in this view\./);
  assert.match(applications, /onClick=\{\(\) => setApplicationFilter\("all"\)\}/);
  assert.match(applications, /Show all applications/);
});

test("local QA can render real zero states without a live account", async () => {
  const applications = await read("app/dashboard/applications/page.tsx");
  const outreach = await read("app/dashboard/outreach/page.tsx");
  const jobs = await read("app/dashboard/jobs/page.tsx");

  assert.match(applications, /qaScenario === "empty"[\s\S]*?setPackets\(\[\]\)/);
  assert.match(outreach, /qaScenario === "empty" \? \[\] : QA_EVENTS/);
  assert.match(jobs, /qaScenario === "empty"[\s\S]*?setJobs\(\[\]\)/);
  for (const source of [applications, outreach]) {
    assert.match(source, /window\.location\.hostname === "localhost"/);
  }
});

test("local QA can render load failures without calling the backend", async () => {
  const applications = await read("app/dashboard/applications/page.tsx");
  const outreach = await read("app/dashboard/outreach/page.tsx");
  const jobs = await read("app/dashboard/jobs/page.tsx");

  assert.match(applications, /qaScenario === "error"[\s\S]*?setError\("We could not load your applications\."\)/);
  assert.match(outreach, /qaScenario === "error"[\s\S]*?setError\("We could not load your emails\."\)/);
  assert.match(jobs, /qaScenario === "error"[\s\S]*?setError\("We could not load your jobs\."\)/);
});
