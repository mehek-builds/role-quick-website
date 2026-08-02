import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("job search and account settings share one tabbed account destination", async () => {
  const [layout, settings, oldProfileRoute] = await Promise.all([
    readFile(new URL("../app/dashboard/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/profile/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(layout, /href: "\/dashboard\/profile"/);
  assert.match(layout, /const MOBILE_NAV = \[\.\.\.NAV, \.\.\.UTILITY\]/);
  assert.match(settings, /id: "job-search", label: "Job search"/);
  assert.match(settings, /id: "application-details", label: "Application details"/);
  assert.match(settings, /id: "automation", label: "Automation"/);
  assert.match(settings, /id: "plan", label: "Plan & usage"/);
  assert.match(settings, /id: "sign-in", label: "Sign-in & data"/);
  assert.match(settings, /<TargetingCard \/>/);
  assert.match(settings, /role="tablist"/);
  assert.match(settings, /role="tabpanel"/);
  assert.match(settings, /"ArrowLeft", "ArrowRight", "Home", "End"/);
  assert.match(oldProfileRoute, /redirect\("\/dashboard\/settings#job-search"\)/);
});
