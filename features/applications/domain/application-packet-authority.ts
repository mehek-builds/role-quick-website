import type { ApplicationReview, AuthoritativeSubmissionProjection } from "../../../lib/api.ts";
import {
  authoritativeSubmissionProjectionFromUnknown,
  confirmedProjectionForIdentity,
  reviewClaimsSubmissionSent,
  submissionProjectionNeedsRepair,
  type SubmissionProjectionIdentity,
} from "./submission-projection.ts";
import { submissionRetrySafetyAllowsRetry } from "./submission-state.ts";

export type ApplicationPacketAuthorityState =
  | {
    state: "confirmed";
    projection: Extract<AuthoritativeSubmissionProjection, { state: "confirmed" }>;
  }
  | { state: "safe_not_sent" }
  | { state: "uncertain"; receiptNeedsRepair: boolean };

/**
 * The packet modal authorizes a negative only from the complete server authority envelope.
 * Projection state `none` alone cannot distinguish no attempt from a torn or sanitized Sent row.
 * Missing, malformed, unverified, repair, identity-mismatched, and quarantined states stay blocked.
 */
export function applicationPacketAuthorityState(
  value: unknown,
  identity: SubmissionProjectionIdentity,
  review?: ApplicationReview,
  retrySafety?: unknown,
  authorityQuarantined = false,
): ApplicationPacketAuthorityState {
  const projection = authoritativeSubmissionProjectionFromUnknown(value);
  const confirmed = confirmedProjectionForIdentity(projection, {
    ...identity,
    retrySafety: retrySafety ?? null,
  });
  if (confirmed) {
    return { state: "confirmed", projection: confirmed };
  }
  const mutableSentClaim = review ? reviewClaimsSubmissionSent(review) : false;
  if (projection?.state === "none"
    && submissionRetrySafetyAllowsRetry(retrySafety)
    && !mutableSentClaim
    && !authorityQuarantined) return { state: "safe_not_sent" };
  return {
    state: "uncertain",
    receiptNeedsRepair: projection?.state === "repair_required"
      && submissionProjectionNeedsRepair(projection, identity),
  };
}
