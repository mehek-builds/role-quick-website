/**
 * Which send refusals the autopilot must stop retrying.
 *
 * A packet audit refusal is not transient. Clearing one needs a fresh audit and a NEW
 * acknowledgement, and that acknowledgement is the applicant's own act: the backend's
 * /applications/:id/packet-audit/acknowledge states it "must never be preceded by a machine-written
 * one". An unattended re-acknowledge would therefore forge her review of a PDF she never saw, on
 * the one path that reaches an employer with nobody in between. So the autopilot cannot fix these,
 * and the only correct response is to leave the row for the review screen and move to the next one.
 *
 * KEYED ON `code`, NEVER ON THE MESSAGE. The sentence is copy and will be reworded; matching it is
 * how a raw `packet_stale` ended up on screen in the first place.
 */
const AUTOPILOT_CANNOT_CLEAR = new Set([
  /* The packet moved after she approved it. A re-audit CAN clear this one, but only with her
     acknowledgement attached, which is exactly what an unattended send does not have. */
  "PACKET_AUDIT_STALE",
  /* Never acknowledged. Same recovery, same reason it is not the autopilot's to perform. */
  "PACKET_AUDIT_ACK_REQUIRED",
  /* No audit yet at all. */
  "PACKET_AUDIT_REQUIRED",
  /* The file is not a packet Litos can stand behind, or aged out of retention. Both need a
     regenerate, which is a different screen and a different act. */
  "PACKET_PDF_INVALID",
  "PACKET_RESUME_EXPIRED",
]);

const REVIEW_RECOVERY_REQUIRED = new Set([
  "PACKET_AUDIT_STALE",
  "PACKET_AUDIT_ACK_REQUIRED",
]);

/* Historical rows predate structured refusal codes and persisted one of these values directly in
 * attention_reason. They are not applicant tasks. They are an invalidation signal that must clear
 * the old browser proof and open a new, unacknowledged packet review.
 *
 * Exact equality is deliberate. The ordinary refusal path remains code-only, and text that merely
 * resembles this copy is still treated as a real employer-form blocker. This compatibility list is
 * only for the finite wire values already written to stored applications. */
const HISTORICAL_PACKET_AUDIT_STALE_MESSAGES = new Set([
  "PACKET_AUDIT_STALE",
  "packet_stale",
  "This application changed after you approved the exact packet Litos prepared, so it was not sent.",
  "This application changed after you approved the exact packet Litos prepared, so it was not sent. Open it to review the current one and send from there.",
]);

function normalizedHistoricalMessage(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function historicalMessageValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return null;
  const data = (value as { data?: unknown }).data;
  if (typeof data === "object" && data !== null && typeof (data as { code?: unknown }).code === "string") {
    return null;
  }
  const attentionReason = (value as { attention_reason?: unknown }).attention_reason;
  if (typeof attentionReason === "string") return attentionReason;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

function isHistoricalPacketAuditStaleLine(value: string): boolean {
  return HISTORICAL_PACKET_AUDIT_STALE_MESSAGES.has(normalizedHistoricalMessage(value));
}

/** True only for a historical packet-stale value that was persisted or thrown without a code. */
export function historicalPacketAuditStaleMessage(value: unknown): boolean {
  const message = historicalMessageValue(value);
  return message !== null && message.split(/\r?\n/).some(isHistoricalPacketAuditStaleLine);
}

/**
 * Removes historical packet invalidation copy before any attention-list renderer sees it.
 *
 * An unrelated line in the same stored report is preserved. A report containing only the legacy
 * line loses its old acknowledgements too, because those ticks were keyed to evidence that no
 * longer exists. The server audit itself is not altered here. Recovery replaces its browser proof
 * with a fresh unacknowledged audit before another send can become available.
 */
export function withoutHistoricalPacketAuditStaleAttention<
  T extends { attention_reason?: string; attention_acknowledgements?: unknown },
>(review: T): T {
  const reason = review.attention_reason;
  if (!reason) return review;
  const lines = reason.split(/\r?\n/);
  const retained = lines.filter((line) => !isHistoricalPacketAuditStaleLine(line));
  if (retained.length === lines.length) return review;
  const attentionReason = retained.map((line) => line.trim()).filter(Boolean).join("\n");
  return {
    ...review,
    attention_reason: attentionReason || undefined,
    ...(attentionReason ? {} : { attention_acknowledgements: undefined }),
  };
}

/**
 * The audit code on a failed send, or null when this is not an audit refusal.
 *
 * Reads the parsed body rather than the Error, because that is where the backend puts `code`, and
 * a thrown Error's `message` is the applicant-facing sentence by design.
 */
export function auditRefusalCode(reason: unknown): string | null {
  if (typeof reason !== "object" || reason === null) return null;
  const data = (reason as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const code = (data as { code?: unknown }).code;
  if (typeof code !== "string") return null;
  return AUTOPILOT_CANNOT_CLEAR.has(code) ? code : null;
}

/** A refusal the dashboard can safely turn into a fresh, unacknowledged review packet. */
export function packetAuditReviewRecoveryCode(reason: unknown): string | null {
  const code = auditRefusalCode(reason);
  return code && REVIEW_RECOVERY_REQUIRED.has(code) ? code : null;
}

/** Structured current refusals and the finite historical rows both need a new manual review. */
export function packetAuditReviewRecoveryRequired(reason: unknown): boolean {
  return packetAuditReviewRecoveryCode(reason) !== null || historicalPacketAuditStaleMessage(reason);
}
