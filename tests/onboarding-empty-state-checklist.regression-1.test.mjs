import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression: ISSUE-044, onboarding and first-use states missed checklist guidance.
// Found by /qa on 2026-08-09.
// Report: .gstack/qa-reports/qa-report-trylitos-com-2026-08-09.md

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/* The two cases below keep ISSUE-044's intent and follow the copy to where it now lives.
 *
 * The welcome moved out of ResumeStep into components/start/Welcome.tsx, so the first case reads
 * both files: the step must RENDER the welcome, and the welcome must still greet. Two of the
 * original literals are deliberately gone rather than relocated. "review the one-page version"
 * previewed the steps, which the rail above the heading already shows, and "Finish later any time"
 * described the LaterLink control sitting a few pixels below it; DESIGN.md's say-once rule makes
 * both a repeat. The exit assertion is unchanged, because the exit is the part that matters.
 *
 * The done screen's confirmation grew from one sentence into a receipt derived from
 * OnboardingState, so the literal it used to assert no longer exists. The sr-only live region
 * survives from this file's original version and is still asserted; what replaced the sentence is
 * asserted too, because a receipt printed from constants would otherwise satisfy this case. */
test("the first step welcomes the user, explains the path, and keeps the exit visible", async () => {
  const steps = await read("components/start/steps.tsx");
  const resume = steps.slice(steps.indexOf("export function ResumeStep"), steps.indexOf("export function InstallStep"));
  const welcome = await read("components/start/Welcome.tsx");

  assert.match(resume, /title="Start with your resume\."/);
  assert.match(resume, /<WelcomeNote \/>/);
  assert.match(welcome, /Welcome to Litos\./);
  // The path is explained by the walkthrough now, and it has to be skippable to stay on this screen.
  assert.match(resume, /<Highlights \/>/);
  assert.match(welcome, /aria-expanded/);
  assert.match(resume, /<LaterLink onClick=\{onLater\} \/>/);
});

test("completion says setup is complete before sending the user to their jobs", async () => {
  const steps = await read("components/start/steps.tsx");
  const done = steps.slice(steps.indexOf("export function DoneStep"));

  assert.match(done, /title="Setup complete\."/);
  assert.match(done, /role="status"/);
  assert.match(done, /<Receipt rows=\{rows\} \/>/);
  // The rows are read off the account, not hardcoded. See the e2e case for the behavioural proof.
  assert.match(done, /RECEIPT\[step\.key\]/);
  assert.match(done, /"See my jobs"/);
  assert.match(done, /<details/);
  assert.match(done, /open=\{permissionsOpen\}/);
  assert.match(done, /onToggle=\{\(event\) => setPermissionsOpen\(event\.currentTarget\.open\)\}/);
  assert.match(done, />Optional permissions</);
  assert.match(done, /Not required to see your jobs/);

  const receipt = done.indexOf("<Receipt rows={rows} />");
  const firstAction = done.indexOf('aria-labelledby="first-action-heading"');
  const permissions = done.indexOf("<details");
  assert.ok(receipt >= 0 && receipt < firstAction, "the receipt must lead into the first action");
  assert.ok(firstAction < permissions, "optional permissions must not precede the first action");
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
  assert.match(outreach, /role="alert"[\s\S]{0,300}Emails did not load\./);
  assert.match(jobs, /<DataErrorState[\s\S]*?title="Jobs did not load\."/);
  assert.match(home, /title="Your dashboard did not load\."/);
  for (const source of [applications, home]) {
    assert.match(source, /visual="error"/);
    assert.match(source, />\s*Try again\s*</);
  }
  assert.match(outreach, />\s*Try again\s*</);
  assert.match(outreach, /setEvents\(\[\]\)/);
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
