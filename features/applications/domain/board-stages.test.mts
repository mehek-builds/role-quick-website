import assert from "node:assert/strict";
import test from "node:test";
import { activeBoardStages, boardCoverage, boardCoverageNote } from "./board-stages.ts";

test("the application board keeps only active pipeline stages", () => {
  assert.deepEqual(
    activeBoardStages(["saved", "applied", "interview", "offer", "closed"]),
    ["applied", "interview", "offer"],
  );
});

test("the application board preserves the server's active-stage order", () => {
  assert.deepEqual(activeBoardStages(["offer", "saved", "applied"]), ["offer", "applied"]);
  assert.deepEqual(activeBoardStages([]), []);
});

/**
 * The board saying what it is not showing.
 *
 * MEASURED, 2026-08-08, owner account a18f774b: /applications/board answered with 83 cards, all at
 * stage "saved", none drawn. The board rendered three "Nothing here" boxes over that history.
 */
const card = (stage: string) => ({ stage });

test("every card off the board: the note names the whole history rather than three empty boxes", () => {
  const cards = Array.from({ length: 83 }, () => card("saved"));
  const coverage = boardCoverage(cards, activeBoardStages(["saved", "applied", "interview", "offer", "closed"]));
  assert.deepEqual(coverage, { total: 83, onBoard: 0, offBoard: 83 });
  assert.equal(boardCoverageNote(coverage), "83 applications, none sent yet. A card reaches Applied once Litos sends it.");
});

test("one application does not get told it has applications", () => {
  const coverage = boardCoverage([card("saved")], ["applied", "interview", "offer"]);
  assert.equal(boardCoverageNote(coverage), "1 application, not sent yet. A card reaches Applied once Litos sends it.");
});

test("a partly drawn board counts only what it is hiding", () => {
  const cards = [card("applied"), card("interview"), card("offer"), card("saved"), card("closed")];
  const coverage = boardCoverage(cards, ["applied", "interview", "offer"]);
  assert.deepEqual(coverage, { total: 5, onBoard: 3, offBoard: 2 });
  assert.equal(boardCoverageNote(coverage), "2 of 5 have not been sent yet. A card reaches Applied once Litos sends it.");
});

test("a board that is drawing everything says nothing", () => {
  const coverage = boardCoverage([card("applied"), card("offer")], ["applied", "interview", "offer"]);
  assert.deepEqual(coverage, { total: 2, onBoard: 2, offBoard: 0 });
  assert.equal(boardCoverageNote(coverage), null);
});

test("an empty history prints no count at all, because the empty state speaks for it", () => {
  // "0 applications, none sent yet" is the confident zero this dashboard refuses everywhere else.
  const coverage = boardCoverage([], ["applied", "interview", "offer"]);
  assert.deepEqual(coverage, { total: 0, onBoard: 0, offBoard: 0 });
  assert.equal(boardCoverageNote(coverage), null);
});

test("the note is counted against the stages actually drawn, not against a hard-coded list", () => {
  /* The columns come from the server's `stages` filtered through activeBoardStages, and a backend
     that dropped one would narrow them. The count has to narrow with them or the caption starts
     under-reporting exactly when the board is showing less than it should. */
  const cards = [card("applied"), card("interview")];
  assert.equal(boardCoverage(cards, ["applied"]).offBoard, 1);
  assert.equal(boardCoverage(cards, ["applied", "interview"]).offBoard, 0);
});
