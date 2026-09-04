import type { ApplicationQuestion, PacketAuditResponse } from "@/lib/api";
import { packetAuditIdentityMatches, packetAuditResponseMatchesApplication } from "./packet-audit-display.ts";

export type PacketEvidenceSession = {
  applicationId: string;
  response: PacketAuditResponse;
  specJson: string;
  questionsSnapshot: string;
  pdfVerified: boolean;
  acknowledged: boolean;
  serverRevalidatedAt: number | null;
};

export type PacketPdfEvidenceVerification = {
  auditDigest: string;
  sha256: string;
  sizeBytes: number;
};

function normalizedQuestionText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Binds every employer question without treating array order or display-only metadata as content.
 * Answers stay byte-for-byte exact. IDs, prompts, required flags, kinds, and option values all
 * remain part of the snapshot, so a real form or answer mutation still invalidates the audit.
 */
export function packetQuestionsSnapshot(questions: readonly ApplicationQuestion[]): string {
  const canonical = questions.map((question) => ({
    id: question.id,
    prompt: normalizedQuestionText(question.question),
    required: question.required,
    kind: question.kind,
    options: (question.options ?? []).map(normalizedQuestionText).sort(compareCanonicalText),
    answer: question.answer,
  }));
  canonical.sort((left, right) => compareCanonicalText(JSON.stringify(left), JSON.stringify(right)));
  return JSON.stringify(canonical);
}

/** Applies only an actual verification result or invalidation, never a viewer lifecycle event. */
export function reconcilePacketPdfVerification(
  current: PacketEvidenceSession | null,
  verified: PacketPdfEvidenceVerification | null,
): PacketEvidenceSession | null {
  if (!current) return current;
  const expected = current.response;
  const matches = Boolean(
    verified
    && verified.auditDigest === expected.packet_audit.audit_digest
    && verified.sha256 === expected.pdf.sha256
    && verified.sizeBytes === expected.pdf.size_bytes,
  );
  if (current.pdfVerified === matches && (!current.acknowledged || matches)) return current;
  return { ...current, pdfVerified: matches, acknowledged: matches ? current.acknowledged : false };
}

/**
 * Turns the exact evidence shown when ACK started into the evidence the poll may trust.
 * Returning null keeps the portal closed if any bound input changed while ACK was in flight.
 */
export function acknowledgePacketEvidence(
  current: PacketEvidenceSession | null,
  expected: PacketEvidenceSession,
): PacketEvidenceSession | null {
  if (!current
    || current.applicationId !== expected.applicationId
    || current.specJson !== expected.specJson
    || current.questionsSnapshot !== expected.questionsSnapshot
    || !current.pdfVerified
    || !expected.pdfVerified
    || !packetAuditResponseMatchesApplication(current.applicationId, current.response)
    || !packetAuditResponseMatchesApplication(expected.applicationId, expected.response)
    || !packetAuditIdentityMatches(current.response.packet_audit, expected.response.packet_audit)) return null;

  return { ...current, acknowledged: true, serverRevalidatedAt: null };
}

/**
 * Reconciles the branch selected from the poll ref before React applies queued state updates.
 * A newly acknowledged state must never be downgraded by that older branch. The next poll will
 * take the acknowledged path and revalidate the exact packet against the server.
 */
export function reconcileUnacknowledgedPacketPoll(
  current: PacketEvidenceSession | null,
  applicationId: string,
  polledAudit: unknown,
): PacketEvidenceSession | null {
  if (!current || current.applicationId !== applicationId) return null;
  if (current.acknowledged) return current;
  return packetAuditIdentityMatches(current.response.packet_audit, polledAudit)
    ? { ...current, serverRevalidatedAt: null }
    : null;
}

/** The acknowledged poll path accepts only a fresh server envelope for the same exact packet. */
export function revalidateAcknowledgedPacketEvidence(
  current: PacketEvidenceSession | null,
  applicationId: string,
  serverResponse: PacketAuditResponse,
  revalidatedAt: number,
): PacketEvidenceSession | null {
  if (!current
    || current.applicationId !== applicationId
    || !current.acknowledged
    || !packetAuditResponseMatchesApplication(applicationId, serverResponse)
    || !packetAuditIdentityMatches(current.response.packet_audit, serverResponse.packet_audit)) return null;
  return { ...current, response: serverResponse, serverRevalidatedAt: revalidatedAt };
}

/** Keeps exact-packet proof only when a direct server envelope still names the same packet. */
export function reconcilePacketEvidenceWithSubmission(
  current: PacketEvidenceSession | null,
  applicationId: string,
  questions: readonly ApplicationQuestion[],
  packetAudit: unknown,
): PacketEvidenceSession | null {
  if (!current
    || current.applicationId !== applicationId
    || current.questionsSnapshot !== packetQuestionsSnapshot(questions)
    || !packetAuditIdentityMatches(current.response.packet_audit, packetAudit)) return null;
  return current;
}

/**
 * THE ONE EVENT reconcilePacketEvidenceWithSubmission ABOVE CANNOT SEE.
 *
 * POST /applications/:id/resume/contact-refresh (volley-backend PR #945) regenerates the resume PDF
 * but, on the route's own admission, deliberately leaves `_review.packet_audit` untouched: "the very
 * next currentPacketAudit / currentAcknowledgedPacketAudit call... reads
 * stored.pdf.objectKey !== currentBindings.pdf.objectKey, answers 'packet_stale'". That next call is
 * a SEPARATE request (the poll, "Check packet", or the send gate's own audit fetch) - the
 * contact-refresh response's own `review.packet_audit` is byte-identical to whatever was already
 * cached here. Feeding it through reconcilePacketEvidenceWithSubmission therefore compares an
 * unchanged audit to itself, packetAuditIdentityMatches reports a match, and a stale acknowledgement
 * survives a PDF that has already changed underneath it - exactly the gap
 * tests/resume-contact-refresh-control.test.mjs and this module's own test exist to close.
 *
 * So this asks a narrower, more honest question than an identity diff ever could here: was there
 * evidence cached for THIS packet at all. A successful refresh is reachable only from a button that
 * is itself gated on resumeContactStaleNotice already reading true for this packet (see
 * refreshResumeContact and ResumeContactStaleNotice in app/dashboard/applications/page.tsx), so
 * unconditionally invalidating on that packet's evidence - rather than trying to diff
 * `contact.before`/`contact.after`, which the route also returns - is the safe default even on the
 * rare race where the server finds nothing left to refresh. Evidence for any OTHER packet is left
 * alone: this event has no bearing on it.
 */
export function reconcilePacketEvidenceAfterResumeRegeneration(
  current: PacketEvidenceSession | null,
  applicationId: string,
): PacketEvidenceSession | null {
  if (!current || current.applicationId !== applicationId) return current;
  return null;
}
