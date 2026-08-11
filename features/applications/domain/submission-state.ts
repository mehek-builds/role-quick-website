/**
 * Which submission snapshot the dashboard keeps when a poll answers.
 *
 * WHY THIS EXISTS. GET /applications/:id/submission returns FOUR things: `review`, `cover_letter`,
 * `handoff_url` and `configured`. Only the first of those carries a version (`review.updated_at`).
 * The 2.5s poll used to decide whether to install the whole response by comparing that one
 * timestamp, which is a version for the review and for nothing else:
 *
 *     setSubmission((current) => current?.review.updated_at === result.review.updated_at ? current : result);
 *
 * The other half of the defect is that `submission` is SEEDED, not fetched. selectPacket builds it
 * from the board row, which carries `spec._review` and nothing else, so the seed has no
 * `cover_letter` at all. A packet parked in `ready_for_final_approval` has a frozen
 * `review.updated_at`: nothing is advancing it. So every poll for the rest of that packet's life
 * compared the frozen seed timestamp against the identical server timestamp, matched, and threw
 * away the response that carried the cover letter. The client concluded there was no cover letter
 * while the server was handing it one every 2.5 seconds, and the "Send it" button was disabled by
 * `coverLetterPending` permanently. Measured on the live Cresta packet
 * 8142004c-3358-4538-8778-16df5e31c5bb on 2026-08-09: the row's `spec->'_cover_letter'` held a
 * complete 294 word artifact and the screen read "Loading cover letter." with a dead button.
 *
 * THE RULE THIS ENCODES. A dedupe may only drop a response that says nothing new. It may never
 * drop a response that carries a field the current snapshot does not have. So every field that
 * lives OUTSIDE `review` is compared here in its own right, and a seed that never came from the
 * server is marked `partial` and can never win a comparison.
 */

export type CoverLetterLike = {
  body?: string;
  object_key?: string;
  generated_at?: string;
  approved_at?: string;
};

export type SubmissionSnapshot = {
  application_id: string;
  review: { updated_at: string };
  cover_letter?: CoverLetterLike | null;
  handoff_url?: string;
  configured?: boolean;
  /**
   * True only on the snapshot selectPacket seeds from a board row. It is a statement about
   * PROVENANCE, not about content: a seed is not a server answer, so the first real answer always
   * replaces it even when the two agree on `review.updated_at`. Without this a field added to the
   * response later, which the seed would again not have, reproduces this same bug.
   */
  partial?: boolean;
};

export type SubmissionCoverLetterField<T extends CoverLetterLike = CoverLetterLike> =
  | { included: false }
  | { included: true; value: T | null };

/** Distinguishes a partial response that omitted the field from a server-confirmed removal. */
export function submissionCoverLetterField<T extends CoverLetterLike>(
  submission: { cover_letter?: T | null },
): SubmissionCoverLetterField<T> {
  return Object.prototype.hasOwnProperty.call(submission, "cover_letter")
    ? { included: true, value: submission.cover_letter ?? null }
    : { included: false };
}

/** Applies the field only when the response actually carried it. Explicit null removes it. */
export function nextCoverLetterValue<T extends CoverLetterLike>(
  current: T | undefined,
  incoming: { cover_letter?: T | null },
): T | undefined {
  const field = submissionCoverLetterField(incoming);
  return field.included ? field.value ?? undefined : current;
}

/** Stable identity for a cover letter, used only to tell two snapshots apart. */
export function coverLetterIdentity(coverLetter: CoverLetterLike | null | undefined): string {
  if (!coverLetter) return "";
  return [
    coverLetter.object_key ?? "",
    coverLetter.generated_at ?? "",
    coverLetter.approved_at ?? "",
    String(coverLetter.body?.length ?? 0),
  ].join("|");
}

/**
 * The snapshot to hold after a poll answers.
 *
 * Returns `current` ONLY when the incoming response is the same packet and adds nothing. That is
 * the case the dedupe exists for: a 2.5s poll on a settled packet must not re-render the review
 * pane, the resume preview and the filled-form image forever.
 */
export function nextSubmissionState<T extends SubmissionSnapshot>(current: T | null | undefined, incoming: T): T {
  if (!current) return incoming;
  // A snapshot for a different packet is not a version of this one, it is the wrong application.
  if (current.application_id !== incoming.application_id) return incoming;
  const currentCoverLetter = submissionCoverLetterField(current);
  const incomingCoverLetter = submissionCoverLetterField(incoming);
  const nextIncoming = !incomingCoverLetter.included && currentCoverLetter.included
    ? { ...incoming, cover_letter: currentCoverLetter.value }
    : incoming;
  // Never let a board seed outrank the server.
  if (current.partial) return nextIncoming;
  if (current.review.updated_at !== nextIncoming.review.updated_at) return nextIncoming;
  if (coverLetterIdentity(current.cover_letter) !== coverLetterIdentity(nextIncoming.cover_letter)) return nextIncoming;
  if ((current.handoff_url ?? null) !== (nextIncoming.handoff_url ?? null)) return nextIncoming;
  if ((current.configured ?? null) !== (nextIncoming.configured ?? null)) return nextIncoming;
  return current;
}

/**
 * How long the screen waits for a cover letter before it stops calling the wait progress.
 *
 * The poll answers every 2.5s, so anything still missing after this many rounds is not "loading".
 * Saying "Loading cover letter." forever next to a button that cannot be pressed is how a
 * permanently blocked send went unnoticed for a day.
 */
export const COVER_LETTER_WAIT_MS = 15_000;

export type CoverLetterGate = "not_applicable" | "present" | "optional" | "loading" | "unavailable";

/**
 * What the review screen should say about the cover letter, and whether the send is blocked.
 *
 * TWO DIFFERENT FACTS, and this gate used to run on the wrong one. `supported` means the form has a
 * cover-letter file control Litos can attach to. `required` means the employer marked that control
 * required, measured by the run off their own form. Blocking on `supported` made every complete
 * application on a form that merely OFFERS a cover letter unsendable: the Cresta packet's Greenhouse
 * form gave Attach / Dropbox / Enter manually with no required marker, while First Name, Last Name
 * and Email all carried one, and the green button was dead.
 *
 * `required` is tri-state and only `true` blocks. `undefined` is every packet filled before the run
 * measured it, and treating unknown as required is the same refusal wearing a different field name.
 *
 * `unavailable` is a REAL state with two causes the client cannot tell apart: the server has no
 * cover letter for this packet, or the client could not get the one it has. Both are blocking when
 * the employer requires one, and both have a way out, so the screen offers both doors rather than a
 * progress message.
 */
export function coverLetterGate({ supported, required, coverLetter, waited }: {
  supported: boolean | undefined;
  required?: boolean | undefined;
  coverLetter: CoverLetterLike | null | undefined;
  waited: boolean;
}): CoverLetterGate {
  if (supported !== true) return "not_applicable";
  if (coverLetter) return "present";
  if (required !== true) return "optional";
  return waited ? "unavailable" : "loading";
}

/** A cover letter gate that stops the applicant sending. */
export function coverLetterBlocks(gate: CoverLetterGate): boolean {
  return gate === "loading" || gate === "unavailable";
}

/**
 * The seventh reason a "Send it" must be grey, and the first one the SERVER already knew about.
 *
 * WHAT HAPPENED. Cresta packet 8142004c-3358-4538-8778-16df5e31c5bb, 2026-08-09 03:06:19. A
 * complete Greenhouse application, no screener questions, a fully enabled green Send it. The click
 * produced `POST /applications/.../submission/approve -> 409` and the page showed nothing at all:
 * no error, no toast, no state change, the button still enabled and still clickable. The refusal
 * was only findable in server logs.
 *
 * `finalApprovalBlocked` computed six terms. The seventh, this one, was not among them, so the
 * dashboard offered an action the backend had a standing rule against.
 *
 * WHY THIS TERM CANNOT STRAND THE WAY THE OTHER SIX CAN. The cover-letter fix's report ranked the
 * remaining terms by risk and named `previewReady` next: it hangs on an <img> load with no timeout
 * and no retry, so a 404'd screenshot leaves "Loading preview." beside a dead button forever. This
 * term is the opposite shape on purpose:
 *
 *   - It is DERIVED FROM DATA ALREADY IN THE REVIEW, not from an async load that may never settle.
 *     Two fields, both present in every GET /applications/:id/submission response.
 *   - It is TRUE OR FALSE, never pending. There is no third "still finding out" state to get stuck
 *     in, so there is no message that can fail to resolve.
 *   - It SHIPS WITH ITS OWN EXIT. The line under the greyed button names a restart, and the
 *     restart is a real control bound to POST /submit-request {restart:true}. A blocking term with
 *     no way out is the trap; this one is the door.
 *
 * IT MIRRORS THE SERVER'S PREDICATE EXACTLY, including the session clause. `handoff_expires_at` is
 * a deadline on a persistent browser session, and the managed provider creates none, so the backend
 * now refuses only when `browser_session_id` is set. If this function disagreed with that one in
 * either direction the screen would be lying again, just in the other direction.
 */
export function handoffWindowExpired(
  review: { handoff_expires_at?: string; browser_session_id?: string },
  now: number,
): boolean {
  if (!review.browser_session_id) return false;
  if (!review.handoff_expires_at) return false;
  const expiresAt = Date.parse(review.handoff_expires_at);
  return Number.isFinite(expiresAt) && expiresAt < now;
}

/**
 * How often the review screen re-reads the clock.
 *
 * A time-based blocking term is the one kind that can go stale with no event behind it: nothing
 * arrives when a deadline passes. The 2.5s poll happens to re-render this screen today, which would
 * mask it, and that is exactly the sort of accidental dependency that breaks the next time the poll
 * is touched. So the term gets its own tick and does not borrow one.
 */
export const HANDOFF_CLOCK_TICK_MS = 15_000;
