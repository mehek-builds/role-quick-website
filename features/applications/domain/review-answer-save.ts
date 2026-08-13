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

export type ReviewAnswerSaveResponse<Review> = {
  application_id: string;
  review: Review;
  /* THE 202's ONE DISTINGUISHING BYTE, and without it the status is unreadable from here.
   *
   * The route answers 202 when its conditional update matched no rows, meaning a run wrote to the
   * packet between the read and the write and the applicant's answers did not land. Its body is
   * otherwise IDENTICAL to the 200's, and lib/api.ts resolves on any res.ok and returns the parsed
   * body with the status discarded - so a client reading the body alone could not tell a save from a
   * lost race. This one is shipped only on the 202, which is why it is optional here: absent means a
   * write that landed. */
  saved?: boolean;
};

export type ReviewAnswerSaveResult<Review> =
  | { saved: true; review: Review; notice: string }
  | { saved: false; message: string };

/** Said after the write landed, never before it. The review screen is reached from a stopped run,
 *  so this promises storage and the next fill, not a send the applicant has not asked for. */
export const REVIEW_ANSWERS_SAVED_NOTICE =
  "Saved. These answers are on this application now, and Litos will put them on the company's form.";

const REVIEW_ANSWERS_SAVE_FAILED =
  "Litos could not save these answers. They are still on this screen, so try again.";

/** The lost race, said as the applicant experiences it: her answers are still hers, and the packet
 *  moved underneath them. Not an error she did anything to cause, and not a save. */
export const REVIEW_ANSWERS_SAVE_RACED =
  "Litos was working on this application while you were typing, so these answers were not saved. They are still on this screen, so try again.";

/** The one route these answers travel. Named here so the component cannot quietly point elsewhere. */
export function reviewAnswersPath(applicationId: string): string {
  return `/applications/${applicationId}/review/answers`;
}

/**
 * WHICH WRITE PERSISTS THE REVIEWED ANSWERS AHEAD OF AN EXACT-PACKET AUDIT.
 *
 * A SECOND SAVE PATH, ON THE OTHER SIDE OF THE SAME SCREEN. saveReviewAnswers above is the Save
 * button. This is the same answers being persisted from continueFromResume, which writes them and
 * then asks the server to audit the exact packet - so the answers the audit is taken over are the
 * answers on the packet. Both had the same gap and PR #319 found this one first.
 *
 * WHAT #319 GOT RIGHT. Before it, the write was gated on three statuses and a stalled packet was not
 * one of them, so continuing a needs_attention application audited a packet whose answers had never
 * been stored. Adding needs_attention to that list is the correct intent and it is kept here.
 *
 * WHAT IT COULD NOT SEE FROM THE CLIENT. The list it added to gates PUT /applications/:id/review,
 * and applyApplicationReviewEdit ends by writing `status: questions_ready | ready_to_submit`
 * unconditionally. submitRequestDisposition answers 'start' for an UNCLAIMED needs_attention row, so
 * that call is permitted rather than refused: it returns 200, and the packet comes back relabelled
 * with a READY badge over a run that is still blocked. The attention_reason prose survives the
 * write, which makes it worse rather than better - the row then says ready and carries the sentence
 * explaining why it is not, and every screen that decides what to show from the status shows the
 * ready one. Measured against a real row in the backend's
 * src/routes/reviewAnswerSave.test.ts, "the edit route is not refused on an unclaimed stopped run,
 * and relabels it".
 *
 * SO THE INTENT SURVIVES AND THE ROUTE CHANGES. needs_attention persists its answers through
 * PUT /applications/:id/review/answers, which writes the answers, the round they are claimed
 * against, and nothing else. The other three are untouched: an edit is allowed to move them, that
 * status move is what the packet is asking for, and this is not the place to revisit it.
 *
 * KEPT OUT OF THE COMPONENT so the decision has a name and a test. The list below is the one #319
 * edited; putting needs_attention back into it is a one-word change that this module's tests, and
 * the source assertion in tests/application-submission-gate.test.mjs, both fail on.
 */
export type AuditAnswerWrite = "review_edit" | "answers_only" | "none";

/* The statuses an audit-time save may rewrite the whole stored review for. Each is a packet waiting
   to be prepared, so 'questions_ready'/'ready_to_submit' is a description of where the save leaves
   it rather than a fact being overwritten. */
const REVIEW_EDIT_STATUSES = ["resume_ready", "questions_ready", "ready_to_submit"];

export function auditAnswerWrite(status: string): AuditAnswerWrite {
  if (REVIEW_EDIT_STATUSES.includes(status)) return "review_edit";
  /* The stalled packet. Its answers are persisted like any other, through the one route that leaves
     the stall and the reason for it standing. */
  if (status === "needs_attention") return "answers_only";
  /* Everything else is mid-run, at the employer, or awaiting an approval of a form already filled.
     Nothing is written ahead of the audit, exactly as before #319. */
  return "none";
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
    /* A 202 IS NOT A SAVE, AND IT ARRIVES LOOKING EXACTLY LIKE ONE.
     *
     * The route answers it when a run wrote to the packet under this request, so nothing the
     * applicant typed was stored. It is `res.ok`, so the transport resolves it, and its body carries
     * the same two keys a 200 does - which meant this function reported `saved: true` for it, the
     * screen showed "Saved.", setQuestions replaced her typing with the stored review that does not
     * contain it, and the screen navigated away. That is the original defect, reached through the one
     * response whose whole purpose is to say the defect happened.
     *
     * Read as `=== false` rather than as falsy, so only the server SAYING so counts. */
    if (response.saved === false) return { saved: false, message: REVIEW_ANSWERS_SAVE_RACED };
    return { saved: true, review: response.review, notice: REVIEW_ANSWERS_SAVED_NOTICE };
  } catch (reason) {
    /* The server's own sentence when it has one. Its refusals name a state the applicant can act on
       ("this application is already at the employer"), and replacing that with a generic apology
       loses the only part she can do anything with. */
    return { saved: false, message: reason instanceof Error && reason.message ? reason.message : REVIEW_ANSWERS_SAVE_FAILED };
  }
}
