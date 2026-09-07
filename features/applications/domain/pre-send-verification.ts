/**
 * The one refusal on the send path that the applicant cannot answer by editing anything.
 *
 * volley-backend PR #1058 added a pre-send resume verification to POST /applications/:id/submit-request
 * and to the extension's start route. It answers 422 PRE_SEND_VERIFICATION_FAILED with a list of
 * `issues` naming what the rule objected to, for example "grounding: a <entry> metric is stored as a
 * target, plan, or forecast but rendered as an achieved result". Every packet this account tailored
 * BEFORE that rule existed fails it, which on 2026-09-07 was roughly two hundred rows.
 *
 * The dashboard's answer to that was a dead end. The sentence appeared as a page-level red banner,
 * "Approve packet and fill form" stayed enabled and re-fired the identical 422 on every press, and
 * the two controls that could plausibly clear it were both wrong:
 *
 *   - "Tailor resume" lives only on the free-fill canonical card, so a packet already open on its
 *     review screen has no rebuild control at all.
 *   - "Edit resume" would hand the applicant a wording defect the product itself generated, and ask
 *     her to hand-fix a bullet a machine wrote and a machine rejected.
 *
 * So this module derives the review screen's state from the refusal: it names the offending entries,
 * withdraws the send, and offers exactly one way forward - rebuild this packet for the same job.
 *
 * KEYED ON `code`, NEVER ON THE MESSAGE, for the reason audit-refusal.ts states: the sentence is
 * applicant-facing copy and will be reworded, and matching copy is how a raw refusal code ends up
 * on screen.
 */

export type PreSendVerificationRefusal = {
  applicationId: string;
  /** The server's own sentence, without the "Issues: ..." suffix `apiErrorMessage` appends. */
  message: string;
  issues: string[];
};

export const PRE_SEND_VERIFICATION_CODE = "PRE_SEND_VERIFICATION_FAILED";

/** Copy for the case the server refused without naming a single entry. Still a refusal, still a
 *  rebuild, but the screen must not imply it listed something it did not. */
export const PRE_SEND_VERIFICATION_UNNAMED_ISSUE =
  "Litos did not name which line it objected to. Rebuilding this resume writes the whole packet again.";

/** Why the rebuild cannot run: the packet has no frozen job description to rebuild against. */
export const PRE_SEND_VERIFICATION_NO_JD =
  "This packet has no saved job description, so Litos cannot rebuild it here. Open the posting again from Jobs to make a fresh application.";

function refusalBody(reason: unknown): Record<string, unknown> | null {
  if (typeof reason !== "object" || reason === null) return null;
  if ((reason as { status?: unknown }).status !== 422) return null;
  const data = (reason as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  return data as Record<string, unknown>;
}

function cleanedIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const text = entry.replace(/\s+/g, " ").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    issues.push(text);
  }
  return issues;
}

/**
 * The pre-send verification refusal for this application, or null when the failure is anything else.
 *
 * Reads the PARSED BODY rather than the thrown Error, because that is where the backend puts `code`
 * and the untruncated `issues`, while `Error.message` has already been folded into one sentence with
 * at most five issues inlined and the rest reported as "N more issues hidden".
 */
export function preSendVerificationRefusal(
  applicationId: string,
  reason: unknown,
): PreSendVerificationRefusal | null {
  const body = refusalBody(reason);
  if (!body || body.code !== PRE_SEND_VERIFICATION_CODE) return null;
  const message = typeof body.error === "string" && body.error.trim()
    ? body.error.trim()
    : "Verify the resume before sending. The current packet is not ready for submission.";
  return { applicationId, message, issues: cleanedIssues(body.issues) };
}

export type PreSendVerificationReviewState = {
  /** The send control must be disabled and must not be pressable into the same 422 again. */
  sendDisabled: true;
  message: string;
  /** Never empty. Falls back to one honest line when the server named nothing. */
  issues: string[];
  /** Whether the rebuild control may be pressed right now. */
  rebuildAvailable: boolean;
  /** Present exactly when `rebuildAvailable` is false, saying why. */
  rebuildBlockedReason: string | null;
  rebuildInProgress: boolean;
};

/**
 * The review screen's derived state under a pre-send verification refusal, or null when there is none.
 *
 * `applicationId` is the packet currently on screen. A refusal is scoped to the packet that earned
 * it: switching rows must not carry a stopped send onto a different application, which is the same
 * scoping rule `sendRefusal` already follows on the portal screen.
 *
 * `jdText` is the packet's frozen `spec._review.jd_text`. The rebuild reuses it rather than re-reading
 * the posting, so a board that has since rotated or closed the row cannot block the repair; without
 * it there is nothing to tailor against and the control says so instead of failing on press.
 */
export function preSendVerificationReviewState(
  refusal: PreSendVerificationRefusal | null,
  context: {
    applicationId: string | null;
    jdText: string | null | undefined;
    rebuilding: boolean;
  },
): PreSendVerificationReviewState | null {
  if (!refusal || !context.applicationId || refusal.applicationId !== context.applicationId) return null;
  const hasJd = Boolean(context.jdText && context.jdText.trim().length > 0);
  return {
    sendDisabled: true,
    message: refusal.message,
    issues: refusal.issues.length > 0 ? refusal.issues : [PRE_SEND_VERIFICATION_UNNAMED_ISSUE],
    rebuildAvailable: hasJd && !context.rebuilding,
    rebuildBlockedReason: hasJd ? null : PRE_SEND_VERIFICATION_NO_JD,
    rebuildInProgress: context.rebuilding,
  };
}
