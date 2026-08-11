"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

import { verifyPacketPdfBytes, type PacketPdfBinding } from "@/features/applications";

type VerifiedPacketPdf = {
  auditDigest: string;
  sha256: string;
  sizeBytes: number;
};

type PdfView =
  | { key: string; state: "loading" }
  | { key: string; state: "failed"; message: string }
  | { key: string; state: "verified"; sha256: string; sizeBytes: number; pageCount: number; rendered: boolean };

type RenderSource = {
  key: string;
  bytes: Uint8Array<ArrayBuffer>;
  sha256: string;
  sizeBytes: number;
};

export function ExactPacketPdf({
  auditDigest,
  binding,
  downloadUrl,
  onVerified,
}: {
  auditDigest: string;
  binding: PacketPdfBinding;
  downloadUrl: string;
  onVerified: (verified: VerifiedPacketPdf | null) => void;
}) {
  const onVerifiedRef = useRef(onVerified);
  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);
  const verificationKey = `${auditDigest}:${binding.sha256}:${binding.size_bytes}:${downloadUrl}`;
  const [view, setView] = useState<PdfView>({ key: verificationKey, state: "loading" });
  const [renderSource, setRenderSource] = useState<RenderSource | null>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const currentView: PdfView = view.key === verificationKey ? view : { key: verificationKey, state: "loading" };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    onVerifiedRef.current(null);

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
        if (!active || controller.signal.aborted) return;
        const code = reason instanceof Error ? reason.message : "download_failed";
        const message = code === "size_mismatch" || code === "digest_mismatch"
          ? "The PDF does not match the audited packet."
          : code === "invalid_pdf"
            ? "The audited file is not a readable PDF."
          : code === "invalid_binding"
            ? "The PDF audit is incomplete."
            : "Litos could not load the exact PDF.";
        setView({ key: verificationKey, state: "failed", message });
      });

    return () => {
      active = false;
      controller.abort();
      onVerifiedRef.current(null);
    };
  }, [auditDigest, binding.sha256, binding.size_bytes, downloadUrl, verificationKey]);

  useEffect(() => {
    if (!renderSource || renderSource.key !== verificationKey || !pagesRef.current) return;
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let documentProxy: PDFDocumentProxy | null = null;
    const pages = pagesRef.current;
    pages.replaceChildren();

    void import("pdfjs-dist")
      .then(async (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
        loadingTask = pdfjs.getDocument({ data: renderSource.bytes.slice() });
        documentProxy = await loadingTask.promise;
        if (!active || documentProxy.numPages < 1) throw new Error("invalid_pdf");
        setView((current) => current.key === verificationKey && current.state === "verified"
          ? { ...current, pageCount: documentProxy?.numPages ?? 0 }
          : current);
        for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
          if (!active) return;
          const page = await documentProxy.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.className = "h-auto w-full bg-white shadow-rest";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Exact audited resume PDF, page ${pageNumber} of ${documentProxy.numPages}`);
          pages.append(canvas);
          await page.render({ canvas, viewport }).promise;
        }
        if (!active) return;
        setView((current) => current.key === verificationKey && current.state === "verified"
          ? { ...current, rendered: true }
          : current);
        onVerifiedRef.current({
          auditDigest,
          sha256: renderSource.sha256,
          sizeBytes: renderSource.sizeBytes,
        });
      })
      .catch(() => {
        if (!active) return;
        onVerifiedRef.current(null);
        setView({ key: verificationKey, state: "failed", message: "The exact PDF could not be parsed and rendered." });
      });

    return () => {
      active = false;
      pages.replaceChildren();
      if (documentProxy) void documentProxy.cleanup();
      if (loadingTask) void loadingTask.destroy();
      onVerifiedRef.current(null);
    };
  }, [auditDigest, renderSource, verificationKey]);

  if (currentView.state === "loading") {
    return <p role="status" className="rounded-inner bg-panel-soft px-4 py-3 text-sm text-muted">Loading and verifying the exact resume PDF.</p>;
  }
  if (currentView.state === "failed") {
    return <p role="alert" className="rounded-inner bg-danger-soft px-4 py-3 text-sm text-danger">{currentView.message}</p>;
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
