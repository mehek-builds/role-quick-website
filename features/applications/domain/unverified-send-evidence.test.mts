import test from "node:test";
import assert from "node:assert/strict";
import {
  unverifiedCardFallbackCopy,
  unverifiedSendEvidence,
} from "./unverified-send-evidence.ts";
import type { SubmissionRetrySafetyLike } from "./submission-state.ts";

/* MEASURED 2026-09-02, attempt 22b9663a. The send opened a ledger attempt, gave up 456 ms later
   having pressed nothing, and every surface that described it said "Litos pressed Send". This one
   is the card's fallback, which fires when the server sent no sentence at all - the moment the
   client knows least and was claiming most. */

const OPENED: SubmissionRetrySafetyLike = {
  kind: "blocked_unverified",
  attemptId: "22b9663a-6497-4b83-80c2-54f89469e37e",
  at: "2026-09-02T11:38:20.010Z",
  reason: "opened",
};

const PRESSED: SubmissionRetrySafetyLike = {
  kind: "blocked_unverified",
  attemptId: "22b9663a-6497-4b83-80c2-54f89469e37e",
  at: "2026-09-02T11:38:20.010Z",
  reason: "pressed",
};

const AUTHORIZED: SubmissionRetrySafetyLike = {
  kind: "blocked_unverified",
  attemptId: "22b9663a-6497-4b83-80c2-54f89469e37e",
  at: "2026-09-02T11:38:20.010Z",
  reason: "boundary_authorized",
  leaseId: "lease-1",
  expiresAt: "2026-09-02T11:43:20.010Z",
};

test("an attempt that only opened is not a press", () => {
  assert.equal(unverifiedSendEvidence(OPENED), "opened");
});

test("a press, and an authorization that may have become one, both count as a press", () => {
  assert.equal(unverifiedSendEvidence(PRESSED), "pressed");
  assert.equal(unverifiedSendEvidence(AUTHORIZED), "pressed");
});

test("a contradictory or absent ledger says nothing rather than guessing", () => {
  assert.equal(unverifiedSendEvidence(null), null);
  assert.equal(unverifiedSendEvidence({ kind: "no_evidence" }), null);
  assert.equal(unverifiedSendEvidence({
    kind: "blocked_unverified",
    attemptId: "22b9663a-6497-4b83-80c2-54f89469e37e",
    at: "2026-09-02T11:38:20.010Z",
    reason: "invalid_sequence",
  }), null);
});

test("the fallback never tells her Litos pressed Send on an attempt that only opened", () => {
  const copy = unverifiedCardFallbackCopy(OPENED);
  assert.doesNotMatch(copy, /pressed Send/i);
  assert.match(copy, /nothing to check on the employer/i);
});

test("and it never sends her to the employer page for an attempt that did not happen", () => {
  assert.doesNotMatch(unverifiedCardFallbackCopy(OPENED), /Open .*and look/i);
});

test("where the ledger cannot say, the copy stays cautious and claims no press either", () => {
  const copy = unverifiedCardFallbackCopy(null);
  assert.match(copy, /does not know whether this application went through/);
  assert.doesNotMatch(copy, /pressed Send/i);
});
