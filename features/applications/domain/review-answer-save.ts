/**
 * SAVING AN ANSWER FROM THE REVIEW-ANSWERS SCREEN, WHICH USED TO SAVE NOTHING AT ALL.
 *
 * THE DEFECT. The Save button on that screen called a local handler that set a banner, cleared the
 * pre-script note and changed screens. It issued no request. Every answer typed on a stalled run -
 * the packets whose whole remaining ask is a question only the applicant can answer - lived until
 * the tab closed and no further.
 *
 * The handler it called is CORRECT for the other screen that shares this component. At Apply time
 * the answers ride into the packet on the next step, through the submit-request the applicant is
 * about to press anyway, so a local save is a real save and starting a submission because she
 * answered a question would take a screen away from her. That distinction was drawn deliberately
 * and then erased, leaving the local-only handler on both paths.
 *
 * WHAT THIS DOES INSTEAD, and the two properties that make it a fix rather than a second banner:
 *
 *   IT WRITES.  PUT /applications/:id/review/answers persists the answers against the packet and
 *               leaves its status alone. It is not POST /submit-request, which would book a browser
 *               run, and not PUT /review, which would write 'questions_ready' over the
 *               needs_attention the applicant is answering FROM.
 *   IT WAITS.   The banner is built from the RESPONSE. A success message rendered before the write
 *               is a message about nothing, and that is the exact shape of the defect: the old
 *               handler said "Saved." with no request in flight. On a refusal there is no banner at
 *               all, only the reason.
 *
 * Pure and transport-free so it can be tested without a browser: the caller passes the request
 * function. Keeping it out of the component is also what stops the two Save paths drifting apart
 * again, because the difference between them now has a name.
 */

export type ReviewAnswerSaveQuestion = {
  id: string;
  question: string;
  answer: string;
  kind: "essay" | "required";
  required: boolean;
};

export type ReviewAnswerSaveResponse<Review> = { application_id: string; review: Review };

export type ReviewAnswerSaveResult<Review> =
  | { saved: true; review: Review; notice: string }
  | { saved: false; message: string };

/** Said after the write landed, never before it. The review screen is reached from a stopped run,
 *  so this promises storage and the next fill, not a send the applicant has not asked for. */
export const REVIEW_ANSWERS_SAVED_NOTICE =
  "Saved. These answers are on this application now, and Litos will put them on the company's form.";

const REVIEW_ANSWERS_SAVE_FAILED =
  "Litos could not save these answers. They are still on this screen, so try again.";

/** The one route these answers travel. Named here so the component cannot quietly point elsewhere. */
export function reviewAnswersPath(applicationId: string): string {
  return `/applications/${applicationId}/review/answers`;
}

export function reviewAnswersRequest(questions: readonly ReviewAnswerSaveQuestion[]): {
  method: string;
  body: string;
} {
  return {
    method: "PUT",
    body: JSON.stringify({
      // Only the fields the route accepts. Everything else on a question is either display-only
      // (the pre-script's option list and explanation) or a claim the server wrote and a client
      // must not be able to restate.
      questions: questions.map((question) => ({
        id: question.id,
        question: question.question,
        answer: question.answer,
        kind: question.kind,
        required: question.required,
      })),
    }),
  };
}

export async function saveReviewAnswers<Review>(options: {
  applicationId: string;
  questions: readonly ReviewAnswerSaveQuestion[];
  send: (path: string, init: { method: string; body: string }) => Promise<ReviewAnswerSaveResponse<Review>>;
}): Promise<ReviewAnswerSaveResult<Review>> {
  try {
    const response = await options.send(
      reviewAnswersPath(options.applicationId),
      reviewAnswersRequest(options.questions),
    );
    return { saved: true, review: response.review, notice: REVIEW_ANSWERS_SAVED_NOTICE };
  } catch (reason) {
    /* The server's own sentence when it has one. Its refusals name a state the applicant can act on
       ("this application is already at the employer"), and replacing that with a generic apology
       loses the only part she can do anything with. */
    return { saved: false, message: reason instanceof Error && reason.message ? reason.message : REVIEW_ANSWERS_SAVE_FAILED };
  }
}
