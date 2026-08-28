/**
 * One way to write a file size, one cap, and one refusal message, for every surface that moves a
 * student's file toward the API.
 *
 * The formatter lived inside TranscriptModal, which was fine while the modal was the only screen
 * that could name a stored file. Profile > Documents lists the same files, and two independently
 * written formatters is how a transcript reads "1.2 MB" on the upload screen and "1178 KB" on the
 * page she deletes it from, leaving her to work out whether those are the same file. The size gate
 * then repeated the same history: four upload surfaces each hand-rolled the type check, the byte
 * cap, and the oversize sentence, and the copies had already drifted (one hand-rolled its own MB
 * math, one still promised a 20 MB ceiling no request could reach).
 *
 * DECIMAL MB, NOT MIB, and that is the load-bearing decision. The cap this product enforces is
 * 4,000,000 bytes, and a student comparing the size her file manager reports against the number in
 * Litos's copy has to get the same answer from both. macOS Finder and Windows Explorer both report
 * decimal MB. Binary units would make a 4,100,000 byte file read as "3.9 MB" next to a refusal that
 * says the limit is 4 MB.
 */

/**
 * THE CAP IS 4 MB, and every number in upload copy derives from this constant.
 *
 * The backend's global multipart limit is two and a half times that, and its number is the one a
 * file picker would naturally promise. It is not a number this product can keep. The managed sandbox
 * carries an upload to the browser as base64 and refuses any file over 6,000,000 characters, about
 * 4.29 MiB decoded, per file, before a browser opens; and there is no request-body limit in front of
 * that check, so a larger body may instead be rejected by the platform with no error envelope at
 * all, which is indistinguishable from an outage. Promising the multipart limit would be true on
 * direct-Playwright portals and false on managed ones, which is the worst of the three available
 * options.
 *
 * The multipart figure is described rather than written out because it is the wrong number for this
 * product to carry in any searchable form: a later grep for it, hunting stale copy, should not find
 * a hit in the comment that exists to say it is not the cap.
 *
 * Checked client-side as well as server-side so a student who picks a 9 MB scan is told in the modal
 * rather than after an upload she waited through.
 */
export const MAX_APPLICATION_DOCUMENT_BYTES = 4_000_000;

/**
 * The cap as prose. Every "up to 4 MB" in upload copy renders this string, so the promise cannot
 * drift from the byte count the gate enforces.
 */
export const APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL = `${Math.floor(MAX_APPLICATION_DOCUMENT_BYTES / 1_000_000)} MB`;

export function formatDocumentBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export type ApplicationDocumentAccept = "pdf" | "pdf-or-docx" | "pdf-or-txt" | "csv";

/** The options one upload surface hands the gate: which formats, and its own refusal sentences. */
export type ApplicationDocumentGate = {
  accept: ApplicationDocumentAccept;
  typeMessage: string;
  oversizeHint?: string;
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * One spelling per accept kind for the file input's `accept` attribute, so the picker's filter and
 * the gate's check cannot drift apart: a kind widened in matchesAccept without a matching attribute
 * would leave the picker hiding files the gate now allows, and vice versa. Extensions ride along
 * with the media types because a valid file can arrive with an empty `type`, and an attribute of
 * bare media types would hide it from the picker that the gate was written to admit.
 */
export const APPLICATION_DOCUMENT_ACCEPT_ATTRIBUTE: Record<ApplicationDocumentAccept, string> = {
  pdf: "application/pdf,.pdf",
  "pdf-or-docx": `application/pdf,.pdf,${DOCX_MIME},.docx`,
  "pdf-or-txt": "application/pdf,.pdf,text/plain,.txt",
  csv: "text/csv,.csv",
};

/**
 * The remedy sentence for an oversize resume-shaped document, shared by the surfaces that show it
 * so a copy edit cannot leave two of them refusing the same file with different instructions.
 */
export const OVERSIZE_DOCUMENT_HINT = 'Export a smaller file (most editors have a "reduce file size" option) and try again.';

/* The media type OR the extension. A file dragged out of some file managers arrives with an empty
   `type`, and refusing it here would be refusing a valid file for a reason the student cannot see.
   The server checks again, so this is only about telling her before an upload she waited through. */
function matchesAccept(file: Pick<File, "name" | "type">, accept: ApplicationDocumentAccept): boolean {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  switch (accept) {
    case "pdf":
      return isPdf;
    case "pdf-or-docx":
      return isPdf || file.type === DOCX_MIME || /\.docx$/i.test(file.name);
    case "pdf-or-txt":
      return isPdf || file.type === "text/plain" || /\.txt$/i.test(file.name);
    case "csv":
      return file.type === "text/csv" || /\.csv$/i.test(file.name);
  }
}

/**
 * The one client-side gate in front of every file the website sends the API. Returns the sentence
 * to show the student, or null when the file may upload.
 *
 * THE SIZE CHECK MUST BE CLIENT-SIDE, because past the cap there is no readable error to show. The
 * platform rejects a larger request body before the backend runs, as a plain-text 413 with no CORS
 * headers, so the browser surfaces it only as a bare "Failed to fetch" TypeError after the student
 * has waited through the whole upload. Measured 2026-08-29 with a 6 MB PDF against production, and
 * the ceiling is the platform's, not any one route's: every route rides the same serverless
 * function, so a backend limit above MAX_APPLICATION_DOCUMENT_BYTES is a number no request reaches.
 *
 * The oversize sentence never contradicts itself at the boundary. A 4,000,001 byte file formats as
 * "4.0 MB", and "That file is 4.0 MB and the limit is 4 MB" reads as a refusal of a file that is
 * allowed. When the rounded size collapses into the cap, the sentence says "just over" and drops
 * the number instead of printing the contradiction.
 */
export function validateApplicationDocument(
  file: Pick<File, "name" | "size" | "type">,
  options: ApplicationDocumentGate,
): string | null {
  if (!matchesAccept(file, options.accept)) return options.typeMessage;
  if (file.size > MAX_APPLICATION_DOCUMENT_BYTES) {
    const shown = formatDocumentBytes(file.size);
    const lead = shown === formatDocumentBytes(MAX_APPLICATION_DOCUMENT_BYTES)
      ? `That file is just over the ${APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL} limit`
      : `That file is ${shown}, over the ${APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL} limit`;
    return options.oversizeHint ? `${lead}. ${options.oversizeHint}` : `${lead}.`;
  }
  return null;
}
