import assert from "node:assert/strict";
import test from "node:test";
import { ANSWER_APPROVAL_RACED, answerApprovalPath, approvalRequest, approveDraftedAnswer, checklistRowApproval } from "./answer-approval.ts";
import { completedSubmissionGroups, humanInputItems } from "./submission-checklist.ts";
import type { ApplicationReview } from "@/lib/api";

/**
 * THE CHECKBOX THAT WAS PAINT.
 *
 * `<input type="checkbox" aria-label={`Mark ${item.label} done`}>` with no `checked`, no `onChange`
 * and nothing behind it, shipped in 7051e6d and never wired since. Measured on the live Deepgram
 * packet on 2026-08-13: five presses on five boxes, no network request at all, `checked` false on
 * all five afterwards.
 *
 * Two halves, tested in two places, the same split tests/your-turn-actions.test.mjs draws for the
 * pill beside it. The DECISION half is here and is executable: which rows may carry a box, what the
 * request looks like, and - the part that is the actual user-visible bug - whether the row goes away
 * once the approval is on the packet. The JSX half is pinned in tests/your-turn-mark-done.test.mjs,
 * because npm test strips types and cannot mount a component.
 */

const DRAFT = "I have spent two years building speech tooling, and Deepgram ships at that latency.";

/* The live Deepgram packet's shape: a drafted essay, a machine-resolved answer to a question only
 * she may speak to, a blocker the run reported, and a required blank. One of each kind of row. */
function deepgram(overrides: Partial<ApplicationReview["questions"][number]> = {}): Pick<ApplicationReview, "attention_reason" | "questions" | "status" | "filled_fields"> {
  return {
    status: "needs_attention",
    attention_reason: [
      "drafted answer needs your review: Names/orgs not found in your background or the job post (verify): GPT",
      "Litos could not leave an answer on the form: choice value did not persist after fill",
    ].join("\n"),
    questions: [
      { id: "excites-you", question: "What excites you about Deepgram?", answer: DRAFT, kind: "essay", required: true, ...overrides },
      { id: "salary", question: "What are your annualized total compensation expectations?", answer: "USD 175,000", kind: "required", required: true },
      { id: "start-date", question: "When are you available to start?", answer: "", kind: "required", required: true },
    ],
    filled_fields: [],
  };
}

function row(review: ReturnType<typeof deepgram>, id: string) {
  return humanInputItems(review).find((item) => item.id === id);
}

/* ---- which rows may carry a box at all ---- */

test("a drafted answer and a question only she may speak to are the rows with something to approve", () => {
  const items = humanInputItems(deepgram());

  const drafted = items.find((item) => item.id === "review-excites-you");
  assert.ok(drafted, "the drafted answer is on Your turn to begin with");
  assert.deepEqual(checklistRowApproval(drafted), { questionId: "excites-you" });

  const confirm = items.find((item) => item.id === "confirm-salary");
  assert.ok(confirm, "and so is the compensation answer a run resolved");
  assert.deepEqual(checklistRowApproval(confirm), { questionId: "salary" });
});

/* THE ROWS THAT GET NOTHING, WHICH IS THE OTHER HALF OF THE FIX. A blocker the run reported has no
 * stored answer to approve, and there is nowhere honest to record "done" for it: the panel rebuilds
 * these rows from attention_reason on a 2.5s poll, so a client-side dismissal would hide a live
 * blocker and then lose the argument on the next tick. A required blank needs typing, not approving.
 * Both draw an inert marker rather than a control that cannot act, which is the same answer
 * checklistRowControl already gives for the pill. */
test("a blocker row and a blank required answer carry no approval, because there is nothing to record", () => {
  const items = humanInputItems(deepgram());

  const blocker = items.find((item) => item.label.startsWith("Litos could not leave an answer"));
  assert.ok(blocker, "the run's own report is still a row");
  assert.equal(checklistRowApproval(blocker), null, "a blocker has no stored answer to approve");

  const missing = items.find((item) => item.id === "missing-start-date");
  assert.ok(missing, "the blank required question is still a row");
  assert.equal(checklistRowApproval(missing), null, "a blank is answered, not approved");
});

/* ---- the row clearing, which is the defect as the applicant experiences it ---- */

test("an approved drafted answer leaves Your turn", () => {
  assert.ok(row(deepgram(), "review-excites-you"), "precondition: unapproved, it is on Your turn");

  const approved = deepgram({ answer_approved_at: "2026-08-13T16:41:02.104Z" });
  assert.equal(row(approved, "review-excites-you"), undefined, "approved, it is not");
});

/* AND LANDS SOMEWHERE. A row that vanishes off the panel entirely reads as deleted rather than
 * settled, which is the failure the Your turn / Done split exists to prevent.
 *
 * ASSERTED ON completedSubmissionGroups, WHICH IS WHAT THE SCREEN CALLS. This test used to call
 * completedSubmissionItems, and it passed while the applicant saw nothing: that function has no
 * non-test callers at all, and both render sites - app/dashboard/applications/page.tsx and
 * components/app/ApplicationPacket.tsx - build the Done column from the groups. A green test over a
 * function nothing renders pins source rather than behaviour, which is the one thing tests in this
 * repo may not do. */
test("an approved drafted answer arrives in Done", () => {
  const before = completedSubmissionGroups(deepgram());
  assert.equal(before.find((item) => item.id === "completed-group-questions"), undefined,
    "an unread draft is not Done");

  const after = completedSubmissionGroups(deepgram({ answer_approved_at: "2026-08-13T16:41:02.104Z" }));
  const settled = after.find((item) => item.id === "completed-group-questions");
  assert.ok(settled, "once she has said it stands, it is Done");
  assert.equal(settled.label, "Employer questions");
  assert.equal(settled.detail, "1 item completed", "and the count the applicant reads moves with it");
});

/* THE OTHER CLAUSE, AND THE ONE WITH TEETH. A question only she may speak to - compensation here,
 * and in production also sponsorship, work authorization and privacy consent - is held out of Done
 * unconditionally until she says the answer stands. Approving it has to land it, by the same
 * argument, and the groups function had no approval clause for it either. */
test("an approved answer to a question only she may speak to arrives in Done", () => {
  const packet = deepgram();
  const withApprovedSalary = {
    ...packet,
    questions: packet.questions.map((question) => (question.id === "salary"
      ? { ...question, answer_approved_at: "2026-08-13T16:41:02.104Z" }
      : question)),
  };

  const settled = completedSubmissionGroups(withApprovedSalary)
    .find((item) => item.id === "completed-group-questions");
  assert.ok(settled, "her own confirmation is Done once she has given it");
  assert.equal(settled.detail, "1 item completed");
});

/* THE ROWS THAT MUST NOT MOVE WITH IT. One approval names one question. This is the same property
 * the backend suite pins on the row, asserted here on the panel, because the regression that made
 * this fix delicate was a write that touched answers it was not aimed at. */
test("approving one answer clears only that row", () => {
  const approved = deepgram({ answer_approved_at: "2026-08-13T16:41:02.104Z" });

  assert.ok(row(approved, "confirm-salary"), "compensation is still hers to confirm");
  assert.ok(row(approved, "missing-start-date"), "the blank is still blank");
  assert.ok(
    humanInputItems(approved).some((item) => item.label.startsWith("Litos could not leave an answer")),
    "and the run's report of a form it could not fill is not something an approval may erase",
  );
});

/* An empty string is not an approval. The field is optional across every record written before it
 * existed, and absence has to read as "not approved" rather than as anything else. */
test("an empty approval stamp is not an approval", () => {
  assert.ok(row(deepgram({ answer_approved_at: "" }), "review-excites-you"));
});

/* ---- the request ---- */

test("the approval names the question in the path and the exact text in the body", () => {
  assert.equal(
    answerApprovalPath("app-1", "excites-you"),
    "/applications/app-1/review/answers/excites-you/approval",
  );
  assert.equal(answerApprovalPath("app-1", "a b/c"), "/applications/app-1/review/answers/a%20b%2Fc/approval");

  const request = approvalRequest(DRAFT);
  assert.equal(request.method, "PUT");
  assert.deepEqual(JSON.parse(request.body), { answer: DRAFT });
});

test("an approval that lands returns the stored review, so the panel redraws from the server", async () => {
  const sent: Array<{ path: string; init: { method: string; body: string } }> = [];
  const result = await approveDraftedAnswer<{ status: string }>({
    applicationId: "app-1",
    questionId: "excites-you",
    answer: DRAFT,
    send: async (path, init) => {
      sent.push({ path, init });
      return { application_id: "app-1", review: { status: "needs_attention" } };
    },
  });

  assert.equal(sent.length, 1, "one press, one request - which is one more than the old control made");
  assert.equal(sent[0].path, "/applications/app-1/review/answers/excites-you/approval");
  assert.deepEqual(result, { approved: true, review: { status: "needs_attention" } });
});

/* THE 202 IS NOT AN APPROVAL AND ARRIVES LOOKING EXACTLY LIKE ONE. Same reading as the save beside
 * it: res.ok either way, identical body but for this one key, so `=== false` rather than falsy. */
test("a run writing under the approval is reported as not approved", async () => {
  const result = await approveDraftedAnswer<{ status: string }>({
    applicationId: "app-1",
    questionId: "excites-you",
    answer: DRAFT,
    send: async () => ({ application_id: "app-1", review: { status: "filling" }, saved: false }),
  });

  assert.deepEqual(result, { approved: false, message: ANSWER_APPROVAL_RACED });
});

test("a refusal is reported in the server's own words, which name a state she can act on", async () => {
  const result = await approveDraftedAnswer<{ status: string }>({
    applicationId: "app-1",
    questionId: "excites-you",
    answer: DRAFT,
    send: async () => { throw new Error("Litos rewrote this answer while you were reading it, so it was not approved. Read the new one and approve that."); },
  });

  assert.equal(result.approved, false);
  assert.match(result.message, /rewrote this answer while you were reading it/);
});
