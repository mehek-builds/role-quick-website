"use client";

import { useEffect, useState } from "react";
import { activeBoardStages, boardCoverage, boardCoverageNote, fetchBoard, moveCard, type BoardCard, type Stage } from "@/features/applications";
import { userFacingError } from "@/lib/user-facing-error";

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
 * DRAG ON THE GRID, A CONTROL EVERYWHERE ELSE. The three-column grid only exists at md+, so that is
 * the only place a drag gesture is offered; it needs a pointer, so it is additive, never the only
 * path. The select that used to sit visibly on every card still does the same move and still ships
 * on every card: below md it stays visible (there is exactly one column on screen at a time there,
 * nothing to drag a card into), and at md+ it collapses to sr-only and reappears the instant it is
 * keyboard-focused, so a keyboard or screen-reader user loses nothing when the mouse gains a
 * gesture. Two ways to record the same fact, chosen by the input device that is actually in hand.
 */
/** "Just now" / "3h ago" / "5d ago", the way the card reads it on a board. Anything past a month
 *  falls back to a date, because "47d ago" is arithmetic the reader has to do. */
function relativeTime(at: string | null): string {
  if (!at) return "";
  const ms = Date.now() - new Date(at).getTime();
  if (Number.isNaN(ms)) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days <= 30) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const STAGE_LABEL: Record<Stage, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
};

/* Reuses the app's own five-look vocabulary (components/app/ui.tsx: quiet / your-turn / happened),
   rather than inventing a stage palette. Applied is the resting state (sent, nothing to do: quiet).
   Interview is the one stage asking something of the student (prep: your-turn, brand blue). Offer
   is the good news landing (happened, positive green). Saved/closed never reach this board. */
const STAGE_TONE: Record<Stage, { dot: string; text: string; soft: string; border: string }> = {
  saved: { dot: "bg-faint", text: "text-muted", soft: "bg-surface-alt", border: "border-l-border" },
  applied: { dot: "bg-faint", text: "text-muted", soft: "bg-surface-alt", border: "border-l-border" },
  interview: { dot: "bg-brand", text: "text-brand-ink", soft: "bg-brand-soft", border: "border-l-brand" },
  offer: { dot: "bg-positive", text: "text-positive", soft: "bg-positive-soft", border: "border-l-positive" },
  closed: { dot: "bg-faint", text: "text-muted", soft: "bg-surface-alt", border: "border-l-border" },
};

function submissionLabel(status: string): string {
  if (status === "submitted") return "Sent";
  if (["needs_attention", "ready_for_final_approval", "failed"].includes(status)) return "Needs you";
  if (["submit_requested", "preparing", "filling", "submitting", "submission_claimed"].includes(status)) return "Getting ready";
  return "Ready";
}

export function Board({
  onOpen,
  onRevisit,
  openableIds,
  revisitableIds,
}: {
  onOpen?: (id: string) => void;
  /** Open the packet that was built for this card: the resume, the posting and every answer.
   *  Separate from onOpen, which resumes the review flow. Both need to exist, because "carry on
   *  working on this" and "show me what already went out" are different intentions and collapsing
   *  them means one of the two is unreachable. */
  onRevisit?: (id: string) => void;
  /** Ids the parent can actually open. The board is unbounded relative to the 50-row history the
   *  parent holds, so past 50 applications the older cards looked clickable and did nothing. */
  openableIds?: ReadonlySet<string>;
  /** Ids that have a packet to show. NOT the same set as openableIds: a packet can be openable in
   *  the review flow while having no review to revisit, and the mark must be absent for those
   *  rather than rendered and inert. Undefined means "same as openable", for callers that pass
   *  onRevisit without the distinction. */
  revisitableIds?: ReadonlySet<string>;
}) {
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [moveError, setMoveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activeStage, setActiveStage] = useState<Stage>("applied");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);

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
      setMoveError(userFacingError(reason, "Could not save that move."));
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(card.id);
        return next;
      });
    }
  }

  /* Dragging is offered from the card body, not from inside the select or the packet-revisit
     button: those two need their own mousedown-to-drag gesture untouched (a select opening its
     options, a button being pressed), so a drag that started on either is cancelled here rather
     than fighting the browser for it. */
  function handleDragStart(event: React.DragEvent<HTMLLIElement>, card: BoardCard) {
    if (event.target instanceof HTMLElement && event.target.closest("select, button, a")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.id);
    setDraggingId(card.id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverStage(null);
  }

  function handleColumnDragOver(event: React.DragEvent<HTMLElement>, stage: Stage) {
    if (!draggingId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  }

  function handleColumnDrop(event: React.DragEvent<HTMLElement>, stage: Stage) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggingId;
    const card = (cards ?? []).find((c) => c.id === id);
    setDraggingId(null);
    setDragOverStage(null);
    if (card && card.stage !== stage) move(card, stage);
  }

  const openable = (card: BoardCard) =>
    card.reviewable && (openableIds === undefined || openableIds.has(card.id));

  const revisitable = (card: BoardCard) =>
    Boolean(onRevisit) && (revisitableIds === undefined ? openable(card) : revisitableIds.has(card.id));

  const visibleStages = activeBoardStages(stages);
  /* What the columns are not drawing, in a sentence, or null when they are drawing everything.
     Counted off `cards`, the same array the columns filter, so the two cannot disagree. */
  const coverageNote = cards ? boardCoverageNote(boardCoverage(cards, visibleStages)) : null;

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
      {/* WHAT THE COLUMNS ARE NOT SHOWING, above them rather than below, because it is the first
          thing true of this board on most accounts: nothing has been sent, so every card derives
          to "saved" and no column draws it. Without this the board is three boxes reading "Nothing
          here" over the student's whole history. Not an ErrorNote and not a warning: an account
          that has not sent anything yet is an ordinary account. */}
      {coverageNote && (
        <p className="mb-3 text-[13px] leading-5 text-muted">{coverageNote}</p>
      )}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 md:hidden" aria-label="Application stage">
        {visibleStages.map((stage) => (
          <button key={stage} type="button" onClick={() => setActiveStage(stage)} aria-pressed={activeStage === stage} className={`shrink-0 rounded-full border px-3 py-2 text-xs ${activeStage === stage ? "border-brand bg-brand-soft text-brand-ink" : "border-border text-muted"}`}>
            {STAGE_LABEL[stage]} · {cards.filter((card) => card.stage === stage).length}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
      {visibleStages.map((stage) => {
        const column = cards.filter((c) => c.stage === stage);
        const tone = STAGE_TONE[stage];
        const isDropTarget = dragOverStage === stage && draggingId !== null;
        return (
          <section
            key={stage}
            aria-labelledby={`col-${stage}`}
            onDragOver={(event) => handleColumnDragOver(event, stage)}
            onDragLeave={() => setDragOverStage((current) => (current === stage ? null : current))}
            onDrop={(event) => handleColumnDrop(event, stage)}
            className={`${activeStage === stage ? "block" : "hidden"} min-w-0 rounded-card p-2 transition-colors md:block ${isDropTarget ? `${tone.soft} outline outline-2 outline-dashed outline-offset-[-2px] outline-brand/50` : ""}`}
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 id={`col-${stage}`} className="flex items-center gap-2 text-[13px] font-medium text-ink">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                {STAGE_LABEL[stage]}
              </h3>
              <span className={`rounded-full ${tone.soft} px-2 py-0.5 font-mono text-[11px] ${tone.text}`}>{column.length}</span>
            </div>
            {/* Capped and scrollable, matching the ledger this replaced. An uncapped column grows
                without bound and stretches every sibling to the tallest one. */}
            <ul className="mt-2 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {column.map((card) => (
                <li
                  key={card.id}
                  draggable={!busy.has(card.id)}
                  onDragStart={(event) => handleDragStart(event, card)}
                  onDragEnd={handleDragEnd}
                  className={`group relative rounded-card border border-l-[3px] ${tone.border} border-border bg-surface p-3 shadow-rest transition-all md:cursor-grab md:active:cursor-grabbing ${draggingId === card.id ? "opacity-40" : "hover:shadow-raised hover:border-control-border"}`}
                >
                  <button
                    type="button"
                    onClick={() => openable(card) && onOpen?.(card.id)}
                    disabled={!openable(card)}
                    className="block w-full text-left disabled:cursor-default"
                  >
                    <p className="truncate text-[13px] font-medium text-ink">{card.role}</p>
                    <p className="truncate text-xs text-muted">{card.company}</p>
                  </button>
                  {/* When it last moved, on every card. Without it a column is a set of names with
                      no sense of which is live and which has been sitting untouched for a month,
                      which is the question a board is looked at to answer. */}
                  <p className="mt-1 text-[11px] text-muted">
                    {relativeTime(card.moved_at ?? card.created_at)}
                    {card.submission_status ? ` · Litos: ${submissionLabel(card.submission_status)}` : ""}
                  </p>
                  {/* The move control keeps its right edge clear so the packet mark can sit in the
                      actual corner rather than above it. Visible below md, where the mobile tab bar
                      shows one column at a time and there is nothing to drag a card into; from md up
                      the grid makes dragging the primary path, so this collapses to sr-only and
                      reappears the instant a keyboard user tabs to it. */}
                  <div className={revisitable(card) ? "pr-8" : ""}>
                    <MoveControl card={card} stages={visibleStages} busy={busy.has(card.id)} onMove={move} />
                  </div>

                  {/* THE PACKET MARK, bottom right. Always visible rather than on hover: a board is
                      scanned, and a control that appears only under the cursor cannot be scanned
                      for, nor touched at all on a phone. It is a sibling of the card's own button,
                      never nested inside it, because a button inside a button is invalid HTML.
                      24px is the mark; the ::after pushes the hit area to 40px. */}
                  {revisitable(card) && (
                    <button
                      type="button"
                      onClick={() => onRevisit?.(card.id)}
                      aria-label={`See the application built for ${card.role} at ${card.company}: the resume, the posting and every answer`}
                      title="See the application again"
                      /* rounded-inner, not a one-off 7px. DESIGN.md defines exactly three radii and
                         an arbitrary fourth is how a scale stops being one. */
                      className="after:absolute after:-inset-2 after:content-[''] absolute bottom-[15px] right-3 flex h-6 w-6 items-center justify-center rounded-inner text-muted transition-colors hover:bg-brand-soft hover:text-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
                        <path
                          d="M7 1.5h3.5V5M5 10.5H1.5V7"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                  {/* The grip, bottom-left: the only hint on the card that it can be picked up. Mono
                      dots rather than a labeled control, because at md+ this is a hover/drag cue for
                      a mouse, not a second control competing with MoveControl's keyboard path.
                      Hidden below md, where cards are not draggable (nothing to drag them into). */}
                  <span aria-hidden className="absolute bottom-[15px] left-3 hidden text-faint transition-colors group-hover:text-muted md:block">
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
                      <circle cx="3" cy="2.5" r="1" />
                      <circle cx="9" cy="2.5" r="1" />
                      <circle cx="3" cy="6" r="1" />
                      <circle cx="9" cy="6" r="1" />
                      <circle cx="3" cy="9.5" r="1" />
                      <circle cx="9" cy="9.5" r="1" />
                    </svg>
                  </span>
                </li>
              ))}
              {column.length === 0 && (
                <li className={`rounded-card border border-dashed px-3 py-4 text-center text-xs transition-colors ${isDropTarget ? "border-brand/50 text-brand-ink" : "border-border text-muted"}`}>
                  {isDropTarget ? `Drop to move to ${STAGE_LABEL[stage]}` : "Nothing here"}
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
    <label className="mt-2 block md:focus-within:not-sr-only md:sr-only">
      <span className="sr-only">Move {card.role} at {card.company} to another stage</span>
      <select
        value={card.stage}
        disabled={busy}
        onChange={(event) => onMove(card, event.target.value as Stage)}
        className="w-full rounded-inner border border-control-border bg-surface px-2 py-1 text-xs text-muted outline-none focus:border-brand disabled:opacity-50"
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
