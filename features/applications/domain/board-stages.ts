export const ACTIVE_BOARD_STAGES = ["applied", "interview", "offer"] as const;

const ACTIVE_BOARD_STAGE_SET = new Set<string>(ACTIVE_BOARD_STAGES);

export function activeBoardStages<T extends string>(stages: readonly T[]): T[] {
  return stages.filter((stage) => ACTIVE_BOARD_STAGE_SET.has(stage));
}

/**
 * How much of what the board was handed the board is actually drawing.
 *
 * WHY THIS EXISTS. GET /applications/board returns every application, up to 200, each carrying the
 * stage it derives to. The columns above draw three of the five stages, so "saved" and "closed"
 * cards arrive and are drawn nowhere. Measured on 2026-08-08 against the owner account: 83 cards
 * returned, 83 of them at "saved", 0 drawn. The board rendered three boxes reading "Nothing here"
 * over the student's entire history, which is not a smaller truth than the history, it is a
 * different and false claim.
 *
 * Counted from the cards the board already holds rather than sent by the server, so the sentence
 * and the columns cannot disagree: they are the same array, filtered by the same stage list.
 */
export function boardCoverage<T extends { stage: string }>(
  cards: readonly T[],
  visibleStages: readonly string[],
): { total: number; onBoard: number; offBoard: number } {
  const visible = new Set(visibleStages);
  const onBoard = cards.filter((card) => visible.has(card.stage)).length;
  return { total: cards.length, onBoard, offBoard: cards.length - onBoard };
}

/**
 * What the board says about the cards it is not drawing, or nothing at all.
 *
 * Null whenever every card is on a column, which is the state this is trying to reach and the one
 * where a caption would be noise. Never a sentence about zero applications: an account with no
 * history has the empty state, and printing "0 applications, none sent yet" over it would be the
 * confident zero the rest of this dashboard refuses.
 *
 * It does not tell the student where to go instead. The list of every application, with what each
 * one is waiting on, renders directly above this on the same screen (see ledgerRendersOnLanding),
 * and a caption that pointed at a surface which may or may not be mounted would be the more
 * fragile of the two claims.
 */
export function boardCoverageNote(coverage: { total: number; onBoard: number; offBoard: number }): string | null {
  if (coverage.offBoard <= 0) return null;
  if (coverage.onBoard === 0) {
    return coverage.total === 1
      ? "1 application, not sent yet. A card reaches Applied once Litos sends it."
      : `${coverage.total} applications, none sent yet. A card reaches Applied once Litos sends it.`;
  }
  return `${coverage.offBoard} of ${coverage.total} have not been sent yet. A card reaches Applied once Litos sends it.`;
}
