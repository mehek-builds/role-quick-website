import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../app/dashboard/applications/page.tsx", import.meta.url);

/**
 * WIRING, NOT BEHAVIOUR. features/applications/domain/live-run-connection.test.mts proves the retry
 * state machine; these prove the dashboard actually routes both failing channels through it, which
 * is the half the 2026-09-10 incident was.
 *
 * Measured on three separate managed runs against
 * trylitos.com/dashboard/applications?application=<id>&intent=apply: inside the first one to three
 * minutes the LIVE APPLICATION STATUS view replaced itself with a red "Error: Failed to fetch" and
 * fell back to packet review under an armed "Approve packet and fill form", while the run kept
 * filling on the server and finished minutes later.
 *
 * A correct helper nothing calls is how that would ship again, so each assertion below names the
 * call site rather than the rule.
 */

test("the status poll backs off instead of banking one rejected tick as a banner", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");

  // The catch must go through the accumulator. A bare setPollError there is the defect.
  assert.match(
    dashboard,
    /await refreshSubmission\(\);[\s\S]{0,900}\} catch \(reason\) \{[\s\S]{0,900}publishLiveConnectionFailure\(/,
  );
  assert.doesNotMatch(
    dashboard,
    /\} catch \(reason\) \{\s*\n\s*if \(!cancelled\) setPollError\(/,
    "the poll's catch may not write the banner directly any more",
  );
  // A clean tick ends the outage, or a healed connection would back off forever.
  assert.match(dashboard, /await refreshSubmission\(\);[\s\S]{0,600}liveRunConnectionAfterSuccess\(liveConnectionRef\.current\)/);
  // The cadence is chosen from the run of failures, not hardcoded at the reschedule.
  assert.match(
    dashboard,
    /const poll = async \(\) => \{[\s\S]{0,600}liveRunPollDelayMs\(liveConnectionRef\.current\.consecutiveFailures, document\.visibilityState === "visible"\)/,
  );
  assert.doesNotMatch(
    dashboard,
    /timer = window\.setTimeout\(poll, document\.visibilityState === "visible" \? 2500 : 10_000\)/,
    "the fixed reschedule is what hammered a dead backend every 2.5s for a whole fill",
  );
});

test("a dropped submit-request socket keeps the live view and hands the question to the poll", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");

  // The hold is decided by the RULE, asked of the state the failure would produce. A helper that is
  // exported, documented as load-bearing and called from nowhere is how this ships broken again.
  assert.match(
    dashboard,
    /const nextLiveConnection = liveRunConnectionAfterFailure\(liveConnectionRef\.current, reason, Date\.now\(\), message\);\s*\n\s*if \(options\.failureScreen === undefined && liveRunViewSurvivesFailure\(nextLiveConnection\)\) \{\s*\n\s*commitLiveConnectionFailure\(nextLiveConnection\);\s*\n\s*return;\s*\n\s*\}/,
  );
  // And it must sit BEFORE the screen move, or the applicant is already on review.
  assert.match(
    dashboard,
    /liveRunViewSurvivesFailure\(nextLiveConnection\)\) \{[\s\S]{0,200}\}\s*\n(?:\s*\/\*[\s\S]{0,400}?\*\/\s*\n)?\s*moveToScreen\(options\.failureScreen \?\? \(options\.restart \? "portal" : "review"\)\)/,
  );
  // The message the branch carries is the one the banner would have used, so an exhausted window
  // still says what actually happened rather than a paraphrase of it.
  assert.match(
    dashboard,
    /const message = reason instanceof Error \? reason\.message : "We could not open the company's application page\.";\s*\n\s*\/\*/,
  );
  // liveRunFailureKind read straight off the rejection is what let a 429 or a 503 be swallowed:
  // both are transient, and both are the server refusing this exact request.
  assert.doesNotMatch(
    dashboard,
    /liveRunFailureKind\(reason\) === "transient"/,
    "the send's catch may not classify the rejection without going through the accumulator",
  );
});

test("a refusal the server wrote is delivered when the poll routes off the live view", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");

  // 429 (hourly limiter) and 503 (shutdown gate) are transient AND are litos-api refusing the run.
  // Holding the live view for them is right; letting the heal drop the sentence is the dead-button
  // class: the applicant lands back on review under a re-armed send with nothing on screen.
  assert.match(
    dashboard,
    /const nextScreen = screenForStatus\(result\.review\.status, "submitting"\);[\s\S]{0,1200}if \(nextScreen !== "submitting" && nextScreen !== "submitted"\) \{\s*\n\s*const retained = liveRunRetainedRefusal\(liveConnectionRef\.current\);\s*\n\s*if \(retained\) \{[\s\S]{0,400}setPollError\(retained\);/,
  );
  // Published AFTER this tick's own banner clear, or the clean poll erases it on the way past.
  const clearAt = dashboard.indexOf("      setPollError(null);\n    }");
  const deliverAt = dashboard.indexOf("setPollError(retained);");
  assert.ok(clearAt > 0 && deliverAt > clearAt, "the retained sentence must be written after the tick's clear");
  // Delivered once, then retired.
  assert.match(dashboard, /liveRunConnectionAfterRetainedDelivery\(liveConnectionRef\.current\)/);
});

test("the reconnecting notice is non-blocking and cannot contradict the banner", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");

  // Derived from the connection state, not from a clock read at render time.
  assert.match(
    dashboard,
    /const liveConnectionNotice = liveConnection\.consecutiveFailures > 0[\s\S]{0,320}LIVE_RUN_RECONNECTING_NOTICE/,
  );
  // role="status", not role="alert": nothing has failed yet.
  assert.match(dashboard, /\{liveConnectionNotice && \(\s*\n\s*<p role="status"[^>]*>\{liveConnectionNotice\}<\/p>/);
  // The failure publisher only ever WRITES the banner. Clearing it on a blink would wipe a standing
  // packet-revalidation refusal for the length of the reconnect window.
  assert.match(dashboard, /if \(view\.tone === "error"\) setPollError\(view\.message\);/);
});

test("the send is withdrawn while the server says a run holds the packet", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");

  // Read off the SERVER's status, never the displayed review: the display rewrite is what turns an
  // in-flight run into "needs_attention", so the rewritten copy would always answer no.
  assert.match(
    dashboard,
    /const runInFlightBlock = selected[\s\S]{0,400}SERVER_RUN_IN_FLIGHT_STATUSES\.has\(selectedSubmission\.server_review_status \?\? ""\)[\s\S]{0,120}RUN_IN_FLIGHT_REFUSAL/,
  );
  // Withdrawn, not merely disabled, and disabled too so the two can never disagree - but only for
  // the EMPLOYER SEND. "Fill the application", "Audit again", "Loading exact PDF" and "Checking
  // saved packet" are continueFromResume / auditPacketAgain: local work that sends nothing, and
  // withdrawing them left the action bar blank under a sentence about a run.
  assert.match(dashboard, /const reviewPrimaryIsEmployerSend = packetEvidenceReady;\s*\n\s*const runInFlightWithdrawsPrimary = runInFlightBlock !== null && reviewPrimaryIsEmployerSend;/);
  assert.match(dashboard, /review\.portal_supported !== false && !runInFlightWithdrawsPrimary && <Button onClick=\{reviewPrimaryAction\}/);
  assert.match(dashboard, /const reviewPrimaryDisabled = reviewPrimaryBusy\s*\n\s*\|\| runInFlightWithdrawsPrimary/);
  assert.doesNotMatch(
    dashboard,
    /runInFlightBlock === null && <Button onClick=\{reviewPrimaryAction\}/,
    "a run in flight may not withdraw a local audit control",
  );
  // reviewPrimaryAction's own branches are the proof of which one is the send: only the
  // packet-evidence branch reaches continueFromVerifiedPacket.
  assert.match(
    dashboard,
    /const reviewPrimaryAction = packetEvidenceReady[\s\S]{0,400}: packetEvidenceNeedsFreshAudit \? auditPacketAgain : continueFromResume;/,
  );
  // The sentence takes the button's place rather than leaving the bar silent.
  assert.match(dashboard, /runInFlightBlock && \(\s*\n\s*<p role="status"[^>]*>\{runInFlightBlock\}<\/p>/);
  // And the handler refuses on its own account, so no other route into it can start a second run.
  assert.match(
    dashboard,
    /SERVER_RUN_IN_FLIGHT_STATUSES\.has\(submission\.server_review_status \?\? ""\)\) \{\s*\n\s*setError\(RUN_IN_FLIGHT_REFUSAL\);\s*\n\s*return;/,
  );
});
