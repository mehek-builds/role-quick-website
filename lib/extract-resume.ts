/* Client-side resume text extraction for /try (Mehek, 2026-07-08: people
   upload resumes, they don't paste them). The file is read entirely in the
   browser - pdf.js for PDFs, mammoth for DOCX, plain read for TXT - and only
   the extracted TEXT ever leaves the page. This keeps the privacy line
   ("never stored") literal and the server contract unchanged.

   Both parsers are dynamic imports so /try loads without them; they fetch
   only when a file is chosen. The pdf.js worker is vendored at
   public/vendor/pdf.worker.min.mjs (copied from pdfjs-dist on install -
   re-copy if the package major-bumps). */

const MAX_TEXT_CHARS = 10_000; // matches the API's input cap

export type Extraction =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; reason: "no_text" | "unsupported" | "parse_error" };

export async function extractResumeText(file: File): Promise<Extraction> {
  const name = file.name.toLowerCase();
  try {
    let text: string;
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      text = await fromPdf(file);
    } else if (name.endsWith(".docx")) {
      text = await fromDocx(file);
    } else if (name.endsWith(".txt") || file.type.startsWith("text/")) {
      text = await file.text();
    } else {
      return { ok: false, reason: "unsupported" };
    }

    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text.length < 200) {
      // A real resume has more text than this; likely a scan / image-only PDF.
      return { ok: false, reason: "no_text" };
    }
    const truncated = text.length > MAX_TEXT_CHARS;
    return { ok: true, text: text.slice(0, MAX_TEXT_CHARS), truncated };
  } catch {
    return { ok: false, reason: "parse_error" };
  }
}

async function fromPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  const pageCount = Math.min(doc.numPages, 4); // resumes; ignore appendix dumps
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" "),
    );
  }
  void doc.cleanup();
  return pages.join("\n\n");
}

async function fromDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  return result.value;
}
