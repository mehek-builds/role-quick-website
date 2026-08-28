import {
  submissionRetrySafetyAllowsRetry,
  submissionRetrySafetyFromUnknown,
} from "./submission-state.ts";
import { attendedHandoffCapabilityFromUnknown } from "./attended-handoff-capability.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AttendedManualAttemptIdentity = {
  attemptId: string;
};

export type AttendedManualRecovery = AttendedManualAttemptIdentity & {
  leaseId: string;
  activationId: string;
};

type AttendedManualSubmissionLike = {
  manual_attempt_id?: string | null;
  boundary_lease_id?: string | null;
  boundary_activation_id?: string | null;
  manual_handoff_resume_available?: boolean | null;
  retry_safety?: unknown;
  attended_handoff_capability?: unknown;
  review: { submission_claim_id?: string | null };
};

/** Positive outcome identity survives expiry and does not depend on replay credentials. */
export function attendedManualAttemptIdentity(
  submission: AttendedManualSubmissionLike,
): AttendedManualAttemptIdentity | null {
  const attemptId = submission.manual_attempt_id?.trim();
  if (!attemptId || !UUID_PATTERN.test(attemptId)) return null;
  if (submission.review.submission_claim_id !== attemptId) return null;
  const safety = submissionRetrySafetyFromUnknown(submission.retry_safety);
  if (safety?.kind !== "blocked_unverified"
    || safety.attemptId !== attemptId
    || !attendedHandoffCapabilityFromUnknown(submission.attended_handoff_capability)) return null;
  return { attemptId };
}

/** Replay additionally requires a complete, exact, active lease and activation tuple. */
export function activeAttendedManualRecovery(
  submission: AttendedManualSubmissionLike,
  now = Date.now(),
): AttendedManualRecovery | null {
  const identity = attendedManualAttemptIdentity(submission);
  const leaseId = submission.boundary_lease_id?.trim();
  const activationId = submission.boundary_activation_id?.trim();
  const safety = submissionRetrySafetyFromUnknown(submission.retry_safety);
  if (!identity
    || !leaseId
    || !activationId
    || !UUID_PATTERN.test(leaseId)
    || !UUID_PATTERN.test(activationId)
    || submission.manual_handoff_resume_available !== true
    || safety?.kind !== "blocked_unverified"
    || safety.reason !== "boundary_authorized"
    || safety.leaseId !== leaseId
    || Date.parse(safety.expiresAt) <= now) return null;
  return { ...identity, leaseId, activationId };
}

export function activeAttendedManualAttemptId(
  submission: AttendedManualSubmissionLike,
): string | null {
  return attendedManualAttemptIdentity(submission)?.attemptId ?? null;
}

export type AttendedHandoffRequestVersion = {
  applicationId: string;
  token: string;
  contextGeneration: number;
  publicationGeneration: number;
  editorRevision: number;
  mutationGeneration: number;
  packetIdentity: string;
};

export type AttendedHandoffCurrentVersion = {
  applicationId: string | null;
  token: string | null;
  contextGeneration: number;
  publicationGeneration: number;
  editorRevision: number;
  mutationGeneration: number;
  packetIdentity: string;
  terminal: boolean;
};

export type AttendedHandoffAuthorizationDisposition = "discard" | "store" | "navigate";

export type AttendedHandoffBoundaryLock = {
  kind: "opener" | "outcome";
  token: string;
};

export function beginAttendedHandoffOpenerLock(
  locks: Map<string, AttendedHandoffBoundaryLock>,
  applicationId: string,
  token: string,
): boolean {
  if (locks.has(applicationId)) return false;
  locks.set(applicationId, { kind: "opener", token });
  return true;
}

/** A terminal outcome supersedes an opener, then blocks every later boundary action until settled. */
export function beginAttendedHandoffOutcomeLock(
  locks: Map<string, AttendedHandoffBoundaryLock>,
  applicationId: string,
  token: string,
): boolean {
  if (locks.get(applicationId)?.kind === "outcome") return false;
  locks.set(applicationId, { kind: "outcome", token });
  return true;
}

export function attendedHandoffBoundaryLockToken(
  locks: ReadonlyMap<string, AttendedHandoffBoundaryLock>,
  applicationId: string,
): string | null {
  return locks.get(applicationId)?.token ?? null;
}

export function finishAttendedHandoffBoundaryLock(
  locks: Map<string, AttendedHandoffBoundaryLock>,
  applicationId: string,
  token: string,
): boolean {
  if (locks.get(applicationId)?.token !== token) return false;
  locks.delete(applicationId);
  return true;
}

/** A new self-submit opener needs a safe ledger fold; only an exact active tuple may replay. */
export function attendedSelfSubmitMayOpen(
  retrySafety: unknown,
  hasExactActiveRecovery: boolean,
): boolean {
  return hasExactActiveRecovery || submissionRetrySafetyAllowsRetry(retrySafety);
}

/** A raw employer link is legacy-only and disappears whenever the server declares a capability. */
export function legacyEmployerFallbackMayRender(
  retrySafety: unknown,
  attendedCapability: unknown,
): boolean {
  return attendedCapability === undefined && submissionRetrySafetyAllowsRetry(retrySafety);
}

function strictUtcTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

/** Runtime proof for the older managed-run yes/no resolution route. */
export function unverifiedSubmissionOutcomeResponseMatches(
  response: unknown,
  applicationId: string,
  attemptId: string,
  found: boolean,
): boolean {
  if (!response || typeof response !== "object") return false;
  const candidate = response as Record<string, unknown>;
  if (candidate.application_id !== applicationId
    || !candidate.review
    || typeof candidate.review !== "object") return false;
  const review = candidate.review as Record<string, unknown>;
  const safety = submissionRetrySafetyFromUnknown(candidate.retry_safety);
  const unverified = review.unverified_submission;
  if (!safety
    || safety.kind === "no_evidence"
    || safety.attemptId !== attemptId
    || !unverified
    || typeof unverified !== "object") return false;
  const resolution = unverified as Record<string, unknown>;
  if (!strictUtcTimestamp(resolution.resolved_at)) return false;
  if (found) {
    return resolution.resolution === "sent"
      && resolution.resolved_at === (safety.kind === "blocked_confirmed" ? safety.confirmedAt : null)
      && attendedHandoffOutcomeResponseMatches(response, applicationId, attemptId, "submitted");
  }
  return review.status === "needs_attention"
    && review.submission_claim_id == null
    && resolution.resolution === "not_sent"
    && safety.kind === "safe_not_sent"
    && safety.proofKind === "applicant_checked_not_sent"
    && resolution.resolved_at === safety.resolvedAt;
}

function isUrlShapedField(key: string): boolean {
  const compact = key.replace(/[-_]/g, "").toLowerCase();
  return compact.endsWith("url")
    || compact.endsWith("urls")
    || compact.endsWith("uri")
    || compact.endsWith("uris")
    || compact.endsWith("href")
    || compact.endsWith("hrefs")
    || compact.endsWith("link")
    || compact.endsWith("links");
}

function withoutUrlShapedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUrlShapedFields);
  if (!value || typeof value !== "object") return value;
  const projected: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isUrlShapedField(key)) continue;
    projected[key] = withoutUrlShapedFields(entry);
  }
  return projected;
}

/**
 * A negative outcome is retryable, so its direct response must not itself expose a retry path.
 * The next passive GET can install a fresh URL-free capability after it strips employer URLs.
 */
export function failClosedUnverifiedNotSentResponse<T extends object>(
  response: T,
): T & { attended_handoff_capability: null } {
  const projected = withoutUrlShapedFields(response) as Record<string, unknown>;
  delete projected.manual_attempt_id;
  delete projected.boundary_lease_id;
  delete projected.boundary_activation_id;
  delete projected.manual_handoff_resume_available;
  return {
    ...projected,
    attended_handoff_capability: null,
  } as T & { attended_handoff_capability: null };
}

/** Runtime proof that an outcome mutation settled the exact application and attempt requested. */
export function attendedHandoffOutcomeResponseMatches(
  response: unknown,
  applicationId: string,
  attemptId: string,
  outcome: "cleared" | "submitted",
): boolean {
  if (!response || typeof response !== "object") return false;
  const candidate = response as Record<string, unknown>;
  if (candidate.application_id !== applicationId
    || !candidate.review
    || typeof candidate.review !== "object") return false;
  const review = candidate.review as Record<string, unknown>;
  const safety = submissionRetrySafetyFromUnknown(candidate.retry_safety);
  if (!safety || safety.kind === "no_evidence" || safety.attemptId !== attemptId) return false;
  if (outcome === "submitted") {
    if (review.status !== "submitted"
      || safety.kind !== "blocked_confirmed"
      || !review.receipt
      || typeof review.receipt !== "object") return false;
    const receipt = review.receipt as Record<string, unknown>;
    if (receipt.source !== "attended_handoff"
      || typeof receipt.confirmation_text !== "string"
      || !receipt.confirmation_text.trim()
      || typeof receipt.captured_at !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.captured_at)
      || Number.isNaN(Date.parse(receipt.captured_at))
      || typeof receipt.final_url !== "string") return false;
    try {
      const finalUrl = new URL(receipt.final_url);
      return finalUrl.protocol === "https:"
        && Boolean(finalUrl.hostname)
        && !finalUrl.username
        && !finalUrl.password;
    } catch {
      return false;
    }
  }
  return review.status === "ready_for_final_approval"
    && review.submission_claim_id == null
    && safety.kind === "safe_not_sent";
}

/**
 * Decide what a delayed employer-boundary response may do.
 *
 * A newer packet, mutation, or publication owns the application and discards the old response.
 * A selection round trip may retain one exact authorized recovery tuple for its application, but
 * it never lets the old tab navigate. Only the unchanged click context may open the employer URL.
 */
export function attendedHandoffAuthorizationDisposition(input: {
  request: AttendedHandoffRequestVersion;
  current: AttendedHandoffCurrentVersion;
  arrivedLate: boolean;
  publicationEquivalent?: boolean;
}): AttendedHandoffAuthorizationDisposition {
  const { request, current } = input;
  if (current.token !== request.token
    || (current.publicationGeneration !== request.publicationGeneration
      && input.publicationEquivalent !== true)
    || current.packetIdentity !== request.packetIdentity
    || current.terminal) return "discard";
  if (input.arrivedLate
    || current.applicationId !== request.applicationId
    || current.contextGeneration !== request.contextGeneration) return "store";
  if (current.editorRevision !== request.editorRevision
    || current.mutationGeneration !== request.mutationGeneration) return "discard";
  return "navigate";
}

/** An outcome may publish only while the exact click context still owns the application. */
export function attendedHandoffOutcomeMayPublish(input: {
  request: AttendedHandoffRequestVersion;
  current: AttendedHandoffCurrentVersion;
}): boolean {
  return attendedHandoffAuthorizationDisposition({
    ...input,
    arrivedLate: false,
  }) === "navigate";
}
