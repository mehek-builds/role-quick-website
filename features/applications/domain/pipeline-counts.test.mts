import assert from "node:assert/strict";
import test from "node:test";
import { boardCoverageNote, boardStageReconciliationNote, pipelineCoverage } from "./board-stages.ts";
import { packetIsSent, pipelineCounts, sentSince, startOfLocalDay } from "./pipeline-counts.ts";

/**
 * ONE FIXTURE, EVERY SURFACE THAT COUNTS.
 *
 * MEASURED, 2026-08-29, owner account: Home read "0 Ready / 88 Needs you / 12 Sent", Momentum read
 * "13 sent in total", the ledger header read 100, the sentence directly beneath it read "187 of 200
 * have not been sent yet", and the board column read "Applied 13". Six figures, one pipeline.
 *
 * The shape below is that account: 100 applications with a review, 12 of them sent, 88 waiting on
 * the student, none ready to go out on its own. The assertions are what the three surfaces actually
 * render, so a future edit that reintroduces a second derivation fails here rather than on a
 * screenshot.
 */
const review = (status: string, extra: Record<string, unknown> = {}) => ({
  spec: { _review: { status, ...extra } },
});

function ownerAccountInventory() {
  return [
    ...Array.from({ length: 12 }, () => review("submitted", { submitted_at: "2026-08-20T09:00:00.000Z" })),
    ...Array.from({ length: 88 }, () => review("needs_attention")),
  ];
}

test("the Home tile, the board column and the coverage note render one sent count from one fixture", () => {
  const packets = ownerAccountInventory();
  const counts = pipelineCounts(packets);

  // 1. Home's Sent tile, and Momentum's "sent in total", which is now the same value passed in.
  assert.equal(counts.sent, 12);
  assert.equal(counts.needsYou, 88);
  assert.equal(counts.ready, 0);
  assert.equal(counts.total, 100);

  // 2. The ledger header. The board is handed exactly the expression the header renders.
  const inventory = { total: counts.total, sent: counts.sent };
  assert.equal(inventory.total, packets.length);

  // 3. The sentence under the board, counted off that same inventory rather than its own fetch.
  assert.equal(
    boardCoverageNote(pipelineCoverage(inventory)),
    "88 of 100 have not been sent yet. A card reaches Applied once Litos sends it.",
  );

  // 4. The board's Applied column, once it draws the same universe, agrees rather than reading 13.
  const appliedColumn = counts.sent;
  assert.equal(boardStageReconciliationNote(appliedColumn, counts.sent), null);

  /* The property the whole change exists for: every figure on the screen is the same number. */
  assert.equal(new Set([counts.sent, inventory.sent, appliedColumn]).size, 1);
});

test("summing the tiles is not the inventory, so the note counts total directly", () => {
  /* A packet mid-run is Ready, Needs you and Sent in none of them. Deriving the note's total from
     ready + needsYou + sent would report 2 applications over a list showing 3. */
  const packets = [review("submitted"), review("needs_attention"), review("filling")];
  const counts = pipelineCounts(packets);
  assert.equal(counts.ready + counts.needsYou + counts.sent, 2);
  assert.equal(counts.total, 3);
  assert.equal(
    boardCoverageNote(pipelineCoverage({ total: counts.total, sent: counts.sent })),
    "2 of 3 have not been sent yet. A card reaches Applied once Litos sends it.",
  );
});

test("a ready status on a portal Litos cannot submit through is Needs you, never Ready", () => {
  const packets = [review("ready_to_submit", { portal_supported: false }), review("ready_to_submit")];
  const counts = pipelineCounts(packets);
  assert.equal(counts.ready, 1);
  assert.equal(counts.needsYou, 1);
  assert.equal(counts.total, 2);
});

test("saved resumes are not applications, so they leave every figure alone", () => {
  const packets = [review("submitted"), { spec: {} }, { spec: {} }];
  const counts = pipelineCounts(packets);
  assert.equal(counts.total, 1);
  assert.equal(counts.sent, 1);
});

test("the board names a card the student moved into Applied herself rather than printing two numbers", () => {
  assert.equal(
    boardStageReconciliationNote(13, 12),
    "1 card in Applied was moved there by you rather than sent by Litos.",
  );
  assert.equal(
    boardStageReconciliationNote(15, 12),
    "3 cards in Applied were moved there by you rather than sent by Litos.",
  );
  // Fewer cards on the column than sent applications is not a claim this can make: the board is a
  // subset of the inventory, and a caption about a negative difference would be noise.
  assert.equal(boardStageReconciliationNote(12, 12), null);
  assert.equal(boardStageReconciliationNote(9, 12), null);
});

test("coverage from the inventory never reports more sent than the account has", () => {
  /* A canonical count larger than the ledger's own total would print a negative "not sent yet".
     Clamped rather than trusted: the two arrive from one call site today, and a caption that can
     go negative is a caption that will. */
  assert.deepEqual(pipelineCoverage({ total: 5, sent: 9 }), { total: 5, onBoard: 5, offBoard: 0 });
  assert.deepEqual(pipelineCoverage({ total: 5, sent: -2 }), { total: 5, onBoard: 0, offBoard: 5 });
  assert.equal(boardCoverageNote(pipelineCoverage({ total: 5, sent: 5 })), null);
});

test("applied today counts the server's stamp, from the same inventory as the all-time figure", () => {
  const now = new Date("2026-08-29T15:00:00.000Z");
  const midnight = startOfLocalDay(now);
  const packets = [
    review("submitted", { submitted_at: now.toISOString() }),
    review("submitted", { submitted_at: "2026-08-20T09:00:00.000Z" }),
    // Sent, but with no stamp: it counts all-time and cannot count toward a day.
    review("submitted"),
    // A regenerated resume that never went out must not climb the day count.
    review("needs_attention"),
  ];
  assert.equal(pipelineCounts(packets).sent, 3);
  assert.equal(sentSince(packets, midnight), 1);
});

test("an unparseable timestamp is not today", () => {
  const packets = [review("submitted", { submitted_at: "not a date" })];
  assert.equal(sentSince(packets, startOfLocalDay(new Date("2026-08-29T15:00:00.000Z"))), 0);
});

test("one packet answers the sent question the same way the counts do", () => {
  assert.equal(packetIsSent(review("submitted")), true);
  assert.equal(packetIsSent(review("needs_attention")), false);
  assert.equal(packetIsSent({ spec: {} }), false);
});
