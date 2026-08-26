import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  activeAttendedManualAttemptId,
  activeAttendedManualRecovery,
  attendedHandoffBoundaryLockToken,
  attendedHandoffAuthorizationDisposition,
  attendedHandoffOutcomeMayPublish,
  attendedHandoffOutcomeResponseMatches,
  attendedManualAttemptIdentity,
  attendedSelfSubmitMayOpen,
  beginAttendedHandoffOpenerLock,
  beginAttendedHandoffOutcomeLock,
  failClosedUnverifiedNotSentResponse,
  finishAttendedHandoffBoundaryLock,
  legacyEmployerFallbackMayRender,
  unverifiedSubmissionOutcomeResponseMatches,
  type AttendedHandoffBoundaryLock,
  type AttendedHandoffCurrentVersion,
  type AttendedHandoffRequestVersion,
} from "./attended-handoff-replay.ts";

const request: AttendedHandoffRequestVersion = {
  applicationId: "application-a",
  token: "request-a-1",
  contextGeneration: 4,
  publicationGeneration: 7,
  editorRevision: 11,
  mutationGeneration: 13,
  packetIdentity: "packet-a-v1",
};

const current: AttendedHandoffCurrentVersion = {
  applicationId: "application-a",
  token: "request-a-1",
  contextGeneration: 4,
  publicationGeneration: 7,
  editorRevision: 11,
  mutationGeneration: 13,
  packetIdentity: "packet-a-v1",
  terminal: false,
};

function decide(overrides: Partial<AttendedHandoffCurrentVersion> = {}, arrivedLate = false) {
  return attendedHandoffAuthorizationDisposition({
    request,
    current: { ...current, ...overrides },
    arrivedLate,
  });
}

describe("attended handoff response ownership", () => {
  test("only the unchanged click context may navigate", () => {
    assert.equal(decide(), "navigate");
  });

  test("A to B to A stores A recovery but never lets the old A tab navigate", () => {
    assert.equal(decide({ contextGeneration: 6, editorRevision: 13 }), "store");
  });

  test("a response after the blank-tab deadline remains resumable without navigating", () => {
    assert.equal(decide({}, true), "store");
  });

  test("a same-application packet edit discards the old authorization response", () => {
    assert.equal(decide({ packetIdentity: "packet-a-v2", editorRevision: 12 }), "discard");
  });

  test("a newer server publication or mutation in the same context wins", () => {
    assert.equal(decide({ publicationGeneration: 8 }), "discard");
    assert.equal(decide({ mutationGeneration: 14 }), "discard");
  });

  test("a passive GET of the same authorization does not make the clicked tab dead", () => {
    assert.equal(attendedHandoffAuthorizationDisposition({
      request,
      current: { ...current, publicationGeneration: 8 },
      arrivedLate: false,
      publicationEquivalent: true,
    }), "navigate");
    assert.equal(attendedHandoffAuthorizationDisposition({
      request,
      current: { ...current, publicationGeneration: 8, packetIdentity: "packet-a-failed" },
      arrivedLate: false,
      publicationEquivalent: true,
    }), "discard");
  });

  test("a submitted receipt cannot be rolled back or followed by employer navigation", () => {
    assert.equal(decide({ terminal: true }), "discard");
  });

  test("a replacement request token makes the old response inert", () => {
    assert.equal(decide({ token: "request-a-2" }), "discard");
    const secondRequest = { ...request, token: "request-a-2" };
    assert.equal(attendedHandoffAuthorizationDisposition({
      request: secondRequest,
      current: { ...current, token: "request-a-2" },
      arrivedLate: false,
    }), "navigate");
  });
});

describe("attended handoff boundary lock", () => {
  test("one opener owns an application at a time", () => {
    const locks = new Map<string, AttendedHandoffBoundaryLock>();
    assert.equal(beginAttendedHandoffOpenerLock(locks, "application-a", "open-1"), true);
    assert.equal(beginAttendedHandoffOpenerLock(locks, "application-a", "open-2"), false);
    assert.equal(attendedHandoffBoundaryLockToken(locks, "application-a"), "open-1");
  });

  test("an outcome invalidates an in-flight opener and blocks every later boundary action", () => {
    const locks = new Map<string, AttendedHandoffBoundaryLock>();
    assert.equal(beginAttendedHandoffOpenerLock(locks, "application-a", "open-1"), true);
    assert.equal(beginAttendedHandoffOutcomeLock(locks, "application-a", "outcome-1"), true);
    assert.equal(attendedHandoffBoundaryLockToken(locks, "application-a"), "outcome-1");
    assert.equal(beginAttendedHandoffOpenerLock(locks, "application-a", "open-2"), false);
    assert.equal(beginAttendedHandoffOutcomeLock(locks, "application-a", "outcome-2"), false);
    assert.equal(finishAttendedHandoffBoundaryLock(locks, "application-a", "open-1"), false);
    assert.equal(attendedHandoffBoundaryLockToken(locks, "application-a"), "outcome-1");
    assert.equal(attendedHandoffAuthorizationDisposition({
      request,
      current: { ...current, token: attendedHandoffBoundaryLockToken(locks, "application-a") },
      arrivedLate: false,
    }), "discard");
  });

  test("only the exact owner can release the lock", () => {
    const locks = new Map<string, AttendedHandoffBoundaryLock>();
    assert.equal(beginAttendedHandoffOutcomeLock(locks, "application-a", "outcome-1"), true);
    assert.equal(finishAttendedHandoffBoundaryLock(locks, "application-a", "outcome-2"), false);
    assert.equal(finishAttendedHandoffBoundaryLock(locks, "application-a", "outcome-1"), true);
    assert.equal(attendedHandoffBoundaryLockToken(locks, "application-a"), null);
    assert.equal(beginAttendedHandoffOpenerLock(locks, "application-a", "open-1"), true);
  });
});

describe("self-submit opener safety", () => {
  const at = "2026-08-26T10:00:00.000Z";

  test("only an explicit safe fold or exact active recovery may reach the opener", () => {
    assert.equal(attendedSelfSubmitMayOpen({ kind: "no_evidence" }, false), true);
    assert.equal(attendedSelfSubmitMayOpen({
      kind: "safe_not_sent",
      attemptId: "attempt-a",
      proofKind: "applicant_checked_not_sent",
      resolvedAt: at,
    }, false), true);

    for (const unsafe of [
      null,
      { kind: "malformed" },
      { kind: "blocked_unverified", attemptId: "attempt-a", at, reason: "opened" },
      { kind: "blocked_unverified", attemptId: "attempt-a", at, reason: "pressed" },
      { kind: "blocked_unverified", attemptId: "attempt-a", at, reason: "invalid_sequence" },
      { kind: "blocked_unverified", attemptId: "attempt-a", at, reason: "boundary_authorized", leaseId: "lease-a", expiresAt: at },
      { kind: "blocked_confirmed", attemptId: "attempt-a", confirmedAt: at },
    ]) assert.equal(attendedSelfSubmitMayOpen(unsafe, false), false);

    assert.equal(attendedSelfSubmitMayOpen({
      kind: "blocked_unverified",
      attemptId: "attempt-a",
      at,
      reason: "boundary_authorized",
      leaseId: "lease-a",
      expiresAt: at,
    }, true), true);
  });

  test("legacy employer links require safe evidence and a truly absent capability field", () => {
    const safe = { kind: "no_evidence" };
    const capability = {
      version: "attended_handoff_v1",
      kind: "manual_handoff",
      capability_sha256: "a".repeat(64),
      url_sha256: "b".repeat(64),
    };
    assert.equal(legacyEmployerFallbackMayRender(safe, undefined), true);
    for (const declared of [
      null,
      "",
      {},
      capability,
      { ...capability, version: "wrong" },
      { ...capability, kind: "wrong" },
      { ...capability, capability_sha256: "short" },
    ]) assert.equal(legacyEmployerFallbackMayRender(safe, declared), false);
    assert.equal(legacyEmployerFallbackMayRender(null, undefined), false);
    assert.equal(legacyEmployerFallbackMayRender({ kind: "blocked_confirmed", attemptId: "attempt-a", confirmedAt: at }, undefined), false);
  });
});

describe("expired attended attempt identity", () => {
  const attemptId = "11111111-1111-4111-8111-111111111111";
  const leaseId = "22222222-2222-4222-8222-222222222222";
  const activationId = "33333333-3333-4333-8333-333333333333";
  const capability = {
    version: "attended_handoff_v1",
    kind: "self_submit",
    capability_sha256: "a".repeat(64),
    url_sha256: "b".repeat(64),
  };
  const expiredPassivePayload = {
    manual_attempt_id: attemptId,
    manual_handoff_resume_available: false,
    review: { submission_claim_id: attemptId },
    retry_safety: {
      kind: "blocked_unverified",
      attemptId,
      at: "2026-08-26T09:00:00.000Z",
      reason: "boundary_authorized",
      leaseId,
      expiresAt: "2026-08-26T10:00:00.000Z",
    },
    attended_handoff_capability: capability,
  };

  test("expiry removes replay credentials but preserves the exact positive outcome identity", () => {
    assert.deepEqual(attendedManualAttemptIdentity(expiredPassivePayload), { attemptId });
    assert.equal(activeAttendedManualAttemptId(expiredPassivePayload), attemptId);
    assert.equal(activeAttendedManualRecovery(expiredPassivePayload, Date.parse("2026-08-26T11:00:00.000Z")), null);
    assert.equal(attendedSelfSubmitMayOpen(expiredPassivePayload.retry_safety, false), false);
  });

  test("only the complete unexpired tuple is replayable", () => {
    assert.deepEqual(activeAttendedManualRecovery({
      ...expiredPassivePayload,
      boundary_lease_id: leaseId,
      boundary_activation_id: activationId,
      manual_handoff_resume_available: true,
      retry_safety: {
        ...expiredPassivePayload.retry_safety,
        expiresAt: "2026-08-26T12:00:00.000Z",
      },
    }, Date.parse("2026-08-26T11:00:00.000Z")), { attemptId, leaseId, activationId });
  });
});

describe("attended handoff outcome response proof", () => {
  const receipt = {
    confirmation_text: "Confirmed by you after reviewing the employer page.",
    final_url: "https://employer.example/apply/confirmation",
    captured_at: "2026-08-26T10:00:00.000Z",
    source: "attended_handoff",
  };
  const baseReview = { status: "submitted", receipt };
  const submitted = {
    application_id: "application-a",
    review: baseReview,
    retry_safety: {
      kind: "blocked_confirmed",
      attemptId: "attempt-a",
      confirmedAt: "2026-08-26T10:00:00.000Z",
    },
  };
  const cleared = {
    application_id: "application-a",
    review: { status: "ready_for_final_approval" },
    retry_safety: {
      kind: "safe_not_sent",
      attemptId: "attempt-a",
      proofKind: "applicant_checked_not_sent",
      resolvedAt: "2026-08-26T10:00:00.000Z",
    },
  };

  test("submitted requires exact application, terminal review, and confirmed exact attempt", () => {
    assert.equal(attendedHandoffOutcomeResponseMatches(submitted, "application-a", "attempt-a", "submitted"), true);
    assert.equal(attendedHandoffOutcomeResponseMatches({ ...submitted, application_id: "application-b" }, "application-a", "attempt-a", "submitted"), false);
    assert.equal(attendedHandoffOutcomeResponseMatches({ ...submitted, review: { status: "ready_for_final_approval" } }, "application-a", "attempt-a", "submitted"), false);
    assert.equal(attendedHandoffOutcomeResponseMatches({ ...submitted, retry_safety: { ...submitted.retry_safety, attemptId: "attempt-b" } }, "application-a", "attempt-a", "submitted"), false);
    assert.equal(attendedHandoffOutcomeResponseMatches({ ...submitted, retry_safety: { kind: "no_evidence" } }, "application-a", "attempt-a", "submitted"), false);
  });

  test("submitted requires a runtime-valid attended receipt", () => {
    for (const invalidReceipt of [
      undefined,
      { ...receipt, confirmation_text: "  " },
      { ...receipt, captured_at: "not-a-date" },
      { ...receipt, source: "managed_browser" },
      { ...receipt, final_url: "" },
      { ...receipt, final_url: "javascript:alert(1)" },
      { ...receipt, final_url: "https://user:pass@employer.example/confirmation" },
    ]) {
      assert.equal(attendedHandoffOutcomeResponseMatches({
        ...submitted,
        review: { status: "submitted", ...(invalidReceipt ? { receipt: invalidReceipt } : {}) },
      }, "application-a", "attempt-a", "submitted"), false);
    }
  });

  test("cleared requires an exact safe verdict and a released nonterminal review", () => {
    assert.equal(attendedHandoffOutcomeResponseMatches(cleared, "application-a", "attempt-a", "cleared"), true);
    assert.equal(attendedHandoffOutcomeResponseMatches({ ...cleared, application_id: "application-b" }, "application-a", "attempt-a", "cleared"), false);
    assert.equal(attendedHandoffOutcomeResponseMatches({ ...cleared, review: { status: "submitted" } }, "application-a", "attempt-a", "cleared"), false);
    assert.equal(attendedHandoffOutcomeResponseMatches({ ...cleared, review: { status: "ready_for_final_approval", submission_claim_id: "attempt-a" } }, "application-a", "attempt-a", "cleared"), false);
    assert.equal(attendedHandoffOutcomeResponseMatches({ ...cleared, retry_safety: { ...cleared.retry_safety, attemptId: "attempt-b" } }, "application-a", "attempt-a", "cleared"), false);
    assert.equal(attendedHandoffOutcomeResponseMatches({ ...cleared, retry_safety: { kind: "no_evidence" } }, "application-a", "attempt-a", "cleared"), false);
  });
});

describe("managed unverified outcome response proof", () => {
  const at = "2026-08-26T10:00:00.000Z";
  const attemptId = "11111111-1111-4111-8111-111111111111";
  const notSent = {
    application_id: "application-a",
    review: {
      status: "needs_attention",
      portal_url: "https://employer.example/apply",
      extension_handoff_url: "https://employer.example/apply/session",
      unverified_submission: {
        at: "2026-08-26T09:00:00.000Z",
        resolution: "not_sent",
        resolved_at: at,
        portal_url: "https://employer.example/apply/exact",
      },
      nested: { redirect_href: "https://employer.example/redirect" },
    },
    retry_safety: {
      kind: "safe_not_sent",
      attemptId,
      proofKind: "applicant_checked_not_sent",
      resolvedAt: at,
    },
    handoff_url: "https://live.browserbase.com/session",
    manual_attempt_id: attemptId,
    boundary_lease_id: "22222222-2222-4222-8222-222222222222",
    boundary_activation_id: "33333333-3333-4333-8333-333333333333",
    manual_handoff_resume_available: true,
  };

  test("negative proof binds the exact application, attempt, and not-sent projection", () => {
    assert.equal(unverifiedSubmissionOutcomeResponseMatches(notSent, "application-a", attemptId, false), true);
    assert.equal(unverifiedSubmissionOutcomeResponseMatches({ ...notSent, application_id: "application-b" }, "application-a", attemptId, false), false);
    assert.equal(unverifiedSubmissionOutcomeResponseMatches({
      ...notSent,
      retry_safety: { ...notSent.retry_safety, attemptId: "44444444-4444-4444-8444-444444444444" },
    }, "application-a", attemptId, false), false);
    assert.equal(unverifiedSubmissionOutcomeResponseMatches({
      ...notSent,
      review: { ...notSent.review, status: "submitted" },
    }, "application-a", attemptId, false), false);
    assert.equal(unverifiedSubmissionOutcomeResponseMatches({
      ...notSent,
      review: {
        ...notSent.review,
        unverified_submission: { ...notSent.review.unverified_submission, resolution: "sent" },
      },
    }, "application-a", attemptId, false), false);
  });

  test("negative publication is URL-free and capability-explicitly fail closed", () => {
    const projected = failClosedUnverifiedNotSentResponse(notSent);
    assert.equal(projected.attended_handoff_capability, null);
    assert.equal("handoff_url" in projected, false);
    assert.equal("manual_attempt_id" in projected, false);
    assert.equal("boundary_lease_id" in projected, false);
    assert.equal("boundary_activation_id" in projected, false);
    assert.equal("manual_handoff_resume_available" in projected, false);
    assert.doesNotMatch(JSON.stringify(projected), /https:\/\/employer\.example|live\.browserbase\.com/);
    assert.equal(legacyEmployerFallbackMayRender(projected.retry_safety, projected.attended_handoff_capability), false);
  });

  test("positive proof requires the exact sent resolution in addition to the attended receipt", () => {
    const submitted = {
      application_id: "application-a",
      review: {
        status: "submitted",
        unverified_submission: { resolution: "sent", resolved_at: at },
        receipt: {
          confirmation_text: "Confirmed by you after reviewing the employer page.",
          final_url: "https://employer.example/apply/confirmation",
          captured_at: at,
          source: "attended_handoff",
        },
      },
      retry_safety: { kind: "blocked_confirmed", attemptId, confirmedAt: at },
    };
    assert.equal(unverifiedSubmissionOutcomeResponseMatches(submitted, "application-a", attemptId, true), true);
    assert.equal(unverifiedSubmissionOutcomeResponseMatches({
      ...submitted,
      review: { ...submitted.review, unverified_submission: { resolution: "not_sent", resolved_at: at } },
    }, "application-a", attemptId, true), false);
  });
});

describe("attended outcome publication ownership", () => {
  test("A to B to A and a newer Y publication both make held X inert", () => {
    assert.equal(attendedHandoffOutcomeMayPublish({ request, current }), true);
    assert.equal(attendedHandoffOutcomeMayPublish({
      request,
      current: { ...current, contextGeneration: current.contextGeneration + 2 },
    }), false);
    assert.equal(attendedHandoffOutcomeMayPublish({
      request,
      current: {
        ...current,
        publicationGeneration: current.publicationGeneration + 1,
        packetIdentity: "packet-a-attempt-y",
      },
    }), false);
  });
});
