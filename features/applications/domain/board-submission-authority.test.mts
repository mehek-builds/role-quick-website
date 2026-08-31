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
