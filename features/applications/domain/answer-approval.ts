/**
 * THE CHECKBOX ON THE "YOUR TURN" LIST, WHICH WAS NEVER CONNECTED TO ANYTHING.
 *
 * THE DEFECT. Every outstanding row drew `<input type="checkbox" aria-label={`Mark ${label} done`}>`
 * with no `checked`, no `onChange` and no state behind it. It shipped in "Make application blockers
 * checkable" (7051e6d, 2026-08-06), which turned a decorative <span> tick into a decorative <input>
 * and stopped there. Measured on the live Deepgram packet on 2026-08-13: five clicks on five boxes,
 * zero network requests, `checked` still false on all five. There was nothing to fire.
 *
 * That is the same defect the action pill on these rows had, and the file it lives in already states
 * the rule that fixed it: a control is drawn only where there is something for it to do. This module
 * is that rule applied to the box rather than to the pill, plus the request the box now makes.
 *
 * WHAT MARKING A ROW DONE MEANS, WHICH IS THE PART THE OLD CONTROL NEVER HAD TO ANSWER. It means the
 * applicant has read an answer Litos wrote and is letting it stand. That is a claim about a stored
 * answer, so it belongs on the packet and not in a React state that dies with the tab. It is
 * deliberately NOT the claim that she wrote the answer: see the server's answerApproval.ts, which
 * records `answer_approved_at` and never `answer_source`.
 *
 * AND WHAT IT CANNOT MEAN. A row that names no question - a blocker the run reported, a required
 * answer still blank - has nothing on the packet to approve. There is no honest place to store
 * "handled" for it, and a client-side dismissal would hide a live blocker behind a tick and then
 * lose the argument with the next poll, which rebuilds these rows from `attention_reason`. Those
 * rows get no checkbox at all, which is the same answer checklistRowControl gives for the pill:
 * nothing, rather than a control that cannot act.
 *
 * Pure and transport-free, like review-answer-save.ts beside it, so both save paths and this one
 * keep one definition each and can be tested without a browser.
 */

import type { SubmissionChecklistItem } from "./submission-checklist";

/** The one route an approval travels. Named here so no component can quietly point elsewhere. */
export function answerApprovalPath(applicationId: string, questionId: string): string {
  return `/applications/${applicationId}/review/answers/${encodeURIComponent(questionId)}/approval`;
}

export type AnswerApprovalResponse<Review> = {
  application_id: string;
  review: Review;
  /* Present ONLY on the 202, exactly as the answers route does it. Both bodies are otherwise
   * identical and lib/api.ts resolves on any res.ok with the status discarded, so without this one
   * key a client could not tell an approval from a run that wrote to the packet underneath it. */
  saved?: boolean;
};

export type AnswerApprovalResult<Review> =
  | { approved: true; review: Review }
  | { approved: false; message: string };

/** The lost race, said as she experiences it: the packet moved and her tick did not land. */
export const ANSWER_APPROVAL_RACED =
  "Litos was working on this application, so that answer was not marked done. Try again in a moment.";

const ANSWER_APPROVAL_FAILED =
  "Litos could not mark that answer done. Nothing has changed, so try again.";

/**
 * WHICH ROWS CARRY A REAL BOX.
 *
 * `review` is a drafted answer waiting to be read. `confirm` is an answer to a question only she may
 * speak to - sponsorship, compensation, a privacy statement - that a run resolved and that the row
 * itself asks her to confirm. Both name a question that holds text, which is the one thing an
 * approval can be about.
 *
 * Everything else returns null and draws no control: `answer` rows are blank and need typing rather
 * than approving, `open-page` rows are the run reporting on the employer's form, and `attach` rows
 * are waiting on a file. Returning null rather than a disabled box is deliberate - a disabled
 * control still says "this is markable, later", and none of these ever become markable here.
 */
export function checklistRowApproval(item: SubmissionChecklistItem): { questionId: string } | null {
  if (!item.questionId) return null;
  if (item.actionKind !== "review" && item.actionKind !== "confirm") return null;
  return { questionId: item.questionId };
}

export function approvalRequest(answer: string): { method: string; body: string } {
  return {
    method: "PUT",
    // The exact text the row was drawn from. The server refuses the approval if the packet no longer
    // holds it, which is what makes this an approval of an answer rather than of a row id.
    body: JSON.stringify({ answer }),
  };
}

export async function approveDraftedAnswer<Review>(options: {
  applicationId: string;
  questionId: string;
  answer: string;
  send: (path: string, init: { method: string; body: string }) => Promise<AnswerApprovalResponse<Review>>;
}): Promise<AnswerApprovalResult<Review>> {
  try {
    const response = await options.send(
      answerApprovalPath(options.applicationId, options.questionId),
      approvalRequest(options.answer),
    );
    /* Read as `=== false` rather than as falsy, so only the server SAYING the write was lost counts.
     * A 200 carries no `saved` key at all. */
    if (response.saved === false) return { approved: false, message: ANSWER_APPROVAL_RACED };
    return { approved: true, review: response.review };
  } catch (reason) {
    /* The server's own sentence where it has one. Its refusals name a state she can act on - the
     * answer moved under her, the application is already at the employer - and replacing those with
     * a generic apology loses the only part she can do anything about. */
    return { approved: false, message: reason instanceof Error && reason.message ? reason.message : ANSWER_APPROVAL_FAILED };
  }
}
