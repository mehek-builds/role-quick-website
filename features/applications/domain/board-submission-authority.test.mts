import assert from "node:assert/strict";
import test from "node:test";
import {
  boardCardRequiresSubmissionReview,
  boardSubmissionAuthorityCollectionIsComplete,
  publicBoardCard,
} from "./board-submission-authority.ts";
import type { BoardCard } from "../infrastructure/applications-api.ts";

const packetId = "8142004c-3358-4538-8778-16df5e31c5bb";
const canonicalApplicationId = "9242004c-3358-4538-8778-16df5e31c5bb";
const otherPacketId = "a142004c-3358-4538-8778-16df5e31c5bb";
const capturedAt = "2026-08-28T08:00:00.000Z";

const card = (submissionProjection: BoardCard["submission_projection"]): BoardCard => {
  const retrySafety = submissionProjection?.state === "confirmed"
    ? {
      kind: "blocked_confirmed" as const,
      attemptId: submissionProjection.attempt_id,
      confirmedAt: submissionProjection.receipt.captured_at,
    }
    : { kind: "no_evidence" as const };
  return {
    id: packetId,
    job_id: null,
    company: "Example",
    role: "Engineer",
    created_at: "2026-08-28T08:00:00.000Z",
    moved_at: "2026-08-28T08:00:00.000Z",
    reviewable: true,
    submission_status: "submitted",
    ...(submissionProjection === undefined
      ? {}
      : {
        submission_projection: submissionProjection,
        submission_authority: {
          schema_version: "submission-authority-v1",
          revision: "4",
          state: submissionProjection.state,
          application_id: packetId,
          packet_id: packetId,
          projection: submissionProjection,
          retry_safety: retrySafety,
        },
      }),
    stage: "applied",
  };
};

const confirmedProjection = (projectionPacketId = packetId) => ({
  state: "confirmed" as const,
  attempt_id: "b142004c-3358-4538-8778-16df5e31c5bb",
  canonical_application_id: canonicalApplicationId,
  packet_id: projectionPacketId,
  submitted_at: capturedAt,
  receipt: {
    confirmation_text: "Application received",
    final_url: "https://jobs.example.test/applications/received",
    captured_at: capturedAt,
    source: "managed_browser" as const,
  },
  source: "managed_browser" as const,
  tracker_stage: "applied" as const,
});

for (const [label, projection] of [
  ["absent", undefined],
  ["none", { state: "none" as const }],
] as const) {
  test(`${label} authority plus mutable submitted stays in review after fetch and render normalization`, () => {
    const fetched = publicBoardCard(card(projection));
    assert.equal(fetched.authorityNeedsReview, true);
    assert.equal(fetched.submission_status, "needs_attention");
    assert.equal(fetched.stage, "saved");

    const rendered = publicBoardCard(fetched);
    assert.equal(rendered.authorityNeedsReview, true);
    assert.equal(boardCardRequiresSubmissionReview(rendered), true);
  });
}

test("Board binds the card id as packet identity, not canonical application identity", () => {
  const exact = publicBoardCard(card(confirmedProjection()));
  assert.equal(exact.authorityNeedsReview, false);
  assert.equal(exact.submission_status, "submitted");
  assert.equal(exact.stage, "applied");

  const wrongPacket = publicBoardCard(card({
    ...confirmedProjection(otherPacketId),
    canonical_application_id: packetId,
  }));
  assert.equal(wrongPacket.authorityNeedsReview, true);
  assert.equal(wrongPacket.submission_status, "needs_attention");
  assert.equal(wrongPacket.stage, "saved");
});

test("Board rejects missing and mixed passive authority revisions", () => {
  const exact = card(confirmedProjection());
  const payload = {
    schema_version: "submission-authority-v1",
    submission_authority_revision: "4",
    build_revision: "deploy-sha",
    cards: [exact],
  };
  assert.equal(boardSubmissionAuthorityCollectionIsComplete(payload, [exact]), true);
  assert.equal(boardSubmissionAuthorityCollectionIsComplete({ cards: [exact] }, [exact]), false);
  const mixed = {
    ...exact,
    submission_authority: {
      ...(exact.submission_authority as Record<string, unknown>),
      revision: "5",
    },
  };
  assert.equal(boardSubmissionAuthorityCollectionIsComplete({
    ...payload,
    cards: [exact, mixed],
  }, [exact, mixed]), false);
});

/* The granularity cases. A card the server could not publish an envelope for is unreviewable on its
   own; it is not evidence that the whole snapshot is untrustworthy. The reachable producer is the
   boundary-authorized hold every managed submission passes through, which the envelope builder
   refuses, and which the runner dying inside its window makes permanent. */
const bareCard = (): BoardCard => ({ ...card(undefined), id: otherPacketId });

const collection = (cards: readonly BoardCard[]) => ({
  schema_version: "submission-authority-v1",
  submission_authority_revision: "4",
  build_revision: "deploy-sha",
  cards,
});

test("One unpublishable card is one card needing review, not a board that refuses to load", () => {
  const healthy = card(confirmedProjection());
  const bare = bareCard();
  const cards = [healthy, bare];
  assert.equal(boardSubmissionAuthorityCollectionIsComplete(collection(cards), cards), true);

  const reviewed = publicBoardCard(bare);
  assert.equal(reviewed.authorityNeedsReview, true);
  assert.equal(reviewed.submission_status, "needs_attention");
  assert.equal(reviewed.stage, "saved");
  assert.equal(boardCardRequiresSubmissionReview(reviewed), true);

  /* The neighbour is untouched, which is the entire point of moving the granularity. */
  const neighbour = publicBoardCard(healthy);
  assert.equal(neighbour.authorityNeedsReview, false);
  assert.equal(neighbour.submission_status, "submitted");
  assert.equal(neighbour.stage, "applied");
});

test("The envelope-less card carries the explicit repair_required projection, never a confirmed one", () => {
  const reviewed = publicBoardCard(bareCard());
  assert.deepEqual(reviewed.submission_projection, {
    state: "repair_required",
    packet_id: otherPacketId,
    reasons: ["canonical_projection_incomplete"],
  });
});

test("An envelope bound to another revision is corruption and still rejects the collection", () => {
  const healthy = card(confirmedProjection());
  const stale = {
    ...card(confirmedProjection()),
    id: otherPacketId,
    submission_authority: {
      ...(card(confirmedProjection()).submission_authority as Record<string, unknown>),
      revision: "3",
    },
  } as BoardCard;
  const cards = [healthy, stale];
  assert.equal(boardSubmissionAuthorityCollectionIsComplete(collection(cards), cards), false);
});

test("An envelope bound to another card is corruption and still rejects the collection", () => {
  const healthy = card(confirmedProjection());
  /* Same envelope, re-hung on a different card: it names packetId while riding otherPacketId. */
  const misbound = { ...card(confirmedProjection()), id: otherPacketId } as BoardCard;
  const cards = [healthy, misbound];
  assert.equal(boardSubmissionAuthorityCollectionIsComplete(collection(cards), cards), false);
});

test("A payload with no collection identity is rejected even when every card is envelope-less", () => {
  const cards = [bareCard()];
  assert.equal(boardSubmissionAuthorityCollectionIsComplete({ cards }, cards), false);
  assert.equal(boardSubmissionAuthorityCollectionIsComplete({
    submission_authority_revision: "4",
    cards,
  }, cards), false);
  assert.equal(boardSubmissionAuthorityCollectionIsComplete({
    schema_version: "submission-authority-v1",
    cards,
  }, cards), false);
});
