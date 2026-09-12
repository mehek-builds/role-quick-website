import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const applications = await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

/* THE UPGRADE MODAL OPENS FROM A PRESS, NEVER FROM A PAGE LOAD.
 *
 * Measured 2026-09-12 on a Litos+ trial with its tailoring allowance used up: every Jobs "Start"
 * link (/dashboard/applications?job=<id>&intent=tailor) pre-filled the composer AND auto-started a
 * tailoring build. The trial's cached feature grant still read true, so the build reached
 * /resume/generate, came back 402, and the server-denial branch opened the full-screen "Tailor this
 * resume with Litos+" dialog over the composer. It swallowed the first press on "Prepare in Litos",
 * the one path that works for that student, on Leerink, TMHCC, Piper Sandler, Starr and BMO alike.
 *
 * Source-text guards, in the style of the neighbouring paywall tests: the failure they protect
 * against is an arrival path quietly regaining the ability to raise the dialog. */

const routedJob = applications.slice(
  applications.indexOf("if (!pendingJob || packets === null) return;"),
  applications.indexOf("/* Fail closed during query-only navigation."),
);
const createApplicationBody = applications.slice(
  applications.indexOf("async function createApplication("),
  applications.indexOf("async function generateCoverLetter"),
);

test("arrival waits for the plan and auto-starts only an allowance that is not known to be spent", () => {
  assert.match(routedJob, /if \(billingLoading\) return;[\s\S]*?const existing =/);
  assert.match(routedJob, /const arrivalMayTailor = canUse\("ai_resume_tailoring"\) === true && !tailoringAllowanceSpent\(billingAccess\);/);
  assert.match(routedJob, /if \(intent === "tailor" && arrivalMayTailor\) \{/);
  assert.match(routedJob, /\}, \[openApplication, packets, pendingJob, billingLoading, billingAccess\]\);/);
  // The route effect itself never reaches for the modal.
  assert.doesNotMatch(routedJob, /openUpgrade|openTailoringUpgrade/);
  // Every createApplication call the effect makes is an arrival.
  const calls = routedJob.match(/createApplication\([^)]*\)/g) ?? [];
  assert.ok(calls.length > 0);
  for (const call of calls) assert.match(call, /"arrival"\)$/, `${call} must declare itself an arrival`);
});

test("an arrival never opens the upgrade modal, on either the proactive or the server-denial branch", () => {
  assert.match(createApplicationBody, /initiation: "press" \| "arrival" = "press"/);
  assert.match(
    createApplicationBody,
    /if \(canUse\("ai_resume_tailoring"\) !== true\) \{\s*if \(!requestMayPublish\(\)\) return;\s*if \(initiation === "arrival"\) holdTailoringForPlus\(\);\s*else openTailoringUpgrade\("proactive"\);/,
  );
  assert.match(
    createApplicationBody,
    /isStructuredUpgradeDenial\(reason, "ai_resume_tailoring"\)\) \{\s*if \(initiation === "arrival"\) holdTailoringForPlus\(\);\s*else openTailoringUpgrade\("server_denial"\);/,
  );
  // The hold records the refusal for the composer note and leaves Prepare in Litos as the way on.
  assert.match(createApplicationBody, /const holdTailoringForPlus = \(\) => \{[\s\S]*?setTailoringDeniedJobId\(draft\.jobId\)[\s\S]*?Choose Prepare in Litos/);
  assert.doesNotMatch(
    createApplicationBody.slice(
      createApplicationBody.indexOf("const holdTailoringForPlus"),
      createApplicationBody.indexOf("if (canUse(\"ai_resume_tailoring\") !== true)"),
    ),
    /openUpgrade/,
  );
});

test("pressing Tailor resume first still opens the modal, as a press", () => {
  assert.match(applications, /onTailor=\{\(upgradeTrigger\) => void createApplication\(newApplication, upgradeTrigger\)\}/);
  assert.equal((applications.match(/"arrival"/g) ?? []).length >= 1, true);
  // No other caller passes "arrival": the explicit composer and Tracker presses keep the default.
  assert.doesNotMatch(applications.replace(routedJob, ""), /createApplication\([^)]*"arrival"\)/);
});

test("a resolved posting with tailoring spent keeps Prepare in Litos primary and says why inline", () => {
  assert.match(
    applications,
    /tailoringNeedsPlus=\{Boolean\(newApplication\.jobId\) && \(tailoringAllowanceSpent\(billingAccess\) \|\| tailoringDeniedJobId === newApplication\.jobId\)\}/,
  );
  const panel = applications.slice(
    applications.indexOf("function NewApplicationPanel("),
    applications.indexOf("type ComposerSlot ="),
  );
  assert.match(panel, /const tailoringLocked = managedPrepare && tailoringNeedsPlus;/);
  assert.match(panel, /tailoringLocked\s*\?\s*"Tailoring needs Litos\+\. Prepare in Litos uses your main resume/);
  // Tailor stays the secondary control and stays pressable, so a student who wants Litos+ can ask.
  assert.match(panel, /<Button type="button" variant="secondary" aria-describedby=\{readinessId\} onClick=\{\(event\) => onTailor\(event\.currentTarget\)\} disabled=\{creating !== null \|\| !tailorReady\}/);
  // Prepare in Litos is the primary (default-variant) button and comes last in the action row.
  assert.match(panel, /\{managedPrepare && \(\s*<Button type="button" aria-describedby=\{readinessId\} onClick=\{onFill\}/);
});
