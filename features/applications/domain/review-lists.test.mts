import assert from "node:assert/strict";
import test from "node:test";
import { reviewWithLists, screenForStatus } from "./application-review.ts";
import { humanInputItems } from "./submission-checklist.ts";
import type { ApplicationReview } from "@/lib/api";

/**
 * The defect this exists for: a Tracker row that could not be opened.
 *
 * Reported 2026-08-11 from a real account. On /dashboard/applications every row reading NEEDS YOU
 * threw on click and took the whole page into app/dashboard/error.tsx; the one SENT row opened
 * normally. The split is screenForStatus, asserted below so the two halves of the finding stay in
 * one place: `submitted` is the ONLY reviewable status that routes to SubmissionReceipt, which
 * reads no list off the review. Every other one routes to SubmissionScreen, whose fourth line was
 * `review.questions.length`.
 *
 * `questions` is declared as a required array on ApplicationReview and is not always sent. An
 * application that never reached a form has nothing to store, and /resume/history returns what was
 * stored. The type is a statement of intent; these tests are about the bytes.
 */

/** A packet's review as the sparse account actually holds it: three declared lists, none present. */
const SPARSE = {
  jd_text: "A posting.",
  status: "needs_attention",
  updated_at: "2026-08-10T12:00:00.000Z",
} as unknown as ApplicationReview;

test("a review with no lists at all comes back with all four, empty", () => {
  const whole = reviewWithLists(SPARSE);
  assert.deepEqual(whole.questions, []);
  assert.deepEqual(whole.filled_fields, []);
  assert.deepEqual(whole.skipped_reasons, []);
  assert.deepEqual(whole.edited_terms, []);
});

test("nothing but the lists is defaulted", () => {
  const whole = reviewWithLists(SPARSE);
  assert.equal(whole.status, "needs_attention", "the status must survive untouched");
  assert.equal(whole.jd_text, "A posting.");
  assert.equal(whole.updated_at, "2026-08-10T12:00:00.000Z");
  /* Absent scalars stay absent. Defaulting one would be inventing a measurement, which is the
     failure mode features/applications/infrastructure/response-shape.ts exists to refuse. */
  assert.equal(whole.attention_reason, undefined);
  assert.equal(whole.portal_url, undefined);
  assert.equal(whole.submitted_at, undefined);
  assert.equal(whole.cover_letter_required, undefined);
});

test("a whole review is returned unchanged, by identity", () => {
  /* Not cosmetic. The submission poll runs every 2.5 seconds and nextSubmissionState compares what
     it is handed; a fresh object on every tick would re-render the screen it is only confirming. */
  const whole = {
    ...SPARSE,
    questions: [],
    filled_fields: [],
    skipped_reasons: [],
    edited_terms: [],
  } as unknown as ApplicationReview;
  assert.equal(reviewWithLists(whole), whole);
});

test("a review that already carries answers keeps every one of them", () => {
  const answered = {
    ...SPARSE,
    questions: [{ id: "q1", question: "Why here?", answer: "Because.", kind: "essay", required: true }],
    filled_fields: ["name", "email"],
    skipped_reasons: ["no file control"],
    edited_terms: ["TypeScript"],
  } as unknown as ApplicationReview;
  const whole = reviewWithLists(answered);
  assert.equal(whole.questions.length, 1);
  assert.equal(whole.questions[0].answer, "Because.");
  assert.deepEqual(whole.filled_fields, ["name", "email"]);
  assert.deepEqual(whole.skipped_reasons, ["no file control"]);
  assert.deepEqual(whole.edited_terms, ["TypeScript"]);
});

test("a list sent as something other than a list is replaced rather than trusted", () => {
  /* `null` is what a column with no rows serialises to on more than one backend, and it passes
     every `?? []` guard in the codebase while failing every `.length` that follows one. */
  const wrong = { ...SPARSE, questions: null, filled_fields: null, skipped_reasons: null, edited_terms: null } as unknown as ApplicationReview;
  assert.deepEqual(reviewWithLists(wrong).questions, []);
  assert.deepEqual(reviewWithLists(wrong).filled_fields, []);
});

/**
 * The reason the fix is at the writer rather than at the four lines that threw.
 *
 * humanInputItems is a DIFFERENT reader of the same two lists, on the same screen, reached by the
 * same click. It reads them positionally through helpers, so it would have thrown next even after
 * SubmissionScreen's own four dereferences were patched.
 */
test("the checklist reads a normalised review without throwing", () => {
  const items = humanInputItems({
    ...reviewWithLists(SPARSE),
    attention_reason: "CAPTCHA requires your attention",
  });
  assert.ok(items.length > 0, "a stopped application must still list what it is waiting on");
});

test("only submitted routes away from the screen that reads the lists", () => {
  assert.equal(screenForStatus("submitted", "review"), "submitted");
  for (const status of ["needs_attention", "ready_for_final_approval", "awaiting_security_code", "failed"]) {
    assert.equal(screenForStatus(status, "review"), "portal", status);
  }
});
