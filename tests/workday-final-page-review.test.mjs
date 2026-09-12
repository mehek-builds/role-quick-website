import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dashboard = fs.readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

test("Workday final-page approval is visibly evidence-only and keeps the token-bound handler", () => {
  assert.match(api, /kind\?: "advance" \| "final"/);
  assert.match(dashboard, /workdayPage\.kind \?\? \(workdayPage\.step\.final \? "final" : "advance"\)/);
  assert.match(dashboard, /Do you approve this final Workday review page\?/);
  assert.match(dashboard, /Approval records the exact page shown here\. It does not submit the application\./);
  assert.match(dashboard, /workdayFinalPage \? "Approve final page" : "Approve all answers and continue"/);
  assert.match(dashboard, /<Button onClick=\{onApproveWorkdayPage\}/);
});

/* danaher.wd1, 2026-09-12: "This filled page changed. Fill it again" appeared above a card whose only
   presses were the refused Approve and Edit answers. The card offers the refill itself. */
test("a Workday page review card offers the refill its stale refusal asks for", () => {
  const card = dashboard.slice(dashboard.indexOf('<Button onClick={onApproveWorkdayPage}'),
    dashboard.indexOf('The filled page must load before you can approve it.'));
  assert.match(card, /<Button variant="secondary" onClick=\{onRestart\} disabled=\{approving \|\| restarting\}>Fill the form again<\/Button>/);
});
