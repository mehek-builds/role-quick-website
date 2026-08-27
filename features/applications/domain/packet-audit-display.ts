import type { PacketAudit, PacketAuditHighlightTerm } from "@/lib/api";
import { PACKET_AUDIT_VERSION } from "../../../lib/packet-audit-version.ts";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEvidence(value: unknown): boolean {
  return isRecord(value)
    && (value.source === "resume_spec" || value.source === "applicant_snapshot")
    && typeof value.path === "string"
    && value.path.length > 0
    && typeof value.quote === "string"
    && value.quote.length > 0
    && typeof value.sha256 === "string"
    && /^[a-f0-9]{64}$/i.test(value.sha256);
}

function isClauseVerdict(value: unknown): value is "covered" | "missing" | "unscoreable" {
  return value === "covered" || value === "missing" || value === "unscoreable";
}

function isHighlightTone(value: unknown): value is "covered" | "missing" | "edited" {
  return value === "covered" || value === "missing" || value === "edited";
}

function isEmployerDeliveryBinding(value: unknown): value is {
  version: "employer_delivery_v1";
  mode: "full" | "browser" | "extension";
  sha256: string;
} {
  return isRecord(value)
    && value.version === "employer_delivery_v1"
    && (value.mode === "full" || value.mode === "browser" || value.mode === "extension")
    && typeof value.sha256 === "string"
    && /^[a-f0-9]{64}$/i.test(value.sha256);
}

/**
 * Runtime-validates the server audit before any ranges are flattened or rendered. API response
 * types do not protect the browser from malformed JSON, and a new or unknown tone must never be
 * interpreted as an approved colour.
 */
export type AuditedClauseRange = { start: number; end: number; verdict: "covered" | "missing" | "unscoreable" };

/** The validated audit, split into the two things the panes paint: term-level highlights inside
 *  scored clauses, and the clause spans themselves (which is the only way an `unscoreable` verdict
 *  can be shown, since the validator below forbids highlight terms on an unscoreable clause). */
export type AuditedDisplay = { terms: PacketAuditHighlightTerm[]; clauses: AuditedClauseRange[] };

function validateAuditForDisplay(jdText: string, auditValue: unknown): AuditedDisplay | null {
  if (!isRecord(auditValue)
    || auditValue.version !== PACKET_AUDIT_VERSION
    || auditValue.status !== "passed"
    || auditValue.complete !== true
    || auditValue.degraded !== false
    || auditValue.rejectedCount !== 0
    || !Array.isArray(auditValue.clauses)
    || auditValue.clauses.length === 0) return null;

  const clauses = auditValue.clauses;
  const clauseBounds: Array<{ start: number; end: number }> = [];
  const clauseRanges: AuditedClauseRange[] = [];
  const ranges: PacketAuditHighlightTerm[] = [];

  for (let clauseIndex = 0; clauseIndex < clauses.length; clauseIndex += 1) {
    const clause = clauses[clauseIndex];
    if (!isRecord(clause)
      || typeof clause.text !== "string"
      || !Number.isInteger(clause.start)
      || !Number.isInteger(clause.end)
      || !isClauseVerdict(clause.verdict)
      || !Array.isArray(clause.highlight_terms)) return null;

    const start = clause.start as number;
    const end = clause.end as number;
    if (start < 0 || end <= start || end > jdText.length || jdText.slice(start, end) !== clause.text) return null;
    if (clause.verdict === "covered"
      ? !Array.isArray(clause.evidence) || clause.evidence.length === 0 || !clause.evidence.every(isEvidence)
      : clause.evidence !== undefined) return null;
    clauseBounds.push({ start, end });
    clauseRanges.push({ start, end, verdict: clause.verdict });

    for (const term of clause.highlight_terms) {
      if (!isRecord(term)
        || typeof term.text !== "string"
        || typeof term.key !== "string"
        || !Number.isInteger(term.start)
        || !Number.isInteger(term.end)
        || term.clauseIndex !== clauseIndex
        || !isHighlightTone(term.tone)) return null;

      const termStart = term.start as number;
      const termEnd = term.end as number;
      if (termStart < start || termEnd <= termStart || termEnd > end || jdText.slice(termStart, termEnd) !== term.text) return null;
      const expectedVerdict = term.tone === "missing" ? "missing" : "covered";
      if (expectedVerdict !== clause.verdict) return null;
      if (term.tone === "missing" ? term.evidence !== undefined : !isEvidence(term.evidence)) return null;
      ranges.push(term as unknown as PacketAuditHighlightTerm);
    }
  }

  const sortedClauses = [...clauseBounds].sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < sortedClauses.length; index += 1) {
    if (sortedClauses[index].start < sortedClauses[index - 1].end) return null;
  }

  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].start < ranges[index - 1].end) return null;
  }
  clauseRanges.sort((left, right) => left.start - right.start || left.end - right.end);
  return { terms: ranges, clauses: clauseRanges };
}

export function exactPacketAuditRanges(jdText: string, auditValue: unknown): PacketAuditHighlightTerm[] | null {
  return validateAuditForDisplay(jdText, auditValue)?.terms ?? null;
}

/** The clause spans of a validated audit, verdicts included. Used to paint `unscoreable`, which has
 *  no highlight terms of its own to hang a colour on. */
export function exactPacketAuditClauses(jdText: string, auditValue: unknown): AuditedClauseRange[] | null {
  return validateAuditForDisplay(jdText, auditValue)?.clauses ?? null;
}

export function packetAuditDisplayIsExact(jdText: string, audit: PacketAudit): boolean {
  return validateAuditForDisplay(jdText, audit) !== null;
}

/** Retains a browser-rendered proof only while the server reports the same immutable audit. */
export function packetAuditIdentityMatches(currentValue: unknown, nextValue: unknown): boolean {
  if (!isRecord(currentValue) || !isRecord(nextValue)) return false;
  if (currentValue.version !== PACKET_AUDIT_VERSION
    || nextValue.version !== PACKET_AUDIT_VERSION
    || typeof currentValue.packet_version !== "string"
    || !/^[a-f0-9]{64}$/i.test(currentValue.packet_version)
    || currentValue.packet_version !== nextValue.packet_version
    || typeof currentValue.audit_digest !== "string"
    || !/^[a-f0-9]{64}$/i.test(currentValue.audit_digest)
    || currentValue.audit_digest !== nextValue.audit_digest) return false;

  const currentBindings = currentValue.bindings;
  const nextBindings = nextValue.bindings;
  if (!isRecord(currentBindings) || !isRecord(nextBindings)
    || !isRecord(currentBindings.pdf) || !isRecord(nextBindings.pdf)
    || !isEmployerDeliveryBinding(currentBindings.employerDelivery)
    || !isEmployerDeliveryBinding(nextBindings.employerDelivery)) return false;
  const currentPdf = currentBindings.pdf;
  const nextPdf = nextBindings.pdf;
  return currentBindings.employerDelivery.version === nextBindings.employerDelivery.version
    && currentBindings.employerDelivery.mode === nextBindings.employerDelivery.mode
    && currentBindings.employerDelivery.sha256 === nextBindings.employerDelivery.sha256
    && typeof currentBindings.resumeContactEmailSha256 === "string"
    && /^[a-f0-9]{64}$/i.test(currentBindings.resumeContactEmailSha256)
    && currentBindings.resumeContactEmailSha256 === nextBindings.resumeContactEmailSha256
    && typeof currentBindings.applicantEmailSha256 === "string"
    && /^[a-f0-9]{64}$/i.test(currentBindings.applicantEmailSha256)
    && currentBindings.applicantEmailSha256 === nextBindings.applicantEmailSha256
    && isRecord(currentValue.identities)
    && isRecord(nextValue.identities)
    && currentValue.identities.resume_email === nextValue.identities.resume_email
    && currentValue.identities.applicant_email === nextValue.identities.applicant_email
    && typeof currentPdf.objectKey === "string"
    && currentPdf.objectKey.length > 0
    && currentPdf.objectKey === nextPdf.objectKey
    && typeof currentPdf.sha256 === "string"
    && /^[a-f0-9]{64}$/i.test(currentPdf.sha256)
    && currentPdf.sha256 === nextPdf.sha256
    && Number.isSafeInteger(currentPdf.sizeBytes)
    && (currentPdf.sizeBytes as number) > 0
    && currentPdf.sizeBytes === nextPdf.sizeBytes;
}

/** Runtime-validates the packet audit envelope before the dashboard dereferences any server JSON. */
export function packetAuditResponseMatchesApplication(applicationId: string, responseValue: unknown): boolean {
  if (!isRecord(responseValue)
    || !isRecord(responseValue.packet_audit)
    || !isRecord(responseValue.pdf)) return false;
  const audit = responseValue.packet_audit;
  const pdf = responseValue.pdf;
  const bindingsValue = audit.bindings;
  if (!isRecord(bindingsValue)) return false;
  const bindingValue = bindingsValue.pdf;
  if (!isRecord(bindingValue) || !isEmployerDeliveryBinding(bindingsValue.employerDelivery)) return false;
  const bindings = bindingsValue;
  const binding = bindingValue;
  const identities = audit.identities;
  if (!isRecord(identities)) return false;
  const hashFields = [
    bindings.ownerSha256,
    bindings.jdSha256,
    bindings.specSha256,
    bindings.jobContextSha256,
    bindings.questionsSha256,
    bindings.applicantSnapshotSha256,
    bindings.resumeContactEmailSha256,
    bindings.applicantEmailSha256,
    audit.audit_digest,
    audit.packet_version,
    binding.sha256,
  ];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return audit.version === PACKET_AUDIT_VERSION
    && hashFields.every((value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value))
    && bindings.applicationId === applicationId
    && typeof identities.resume_email === "string"
    && emailPattern.test(identities.resume_email)
    && typeof identities.applicant_email === "string"
    && emailPattern.test(identities.applicant_email)
    && identities.resume_email.toLowerCase() !== identities.applicant_email.toLowerCase()
    && typeof binding.objectKey === "string"
    && binding.objectKey.length > 0
    && Number.isSafeInteger(binding.sizeBytes)
    && (binding.sizeBytes as number) > 0
    && pdf.object_key === binding.objectKey
    && pdf.sha256 === binding.sha256
    && pdf.size_bytes === binding.sizeBytes
    && typeof pdf.download_url === "string"
    && pdf.download_url.trim().length > 0;
}

export function manualTrialPacketEvidenceIsFresh(
  applicationId: string,
  value: unknown,
  now = Date.now(),
): boolean {
  if (!isRecord(value)
    || value.acknowledged !== true
    || value.pdfVerified !== true
    || !Number.isFinite(value.serverRevalidatedAt)) return false;
  const age = now - (value.serverRevalidatedAt as number);
  return age >= 0
    && age < 5_000
    && packetAuditResponseMatchesApplication(applicationId, value.response);
}

/** Accepts only the server-returned company URL bound to the exact packet already shown. */
export function manualHandoffMatchesPacket(
  responseValue: unknown,
  expectedUrl: string,
  packetResponseValue: unknown,
  now = Date.now(),
  allowExpiredAuthorization = false,
): boolean {
  if (!isRecord(responseValue)
    || !isRecord(responseValue.manual_handoff)
    || typeof responseValue.manual_attempt_id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(responseValue.manual_attempt_id)
    || !isRecord(responseValue.retry_safety)
    || responseValue.retry_safety.kind !== "blocked_unverified"
    || responseValue.retry_safety.reason !== "boundary_authorized"
    || responseValue.retry_safety.attemptId !== responseValue.manual_attempt_id
    || typeof responseValue.retry_safety.leaseId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(responseValue.retry_safety.leaseId)
    || typeof responseValue.retry_safety.at !== "string"
    || !Number.isFinite(Date.parse(responseValue.retry_safety.at))
    || typeof responseValue.retry_safety.expiresAt !== "string"
    || !Number.isFinite(Date.parse(responseValue.retry_safety.expiresAt))
    || (!allowExpiredAuthorization && Date.parse(responseValue.retry_safety.expiresAt) <= now)
    || !isRecord(packetResponseValue)
    || !isRecord(packetResponseValue.packet_audit)
    || !isRecord(packetResponseValue.pdf)) return false;
  const handoff = responseValue.manual_handoff;
  const audit = packetResponseValue.packet_audit;
  const pdf = packetResponseValue.pdf;
  try {
    const url = new URL(String(handoff.url));
    if (url.protocol !== "https:" || url.username || url.password || url.toString() !== expectedUrl) return false;
  } catch {
    return false;
  }
  return typeof handoff.audit_digest === "string"
    && /^[a-f0-9]{64}$/i.test(handoff.audit_digest)
    && handoff.audit_digest === audit.audit_digest
    && typeof handoff.packet_version === "string"
    && /^[a-f0-9]{64}$/i.test(handoff.packet_version)
    && handoff.packet_version === audit.packet_version
    && typeof handoff.pdf_sha256 === "string"
    && /^[a-f0-9]{64}$/i.test(handoff.pdf_sha256)
    && handoff.pdf_sha256 === pdf.sha256
    && Number.isSafeInteger(handoff.size_bytes)
    && (handoff.size_bytes as number) > 0
    && handoff.size_bytes === pdf.size_bytes;
}
