import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../app/dashboard/applications/page.tsx", import.meta.url);

/**
 * Wiring, not behaviour. screen-for-status.test.mts proves the mapping is right; these prove the
 * dashboard actually calls it in all three places, which is the half that was broken.
 *
 * A correct helper nothing calls is exactly how this defect shipped: the poll routed on status
 * correctly, and the submit-request path - the one that receives the terminal review first - did
 * not route at all.
 */
test("every path that receives a review routes the screen from it", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");

  // The submit-request response is terminal. It must route, not just be stored. Bounded span so
  // the match cannot reach across unrelated code.
  assert.match(
    dashboard,
    /\/submit-request`[\s\S]{0,2400}moveToScreen\(screenForStatus\(published\.review\.status, "submitting"\)\)/,
  );
  // The poll has two explicit routing guards. While the student's own approve is in flight the
  // poll can be reporting the status from before that approve. An in-flight poll can also land
  // after the applicant deliberately leaves portal for review. Both guards must sit before the
  // route, and the navigation guard must read the synchronous ref rather than stale React state.
  assert.match(
    dashboard,
    /\/applications\/\$\{requestedId\}\/submission`[\s\S]{0,10000}if \(approveInFlight\.current !== null && !terminal\) return;[\s\S]{0,800}const pollMayRoute = screenRef\.current === "submitting"[\s\S]{0,240}if \(!pollMayRoute\) return;\s*\n\s*moveToScreen\(screenForStatus\(result\.review\.status, "submitting"\)\)/,
  );
  // The exception to the exception. A stalled approve never rejects (no AbortController in
  // lib/api.ts), so suppressing every poll route would strand the student on the spinner with the
  // poll already holding the answer. Terminal states must always get through.
  assert.match(
    dashboard,
    /const terminal = result\.review\.status === "submitted" \|\| result\.review\.status === "failed";/,
  );
  // And the approve response itself routes, which is the whole point of the sibling fix: the QA
  // branch always did and the real one did not.
  assert.match(
    dashboard,
    /\/submission\/approve`[\s\S]{0,3000}moveToScreen\(screenForStatus\(result\.review\.status, "portal"\)\)/,
  );
  // Selecting a packet, which falls back to the review screen rather than the progress screen.
  assert.match(dashboard, /moveToScreen\(historicalPacketAuditStale \|\| status === "ready_for_final_approval" \? "review" : screenForStatus\(status, "review"\)\)/);

  // A run result must never be routed by an inline status list again. That longhand is how the
  // three copies drifted apart until one quietly lost its terminal branch.
  //
  // Scoped to the review a run returns, not to the status word anywhere: the "action" ledger
  // filter and the questions screen's back target legitimately test the same statuses, and are
  // different questions from "where does this run go now".
  assert.equal(
    /\.includes\(result\.review\.status\)/.test(dashboard),
    false,
    "route the run result through screenForStatus rather than re-listing the terminal statuses",
  );
});

/**
 * Packets Litos cannot submit must not offer a send button that can only fail.
 *
 * These sat in the Tracker labelled "Ready" with a live "Fill the form" control; the applicant
 * found out only after a multi-minute run came back "This portal is not supported yet". The
 * tailored resume is still worth having, so the job is not hidden: the copy says what Litos cannot
 * do and hands over the company's page.
 */
test("an unsupported portal replaces the send control with a way to apply by hand", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");

  assert.match(dashboard, /Litos cannot fill in this company’s page\. Your resume is ready, so apply on their site\./);
  // The send control is behind the capability check, and the link out takes its place.
  assert.match(
    dashboard,
    /review\.portal_supported === false[\s\S]{0,900}Open the company page[\s\S]{0,900}: <Button/,
  );
  assert.match(dashboard, /const reviewPrimaryLabel[\s\S]{0,500}"Fill company form"/);
  // The resume itself stays reachable: this is a gate on submitting, not on the packet.
  assert.match(dashboard, /selected\.download_url[\s\S]{0,200}View PDF/);
});
