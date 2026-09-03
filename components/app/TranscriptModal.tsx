"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/app/Button";
import { Chip } from "@/components/app/ui";
import { useDashboardOverlayExit } from "@/components/app/useDashboardOverlayExit";
import {
  attachApplicationDocument,
  attachStoredApplicationDocument,
  deleteUserDocument,
  detachApplicationDocument,
  listUserDocuments,
  recordOrderedApplicationDocument,
  type AttachedDocument,
  type DocumentSummary,
  type RequiredDocumentAsk,
} from "@/lib/api";
import {
  APPLICATION_DOCUMENT_ACCEPT_ATTRIBUTE,
  APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL,
  formatDocumentBytes,
  validateApplicationDocument,
} from "@/lib/document-size";
import {
  DOCUMENT_REMOVAL_BUSY_LABEL,
  DOCUMENT_REMOVAL_CONFIRM_LABEL,
  DOCUMENT_REMOVAL_CONSEQUENCES,
  DOCUMENT_REMOVAL_KEEP_LABEL,
  DOCUMENT_REMOVAL_KICKER,
  documentRemovalTitle,
} from "@/lib/document-removal";
import {
  DOCUMENT_REUSE_ACTION_LABEL,
  DOCUMENT_REUSE_BUSY_LABEL,
  DOCUMENT_REUSE_DESCRIPTION,
  reusableDocumentsForAsk,
} from "@/lib/document-reuse";

/* THE ONE PLACE A STUDENT HANDS LITOS A FILE OF HER OWN.
 *
 * Three states of one component, because they are three moments of one conversation and splitting
 * them into three files is how the second one grows a different privacy sentence from the first:
 *
 *   ask       the employer asks for a document and Litos has none
 *   official  the same, except the employer asked for an OFFICIAL copy, which Litos cannot produce
 *   attached  the file is stored, encrypted, and on this application
 *
 * WHAT THIS SCREEN PROMISES, and where each half of it is kept:
 *
 *   "Stored encrypted"           the bytes are sealed before they reach the blob store, because a
 *                                Vercel Blob object is public-read forever to anyone holding its URL
 *   "Attached only to employers  the file is sent only where a form has a control asking for it
 *    whose form asks for it"
 *   "Litos does not read what    nothing parses it. No grade, no GPA, no text extraction anywhere
 *    is inside it"               in the product
 *   "keep it until you remove    which is why Remove this file exists on the attached state. The
 *    it"                         privacy page makes that sentence and this control is what makes it
 *                                true, so it is not optional decoration
 *
 * The shell is ApplicationPacket's, including the onCloseRef indirection, deliberately and not by
 * habit: this modal opens from the applications page where that dialog already lives, and a second
 * modal pattern on one page is how two focus traps end up with two different bugs.
 */

type Stage = "ask" | "official" | "attached";

export function TranscriptModal({
  applicationId,
  kind,
  ask,
  attachment,
  company,
  role,
  onAttachmentChange,
  onReviewApplication,
  onClose,
}: {
  applicationId: string;
  kind: string;
  /** The employer's ask, when a run has measured one. Null on a reopen after the ask has cleared. */
  ask: RequiredDocumentAsk | null;
  attachment: AttachedDocument | null;
  company: string;
  role: string;
  onAttachmentChange: (kind: string, attachment: AttachedDocument | null) => void;
  /** Forward to the application this was blocking. The attached state does NOT go back to a list. */
  onReviewApplication: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  /* onClose is read through a ref so the focus trap can depend only on the overlay lifecycle's
     stable requestClose function. The 2.5s submission poll re-renders this modal's parent on every
     tick, and an effect keyed on onClose would tear the focus trap down and rebuild it each time,
     running the cleanup's focus restore and throwing a keyboard user out while she is reading. */
  const onCloseRef = useRef(onClose);
  /* Assigned in an effect, not during render: writing a ref during render is a React rule violation
     because it mutates state the renderer may discard. */
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const { closing, requestClose } = useDashboardOverlayExit({
    dialogRef: dialog,
    backdropRef: backdrop,
    onExitComplete: () => onCloseRef.current(),
  });

  const [chosen, setChosen] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  /* Default ON, and the checkbox says so. It is the whole reason the file is stored rather than
     forwarded: the next employer that asks gets it without asking her again. */
  const [reuse, setReuse] = useState(true);
  const [unofficialChosen, setUnofficialChosen] = useState(false);
  /* THE SAME CONFIRMATION THE ACCOUNT PAGE ASKS FOR, because it is the same object and the same
     endpoint. "Remove this file" here used to delete permanently on one click, with no confirmation
     and nothing said about what deletion does and does not reach, while the Documents section on the
     account page confirmed first and explained. One object cannot carry two answers to "what happens
     if I press this", and the weaker of the two was the one sitting beside a green Send button. */
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [busy, setBusy] = useState<"attaching" | "ordering" | "detaching" | "removing" | null>(null);
  /* Which library row is in flight, so the press she made wears the busy word and the others stay
     readable. `busy` alone cannot say it: every row would report itself as attaching. */
  const [reusingDocumentId, setReusingDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Files she has already given Litos, for the picker above the drop zone.
   *
   * `null` IS "NOT LOADED", NOT "NONE", and the two must not render the same. A failed or pending
   * load draws no picker at all rather than an empty one, because an empty picker is a claim about
   * her library - "you have nothing stored" - that a request which never answered has not earned.
   * The same discipline DocumentsCard holds for the same reason: this frontend deploys separately
   * from the API, so GET /documents may simply not be there yet, and a screen that reports that as
   * an empty library would send her to re-export a file she already gave us. */
  const [library, setLibrary] = useState<DocumentSummary[] | null>(null);
  /* Whether this modal OPENED on a file that was already attached, captured once from the first
     render's props and never recomputed. That is the "Manage file" press from a settled checklist
     row, and it has no picker to draw and no use for the list, so it does not spend the request.
     Read off the initial props rather than off `stage`, which the 2.5s poll rewrites: a live
     reading would start a request the moment a poll happened to land between a detach and a
     re-render, which is the one moment this modal is already busy. */
  const [openedAttached] = useState(() => Boolean(attachment?.attached_at));
  /* What this modal has DONE, which is not the same as what the page last heard from the server.
     The parent is told immediately, but the poll can still land with a pre-upload envelope in the
     same second, and without a local record the screen would flip from "Transcript attached" back to
     the empty form a beat after a successful upload. `undefined` means this modal has changed
     nothing and the prop is the truth; `null` means it removed the file. */
  const [localAttachment, setLocalAttachment] = useState<AttachedDocument | null | undefined>(undefined);
  /* Only the upload response carries a byte count. On a reopen there is a filename and no size, and
     a size invented from nothing is worse than a chip without one. */
  const [localSize, setLocalSize] = useState<number | null>(null);

  /* Read the library ONCE, on open, and never again.
   *
   * Skipped entirely when the modal opened onto an attached file, and keyed on THAT rather than on
   * the stage even though the stage is what decides whether a picker is drawn. The stage is derived
   * from props the 2.5s submission poll rewrites on every tick, so an effect depending on it would
   * fire again on a tick that changed nothing, and a request in flight while she is choosing is a
   * list that can reorder under her cursor. `openedAttached` is a first-render capture and never
   * changes, so this runs at most once per open.
   *
   * The list is a snapshot on purpose. It goes stale the moment she uploads from another tab, and
   * that is survivable: the attach endpoint is the authority and answers a stale row with a 404 she
   * is told to reload on. Refreshing it live would buy a row she did not ask for, at the cost of a
   * poll the modal does not otherwise need.
   *
   * A FAILURE IS SWALLOWED, deliberately and only here. Nothing about this request is load-bearing:
   * every path this modal already had still works without it, and the upload she came for is
   * untouched. Surfacing "Litos could not list your files" over a drop zone that works would be an
   * error message about a control she cannot see. */
  useEffect(() => {
    if (openedAttached) return;
    let live = true;
    listUserDocuments()
      .then((result) => { if (live) setLibrary(result.documents ?? []); })
      .catch(() => { /* left as null, which draws no picker. See the state's comment. */ });
    return () => { live = false; };
  }, [openedAttached]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (dialog.current?.hasAttribute("inert")) {
        if (event.key === "Tab") event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      /* `input` is in this list and is not in ApplicationPacket's, which is the one deliberate
         difference from the shell this copies. That dialog is all buttons and links; this one has a
         file input and a checkbox, and a ring computed from a selector that cannot see them puts the
         real last focusable element outside the ring, so Tab walks straight out into the page behind
         an aria-modal dialog. */
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && rect.width > 0
          && rect.height > 0;
      });
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      window.requestAnimationFrame(() => {
        previous?.focus?.();
        if (previous?.isConnected && document.activeElement === previous) return;
        const taskHeading = document.getElementById("application-ledger-heading");
        const pageHeading = document.querySelector<HTMLElement>("main h1");
        const fallback = taskHeading instanceof HTMLElement ? taskHeading : pageHeading;
        fallback?.focus({ preventScroll: true });
      });
    };
  }, [requestClose]);

  /* Focus lands on Keep, never on Remove, exactly as it does in the account page's dialog. Left
     where it was, the destructive control appears under a finger already on Enter and the
     confirmation step is a formality. Queried rather than held on a ref because Button forwards
     none: it types its props as ComponentPropsWithoutRef. */
  useEffect(() => {
    if (!confirmingRemoval) return;
    /* Scrolled to before it is focused, because the two are in different boxes. The confirmation
       renders in the body, which scrolls; Keep and Remove are in the footer, which does not. Focusing
       the footer moves nothing, so on a short viewport the buttons would appear under a panel she
       cannot see. */
    dialog.current?.querySelector<HTMLElement>("#remove-document-description")?.scrollIntoView({ block: "nearest" });
    dialog.current?.querySelector<HTMLElement>("[data-confirm-keep]")?.focus();
  }, [confirmingRemoval]);

  const current = localAttachment === undefined ? attachment : localAttachment;
  const officialRequested = ask?.official_requested ?? current?.official_requested ?? false;
  /* The employer's own words, as far as they survived. The label is clipped to 120 characters before
     anything can read it and the original is not stored anywhere recoverable, which is why the
     heading below says "Their wording" and never claims to quote the whole sentence. */
  const wording = (ask?.label ?? current?.employer_label ?? "").trim();
  const stage: Stage = current?.attached_at
    ? "attached"
    : officialRequested && !unofficialChosen
      ? "official"
      : "ask";
  /* Branched, not interpolated, and the header one screen below already branches on the same value
     for the same reason. `role` is empty on any packet whose job_context never carried one, and the
     single template read "transcript for  at Databricks": a doubled space and a preposition with
     nothing after it. On a dialog's aria-label that is not a layout blemish nobody sees, it is the
     sentence a screen reader announces the moment this opens. */
  const dialogName = role ? `${kind} for ${role} at ${company}` : `${kind} for ${company}`;
  const fileName = current?.file_name ?? chosen?.name ?? "";
  const shownSize = localSize ?? (stage === "attached" ? null : chosen?.size ?? null);
  /** True only when this modal performed the upload, so the reuse choice on screen is this file's. */
  const reuseKnown = localAttachment !== undefined && localAttachment !== null;
  /* The stored files this ask may be answered with. Empty until the load lands, and empty forever if
     it failed, so the picker below simply is not drawn - see the `library` state for why that is the
     honest reading of a request that never answered. */
  const reusable = reusableDocumentsForAsk(library, kind);

  function choose(file: File | null | undefined) {
    if (!file) return;
    /* Type check, cap, and refusal copy are the shared gate's (document-size.ts): the same reasons
       the other upload surfaces have them, told before an upload she waited through. */
    const problem = validateApplicationDocument(file, {
      accept: "pdf",
      typeMessage: "Litos takes a PDF here. Save the transcript as a PDF from your student portal, then add it.",
      oversizeHint: "A transcript exported from your portal is usually well under it.",
    });
    if (problem) {
      setChosen(null);
      setError(problem);
      return;
    }
    setError(null);
    setChosen(file);
  }

  async function attach() {
    if (!chosen || busy) return;
    setBusy("attaching");
    setError(null);
    try {
      const result = await attachApplicationDocument(applicationId, {
        file: chosen,
        kind,
        reuse,
        employerLabel: wording || null,
      });
      /* The attach control disappears when this commit changes the stage. Move focus to the one
         control shared by every stage before React removes the initiator, so Chromium never has a
         frame where the aria-modal dialog is open while document.body owns focus. */
      closeButton.current?.focus();
      setLocalAttachment(result.attachment);
      setLocalSize(result.document.byte_size);
      onAttachmentChange(kind, result.attachment);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Litos could not attach that file. Try it again.");
    } finally {
      setBusy(null);
    }
  }

  /* USE A FILE SHE HAS ALREADY GIVEN LITOS, on this application, on one press.
   *
   * The half of the ask this modal could not answer. The server reuses a stored file for a measured
   * ask on its own, but only while a prepare run is happening, so an application prepared before the
   * file existed goes on demanding it and no control anywhere could attach it: three packets on one
   * account asked for the same transcript on 2026-09-03 and each wanted its own upload of the same
   * PDF. lib/document-reuse.ts holds the measurement and the rule for which rows may be offered.
   *
   * SHAPED LIKE attach() ON PURPOSE, down to the focus move. Both commits land on the same state
   * change - the stage becomes "attached" and the control that was pressed stops existing - so both
   * have to move focus onto the one control every stage keeps before React removes the initiator, or
   * Chromium is left with an aria-modal dialog open and focus on document.body.
   *
   * NO byte_size, which is the one thing this path cannot report. The upload response carries the
   * count and this one does not, so `localSize` stays null and the attached state renders the file
   * name without a size chip, exactly as it does on a reopen. An invented size would be a number
   * about her file that nothing measured.
   */
  /* `stored`, never `document`: this component reads the global `document` for the focus trap and
     the scroll lock, and a parameter of that name shadows it inside the one function that is about
     to move focus. */
  async function reuseStored(stored: DocumentSummary) {
    if (busy) return;
    setBusy("attaching");
    setReusingDocumentId(stored.id);
    setError(null);
    try {
      const result = await attachStoredApplicationDocument(applicationId, {
        documentId: stored.id,
        kind,
      });
      closeButton.current?.focus();
      setLocalAttachment(result.attachment);
      onAttachmentChange(kind, result.attachment);
    } catch (reason) {
      /* The endpoint answers wrong-user, wrong-kind, single-use and removed with one 404 and does not
         say which, so this says the only thing true of all four rather than guessing at one of them.
         Reloading is the action, because every one of the four means this list no longer matches
         what the server holds. */
      setError(reason instanceof Error ? reason.message : "Litos could not attach that file. Reload the page and try again.");
    } finally {
      setBusy(null);
      setReusingDocumentId(null);
    }
  }

  async function recordOrdered() {
    if (busy) return;
    setBusy("ordering");
    setError(null);
    try {
      const result = await recordOrderedApplicationDocument(applicationId, kind);
      setLocalAttachment(result.attachment);
      onAttachmentChange(kind, result.attachment);
      requestClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Litos could not record that. Try it again.");
      setBusy(null);
    }
  }

  /* TAKE IT OFF THIS EMPLOYER, AND LEAVE IT IN HER LIBRARY.
   *
   * This is the control the reuse made necessary. A file she uploaded once and marked reusable is
   * now attached to later applications by the prepare run, without asking, which is the promise the
   * checkbox and /privacy both make. The only removal on this screen used to delete the file
   * everywhere, so the answer to "not this employer" was "then Litos forgets the file entirely and
   * asks you for it again next time". Those are two different decisions and each needs its own
   * control: this one is per application, "Remove this file" is the account-level one.
   *
   * NOT STICKY ACROSS A RESTART, said plainly rather than papered over. A later prepare of this same
   * application measures the ask again, finds no record, and reuses the file again. That is the same
   * rule a brand-new application gets, and the invariant that matters holds either way: nothing is
   * sent without her pressing Send, and the attachment is listed at that gate with this control
   * beside it, so a reuse she does not want is one she is shown before it goes anywhere.
   */
  async function detach() {
    if (busy) return;
    setBusy("detaching");
    setError(null);
    try {
      await detachApplicationDocument(applicationId, kind);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Litos could not take that off this application. Try it again.");
      setBusy(null);
      return;
    }
    setLocalAttachment(null);
    setLocalSize(null);
    setChosen(null);
    onAttachmentChange(kind, null);
    setBusy(null);
    /* The stage has just changed under the control that had focus, exactly as it does after a
       delete, and focus would fall to <body>: outside the hand-built trap. */
    closeButton.current?.focus();
  }

  async function remove() {
    const documentId = current?.document_id;
    if (!documentId || busy) return;
    setBusy("removing");
    setError(null);
    /* THE FILE GOES FIRST, then the application's pointer at it, and the order is the whole of the
       error handling here.
       Deleting first means the only half-finished state is "the file is gone and this application
       still names it", which the send gate already catches: the packet builder degrades to no
       document and the fill records no attachment, so the send is refused with a named blocker
       rather than going out short. The other order leaves "the application forgot it and the file is
       still stored", which is the privacy sentence quietly broken with no control left on screen to
       press again. */
    try {
      await deleteUserDocument(documentId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Litos could not remove that file. Nothing was deleted.");
      setBusy(null);
      return;
    }
    try {
      await detachApplicationDocument(applicationId, kind);
    } catch {
      setError("The file is deleted. Litos could not update this application, so start it again before sending it.");
      setBusy(null);
      return;
    }
    setLocalAttachment(null);
    setLocalSize(null);
    setChosen(null);
    setConfirmingRemoval(false);
    onAttachmentChange(kind, null);
    setBusy(null);
    /* The control that had focus has just gone with the state that drew it, and focus would fall to
       <body>: outside the trap, so the next Tab walks into the page behind an aria-modal dialog.
       Close is the one control every state of this modal has. */
    closeButton.current?.focus();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        ref={backdrop}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => requestClose()}
        className={`rq-dashboard-backdrop absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px] ${closing ? "rq-dashboard-backdrop-exit" : ""}`}
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={dialogName}
        aria-hidden={closing || undefined}
        inert={closing || undefined}
        className={`rq-dashboard-dialog relative flex max-h-[92svh] w-full max-w-xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-overlay ${closing ? "rq-dashboard-dialog-exit" : ""}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
              {company}
              {role ? ` · ${role}` : ""}
            </p>
            <h2 className="mt-1 text-lg font-medium tracking-tight text-ink">
              {stage === "attached"
                ? "Transcript attached"
                : stage === "official"
                  ? "This one wants an official transcript"
                  : `${company} asks for your ${kind}`}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {stage === "attached" && <Chip label="Ready" kind="verified" />}
            <button
              ref={closeButton}
              onClick={() => requestClose()}
              className="rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {/* The employer's own words, on every state that is still asking for something. Quoted
              rather than paraphrased, because a student matching this screen against the form in her
              other tab is matching strings, and a paraphrase gives her nothing to match. */}
          {stage !== "attached" && wording && (
            <div className="rounded-inner border border-border bg-surface-alt px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Their wording</p>
                <Chip label="Required" kind="warn" />
              </div>
              <p className="mt-2 border-l-2 border-border pl-3 text-sm leading-6 text-ink">{wording}</p>
            </div>
          )}

          {stage === "official" && (
            <>
              <div role="note" className="mt-4 rounded-inner bg-warn-soft px-4 py-3 text-sm leading-6 text-warn">
                <p>
                  Litos can attach a file you upload. It cannot make your registrar send a sealed transcript, and it
                  will never claim to be you to order one.
                </p>
                <p className="mt-2">
                  If they will only take the sealed copy, order it from your school and tell Litos below. This
                  application then finishes with you rather than with Litos.
                </p>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">
                Some employers write &ldquo;official&rdquo; and accept an unofficial PDF at this stage. If yours does,
                attach the copy from your student portal instead.
              </p>
            </>
          )}

          {stage === "ask" && (
            <>
              {/* THE FILES SHE HAS ALREADY GIVEN LITOS, FIRST, because one press beats an export.
                  Above the upload path and not folded into it: this is a different answer to the
                  ask, not a shortcut through the drop zone, and the reuse checkbox below belongs to
                  the upload alone. When nothing qualifies - which is every account with an empty
                  library, and every account whose GET /documents did not answer - this whole block
                  is absent and the stage is exactly what it was before.

                  ON THE ask STAGE ONLY. The official stage is a different question (Litos cannot
                  make a registrar send a sealed copy, and must not imply a stored PDF settles that),
                  and it already carries its own door into this one: "Attach an unofficial copy
                  anyway" switches the stage here, picker included. */}
              {reusable.length > 0 && (
                <div className="mt-4 rounded-inner border border-border bg-surface-alt px-4 py-4">
                  <p className="text-sm font-medium text-ink">Use a file you already gave Litos</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{DOCUMENT_REUSE_DESCRIPTION}</p>
                  <ul className="mt-3 space-y-2">
                    {reusable.map((file) => (
                      <li
                        key={file.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-inner border border-border bg-surface px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{file.file_name}</p>
                          <p className="mt-0.5 text-xs leading-5 text-muted">{formatDocumentBytes(file.byte_size)}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy !== null}
                          onClick={() => reuseStored(file)}
                          /* Named for the file, the same rule the account page's Remove control
                             keeps: down a column of identical labels the bare words tell a screen
                             reader user nothing about which file this one attaches. */
                          aria-label={`Use ${file.file_name} for this application`}
                        >
                          {reusingDocumentId === file.id ? DOCUMENT_REUSE_BUSY_LABEL : DOCUMENT_REUSE_ACTION_LABEL}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-4 text-sm leading-6 text-ink">
                {reusable.length > 0
                  ? "Or add a new one. An unofficial copy is fine, and the PDF you download from your student portal works."
                  : "An unofficial copy is fine. The PDF you download from your student portal works."}
              </p>
              {/* A label wrapping a visually hidden input, so the whole dashed area is the control
                  for a mouse and the input is still the thing a keyboard and a screen reader reach.
                  A div with an onClick would be neither. */}
              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  choose(event.dataTransfer.files?.[0]);
                }}
                className={`mt-4 flex min-h-[7rem] cursor-pointer flex-col items-center justify-center rounded-inner border border-dashed px-4 py-6 text-center transition-colors ${dragging ? "border-brand bg-brand-soft" : "border-control-border bg-surface-alt hover:border-ink"}`}
              >
                <input
                  type="file"
                  accept={APPLICATION_DOCUMENT_ACCEPT_ATTRIBUTE.pdf}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    /* Cleared so re-picking a same-named file after a refusal still fires change:
                       she re-exports a smaller transcript under the portal's default filename. */
                    event.target.value = "";
                    choose(file);
                  }}
                />
                <span className="text-sm font-medium text-ink">
                  {chosen ? chosen.name : "Drop your transcript here, or browse"}
                </span>
                <span className="mt-1 text-xs text-muted">
                  {chosen && shownSize !== null ? formatDocumentBytes(shownSize) : `PDF, up to ${APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL}`}
                </span>
              </label>

              <label className="mt-4 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={reuse}
                  onChange={(event) => setReuse(event.target.checked)}
                  className="mt-0.5 h-[15px] w-[15px] rounded-[3px] border-control-border bg-surface text-brand-ink focus:ring-brand/30"
                />
                <span>
                  <span className="block text-sm leading-6 text-ink">Reuse this for future applications that ask</span>
                  <span className="block text-xs leading-5 text-muted">
                    Kept until you delete it. Remove it any time below.
                  </span>
                </span>
              </label>

              <p className="mt-4 text-xs leading-5 text-muted">
                Stored encrypted. Attached only to employers whose form asks for it. Litos does not read what is
                inside it, and never uses it to train anything.
              </p>
            </>
          )}

          {stage === "attached" && (
            <>
              <div className="flex items-center gap-3 rounded-inner border border-border bg-surface-alt px-4 py-3">
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-inner bg-teal-soft text-teal-ink">
                  <svg viewBox="0 0 16 16" className="h-4 w-4">
                    <path d="M4 8.5l2.5 2.5L12 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{fileName || "Your transcript"}</span>
                  {shownSize !== null && <span className="block font-mono text-[11px] text-muted">{formatDocumentBytes(shownSize)}</span>}
                </span>
              </div>
              {/* Whether the STORED file is reusable rides on the document, not on the attachment,
                  so a modal reopened later genuinely does not know. It says the neutral thing rather
                  than repeating the default, because "saved for future applications" is a claim
                  about what Litos will go on doing with her transcript. */}
              <p className="mt-4 text-sm leading-6 text-muted">
                {!reuseKnown
                  ? "Attached to this application. Litos keeps it until you remove it."
                  : reuse
                    /* WHAT THE CODE DOES, WHICH IS ATTACH, and no longer what a reader would take
                       "gets this one automatically" to mean. The reuse this promises is real and
                       server-side: the next prepare that measures an ask for this kind attaches this
                       file to that application without asking her. Whether the employer then RECEIVES
                       it is a second question with a second answer - their form has to have a control
                       Litos can fill - and the send gate is where that one is answered. One sentence
                       must not quietly settle both. */
                    ? "Saved for future applications. Litos attaches it to the next application that asks for a transcript, without asking you again."
                    : "Attached to this application only. Litos will ask again the next time an employer wants one."}
              </p>
              {/* THE CONFIRMATION, in the same words the account page uses, from
                  lib/document-removal.ts. Inline rather than a nested dialog: this component already
                  runs a hand-built focus trap that computes its ring from a querySelectorAll over its
                  own subtree, and a second modal opened inside it would be inside that ring and
                  outside the browser's own. One trap, one ring, one step added to it. */}
              {confirmingRemoval && (
                <div
                  role="group"
                  aria-labelledby="remove-document-title"
                  aria-describedby="remove-document-description"
                  className="mt-4 rounded-inner border border-border bg-danger-soft px-4 py-3"
                >
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-danger">
                    {DOCUMENT_REMOVAL_KICKER}
                  </p>
                  <h3 id="remove-document-title" className="mt-2 text-sm font-medium text-ink">
                    {documentRemovalTitle(fileName, kind)}
                  </h3>
                  <div id="remove-document-description" className="mt-2 space-y-2 text-sm leading-6 text-muted">
                    {DOCUMENT_REMOVAL_CONSEQUENCES.map((line) => <p key={line}>{line}</p>)}
                  </div>
                </div>
              )}
            </>
          )}

          {/* In the DOM whatever the state, empty until there is something to say. A live region
              inserted in the same commit as its text is one a screen reader may never observe a
              change in, and the message this most often carries is "nothing was deleted". */}
          <p role="alert" aria-live="assertive" className={`text-xs leading-5 text-danger ${error ? "mt-4" : ""}`}>{error}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4 sm:px-6">
          {stage === "ask" && (
            <>
              {/* Keep the live initiator focusable while its request is pending. Native disabled on
                  a focused button makes Chromium move focus to body, outside this dialog's trap.
                  No-file is still a real disabled state; once a file exists, aria-disabled plus
                  attach()'s synchronous busy guard blocks repeats without removing the focus stop. */}
              <Button
                data-transcript-action="attach"
                onClick={() => void attach()}
                disabled={!chosen}
                aria-disabled={busy !== null}
                aria-busy={busy === "attaching"}
              >
                {busy === "attaching" ? "Attaching..." : "Attach and continue"}
              </Button>
              {/* Closes and does nothing else, and the nothing is the point. This application stays
                  exactly where it is, waiting on her, rather than being cancelled or marked as
                  something she declined. The row on the screen behind is still there afterwards. */}
              <Button onClick={() => requestClose()} variant="secondary" disabled={busy !== null}>Not for this one</Button>
            </>
          )}
          {stage === "official" && (
            <>
              {/* Records the acknowledgement and NOTHING ELSE. It does not unblock the send: Litos
                  cannot produce a sealed transcript, so offering to send after this would be offering
                  to send an application the employer is going to reject. */}
              <Button
                data-transcript-action="order"
                onClick={() => void recordOrdered()}
                aria-disabled={busy !== null}
                aria-busy={busy === "ordering"}
              >
                {busy === "ordering" ? "Saving..." : "I’ve ordered it"}
              </Button>
              <Button
                onClick={() => {
                  closeButton.current?.focus();
                  setUnofficialChosen(true);
                }}
                variant="secondary"
                disabled={busy !== null}
              >
                Attach an unofficial copy anyway
              </Button>
            </>
          )}
          {stage === "attached" && !confirmingRemoval && (
            <>
              {/* FORWARD, to the application this was blocking, not back to a list. She came here
                  from a blocked send and the only useful next thing is that send. */}
              <Button onClick={() => requestClose(onReviewApplication)} disabled={busy !== null}>Review {company} application</Button>
              {/* PER APPLICATION, and not the same decision as the one below it. Litos now attaches a
                  reusable file to later applications by itself, so "I do not want this employer to
                  have it" has to be answerable without also meaning "and forget the file". Secondary
                  rather than quiet: on a screen where a file arrived without her choosing it, taking
                  it off again is an ordinary thing to want, not a destructive one. */}
              <Button
                data-transcript-action="detach"
                onClick={() => void detach()}
                variant="secondary"
                aria-disabled={busy !== null}
                aria-busy={busy === "detaching"}
              >
                {busy === "detaching" ? "Removing..." : `Not for ${company}`}
              </Button>
              {/* The control that makes the privacy sentence true. "We keep it until you remove it"
                  is written on the privacy page, and a promise of removal with nothing in the product
                  that removes it is a promise that is not kept. Quiet, because deleting a file is not
                  the action this screen is recommending. It ASKS now rather than deleting: see
                  confirmingRemoval. */}
              <Button
                onClick={() => {
                  setError(null);
                  setConfirmingRemoval(true);
                }}
                variant="quiet"
                disabled={busy !== null}
              >
                Remove this file
              </Button>
            </>
          )}
          {stage === "attached" && confirmingRemoval && (
            <>
              {/* Keep first and focused, so the destructive control is never the one under a
                  freshly pressed Enter. */}
              <Button
                data-confirm-keep="true"
                variant="secondary"
                onClick={() => {
                  if (busy) return;
                  closeButton.current?.focus();
                  setConfirmingRemoval(false);
                }}
                aria-disabled={busy !== null}
              >
                {DOCUMENT_REMOVAL_KEEP_LABEL}
              </Button>
              {/* aria-disabled, not disabled, for the reason the account page's twin gives: disabling
                  the control that is submitting drops focus to <body>, which here is outside a
                  hand-built trap, and a failed delete then announces to nobody. */}
              <Button
                onClick={() => void remove()}
                variant="danger"
                aria-disabled={busy !== null}
                aria-busy={busy === "removing"}
              >
                {busy === "removing" ? DOCUMENT_REMOVAL_BUSY_LABEL : DOCUMENT_REMOVAL_CONFIRM_LABEL}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
