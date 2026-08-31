import type { AuthoritativeSubmissionProjection } from "../../../lib/api.ts";
import {
  attendedHandoffCapabilityFromUnknown,
  type AttendedHandoffCapabilityLike,
} from "./attended-handoff-capability.ts";
import {
  authoritativeSubmissionProjectionFromUnknown,
  submissionProjectionIsConfirmed,
  type SubmissionProjectionIdentity,
} from "./submission-projection.ts";
import {
  submissionRetrySafetyFromUnknown,
  type SubmissionRetrySafetyLike,
} from "./submission-state.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UnknownRecord = Record<string, unknown>;

export type SubmissionAuthorityEnvelopeContext = SubmissionProjectionIdentity & {
  applicationId: string;
  requestedApplicationId?: string;
};

type SubmissionAuthorityEnvelopeCommon = {
  schemaVersion: "submission-authority-v1";
  revision: string;
  applicationId: string;
  packetId: string | null;
  projection: AuthoritativeSubmissionProjection;
  retrySafety: SubmissionRetrySafetyLike | null;
  wire: Readonly<Record<string, unknown>>;
};

export type SubmissionAuthorityEnvelope = SubmissionAuthorityEnvelopeCommon & {
  state: "confirmed" | "unverified" | "repair_required" | "none";
};

export type AttendedBoundaryAuthorityEnvelope = SubmissionAuthorityEnvelopeCommon & {
  state: "boundary_authorized";
  retrySafety: Extract<SubmissionRetrySafetyLike, { kind: "blocked_unverified"; reason: "boundary_authorized" }>;
  attemptId: string;
  observedAt: string;
  leaseId: string;
  expiresAt: string;
  activationId: string;
  capability: AttendedHandoffCapabilityLike;
};

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function exactKeys(value: UnknownRecord, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function canonicalRevision(value: unknown): value is string {
  if (typeof value !== "string"
    || value.length > 19
    || !/^(?:0|[1-9][0-9]*)$/.test(value)) return false;
  return value.length < 19 || value <= "9223372036854775807";
}

function strictTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function exactProjectionShape(projection: AuthoritativeSubmissionProjection): boolean {
  const value = projection as unknown as UnknownRecord;
  if (projection.state === "none") return exactKeys(value, ["state"]);
  if (projection.state === "unverified") {
    return exactKeys(value, ["state", "attempt_id", "observed_at", "reason"]);
  }
  if (projection.state === "repair_required") {
    return exactKeys(value, ["state", "reasons"], [
      "attempt_id",
      "canonical_application_id",
      "packet_id",
    ]);
  }
  const receipt = record(projection.receipt);
  return exactKeys(value, [
    "state",
    "attempt_id",
    "canonical_application_id",
    "packet_id",
    "submitted_at",
    "receipt",
    "source",
    "tracker_stage",
  ])
    && Boolean(receipt)
    && exactKeys(receipt!, ["confirmation_text", "final_url", "captured_at"], ["source"]);
}

function normalizedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(normalizedJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as UnknownRecord;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${normalizedJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Stable semantic bytes for equal-revision conflict detection after JSON parsing. */
export function submissionAuthorityWireIdentity(value: unknown): string {
  return normalizedJson(value);
}

function exactStructuredMatch(left: unknown, right: unknown): boolean {
  return normalizedJson(left) === normalizedJson(right);
}

function packetIdentityMatches(
  projection: AuthoritativeSubmissionProjection,
  packetId: string | null,
): boolean {
  if (projection.state === "confirmed") return projection.packet_id === packetId;
  if (projection.state === "repair_required" && projection.packet_id !== undefined) {
    return projection.packet_id === packetId;
  }
  return true;
}

function projectionMatchesContext(
  projection: AuthoritativeSubmissionProjection,
  retrySafety: SubmissionRetrySafetyLike | null,
  context: SubmissionAuthorityEnvelopeContext,
): boolean {
  if (projection.state === "confirmed") {
    return retrySafety?.kind === "blocked_confirmed"
      && retrySafety.attemptId === projection.attempt_id
      && retrySafety.confirmedAt === projection.receipt.captured_at
      && submissionProjectionIsConfirmed(projection, context);
  }
  if (projection.state === "unverified") {
    return retrySafety?.kind === "blocked_unverified"
      && retrySafety.attemptId === projection.attempt_id
      && retrySafety.at === projection.observed_at
      && retrySafety.reason === projection.reason
      && (context.attemptId === undefined || context.attemptId === projection.attempt_id);
  }
  if (projection.state === "repair_required") {
    if (retrySafety?.kind === "no_evidence" || retrySafety?.kind === "safe_not_sent") return false;
    if (context.attemptId !== undefined
      && projection.attempt_id !== undefined
      && projection.attempt_id !== context.attemptId) return false;
    if (retrySafety !== null
      && context.attemptId !== undefined
      && retrySafety.attemptId !== context.attemptId) return false;
    if (retrySafety !== null
      && projection.attempt_id !== undefined
      && projection.attempt_id !== retrySafety.attemptId) return false;
    if (context.canonicalApplicationId !== undefined
      && projection.canonical_application_id !== undefined
      && projection.canonical_application_id !== context.canonicalApplicationId) return false;
    return context.packetId === undefined
      || projection.packet_id === undefined
      || projection.packet_id === context.packetId;
  }
  if (context.attemptId !== undefined) {
    return retrySafety?.kind === "safe_not_sent" && retrySafety.attemptId === context.attemptId;
  }
  return retrySafety?.kind === "no_evidence" || retrySafety?.kind === "safe_not_sent";
}

function topLevelCompatibilityMatches(
  candidate: UnknownRecord,
  authority: UnknownRecord,
  context: SubmissionAuthorityEnvelopeContext,
): boolean {
  if (Object.prototype.hasOwnProperty.call(candidate, "application_id")
    && candidate.application_id !== (context.requestedApplicationId ?? authority.application_id)) return false;
  if (context.requestedApplicationId !== undefined
    && candidate.requested_application_id !== context.requestedApplicationId) return false;
  if (Object.prototype.hasOwnProperty.call(candidate, "requested_application_id")
    && (context.requestedApplicationId === undefined
      || candidate.requested_application_id !== context.requestedApplicationId)) return false;
  if (Object.prototype.hasOwnProperty.call(candidate, "canonical_application_id")
    && (context.canonicalApplicationId === undefined
      || candidate.canonical_application_id !== context.canonicalApplicationId)) return false;
  if (Object.prototype.hasOwnProperty.call(candidate, "packet_id")
    && candidate.packet_id !== authority.packet_id) return false;
  if (Object.prototype.hasOwnProperty.call(candidate, "submission_projection")
    && !exactStructuredMatch(candidate.submission_projection, authority.projection)) return false;
  if (Object.prototype.hasOwnProperty.call(candidate, "retry_safety")
    && !exactStructuredMatch(candidate.retry_safety, authority.retry_safety)) return false;
  return true;
}

/**
 * Parses projection and retry authority as one indivisible response value.
 *
 * A retry verdict is never installed by itself. Its sibling projection must be structurally valid,
 * identify the requested packet or canonical application, and describe the same immutable attempt.
 */
export function submissionAuthorityEnvelopeFromUnknown(
  value: unknown,
  context: SubmissionAuthorityEnvelopeContext,
): SubmissionAuthorityEnvelope | AttendedBoundaryAuthorityEnvelope | null {
  const candidate = record(value);
  const authority = record(candidate?.submission_authority);
  if (!candidate
    || !authority
    || !UUID.test(context.applicationId)
    || authority.schema_version !== "submission-authority-v1"
    || !canonicalRevision(authority.revision)
    || authority.application_id !== context.applicationId
    || (authority.packet_id !== null
      && (typeof authority.packet_id !== "string" || !UUID.test(authority.packet_id)))
    || (context.packetId !== undefined && authority.packet_id !== context.packetId)
    || (authority.state !== "confirmed"
      && authority.state !== "unverified"
      && authority.state !== "repair_required"
      && authority.state !== "none"
      && authority.state !== "boundary_authorized")) return null;
  const projection = authoritativeSubmissionProjectionFromUnknown(authority.projection);
  const retrySafety = authority.retry_safety === null
    ? null
    : submissionRetrySafetyFromUnknown(authority.retry_safety);
  if (!projection
    || !exactProjectionShape(projection)
    || (authority.retry_safety !== null && !retrySafety)
    || !packetIdentityMatches(projection, authority.packet_id)
    || !projectionMatchesContext(projection, retrySafety, context)
    || !topLevelCompatibilityMatches(candidate, authority, context)) return null;

  const commonKeys = [
    "schema_version",
    "revision",
    "state",
    "application_id",
    "packet_id",
    "projection",
    "retry_safety",
  ] as const;
  if (authority.state === "boundary_authorized") {
    if (!exactKeys(authority, [...commonKeys,
      "attempt_id",
      "observed_at",
      "lease_id",
      "expires_at",
      "activation_id",
      "capability",
    ])) return null;
    const capability = attendedHandoffCapabilityFromUnknown(authority.capability);
    if (!capability
      || !exactKeys(authority.capability as UnknownRecord, [
        "version",
        "kind",
        "capability_sha256",
        "url_sha256",
      ])
      || projection.state !== "unverified"
      || projection.reason !== "boundary_authorized"
      || retrySafety?.kind !== "blocked_unverified"
      || retrySafety.reason !== "boundary_authorized"
      || authority.attempt_id !== projection.attempt_id
      || authority.attempt_id !== retrySafety.attemptId
      || authority.observed_at !== projection.observed_at
      || authority.observed_at !== retrySafety.at
      || authority.lease_id !== retrySafety.leaseId
      || authority.expires_at !== retrySafety.expiresAt
      || !strictTimestamp(authority.observed_at)
      || !strictTimestamp(authority.expires_at)
      || typeof authority.activation_id !== "string"
      || !UUID.test(authority.activation_id)) return null;
    return {
      schemaVersion: "submission-authority-v1",
      revision: authority.revision as string,
      state: "boundary_authorized",
      applicationId: context.applicationId,
      packetId: authority.packet_id as string | null,
      projection,
      retrySafety,
      wire: authority,
      attemptId: authority.attempt_id as string,
      observedAt: authority.observed_at as string,
      leaseId: authority.lease_id as string,
      expiresAt: authority.expires_at as string,
      activationId: authority.activation_id,
      capability,
    };
  }
  if (!exactKeys(authority, commonKeys)) return null;
  if (authority.state === "confirmed" && (projection.state !== "confirmed" || retrySafety?.kind !== "blocked_confirmed")) return null;
  if (authority.state === "unverified"
    && (projection.state !== "unverified"
      || projection.reason === "boundary_authorized"
      || retrySafety?.kind !== "blocked_unverified")) return null;
  if (authority.state === "repair_required"
    && (projection.state !== "repair_required"
      || (retrySafety !== null
        && retrySafety.kind !== "blocked_unverified"
        && retrySafety.kind !== "blocked_confirmed"))) return null;
  if (authority.state === "none"
    && (projection.state !== "none"
      || (retrySafety?.kind !== "no_evidence" && retrySafety?.kind !== "safe_not_sent"))) return null;
  if (authority.state !== projection.state) return null;
  return {
    schemaVersion: "submission-authority-v1",
    revision: authority.revision as string,
    state: authority.state,
    applicationId: context.applicationId,
    packetId: authority.packet_id as string | null,
    projection,
    retrySafety,
    wire: authority,
  };
}

/** Parse one passive collection's authority revision. Build revisions are deploy metadata only. */
export function submissionAuthorityCollectionRevisionFromUnknown(value: unknown): string | null {
  const candidate = record(value);
  if (!candidate
    || candidate.schema_version !== "submission-authority-v1"
    || !canonicalRevision(candidate.submission_authority_revision)) return null;
  return candidate.submission_authority_revision;
}

/** Every item in one passive snapshot must carry the collection's exact authority revision. */
export function submissionAuthorityMatchesCollectionRevision(
  value: unknown,
  revision: string,
): boolean {
  const candidate = record(value);
  const authority = record(candidate?.submission_authority);
  return canonicalRevision(revision) && authority?.revision === revision;
}

/** One explicit public state for an incomplete failure response. */
export function quarantinedSubmissionAuthority(
  context: SubmissionAuthorityEnvelopeContext,
): { projection: AuthoritativeSubmissionProjection; retrySafety: null } {
  return {
    projection: {
      state: "repair_required",
      ...(context.attemptId ? { attempt_id: context.attemptId } : {}),
      ...(context.canonicalApplicationId
        ? { canonical_application_id: context.canonicalApplicationId }
        : {}),
      ...(context.packetId !== undefined ? { packet_id: context.packetId } : {}),
      reasons: ["canonical_projection_incomplete"],
    },
    retrySafety: null,
  };
}

/**
 * Exact unverified authority required before any attended employer capability can be exposed.
 */
export function attendedBoundaryAuthorityEnvelopeFromUnknown(
  value: unknown,
  applicationId: string,
  now = Date.now(),
): AttendedBoundaryAuthorityEnvelope | null {
  const candidate = record(value);
  const attemptId = candidate?.manual_attempt_id;
  const leaseId = candidate?.boundary_lease_id;
  const activationId = candidate?.boundary_activation_id;
  const review = record(candidate?.review);
  if (!candidate
    || typeof attemptId !== "string"
    || typeof leaseId !== "string"
    || typeof activationId !== "string"
    || !UUID.test(attemptId)
    || !UUID.test(leaseId)
    || !UUID.test(activationId)
    || candidate.manual_handoff_resume_available !== true
    || review?.submission_claim_id !== attemptId) return null;
  const authority = submissionAuthorityEnvelopeFromUnknown(candidate, {
    applicationId,
    packetId: applicationId,
    attemptId,
  });
  if (!authority
    || authority.state !== "boundary_authorized"
    || authority.attemptId !== attemptId
    || authority.leaseId !== leaseId
    || authority.activationId !== activationId
    || !exactStructuredMatch(authority.capability, candidate.attended_handoff_capability)
    || Date.parse(authority.retrySafety.expiresAt) <= now) return null;
  return authority;
}
