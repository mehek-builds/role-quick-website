import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* THE DEAD CONTROL THIS REPLACES, and what was actually measured about it rather than what the
 * comment above it claimed.
 *
 * The needs_attention action row offered "Try again" on onRetry beside "Open packet review". The
 * comment said the retry "replays submit-request against the LAST acknowledged packet" and
 * therefore "answers 409 packet_stale forever". Read end to end against origin/main, both halves
 * are wrong:
 *
 *   - It is not a replay. retryPreparation -> prepareApplication -> POST
 *     /applications/:id/submit-request with no restart flag, and submitRequestDisposition answers
 *     'start' for an unclaimed needs_attention row, for one she answered "it is not there" on, and
 *     for one the row itself proves never reached the employer. The run then re-navigates, rebuilds
 *     the packet and re-discovers the form against whatever resolver code is live. That IS the
 *     re-fill the Restart inside Litos panel promises.
 *   - It is not dead forever, and it is not alive everywhere either. What refuses it is the NEXT
 *     gate: currentAcknowledgedPacketAudit, 409 PACKET_AUDIT_STALE once packet_version moves and
 *     409 PACKET_AUDIT_ACK_REQUIRED once the stored acknowledgement stops binding that audit, which
 *     submissionRunner writes as `packet_audit_acknowledgement: undefined` on every packet-drift
 *     park. So it failed on exactly the rows whose packet had moved since she last approved it.
 *
 * THE FIX points the control at refreshEmployerQuestionMetadata, which is the same re-fill with the
 * missing acknowledgement in front of it, and renders it only where it can actually re-fill. The
 * handler already existed on this screen but only inside the metadata-blocker branch, so a packet
 * whose fields all read cleanly and whose stored answers went stale behind a resolver fix had no
 * route back to the fill at all.
 */

const page = readFileSync("app/dashboard/applications/page.tsx", "utf8");

function submissionScreen() {
  const start = page.indexOf("function SubmissionScreen(");
  const end = page.indexOf("function SubmissionReceipt(", start);
  assert.ok(start >= 0, "SubmissionScreen is missing");
  assert.ok(end > start, "SubmissionReceipt must follow SubmissionScreen");
  return page.slice(start, end);
}

function attentionActionRow() {
  const screen = submissionScreen();
  const start = screen.indexOf('<div className="mt-7 flex flex-wrap gap-2">');
  assert.ok(start >= 0, "the needs_attention action row is missing");
  const end = screen.indexOf('review.status === "ready_for_final_approval" && educationDriftWarning', start);
  assert.ok(end > start, "could not find the end of the needs_attention action row");
  return screen.slice(start, end);
}

test("the row's re-fill is the audited handler, and the bare retry is gone from it", () => {
  const row = attentionActionRow();

  /* One control, one handler, and the handler is the one that acknowledges the exact packet before
     posting submit-request. A bare onRetry here is the defect: it reaches
     currentAcknowledgedPacketAudit with whatever acknowledgement the row happens to be carrying. */
  assert.match(
    row,
    /\{refillOfferedHere && \(\s*\n\s*<Button\s*\n\s*onClick=\{onRefreshQuestionMetadata\}/,
    "the needs_attention row must offer the re-fill through refreshEmployerQuestionMetadata, gated on refillOfferedHere",
  );
  assert.match(row, /"Review and fill again"/, "the control must carry the same label this handler already uses on the questions screen");
  assert.doesNotMatch(
    row,
    /needsAttention && !awaitingUnverifiedSubmission && <Button onClick=\{onRetry\}/,
    "the bare submit-request retry must not be offered on a needs_attention row: it cannot clear the packet audit once the packet has moved",
  );

  /* The in-flight and unsaved-edit states are the handler's own preconditions, surfaced rather than
     bypassed. Both are read from the props the questions screen already passes for this handler. */
  assert.match(row, /disabled=\{questionMetadataRefreshing \|\| questionMetadataRefreshDisabled\}/);
  assert.match(row, /aria-busy=\{questionMetadataRefreshing\}/);

  /* Hiding the re-fill must never empty the row. Open packet review is the route that produces the
     acknowledgement the re-fill needs, and it stays unconditional on this status. */
  assert.match(
    row,
    /\{needsAttention && !awaitingUnverifiedSubmission && <Button onClick=\{onReviewPacket\}/,
    "Open packet review must stay unconditional on a needs_attention row",
  );
});

test("refillOfferedHere renders the control only where the press really re-fills", () => {
  const screen = submissionScreen();

  /* !questionMetadataNeedsPacketReview is `packetEvidenceReady` at the call site. Without it,
     refreshEmployerQuestionMetadata fills nothing: it calls reviewPacketAgain and routes to packet
     review, which is what the button beside it already does and says.

     safe_not_sent is prepareApplication's own precondition. Without it the press is refused before
     any request is made. This is the arm that was dead 100% of the time in PR #522. */
  assert.match(
    screen,
    /const refillOfferedHere = attentionRefillOffered\(\{\s*\n\s*needsAttention,\s*\n\s*awaitingUnverifiedSubmission,\s*\n\s*packetReviewRequired: questionMetadataNeedsPacketReview,\s*\n\s*authorityState: packetAuthorityForEmployerAction\(packet, submission\)\.state,\s*\n\s*\}\);/,
    "refillOfferedHere must be the domain predicate over the row status, the exact-packet evidence, and the packet authority",
  );

  /* prepareApplication is what enforces the second term for real, so the client-side gate cannot be
     the only reading of it. */
  assert.match(
    page,
    /if \(!qaMode && packetAuthorityForEmployerAction\(selected, submission\)\.state !== "safe_not_sent"\)/,
    "prepareApplication must keep refusing an employer attempt without safe_not_sent",
  );
});

test("the Restart inside Litos help line names the control that is on screen", () => {
  const screen = submissionScreen();
  const panel = screen.slice(
    screen.indexOf('{staysInsideLitos ? "Restart inside Litos" : "No live browser to reopen"}'),
    screen.indexOf('<div className="mt-7 flex flex-wrap gap-2">'),
  );
  assert.ok(panel.length > 0, "the Restart inside Litos panel is missing");

  /* Read off the SAME value the control is, never restated. A help line that sends her to a control
     the row is not rendering is the defect this panel compounded while the retry beside it could
     not succeed. */
  assert.match(panel, /\?\s*refillOfferedHere\s*\n/, "the help line must branch on refillOfferedHere itself");
  assert.match(
    panel,
    /Review and fill again approves this exact packet and starts that run\./,
    "when the re-fill is offered, the line must name it",
  );
  assert.match(
    panel,
    /Open packet review to check them against the exact packet first, and the run starts from there\./,
    "when the re-fill is not offered, the line must name the control that is",
  );

  /* PR #522 put "nothing goes to the employer" on this same handler and it was false: standing
     consent turns the request into a send, and an unsupported portal emails the packet inside it.
     Neither the panel nor the row it describes may make that promise.

     SCOPED, NOT PAGE-WIDE. The identical sentence is correct under the direct-answer save bar,
     where the control is a PATCH of one answer and reaches no employer at all. A blanket assertion
     would fail that true line, which is the same mistake in the other direction. */
  const refillCopy = panel + attentionActionRow();
  assert.doesNotMatch(refillCopy, /nothing goes to the employer/i);
  assert.doesNotMatch(refillCopy, /nothing is sent/i);
});
