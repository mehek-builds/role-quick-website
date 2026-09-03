import { api } from "@/lib/api";
import type { PacketAuditResponse } from "@/lib/api";
import { packetAuditAcknowledgementAccepted } from "../domain/packet-audit-acknowledgement";

/**
 * Client side of POST /applications/:id/packet-audit/acknowledge.
 *
 * ONE COPY, BECAUSE THE FOUR VALUES ARE A CONTRACT AND NOT A CONVENIENCE. The backend does not
 * merely record this call: verifyStoredPacketAuditAcknowledgement (student-outreach-backend,
 * src/routes/applications.ts) compares `audit_digest`, `packet_version`, `pdf_sha256` and
 * `size_bytes` against the audit stored on the row and refuses with PACKET_AUDIT_STALE on any
 * disagreement. That comparison is the whole reason the acknowledgement means anything - it is what
 * ties the applicant's press to the exact bytes she was shown - and a caller that derives those four
 * from somewhere else, or forgets one, is not weakening its own screen but the proof every send
 * gate downstream reads.
 *
 * Two screens make this call: the dashboard's "Approve packet and fill form" and the onboarding
 * review screen's Send. When each held its own copy, a contract change had to be found in two files
 * and a missed one drifted in the permissive direction - the shape still posts, the CAS still
 * answers, and nothing on either screen says the acknowledgement stopped being about this packet.
 * The body is derived here, from the audit response itself, so there is one place to change and no
 * second place to forget.
 *
 * THE REFUSAL SENTENCE IS THE CALLER'S. What the two screens share is the contract, not the copy:
 * the dashboard is confirming a review before it fills a form, the onboarding screen is recording
 * hers immediately before an irreversible send, and each says so in its own words.
 *
 * Throws on a refused or unrecognised acknowledgement rather than returning a flag, because no
 * caller may continue without one and both already route a thrown reason into the recovery path
 * that decides whether a fresh audit is the answer.
 *
 * NAMED ARGUMENTS, NOT POSITIONAL, because two of the three are strings. Taken in order, a caller
 * that transposed the id and the refusal copy would type-check and then POST to a URL built out of
 * an error sentence: a 404 rather than the coded refusal the screens recover from, so the applicant
 * gets a dead end instead of a fresh audit. The inline code this replaced could not be miswired
 * that way because the fields were spelled out at the call site, and a helper standing in front of
 * an irreversible send should not be easier to get wrong than what it replaced.
 */
export async function acknowledgePacketAudit({ applicationId, response, refusalMessage }: {
  applicationId: string;
  response: PacketAuditResponse;
  refusalMessage: string;
}): Promise<void> {
  const result = await api<unknown>(`/applications/${applicationId}/packet-audit/acknowledge`, {
    method: "POST",
    body: JSON.stringify({
      audit_digest: response.packet_audit.audit_digest,
      packet_version: response.packet_audit.packet_version,
      pdf_sha256: response.pdf.sha256,
      size_bytes: response.pdf.size_bytes,
    }),
  });
  if (!packetAuditAcknowledgementAccepted(result)) throw new Error(refusalMessage);
}
