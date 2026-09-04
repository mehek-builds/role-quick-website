/* THE REFUSAL THAT NAMED THE WRONG CAUSE, AND THE CONTROL THAT COULD NOT ACT.
 *
 * MEASURED LIVE 2026-09-04, Palantir (lever) packet f1cfb841. Server review status `filling`,
 * submission authority `state: none` with `retry_safety: { kind: 'no_evidence' }` - the ledger
 * saying no attempt was ever opened. The screen refused with "Litos cannot start another employer
 * attempt until the exact prior submission evidence is verified", and the "Try again" control under
 * "RESTART INSIDE LITOS" rendered, was pressable, and fired no network request at all.
 *
 * WHAT THESE TESTS REFUSE TO ASSERT. They do not assert that a refused packet becomes sendable.
 * `safe_not_sent` remains the ONLY state that permits an employer action, and the uncertain-history
 * sentence is pinned unchanged beside the new one so a future edit cannot quietly reword the
 * refusal that is genuinely about verifying evidence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RUN_IN_FLIGHT_REFUSAL,
  SERVER_RUN_IN_FLIGHT_STATUSES,
  UNVERIFIED_EVIDENCE_REFUSAL,
  employerActionRefusalMessage,
} from "./employer-action-refusal.ts";

test("the measured Palantir packet is refused for the reason that is actually true", () => {
  /* Authority `uncertain` because the response carried no envelope and was therefore quarantined;
     server status `filling` because a managed fill run was still recorded as holding the packet. */
  assert.equal(employerActionRefusalMessage("uncertain", "filling"), RUN_IN_FLIGHT_REFUSAL);
});

test("the in-flight sentence never sends her to check an employer page", () => {
  /* The whole defect of the old sentence on this packet: it asked her to verify evidence of a
     submission that provably does not exist, which means opening the employer's careers page and
     looking for an application nothing ever filed. */
  assert.match(RUN_IN_FLIGHT_REFUSAL, /Nothing has been sent to the employer/);
  assert.match(RUN_IN_FLIGHT_REFUSAL, /no need to check the company's page/);
  assert.doesNotMatch(RUN_IN_FLIGHT_REFUSAL, /evidence/i);
});

test("it names an end to the wait, because there now is one", () => {
  /* A stalled fill is bounded server-side (volley-backend lib/stalledFillRunRelease.ts), so the
     packet returns to a state she can act on without her. A refusal that cannot say that is a
     refusal with no next step. */
  assert.match(RUN_IN_FLIGHT_REFUSAL, /releases it on its own/);
});

test("every status the server treats as in flight gets the in-flight sentence", () => {
  for (const status of ["submit_requested", "preparing", "filling", "submitting", "submission_claimed"]) {
    assert.equal(
      employerActionRefusalMessage("uncertain", status),
      RUN_IN_FLIGHT_REFUSAL,
      `${status} must be refused as a run in flight`,
    );
    assert.equal(SERVER_RUN_IN_FLIGHT_STATUSES.has(status), true);
  }
});

test("a packet with genuinely uncertain history keeps the evidence sentence, unchanged", () => {
  /* The refusal that is CORRECT: a ledger holding a boundary authorization, an observed press or a
     confirmation really does need its evidence verified before a second employer attempt. */
  for (const status of ["needs_attention", "failed", "ready_for_final_approval", "awaiting_security_code", undefined, null]) {
    assert.equal(employerActionRefusalMessage("uncertain", status), UNVERIFIED_EVIDENCE_REFUSAL);
  }
  assert.equal(
    UNVERIFIED_EVIDENCE_REFUSAL,
    "Litos cannot start another employer attempt until the exact prior submission evidence is verified.",
  );
});

test("a confirmed submission is refused, and is never reported as a run in flight", () => {
  /* Ordering matters: `confirmed` means an application IS with the employer. If a stale in-flight
     status ever sat beside a confirmed projection, the in-flight sentence would tell her nothing
     had been sent. The authority state is asked first for exactly that reason. */
  assert.equal(employerActionRefusalMessage("confirmed", "needs_attention"), UNVERIFIED_EVIDENCE_REFUSAL);
});

test("safe_not_sent is the only state that permits the action, and this never widens it", () => {
  assert.equal(employerActionRefusalMessage("safe_not_sent", "filling"), null);
  assert.equal(employerActionRefusalMessage("safe_not_sent", "needs_attention"), null);
  assert.equal(employerActionRefusalMessage("safe_not_sent", undefined), null);
  // Everything that is not safe_not_sent is refused, whatever the status says.
  for (const state of ["uncertain", "confirmed"] as const) {
    for (const status of ["filling", "needs_attention", undefined]) {
      assert.notEqual(employerActionRefusalMessage(state, status), null);
    }
  }
});

/* ---- The page binds the rule, and derives the control from the same value ---- */

const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");

test("the page keeps the status the server sent, above the rewrite that destroys it", () => {
  /* reviewForSubmissionProjection overwrites review.status with "needs_attention" for a quarantined
     packet, so the raw status has to be captured from the WIRE response or the rule can never see
     `filling`. Pinned by source because nothing else can observe the ordering. */
  assert.match(page, /server_review_status: response\.review\.status,/);
});

test("prepareApplication refuses through the shared rule, not through its own sentence", () => {
  /* The old handler hard-coded the evidence sentence inline for every refusal. If it is ever
     restored, this fails: the literal may live in the rule module and nowhere else. */
  const handler = page.slice(page.indexOf("async function prepareApplication"));
  assert.match(handler, /const refusal = employerActionRefusal\(selected, submission, qaMode === true\);/);
  assert.ok(
    !handler.includes("setError(\"Litos cannot start another employer attempt"),
    "the refusal sentence must not be re-inlined in the handler",
  );
});

test("Try again is rendered only where the handler would actually fire a request", () => {
  /* THE DEAD CONTROL, and the one line that forecloses it. `needsAttention` on this screen is the
     DISPLAYED status, and a quarantined authority rewrites a live `filling` row into exactly that -
     which is how the button came to render on a packet whose handler returns before its fetch.
     Both retry exits are gated on the same refusal value the handler reads. */
  assert.match(
    page,
    /\{needsAttention && !awaitingUnverifiedSubmission && !employerActionRefusal && <Button onClick=\{onRetry\}/,
  );
  assert.match(page, /review\.status === "failed" && \(failedPacketAuditStale \|\| employerActionRefusal/);
});

test("the screen is given the refusal the page computed, not one of its own", () => {
  assert.match(
    page,
    /employerActionRefusal=\{employerActionRefusal\(selected, selectedSubmission, qaMode === true\)\}/,
  );
});
