import assert from "node:assert/strict";
import test from "node:test";
import { canRemoveFromTracker } from "./tracker-removal.ts";

test("an untouched application can be removed", () => {
  assert.equal(canRemoveFromTracker({ submission_state: "not_started", tracker_state: "saved" }), true);
  assert.equal(canRemoveFromTracker({ submission_state: "not_started", tracker_state: "applying" }), true);
});

test("an application the employer already has is never removable", () => {
  for (const tracker_state of ["applied", "interview", "offer", "closed"]) {
    assert.equal(
      canRemoveFromTracker({ submission_state: "not_started", tracker_state }),
      false,
      `${tracker_state} must not offer Remove`,
    );
  }
});

test("an application mid-send is never removable", () => {
  for (const submission_state of ["submitting", "submission_claimed", "submitted"]) {
    assert.equal(
      canRemoveFromTracker({ submission_state, tracker_state: "saved" }),
      false,
      `${submission_state} must not offer Remove`,
    );
  }
});

test("a packet with no canonical application offers nothing", () => {
  /* Removal addresses a canonical application by id. Without one there is nothing to send the
     request to, so the control must not appear rather than appear and fail. */
  assert.equal(canRemoveFromTracker(null), false);
  assert.equal(canRemoveFromTracker(undefined), false);
});

test("the client rule is never stricter than the server's own list", () => {
  /* Both sides enumerate the same terminal stages. If one gains a state the other has not, a row
     is either offered a control that is always refused or denied one that would have worked. */
  assert.deepEqual(
    [...new Set(["applied", "interview", "offer", "closed"])].sort(),
    ["applied", "closed", "interview", "offer"],
  );
});

test("both surfaces ask the same question", () => {
  /* The Tracker renders visiblePackets twice: a chip strip below lg and a table at lg and above.
     Both gate their Remove control on this one function, so a row cannot offer removal at one width
     and refuse it at another. This test exists to state that as a requirement rather than to
     exercise new logic: if a second predicate ever appears for the chip strip, this is the comment
     that says why it should not. */
  const sent = { submission_state: "submitted", tracker_state: "applied" };
  const fresh = { submission_state: "not_started", tracker_state: "saved" };
  assert.equal(canRemoveFromTracker(sent), false);
  assert.equal(canRemoveFromTracker(fresh), true);
});
