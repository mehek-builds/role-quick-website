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
