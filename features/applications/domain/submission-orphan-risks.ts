import type { SubmissionOrphanRisk } from "@/lib/api";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASONS = new Set([
  "opened",
  "boundary_authorized",
  "pressed",
  "invalid_sequence",
  "confirmed_unattributed",
  "attributed_confirmed",
  "blanket_not_sent",
]);

function riskFromUnknown(value: unknown): SubmissionOrphanRisk | null {
  if (!value || typeof value !== "object") return null;
  const risk = value as Record<string, unknown>;
  if (typeof risk.attempt_id !== "string" || !UUID_PATTERN.test(risk.attempt_id)
    || typeof risk.packet_id !== "string" || !UUID_PATTERN.test(risk.packet_id)
    || typeof risk.company !== "string"
    || typeof risk.role !== "string"
    || typeof risk.observed_at !== "string" || !Number.isFinite(Date.parse(risk.observed_at))
    || typeof risk.reason !== "string" || !REASONS.has(risk.reason)
    || (risk.scope !== "posting" && risk.scope !== "user")
    || typeof risk.blocks_sends !== "boolean"
    || typeof risk.resolution_available !== "boolean") return null;
  return risk as SubmissionOrphanRisk;
}

/** Malformed risk history is a load failure, never an empty list that hides a duplicate lock. */
export function submissionOrphanRisksFromUnknown(payload: unknown): SubmissionOrphanRisk[] | null {
  if (!payload || typeof payload !== "object") return null;
  const risks = (payload as { risks?: unknown }).risks;
  if (!Array.isArray(risks)) return null;
  const parsed = risks.map(riskFromUnknown);
  return parsed.every((risk): risk is SubmissionOrphanRisk => risk !== null) ? parsed : null;
}

export function submissionOrphanResolutionMatches(
  requestedAttemptId: string,
  found: boolean,
  response: unknown,
): boolean {
  if (!response || typeof response !== "object") return false;
  const result = response as Record<string, unknown>;
  if (result.attempt_id !== requestedAttemptId
    || result.resolution !== (found ? "found" : "not_found")
    || !result.retry_safety
    || typeof result.retry_safety !== "object") return false;
  const safety = result.retry_safety as Record<string, unknown>;
  if (safety.attemptId !== requestedAttemptId) return false;
  if (found) return safety.kind === "blocked_confirmed";
  return safety.kind === "safe_not_sent"
    && (safety.proofKind === "applicant_checked_not_sent"
      || safety.proofKind === "applicant_checked_all_possible_destinations_not_sent");
}

/** Resolution controls are server-authorized. A user-wide record is not a special bypass. */
export function submissionOrphanResolutionControlsAvailable(risk: SubmissionOrphanRisk): boolean {
  return risk.resolution_available && risk.reason !== "attributed_confirmed";
}

/** A late response for one attempt may never remove another attempt's warning. */
export function withoutResolvedSubmissionOrphanRisk(
  current: readonly SubmissionOrphanRisk[],
  attemptId: string,
): SubmissionOrphanRisk[] {
  return current.filter((risk) => risk.attempt_id !== attemptId);
}
