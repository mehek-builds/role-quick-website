export type PacketAuditAcknowledgementResponse = {
  acknowledged: true;
};

export function packetAuditAcknowledgementAccepted(value: unknown): value is PacketAuditAcknowledgementResponse {
  return Boolean(value)
    && typeof value === "object"
    && (value as { acknowledged?: unknown }).acknowledged === true;
}
