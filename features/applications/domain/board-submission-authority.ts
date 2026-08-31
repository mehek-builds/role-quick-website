import type { AuthoritativeSubmissionProjection } from "../../../lib/api.ts";
import {
  authoritativeSubmissionProjectionFromUnknown,
  submissionProjectionIsConfirmed,
} from "./submission-projection.ts";
import {
  submissionAuthorityCollectionRevisionFromUnknown,
  submissionAuthorityEnvelopeFromUnknown,
  submissionAuthorityMatchesCollectionRevision,
} from "./submission-authority-envelope.ts";

type BoardAuthorityCard = {
  id: string;
  stage: string;
  submission_status: string | null;
  submission_authority?: unknown;
  submission_projection?: AuthoritativeSubmissionProjection;
  authorityNeedsReview?: boolean;
};

function boardAuthority(card: BoardAuthorityCard) {
  return submissionAuthorityEnvelopeFromUnknown(card, {
    applicationId: card.id,
    packetId: card.id,
  });
}

export function boardSubmissionAuthorityCollectionIsComplete(
  payload: unknown,
  cards: readonly BoardAuthorityCard[],
): boolean {
  const revision = submissionAuthorityCollectionRevisionFromUnknown(payload);
  return revision !== null && cards.every((card) =>
    submissionAuthorityMatchesCollectionRevision(card, revision)
    && boardAuthority(card) !== null);
}

/** Classify once, then preserve the result across public card normalization and render passes. */
export function boardCardRequiresSubmissionReview(card: BoardAuthorityCard): boolean {
  if (card.authorityNeedsReview === true) return true;
  const identity = { packetId: card.id };
  const authority = boardAuthority(card);
  const projection = authoritativeSubmissionProjectionFromUnknown(authority?.projection);
  const confirmed = submissionProjectionIsConfirmed(authority?.projection, identity);
  return projection?.state === "repair_required"
    || projection?.state === "unverified"
    || (projection?.state === "confirmed" && !confirmed)
    || authority === null
    || (card.submission_status === "submitted" && !confirmed);
}

export function publicBoardCard<T extends BoardAuthorityCard>(card: T): T {
  const identity = { packetId: card.id };
  const authority = boardAuthority(card);
  const publicProjection = authority?.projection ?? {
    state: "repair_required" as const,
    packet_id: card.id,
    reasons: ["canonical_projection_incomplete" as const],
  };
  const confirmed = submissionProjectionIsConfirmed(publicProjection, identity);
  const authorityNeedsReview = boardCardRequiresSubmissionReview(card);
  return {
    ...card,
    submission_projection: publicProjection,
    /* Applied is a submission claim. Later applicant-selected lifecycle stages remain intact. */
    stage: card.stage === "applied" && !confirmed ? "saved" : card.stage,
    submission_status: authorityNeedsReview ? "needs_attention" : card.submission_status,
    authorityNeedsReview,
  } as T;
}
