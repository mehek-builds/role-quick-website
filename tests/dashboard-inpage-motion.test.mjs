import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const applications = await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
const home = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

test("application task screens use one keyed peer-panel transition", () => {
  assert.match(applications, /import \{ MotionPanel, runDashboardTransition \} from "@\/components\/app\/Motion";/);
  assert.match(
    applications,
    /const moveToScreen = useCallback[\s\S]{0,260}screenRef\.current = next;[\s\S]{0,180}runDashboardTransition\(\(\) => setScreen/,
    "the synchronous race guard must publish before the animated React state update",
  );
  assert.match(applications, /aria-controls=\{switcherOpen \? "application-switcher-list" : undefined\}/);
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

  const selectPacketStart = applications.indexOf("const selectPacket = useCallback");
  const selectPacket = applications.slice(
    selectPacketStart,
    applications.indexOf("/* User navigation writes local state", selectPacketStart),
  );
  const packetReset = selectPacket.indexOf("packetRevalidationRefusal.current = null;");
  const transitionStart = selectPacket.indexOf("runDashboardTransition(() => {", packetReset);
  const routeUpdate = selectPacket.indexOf("moveToScreen(historicalPacketAuditStale", transitionStart);
  const transitionEnd = selectPacket.indexOf("\n    });", routeUpdate);
  assert.ok(packetReset > 0 && transitionStart > packetReset && routeUpdate > transitionStart && transitionEnd > routeUpdate);
  const atomicPacketUpdate = selectPacket.slice(transitionStart, transitionEnd);
  assert.match(atomicPacketUpdate, /setSelectedId\(packet\.id\);/);
  assert.match(atomicPacketUpdate, /setSpec\(stripMetadata\(packet\.spec\)\);/);
  assert.match(atomicPacketUpdate, /setSubmission\(rememberedSubmission \?\? \(status/);
  assert.match(atomicPacketUpdate, /moveToScreen\(historicalPacketAuditStale \|\| status === "ready_for_final_approval" \? "review" : screenForStatus\(status, "review"\)\);/);
  assert.match(
    applications,
    /resetApplicationWorkflow\(\{[\s\S]{0,120}afterReset: \(\) => setOpeningApplicationId\(requestedApplicationId\),[\s\S]{0,80}animate: false/,
    "browser history reconciliation must retain its before-paint layout-effect commit",
  );

  const qaPublish = applications.slice(
    applications.indexOf("const { QA_PACKET, QA_SCENARIOS }"),
    applications.indexOf("const historyPath = requestedApplicationId"),
  );
  assert.match(
    qaPublish,
    /runDashboardTransition\(\(\) => \{\s*setQaMode\(true\);\s*setEducationProfileStatus\("ready"\);\s*setPackets\(Object\.values\(QA_SCENARIOS\)\);\s*selectPacket\(packet\);/,
    "QA packet publication and task selection must share the transition lane",
  );

  const bootstrapPublish = applications.slice(
    applications.indexOf("const merged = mergeCanonicalApplicationHistory"),
    applications.indexOf(".catch((reason) =>", applications.indexOf("const merged = mergeCanonicalApplicationHistory")),
  );
  const bootstrapTransition = bootstrapPublish.indexOf("runDashboardTransition(() => {");
  const publishPackets = bootstrapPublish.indexOf("setPackets(merged);", bootstrapTransition);
  const selectRequested = bootstrapPublish.indexOf("selectPacket(requested);", publishPackets);
  assert.ok(bootstrapTransition >= 0 && publishPackets > bootstrapTransition && selectRequested > publishPackets);
  assert.equal(
    bootstrapPublish.indexOf("setPackets(merged);"),
    publishPackets,
    "normal history must not publish a landing ledger before its requested task branch",
  );

  assert.match(applications, /const applicationBootstrapGenerationRef = useRef\(0\);/);
  assert.match(
    applications,
    /const applicationRequestKey = JSON\.stringify\(\[requestedApplicationId, requestedApplicationIntent\]\);/,
  );
  assert.match(
    applications,
    /if \(committedApplicationRequestKeyRef\.current === applicationRequestKey\) return;\s*committedApplicationRequestKeyRef\.current = applicationRequestKey;\s*locallyRevisitingIdRef\.current = null;\s*applicationBootstrapGenerationRef\.current \+= 1;/,
    "every committed application request-key change must invalidate the previous passive bootstrap in layout",
  );
  assert.match(
    applications,
    /const bootstrapGeneration = \+\+applicationBootstrapGenerationRef\.current;\s*const bootstrapIsStale = \(\) => bootstrapGeneration !== applicationBootstrapGenerationRef\.current;/,
  );
  assert.match(
    applications,
    /const localRevisitOnly = revisitingId !== null[\s\S]{0,420}?if \(localRevisitOnly\) return;/,
    "a packet viewer opened from the landing board must not be mistaken for stale route-owned task state",
  );
  assert.match(
    applications,
    /\.then\(async \(\[historyResult, canonicalResult\]\) => \{\s*if \(cancelled \|\| bootstrapIsStale\(\)\) return;/,
    "history that resolves after close must not publish packets or reopen a task",
  );
  assert.match(
    applications,
    /linkedHistory = await api[\s\S]{0,260}if \(cancelled \|\| bootstrapIsStale\(\)\) return;/,
    "a linked-history response must recheck the generation after its second await",
  );
  assert.match(
    applications,
    /\.catch\(\(reason\) => \{\s*if \(cancelled \|\| bootstrapIsStale\(\)\) return;\s*setOpeningApplicationId\(null\);/,
    "a rejected stale bootstrap must not reopen or annotate a task after close",
  );

  const openApplicationStart = applications.indexOf("const openApplication = useCallback");
  const openApplication = applications.slice(
    openApplicationStart,
    applications.indexOf("const resetApplicationWorkflow", openApplicationStart),
  );
  assert.match(
    openApplication,
    /const routeAlreadyCommitted = nextPath === currentPath;[\s\S]{0,360}?if \(!routeAlreadyCommitted\) applicationBootstrapGenerationRef\.current \+= 1;[\s\S]{0,260}?routeCommitted: routeAlreadyCommitted/,
    "a local switch must invalidate the route bootstrap it replaces before publishing the new packet",
  );
  assert.match(
    openApplication,
    /runDashboardTransition\(\(\) => \{[\s\S]{0,800}?if \(routeAlreadyCommitted\) return;[\s\S]{0,400}?if \(options\.history === "replace"\) window\.history\.replaceState\(null, "", nextPath\);\s*else window\.history\.pushState\(null, "", nextPath\);\s*\}\);/,
    "re-selecting the committed row must not invalidate its only bootstrap or add a duplicate history entry",
  );

  const routeResetComment = applications.indexOf("/* Back and Forward change the route");
  const routeResetStart = applications.indexOf("useLayoutEffect(() => {", routeResetComment);
  const routeResetEnd = applications.indexOf("/* The acknowledged branch", routeResetStart);
  const routeReset = applications.slice(routeResetStart, routeResetEnd);
  assert.match(
    routeReset,
    /const browserApplicationId = new URLSearchParams\(window\.location\.search\)\.get\("application"\);[\s\S]{0,700}?const pendingLocalCanonical = Boolean\([\s\S]{0,260}?browserApplicationId === localOpen\.id/,
    "an uncommitted local canonical selection may survive only while the browser address still names it",
  );
  const canonicalMismatch = routeReset.indexOf("if (!canonicalMatchesRequest && !pendingLocalCanonical)");
  const localOpenRetirement = routeReset.indexOf("if (localOpen) locallyOpenedRequestRef.current = null;", canonicalMismatch);
  const mismatchBootstrapInvalidation = routeReset.indexOf("applicationBootstrapGenerationRef.current += 1;", canonicalMismatch);
  const mismatchWorkflowReset = routeReset.indexOf("resetApplicationWorkflow({", canonicalMismatch);
  assert.ok(
    canonicalMismatch >= 0
      && localOpenRetirement > canonicalMismatch
      && mismatchBootstrapInvalidation > localOpenRetirement
      && mismatchWorkflowReset > mismatchBootstrapInvalidation,
    "a route mismatch must retire the discarded local selection and invalidate its bootstrap before clearing the task",
  );
  assert.match(
    routeReset,
    /resolvedActionableRequestId === null[\s\S]{0,180}?applicationBootstrapGenerationRef\.current \+= 1;[\s\S]{0,100}?resetApplicationWorkflow\(\{ animate: false \}\)/,
    "Back to the ledger must invalidate the prior bootstrap before clearing its task",
  );

  const closeApplicationStart = applications.indexOf("const closeApplication = useCallback");
  const closeApplication = applications.slice(
    closeApplicationStart,
    applications.indexOf("/* Back and Forward change the route", closeApplicationStart),
  );
  assert.match(closeApplication, /pendingApplicationLandingFocusRef\.current = \{[\s\S]{0,220}rowId:/);
  const landingFocusCapture = closeApplication.indexOf("pendingApplicationLandingFocusRef.current");
  const bootstrapInvalidation = closeApplication.indexOf("applicationBootstrapGenerationRef.current += 1;");
  const workflowReset = closeApplication.indexOf("resetApplicationWorkflow();");
  assert.ok(landingFocusCapture >= 0 && workflowReset >= 0, "close needs both a landing-focus capture and workflow reset");
  assert.ok(
    landingFocusCapture < workflowReset,
    "the outgoing application identity must be captured before reset",
  );
  assert.ok(bootstrapInvalidation >= 0, "close must include delayed-bootstrap invalidation");
  assert.ok(
    bootstrapInvalidation < workflowReset,
    "close must synchronously invalidate delayed history before task state is reset",
  );
  assert.match(
    applications,
    /const pending = pendingApplicationLandingFocusRef\.current;\s*if \(applicationTaskOpen \|\| !pending\) return;[\s\S]{0,700}querySelectorAll<HTMLButtonElement>\("\[data-application-row-id\]"\)[\s\S]{0,300}getElementById\("application-ledger-heading"\)[\s\S]{0,220}target\?\.focus\(\{ preventScroll: true \}\);\s*pendingApplicationLandingFocusRef\.current = null;/,
    "close focus must land on the visible row or stable ledger heading without waiting on animation duration",
  );
  assert.match(applications, /<h2 id="application-ledger-heading" tabIndex=\{-1\}/);
  assert.equal(
    [...applications.matchAll(/data-application-row-id=\{packet\.id\}/g)].length,
    2,
    "mobile and desktop application rows need the same stable focus selector",
  );

  assert.match(
    applications,
    /if \(!applicationTaskOpen \|\| !pendingApplicationFocusRef\.current\) return;[\s\S]{0,320}applicationTaskHeadingRef\.current\?\.focus\(\{ preventScroll: true \}\);[\s\S]{0,180}\}, \[applicationTaskOpen, applicationTaskPanelKey, switcherOpen\]\);/,
    "canonical-to-packet replacement must retrigger task-heading focus even when the row identity is unchanged",
  );
  const continueStart = applications.indexOf("onContinueToSend={() => {");
  const continueToSend = applications.slice(
    continueStart,
    applications.indexOf("fillBusy={creating", continueStart),
  );
  const pendingTaskFocus = continueToSend.indexOf("pendingApplicationFocusRef.current = true;");
  const sameRouteBranch = continueToSend.indexOf("if (searchParams.get(\"application\")");
  const newRouteBranch = continueToSend.indexOf("const params = new URLSearchParams", sameRouteBranch);
  assert.ok(pendingTaskFocus > 0 && sameRouteBranch > pendingTaskFocus && newRouteBranch > sameRouteBranch);
});

test("local QA application tasks are not retired by URL reconciliation", () => {
  assert.match(applications, /if \(initializedQaScenarioRef\.current === qaScenario\) return;\s*initializedQaScenarioRef\.current = qaScenario;/);
  assert.match(applications, /return;\s*\}\s*initializedQaScenarioRef\.current = null;\s*let cancelled = false;/);
  assert.match(
    applications,
    /useLayoutEffect\(\(\) => \{\s*if \(qaMode === true\) return;[\s\S]{0,220}?const localOpen = locallyOpenedRequestRef\.current/,
  );
  assert.match(
    applications,
    /\[canonicalSelected, openingApplicationId, qaMode, requestedApplicationId, resetApplicationWorkflow, resolvedActionableRequestId, revisitingId\]/,
  );
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
