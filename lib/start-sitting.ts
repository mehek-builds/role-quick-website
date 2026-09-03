/* THE ONE POINTER A RELOAD MAY NOT LOSE.
 *
 * /start's application sequence hands its packet between screens in memory, and the comment in
 * app/start/page.tsx says so plainly: "A reload mid-sequence therefore lands the student back on the
 * step the LEDGER says they are on with nothing carried over." That was written as a property. It is
 * really a bill.
 *
 * Rebuilding is not free. POST /resume/generate claims an onboarding build grant, the account gets
 * two (lib/onboardingBuildGrant.ts on the backend), and the grant is claimed per REQUEST while what
 * the product means to give away is an APPLICATION. So every reload between the build screen and the
 * send screen drops the packet, returns the student to build, and spends another grant on the SAME
 * posting. Two reloads is the whole allowance, and an exhausted account is then stuck in a way it
 * cannot get out of: it cannot finish setup, because the build it needs is now a paid action, and it
 * cannot leave setup either, because the card gate holds /dashboard shut until setup completes.
 *
 * Measured on admin@trylitos.com on 2026-09-03: `onboarding_completed_at` still NULL, both grants
 * gone, parked on a build it could not pay for. The backend limit was already raised from one to two
 * on 2026-09-01 for this same symptom, which raised the ceiling without touching the cause.
 *
 * The cause is here. A packet that already exists does not need to be built again, and the only
 * reason the flow rebuilt one is that it forgot the id. So the id is remembered.
 *
 * WHAT IS STORED IS A POINTER AND FOUR SMALL FACTS, never the packet. The resume, the answers and
 * the audit all live server-side and are re-read from the id; what cannot be re-derived cheaply on a
 * card-gate-locked account is which application this sitting was about. `fieldsAnswered` and
 * `answersSaved` ride along only because the review screen's receipt prints them, and a receipt that
 * silently reads zero after a reload would be the screen lying about work that was done.
 *
 * WHAT IS NOT STORED is anything the flow can re-read for free. GET /jobs/:id and
 * GET /postings/:jobId/questions are both on the card gate's onboarding tier, so the posting and the
 * employer's questions come back from the server on restore rather than from here - a stored copy of
 * either would go stale the moment the employer's form changed. `fieldsAnswered` survives only as the
 * fallback for a prescript read that comes back empty, so a receipt that was true a moment ago is not
 * blanked by a flaky scan.
 *
 * IT IS SCOPED TO AN ACCOUNT AND VALIDATED BEFORE IT IS TRUSTED. A session can change underneath a
 * tab (a 401 clears the token and the app re-guests), and a pointer restored across that boundary
 * names another user's row, which is how "Application not found" reached this screen once already.
 * The owner is stored with the pointer and checked on the way out, and the review screen treats a
 * 404 from the audit as a stale sitting rather than as a retryable failure.
 */

const KEY = "litos_start_sitting_v1";

export type StartSitting = {
  /** The account the pointer belongs to. A pointer from another session is not this student's. */
  ownerId: string;
  /** The monitored posting the sitting is about, so the screen can re-read it. */
  jobId: string;
  /** The generated_resumes row POST /resume/generate created; the id the send path resolves. */
  applicationId: string;
  /** The receipt's field count, kept only as the fallback for a failed prescript re-read. */
  fieldsAnswered: number;
  /** THE STUDENT'S OWN WORDS, and the one thing here that cannot be re-read from anywhere.
   *
   *  The questions screen keeps these in memory precisely so a revisit does not show an empty form:
   *  its own comment says "a revisit that shows an empty form has lost their work". A reload used to
   *  lose them the same way, and the save button on the revisited screen then sat disabled over a
   *  form the student had already filled in. They are the applicant's answers to an employer, held
   *  on the applicant's own device beside the session token that is already there, and cleared the
   *  moment the application is sent or saved. */
  answersGiven: { question: string; answer: string }[];
};

function isSitting(value: unknown): value is StartSitting {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.ownerId === "string" && candidate.ownerId.length > 0
    && typeof candidate.jobId === "string" && candidate.jobId.length > 0
    && typeof candidate.applicationId === "string" && candidate.applicationId.length > 0
    && Number.isFinite(candidate.fieldsAnswered)
    && Array.isArray(candidate.answersGiven)
    && candidate.answersGiven.every((entry) => typeof entry === "object" && entry !== null
      && typeof (entry as { question?: unknown }).question === "string"
      && typeof (entry as { answer?: unknown }).answer === "string");
}

/** Best effort on purpose: a storage that refuses to write must not break the flow it is helping. */
export function rememberStartSitting(sitting: StartSitting): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sitting));
  } catch {
    // A private window, a full quota, a browser that refuses. The sitting simply is not remembered.
  }
}

export function forgetStartSitting(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do, and nothing that should reach the student.
  }
}

/**
 * The pointer for THIS account, or null.
 *
 * `ownerId` is compared rather than assumed: a stored pointer that names a different account is not
 * this student's application, and restoring it would put someone else's id on the screen that sends.
 */
export function readStartSitting(ownerId: string | null | undefined): StartSitting | null {
  if (!ownerId) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSitting(parsed) || parsed.ownerId !== ownerId) return null;
    return parsed;
  } catch {
    return null;
  }
}
