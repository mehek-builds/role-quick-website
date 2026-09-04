import type {
  ApplicationReview,
  AuthoritativeSubmissionProjection,
} from "../../../lib/api";

export type SubmissionProjectionIdentity = {
  attemptId?: string;
  canonicalApplicationId?: string;
  packetId?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * THE LEDGER'S OWN IDENTIFIERS, WHICH ARE NOT RFC-4122 UUIDs.
 *
 * `attempt_id` is minted by the submission attempt ledger into a Postgres `uuid` column, which
 * accepts any 128 bits, and appendSubmissionAttemptEvent never version-checks it. So its version
 * and variant nibbles are uniformly distributed, and holding it to `[1-5]` + `[89ab]` accepts only
 * (5/16)x(4/16) of the identifiers the system actually mints.
 *
 * THAT IS MEASURED, NOT MODELLED. From the backend's census of this account on 2026-09-03
 * (volley-backend submissionAuthorityEnvelope.ts:65-88): of 37 board cards that published an
 * envelope, the 9 carrying an identifier had version nibbles 1,1,1,3,4,4,4,4,5 and variants
 * 8,8,9,a,a,b,b,b,b - a spread randomUUID() (always 4) could not produce. And 162 of the 163
 * refused cards were refused on `projection.attempt_id` ALONE: 115 on the version nibble, 47 on the
 * variant. That is PR #918's `unpublishable_attempt_identity`.
 *
 * The cost of that refusal is not cosmetic. The backend deliberately withholds an envelope this
 * parser would quarantine, so the packet arrives with NO authority at all;
 * applicationPacketAuthorityState then answers `uncertain`, and the review screen refuses the send
 * with "Litos cannot start another employer attempt until the exact prior submission evidence is
 * verified" - on packets whose ledger verdict is `no_evidence`, i.e. nothing was ever attempted and
 * nothing ever reached an employer. No control can clear that, because there is no evidence to
 * verify. Measured live 2026-09-04 on the Mercari packets.
 *
 * WIDENING THIS CANNOT AUTHORIZE A SEND, and that is why it is the safe direction. These ids are
 * opaque correlation keys, compared only for EQUALITY against other server-supplied values. The
 * send decision is `projection.state === "none"` AND a retry verdict of `no_evidence`/
 * `safe_not_sent` AND no mutable sent claim AND not quarantined. A wider identifier alphabet cannot
 * turn a `confirmed` or `unverified` projection into `none`; it only lets an envelope that already
 * says `unverified` be READ as unverified instead of being discarded. Both readings refuse the
 * send, so no packet carrying real attempt evidence becomes sendable by this change.
 *
 * Row identifiers keep UUID_PATTERN: `canonical_application_id` and `packet_id` are table primary
 * keys minted by `gen_random_uuid()`, which really is v4, so the strict rule costs them nothing.
 */
const LEDGER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIRMED_SOURCES = new Set([
  "managed_browser",
  "direct_browser",
  "chrome_extension",
  "ats_api",
  "attended_handoff",
  "legacy_backfill",
]);
const RECEIPT_SOURCES = new Set([
  "managed_browser",
  "direct_browser",
  "chrome_extension",
  "attended_handoff",
  "ats_api",
]);
const CONFIRMED_STAGES = new Set(["applied", "interview", "offer", "closed"]);
const REPAIR_REASONS = new Set([
  "ambiguous_confirmation",
  "canonical_projection_incomplete",
  "document_tuple_incomplete",
  "invalid_attempt_sequence",
  "mutable_sent_without_confirmation",
  "packet_missing",
  "packet_projection_incomplete",
  "posting_mismatch",
  "receipt_binding_mismatch",
  "receipt_incomplete",
  "receipt_missing",
  "selected_flags_incoherent",
]);

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestampString(value: unknown): value is string {
  return nonEmptyString(value)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function uuidString(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** A ledger-minted identifier: UUID layout, any version and variant nibble. See LEDGER_ID_PATTERN. */
function ledgerIdString(value: unknown): value is string {
  return typeof value === "string" && LEDGER_ID_PATTERN.test(value);
}

function safeReceiptUrl(value: unknown): value is string {
  if (!nonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return !parsed.username
      && !parsed.password
      && parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function projectionMatchesIdentity(
  projection: Extract<AuthoritativeSubmissionProjection, { state: "confirmed" }>,
  expected: SubmissionProjectionIdentity,
): boolean {
  return (expected.attemptId === undefined || projection.attempt_id === expected.attemptId)
    && (expected.canonicalApplicationId === undefined
      || projection.canonical_application_id === expected.canonicalApplicationId)
    && (expected.packetId === undefined || projection.packet_id === expected.packetId);
}

function receiptSourceMatchesProjection(
  source: string,
  packetId: unknown,
  receiptSource: unknown,
): boolean {
  if (receiptSource === undefined) {
    return source === "legacy_backfill" || (source === "attended_handoff" && packetId === null);
  }
  if (typeof receiptSource !== "string" || !RECEIPT_SOURCES.has(receiptSource)) return false;
  if (source === "managed_browser" || source === "direct_browser") return receiptSource === "managed_browser";
  if (source === "chrome_extension" || source === "ats_api" || source === "attended_handoff") {
    return receiptSource === source;
  }
  return source === "legacy_backfill"
    && (receiptSource === "managed_browser"
      || receiptSource === "chrome_extension"
      || receiptSource === "ats_api"
      || receiptSource === "attended_handoff");
}

function confirmationByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Runtime validation for the only public state that may claim Sent.
 *
 * TypeScript describes a healthy response, but cached payloads, mixed deployments, and malformed
 * server envelopes still reach this boundary as ordinary JavaScript. A state label alone is not
 * authority. Every exact identity and every visible receipt byte must be present and valid.
 */
export function authoritativeSubmissionProjectionFromUnknown(
  value: unknown,
): AuthoritativeSubmissionProjection | null {
  if (!value || typeof value !== "object") return null;
  const projection = value as Record<string, unknown>;
  if (projection.state === "none") {
    return Object.keys(projection).length === 1 ? { state: "none" } : null;
  }
  if (projection.state === "unverified"
    && ledgerIdString(projection.attempt_id)
    && timestampString(projection.observed_at)
    && (projection.reason === "opened"
      || projection.reason === "boundary_authorized"
      || projection.reason === "pressed"
      || projection.reason === "invalid_sequence")) {
    return value as AuthoritativeSubmissionProjection;
  }
  if (projection.state === "repair_required"
    && Array.isArray(projection.reasons)
    && projection.reasons.length > 0
    && projection.reasons.every(nonEmptyString)
    && projection.reasons.every((reason) => REPAIR_REASONS.has(reason))
    && (projection.attempt_id === undefined || ledgerIdString(projection.attempt_id))
    && (projection.canonical_application_id === undefined
      || uuidString(projection.canonical_application_id))
    && (projection.packet_id === undefined
      || projection.packet_id === null
      || uuidString(projection.packet_id))) {
    return value as AuthoritativeSubmissionProjection;
  }
  if (projection.state !== "confirmed"
    || !ledgerIdString(projection.attempt_id)
    || !uuidString(projection.canonical_application_id)
    || (projection.packet_id !== null && !uuidString(projection.packet_id))
    || !timestampString(projection.submitted_at)
    || typeof projection.source !== "string"
    || !CONFIRMED_SOURCES.has(projection.source)
    || typeof projection.tracker_stage !== "string"
    || !CONFIRMED_STAGES.has(projection.tracker_stage)
    || !projection.receipt
    || typeof projection.receipt !== "object") return null;
  const receipt = projection.receipt as Record<string, unknown>;
  if (!nonEmptyString(receipt.confirmation_text)
    || confirmationByteLength(receipt.confirmation_text) > 2_000
    || !safeReceiptUrl(receipt.final_url)
    || !timestampString(receipt.captured_at)
    || Date.parse(projection.submitted_at) > Date.parse(receipt.captured_at)
    || !receiptSourceMatchesProjection(projection.source, projection.packet_id, receipt.source)) return null;
  return value as AuthoritativeSubmissionProjection;
}

export type ConfirmedProjectionContext = SubmissionProjectionIdentity & {
  retrySafety?: unknown;
  trackerStage?: string;
};

function confirmedProjectionMatchesContext(
  projection: Extract<AuthoritativeSubmissionProjection, { state: "confirmed" }>,
  context: ConfirmedProjectionContext,
): boolean {
  if (!projectionMatchesIdentity(projection, context)) return false;
  if (context.trackerStage !== undefined && projection.tracker_stage !== context.trackerStage) return false;
  if (context.retrySafety !== undefined) {
    if (!context.retrySafety || typeof context.retrySafety !== "object") return false;
    const safety = context.retrySafety as Record<string, unknown>;
    if (safety.kind !== "blocked_confirmed"
      || safety.attemptId !== projection.attempt_id
      || !timestampString(safety.confirmedAt)
      || safety.confirmedAt !== projection.receipt.captured_at) return false;
  }
  return true;
}

/** Parse and bind one confirmed projection to its complete response context. */
export function confirmedProjectionForIdentity(
  value: unknown,
  context: ConfirmedProjectionContext,
): Extract<AuthoritativeSubmissionProjection, { state: "confirmed" }> | null {
  const projection = authoritativeSubmissionProjectionFromUnknown(value);
  return projection?.state === "confirmed" && confirmedProjectionMatchesContext(projection, context)
    ? projection
    : null;
}

/** Compare every normalized field that gives a confirmed receipt its meaning. */
export function sameConfirmedSubmissionProjection(left: unknown, right: unknown): boolean {
  const leftProjection = authoritativeSubmissionProjectionFromUnknown(left);
  const rightProjection = authoritativeSubmissionProjectionFromUnknown(right);
  if (leftProjection?.state !== "confirmed" || rightProjection?.state !== "confirmed") return false;
  return leftProjection.attempt_id === rightProjection.attempt_id
    && leftProjection.canonical_application_id === rightProjection.canonical_application_id
    && leftProjection.packet_id === rightProjection.packet_id
    && leftProjection.submitted_at === rightProjection.submitted_at
    && leftProjection.source === rightProjection.source
    && leftProjection.tracker_stage === rightProjection.tracker_stage
    && leftProjection.receipt.confirmation_text === rightProjection.receipt.confirmation_text
    && leftProjection.receipt.final_url === rightProjection.receipt.final_url
    && leftProjection.receipt.captured_at === rightProjection.receipt.captured_at
    && leftProjection.receipt.source === rightProjection.receipt.source;
}

export function confirmedProjectionForPacket(
  value: unknown,
  context: Omit<ConfirmedProjectionContext, "packetId"> & { packetId: string },
): Extract<AuthoritativeSubmissionProjection, { state: "confirmed" }> | null {
  return uuidString(context.packetId)
    ? confirmedProjectionForIdentity(value, context)
    : null;
}

export function confirmedProjectionForCanonical(
  value: unknown,
  context: Omit<ConfirmedProjectionContext, "canonicalApplicationId" | "packetId"> & {
    canonicalApplicationId: string;
    legacyPacketId: string | null;
  },
): Extract<AuthoritativeSubmissionProjection, { state: "confirmed" }> | null {
  const expected = {
    ...context,
    packetId: context.legacyPacketId,
    canonicalApplicationId: context.canonicalApplicationId,
  };
  return uuidString(context.canonicalApplicationId)
    && (context.legacyPacketId === null || uuidString(context.legacyPacketId))
    ? confirmedProjectionForIdentity(value, expected)
    : null;
}

export function submissionProjectionIsConfirmed(
  projection: AuthoritativeSubmissionProjection | null | undefined,
  expected: SubmissionProjectionIdentity,
): projection is Extract<AuthoritativeSubmissionProjection, { state: "confirmed" }> {
  const validated = authoritativeSubmissionProjectionFromUnknown(projection);
  return validated?.state === "confirmed" && projectionMatchesIdentity(validated, expected);
}

export function submissionProjectionNeedsRepair(
  projection: AuthoritativeSubmissionProjection | null | undefined,
  expected: SubmissionProjectionIdentity,
): projection is Extract<AuthoritativeSubmissionProjection, { state: "repair_required" }> {
  const validated = authoritativeSubmissionProjectionFromUnknown(projection);
  if (validated?.state !== "repair_required") return false;
  return (expected.attemptId === undefined || validated.attempt_id === expected.attemptId)
    && (expected.canonicalApplicationId === undefined
      || validated.canonical_application_id === expected.canonicalApplicationId)
    && (expected.packetId === undefined || validated.packet_id === expected.packetId);
}

/** Stable identity used by equal-clock response reconciliation. */
export function submissionProjectionIdentity(
  projection: AuthoritativeSubmissionProjection | null | undefined,
  expected: SubmissionProjectionIdentity = {},
): string {
  if (projection === undefined) return "absent";
  const validated = authoritativeSubmissionProjectionFromUnknown(projection);
  if (!validated) return `invalid:${JSON.stringify(projection)}`;
  if (validated.state === "confirmed" && !projectionMatchesIdentity(validated, expected)) {
    return `misbound:${JSON.stringify(validated)}`;
  }
  return `valid:${JSON.stringify(validated)}`;
}

/** Mutable packet fields that claim an employer submission without public receipt authority. */
export function reviewClaimsSubmissionSent(
  review: Pick<ApplicationReview, "status" | "submitted_at" | "receipt" | "unverified_submission">,
): boolean {
  return review.status === "submitted"
    || Boolean(review.submitted_at)
    || Boolean(review.receipt)
    || review.unverified_submission?.resolution === "sent";
}

/**
 * Keep every packet view on the same public truth as the server-owned projection.
 *
 * The backend already applies this fence. Repeating it at the display boundary protects cached
 * history and mixed-version responses, where mutable review JSON may still say submitted without
 * the complete exact receipt that the public contract requires.
 */
export function reviewForSubmissionProjection(
  review: ApplicationReview,
  projection: AuthoritativeSubmissionProjection | null | undefined,
  expected: SubmissionProjectionIdentity,
): ApplicationReview {
  if (submissionProjectionIsConfirmed(projection, expected)) {
    return {
      ...review,
      status: "submitted",
      submitted_at: projection.submitted_at,
      submission_claim_id: projection.attempt_id,
      submission_claimed_at: undefined,
      submission_run_id: undefined,
      attention_reason: undefined,
      attention_categories: undefined,
      submission_error: undefined,
      ...(review.unverified_submission
        ? {
          unverified_submission: {
            ...review.unverified_submission,
            resolution: undefined,
            resolved_at: undefined,
          },
        }
        : {}),
      receipt: {
        confirmation_text: projection.receipt.confirmation_text,
        final_url: projection.receipt.final_url,
        captured_at: projection.receipt.captured_at,
      },
    };
  }

  const validatedProjection = authoritativeSubmissionProjectionFromUnknown(projection);
  const projectionRequiresAttention = validatedProjection?.state === "unverified"
    || validatedProjection?.state === "repair_required"
    || (validatedProjection?.state === "confirmed"
      && !submissionProjectionIsConfirmed(validatedProjection, expected))
    || (projection !== undefined && projection !== null && validatedProjection === null);
  const mutableSentClaim = reviewClaimsSubmissionSent(review);
  if (!mutableSentClaim && !projectionRequiresAttention) return review;
  return {
    ...review,
    status: "needs_attention" as const,
    submitted_at: undefined,
    receipt: undefined,
    ...(review.unverified_submission?.resolution === "sent"
      ? {
        unverified_submission: {
          ...review.unverified_submission,
          resolution: undefined,
          resolved_at: undefined,
        },
      }
      : {}),
  };
}
