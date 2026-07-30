import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardSource = await readFile(
  new URL("../app/dashboard/page.tsx", import.meta.url),
  "utf8",
);

test("dashboard startup uses one versioned bootstrap request", () => {
  assert.match(
    dashboardSource,
    /api<DashboardBootstrap>\("\/dashboard\/bootstrap"\)/,
  );
  for (const retiredStartupRequest of [
    'api<Me>("/me")',
    'api<{ jobs: MonitoredJob[] }>("/jobs?offset=0")',
    'api<Targeting>("/profile/targeting")',
    'api<Partial<ParsedProfile>>("/profile")',
    'api<{ resumes: GeneratedResume[] }>("/resume/history")',
  ]) {
    assert.doesNotMatch(dashboardSource, new RegExp(retiredStartupRequest.replace(/[{}()[\]?*+.^$\\|]/g, "\\$&")));
  }
});
