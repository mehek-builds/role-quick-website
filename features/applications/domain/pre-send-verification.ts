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

/* Relative with its extension, and imported for the same rule the composer applies to a typed job
   link: this module is loaded directly by the node test runner, which resolves no path aliases. */
import { isHttpsJobUrl } from "./daily-matches.ts";

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

/** Why the rebuild cannot run: the Tracker row this packet belongs to is not loaded on this page.
 *
 *  MEASURED 2026-09-10 on a live packet opened by deep link. The rebuild must carry the canonical
 *  application id, or /resume/generate mints a SECOND Tracker row for the same job (#855), so a
 *  packet whose row the page cannot name has no safe rebuild to offer. The row is not missing from
 *  the account: `/applications?limit=200` is a window, and an older packet's row can sit outside it.
 *  Reloading Applications from the Tracker itself opens the row with its packet linked. */
export const PRE_SEND_VERIFICATION_NO_TRACKER_ROW =
  "Litos could not find the Tracker application this resume belongs to, so it cannot rebuild it here without creating a second copy of this job. Open the application from the Tracker and try again.";

/** Why the rebuild cannot run: there is no usable job link to tailor against. */
export const PRE_SEND_VERIFICATION_NO_PORTAL_URL =
  "This packet has no saved job link, so Litos cannot rebuild it here. Open the posting again from Jobs to make a fresh application.";

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
 *
 * `canonicalApplicationId` and `portalUrl` are the OTHER two things the rebuild request cannot be
 * built without, and they are derived here for exactly the reason `jdText` is.
 *
 * THE 2026-09-10 DEAD BUTTON. The banner rendered, the control was enabled, and pressing it issued
 * no request at all: the page could not name the Tracker row for that packet, and every refusal on
 * the way to /resume/generate was written to a surface the review screen does not render - the New
 * application composer, which is closed. A control that cannot work must say so BEFORE it is
 * pressed, on the same derived value the press itself reads, which is the rule the send control
 * beside it already follows. Nothing here re-arms on a press: these are the request's own
 * preconditions, not a guess about how the server will answer.
 */
export function preSendVerificationReviewState(
  refusal: PreSendVerificationRefusal | null,
  context: {
    applicationId: string | null;
    jdText: string | null | undefined;
    /** The Tracker row the rebuilt packet must land on, or null when this page cannot name it. */
    canonicalApplicationId: string | null | undefined;
    /** The posting link the rebuild is tailored for, from the Tracker row or the frozen review. */
    portalUrl: string | null | undefined;
    rebuilding: boolean;
  },
): PreSendVerificationReviewState | null {
  if (!refusal || !context.applicationId || refusal.applicationId !== context.applicationId) return null;
  const hasJd = Boolean(context.jdText && context.jdText.trim().length > 0);
  const hasRow = Boolean(context.canonicalApplicationId && context.canonicalApplicationId.trim().length > 0);
  const hasPortalUrl = isHttpsJobUrl(context.portalUrl ?? "");
  /* Ordered by what the applicant can do about it. A missing job description is a property of the
     packet, a missing row is a property of how this screen was reached, and the link is the one the
     request is refused on last. Only one sentence is shown, so it must be the first true one. */
  const blocked = !hasJd
    ? PRE_SEND_VERIFICATION_NO_JD
    : !hasRow
      ? PRE_SEND_VERIFICATION_NO_TRACKER_ROW
      : !hasPortalUrl
        ? PRE_SEND_VERIFICATION_NO_PORTAL_URL
        : null;
  return {
    sendDisabled: true,
    message: refusal.message,
    issues: refusal.issues.length > 0 ? refusal.issues : [PRE_SEND_VERIFICATION_UNNAMED_ISSUE],
    rebuildAvailable: blocked === null && !context.rebuilding,
    rebuildBlockedReason: blocked,
    rebuildInProgress: context.rebuilding,
  };
}
