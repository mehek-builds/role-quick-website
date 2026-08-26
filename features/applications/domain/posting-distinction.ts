import type {
  PostingDistinctionResolutionResponse,
  PostingDistinctionRisk,
} from "../../../lib/api.ts";

const POSTING_DISTINCTION_CANDIDATE_IDENTITY_VERSION = "posting-distinction-candidate-v1" as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function exactHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) return null;
    return parsed.toString() === value ? value : null;
  } catch {
    return null;
  }
}

/**
 * Parse the only duplicate-risk response that may expose pairwise resolution controls.
 * Missing or weak identity evidence stays a refusal and routes to the historical repair panel.
 */
export function postingDistinctionRiskFromUnknown(payload: unknown): PostingDistinctionRisk | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as Record<string, unknown>;
  if (response.code !== "DUPLICATE_RISK_UNIDENTIFIABLE"
    || !response.resolution
    || typeof response.resolution !== "object") return null;
  const resolution = response.resolution as Record<string, unknown>;
  const priorPortalUrl = exactHttpsUrl(resolution.prior_portal_url);
  const candidatePortalUrl = exactHttpsUrl(resolution.candidate_portal_url);
  if (!isUuid(resolution.prior_attempt_id)
    || !isUuid(resolution.prior_packet_id)
    || !(resolution.prior_application_id === null || isUuid(resolution.prior_application_id))
    || resolution.prior_identity_exact !== true
    || !priorPortalUrl
    || !isUuid(resolution.candidate_application_id)
    || !isUuid(resolution.candidate_packet_id)
    || !candidatePortalUrl
    || resolution.candidate_identity_version !== POSTING_DISTINCTION_CANDIDATE_IDENTITY_VERSION
    || typeof resolution.candidate_identity_digest !== "string"
    || !SHA256_PATTERN.test(resolution.candidate_identity_digest)
    || typeof resolution.prior_company !== "string"
    || typeof resolution.prior_role !== "string"
    || typeof resolution.candidate_company !== "string"
    || typeof resolution.candidate_role !== "string") return null;
  return {
    prior_attempt_id: resolution.prior_attempt_id,
    prior_application_id: resolution.prior_application_id,
    prior_packet_id: resolution.prior_packet_id,
    prior_company: resolution.prior_company,
    prior_role: resolution.prior_role,
    prior_portal_url: priorPortalUrl,
    prior_identity_exact: true,
    candidate_application_id: resolution.candidate_application_id,
    candidate_packet_id: resolution.candidate_packet_id,
    candidate_company: resolution.candidate_company,
    candidate_role: resolution.candidate_role,
    candidate_portal_url: candidatePortalUrl,
    candidate_identity_version: POSTING_DISTINCTION_CANDIDATE_IDENTITY_VERSION,
    candidate_identity_digest: resolution.candidate_identity_digest,
  };
}

export type PostingDistinctionResolutionOutcome =
  | { kind: "clear" }
  | { kind: "next_risk"; risk: PostingDistinctionRisk }
  | { kind: "blocked"; message: string }
  | { kind: "invalid" };

/**
 * A distinction acknowledgement is useful only for the exact refusal snapshot that produced it.
 * Comparing the whole tuple prevents a delayed R1 response from clearing a newer R2 refusal after
 * the applicant switches away and back to the same application.
 */
export function postingDistinctionRisksEqual(
  left: PostingDistinctionRisk | null,
  right: PostingDistinctionRisk | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.prior_attempt_id === right.prior_attempt_id
    && left.prior_application_id === right.prior_application_id
    && left.prior_packet_id === right.prior_packet_id
    && left.prior_company === right.prior_company
    && left.prior_role === right.prior_role
    && left.prior_portal_url === right.prior_portal_url
    && left.prior_identity_exact === right.prior_identity_exact
    && left.candidate_application_id === right.candidate_application_id
    && left.candidate_packet_id === right.candidate_packet_id
    && left.candidate_company === right.candidate_company
    && left.candidate_role === right.candidate_role
    && left.candidate_portal_url === right.candidate_portal_url
    && left.candidate_identity_version === right.candidate_identity_version
    && left.candidate_identity_digest === right.candidate_identity_digest;
}

/** Full React identity for a resolver. Candidate digests do not include database application or
 * packet ids, so a digest-only key can reuse local confirmation state for another exact record. */
export function postingDistinctionRiskKey(risk: PostingDistinctionRisk): string {
  return JSON.stringify([
    risk.prior_attempt_id,
    risk.prior_application_id,
    risk.prior_packet_id,
    risk.prior_company,
    risk.prior_role,
    risk.prior_portal_url,
    risk.prior_identity_exact,
    risk.candidate_application_id,
    risk.candidate_packet_id,
    risk.candidate_company,
    risk.candidate_role,
    risk.candidate_portal_url,
    risk.candidate_identity_version,
    risk.candidate_identity_digest,
  ]);
}

/** A stale or malformed success response never tells the applicant the lock was cleared. */
export function postingDistinctionResolutionOutcome(
  expected: PostingDistinctionRisk,
  expectedRelationId: string,
  response: PostingDistinctionResolutionResponse,
): PostingDistinctionResolutionOutcome {
  if (!isUuid(expectedRelationId)
    || response.relation_id !== expectedRelationId
    || response.candidate_application_id !== expected.candidate_application_id
    || response.candidate_packet_id !== expected.candidate_packet_id
    || response.candidate_identity_version !== expected.candidate_identity_version
    || response.candidate_identity_digest !== expected.candidate_identity_digest) return { kind: "invalid" };
  if (response.duplicate_guard === "clear") {
    return response.remaining_risk === null ? { kind: "clear" } : { kind: "invalid" };
  }
  if (response.duplicate_guard === "unidentifiable") {
    const risk = postingDistinctionRiskFromUnknown(response.remaining_risk);
    return risk
      && risk.candidate_application_id === expected.candidate_application_id
      && risk.candidate_packet_id === expected.candidate_packet_id
      && risk.candidate_company === expected.candidate_company
      && risk.candidate_role === expected.candidate_role
      && risk.candidate_portal_url === expected.candidate_portal_url
      && risk.candidate_identity_version === expected.candidate_identity_version
      && risk.candidate_identity_digest === expected.candidate_identity_digest
      ? { kind: "next_risk", risk }
      : { kind: "invalid" };
  }
  if (response.duplicate_guard === "duplicate") {
    const remaining = response.remaining_risk;
    if (!remaining || typeof remaining !== "object") return { kind: "invalid" };
    const message = (remaining as Record<string, unknown>).error;
    return typeof message === "string" && message.trim()
      ? { kind: "blocked", message }
      : { kind: "invalid" };
  }
  return { kind: "invalid" };
}
