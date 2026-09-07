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
  pressWithheldShowsList,
} from "./press-withheld.ts";

test("the headline names the field the form is still waiting on", () => {
  const headline = pressWithheldHeadline(["Are you legally authorized to work in the US?"]);
  assert.match(headline, /“Are you legally authorized to work in the US\?”/);
  assert.match(headline, /required and unanswered/);
  assert.match(headline, /so Litos did not send it/);
});

test("up to three fields are named in the headline, and no list is rendered beneath it", () => {
  assert.match(pressWithheldHeadline(["Work authorization", "Start date"]),
    /“Work authorization” and “Start date”/);
  assert.equal(pressWithheldShowsList(["Work authorization", "Start date"]), false);
  assert.equal(pressWithheldShowsList(["A", "B", "C"]), false);
});

/* EXACTLY ONE OF THE HEADLINE AND THE LIST NAMES THE FIELDS.
 *
 * The first version did both: a headline ending "and 2 more fields" above a list that already
 * showed all five. "2 more" is a promise that something is hidden, and nothing was - so past the
 * naming threshold the headline counts and stops, and the list carries every one of them. */
test("past three fields the headline counts and the list carries all of them", () => {
  const many = ["A", "B", "C", "D", "E"];
  const headline = pressWithheldHeadline(many);
  assert.equal(pressWithheldShowsList(many), true);
  assert.match(headline, /marks 5 required answers as unanswered/);
  assert.doesNotMatch(headline, /more field/,
    "the list below shows every field, so the headline must not claim any are withheld");
  assert.doesNotMatch(headline, /“/, "and it must not half-name them either");
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
  const copy = pressWithheldHumanVerificationCopy({
    requested: true, offered: false, closed_reason: "challenge_not_ready",
  });
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
    /* stratus #232, merged 2026-09-07. The vocabulary is add-never-remove on the backend, so a
       reason that lands there without copy here renders the neutral fallback forever. */
    "submit_settled",
  ]) {
    assert.ok(HUMAN_VERIFICATION_REASON_COPY[reason], `${reason} has no applicant-facing copy`);
  }
  const unknown = pressWithheldHumanVerificationCopy({
    requested: true, offered: false, closed_reason: "some_future_reason",
  });
  assert.match(unknown!, /could not hand you this company's human check/);
  assert.doesNotMatch(unknown!, /some_future_reason/);
});

test("a channel that was never asked for, or that opened, says nothing about one", () => {
  assert.equal(pressWithheldHumanVerificationCopy(null), null);
  assert.equal(pressWithheldHumanVerificationCopy({}), null);
  assert.equal(pressWithheldHumanVerificationCopy({ requested: true, offered: false, closed_reason: null }), null);
  assert.equal(
    pressWithheldHumanVerificationCopy({ requested: true, offered: true, closed_reason: "expired" }),
    null,
    "she was handed the check, so there is nothing to explain",
  );
});

test("the reassurance never sends her looking for a receipt", () => {
  assert.match(PRESS_WITHHELD_NOTHING_SENT, /Nothing went to the company/);
  assert.doesNotMatch(PRESS_WITHHELD_NOTHING_SENT, /check the (employer|company)/i);
});
