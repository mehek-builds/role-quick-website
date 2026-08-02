import type { RealPacket } from "@/lib/try-data";

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const MIN_WORK_AUTHORIZATION_LENGTH = 8;
const EXPLICIT_WORK_AUTHORIZATION_PATTERNS = [
  /^(?:work auth(?:orization|orisation)|employment authorization|right to work)\s*:\s*(?=.*\b(?:yes|no|authori[sz]ed|eligible|sponsorship|right to work)\b)/i,
  /^(?:(?:i am|i'm|candidate is)\s+)?(?:not\s+)?authori[sz]ed to work\b/i,
  /^(?:(?:i am|i'm|candidate is)\s+)?(?:not\s+)?(?:legally\s+)?eligible to work\b/i,
  /^(?:i\s+)?(?:do not|don't|will not|will|may|currently)?\s*(?:require|need)s?\s+(?:employer\s+)?sponsorship\b/i,
  /^(?:no|requires?|needs?)\s+(?:employer\s+)?sponsorship\b/i,
  /^(?:i have|holder of)\s+(?:the\s+)?right to work\b/i,
];

function isExplicitWorkAuthorization(value: string): boolean {
  return (
    value.length >= MIN_WORK_AUTHORIZATION_LENGTH &&
    EXPLICIT_WORK_AUTHORIZATION_PATTERNS.some((pattern) => pattern.test(value))
  );
}

export function extractExplicitWorkAuthorization(resume: string): string | null {
  const sourceLines = resume
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean);
  return sourceLines.find(isExplicitWorkAuthorization) ?? null;
}

export function preserveExplicitWorkAuthorization(
  resume: string,
  candidate: unknown,
): string | null {
  if (typeof candidate !== "string") return null;

  const answer = normalize(candidate);
  if (!isExplicitWorkAuthorization(answer)) return null;

  const sourceLines = resume
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean);
  return sourceLines.some((line) => line.toLowerCase() === answer.toLowerCase())
    ? answer
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeTryPacket(
  resume: string,
  candidate: unknown,
): RealPacket | null {
  if (!isRecord(candidate) || !isRecord(candidate.filled_fields)) return null;

  const bullets = candidate.tailored_bullets;
  const coverage = candidate.ats_coverage;
  const fields = candidate.filled_fields;
  if (
    !Array.isArray(bullets) ||
    bullets.length !== 3 ||
    !bullets.every((bullet) => typeof bullet === "string" && bullet.trim()) ||
    !Number.isInteger(coverage) ||
    (coverage as number) < 0 ||
    (coverage as number) > 100 ||
    typeof fields.university !== "string" ||
    typeof fields.short_answer !== "string" ||
    typeof candidate.outreach_opening !== "string"
  ) {
    return null;
  }

  return {
    tailored_bullets: bullets,
    ats_coverage: coverage as number,
    filled_fields: {
      university: fields.university,
      work_authorization:
        preserveExplicitWorkAuthorization(resume, fields.work_authorization) ??
        extractExplicitWorkAuthorization(resume) ??
        "",
      short_answer: fields.short_answer,
    },
    outreach_opening: candidate.outreach_opening,
  };
}
