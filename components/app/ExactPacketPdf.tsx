"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import { Button } from "@/components/app/Button";
import { verifyPacketPdfBytes, type PacketPdfBinding, type PacketPdfEvidenceVerification } from "@/features/applications";

/* Why every step here is on a clock.
 *
 * This viewer is a send gate. Until it reports a verified render, the review screen refuses to
 * fill any form, so a step that never finishes blocks every application the student has.
 *
 * Measured in production on 2026-08-11: the audit returned real requirement evidence, the exact
 * PDF downloaded and hashed clean, PDF.js parsed it and handed back a correct US Letter viewport,
 * a canvas was created at 918 x 1188, and then nothing. No error, no console output, no timeout,
 * over ninety seconds. The gate sat on "Loading exact PDF" and sending stayed disabled.
 *
 * The reason is that pdfjs-dist has several completion paths that simply stop rather than reject.
 * In pdfjs-dist 6.1.200, `PDFPageProxy.render` gates all painting behind
 * `Promise.all([intentState.displayReadyCapability.promise, optionalContentConfigPromise])`, and
 * neither promise carries a deadline; `InternalRenderTask._next` only settles the render when
 * `operatorList.lastChunk` is set, so a page whose operator list stops arriving leaves
 * `running = false` with nothing scheduled and nothing rejected; and `initializeGraphics` returns
 * silently when the task is already cancelled. Every one of those is a permanently pending promise
 * rather than a thrown error, which is exactly why the browser console stayed empty.
 *
 * Reproduced end to end against a production `next build` by swallowing the worker's
 * GetOperatorList request: the document resolved, the page resolved, the canvas was sized
 * correctly, the render never painted and never settled, and no error reached the console. That is
 * the production signature exactly.
 *
 * So `await` is never used here without a deadline, and a deadline that fires is a visible blocked
 * state with a reason and a retry, never a pass. A gate that cannot prove the bytes must say so
 * out loud and stay shut.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

const TIMEOUT_ERROR = "pdf_timeout";

type PdfFailure = {
  message: string;
  recoverable: boolean;
};

type PdfView =
  | { key: string; state: "loading" }
  | { key: string; state: "failed"; failure: PdfFailure }
  | { key: string; state: "verified"; sha256: string; sizeBytes: number; pageCount: number; rendered: boolean };

type RenderSource = {
  key: string;
  bytes: Uint8Array<ArrayBuffer>;
  sha256: string;
  sizeBytes: number;
};

/** Races one step against a deadline, and lets the caller abandon the work the deadline outran. */
async function withDeadline<T>(work: Promise<T>, timeoutMs: number, abandon: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          /* Reject before abandoning, not after. Cancelling a render task rejects its promise
             synchronously, so abandoning first lets PDF.js win this race with a cancellation and
             the reader is told the render failed when what actually happened is that it never
             answered. The race still handles that rejection, so nothing goes unhandled. */
          reject(new Error(TIMEOUT_ERROR));
          abandon();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function downloadFailure(code: string): PdfFailure {
  if (code === "size_mismatch" || code === "digest_mismatch") {
    return { message: "The PDF does not match the audited packet. Audit this packet again.", recoverable: false };
  }
  if (code === "invalid_pdf") {
    return { message: "The audited file is not a readable PDF. Audit this packet again.", recoverable: false };
  }
  if (code === "invalid_binding") {
    return { message: "The PDF audit is incomplete. Audit this packet again.", recoverable: false };
  }
  if (code === TIMEOUT_ERROR) {
    return { message: "Litos could not download the exact PDF in time.", recoverable: true };
  }
  return { message: "Litos could not load the exact PDF.", recoverable: true };
}

export function ExactPacketPdf({
  auditDigest,
  binding,
  downloadUrl,
  onVerified,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  auditDigest: string;
  binding: PacketPdfBinding;
  downloadUrl: string;
  onVerified: (verified: PacketPdfEvidenceVerification | null) => void;
  timeoutMs?: number;
}) {
  const onVerifiedRef = useRef(onVerified);
  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);
  const verificationKey = `${auditDigest}:${binding.sha256}:${binding.size_bytes}:${downloadUrl}`;
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<PdfView>({ key: verificationKey, state: "loading" });
  const [renderSource, setRenderSource] = useState<RenderSource | null>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const currentView: PdfView = view.key === verificationKey ? view : { key: verificationKey, state: "loading" };

  const retry = useCallback(() => {
    onVerifiedRef.current(null);
    setRenderSource(null);
    setView({ key: verificationKey, state: "loading" });
    setAttempt((current) => current + 1);
  }, [verificationKey]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    onVerifiedRef.current(null);

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    void fetch(downloadUrl, { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("download_failed");
        const bytes = await response.arrayBuffer();
        const result = await verifyPacketPdfBytes(bytes, {
          sha256: binding.sha256,
          size_bytes: binding.size_bytes,
        });
        if (!result.ok) throw new Error(result.reason);
        if (!active) return;
        const pdfBytes = new Uint8Array(bytes);
        setRenderSource({
          key: verificationKey,
          bytes: pdfBytes,
          sha256: result.sha256,
          sizeBytes: result.size_bytes,
        });
        setView({
          key: verificationKey,
          state: "verified",
          sha256: result.sha256,
          sizeBytes: result.size_bytes,
          pageCount: 0,
          rendered: false,
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        /* An abort this effect did not schedule is a teardown, not a failure. */
        if (controller.signal.aborted && !timedOut) return;
        const code = timedOut ? TIMEOUT_ERROR : reason instanceof Error ? reason.message : "download_failed";
        setView({ key: verificationKey, state: "failed", failure: downloadFailure(code) });
      })
      .finally(() => {
        clearTimeout(timer);
      });

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, auditDigest, binding.sha256, binding.size_bytes, downloadUrl, timeoutMs, verificationKey]);

  useEffect(() => {
    if (!renderSource || renderSource.key !== verificationKey || !pagesRef.current) return;
    let active = true;
    let settled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let documentProxy: PDFDocumentProxy | null = null;
    let renderTask: RenderTask | null = null;
    const pages = pagesRef.current;
    pages.replaceChildren();

    /* Tear the stalled work down rather than leaving a worker and a locked canvas behind.
       `cancel` makes the pending render promise reject, which the settled guard then ignores. */
    const abandon = () => {
      try {
        renderTask?.cancel();
      } catch {
        // The task had already finished or been cancelled.
      }
      /* Release the worker too. A wedged one would otherwise sit there holding the document
         while a retry started a second alongside it. */
      if (loadingTask) void loadingTask.destroy().catch(() => {});
    };

    void (async () => {
      const pdfjs = await withDeadline(import("pdfjs-dist"), timeoutMs, abandon);
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
      loadingTask = pdfjs.getDocument({ data: renderSource.bytes.slice() });
      documentProxy = await withDeadline(loadingTask.promise, timeoutMs, abandon);
      const document_ = documentProxy;
      if (!active) return;
      if (document_.numPages < 1) throw new Error("invalid_pdf");
      setView((current) => current.key === verificationKey && current.state === "verified"
        ? { ...current, pageCount: document_.numPages }
        : current);
      for (let pageNumber = 1; pageNumber <= document_.numPages; pageNumber += 1) {
        if (!active) return;
        const page = await withDeadline(document_.getPage(pageNumber), timeoutMs, abandon);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.className = "h-auto w-full bg-white shadow-rest";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Exact audited resume PDF, page ${pageNumber} of ${document_.numPages}`);
        pages.append(canvas);
        /* Each page gets its own deadline so a long but progressing document is not cut off,
           while a single stalled page is still caught inside one timeout. */
        renderTask = page.render({ canvas, viewport });
        await withDeadline(renderTask.promise, timeoutMs, abandon);
        renderTask = null;
      }
      if (!active || settled) return;
      settled = true;
      setView((current) => current.key === verificationKey && current.state === "verified"
        ? { ...current, rendered: true }
        : current);
      onVerifiedRef.current({
        auditDigest,
        sha256: renderSource.sha256,
        sizeBytes: renderSource.sizeBytes,
      });
    })()
      .catch((reason: unknown) => {
        if (!active || settled) return;
        settled = true;
        /* A render that did not finish is never a pass. Readiness is revoked and the reason
           is shown, so the student is told what happened instead of watching a spinner. */
        onVerifiedRef.current(null);
        pages.replaceChildren();
        const message = reason instanceof Error && reason.message === TIMEOUT_ERROR
          ? "Litos could not finish showing the exact audited PDF in time."
          : "The exact PDF could not be parsed and rendered.";
        setView({ key: verificationKey, state: "failed", failure: { message, recoverable: true } });
      });

    return () => {
      active = false;
      abandon();
      pages.replaceChildren();
      /* Both are swallowed because a deadline may already have torn this document down, and a
         teardown reporting that it was torn down twice is not a failure anyone can act on. */
      if (documentProxy) void documentProxy.cleanup().catch(() => {});
      if (loadingTask) void loadingTask.destroy().catch(() => {});
    };
  }, [auditDigest, renderSource, timeoutMs, verificationKey]);

  if (currentView.state === "loading") {
    return <p role="status" className="rounded-inner bg-panel-soft px-4 py-3 text-sm text-muted">Loading and verifying the exact resume PDF.</p>;
  }
  if (currentView.state === "failed") {
    return (
      <div role="alert" className="space-y-3 rounded-inner bg-danger-soft px-4 py-3 text-sm text-danger">
        <p>{currentView.failure.message}</p>
        <p className="text-xs">Litos will not fill any form until the exact audited PDF is shown here.</p>
        {currentView.failure.recoverable && (
          <Button type="button" size="sm" variant="secondary" onClick={retry}>Try showing it again</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div ref={pagesRef} aria-label="Exact audited resume PDF" className="max-h-[70vh] min-h-[620px] space-y-4 overflow-y-auto rounded-inner border border-border bg-panel-soft p-3" />
      <p role="status" className={`text-xs ${currentView.rendered ? "text-positive" : "text-muted"}`}>
        {currentView.rendered
          ? `Exact audited PDF loaded, ${currentView.pageCount} ${currentView.pageCount === 1 ? "page" : "pages"}.`
          : "Parsing and rendering the verified PDF."}
      </p>
    </div>
  );
}
