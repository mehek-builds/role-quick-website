/**
 * ONE ACCOUNT OF WHAT DELETING A STORED FILE DOES, for every surface that offers to delete one.
 *
 * Two surfaces delete the same object through the same endpoint: the Documents section on the
 * account page, and the attached state of the upload modal. They had two different treatments. The
 * account page confirmed first and explained; the modal deleted permanently on one click with no
 * confirmation and nothing said. One object cannot have two answers to "what happens if I press
 * this", so the words live here and both surfaces render them.
 *
 * WHAT THE COPY IS ALLOWED TO SAY, measured against DELETE /documents/:id rather than against what
 * would be reassuring to read:
 *
 *   - The blob is deleted and the row is tombstoned, `reusable` false. The library list excludes
 *     tombstones, and the auto-reuse lookup takes only `reusable = true and deleted_at is null`. So
 *     "Litos asks you for it again" is true.
 *   - The route DELIBERATELY does not rewrite the spec of any application that already carried the
 *     file, because a sent application still has to be able to name what went out with it. So an
 *     unsent application goes on naming a file that is gone. This copy used to claim the opposite:
 *     "Any application you have not sent yet stops carrying it". Nothing in the request does that,
 *     and the other delete path on this branch detaches explicitly because nothing else will.
 *   - Nothing in this product reaches into an employer's system. A student pressing Remove after a
 *     rejection is often trying to withdraw a document, and this copy must not let her leave
 *     believing she has.
 *
 * WHAT IT MUST NOT SAY. There is no promise here that a send is held back. The prepare paths do
 * hold one back and say why, but a packet already sitting at ready_for_final_approval is rebuilt at
 * submit time and simply goes without the file. Naming a guarantee the product keeps on one path
 * and not the other is how the previous sentence became untrue, so this one gives her the action
 * instead: open the application and attach a copy.
 */
export const DOCUMENT_REMOVAL_CONSEQUENCES: readonly string[] = [
  "Litos deletes the file. The next time an employer's form asks for one, Litos asks you for it again rather than reusing this.",
  "An application you have not sent yet still names this file. Litos cannot put a deleted file on anyone's form, so open that application and attach a copy before you send it.",
  "An employer who already received it keeps their copy. Removing it here does not reach them, and Litos cannot ask them to delete it.",
  "You cannot undo this.",
];

/** The label above the heading. Says what class of action this is before it says which file. */
export const DOCUMENT_REMOVAL_KICKER = "Permanent action";

/**
 * The heading, which names the file wherever there is one to name.
 *
 * A confirmation reading "Remove this file?" down a column of files, or over a modal whose header is
 * a company name, asks her to confirm a deletion she cannot identify. The fallback is only for the
 * reopened modal, where an older envelope may carry a mark with no file name on it.
 */
export function documentRemovalTitle(fileName: string | null | undefined, kind: string): string {
  const named = fileName?.trim();
  return named ? `Remove ${named}?` : `Remove your ${kind}?`;
}

/** The way out. Says what keeping does, so it is not the button that merely is not the red one. */
export const DOCUMENT_REMOVAL_KEEP_LABEL = "Keep this file";

/** The destructive control, and the word it wears while the request is in flight. */
export const DOCUMENT_REMOVAL_CONFIRM_LABEL = "Remove file";
export const DOCUMENT_REMOVAL_BUSY_LABEL = "Removing...";
