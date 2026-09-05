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
  answer_state?: "unanswered" | "skipped" | "litos_refused";
  /* HER EXPLICIT CONFIRMATION OF THIS EXACT ANSWER, and the one field on this type the server reads
   * as a claim rather than a value. An unedited Save is byte-identical to a save she never looked
   * at, so the backend's merge rightly mints nothing for it - which left the YOUR TURN panel's
   * CONFIRM ask re-rendering after every save, forever (the DV Trading loop, 2026-08-17). Set only
   * on a question she confirmed through the CONFIRM control, never as a default: flagging a whole
   * list would claim EEO self-identifications she never read, which is the exact laundering the
   * server's gate exists to refuse. */
  confirmed?: boolean;
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
  | { saved: false; message: string; review?: Review };

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
 *
 * A SECOND STOPPED STATUS, FOUND THE SAME WAY #319 FOUND THE FIRST. Measured live 2026-09-04,
 * account mehekmandal05@gmail.com: Pony.ai packet fdcf4ccb-eca9-44dc-b0cb-d400805ebdeb (workable)
 * sat at `failed` after run f3aab6c5 failed, with its optional cover-letter question still
 * `answer_state: "unanswered"`. Pressing Skip on that question and "Save and continue" kept the
 * skip in local state only - correct, because the write for a stopped run belongs here, at the
 * audit, not at that earlier press - but `failed` matched neither REVIEW_EDIT_STATUSES nor the
 * needs_attention check below, so this function answered "none", continueFromResume wrote nothing,
 * and the packet-audit that followed handed back the server's still-unanswered copy.
 * continueFromVerifiedPacket adopted it (see the long comment on that adoption in
 * app/dashboard/applications/page.tsx), "Approve packet and fill form" found the skip gone and
 * bounced back to the questions screen, and the loop repeated forever - the same defect #319 fixed
 * for needs_attention, on a status #319 never saw.
 *
 * `failed` IS THE SAME SHAPE AS needs_attention FOR THIS DECISION: a run that already stopped, with
 * nothing further along the path to carry the answer, so a local-only save is not a save at all.
 * The same argument against `review_edit` applies without adjustment - it would relabel a `failed`
 * packet to questions_ready/ready_to_submit, erasing the fact its run failed as a side effect of
 * saving an answer, for the same reason it must not erase needs_attention's attention_reason.
 *
 * THE BACKEND NEEDS NO MATCHING CHANGE. reviewAnswerSaveDisposition (student-outreach-backend
 * src/lib/submissionSafety.ts) already reads the row rather than a status allowlist: `failed` falls
 * through its explicit refusals straight to employerMayHoldApplication, so a failed row with no send
 * evidence already saves through PUT /review/answers, and one carrying send evidence is already
 * refused by the same check needs_attention answers to. See src/routes/reviewAnswerSave.test.ts,
 * "a failed run carrying no send evidence still accepts the save" and the four
 * "a failed run carrying ... refuses the save" cases beside it - both already live on origin/main.
 */
export type AuditAnswerWrite = "review_edit" | "answers_only" | "none";

/* The statuses an audit-time save may rewrite the whole stored review for. Each is a packet waiting
   to be prepared, so 'questions_ready'/'ready_to_submit' is a description of where the save leaves
   it rather than a fact being overwritten. */
const REVIEW_EDIT_STATUSES = ["resume_ready", "questions_ready", "ready_to_submit"];

export function auditAnswerWrite(status: string): AuditAnswerWrite {
  if (REVIEW_EDIT_STATUSES.includes(status)) return "review_edit";
  /* The stalled packet and the failed run beside it: both are stopped, and both persist their
     answers through the one route that leaves the stop - and the reason for it - standing, rather
     than relabelling the packet as though it were still waiting to be prepared. */
  if (status === "needs_attention" || status === "failed") return "answers_only";
  /* Everything else is mid-run, at the employer, or awaiting an approval of a form already filled.
     Nothing is written ahead of the audit, exactly as before #319. */
  return "none";
}

/**
 * WHERE A TYPED ANSWER CAN ACTUALLY LAND, ASKED BEFORE THE CONTROL THAT TYPES IT IS DRAWN.
 *
 * THE DEFECT THIS NAMES. Measured live 2026-09-04, account mehekmandal05@gmail.com: Flow Traders
 * packet 8dc65cd0-cab5-4af2-a1d8-2583766fd2d4 (greenhouse) at `ready_for_final_approval`. The
 * Tracker card drew "Answer 1 question", the press opened the per-question editor with the essay
 * pre-filled, the box accepted typing, and Save returned
 * `409 REVIEW_ANSWERS_NOT_EDITABLE`. Every keystroke of a correction to a factual error was
 * unlandable, and nothing on either screen said so until after the press.
 *
 * THE SERVER IS RIGHT, AND THIS IS NOT A CLIENT COPY OF ITS GATE. The backend refusal is
 * reviewAnswerSaveDisposition (student-outreach-backend src/lib/submissionSafety.ts:308), and its
 * own comment gives the reason in full: "The form is already filled and there is a preview
 * screenshot of it on screen. New answers underneath it would leave the picture the applicant
 * approves describing something else." PUT /review/answers writes the answers "and nothing else" -
 * it leaves the status, the filled form and that screenshot exactly where they were - so a save
 * through it is precisely the divergence the refusal exists to prevent. Widening it is not
 * available, and this file does not attempt to predict every state it refuses: `save` below means
 * "no reason known HERE to route this anywhere else", and the server stays the enforcement point.
 *
 * WHAT IS ADDED IS THE THIRD ANSWER, and it is the one the screen was missing. A packet at
 * `ready_for_final_approval` that carries NO claim and NO send evidence has reached no employer,
 * and the backend already has a door for exactly that shape: preparedRunCanRestart
 * (submissionSafety.ts:140) admits it, and POST /applications/:id/submit-request takes
 * `{ questions, restart: true }` - discarding the filled form, refilling it from the posted answers
 * and taking a fresh preview. So the corrected answer and the picture move TOGETHER, in one
 * request, which is the invariant rather than a hole in it. `reopen` says "this answer has a route,
 * and it is that one".
 *
 * STRICTLY NARROWER THAN THE SERVER'S DOOR, deliberately. preparedRunCanRestart asks only about the
 * claim; this also refuses a stored `receipt` or an open `unverified_submission`, so a client can
 * never offer a reopen the server would then refuse. The cost of being narrow is a `frozen` verdict
 * on a packet that might have been reopenable; the cost of being wide is a second dead control,
 * which is the defect itself.
 */
export type ReviewAnswerEditRoute = "save" | "reopen" | "frozen";

/** The fields this decision reads. A subset of the live review, so tests state the shape exactly. */
export type ReviewAnswerEditState = {
  status: string;
  submission_claimed_at?: string;
  submission_claim_id?: string;
  unverified_submission?: { resolution?: "sent" | "not_sent" };
  receipt?: unknown;
};

export function reviewAnswerEditRoute(review: ReviewAnswerEditState): ReviewAnswerEditRoute {
  if (review.status !== "ready_for_final_approval") return "save";
  /* Any of these means something may already be at the employer, and then the answers on the row are
     the record of what was given rather than a draft. There is no correction route for that and the
     screen must not invent one. */
  const mayBeAtEmployer = Boolean(review.submission_claimed_at)
    || Boolean(review.submission_claim_id)
    || Boolean(review.receipt)
    || (Boolean(review.unverified_submission) && !review.unverified_submission?.resolution);
  return mayBeAtEmployer ? "frozen" : "reopen";
}

/** Said when the correction is going down the reopen route, so the press is not mistaken for the
 *  ordinary save: this one throws away a form that is already filled and fills it again. */
export const REVIEW_ANSWERS_REOPEN_NOTICE =
  "This company's form is already filled in, so Litos is filling it again with your correction. A new preview will be here in a minute.";

/** The reopen the server would not take. Says what every refusal on this path says - the answer is
 *  still hers and still on the screen - and leaves the server's own sentence to the banner
 *  prepareApplication has already written, rather than restating it in different words. */
export const REVIEW_ANSWERS_REOPEN_REFUSED =
  "Litos could not start filling this company's form again, so your correction has not been saved yet. It is still on this screen, so try again.";

/** The one state with no correction route at all, said as the reason rather than as an apology. */
export const REVIEW_ANSWERS_FROZEN_NOTICE =
  "Litos has already started sending this application, so its answers are now the record of what the company was given and cannot be edited.";

export function reviewAnswersRequest(questions: readonly ReviewAnswerSaveQuestion[]): {
  method: string;
  body: string;
} {
  return {
    method: "PUT",
    body: JSON.stringify({
      // Only the fields the route accepts. Employer options and explanations remain display-only,
      // while answer_state records the applicant's reversible choice to skip an optional row.
      questions: questions.map((question) => ({
        id: question.id,
        question: question.question,
        answer: question.answer,
        kind: question.kind,
        required: question.required,
        ...(question.answer_state ? { answer_state: question.answer_state } : {}),
        /* Present only when true, because absent is the only other honest state: the route's schema
           takes `confirmed: true` or nothing, and a posted `false` would be refused. */
        ...(question.confirmed === true ? { confirmed: true as const } : {}),
      })),
    }),
  };
}

/**
 * Whether the audit path has an answer mutation to persist.
 *
 * A needs_attention row can also carry evidence that an employer may already hold the
 * application. The backend correctly refuses every answer mutation on that shape. The review
 * screen nevertheless used to PUT the server's own unchanged questions back before every audit,
 * turning a read-only packet review into a forbidden edit and preventing the audit from naming the
 * actual next state. Compare exactly the bytes the route accepts: display-only options and
 * explanations cannot manufacture a write, while an answer, label, kind, required flag, order, or
 * explicit confirmation change still must go through the guarded route.
 */
export function reviewAnswersNeedSave(
  stored: readonly ReviewAnswerSaveQuestion[],
  current: readonly ReviewAnswerSaveQuestion[],
): boolean {
  return reviewAnswersRequest(stored).body !== reviewAnswersRequest(current).body;
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
    if (response.saved === false) return { saved: false, message: REVIEW_ANSWERS_SAVE_RACED, review: response.review };
    return { saved: true, review: response.review, notice: REVIEW_ANSWERS_SAVED_NOTICE };
  } catch (reason) {
    /* The server's own sentence when it has one. Its refusals name a state the applicant can act on
       ("this application is already at the employer"), and replacing that with a generic apology
       loses the only part she can do anything with. */
    return { saved: false, message: reason instanceof Error && reason.message ? reason.message : REVIEW_ANSWERS_SAVE_FAILED };
  }
}
