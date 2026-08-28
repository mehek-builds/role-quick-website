import assert from "node:assert/strict";
import test from "node:test";
import {
  COVER_LETTER_WAIT_MS,
  HANDOFF_CLOCK_TICK_MS,
  canonicalManualResolutionMatches,
  coverLetterBlocks,
  coverLetterGate,
  coverLetterIdentity,
  documentsFromSpecMarks,
  documentsIdentity,
  handoffWindowExpired,
  nextCoverLetterValue,
  nextSubmissionState,
  publishSubmissionEnvelope,
  submissionAfterPacketAudit,
  submissionReviewPacketIdentity,
  submissionBoundaryAuthorizationActive,
  submissionBoundaryAuthorizationBlocksResolution,
  submissionRetrySafetyAllowsRetry,
  submissionRetrySafetyBlocksNegativeResolution,
  submissionRetrySafetyFromUnknown,
  submissionRetrySafetyIdentity,
  submissionRetrySafetyPrecedence,
  submissionSnapshotIsOlder,
  submissionCoverLetterField,
  type SpecDocumentMark,
  type SubmissionSnapshot,
} from "./submission-state.ts";
import { legacyEmployerFallbackMayRender } from "./attended-handoff-replay.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

/* The measured packet. Cresta, 8142004c-3358-4538-8778-16df5e31c5bb, read out of production on
   2026-08-09: status ready_for_final_approval, `_review.updated_at` 2026-08-08T22:10:10.431Z,
   `_cover_letter` a complete 294 word artifact with an object_key and a file_name.

   The board seed carries the review and no cover letter. The server response carries both, and the
   SAME `review.updated_at`, because nothing has touched the review since the run finished and
   nothing ever will while it sits waiting to be sent. The old rule compared that one timestamp and
   kept the seed, so the screen said "Loading cover letter." and the Send button stayed disabled
   forever on an application that was ready to go. */
const REVIEW_UPDATED_AT = "2026-08-08T22:10:10.431Z";

const seed: SubmissionSnapshot = {
  application_id: "8142004c-3358-4538-8778-16df5e31c5bb",
  review: { updated_at: REVIEW_UPDATED_AT },
  partial: true,
};

const fromServer: SubmissionSnapshot = {
  application_id: "8142004c-3358-4538-8778-16df5e31c5bb",
  review: { updated_at: REVIEW_UPDATED_AT },
  cover_letter: {
    body: "x".repeat(1800),
    object_key: "users/a18f774b/resumes/8142004c-cover-letter-1786227004770.pdf",
    generated_at: "2026-08-08T22:10:04.860Z",
  },
  configured: true,
};

test("a server response carrying a cover letter replaces a board seed that has none", () => {
  // The old rule, kept here as the counter-example it is.
  const oldRule = seed.review.updated_at === fromServer.review.updated_at ? seed : fromServer;
  assert.equal(oldRule.cover_letter, undefined, "the defect: identical timestamps discarded the response");

  assert.equal(nextSubmissionState(seed, fromServer), fromServer);
});

test("a seed never wins, even when the server agrees with it in every field", () => {
  const agreeing: SubmissionSnapshot = { ...fromServer, cover_letter: null, configured: undefined };
  const seededSame: SubmissionSnapshot = { ...agreeing, partial: true };
  assert.equal(nextSubmissionState(seededSame, agreeing), agreeing);
});

test("a settled packet still dedupes, so the 2.5s poll does not re-render forever", () => {
  const installed = nextSubmissionState(seed, fromServer);
  const identicalNextTick: SubmissionSnapshot = {
    ...fromServer,
    cover_letter: { ...fromServer.cover_letter },
  };
  assert.equal(nextSubmissionState(installed, identicalNextTick), installed, "same answer, same object, no re-render");
});

test("a cover letter that appears after the first poll is installed without the review moving", () => {
  const withoutLetter: SubmissionSnapshot = { ...fromServer, cover_letter: null };
  const withLetter: SubmissionSnapshot = { ...fromServer };
  assert.equal(nextSubmissionState(withoutLetter, withLetter), withLetter);
});

test("explicit null clears a stored cover letter while an omitted partial field preserves it", () => {
  const removed: SubmissionSnapshot = { ...fromServer, cover_letter: null };
  const omitted = {
    application_id: fromServer.application_id,
    review: { ...fromServer.review, updated_at: "2026-08-08T22:11:00.000Z" },
    configured: fromServer.configured,
  } satisfies SubmissionSnapshot;
  const storedLetter = fromServer.cover_letter ?? undefined;

  assert.deepEqual(submissionCoverLetterField(removed), { included: true, value: null });
  assert.deepEqual(submissionCoverLetterField(omitted as SubmissionSnapshot), { included: false });
  assert.equal(nextCoverLetterValue(storedLetter, removed), undefined);
  assert.equal(nextCoverLetterValue(storedLetter, omitted as SubmissionSnapshot), storedLetter);
  assert.equal(nextSubmissionState(fromServer, removed), removed);
  assert.equal(nextSubmissionState(fromServer, omitted).cover_letter, fromServer.cover_letter);
});

test("a cover letter that is regenerated in place is installed", () => {
  const regenerated: SubmissionSnapshot = {
    ...fromServer,
    cover_letter: { ...fromServer.cover_letter, object_key: "users/a18f774b/resumes/8142004c-cover-letter-1786300000000.pdf" },
  };
  assert.equal(nextSubmissionState(fromServer, regenerated), regenerated);
});

test("handoff URL, exact manual recovery tuple, and configured are compared in their own right", () => {
  const withHandoff: SubmissionSnapshot = { ...fromServer, handoff_url: "https://live.browserbase/session/1" };
  const withoutHandoff: SubmissionSnapshot = { ...fromServer, handoff_url: undefined };
  const withManualAttempt: SubmissionSnapshot = {
    ...fromServer,
    manual_attempt_id: "6d58c1f5-e885-41f7-a16a-dac37f98ab17",
    boundary_lease_id: "1e8ae85c-7fb2-4c54-913f-2db6c9318c1e",
    boundary_activation_id: "8cba1f03-3d70-43cb-b770-466e18b8cdf4",
    manual_handoff_resume_available: true,
    retry_safety: {
      kind: "blocked_unverified",
      attemptId: "6d58c1f5-e885-41f7-a16a-dac37f98ab17",
      at: "2026-08-24T08:00:00.000Z",
      reason: "boundary_authorized",
      leaseId: "1e8ae85c-7fb2-4c54-913f-2db6c9318c1e",
      expiresAt: "2026-08-24T08:05:00.000Z",
    },
  };
  // A live browser URL that appears, and one that expires, are both news.
  assert.equal(nextSubmissionState(withoutHandoff, withHandoff), withHandoff);
  assert.equal(nextSubmissionState(withHandoff, withoutHandoff), withoutHandoff);
  assert.equal(nextSubmissionState(fromServer, withManualAttempt), withManualAttempt);
  assert.equal(
    nextSubmissionState(withManualAttempt, fromServer).manual_attempt_id,
    withManualAttempt.manual_attempt_id,
    "an equal-clock GET cannot drop the exact manual reservation",
  );
  assert.equal(nextSubmissionState(withManualAttempt, fromServer).boundary_lease_id, withManualAttempt.boundary_lease_id);
  assert.equal(nextSubmissionState(withManualAttempt, fromServer).boundary_activation_id, withManualAttempt.boundary_activation_id);
  assert.equal(nextSubmissionState(withManualAttempt, fromServer).manual_handoff_resume_available, true);
  const expired = { ...withManualAttempt, manual_handoff_resume_available: false };
  assert.deepEqual(nextSubmissionState(withManualAttempt, expired), expired, "an authoritative expiry removes URL replay");
  const confirmed: SubmissionSnapshot = {
    ...withManualAttempt,
    retry_safety: {
      kind: "blocked_confirmed",
      attemptId: withManualAttempt.manual_attempt_id!,
      confirmedAt: "2026-08-24T08:02:00.000Z",
    },
    manual_attempt_id: undefined,
    boundary_lease_id: undefined,
    boundary_activation_id: undefined,
    manual_handoff_resume_available: false,
  };
  assert.equal(nextSubmissionState(withManualAttempt, confirmed), confirmed, "a terminal outcome removes recovery metadata");
  assert.equal(nextSubmissionState(fromServer, { ...fromServer, configured: false }).configured, false);
});

test("an equal-clock malformed capability declaration replaces legacy absence and blocks raw links", () => {
  const current: SubmissionSnapshot = {
    ...fromServer,
    retry_safety: { kind: "no_evidence" },
  };
  for (const declaration of [
    null,
    { version: "v2" },
  ]) {
    const incoming = {
      ...current,
      attended_handoff_capability: declaration,
    } as unknown as SubmissionSnapshot;
    const installed = nextSubmissionState(current, incoming);
    assert.equal(installed, incoming);
    assert.equal(legacyEmployerFallbackMayRender(installed.retry_safety, installed.attended_handoff_capability), false);
  }
});

test("every immutable retry-safety event is installed while review.updated_at stays frozen", () => {
  const verdicts = [
    { kind: "no_evidence" as const },
    {
      kind: "blocked_unverified" as const,
      attemptId: "attempt-1",
      at: "2026-08-24T08:00:00.000Z",
      reason: "opened" as const,
    },
    {
      kind: "safe_not_sent" as const,
      attemptId: "attempt-1",
      proofKind: "applicant_checked_not_sent" as const,
      resolvedAt: "2026-08-24T08:02:00.000Z",
    },
    {
      kind: "blocked_unverified" as const,
      attemptId: "attempt-2",
      at: "2026-08-24T08:02:30.000Z",
      reason: "boundary_authorized" as const,
      leaseId: "lease-2",
      expiresAt: "2026-08-24T08:05:30.000Z",
    },
    {
      kind: "blocked_unverified" as const,
      attemptId: "attempt-2",
      at: "2026-08-24T08:03:00.000Z",
      reason: "pressed" as const,
    },
    {
      kind: "blocked_confirmed" as const,
      attemptId: "attempt-2",
      confirmedAt: "2026-08-24T08:04:00.000Z",
    },
  ];
  let installed: SubmissionSnapshot = { ...fromServer, retry_safety: verdicts[0] };
  for (const retry_safety of verdicts.slice(1)) {
    const incoming: SubmissionSnapshot = { ...fromServer, retry_safety };
    assert.equal(incoming.review.updated_at, installed.review.updated_at);
    assert.equal(nextSubmissionState(installed, incoming, { authoritativeRetrySafety: true }), incoming);
    installed = incoming;
  }
});

test("only a complete safe server verdict permits retry", () => {
  assert.equal(submissionRetrySafetyAllowsRetry({ kind: "no_evidence" }), true);
  assert.equal(submissionRetrySafetyAllowsRetry({
    kind: "safe_not_sent",
    attemptId: "attempt-1",
    proofKind: "applicant_checked_not_sent",
    resolvedAt: "2026-08-24T08:02:00.000Z",
  }), true);
  assert.equal(submissionRetrySafetyAllowsRetry({ kind: "safe_not_sent", attemptId: "attempt-1" }), false);
  assert.equal(submissionRetrySafetyAllowsRetry({
    kind: "safe_not_sent",
    attemptId: "attempt-1",
    proofKind: "made_up_proof",
    resolvedAt: "2026-08-24T08:02:00.000Z",
  }), false);
  assert.equal(submissionRetrySafetyAllowsRetry({
    kind: "blocked_unverified",
    attemptId: "attempt-1",
    at: "2026-08-24T08:00:00.000Z",
    reason: "boundary_authorized",
    leaseId: "lease-1",
    expiresAt: "2026-08-24T08:03:00.000Z",
  }), false);
  assert.equal(submissionRetrySafetyAllowsRetry({
    kind: "blocked_unverified",
    attemptId: "attempt-1",
    at: "2026-08-24T08:00:00.000Z",
    reason: "pressed",
  }), false);
  assert.equal(submissionRetrySafetyAllowsRetry({
    kind: "blocked_confirmed",
    attemptId: "attempt-1",
    confirmedAt: "2026-08-24T08:04:00.000Z",
  }), false);
  assert.equal(submissionRetrySafetyAllowsRetry(undefined), false);
  assert.equal(submissionRetrySafetyAllowsRetry(null), false);
  assert.equal(submissionRetrySafetyAllowsRetry({
    kind: "safe_not_sent",
    attemptId: "attempt-1",
    proofKind: "applicant_checked_not_sent",
    resolvedAt: "not-a-date",
  }), false);
});

test("canonical manual resolution requires an exact per-attempt verdict", () => {
  const applicationId = "application-1";
  const attemptId = "attempt-1";
  const aggregate = {
    kind: "blocked_confirmed",
    attemptId,
    confirmedAt: "2026-08-24T08:04:00.000Z",
  };
  const base = {
    application_id: applicationId,
    attempt_id: attemptId,
    found: true,
    retry_safety: aggregate,
  };

  assert.equal(
    canonicalManualResolutionMatches(applicationId, attemptId, true, base),
    false,
    "aggregate safety cannot stand in for the required exact-attempt field",
  );
  assert.equal(canonicalManualResolutionMatches(applicationId, attemptId, true, {
    ...base,
    resolved_attempt_retry_safety: { ...aggregate, attemptId: "attempt-2" },
  }), false);
  assert.equal(canonicalManualResolutionMatches(applicationId, attemptId, true, {
    ...base,
    resolved_attempt_retry_safety: aggregate,
  }), true);
  assert.equal(canonicalManualResolutionMatches(applicationId, attemptId, false, {
    ...base,
    found: false,
    resolved_attempt_retry_safety: {
      kind: "safe_not_sent",
      attemptId,
      proofKind: "applicant_checked_not_sent",
      resolvedAt: "2026-08-24T08:04:00.000Z",
    },
  }), true);
});

test("pressed, boundary-authorized, and invalid-sequence attempts permanently veto a negative answer", () => {
  const at = "2026-08-24T08:00:00.000Z";
  assert.equal(submissionRetrySafetyBlocksNegativeResolution({
    kind: "blocked_unverified",
    attemptId: "attempt-1",
    at,
    reason: "opened",
  }), false, "an opening that never crossed the employer boundary can still be checked as not sent");
  for (const reason of ["pressed", "boundary_authorized", "invalid_sequence"] as const) {
    assert.equal(submissionRetrySafetyBlocksNegativeResolution({
      kind: "blocked_unverified",
      attemptId: "attempt-1",
      at,
      reason,
    }), true, `${reason} must never expose a negative resolution`);
  }
  assert.equal(submissionRetrySafetyBlocksNegativeResolution({
    kind: "blocked_unverified",
    reason: "boundary_authorized",
    expiresAt: "2020-01-01T00:00:00.000Z",
  }), true, "expired or malformed boundary metadata cannot reopen the negative action");
});

test("runtime parsing rejects malformed safety before it can grant retry", () => {
  assert.deepEqual(submissionRetrySafetyFromUnknown({ kind: "no_evidence" }), { kind: "no_evidence" });
  assert.equal(submissionRetrySafetyFromUnknown({
    kind: "safe_not_sent",
    attemptId: "attempt-1",
    proofKind: "applicant_checked_not_sent",
    resolvedAt: "not-a-date",
  }), null);
  assert.equal(submissionRetrySafetyFromUnknown({
    kind: "blocked_unverified",
    attemptId: "attempt-1",
    at: "2026-08-24T08:00:00.000Z",
    reason: "boundary_authorized",
    leaseId: "",
    expiresAt: "2026-08-24T08:03:00.000Z",
  }), null);
});

test("equal-clock retry safety only moves toward stricter evidence without causal authority", () => {
  const safe: SubmissionSnapshot = { ...fromServer, retry_safety: { kind: "no_evidence" } };
  const unknown: SubmissionSnapshot = { ...fromServer, retry_safety: null };
  const opened: SubmissionSnapshot = {
    ...fromServer,
    retry_safety: {
      kind: "blocked_unverified",
      attemptId: "attempt-1",
      at: "2026-08-24T08:00:00.000Z",
      reason: "opened",
    },
  };
  const pressed: SubmissionSnapshot = {
    ...opened,
    retry_safety: {
      kind: "blocked_unverified",
      attemptId: "attempt-1",
      at: "2026-08-24T08:00:00.000Z",
      reason: "pressed",
    },
  };
  const invalidSequence: SubmissionSnapshot = {
    ...opened,
    retry_safety: {
      kind: "blocked_unverified",
      attemptId: "attempt-1",
      at: "2026-08-24T08:00:00.000Z",
      reason: "invalid_sequence",
    },
  };
  const confirmed: SubmissionSnapshot = {
    ...fromServer,
    retry_safety: {
      kind: "blocked_confirmed",
      attemptId: "attempt-1",
      confirmedAt: "2026-08-24T08:04:00.000Z",
    },
  };

  assert.equal(submissionRetrySafetyPrecedence(safe.retry_safety), 0);
  assert.ok(submissionRetrySafetyPrecedence(unknown.retry_safety) > submissionRetrySafetyPrecedence(safe.retry_safety));
  assert.equal(nextSubmissionState(safe, unknown), unknown, "missing safety closes stale permission");
  assert.equal(nextSubmissionState(unknown, safe), unknown, "an equal timestamp cannot turn uncertainty into permission");
  assert.equal(nextSubmissionState(pressed, safe).retry_safety, pressed.retry_safety, "an earlier safe GET cannot erase a press");
  assert.equal(nextSubmissionState(invalidSequence, opened).retry_safety, invalidSequence.retry_safety);
  assert.equal(nextSubmissionState(confirmed, pressed).retry_safety, confirmed.retry_safety);
  assert.equal(nextSubmissionState(opened, pressed), pressed, "newer immutable evidence progresses");
  assert.equal(nextSubmissionState(pressed, confirmed), confirmed, "exact confirmation remains terminal");
  assert.equal(
    nextSubmissionState(unknown, safe, { authoritativeRetrySafety: true }),
    safe,
    "a causally fresh authoritative refresh may prove that retry is safe",
  );
});

test("a boundary authorization is active only for a complete unexpired server verdict", () => {
  const now = Date.parse("2026-08-24T08:02:00.000Z");
  const active = {
    kind: "blocked_unverified",
    attemptId: "attempt-1",
    at: "2026-08-24T08:00:00.000Z",
    reason: "boundary_authorized",
    leaseId: "lease-1",
    expiresAt: "2026-08-24T08:03:00.000Z",
  };
  assert.equal(submissionBoundaryAuthorizationActive(active, now), true);
  assert.equal(submissionBoundaryAuthorizationActive(active, Date.parse(active.expiresAt)), false);
  assert.equal(submissionBoundaryAuthorizationActive({ ...active, leaseId: "" }, now), false);
  assert.equal(submissionBoundaryAuthorizationActive({ ...active, expiresAt: "not-a-date" }, now), false);
  assert.equal(submissionBoundaryAuthorizationBlocksResolution(active, now), true);
  assert.equal(submissionBoundaryAuthorizationBlocksResolution(active, Date.parse(active.expiresAt)), false);
  assert.equal(submissionBoundaryAuthorizationBlocksResolution({ ...active, leaseId: "" }, now), true);
  assert.equal(submissionBoundaryAuthorizationBlocksResolution({ ...active, expiresAt: "not-a-date" }, now), true);
  assert.equal(submissionRetrySafetyIdentity(active).includes("boundary_authorized"), true);
  assert.equal(submissionRetrySafetyIdentity({ ...active, leaseId: "" }), "invalid");
});

test("missing retry safety replaces stale permission and repeated verdicts still dedupe", () => {
  const safe: SubmissionSnapshot = { ...fromServer, retry_safety: { kind: "no_evidence" } };
  const missing: SubmissionSnapshot = { ...fromServer, retry_safety: undefined };
  assert.notEqual(submissionRetrySafetyIdentity(safe.retry_safety), submissionRetrySafetyIdentity(missing.retry_safety));
  assert.equal(nextSubmissionState(safe, missing), missing, "a rolling response cannot preserve stale retry permission");
  assert.equal(
    nextSubmissionState(safe, { ...safe, retry_safety: { kind: "no_evidence" } }),
    safe,
    "an identical verdict does not rerender a settled packet",
  );
});

/* THE SAME DEFECT AS THE COVER LETTER, IN THE FIELD ADDED AFTER IT.
 *
 * `documents` lives outside `review`, so nothing advances `review.updated_at` when a transcript is
 * attached to a packet already parked at ready_for_final_approval. Left out of the comparison, the
 * poll that first carried the attachment matched on the timestamp, was discarded, and the screen
 * went on drawing the application as carrying no file while the server handed it one every 2.5
 * seconds. That is the exact shape of the bug this module was written to end. */
test("a document that appears after the first poll is installed without the review moving", () => {
  const withoutDocument = { ...fromServer, documents: {} } satisfies SubmissionSnapshot;
  const withDocument = {
    ...fromServer,
    documents: {
      transcript: {
        document_id: "6b0f2f3a-1c4d-4a2f-9c1e-0b3a5d7e91aa",
        file_name: "transcript.pdf",
        attached_at: "2026-08-11T09:14:02.117Z",
        ordered_at: null,
      },
    },
  } satisfies SubmissionSnapshot;

  // The rule as it stood: every other field agrees, so the response carrying the file was dropped.
  assert.equal(
    coverLetterIdentity(withoutDocument.cover_letter),
    coverLetterIdentity(withDocument.cover_letter),
    "the setup only tests the documents comparison if nothing else distinguishes the two",
  );
  assert.equal(withoutDocument.review.updated_at, withDocument.review.updated_at);

  assert.equal(nextSubmissionState(withoutDocument, withDocument), withDocument);
  // And removing it is news in the same way an expiring handoff URL is.
  assert.equal(nextSubmissionState(withDocument, withoutDocument), withoutDocument);
});

test("a poll that repeats the same attachment still dedupes, so the screen does not re-render forever", () => {
  const attached = {
    ...fromServer,
    documents: { transcript: { document_id: "6b0f2f3a", file_name: "transcript.pdf", attached_at: "2026-08-11T09:14:02.117Z" } },
  } satisfies SubmissionSnapshot;
  const nextTick = { ...attached, documents: { transcript: { ...attached.documents.transcript } } };
  assert.equal(nextSubmissionState(attached, nextTick), attached, "same answer, new object, no re-render");
});

test("never measured and measured-but-empty are two different answers", () => {
  /* `documents` absent means no envelope has carried the measurement, and the review screen reads
     that as "do not block the send". An empty object means the server looked and found nothing,
     which DOES block once the employer's form has asked for a file. A dedupe that collapsed the two
     would drop the response that first says "we looked". */
  assert.notEqual(documentsIdentity(undefined), documentsIdentity({}));
  assert.equal(documentsIdentity(undefined), documentsIdentity(null));
  /* Annotated rather than `satisfies`: `satisfies` keeps the literal type, which pins `documents`
     to exactly `undefined` on the first argument and makes the generic refuse the second. */
  const unmeasured: SubmissionSnapshot = { ...fromServer, documents: undefined };
  const measuredEmpty: SubmissionSnapshot = { ...fromServer, documents: {} };
  assert.equal(nextSubmissionState(unmeasured, measuredEmpty), measuredEmpty);
});

test("document identity ignores nothing that distinguishes two marks", () => {
  assert.notEqual(
    documentsIdentity({ transcript: { attached_at: "2026-08-11T09:14:02.117Z" } }),
    documentsIdentity({ transcript: { attached_at: null } }),
  );
  // "I have ordered it" is a different state from a stored file, and it must survive the round trip.
  assert.notEqual(
    documentsIdentity({ transcript: { ordered_at: "2026-08-11T09:14:02.117Z" } }),
    documentsIdentity({ transcript: {} }),
  );
  // A file swapped for another one, with the same timestamps, is still news.
  assert.notEqual(
    documentsIdentity({ transcript: { document_id: "a", file_name: "one.pdf" } }),
    documentsIdentity({ transcript: { document_id: "b", file_name: "two.pdf" } }),
  );
  // Key order is not news. The poll's JSON gives no ordering guarantee across responses.
  assert.equal(
    documentsIdentity({ transcript: { file_name: "t.pdf" }, writing_sample: { file_name: "w.pdf" } }),
    documentsIdentity({ writing_sample: { file_name: "w.pdf" }, transcript: { file_name: "t.pdf" } }),
  );
});

/* THE 2.5 SECOND BLIND WINDOW.
 *
 * selectPacket seeds the first snapshot from the board row and the first poll is 2.5s behind it.
 * With no `documents` on the seed, re-entering an application whose transcript is already stored
 * drew no manage control for that whole window: the file looked unattached and the only route to
 * "Remove this file" was missing from the screen while /privacy promises removal. */
test("the seed carries the document marks the board row already holds", () => {
  const seeded = documentsFromSpecMarks({
    transcript: { file_name: "transcript.pdf", attached_at: "2026-08-11T09:14:02.117Z" },
  });
  /* Every field the envelope's own record carries, filled in rather than left off. The modal reads
     `employer_label` and `official_requested` off this mark and a missing key there is a modal that
     silently drops the employer's wording on the seeded render and grows it back 2.5s later. */
  assert.deepEqual(seeded, {
    transcript: {
      kind: "transcript",
      document_id: null,
      file_name: "transcript.pdf",
      attached_at: "2026-08-11T09:14:02.117Z",
      ordered_at: null,
      employer_label: null,
      official_requested: false,
    },
  });
});

/* THE FIELD THE SERVER WRITES AND NO CLIENT MAY HOLD.
 *
 * `spec._documents` is server-written and it holds `object_key`, the Blob pathname of the student's
 * transcript. A Vercel Blob object is public-read forever to anyone holding its URL, so that key is
 * the whole of the access control on the file. lib/api.ts types `_documents` WITHOUT it and says
 * why; the seed then spread the record wholesale, which is how a type that declines to name a field
 * copies it into client state anyway.
 *
 * The mark is built past the type on purpose. That is exactly how it arrives in production: this
 * record comes off the wire, and the type is a statement of intent about the bytes rather than a
 * fact about them. */
test("the seed copies no object_key out of the board row, whatever the row is holding", () => {
  const fromTheWire = {
    document_id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
    file_name: "transcript.pdf",
    attached_at: "2026-08-11T09:14:02.117Z",
    object_key: "users/a18f774b/documents/2c9e0a17-5b3f-4d21-9f77-6e4b0c8a1d33.pdf",
    blob_url: "https://blob.vercel-storage.com/users/a18f774b/documents/2c9e0a17.pdf",
  } as SpecDocumentMark;

  const seeded = documentsFromSpecMarks({ transcript: fromTheWire });
  assert.ok(seeded, "a row with a mark seeds one");
  assert.equal("object_key" in seeded.transcript, false, "the access control on her transcript is not client state");
  assert.equal("blob_url" in seeded.transcript, false, "nor is the URL that needs no access control at all");
  assert.equal(
    JSON.stringify(seeded).includes("users/a18f774b"),
    false,
    "nothing that locates the stored file may survive the projection",
  );
  // The fields the screen actually draws still arrive.
  assert.equal(seeded.transcript.file_name, "transcript.pdf");
  assert.equal(seeded.transcript.attached_at, "2026-08-11T09:14:02.117Z");
});

test("a packet with no marks seeds no measurement, rather than an empty one that claims a run looked", () => {
  /* Absent has to stay absent. An empty object is a different answer: it says a run measured this
     application and found nothing attached. `documentsIdentity` has to be able to tell those two
     apart, or a poll whose only news is that second answer is dropped as saying nothing new. */
  assert.equal(documentsFromSpecMarks(undefined), undefined);
});

test("a snapshot for another packet is never a version of this one", () => {
  const other: SubmissionSnapshot = { ...fromServer, application_id: "0000ffff-0000-0000-0000-000000000000" };
  assert.equal(nextSubmissionState(fromServer, other), other);
});

test("a strictly older server snapshot cannot roll a newer run state backward", () => {
  const newer = {
    ...fromServer,
    review: { ...fromServer.review, status: "ready_for_final_approval", updated_at: "2026-08-21T10:26:03.000Z" },
  };
  const older = {
    ...fromServer,
    review: { ...fromServer.review, status: "filling", updated_at: "2026-08-21T10:22:53.000Z" },
  };
  assert.equal(submissionSnapshotIsOlder(newer, older), true);
  assert.equal(nextSubmissionState(newer, older), newer);
  assert.equal(submissionSnapshotIsOlder(older, newer), false);
  assert.equal(nextSubmissionState(older, newer), newer);
});

test("invalid timestamps do not invent an ordering", () => {
  const current = { ...fromServer, review: { ...fromServer.review, updated_at: "unknown" } };
  const incoming = { ...fromServer, review: { ...fromServer.review, updated_at: "also unknown" } };
  assert.equal(submissionSnapshotIsOlder(current, incoming), false);
});

test("the later packet audit replaces the earlier poll question list", () => {
  const oldQuestion = { id: "legacy-phone", question: "Meine Daten", answer: "+49" };
  const currentQuestion = { id: "custom", question: "Allgemeine Anrede", answer: "Frau" };
  const incoming = {
    ...fromServer,
    review: { ...fromServer.review, questions: [oldQuestion, currentQuestion], packet_audit: { packet_version: "old" } },
  };
  const current = {
    ...fromServer,
    review: { ...fromServer.review, questions: [currentQuestion], packet_audit: { packet_version: "approved" } },
  };
  const reconciled = submissionAfterPacketAudit(incoming, current, {
    packet_audit: { packet_version: "approved" },
    questions: [currentQuestion],
  });
  assert.deepEqual(reconciled.review.questions, [currentQuestion]);
  assert.deepEqual(reconciled.review.packet_audit, { packet_version: "approved" });
});

test("a rolling audit response without questions preserves the acknowledged client list", () => {
  const stale = { id: "legacy-phone", question: "Meine Daten", answer: "+49" };
  const currentQuestion = { id: "custom", question: "Allgemeine Anrede", answer: "Frau" };
  const incoming = {
    ...fromServer,
    review: { ...fromServer.review, questions: [stale], packet_audit: { packet_version: "old" } },
  };
  const current = {
    ...fromServer,
    review: { ...fromServer.review, questions: [currentQuestion], packet_audit: { packet_version: "approved" } },
  };
  const reconciled = submissionAfterPacketAudit(incoming, current, {
    packet_audit: { packet_version: "approved" },
  });
  assert.deepEqual(reconciled.review.questions, [currentQuestion]);
});

test("same-timestamp packet question and audit changes are not deduped", () => {
  const stale = { id: "legacy-phone", question: "Meine Daten", answer: "+49" };
  const currentQuestion = { id: "custom", question: "Allgemeine Anrede", answer: "Frau" };
  const current = {
    ...fromServer,
    review: { ...fromServer.review, questions: [stale, currentQuestion], packet_audit: { packet_version: "old" } },
  };
  const incoming = {
    ...fromServer,
    review: { ...fromServer.review, questions: [currentQuestion], packet_audit: { packet_version: "approved" } },
  };
  assert.notEqual(submissionReviewPacketIdentity(current.review), submissionReviewPacketIdentity(incoming.review));
  assert.equal(nextSubmissionState(current, incoming), incoming);
});

test("a held old poll cannot overwrite a direct submit result before React effects run", async () => {
  const staleQuestion = { id: "legacy-phone", question: "Meine Daten", answer: "+49" };
  const canonicalQuestion = { id: "salutation", question: "Allgemeine Anrede", answer: "Frau" };
  const approvedAudit = { packet_version: "approved", audit_digest: "approved-digest" };
  const oldGet = {
    ...fromServer,
    review: {
      ...fromServer.review,
      status: "filling",
      updated_at: "2026-08-21T10:22:53.000Z",
      questions: [staleQuestion],
      packet_audit: { packet_version: "old", audit_digest: "old-digest" },
    },
  };
  const submitResult = {
    ...fromServer,
    review: {
      ...fromServer.review,
      status: "ready_for_final_approval",
      updated_at: "2026-08-21T10:26:03.000Z",
      questions: [canonicalQuestion],
      packet_audit: approvedAudit,
    },
  };
  const heldGet = deferred<typeof oldGet>();
  const heldAudit = deferred<{ packet_audit: typeof approvedAudit; questions: typeof canonicalQuestion[] }>();
  const submissionRef = { current: oldGet as typeof oldGet | typeof submitResult | null };
  const screenRef = { current: "submitting" };
  let submission = oldGet;
  let packets = [{ id: fromServer.application_id, review: oldGet.review }];
  let screen = "submitting";
  let questions = oldGet.review.questions;
  let packetEvidence = { packet_audit: oldGet.review.packet_audit };
  const queuedReactEffects: Array<() => void> = [];

  const poll = (async () => {
    let result = await heldGet.promise;
    const audit = await heldAudit.promise;
    const base = submissionSnapshotIsOlder(submissionRef.current, result)
      ? submissionRef.current!
      : result;
    result = submissionAfterPacketAudit(base, submissionRef.current, audit) as typeof result;
    if (submissionSnapshotIsOlder(submissionRef.current, result)) return;
    const canonical = publishSubmissionEnvelope(submissionRef, result, "poll");
    queuedReactEffects.push(() => {
      submission = canonical;
      packets = packets.map((packet) => packet.id === canonical.application_id
        ? { ...packet, review: canonical.review }
        : packet);
      questions = canonical.review.questions;
      packetEvidence = { packet_audit: canonical.review.packet_audit };
      screenRef.current = canonical.review.status === "ready_for_final_approval" ? "portal" : "submitting";
      screen = screenRef.current;
    });
  })();

  heldGet.resolve(oldGet);
  await Promise.resolve();

  /* The direct submit answer arrives while POST /packet-audit is still held. React has not applied
     any queued state writes, so the ref is the only current envelope the resumed poll can see. */
  const publishedSubmit = publishSubmissionEnvelope(submissionRef, submitResult, "direct");
  screenRef.current = "portal";
  queuedReactEffects.push(() => {
    submission = publishedSubmit;
    packets = packets.map((packet) => packet.id === publishedSubmit.application_id
      ? { ...packet, review: publishedSubmit.review }
      : packet);
    questions = publishedSubmit.review.questions;
    packetEvidence = { packet_audit: publishedSubmit.review.packet_audit };
    screen = screenRef.current;
  });
  assert.equal(submission.review.status, "filling", "the regression must exercise the ref-lag window");
  assert.equal(submissionRef.current, submitResult, "the direct response is synchronous truth before effects");

  heldAudit.resolve({ packet_audit: approvedAudit, questions: [canonicalQuestion] });
  await poll;
  for (const apply of queuedReactEffects) apply();

  assert.equal(submission.review.status, "ready_for_final_approval");
  assert.equal(packets[0].review.status, "ready_for_final_approval");
  assert.equal(screen, "portal");
  assert.deepEqual(questions, [canonicalQuestion]);
  assert.deepEqual(packetEvidence.packet_audit, approvedAudit);
  assert.equal(submissionRef.current?.review.status, "ready_for_final_approval");
});

test("nothing held yet means install", () => {
  assert.equal(nextSubmissionState(null, fromServer), fromServer);
  assert.equal(nextSubmissionState(undefined, fromServer), fromServer);
});

test("cover letter identity ignores nothing that distinguishes two letters", () => {
  assert.equal(coverLetterIdentity(null), "");
  assert.equal(coverLetterIdentity(undefined), "");
  assert.notEqual(coverLetterIdentity({ body: "a" }), coverLetterIdentity({ body: "ab" }));
  assert.notEqual(coverLetterIdentity({ object_key: "a" }), coverLetterIdentity({ object_key: "b" }));
  assert.notEqual(coverLetterIdentity({ approved_at: "2026-08-08T00:00:00Z" }), coverLetterIdentity({}));
});

test("the gate never leaves the applicant reading a progress message that cannot resolve", () => {
  assert.equal(coverLetterGate({ supported: undefined, required: true, coverLetter: null, waited: true }), "not_applicable");
  assert.equal(coverLetterGate({ supported: false, required: true, coverLetter: null, waited: true }), "not_applicable");
  assert.equal(coverLetterGate({ supported: true, required: true, coverLetter: { body: "hi" }, waited: true }), "present");
  assert.equal(coverLetterGate({ supported: true, required: true, coverLetter: null, waited: false }), "loading");
  // The whole point: the wait ENDS, and what it ends in is a named state with a way out.
  assert.equal(coverLetterGate({ supported: true, required: true, coverLetter: null, waited: true }), "unavailable");
});

/* AN OPTIONAL COVER LETTER IS NOT A REASON TO GREY THE BUTTON OUT.
 *
 * Cresta packet 8142004c-3358-4538-8778-16df5e31c5bb: a Greenhouse form offering Attach / Dropbox /
 * Enter manually, no required marker on it while First Name, Last Name and Email all carried one.
 * The gate ran on `supported`, which only means the form HAS the control, so a complete application
 * on any form that merely offers a cover letter could never be sent. It runs on `required` now, and
 * `required` is tri-state: unknown is not required. */
test("a cover letter the employer does not require never blocks the send", () => {
  assert.equal(coverLetterGate({ supported: true, required: false, coverLetter: null, waited: true }), "optional");
  // Every packet filled before the run measured the requirement reads undefined here.
  assert.equal(coverLetterGate({ supported: true, coverLetter: null, waited: true }), "optional");
  // A letter she has written still shows as present rather than as an absence.
  assert.equal(coverLetterGate({ supported: true, required: false, coverLetter: { body: "hi" }, waited: true }), "present");
});

test("both unresolved gates block the send, and no resolved one does", () => {
  assert.equal(coverLetterBlocks("loading"), true);
  assert.equal(coverLetterBlocks("unavailable"), true);
  assert.equal(coverLetterBlocks("present"), false);
  assert.equal(coverLetterBlocks("optional"), false);
  assert.equal(coverLetterBlocks("not_applicable"), false);
});

test("the wait is longer than one poll round and short enough to notice", () => {
  assert.ok(COVER_LETTER_WAIT_MS > 2500, "one 2.5s poll round must not be called a stall");
  assert.ok(COVER_LETTER_WAIT_MS <= 30_000, "a minute of 'Loading' beside a dead button is the defect");
});

/* R: THE SEND BUTTON THE SERVER WAS ALWAYS GOING TO REFUSE.
 *
 * Same Cresta packet as above, one screen further on. 2026-08-09 03:06:19,
 * POST /applications/8142004c.../submission/approve -> 409, "That took too long and timed out.
 * Start the application again." The page showed nothing, the button stayed enabled, and the refusal
 * was only findable in the server log.
 *
 * The stored review: handoff_expires_at 2026-08-08T23:05:10.431Z, updated_at 22:10:10.431Z,
 * browser_session_id NULL. Read out of production the same hour: 11 packets at
 * ready_for_final_approval, all 11 with a null session id, 10 of them past their stamp.
 */
const EXPIRED = "2026-08-08T23:05:10.431Z";
const STILL_OPEN = "2026-08-09T04:05:10.431Z";
const AT_THE_CLICK = Date.parse("2026-08-09T03:06:19.000Z");

test("a packet with no live session is never blocked by the window", () => {
  // The measured Cresta review, field for field. The managed provider writes the stamp and no
  // session, and its submit path refills from the packet, so there is nothing stale to protect.
  assert.equal(handoffWindowExpired({ handoff_expires_at: EXPIRED }, AT_THE_CLICK), false);
  assert.equal(handoffWindowExpired({ handoff_expires_at: EXPIRED, browser_session_id: "" }, AT_THE_CLICK), false);
});

test("a packet whose live session has closed is blocked, because submit reconnects to it", () => {
  assert.equal(handoffWindowExpired({ handoff_expires_at: EXPIRED, browser_session_id: "bb_sess_9f1c" }, AT_THE_CLICK), true);
  assert.equal(handoffWindowExpired({ handoff_expires_at: STILL_OPEN, browser_session_id: "bb_sess_9f1c" }, AT_THE_CLICK), false);
});

test("nothing to read is not an expiry, in either field", () => {
  assert.equal(handoffWindowExpired({}, AT_THE_CLICK), false);
  assert.equal(handoffWindowExpired({ browser_session_id: "bb_sess_9f1c" }, AT_THE_CLICK), false);
  // A stamp the server sent that this client cannot parse must not grey out a working Send button.
  assert.equal(handoffWindowExpired({ handoff_expires_at: "soon", browser_session_id: "bb_sess_9f1c" }, AT_THE_CLICK), false);
});

test("the clock ticks often enough that a deadline is noticed, and rarely enough to be free", () => {
  // Nothing arrives when a deadline passes, so this term cannot wait for an event.
  assert.ok(HANDOFF_CLOCK_TICK_MS >= 5_000, "a per-second re-render of the resume preview is not worth it");
  assert.ok(HANDOFF_CLOCK_TICK_MS <= 60_000, "a minute of offering a send the server refuses is the defect");
});
