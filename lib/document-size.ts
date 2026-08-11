/**
 * One way to write a file size, for every surface that shows a student one of her own files.
 *
 * It lived inside TranscriptModal, which was fine while the modal was the only screen that could
 * name a stored file. Profile > Documents lists the same files, and two independently written
 * formatters is how a transcript reads "1.2 MB" on the upload screen and "1178 KB" on the page she
 * deletes it from, leaving her to work out whether those are the same file.
 *
 * DECIMAL MB, NOT MIB, and that is the load-bearing decision. The cap this product enforces is
 * 4,000,000 bytes, and a student comparing the size her file manager reports against the number in
 * Litos's copy has to get the same answer from both. macOS Finder and Windows Explorer both report
 * decimal MB. Binary units would make a 4,100,000 byte file read as "3.9 MB" next to a refusal that
 * says the limit is 4 MB.
 */
export function formatDocumentBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
