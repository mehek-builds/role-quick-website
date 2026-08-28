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

/**
 * The same sentence, counted from the ledger printed directly above it instead of from the board's
 * own fetch.
 *
 * WHY THIS EXISTS. `boardCoverage` counts the cards /applications/board returned, which caps at 200.
 * The ledger header six pixels higher counts the merged canonical inventory. On 2026-08-29 the two
 * were 200 and 100 on one screen: "Your applications 100", and immediately beneath it "187 of 200
 * have not been sent yet". Both numbers were correct about their own universe and the screen was
 * still telling a student that Litos cannot count her applications.
 *
 * The board keeps drawing every card it was handed - hiding a real card to make a caption tidy
 * would be the worse error, and is the exact defect boardCoverage was written for. What changes is
 * WHICH INVENTORY THE SENTENCE IS ABOUT: it is about the list it sits under, so the two can never
 * disagree again, by construction rather than by both happening to be right.
 *
 * `sent` is the canonical send count from pipeline-counts.ts, NOT a stage tally. The Applied column
 * is the student's own axis (see the header of Board.tsx) and can hold a card she moved there
 * herself; reading that column as an answer to "how many did Litos send" is the third of the four
 * causes listed in pipeline-counts.ts.
 */
export function pipelineCoverage(
  inventory: { total: number; sent: number },
): { total: number; onBoard: number; offBoard: number } {
  const total = Math.max(0, inventory.total);
  const onBoard = Math.min(Math.max(0, inventory.sent), total);
  return { total, onBoard, offBoard: total - onBoard };
}

/**
 * What the board says when its Applied column and the canonical send count are not the same number.
 *
 * "Applied 13" beside "12 Sent" was one of the six disagreeing figures. They are not the same claim
 * and never were: `sent` is what Litos submitted, while the Applied column is where the STUDENT has
 * filed a card, including one she applied to herself and moved across by hand. Rather than collapse
 * a real distinction (which would either invent sends or hide her own cards), the board names it,
 * once, and only when the two actually differ.
 *
 * IT STATES THE DIFFERENCE, IT DOES NOT EXPLAIN IT. An earlier draft read "moved there by you
 * rather than sent by Litos", and that is a cause this function cannot know. The two figures come
 * from two independent fetches - /applications/board and the merged canonical inventory - so an
 * excess can equally mean a card the board returned that the ledger's window did not reach, and
 * telling a student she filed something herself when Litos in fact sent it is precisely the kind of
 * confident wrong sentence this whole pass is removing. Naming the two universes is the honest
 * form, and it is what the reader needs in order to reconcile the numbers.
 *
 * Null when they agree, which is the ordinary case and the one where a caption would be noise.
 */
export function boardStageReconciliationNote(appliedCards: number, sent: number): string | null {
  const difference = appliedCards - sent;
  if (difference <= 0) return null;
  return difference === 1
    ? "1 card sits in Applied that this list does not count as sent by Litos."
    : `${difference} cards sit in Applied that this list does not count as sent by Litos.`;
}
