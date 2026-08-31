import type { ApplicationReview, AuthoritativeSubmissionProjection } from "../../../lib/api.ts";
import {
  authoritativeSubmissionProjectionFromUnknown,
  confirmedProjectionForIdentity,
  reviewClaimsSubmissionSent,
  submissionProjectionNeedsRepair,
  type SubmissionProjectionIdentity,
} from "./submission-projection.ts";
import { packetAuditIdentityMatches } from "./packet-audit-display.ts";
import { submissionRetrySafetyAllowsRetry, submissionReviewPacketIdentity } from "./submission-state.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_STATUSES = new Set([
  "resume_ready",
  "questions_ready",
  "ready_to_submit",
  "submit_requested",
  "preparing",
  "filling",
  "needs_attention",
  "ready_for_final_approval",
  "awaiting_security_code",
  "submitting",
  "submission_claimed",
  "submitted",
  "failed",
]);

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function applicationReviewFromUnknown(value: unknown): ApplicationReview | null {
  const review = record(value);
  return review
    && typeof review.jd_text === "string"
    && typeof review.status === "string"
    && REVIEW_STATUSES.has(review.status)
    && typeof review.updated_at === "string"
    && review.updated_at.trim().length > 0
    ? review as unknown as ApplicationReview
    : null;
}

/** Runtime shape required before a mutation response may enter dashboard submission state. */
export function submissionMutationResponseMatchesApplication(
  value: unknown,
  expectedApplicationId: string,
): value is { application_id: string; review: ApplicationReview } & UnknownRecord {
  const response = record(value);
  return UUID.test(expectedApplicationId)
    && response?.application_id === expectedApplicationId
    && applicationReviewFromUnknown(response.review) !== null;
}

export type ManagedPrepareAuthorityEnvelope = {
  application_id: string;
  packet_id: string;
  state: "preparing" | "ready_for_review" | "needs_attention";
  review: ApplicationReview;
  reused: boolean;
};

/**
 * Parses the managed prepare response and binds its review proof to the generated packet.
 * The canonical application link is checked after the dashboard loads the canonical row below.
 */
export function managedPrepareAuthorityEnvelopeFromUnknown(
  value: unknown,
): ManagedPrepareAuthorityEnvelope | null {
  const response = record(value);
  const applicationId = response?.application_id;
  const packetId = response?.packet_id;
  const review = applicationReviewFromUnknown(response?.review);
  const audit = record(record(response?.review)?.packet_audit);
  const bindings = record(audit?.bindings);
  if (!response
    || typeof applicationId !== "string"
    || !UUID.test(applicationId)
    || typeof packetId !== "string"
    || !UUID.test(packetId)
    || (response.state !== "preparing"
      && response.state !== "ready_for_review"
      && response.state !== "needs_attention")
    || typeof response.reused !== "boolean"
    || !review
    || bindings?.applicationId !== packetId) return null;
  return {
    application_id: applicationId,
    packet_id: packetId,
    state: response.state,
    review,
    reused: response.reused,
  };
}

type CanonicalPrepareBinding = {
  id: string;
  legacy_generated_resume_id?: string | null;
};

type PacketPrepareBinding = {
  id: string;
  spec?: { _review?: unknown };
};

/**
 * Proves the response's canonical id, packet id, and immutable review audit all name one packet.
 * This runs before the response review is overlaid onto local history.
 */
export function managedPrepareAuthorityMatchesPacket(
  response: ManagedPrepareAuthorityEnvelope,
  expectedApplicationId: string | null | undefined,
  canonicalApplication: CanonicalPrepareBinding | null | undefined,
  packet: PacketPrepareBinding | null | undefined,
): boolean {
  if ((expectedApplicationId && response.application_id !== expectedApplicationId)
    || canonicalApplication?.id !== response.application_id
    || canonicalApplication.legacy_generated_resume_id !== response.packet_id
    || packet?.id !== response.packet_id) return false;
  const storedReview = packet.spec?._review;
  if (!storedReview || typeof storedReview !== "object") return false;
  const responseAudit = response.review.packet_audit;
  const storedAudit = (storedReview as { packet_audit?: unknown }).packet_audit;
  return packetAuditIdentityMatches(responseAudit, storedAudit)
    && submissionReviewPacketIdentity(response.review) === submissionReviewPacketIdentity(storedReview);
}

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
