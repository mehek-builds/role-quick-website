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
