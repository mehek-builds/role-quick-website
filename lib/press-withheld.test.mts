/* THE COPY FOR A SEND LITOS HELD ON PURPOSE.
 *
 * These pin the two things the dashboard did not say on the live Lever sends of 2026-09-07: which
 * field the form is still waiting on, and why the applicant was never handed the company's own
 * human check. Both facts existed in the run; neither reached the screen. The third thing pinned is
 * the one that must never regress in the other direction - a raw internal reason token rendered to
 * an applicant.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  HUMAN_VERIFICATION_REASON_COPY,
  PRESS_WITHHELD_NOTHING_SENT,
  pressWithheldHeadline,
  pressWithheldHumanVerificationCopy,
  pressWithheldLabels,
} from "./press-withheld.ts";

test("the headline names the field the form is still waiting on", () => {
  const headline = pressWithheldHeadline(["Are you legally authorized to work in the US?"]);
  assert.match(headline, /“Are you legally authorized to work in the US\?”/);
  assert.match(headline, /required and unanswered/);
  assert.match(headline, /so Litos did not send it/);
});

test("several fields are listed, and a long list is counted rather than dumped", () => {
  assert.match(pressWithheldHeadline(["Work authorization", "Start date"]),
    /“Work authorization” and “Start date”/);
  assert.match(pressWithheldHeadline(["A", "B", "C", "D", "E"]),
    /“A”, “B” and “C”, and 2 more fields/);
});

test("a run that attributed no control still gets a sentence, with no invented field name", () => {
  const headline = pressWithheldHeadline([]);
  assert.match(headline, /a required answer as missing/);
  assert.doesNotMatch(headline, /“/);
});

test("labels are trimmed, deduped and never taken from a non-string", () => {
  assert.deepEqual(
    pressWithheldLabels({ labels: [" Work authorization ", "Work authorization", "", "Start date"] }),
    ["Work authorization", "Start date"],
  );
  assert.deepEqual(pressWithheldLabels(undefined), []);
  assert.deepEqual(pressWithheldLabels({}), []);
});

test("the human-verification reason is rendered as plain language, never as its token", () => {
  const copy = pressWithheldHumanVerificationCopy({ human_verification: "challenge_not_ready" });
  assert.equal(copy, HUMAN_VERIFICATION_REASON_COPY.challenge_not_ready);
  assert.match(copy!, /human check/);
  assert.doesNotMatch(copy!, /challenge_not_ready/,
    "the internal enum must never reach an applicant");
});

test("every reason the backend can send has copy, and an unknown one falls back neutrally", () => {
  for (const reason of [
    "expired", "challenge_not_ready", "ambiguous_challenge", "original_frame_lost",
    "authorization_refused", "capture_failed", "frame_moved", "snapshot_failed",
    "continuation_phase", "submit_not_pressed", "required_fields_unconfirmed",
    "transport_not_authorized",
  ]) {
    assert.ok(HUMAN_VERIFICATION_REASON_COPY[reason], `${reason} has no applicant-facing copy`);
  }
  const unknown = pressWithheldHumanVerificationCopy({ human_verification: "some_future_reason" });
  assert.match(unknown!, /could not hand you this company's human check/);
  assert.doesNotMatch(unknown!, /some_future_reason/);
});

test("a run with no human check says nothing about one", () => {
  assert.equal(pressWithheldHumanVerificationCopy({ labels: ["Work authorization"] }), null);
  assert.equal(pressWithheldHumanVerificationCopy(null), null);
});

test("the reassurance never sends her looking for a receipt", () => {
  assert.match(PRESS_WITHHELD_NOTHING_SENT, /Nothing went to the company/);
  assert.doesNotMatch(PRESS_WITHHELD_NOTHING_SENT, /check the (employer|company)/i);
});
