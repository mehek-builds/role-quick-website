import type { DocumentSummary } from "@/lib/api";

/**
 * WHICH STORED FILES THE ASK MODAL MAY OFFER FOR ONE ASK, and why the list is not simply
 * "everything GET /documents returned".
 *
 * THE GAP THIS CLOSES, measured on 2026-09-03 against the Verkada "Embedded Software Engineering
 * Intern 2027" packet (f1b2df5a) and two sibling packets on the same account. The server already
 * reuses a stored file for a measured ask, in reuseStoredDocuments (backend
 * routes/submissionRunner.ts), and it is right to do that server-side: it runs whether or not
 * anybody is watching, which is the only way the promise holds for an account that submits
 * automatically. But it runs at PREPARE time and at no other moment - the only two callers are the
 * two prepare paths - so it can only ever see the library as it stood when the run happened.
 *
 * An application prepared BEFORE the file existed therefore keeps asking forever. Three packets on
 * this account ask for a transcript; uploading one for the first leaves the other two demanding a
 * file Litos is already holding, with no control anywhere that attaches it. The applicant re-uploads
 * the identical PDF once per employer, and if she is on a machine that does not have it she cannot
 * finish any of them.
 *
 * POST /applications/:id/documents/attach was written for exactly this and has never had a caller.
 * Its own comment records the absence: "there is no library picker on any surface".
 *
 * A PRESS, NOT A RULE, and that distinction is what keeps this out of the territory
 * reuseStoredDocuments deliberately refused. That comment rejects a client that attaches whenever it
 * notices an unattached ask beside a matching file, on three grounds: it only runs when she looks,
 * it fires from a render the 2.5s poll repeats, and it would put the mark straight back between the
 * detach and the delete of "Remove this file". None of the three reaches a control she presses once.
 * Nothing here attaches anything on its own.
 *
 * WHAT THE FILTER IS FOR. The attach endpoint matches on user, kind, `reusable = true` and no
 * tombstone, and answers all four failures with one 404 that does not say which. Offering a row the
 * endpoint will refuse is therefore a control that dies on press with no sentence she can act on, so
 * the two terms the client can see are applied here instead:
 *
 *   - `kind`, because one upload writes one `spec._documents` key and a file of another kind would
 *     be refused. Only 'transcript' exists today; the filter is written against the field rather
 *     than against that fact, so a second kind does not silently offer the first one's files.
 *   - `reusable`, because the upload modal's checkbox ships default ON and unticking it is told back
 *     to her as "Attached to this application only. Litos will ask again the next time an employer
 *     wants one." A picker that offered those files would make that sentence false on the surface
 *     that promised it. The endpoint enforces this too, and it is the authority; this is the same
 *     rule held where the row is drawn, so she is never shown the choice at all.
 *
 * Tombstones are excluded server-side by listUserDocuments, so `deleted_at` is checked here only
 * because the column ships on the row and a client that reads a field it can see is cheaper than one
 * that trusts a filter it cannot.
 *
 * ORDER IS THE SERVER'S, which is `coalesce(last_used_at, created_at) desc` - the file she reached
 * for most recently first. Not re-sorted here: a picker that reorders the list the account page
 * shows is two answers to "which is my current transcript".
 */
export function reusableDocumentsForAsk(
  documents: readonly DocumentSummary[] | null | undefined,
  kind: string,
): DocumentSummary[] {
  return (documents ?? []).filter((document) => (
    document.kind === kind
    && document.reusable === true
    && document.deleted_at === null
  ));
}

/**
 * The one sentence the picker is allowed to say about what pressing a row does.
 *
 * Kept beside the filter because the two have to agree: the copy may only describe files the filter
 * would actually offer. It names storage, not delivery - the file becomes part of this application,
 * and nothing reaches the employer until the send, which is the boundary every other document
 * surface in this product keeps.
 */
export const DOCUMENT_REUSE_DESCRIPTION = "Nothing goes to the employer until you review the completed application.";

/** The control on a library row. Says what it attaches to, because the modal names one employer. */
export const DOCUMENT_REUSE_ACTION_LABEL = "Use this one";

/** What that control wears while the attach is in flight. */
export const DOCUMENT_REUSE_BUSY_LABEL = "Attaching...";
