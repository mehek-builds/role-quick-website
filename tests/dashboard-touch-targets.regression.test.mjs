import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  home: await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
  applications: await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8"),
  outreach: await readFile(new URL("../app/dashboard/outreach/page.tsx", import.meta.url), "utf8"),
  requirements: await readFile(new URL("../components/app/RequirementBreakdown.tsx", import.meta.url), "utf8"),
  interview: await readFile(new URL("../components/app/InterviewPrep.tsx", import.meta.url), "utf8"),
};

test("compact dashboard text controls keep the 24px WCAG target floor", () => {
  assert.match(files.home, /inline-flex min-h-6 items-center[^"\n]*>View all<\/Link>/);
  assert.match(files.home, /inline-flex min-h-6 items-center text-muted underline[^>]*>\s*Change what you want/);
  assert.match(files.requirements, /inline-flex min-h-6 items-center text-xs/);
  assert.match(files.interview, /inline-flex min-h-6 items-center text-sm/);
  assert.match(files.applications, /className=\{`min-h-6 text-left leading/);
  assert.match(files.outreach, /inline-flex min-h-6 items-center text-xs/);
});

test("the application answer screen Back control keeps a primary mobile target", () => {
  assert.match(
    files.applications,
    /<button type="button" onClick=\{onBack\} className="inline-flex min-h-11 items-center text-sm/,
  );
});
