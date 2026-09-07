/**
 * Copy for an application whose employer outcome has not been verified.
 *
 * This helper grants no authority and changes no recovery behavior. It only distinguishes a
 * recovery record that belongs to the exact held attempt from missing, malformed, or stale data,
 * so the dashboard never claims that checks are active without that binding.
 */
export type UnverifiedRecoveryReview = {
  submission_claim_id?: unknown;
  outcome_recovery?: {
    attempt_id?: unknown;
    state?: unknown;
  } | null;
};

export type UnverifiedRecoveryStatus = {
  phase: "checking" | "unresolved" | "unverified";
  heading: "Checking submission" | "Submission not verified" | "Submission unverified";
  description: string;
  canonicalSummary: string;
  canonicalDescription: string;
};

const CHECKING_STATUS: UnverifiedRecoveryStatus = {
  phase: "checking",
  heading: "Checking submission",
  description: "Litos checks the original application attempt for an employer confirmation automatically. You do not need to open the employer's website.",
  canonicalSummary: "Checking the employer response.",
  canonicalDescription: "Litos keeps this attempt locked while it checks for confirmation. It will not send a duplicate.",
};

const UNRESOLVED_STATUS: UnverifiedRecoveryStatus = {
  phase: "unresolved",
  heading: "Submission not verified",
  description: "Litos could not verify the employer's response. This application stays unverified. A matching confirmation can still update it automatically.",
  canonicalSummary: "Litos could not verify the employer response.",
  canonicalDescription: "This application stays unverified and the attempt stays locked to prevent a duplicate. A matching confirmation can still update it automatically.",
};

const UNVERIFIED_STATUS: UnverifiedRecoveryStatus = {
  phase: "unverified",
  heading: "Submission unverified",
  description: "Litos has not verified an employer confirmation for this application. A matching confirmation can still update it automatically.",
  canonicalSummary: "The employer response is unverified.",
  canonicalDescription: "Litos keeps this attempt locked while its result is uncertain. It will not send a duplicate.",
};

function exactNonblankIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

export function unverifiedRecoveryStatus(
  review: UnverifiedRecoveryReview | null | undefined,
): UnverifiedRecoveryStatus {
  const claimId = review?.submission_claim_id;
  const recovery = review?.outcome_recovery;
  const attemptId = recovery?.attempt_id;
  const exactAttempt = exactNonblankIdentity(claimId)
    && exactNonblankIdentity(attemptId)
    && attemptId === claimId;

  if (!exactAttempt) return UNVERIFIED_STATUS;
  if (recovery?.state === "unresolved") return UNRESOLVED_STATUS;
  if (recovery?.state === "pending" || recovery?.state === "checking") return CHECKING_STATUS;
  return UNVERIFIED_STATUS;
}
