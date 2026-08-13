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

type Sent = { path: string; init: { method: string; body: string } };

function recorder(reply: (sent: Sent) => Promise<{ application_id: string; review: { status: string } }>) {
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
});
