import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const applications = await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
const home = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

test("application task screens use one keyed peer-panel transition", () => {
  assert.match(applications, /import \{ MotionPanel, runDashboardTransition \} from "@\/components\/app\/Motion";/);
  assert.match(
    applications,
    /const moveToScreen = useCallback[\s\S]{0,260}screenRef\.current = next;[\s\S]{0,160}runDashboardTransition\(\(\) => setScreen/,
    "the synchronous race guard must publish before the animated React state update",
  );
  assert.match(applications, /const applicationTaskPanelKey = canonicalSelected[\s\S]{0,420}`packet-\$\{selected\.id\}-\$\{screen\}`/);
  assert.match(
    applications,
    /<MotionPanel\s+key=\{applicationTaskPanelKey\}\s+name="dashboard-applications-task"/,
  );

  const taskPanel = applications.slice(
    applications.indexOf("<MotionPanel\n        key={applicationTaskPanelKey}"),
    applications.indexOf("{/* Rendered last and positioned fixed"),
  );
  assert.match(taskPanel, /screen === "questions"/);
  assert.match(taskPanel, /screen === "submitting"/);
  assert.match(taskPanel, /screen === "portal"/);
  assert.match(taskPanel, /screen === "submitted"/);
  assert.doesNotMatch(taskPanel, /<ApplicationPacket/);
  assert.doesNotMatch(taskPanel, /<TranscriptModal/);
});

test("Home Skip and Undo animate the queue replacement and temporary status", () => {
  assert.match(home, /import \{ MotionPanel, runDashboardTransition \} from "@\/components\/app\/Motion";/);
  assert.match(home, /const matchQueueKey = jobs === null[\s\S]{0,320}visibleJobs\.map\(\(job\) => job\.id\)\.join\(":"\)/);
  assert.match(home, /function dismiss\(jobId: string\)[\s\S]{0,220}runDashboardTransition\(\(\) => \{[\s\S]{0,100}setDismissed\(next\);[\s\S]{0,100}setLastDismissed\(jobId\);/);
  assert.match(home, /function undoDismiss\(\)[\s\S]{0,240}runDashboardTransition\(\(\) => \{[\s\S]{0,100}setDismissed\(next\);[\s\S]{0,100}setLastDismissed\(null\);/);
  assert.match(home, /<MotionPanel key=\{matchQueueKey\} name="dashboard-home-matches">/);
  assert.match(home, /<MotionPanel key=\{lastDismissed\} name="dashboard-home-skip-status">/);
  assert.match(home, /focusUndoAfterDismissRef\.current = jobId/);
  assert.match(home, /undo\.focus\(\)/);
  assert.match(home, /focusSkipAfterUndoRef\.current = restoredJobId/);
  assert.match(home, /restoredSkip\.focus\(\)/);
  assert.match(home, /data-dashboard-skip-id=\{job\.id\}/);
});
