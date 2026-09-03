/**
 * WHETHER THE QUESTION SCREEN MAY OFFER TO FILL THE EMPLOYER'S FORM AGAIN.
 *
 * The direct-question screen ("Application answer 1 of N") shipped with four controls - Skip, Save
 * and next, All applications, Switch applications - and not one of them started a run. A packet
 * whose questions were discovered before a resolver fix shipped therefore could never benefit from
 * that fix, and a required essay that PR #859 now drafts at prepare time never got its draft,
 * because both are produced by a fill run and the only screen that could start one was the packet
 * review behind it. Seven of the ten boards in the 2026-09-02 campaign were frozen exactly here.
 *
 * This is the render decision for the control that closes that. It is a pure mirror of the
 * backend's own `submitRequestDisposition` for the one status this screen exists on:
 *
 *   needs_attention and NOT claimed                          -> 'start'
 *   needs_attention and claimed, resolution 'not_sent'       -> 'start'
 *   anything else (claimed, awaiting a code, in flight, sent) -> refused
 *
 * so the control is never offered where the run it starts would be answered with a 409. Claimed,
 * submitting and submitted rows are the ones that may already be with the employer, and they get no
 * button at all rather than a greyed one, because there is nothing the applicant can do on this
 * screen to unlock them: that answer lives on the yes/no card and on the packet review.
 *
 * The server allows a claimed needs_attention row through on its own pre-click evidence as well
 * (submissionProvablyNotSent). That is evidence no client holds, so this stays conservative and
 * hides; the packet review's Try again still reaches it.
 *
 * Nothing here decides what the run does with her answers. The run posts the answers already on
 * file and the backend merges them, so re-reading the form never costs her an answer - see
 * refreshEmployerQuestionMetadata, whose snapshot guard is the `unsavedAnswer` input below.
 */

export type FillAgainControlState =
  | {
    /** No control is rendered. The reason is for tests and for the caller's own assertions. */
    available: false;
    reason: "not_stopped" | "employer_attempt_open";
  }
  | {
    available: true;
    /** True while the run is in flight, or while an answer on screen has not been saved. */
    disabled: boolean;
    /** True only while the managed run started by this control is in flight. */
    busy: boolean;
    label: string;
    reason: "ready" | "running" | "unsaved_answer" | "packet_review_first";
  };

/** The one label a press of this control can carry, keyed to what the press will actually do. */
export const FILL_AGAIN_LABEL = "Fill again";
export const FILL_AGAIN_RUNNING_LABEL = "Reading the company form...";
export const FILL_AGAIN_PACKET_REVIEW_LABEL = "Review packet first";

export function fillAgainControlState(input: {
  /** `review.status` exactly as the server sent it. */
  status: string;
  /** `Boolean(review.submission_claimed_at)`: a run holds, or held, a lease on this packet. */
  submissionClaimed: boolean;
  /** `review.unverified_submission?.resolution`: her own answer after looking at the employer. */
  unverifiedResolution?: "sent" | "not_sent";
  /** A managed read started from this screen has not returned yet. */
  running: boolean;
  /**
   * An answer on this screen, or in the questions editor, differs from the one the server holds.
   * The run carries only saved answers, so an unsaved one must not ride it silently.
   */
  unsavedAnswer: boolean;
  /** The exact-packet audit has not been reviewed, so the press routes to that review first. */
  needsPacketReview: boolean;
}): FillAgainControlState {
  if (input.status !== "needs_attention") return { available: false, reason: "not_stopped" };
  if (input.submissionClaimed && input.unverifiedResolution !== "not_sent") {
    return { available: false, reason: "employer_attempt_open" };
  }
  if (input.running) {
    return { available: true, disabled: true, busy: true, label: FILL_AGAIN_RUNNING_LABEL, reason: "running" };
  }
  if (input.unsavedAnswer) {
    return { available: true, disabled: true, busy: false, label: FILL_AGAIN_LABEL, reason: "unsaved_answer" };
  }
  if (input.needsPacketReview) {
    return { available: true, disabled: false, busy: false, label: FILL_AGAIN_PACKET_REVIEW_LABEL, reason: "packet_review_first" };
  }
  return { available: true, disabled: false, busy: false, label: FILL_AGAIN_LABEL, reason: "ready" };
}
