import assert from "node:assert/strict";
import test from "node:test";
import {
  COVER_LETTER_WAIT_MS,
  coverLetterBlocks,
  coverLetterGate,
  coverLetterIdentity,
  nextSubmissionState,
  type SubmissionSnapshot,
} from "./submission-state.ts";

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

test("a snapshot for another packet is never a version of this one", () => {
  const other: SubmissionSnapshot = { ...fromServer, application_id: "0000ffff-0000-0000-0000-000000000000" };
  assert.equal(nextSubmissionState(fromServer, other), other);
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
  assert.equal(coverLetterGate({ supported: undefined, coverLetter: null, waited: true }), "not_applicable");
  assert.equal(coverLetterGate({ supported: false, coverLetter: null, waited: true }), "not_applicable");
  assert.equal(coverLetterGate({ supported: true, coverLetter: { body: "hi" }, waited: true }), "present");
  assert.equal(coverLetterGate({ supported: true, coverLetter: null, waited: false }), "loading");
  // The whole point: the wait ENDS, and what it ends in is a named state with a way out.
  assert.equal(coverLetterGate({ supported: true, coverLetter: null, waited: true }), "unavailable");
});

test("both unresolved gates block the send, and neither resolved one does", () => {
  assert.equal(coverLetterBlocks("loading"), true);
  assert.equal(coverLetterBlocks("unavailable"), true);
  assert.equal(coverLetterBlocks("present"), false);
  assert.equal(coverLetterBlocks("not_applicable"), false);
});

test("the wait is longer than one poll round and short enough to notice", () => {
  assert.ok(COVER_LETTER_WAIT_MS > 2500, "one 2.5s poll round must not be called a stall");
  assert.ok(COVER_LETTER_WAIT_MS <= 30_000, "a minute of 'Loading' beside a dead button is the defect");
});
