/* THE SAVE BUTTON THAT ISSUED NO REQUEST.
 *
 * Every assertion here is about one of two things the old handler got wrong: it wrote nothing, and
 * it said "Saved." anyway. A test that only checked the banner would have passed against the defect,
 * so the request itself is what is asserted first.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  REVIEW_ANSWERS_SAVED_NOTICE,
  REVIEW_ANSWERS_SAVE_RACED,
  auditAnswerWrite,
  reviewAnswerEditRoute,
  reviewAnswersNeedSave,
  reviewAnswersPath,
  saveReviewAnswers,
  type ReviewAnswerSaveQuestion,
} from "./review-answer-save.ts";

const APPLICATION_ID = "8142004c-3358-4538-8778-16df5e31c5bb";

const answered: ReviewAnswerSaveQuestion[] = [
  {
    id: "prior-application",
    question: "Have you applied to another role at this company in the last 12 months?",
    answer: "No",
    kind: "required",
    required: true,
  },
];

test("an unchanged stored answer list does not manufacture an audit-time write", () => {
  assert.equal(reviewAnswersNeedSave(answered, answered.map((question) => ({
    ...question,
    // Display-only fields can be present on the live client shape. The request strips them.
    options: ["Yes", "No"],
    explanation: "Taken from the saved application packet.",
  } as ReviewAnswerSaveQuestion))), false);
});

test("any accepted answer field change still requires the guarded save", () => {
  assert.equal(reviewAnswersNeedSave(answered, [{ ...answered[0], answer: "Yes" }]), true);
  assert.equal(reviewAnswersNeedSave(answered, [{ ...answered[0], confirmed: true }]), true);
  assert.equal(reviewAnswersNeedSave(answered, [{ ...answered[0], required: false, answer: "", answer_state: "skipped" }]), true);
  assert.equal(reviewAnswersNeedSave(answered, []), true);
});

type Sent = { path: string; init: { method: string; body: string } };

function recorder(
  reply: (sent: Sent) => Promise<{ application_id: string; review: { status: string }; saved?: boolean }>,
) {
  const sent: Sent[] = [];
  return {
    sent,
    send: (path: string, init: { method: string; body: string }) => {
      sent.push({ path, init });
      return reply({ path, init });
    },
  };
}

function accepts(review: { status: string } = { status: "needs_attention" }) {
  return recorder(async () => ({ application_id: APPLICATION_ID, review }));
}

describe("saving answers from the Review-answers screen", () => {
  test("issues exactly one persistence request, carrying the answers", async () => {
    const server = accepts();

    await saveReviewAnswers({ applicationId: APPLICATION_ID, questions: answered, send: server.send });

    assert.equal(server.sent.length, 1, "the defect was a Save that issued no request at all");
    assert.equal(server.sent[0].path, reviewAnswersPath(APPLICATION_ID));
    assert.equal(server.sent[0].init.method, "PUT");
    assert.deepEqual(JSON.parse(server.sent[0].init.body), {
      questions: [{
        id: "prior-application",
        question: "Have you applied to another role at this company in the last 12 months?",
        answer: "No",
        kind: "required",
        required: true,
      }],
    });
  });

  /* NOT THE SEND ROUTE. Saving an answer must not book a browser run against the employer, which is
     why the button stopped calling submit-request in the first place. */
  test("does not reach the route that starts a submission run", async () => {
    const server = accepts();

    await saveReviewAnswers({ applicationId: APPLICATION_ID, questions: answered, send: server.send });

    assert.equal(server.sent.some((request) => request.path.includes("submit-request")), false);
    assert.equal(server.sent.some((request) => request.init.method === "POST"), false);
  });

  test("reports the banner and the review the server answered with", async () => {
    const server = accepts({ status: "needs_attention" });

    const result = await saveReviewAnswers({
      applicationId: APPLICATION_ID,
      questions: answered,
      send: server.send,
    });

    assert.equal(result.saved, true);
    assert.equal(result.saved && result.notice, REVIEW_ANSWERS_SAVED_NOTICE);
    assert.deepEqual(result.saved && result.review, { status: "needs_attention" });
  });

  /* THE BANNER COMES FROM THE WRITE, NOT FROM THE CLICK. The old handler set it synchronously, so
     it was true of nothing. Held open here: until the request settles there is no result to show. */
  test("nothing is reported until the write settles", async () => {
    let release: (() => void) | null = null;
    const inFlight = new Promise<void>((resolve) => { release = resolve; });
    let settled = false;

    const pending = saveReviewAnswers({
      applicationId: APPLICATION_ID,
      questions: answered,
      send: async () => {
        await inFlight;
        return { application_id: APPLICATION_ID, review: { status: "needs_attention" } };
      },
    }).then((result) => { settled = true; return result; });

    await Promise.resolve();
    assert.equal(settled, false, "a banner before the response is a banner about nothing");

    release!();
    const result = await pending;
    assert.equal(result.saved, true);
  });

  /* A REFUSED SAVE IS NOT A SAVE. The answers are still only on the screen, so the one thing the
     applicant must not be told is that they are stored. */
  test("a failed write reports the refusal and no success banner", async () => {
    const refused = recorder(async () => {
      throw new Error("This application is already at the employer.");
    });

    const result = await saveReviewAnswers({
      applicationId: APPLICATION_ID,
      questions: answered,
      send: refused.send,
    });

    assert.equal(result.saved, false);
    assert.equal(result.saved === false && result.message, "This application is already at the employer.");
    assert.equal("notice" in result, false, "there is no success banner on a save that did not happen");
  });

  /* THE EXACT R-004 REFUSAL, WORD FOR WORD, IS WHAT REACHES HER SCREEN - not a generic apology and
   * not silence.
   *
   * Measured live 2026-09-04, Hudson River Trading application 4a79eec1-5c65-4dd4-8e72-e119fbfbd733:
   * review.status "failed" from a submit-request run that had already attempted the employer's page
   * before an unrelated GPA-control defect stopped it (#920, since fixed). PUT /review/answers on a
   * row in that shape answers 409 REVIEW_ANSWERS_NOT_EDITABLE - see
   * student-outreach-backend/src/routes/reviewAnswerSave.test.ts, "a failed run carrying a recorded
   * submit attempt refuses the save" - and the gate is correct: R-004 exists exactly so a stopped run
   * that may already be at the employer cannot have its record of that quietly rewritten.
   *
   * What this asserts is the other half: `api()` throws an Error whose `.message` IS the server's
   * `error` string (apiErrorMessage reads that field, not `code`), and this function's catch block
   * must hand that string back rather than substituting REVIEW_ANSWERS_SAVE_FAILED's generic text -
   * or a press that the server explained in one clear sentence reaches the screen as nothing at all. */
  test("the R-004 refusal on a failed packet reaches the caller as the server's own sentence", async () => {
    const refused = recorder(async () => {
      throw new Error("These answers can no longer be edited from this application’s current submission state");
    });

    const result = await saveReviewAnswers({
      applicationId: APPLICATION_ID,
      questions: answered,
      send: refused.send,
    });

    assert.equal(result.saved, false);
    assert.equal(
      result.saved === false && result.message,
      "These answers can no longer be edited from this application’s current submission state",
      "the server's own sentence, not a generic fallback and not an empty string",
    );
    assert.notEqual(result.saved === false && result.message, "", "a defined refusal is never blank");
  });

  /* THE 202 THAT LOOKS EXACTLY LIKE A 200.
   *
   * A run wrote to the packet between the route's read and its write, so nothing typed here was
   * stored. The response is res.ok, so the transport resolves it, and it carries the same
   * application_id and review a successful save does - which is why the route ships `saved: false`
   * on it and why this function has to read that key rather than the status it never sees.
   *
   * Reported as a refusal, deliberately. `saved: false` is what keeps saveReviewedAnswers on this
   * screen: the success branch shows the banner, calls setQuestions with the stored review that does
   * not contain her answers, and navigates away. On a save that did not land, that destroys her
   * typing for the second time. */
  test("a 202 saying the save did not land is not reported as a save", async () => {
    const raced = recorder(async () => ({
      application_id: APPLICATION_ID,
      review: { status: "needs_attention" },
      saved: false,
    }));

    const result = await saveReviewAnswers({
      applicationId: APPLICATION_ID,
      questions: answered,
      send: raced.send,
    });

    assert.equal(result.saved, false, "the review that came back is the run's, not this save's");
    assert.equal("notice" in result, false, "and there is no success banner on it");
    assert.equal(result.saved === false && result.message, REVIEW_ANSWERS_SAVE_RACED);
    assert.deepEqual(result.saved === false && result.review, { status: "needs_attention" }, "the caller can reconcile the winning server review without dropping the applicant's draft");
  });

  /* The other side of the same key: a save that DID land carries no `saved` at all, so an absent
     field must never be read as a refusal. */
  test("a response with no saved flag is the save that landed", async () => {
    const server = accepts();

    const result = await saveReviewAnswers({
      applicationId: APPLICATION_ID,
      questions: answered,
      send: server.send,
    });

    assert.equal(result.saved, true);
    assert.equal(result.saved && result.notice, REVIEW_ANSWERS_SAVED_NOTICE);
  });

  test("a failure with nothing to say still says the answers were not stored", async () => {
    const refused = recorder(async () => { throw new Error(""); });

    const result = await saveReviewAnswers({
      applicationId: APPLICATION_ID,
      questions: answered,
      send: refused.send,
    });

    assert.equal(result.saved, false);
    assert.match(result.saved === false ? result.message : "", /could not save/i);
    assert.match(result.saved === false ? result.message : "", /still on this screen/i);
  });

  /* Display-only fields never leave the screen. The pre-script's option list and its one-line
     explanation are there to render a select and a reason; posting them back would invite a client
     to restate something the server measured. */
  test("only the fields the route accepts are sent", async () => {
    const server = accepts();
    const withDisplayFields = [{
      ...answered[0],
      options: ["Yes", "No"],
      explanation: "Litos cannot answer this one for you.",
      remembered: true,
    }] as unknown as ReviewAnswerSaveQuestion[];

    await saveReviewAnswers({
      applicationId: APPLICATION_ID,
      questions: withDisplayFields,
      send: server.send,
    });

    const body = JSON.parse(server.sent[0].init.body) as { questions: Record<string, unknown>[] };
    assert.deepEqual(Object.keys(body.questions[0]).sort(), ["answer", "id", "kind", "question", "required"]);
  });

  /* THE ONE EXTRA FIELD A CLIENT MAY SEND, AND ONLY WHEN IT IS TRUE. An unedited confirmation posts
     the exact bytes the screen was shown, which the server rightly reads as proof of nothing - so
     the CONFIRM ask on the DV Trading packet re-rendered after every save, forever. The flag is what
     makes that save distinguishable, and it must ride only on the question she confirmed: a flag on
     the whole list would claim answers she never read. */
  test("a confirmed question carries its flag, and only that question", async () => {
    const server = accepts();
    const confirmedAndNot: ReviewAnswerSaveQuestion[] = [
      { ...answered[0], confirmed: true },
      { id: "gender", question: "Gender", answer: "Female", kind: "required", required: false },
    ];

    await saveReviewAnswers({ applicationId: APPLICATION_ID, questions: confirmedAndNot, send: server.send });

    const body = JSON.parse(server.sent[0].init.body) as { questions: Record<string, unknown>[] };
    assert.equal(body.questions[0].confirmed, true, "her confirmation reaches the route");
    assert.equal("confirmed" in body.questions[1], false,
      "and the unflagged question posts exactly what it always posted");
  });

  test("an optional Skip persists a blank answer and its reversible state", async () => {
    const server = accepts();
    await saveReviewAnswers({
      applicationId: APPLICATION_ID,
      questions: [{ ...answered[0], required: false, answer: "", answer_state: "skipped" }],
      send: server.send,
    });

    const body = JSON.parse(server.sent[0].init.body) as { questions: Record<string, unknown>[] };
    assert.equal(body.questions[0].answer, "");
    assert.equal(body.questions[0].answer_state, "skipped");
  });

  /* `confirmed: false` never leaves the screen. The route's schema takes true or nothing, and a
     posted false would read as "she looked and refused", which no control says. */
  test("a false confirmed flag is not sent at all", async () => {
    const server = accepts();

    await saveReviewAnswers({
      applicationId: APPLICATION_ID,
      questions: [{ ...answered[0], confirmed: false }],
      send: server.send,
    });

    const body = JSON.parse(server.sent[0].init.body) as { questions: Record<string, unknown>[] };
    assert.deepEqual(Object.keys(body.questions[0]).sort(), ["answer", "id", "kind", "question", "required"]);
  });
});

/* THE SAME ANSWERS, PERSISTED FROM THE OTHER SIDE OF THE SCREEN.
 *
 * continueFromResume writes the reviewed answers and then asks the server to audit the exact packet,
 * so that the answers the audit is taken over are the answers on the packet. Website PR #319
 * (a39fe29, live) found that a stalled packet was skipping that write, and fixed it by adding
 * "needs_attention" to the status list gating PUT /applications/:id/review. The intent is right and
 * is kept. The route was not: that route relabels the packet.
 *
 * WHAT THE FAKE BELOW IS AND IS NOT. It is the two routes' answer to this one request, each behaving
 * as the real one was MEASURED to behave against a real row in the backend suite, in
 * src/routes/reviewAnswerSave.test.ts: 'the edit route is not refused on an unclaimed stopped run,
 * and relabels it' for the clobber, and 'saving an answer leaves the packet at needs_attention' for
 * the route that does not. That backend test is the authority on the server; this one is the
 * authority on which of the two the client picks, which is where the defect is.
 */

type StoredReview = {
  status: string;
  attention_reason?: string;
  questions: { id: string; answer: string }[];
  /* The one row fact that makes the answers route refuse: reviewAnswerSaveDisposition asks
     employerMayHoldApplication, because a stopped run is also what a run that may have pressed
     submit leaves behind. */
  submission_attempted_at?: string;
};

const REFUSAL = "These answers can no longer be edited from this application's current submission state";

function stalledPacket(extra: Partial<StoredReview> = {}): StoredReview {
  return {
    status: "needs_attention",
    attention_reason: "This form asks whether you have applied before. Litos cannot answer that for you.",
    questions: [{ id: "prior-application", answer: "" }],
    ...extra,
  };
}

function backend(initial: StoredReview) {
  const state = { review: initial };
  const paths: string[] = [];
  const send = async (path: string, init: { method: string; body: string }) => {
    paths.push(path);
    const body = JSON.parse(init.body) as { questions: { id: string; answer: string }[] };
    const questions = state.review.questions.map((stored) => ({
      ...stored,
      answer: body.questions.find((sent) => sent.id === stored.id)?.answer ?? stored.answer,
    }));
    if (path === reviewAnswersPath(APPLICATION_ID)) {
      // The transport raises a refusal, so this is how a 409 reaches saveReviewAnswers.
      if (state.review.submission_attempted_at) throw new Error(REFUSAL);
      state.review = { ...state.review, questions };
      return { application_id: APPLICATION_ID, review: state.review };
    }
    // applyApplicationReviewEdit: the answers land, and the status is written over on the way past.
    state.review = {
      ...state.review,
      questions,
      status: questions.length > 0 ? "questions_ready" : "ready_to_submit",
    };
    return { application_id: APPLICATION_ID, review: state.review };
  };
  return { state, paths, send };
}

/** The audit-time write from continueFromResume, with its two branches and nothing else. */
async function persistBeforeAudit(server: ReturnType<typeof backend>, status: string) {
  const write = auditAnswerWrite(status);
  if (write === "none") return { persisted: false as const, message: null };
  if (write === "answers_only") {
    const result = await saveReviewAnswers<StoredReview>({
      applicationId: APPLICATION_ID,
      questions: answered,
      send: server.send,
    });
    // continueFromResume throws this into its catch, which prints the reason and voids the audit.
    if (!result.saved) return { persisted: false as const, message: result.message };
    return { persisted: true as const, review: result.review, message: null };
  }
  const saved = await server.send(`/applications/${APPLICATION_ID}/review`, {
    method: "PUT",
    body: JSON.stringify({ ats_name: "ashby", portal_url: "https://example.test", questions: answered, skipped_reasons: [] }),
  });
  return { persisted: true as const, review: saved.review, message: null };
}

describe("persisting reviewed answers before an exact-packet audit", () => {
  /* THE WHOLE POINT. #319's intent and the fact it cost, in one assertion each: the answer is stored,
     and the packet is still the stopped run it was. Putting "needs_attention" back into
     REVIEW_EDIT_STATUSES fails this on the status line, which is the defect that is live today. */
  test("a stalled packet stores its answers and stays a stalled packet", async () => {
    const server = backend(stalledPacket());

    const outcome = await persistBeforeAudit(server, "needs_attention");

    assert.equal(outcome.persisted, true, "#319's intent: a stalled packet is no longer audited over unstored answers");
    assert.equal(server.state.review.questions[0].answer, "No", "and the answer she typed is on the packet");
    assert.equal(server.state.review.status, "needs_attention", "the run that stopped is still stopped");
    assert.equal(
      server.state.review.attention_reason,
      stalledPacket().attention_reason,
      "and still says what it is waiting for",
    );
  });

  test("and its answers never travel the route that would relabel it", async () => {
    const server = backend(stalledPacket());

    await persistBeforeAudit(server, "needs_attention");

    assert.deepEqual(server.paths, [reviewAnswersPath(APPLICATION_ID)]);
    assert.equal(server.paths.some((path) => path.endsWith("/review")), false);
  });

  /* THE OTHER THREE ARE NOT THIS FIX'S BUSINESS. Each is a packet waiting to be prepared, an edit is
     allowed to move it, and 'questions_ready' describes where the save leaves it. Unchanged. */
  for (const status of ["resume_ready", "questions_ready", "ready_to_submit"]) {
    test(`a ${status} packet still saves through the review edit`, async () => {
      const server = backend(stalledPacket({ status, attention_reason: undefined }));

      const outcome = await persistBeforeAudit(server, status);

      assert.equal(outcome.persisted, true);
      assert.deepEqual(server.paths, [`/applications/${APPLICATION_ID}/review`]);
      assert.equal(server.state.review.questions[0].answer, "No");
      assert.equal(server.state.review.status, "questions_ready");
    });
  }

  /* NOT EVERY needs_attention ROW IS SAVEABLE, and the ones that are not must say why.
     unverifiedSubmissionPatch leaves this status on a run that may have pressed submit, and the
     answers route refuses those. The refusal is the server's own sentence, carried back rather than
     replaced, and it is not a save. */
  test("a stalled packet that may already be at the employer reports the refusal, not a save", async () => {
    const server = backend(stalledPacket({ submission_attempted_at: "2026-08-13T11:00:00.000Z" }));

    const outcome = await persistBeforeAudit(server, "needs_attention");

    assert.equal(outcome.persisted, false, "a refused write is not a write, and the audit must not proceed over it");
    assert.equal(outcome.message, REFUSAL, "the applicant gets the reason, not a generic apology");
    assert.equal(server.state.review.questions[0].answer, "", "and nothing was stored");
  });

  /* Mid-run, at the employer, or waiting on approval of a form already filled. No answer is written
     ahead of the audit for any of them, which is the behaviour that predates #319. */
  for (const status of ["preparing", "filling", "submitting", "submitted", "ready_for_final_approval"]) {
    test(`a ${status} packet writes nothing before the audit`, async () => {
      const server = backend(stalledPacket({ status }));

      const outcome = await persistBeforeAudit(server, status);

      assert.equal(outcome.persisted, false);
      assert.deepEqual(server.paths, []);
    });
  }
});

/* WHERE A TYPED ANSWER CAN LAND, ASKED BEFORE THE CONTROL THAT TYPES IT IS DRAWN.
 *
 * Measured live 2026-09-04: Flow Traders packet 8dc65cd0 at `ready_for_final_approval` drew
 * "Answer 1 question", opened an editor with the essay in it, and every Save came back
 * 409 REVIEW_ANSWERS_NOT_EDITABLE. The server is right - the filled form and its preview screenshot
 * would be describing different answers - so this predicate does not argue with it. It says which of
 * three things the screen should do, and `reopen` is the one that was missing.
 */

test("a packet waiting on the applicant to look at a filled form is reopened, not saved in place", () => {
  assert.equal(reviewAnswerEditRoute({ status: "ready_for_final_approval" }), "reopen");
});

test("every other status keeps the ordinary save, and the server keeps the gate", () => {
  for (const status of ["needs_attention", "questions_ready", "ready_to_submit", "resume_ready", "failed"]) {
    assert.equal(reviewAnswerEditRoute({ status }), "save", status);
  }
});

/* NARROWER THAN preparedRunCanRestart ON PURPOSE. That predicate asks only about the claim. A row
 * carrying a receipt, an open unverified submission or a claim id may already be at the employer,
 * and a refill would be a second application - so no reopen may be offered for it, and the client
 * must not be the thing that discovers that from a 409. */
test("a filled packet that may already be at the employer has no route at all", () => {
  assert.equal(reviewAnswerEditRoute({
    status: "ready_for_final_approval",
    submission_claimed_at: "2026-09-04T11:00:00.000Z",
  }), "frozen");
  assert.equal(reviewAnswerEditRoute({
    status: "ready_for_final_approval",
    submission_claim_id: "claim-1",
  }), "frozen");
  assert.equal(reviewAnswerEditRoute({
    status: "ready_for_final_approval",
    receipt: { confirmation_text: "Thanks for applying." },
  }), "frozen");
  assert.equal(reviewAnswerEditRoute({
    status: "ready_for_final_approval",
    unverified_submission: {},
  }), "frozen");
});

/* An unverified submission she has ANSWERED "not there" is the one shape that reopens again: the
 * question the record existed to ask has been answered, so it is no longer evidence of a send. Same
 * distinction submissionProvablyNotSent draws on the other side. */
test("an unverified submission the applicant closed with \"not sent\" reopens again", () => {
  assert.equal(reviewAnswerEditRoute({
    status: "ready_for_final_approval",
    unverified_submission: { resolution: "not_sent" },
  }), "reopen");
});
