/* THE SEND LITOS HELD ON PURPOSE, IN WORDS SHE CAN ACT ON.
 *
 * Measured 2026-09-07 on the live Lever sends. The secure browser reached the send control, bound
 * it, and then declined to press it because a required answer could not be confirmed. Two facts
 * about that run existed and reached nobody who could use them:
 *
 *   1. WHICH FIELD. The failing control's own employer label sat inside the runner's required-field
 *      proof. The dashboard said only that Litos "could not confirm one of the required answers",
 *      and three further presses were spent guessing which one.
 *   2. WHY SHE WAS NEVER OFFERED THE CHALLENGE. When the run asks for the human-verification
 *      channel and the channel declines to hand her the frame, it records its own reason. That
 *      reason went to the server's logs only, so a refused challenge looked exactly like a form
 *      with no challenge on it.
 *
 * Both now ride on `review.press_withheld`. This module turns them into plain language and nothing
 * else: no fetch, no state, so the wording can be pinned by a test without rendering the screen.
 *
 * PLAIN LANGUAGE, NOT THE ENUM. `closedReason` is an internal vocabulary shared with the runner
 * ("challenge_not_ready", "capture_failed"). Rendering it raw would put a debug token in front of an
 * applicant. Each one is mapped to a sentence that says what happened and what, if anything, she can
 * do; an unrecognised reason falls back to a neutral sentence rather than being shown as a token.
 */

/** The labels the notice names one by one before it starts counting the rest. */
export const PRESS_WITHHELD_NAMED_LABELS = 3;

/**
 * The human-verification channel's reasons, mirrored from the backend's own
 * DASHBOARD_HUMAN_VERIFICATION_REASONS, which mirrors the runner's. A reason missing here renders
 * the neutral fallback, never the raw token.
 */
export const HUMAN_VERIFICATION_REASON_COPY: Readonly<Record<string, string>> = Object.freeze({
  challenge_not_ready:
    "The company's human check had not finished loading before Litos ran out of time to show it to you, so there was nothing to hand you.",
  ambiguous_challenge:
    "Litos could not tell which part of the page was the company's human check, so it did not show you any of it.",
  original_frame_lost:
    "The company's human check disappeared from the page while Litos was passing it to you.",
  frame_moved:
    "The company's human check moved on the page while Litos was passing it to you.",
  expired: "The window for finishing the company's human check inside Litos ran out.",
  capture_failed: "Litos could not take a clear picture of the company's human check to show you.",
  snapshot_failed: "Litos could not take a clear picture of the company's human check to show you.",
  authorization_refused:
    "Litos stopped short of the company's human check because the send was no longer authorised.",
  submit_not_pressed:
    "Litos never reached the company's human check, because it stopped before pressing send.",
  required_fields_unconfirmed:
    "Litos never reached the company's human check, because a required answer stopped it first.",
  transport_not_authorized:
    "Litos never reached the company's human check, because the send itself was not cleared to go.",
  continuation_phase:
    "The company's human check belonged to an earlier step of this send, so it was not offered again.",
});

const NEUTRAL_HUMAN_VERIFICATION_COPY =
  "Litos could not hand you this company's human check, so it stopped rather than guess at it.";

export type PressWithheld = {
  labels?: string[];
  human_verification?: string;
  at?: string;
};

/** The labels worth showing, trimmed, deduped and bounded. Empty when the run attributed none. */
export function pressWithheldLabels(withheld: PressWithheld | undefined | null): string[] {
  if (!withheld || !Array.isArray(withheld.labels)) return [];
  const seen = new Set<string>();
  for (const label of withheld.labels) {
    if (typeof label !== "string") continue;
    const text = label.trim();
    if (text) seen.add(text);
  }
  return [...seen];
}

/**
 * The one-line headline: which field the form is still waiting on.
 *
 * Deliberately the same shape as the backend's own sentence, so the card and the attention_reason
 * beneath it say the same thing rather than two things about one event.
 */
export function pressWithheldHeadline(labels: readonly string[]): string {
  const named = labels.slice(0, PRESS_WITHHELD_NAMED_LABELS);
  const rest = labels.length - named.length;
  if (named.length === 0) {
    return "The company's form still marks a required answer as missing, so Litos did not send it.";
  }
  const list =
    named.length === 1
      ? `“${named[0]}”`
      : `${named.slice(0, -1).map((label) => `“${label}”`).join(", ")} and “${named[named.length - 1]}”`;
  const more = rest > 0 ? `, and ${rest} more field${rest === 1 ? "" : "s"}` : "";
  return `The company's form still marks ${list}${more} as required and unanswered, so Litos did not send it.`;
}

/** What happened with the company's own human check, in a sentence, or null when it never came up. */
export function pressWithheldHumanVerificationCopy(
  withheld: PressWithheld | undefined | null,
): string | null {
  const reason = withheld?.human_verification;
  if (typeof reason !== "string" || !reason.trim()) return null;
  return HUMAN_VERIFICATION_REASON_COPY[reason] ?? NEUTRAL_HUMAN_VERIFICATION_COPY;
}

/** The reassurance every withheld send owes: nothing was sent, so there is nothing to hunt for. */
export const PRESS_WITHHELD_NOTHING_SENT =
  "Nothing went to the company, so there is no confirmation to look for.";
