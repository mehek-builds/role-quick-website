/**
 * WHETHER A PACKET'S RESUME HEADER HAS DRIFTED FROM THE APPLICANT'S CURRENT PROFILE, AND WHAT TO
 * SHOW HER IF SO.
 *
 * MEASURED live on trylitos.com, 2026-09-04: every packet built before the applicant moved (Pony.ai
 * fdcf4ccb, Belvedere Trading c4413bff/6fda0404/4de84885, Transparent Hiring 6f8524ca, among others)
 * still attaches its exact resume PDF with the contact header printed at generation time - "Dubai,
 * Dubai | mehekman@usc.edu | +971 567417451" - while `application_profile` now reads "Los Angeles,
 * California" and "+1 213 574 6270", and the managed form fills the CURRENT pair live into the
 * employer's form at submit time. The attached PDF and the form it rides with disagree, on an axis
 * neither screen alone can show her.
 *
 * "Tailor resume" was the only existing remedy, and it is the wrong tool for a fact the tailoring
 * never touches: it spends one of the Free tier's 20 monthly builds, calls the LLM to re-select and
 * re-word content that was already correct, and forks a duplicate Tracker row (#855, open). The
 * packet editor's own "Edit resume" exposes dates and bullets but has no control for the header at
 * all.
 *
 * volley-backend PR #945 adds the actual fix: `POST /applications/:id/resume/contact-refresh`
 * re-renders the same frozen content with a header recomputed from the current profile - the same
 * renderer, no LLM, no quota spent, no new row - and the read-side half of it,
 * `GET /applications/:id/submission`'s `resume_contact_stale: { stored, current }`, present ONLY
 * when the two disagree.
 *
 * THIS IS THE ONE DECISION BOTH SCREENS SHARE. The packet review screen (View exact PDF / Review and
 * fill / Edit resume) and the Review-and-send screen's checklist both need to answer "does this
 * packet's resume need the notice and the refresh button", and a screen that re-derives its own
 * answer from raw JSON is how one of them ends up disagreeing with the other - one shows the notice,
 * the other stays silent, or the reverse. Both call this instead of reading `resume_contact_stale`
 * themselves.
 *
 * TOLERATES AN OLDER BACKEND, DELIBERATELY. `resume_contact_stale` is a field a rolling deploy may
 * not send yet - a backend before volley-backend #945 omits it from
 * `GET /applications/:id/submission` entirely - and an older payload's absence must read exactly
 * like "not stale", never like a parse failure severe enough to take the rest of the screen down
 * with it. A malformed value (wrong shape, a future field this client does not understand yet) is
 * treated the same way: null, never a throw.
 */

/**
 * WHETHER POST /applications/:id/resume/contact-refresh WOULD EVEN BE ATTEMPTED, ASKED BEFORE THE
 * BUTTON THAT CALLS IT IS DRAWN.
 *
 * MEASURED: the packet review screen's own resumeContactStale notice was gated on nothing but
 * resumeContactStaleNotice reading true - clickable on a submission_claimed, submitting or submitted
 * packet exactly as readily as on a resume_ready one - so a press there 409s with no hint beforehand
 * why. volley-backend PR #945 wires the route through a disposition in src/lib/submissionSafety.ts.
 * Ported rather than imported for the same reason every other disposition mirror in this feature is:
 * this is a Next.js dashboard with no access to the backend's own module, the check is a handful of
 * status names plus four evidence fields already on ApplicationReview, and a network round trip has
 * no place deciding whether a BUTTON is clickable.
 *
 * ROUND 2: THE BACKEND SWAPPED WHICH DISPOSITION THE ROUTE ASKS, AND THIS WAS PORTING THE OLD ONE.
 * PR #945 first wired the route through `reviewAnswerSaveDisposition` - the same one
 * PUT /applications/:id/review/answers refuses through - which refuses `ready_for_final_approval`
 * UNCONDITIONALLY: right for an ANSWER save, since a rewritten answer would change what the preview
 * she is looking at means, and wrong here - a header refresh does not touch the preview's answers,
 * and the packet-audit path already voids her acknowledgement the moment the PDF's bytes move (see
 * `packet_stale` in the route's own tests). Ported literally, that refusal made the one status this
 * notice exists to show the button FOR the one status it always hid the button on - and every
 * packet measured in this file's own header (Pony.ai, Belvedere Trading, Transparent Hiring) sits at
 * exactly that status.
 *
 * The backend now reads `resumeContactRefreshDisposition` instead: reviewAnswerSaveDisposition's OWN
 * rule, with its one unconditional `ready_for_final_approval` refusal narrowed to the one case
 * resumeEditDisposition already proves safe - unclaimed, and no employer-may-hold evidence on the
 * row. Every OTHER status keeps reviewAnswerSaveDisposition's answer exactly (submissionSafety.test.ts,
 * "every status it refuses outright...keeps refusing" / "every status reviewAnswerSaveDisposition
 * already saves keeps saving"), which is why this mirrors that whole function and not only its new
 * clause: `mayBeAtEmployer` below is `employerMayHoldApplication` (managedSubmitOutcome.ts), read
 * here exactly as reviewAnswerEditRoute already reads it in this file for its own, narrower question
 * about one status.
 *
 * status ALONE is still not enough for every status besides ready_for_final_approval, which is what
 * the backend's own comment on reviewAnswerSaveDisposition argues at length: a `submit_requested`
 * row is refused only once claimed, and ANY other status can still be refused by evidence a run may
 * already have reached the employer - the exact shape that made needs_attention fall through to
 * 'save' unconditionally before that gate existed.
 *
 * DELIBERATELY NOT LISTING `submission_claimed` AMONG THE RUN-IN-PROGRESS STATUSES, unlike round 1.
 * reviewAnswerSaveDisposition's own named branches are 'submitted', 'awaiting_security_code',
 * 'preparing' / 'filling' / 'submitting', and 'submit_requested' once claimed - never the
 * `submission_claimed` status literal, so a row sitting there with no claim timestamp and no
 * employer-may-hold evidence reads 'save' from the function this is a port of. A tighter client
 * guess would not be a mirror, and the server stays the enforcement point either way (see
 * reviewAnswerEditRoute's own header on why this file is deliberately narrow rather than wide).
 *
 * Returns the one-line reason to show instead of an actionable button, or null when a press would
 * reach the route rather than a 409. The two reasons stay true of the ROW rather than of the screen
 * showing it: a claim means a run holds this packet right now, whatever its status; evidence means
 * the employer may already hold it, whatever the row's claim says.
 */
export type ResumeContactRefreshGate = {
  status: string;
  submission_claimed_at?: string;
  submission_attempted_at?: string;
  security_code?: unknown;
  unverified_submission?: { resolution?: "sent" | "not_sent" };
  receipt?: unknown;
};

const MAY_BE_AT_EMPLOYER_REASON =
  "Litos cannot refresh this resume's contact details once the application may have reached the employer.";
const RUN_IN_PROGRESS_REASON =
  "Litos is already working on this application, so its resume cannot be refreshed right now.";

/**
 * employerMayHoldApplication (managedSubmitOutcome.ts), ported: a receipt, a standing security
 * code, or an unresolved / unlooked-at unverified_submission or submission_attempted_at each
 * independently mean the employer may already hold this application, regardless of what the status
 * column says. `lookedAndNotThere` is the one resolution that neutralises the latter two rather
 * than confirming them: she looked, in her own portal or mailbox, and it was not there.
 *
 * Shared by two call sites below (the ready_for_final_approval branch and the fall-through for
 * every other status) rather than inlined twice, which is the only thing separating this from
 * round 1's version of the same four lines.
 */
function mayBeAtEmployer(review: ResumeContactRefreshGate): boolean {
  const lookedAndNotThere = review.unverified_submission?.resolution === "not_sent";
  return Boolean(review.receipt)
    || Boolean(review.security_code)
    || (Boolean(review.unverified_submission) && !lookedAndNotThere)
    || (Boolean(review.submission_attempted_at) && !lookedAndNotThere);
}

export function resumeContactRefreshBlockedReason(review: ResumeContactRefreshGate): string | null {
  const status = review.status;
  // reviewAnswerSaveDisposition's three named in-progress branches: a run holds this row right now
  // and will write the same _review blob back when it finishes, so a refresh racing that write is
  // refused rather than half-applied. submit_requested only joins this group once claimed - an
  // unclaimed one falls through below like any other pre-run status.
  if (status === "preparing" || status === "filling" || status === "submitting"
    || (status === "submit_requested" && Boolean(review.submission_claimed_at))) {
    return RUN_IN_PROGRESS_REASON;
  }
  // resumeContactRefreshDisposition's OWN clause, and the one this whole round exists to add: refuse
  // ready_for_final_approval only when this packet is claimed (a run holds it right now, exactly
  // like the group above) or the row's own evidence says the employer may already hold it. Every
  // other unclaimed, no-evidence ready_for_final_approval packet - the shape every packet measured
  // in this file's header is in - is now open.
  if (status === "ready_for_final_approval") {
    if (Boolean(review.submission_claimed_at)) return RUN_IN_PROGRESS_REASON;
    return mayBeAtEmployer(review) ? MAY_BE_AT_EMPLOYER_REASON : null;
  }
  // The record of what the employer was given must not be rewritten underneath it.
  if (status === "submitted" || status === "awaiting_security_code") return MAY_BE_AT_EMPLOYER_REASON;
  // Every remaining status - resume_ready, questions_ready, ready_to_submit, needs_attention,
  // submission_claimed, and anything this predicate does not yet have a name for - keeps
  // reviewAnswerSaveDisposition's fall-through answer: open unless the row's own evidence says
  // otherwise.
  return mayBeAtEmployer(review) ? MAY_BE_AT_EMPLOYER_REASON : null;
}

/**
 * One resume header's mutable contact facts, as the backend's ContactHeader sends them over the
 * wire (student-outreach-backend src/lib/resumeContactOfRecord.ts). Structural and all-optional:
 * this module only ever READS a header a caller already has, so a field it does not recognise is
 * never a reason to refuse the ones it does.
 */
export type ResumeContactHeaderLike = {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
};

/** The exact shape `resumeContactStaleness` returns on the backend, and `resume_contact_stale`
 *  carries verbatim: the header as it is stored on the packet today, and the header a refresh would
 *  produce from the current profile. */
export type ResumeContactStaleLike = {
  stored: ResumeContactHeaderLike;
  current: ResumeContactHeaderLike;
};

function contactHeaderLike(value: unknown): ResumeContactHeaderLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ResumeContactHeaderLike;
}

/**
 * Whether to show "This resume's contact details are out of date." for this submission, and the
 * before/after headers to print if so.
 *
 * null on any submission with no signal to show - the field absent (no drift, or an older backend),
 * malformed (a shape this client does not understand), or carrying only one half of the pair. All
 * three read the same way on purpose: "nothing to show her" is the only safe default for a field
 * this client did not itself compute, see the header above.
 */
export function resumeContactStaleNotice(
  submission: { resume_contact_stale?: unknown } | null | undefined,
): ResumeContactStaleLike | null {
  const staleness = submission?.resume_contact_stale;
  if (!staleness || typeof staleness !== "object" || Array.isArray(staleness)) return null;
  const stored = contactHeaderLike((staleness as Record<string, unknown>).stored);
  const current = contactHeaderLike((staleness as Record<string, unknown>).current);
  if (!stored || !current) return null;
  return { stored, current };
}

/* Named field order, never a spread: the same discipline documentsFromSpecMarks (submission-state.ts)
   uses and for the same reason - a field this list does not name is a field that cannot silently
   join the identity below, and cannot silently leave it either. */
const CONTACT_HEADER_IDENTITY_FIELDS = [
  "full_name", "email", "phone", "location", "linkedin_url", "github_url", "portfolio_url",
] as const;

function contactHeaderIdentity(header: ResumeContactHeaderLike | null | undefined): string {
  if (!header) return "";
  return CONTACT_HEADER_IDENTITY_FIELDS.map((field) => header[field] ?? "").join("|");
}

/**
 * Stable identity for `resume_contact_stale`, used only to tell two submission snapshots apart.
 *
 * ANOTHER FIELD OUTSIDE `review`, VERSIONED BY NOTHING - exactly the shape `documentsIdentity` and
 * `sensitiveConfirmationIdentity` already exist in submission-state.ts to handle, and for the same
 * reason: `review.updated_at` does not move when only the PROFILE changes. An applicant who edits
 * her phone or city while a packet sits parked at `ready_for_final_approval` makes this field appear
 * on the very next poll with the review clock frozen, and a comparison that skipped it would throw
 * that poll away exactly the way an early cut of the cover-letter fix threw away a cover letter that
 * arrived after the seed - see submission-state.ts's own header for that measured defect.
 *
 * The sole caller is `nextSubmissionState` in submission-state.ts.
 */
export function resumeContactStaleIdentity(staleness: ResumeContactStaleLike | null | undefined): string {
  if (!staleness) return "";
  return `${contactHeaderIdentity(staleness.stored)}~${contactHeaderIdentity(staleness.current)}`;
}
