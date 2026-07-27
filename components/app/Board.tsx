"use client";

import { useEffect, useState } from "react";
import { fetchBoard, moveCard, type BoardCard, type Stage } from "@/lib/jd-match";

/**
 * The application pipeline, as a board.
 *
 * Reviewers of Huntr and Teal describe the Kanban as the thing that replaced their spreadsheet, and
 * both products retain on it. What retains is not the columns: it is that the data accumulates and
 * stays the student's.
 *
 * THE STAGE IS THE STUDENT'S, NOT THE AUTOMATION'S. A card's stage is a separate axis from the
 * submission status. A submission reads "submitted" forever while the student moves applied ->
 * interview -> offer, so the two are shown together rather than collapsed: the stage is where they
 * put it, and the status line underneath is what Litos did.
 *
 * MOVED WITH BUTTONS, NOT DRAG. Drag-and-drop is the expected affordance and the wrong one here:
 * it is unusable by keyboard, awkward on the phone where a lot of this happens, and it needs a
 * pointer-precision gesture to record a fact the student already knows. Two taps, always available,
 * beat a gesture that only works on one input device.
 */
const STAGE_LABEL: Record<Stage, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
};

export function Board({
  onOpen,
  openableIds,
}: {
  onOpen?: (id: string) => void;
  /** Ids the parent can actually open. The board is unbounded relative to the 50-row history the
   *  parent holds, so past 50 applications the older cards looked clickable and did nothing. */
  openableIds?: ReadonlySet<string>;
}) {
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [moveError, setMoveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchBoard()
      .then((b) => {
        if (cancelled) return;
        setCards(b.cards);
        setStages(b.stages);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function move(card: BoardCard, stage: Stage) {
    const from = card.stage;
    setMoveError(null);
    setCards((current) => (current ?? []).map((c) => (c.id === card.id ? { ...c, stage } : c)));
    setBusy((current) => new Set(current).add(card.id));
    try {
      await moveCard(card.id, stage);
    } catch (reason) {
      // Roll back ONLY this card, functionally. Restoring a whole array snapshot captured before
      // the request would discard every other move the server had accepted in the meantime.
      setCards((current) => (current ?? []).map((c) => (c.id === card.id ? { ...c, stage: from } : c)));
      // And say so. An empty catch snapped the card back with no message, so the student either
      // missed it and believed the interview was recorded, or saw an unexplained jump.
      setMoveError(reason instanceof Error ? reason.message : "Could not save that move.");
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(card.id);
        return next;
      });
    }
  }

  const openable = (card: BoardCard) =>
    card.reviewable && (openableIds === undefined || openableIds.has(card.id));

  if (failed) {
    return (
      <p className="text-sm text-muted">
        Could not load your board.{" "}
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline">
          Try again
        </button>
      </p>
    );
  }
  if (!cards) return <div className="h-40 animate-pulse rounded-card bg-surface-alt" aria-hidden="true" />;

  return (
    <div>
      {moveError && (
        <p role="status" className="mb-3 rounded-inner bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
          {moveError}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {stages.map((stage) => {
        const column = cards.filter((c) => c.stage === stage);
        return (
          <section key={stage} aria-labelledby={`col-${stage}`} className="min-w-0">
            <div className="flex items-baseline justify-between border-b border-border pb-2">
              <h3 id={`col-${stage}`} className="text-[13px] font-medium text-ink">
                {STAGE_LABEL[stage]}
              </h3>
              <span className="font-mono text-[11px] text-faint">{column.length}</span>
            </div>
            {/* Capped and scrollable, matching the ledger this replaced. An uncapped column grows
                without bound and stretches every sibling to the tallest one. */}
            <ul className="mt-2 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {column.map((card) => (
                <li key={card.id} className="rounded-inner border border-border bg-surface p-3">
                  <button
                    type="button"
                    onClick={() => openable(card) && onOpen?.(card.id)}
                    disabled={!openable(card)}
                    className="block w-full text-left disabled:cursor-default"
                  >
                    <p className="truncate text-[13px] font-medium text-ink">{card.role}</p>
                    <p className="truncate text-xs text-muted">{card.company}</p>
                  </button>
                  {card.submission_status && (
                    <p className="mt-1 text-[11px] text-faint">Litos: {card.submission_status.replace(/_/g, " ")}</p>
                  )}
                  <MoveControl card={card} stages={stages} busy={busy.has(card.id)} onMove={move} />
                </li>
              ))}
              {column.length === 0 && (
                <li className="rounded-inner border border-dashed border-border px-3 py-4 text-center text-xs text-faint">
                  Nothing here
                </li>
              )}
            </ul>
          </section>
        );
      })}
      </div>
    </div>
  );
}

function MoveControl({
  card,
  stages,
  busy,
  onMove,
}: {
  card: BoardCard;
  stages: Stage[];
  busy: boolean;
  onMove: (card: BoardCard, stage: Stage) => void;
}) {
  return (
    <label className="mt-2 block">
      <span className="sr-only">Move {card.role} at {card.company} to another stage</span>
      <select
        value={card.stage}
        disabled={busy}
        onChange={(event) => onMove(card, event.target.value as Stage)}
        className="w-full rounded-inner border border-border bg-surface px-2 py-1 text-xs text-muted outline-none focus:border-brand disabled:opacity-50"
      >
        {stages.map((stage) => (
          <option key={stage} value={stage}>
            {STAGE_LABEL[stage]}
          </option>
        ))}
      </select>
    </label>
  );
}
