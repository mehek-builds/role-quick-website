import assert from "node:assert/strict";
import test from "node:test";
import {
  COVER_LETTER_WAIT_MS,
  HANDOFF_CLOCK_TICK_MS,
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
  submissionSnapshotIsOlder,
  submissionCoverLetterField,
  type SpecDocumentMark,
  type SubmissionSnapshot,
} from "./submission-state.ts";

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

test("handoff_url and configured are versioned by nothing, so they are compared in their own right", () => {
  const withHandoff: SubmissionSnapshot = { ...fromServer, handoff_url: "https://live.browserbase/session/1" };
  const withoutHandoff: SubmissionSnapshot = { ...fromServer, handoff_url: undefined };
  // A live browser URL that appears, and one that expires, are both news.
  assert.equal(nextSubmissionState(withoutHandoff, withHandoff), withHandoff);
  assert.equal(nextSubmissionState(withHandoff, withoutHandoff), withoutHandoff);
  assert.equal(nextSubmissionState(fromServer, { ...fromServer, configured: false }).configured, false);
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
