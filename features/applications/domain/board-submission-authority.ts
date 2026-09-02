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

/** An envelope the server chose not to publish is absent. Anything else present is a claim. */
function cardCarriesSubmissionAuthority(card: BoardAuthorityCard): boolean {
  return card.submission_authority !== undefined && card.submission_authority !== null;
}

/**
 * Fails closed PER CARD, never per board.
 *
 * The collection identity is still mandatory: a payload without a canonical `schema_version` and
 * `submission_authority_revision` is rejected outright, because those two fields are the only proof
 * the response came from a server that speaks this contract at all. So is any card whose envelope
 * is MISBOUND, either to a different revision than the collection announced or to some id other
 * than the card it arrived on. That is corruption, and one corrupt card discredits the snapshot.
 *
 * Absence is not corruption. The board route cannot publish an envelope for every card, and the
 * reachable case is the mainline managed path: between authorizeFinalSubmissionBoundary and the
 * press event EVERY managed submission sits in the boundary-authorized hold, which the envelope
 * builder refuses, and it stays there permanently if the runner dies in that window, because the
 * retry-safety fold reads that state off `pressed.length === 0` and never downgrades on lease
 * expiry. Two other classes reach it too: an unsupported-portal email-channel submission, and a
 * confirmed managed opening carrying an attended_handoff receipt.
 *
 * Rejecting the whole payload for those is fail-closed at the wrong granularity: it turns one card
 * nobody can vouch for into a board nobody can see, which is the exact outage this contract exists
 * to prevent. A card with no envelope instead falls through publicBoardCard's repair_required
 * substitution, so it renders as needing review and is not sendable, while its neighbours render.
 */
export function boardSubmissionAuthorityCollectionIsComplete(
  payload: unknown,
  cards: readonly BoardAuthorityCard[],
): boolean {
  const revision = submissionAuthorityCollectionRevisionFromUnknown(payload);
  return revision !== null && cards.every((card) =>
    !cardCarriesSubmissionAuthority(card)
    || (submissionAuthorityMatchesCollectionRevision(card, revision)
      && boardAuthority(card) !== null));
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
