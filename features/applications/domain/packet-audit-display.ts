import type { PacketAudit, PacketAuditHighlightTerm } from "@/lib/api";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEvidence(value: unknown): boolean {
  return isRecord(value)
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

/**
 * Runtime-validates the server audit before any ranges are flattened or rendered. API response
 * types do not protect the browser from malformed JSON, and a new or unknown tone must never be
 * interpreted as an approved colour.
 */
export function exactPacketAuditRanges(jdText: string, auditValue: unknown): PacketAuditHighlightTerm[] | null {
  if (!isRecord(auditValue)
    || auditValue.version !== "packet_audit_v1"
    || auditValue.status !== "passed"
    || auditValue.complete !== true
    || auditValue.degraded !== false
    || auditValue.rejectedCount !== 0
    || !Array.isArray(auditValue.clauses)
    || auditValue.clauses.length === 0) return null;

  const clauses = auditValue.clauses;
  const clauseBounds: Array<{ start: number; end: number }> = [];
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
    if (clause.verdict === "covered" ? !isEvidence(clause.evidence) : clause.evidence !== undefined) return null;
    clauseBounds.push({ start, end });

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
  return ranges;
}

export function packetAuditDisplayIsExact(jdText: string, audit: PacketAudit): boolean {
  return exactPacketAuditRanges(jdText, audit) !== null;
}

/** Retains a browser-rendered proof only while the server reports the same immutable audit. */
export function packetAuditIdentityMatches(currentValue: unknown, nextValue: unknown): boolean {
  if (!isRecord(currentValue) || !isRecord(nextValue)) return false;
  if (typeof currentValue.packet_version !== "string"
    || !/^[a-f0-9]{64}$/i.test(currentValue.packet_version)
    || currentValue.packet_version !== nextValue.packet_version
    || typeof currentValue.audit_digest !== "string"
    || !/^[a-f0-9]{64}$/i.test(currentValue.audit_digest)
    || currentValue.audit_digest !== nextValue.audit_digest) return false;

  const currentBindings = currentValue.bindings;
  const nextBindings = nextValue.bindings;
  if (!isRecord(currentBindings) || !isRecord(nextBindings)
    || !isRecord(currentBindings.pdf) || !isRecord(nextBindings.pdf)) return false;
  const currentPdf = currentBindings.pdf;
  const nextPdf = nextBindings.pdf;
  return typeof currentPdf.objectKey === "string"
    && currentPdf.objectKey.length > 0
    && currentPdf.objectKey === nextPdf.objectKey
    && typeof currentPdf.sha256 === "string"
    && /^[a-f0-9]{64}$/i.test(currentPdf.sha256)
    && currentPdf.sha256 === nextPdf.sha256
    && Number.isSafeInteger(currentPdf.sizeBytes)
    && (currentPdf.sizeBytes as number) > 0
    && currentPdf.sizeBytes === nextPdf.sizeBytes;
}
