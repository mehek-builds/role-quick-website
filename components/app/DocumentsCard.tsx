"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/app/Button";
import { useDashboardOverlayExit } from "@/components/app/useDashboardOverlayExit";
import { Card, formatDate, formatRelativeDate } from "./ui";
import { deleteUserDocument, listUserDocuments, type DocumentSummary } from "@/lib/api";
import { userFacingError } from "@/lib/user-facing-error";
import { formatDocumentBytes } from "@/lib/document-size";
import {
  DOCUMENT_REMOVAL_BUSY_LABEL,
  DOCUMENT_REMOVAL_CONFIRM_LABEL,
  DOCUMENT_REMOVAL_CONSEQUENCES,
  DOCUMENT_REMOVAL_KEEP_LABEL,
  DOCUMENT_REMOVAL_KICKER,
  documentRemovalTitle,
} from "@/lib/document-removal";

/* THE ACCOUNT-LEVEL HOME FOR A FILE THE STUDENT GAVE LITOS.
 *
 * /privacy publishes: "We encrypt it and keep it until you remove it or delete your account." The
 * removing half of that sentence lived only inside TranscriptModal, which opens only from a control
 * on an application screen. Two rounds of fixes tried to keep that control reachable by binding it
 * to per-application UI state, and both sprang leaks in the same place, because they were binding
 * the wrong kind of object: a stored document belongs to the ACCOUNT and outlives every application
 * it was ever attached to. An application reaches a terminal status, its screen stops rendering any
 * document control at all, and the file is still stored. That is the normal end state of a sent
 * application, not an edge case, so the promise was untrue for most of a stored file's life.
 *
 * This card is the surface that cannot go away. It is on the account page, it reads the library
 * rather than any one application, and it does not care what state any application is in.
 *
 * WHAT IT DELIBERATELY IS NOT. There is no upload, no replace, no preview, no rename. A document
 * arrives because an employer's form asked for one, and it arrives from that application's own
 * screen where the ask is in front of her. An upload control here would be this page asking a
 * student for a transcript nobody wants.
 */
export default function DocumentsCard() {
  /* null is LOADING and [] is "she has none". Collapsing the two would print the empty state for
     the second before the list answers, which to a student who came here to check reads as Litos
     having already deleted her transcript. */
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  /* WHY A FLAG AND NOT A MESSAGE. This held the failure text and drew an error card, which was
     correct while the endpoint was certain to exist and wrong the moment it was not. Both repos
     deploy to production on merge and they are separate pull requests, so there is a window in which
     this component is live and GET /documents is not. An error card here renders on EVERY signed-in
     student's account page, permanently, telling all of them something is broken about a feature
     almost none of them use. Rendering nothing claims nothing, and is the only state that is honest
     both while the endpoint is missing and while it is merely down: the empty state is still not
     allowed, because "Litos is not storing any files for you" is a claim a request that failed
     cannot make. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirming, setConfirming] = useState<DocumentSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);

  const dialog = useRef<HTMLDialogElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  /* The Remove control each row drew, so closing the confirmation can put focus back where it came
     from. A Map keyed by document id and not a single ref, because there is one trigger per row and
     which one opened the dialog is the only thing that can answer where focus belongs. */
  const removeButtons = useRef(new Map<string, HTMLButtonElement | null>());
  const finishDocumentDialogClose = useCallback(() => {
    const node = dialog.current;
    if (node?.open) node.close();
  }, []);
  const {
    closing: documentDialogClosing,
    requestClose: requestDocumentDialogClose,
    resetExit: resetDocumentDialogExit,
  } = useDashboardOverlayExit({
    dialogRef: dialog,
    nativeBackdrop: true,
    onExitComplete: finishDocumentDialogClose,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await listUserDocuments();
        if (!cancelled) {
          setDocuments(result.documents ?? []);
          setLoadFailed(false);
        }
      } catch {
        /* Never swallowed into an empty list, and never drawn as an error either. "You have no
           files" is a claim about what Litos is holding that a failed request cannot make, and an
           error card is a claim that something is wrong with HER account when the likely cause is
           that this half of the feature reached production first. The section simply is not there.
           No retry control, for the same reason: a button that reloads a route which does not exist
           is an invitation to press it until she believes she has lost something. */
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Opened from an effect and not from the click handler, so the dialog is shown only after React
     has committed the file it names. Called the other way round it opens on the previous render's
     content, which for one frame is a confirmation naming the wrong file, or naming none. */
  useEffect(() => {
    if (!confirming) return;
    resetDocumentDialogExit();
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    /* Focus lands on Keep, never on Remove. Left to the browser's own dialog-focusing rule it would
       take the first focusable element in the dialog, and a destructive control sitting under a
       freshly pressed Enter or Space is how a confirmation step becomes a formality. Queried rather
       than held on a ref because Button forwards no ref: it types its props as
       ComponentPropsWithoutRef. */
    dialog.current?.querySelector<HTMLElement>("[data-confirm-keep]")?.focus();
  }, [confirming, resetDocumentDialogExit]);

  async function remove(file: DocumentSummary) {
    /* The re-entry guard the disabled attribute used to provide. See the confirm button below for
       why it is aria-disabled now: a disabled control drops focus, and this dialog cannot afford
       that on the one path where something has gone wrong. */
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUserDocument(file.id);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "Litos could not remove that file. Nothing was deleted.");
      setDeleting(false);
      return;
    }
    setDocuments((current) => (current ?? []).filter((item) => item.id !== file.id));
    removeButtons.current.delete(file.id);
    setRemoved(`${file.file_name} was removed from Litos.`);
    setDeleting(false);
    requestDocumentDialogClose();
  }

  const empty = documents !== null && documents.length === 0;

  /* After every hook, because a component may not change how many it runs. Nothing at all is drawn:
     no heading, no shimmer left stranded, no error. See loadFailed. */
  if (loadFailed) return null;

  return (
    <Card className="scroll-mt-24 p-6" id="documents">
      <h2 className="text-base font-medium text-ink">Documents</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Files you attached to an application yourself. Litos stores them encrypted so a later
        application can use the same file, and keeps them until you remove them here.
      </p>

      {/* Rendered whether or not there is anything to announce. A live region inserted into the page
          in the same commit as its text is a live region a screen reader may never read, because
          there was no region there to observe a change in. */}
      <p
        ref={status}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={`text-sm leading-6 text-positive outline-none ${removed ? "mt-4" : ""}`}
      >
        {removed}
      </p>

      {documents === null && <div className="rq-shimmer mt-5 h-11 rounded-inner" />}

      {/* The empty state most students will see forever, which is why it is one sentence with no
          control under it. There is nothing to do here: a document arrives because an employer's
          form asked for one, from that application's own screen. */}
      {empty && (
        <p className="mt-5 text-sm leading-6 text-muted">
          Litos is not storing any files for you. If an employer&apos;s form asks for one, you can
          attach it from that application.
        </p>
      )}

      {documents && documents.length > 0 && (
        <ul className="mt-5 space-y-2">
          {documents.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-inner border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{file.file_name}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">
                  {formatDocumentBytes(file.byte_size)}
                  {file.created_at ? ` · Added ${formatDate(file.created_at)}` : ""}
                  {/* Said out loud rather than left blank, because a gap in a row of facts reads as
                      missing data. A file attached to one application and never reused is the
                      ordinary case, not an incomplete record. */}
                  {file.last_used_at
                    ? ` · Last used ${formatRelativeDate(file.last_used_at)}`
                    : " · Not used on an application yet"}
                </p>
              </div>
              <button
                type="button"
                ref={(element) => {
                  removeButtons.current.set(file.id, element);
                }}
                onClick={() => {
                  setDeleteError(null);
                  setRemoved(null);
                  setConfirming(file);
                }}
                /* Named for the file, not just "Remove". Down a column of identical controls the
                   bare word tells a screen reader user nothing about which file this one deletes. */
                aria-label={`Remove ${file.file_name}`}
                className="min-h-11 shrink-0 px-2 text-sm font-medium text-danger"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Native <dialog>, matching the account-deletion confirmation on this same page rather than
          the hand-built role="dialog" the applications page uses. The browser supplies the focus
          trap, the Escape handling and the inert background. This product already carries two
          hand-built traps with two different bugs, and a third one written here would earn a
          third. */}
      <dialog
        ref={dialog}
        aria-labelledby="remove-document-title"
        aria-describedby="remove-document-description"
        aria-hidden={documentDialogClosing || undefined}
        inert={documentDialogClosing || undefined}
        /* Escape is disarmed only while the request is in flight, so a half-finished delete cannot
           be closed out from under its own error message. */
        onCancel={(event) => {
          event.preventDefault();
          if (!deleting) requestDocumentDialogClose();
        }}
        onClick={(event) => {
          if (event.target === dialog.current && !deleting) requestDocumentDialogClose();
        }}
        onClose={() => {
          const closed = confirming;
          setConfirming(null);
          setDeleting(false);
          /* Focus goes back to the control that opened this, unless that control has just been
             deleted along with its row. Then it goes to the line that says so, which is both the
             announcement and the nearest thing to where she was. A dialog that closes onto nothing
             drops a keyboard user back at the top of the document. */
          const trigger = closed ? removeButtons.current.get(closed.id) : null;
          window.requestAnimationFrame(() => {
            if (trigger?.isConnected) trigger.focus();
            else status.current?.focus();
          });
        }}
        className={`rq-dashboard-dialog m-auto w-[min(92vw,480px)] rounded-card border border-border bg-surface p-0 text-ink shadow-overlay backdrop:bg-ink/35 ${documentDialogClosing ? "rq-dashboard-dialog-exit" : ""}`}
      >
        {confirming && (
          <form
            method="dialog"
            className="p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void remove(confirming);
            }}
          >
            <p className="text-label text-danger">{DOCUMENT_REMOVAL_KICKER}</p>
            <h2 id="remove-document-title" className="mt-2 text-heading">
              {documentRemovalTitle(confirming.file_name, confirming.kind)}
            </h2>
            {/* WHAT DELETION REACHES, AND WHAT IT CANNOT, from lib/document-removal.ts because the
                upload modal deletes the same object through the same endpoint and has to say the
                same thing. This copy used to open with "Any application you have not sent yet stops
                carrying it", which nothing in the request does: DELETE /documents/:id deliberately
                leaves every application's own pointer alone so a sent one can still name what went
                out with it. */}
            <div id="remove-document-description" className="mt-3 space-y-3 text-sm leading-6 text-muted">
              {DOCUMENT_REMOVAL_CONSEQUENCES.map((line) => <p key={line}>{line}</p>)}
            </div>
            {/* In the DOM from the moment the dialog opens, empty until there is something to say,
                for the reason the status line above states: a live region inserted in the same
                commit as its text is one a screen reader may never observe a change in. `alert`
                rather than `status` because a delete that did not happen is not a background
                update, and ONE element rather than an ErrorNote inside a live wrapper, because a
                region nested in a region is two announcements or none depending on the reader. This
                is the shape the password error on this same page already uses, made persistent. */}
            <p
              role="alert"
              aria-live="assertive"
              className={`text-sm leading-6 text-danger ${deleteError ? "mt-4" : ""}`}
            >
              {deleteError ? userFacingError(deleteError) : ""}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                data-confirm-keep="true"
                variant="secondary"
                type="button"
                aria-disabled={deleting}
                onClick={() => {
                  /* Same reasoning as the submit control beside it: Escape is already disarmed
                     mid-flight, and a Keep that disables itself under a pointer that just clicked it
                     is one more way for focus to leave the dialog. */
                  if (deleting) return;
                  requestDocumentDialogClose();
                }}
              >
                {DOCUMENT_REMOVAL_KEEP_LABEL}
              </Button>
              {/* aria-disabled, NOT disabled, and it is the failure path that decides it. Disabling
                  the control that is submitting removes it from the tab order while it holds focus,
                  so the browser drops focus to <body>: outside the dialog, outside the trap, with
                  the alert above rendering to nobody. A screen reader user whose delete failed was
                  left at the top of the document with no announcement and no idea whether her file
                  was gone. Kept focusable, focus never moves, and the alert lands on someone who is
                  still standing in front of it. Button already styles aria-disabled the same way it
                  styles disabled; `remove` guards the second press. */}
              <Button variant="danger" type="submit" aria-disabled={deleting} aria-busy={deleting}>
                {deleting ? DOCUMENT_REMOVAL_BUSY_LABEL : DOCUMENT_REMOVAL_CONFIRM_LABEL}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </Card>
  );
}
