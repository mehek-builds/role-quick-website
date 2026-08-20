/**
 * TICKING ONE ROW OF THE "Your turn" PANEL, WHICH USED TO TICK NOTHING AT ALL.
 *
 * THE DEFECT. Every outstanding row drew `<input type="checkbox" aria-label="Mark ... done">` with
 * no handler, no state and no request behind it. Ticking recorded nothing, and the next poll
 * re-rendered the panel with the box cleared. Measured on the Easy Dynamics rippling packet on
 * 2026-08-20 - the same scenery class as the styled-span action pills this panel was already
 * repaired for once.
 *
 * WHAT THIS DOES INSTEAD, with the same two properties that made the answers save a fix rather
 * than a second banner (see review-answer-save.ts, whose shape this module deliberately copies):
 *
 *   IT WRITES.  POST /applications/:id/review/attention-acks stores the tick beside
 *               attention_reason on the review and touches nothing else - not the status, not the
 *               claim, not the send gate. The tick is her word that she handled that line on the
 *               employer's own page; it is a claim, never a measurement.
 *   IT WAITS.   The row re-renders settled from the RESPONSE's stored review. A box that shows
 *               ticked is a box whose tick is on the row, which is the exact opposite of the dead
 *               checkbox, whose tick lived until the next render and no further.
 *
 * Pure and transport-free so it can be tested without a browser: the caller passes the request
 * function. Keeping the route string, the body shape and the 202 reading here is what stops the
 * component from quietly diverging from the server's contract.
 */

export type AttentionAcknowledgementResponse<Review> = {
  application_id: string;
  review: Review;
  /* THE 202'S ONE DISTINGUISHING BYTE, same contract as the answers save: the route answers 202
   * with `saved: false` when its compare-and-swap matched no rows, meaning a run wrote to the
   * packet under this tick and nothing was stored. The body is otherwise identical to the 200's,
   * and lib/api.ts resolves on any res.ok with the status discarded, so this key is the only thing
   * that survives the transport. Absent means the write landed. */
  saved?: boolean;
};

export type AttentionAcknowledgementResult<Review> =
  | { saved: true; review: Review }
  /* `review` is present exactly when the server answered: the 202's body carries what is ACTUALLY
   * stored after the run that won the race, and the panel must render that rather than the tick
   * that did not land - the sentence she ticked may no longer exist. Absent means the request
   * itself failed and nothing newer than the current screen is known. This differs from the
   * answers save on purpose: there the refused state keeps her typing, here the truth is the row. */
  | { saved: false; message: string; review?: Review };

/** The lost race, said as the applicant experiences it. Not an error she caused, and not a save. */
export const ATTENTION_TICK_RACED =
  "Litos was working on this application while you ticked, so the tick was not saved. The list shows what the run left; tick it again if it still applies.";

const ATTENTION_TICK_FAILED = "Litos could not save that tick. Try it again.";

/** The one route a tick travels. Named here so the component cannot quietly point elsewhere. */
export function attentionAcksPath(applicationId: string): string {
  return `/applications/${applicationId}/review/attention-acks`;
}

export function attentionAckRequest(itemId: string, label: string, acknowledged: boolean): {
  method: string;
  body: string;
} {
  /* Only the fields the route accepts. item_id is the checklist row id humanInputItems derives
     from the attention sentence; label is that sentence as she saw it, stored beside the timestamp
     so the record still names what was acknowledged after the sentence leaves the report. */
  return { method: "POST", body: JSON.stringify({ item_id: itemId, label, acknowledged }) };
}

export async function saveAttentionAcknowledgement<Review>(options: {
  applicationId: string;
  itemId: string;
  label: string;
  acknowledged: boolean;
  send: (path: string, init: { method: string; body: string }) => Promise<AttentionAcknowledgementResponse<Review>>;
}): Promise<AttentionAcknowledgementResult<Review>> {
  try {
    const response = await options.send(
      attentionAcksPath(options.applicationId),
      attentionAckRequest(options.itemId, options.label, options.acknowledged),
    );
    /* Read as `=== false` rather than as falsy, so only the server SAYING so counts - the same
       reading the answers save settled on, for the same reason: the 202 arrives looking exactly
       like a 200, and it is the response whose whole purpose is to say the write did not land. */
    if (response.saved === false) return { saved: false, message: ATTENTION_TICK_RACED, review: response.review };
    return { saved: true, review: response.review };
  } catch (reason) {
    /* The server's own sentence when it has one; its refusals name a state she can act on. */
    return { saved: false, message: reason instanceof Error && reason.message ? reason.message : ATTENTION_TICK_FAILED };
  }
}
