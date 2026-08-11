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
