/* Turn what a phone camera hands back into something the API can actually read.
 *
 * A raw capture is the wrong shape for this upload in three separate ways, and all three are fixed
 * here rather than at the four places a photo could enter:
 *
 * 1. FORMAT. An iPhone stores HEIC, and no model the API calls can read it. Safari decodes HEIC
 *    natively, so drawing it to a canvas and re-encoding is the conversion, with no library and no
 *    server round trip. The API refuses HEIC by name for the cases that get past this.
 * 2. SIZE. A 12 MP capture is 3-5 MB, which sits right on the 4 MB request-body cap that
 *    document-size.ts exists to keep the browser away from. Re-encoded at the long edge below, a
 *    page of text lands in the hundreds of KB.
 * 3. ORIENTATION. A portrait photo carries its rotation in EXIF rather than in its pixels. Drawn
 *    without honouring that, a resume reaches the model on its side, which is a materially worse
 *    read for no reason the student could ever diagnose.
 *
 * The long edge is 2000px on purpose: comfortably above what the vision models resize to
 * internally, and far below what a modern phone captures, so this only ever throws away detail
 * neither provider was going to use. Going lower starts to cost real accuracy on body text.
 */

import { MAX_APPLICATION_DOCUMENT_BYTES } from "./document-size";

export const RESUME_PHOTO_MAX_EDGE = 2000;
const PRIMARY_QUALITY = 0.85;
/* Only reached if a 2000px page of text somehow still clears 4 MB, which no measured capture has.
   It exists so that case is a slightly softer photo rather than a refusal the student cannot act
   on, since the file picker has already closed by the time the size is known. */
const FALLBACK_QUALITY = 0.6;

export type ResumePhotoResult =
  | { ok: true; file: File }
  | { ok: false; reason: "unreadable" | "too_large" };

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Normalize a captured or chosen photo to an upright JPEG within the upload cap.
 *
 * Returns `unreadable` when the browser cannot decode the file at all, which is the honest answer
 * for a HEIC on a browser that does not speak it: there is nothing to re-encode from.
 */
export async function prepareResumePhoto(file: File): Promise<ResumePhotoResult> {
  let bitmap: ImageBitmap;
  try {
    /* from-image, not the default: the default ignores EXIF rotation on some browsers, which is
       exactly the sideways-resume case above. */
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  try {
    const scale = Math.min(1, RESUME_PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return { ok: false, reason: "unreadable" };
    /* White underneath: a transparent PNG flattens to black on JPEG, and black behind dark text is
       an unreadable page rather than a slightly odd one. */
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let blob = await canvasToJpeg(canvas, PRIMARY_QUALITY);
    if (blob && blob.size > MAX_APPLICATION_DOCUMENT_BYTES) {
      blob = await canvasToJpeg(canvas, FALLBACK_QUALITY);
    }
    if (!blob) return { ok: false, reason: "unreadable" };
    if (blob.size > MAX_APPLICATION_DOCUMENT_BYTES) return { ok: false, reason: "too_large" };

    /* Named, not carried over: the original may be an .heic the bytes no longer are, and the API
       cross-checks extension against signature. */
    return {
      ok: true,
      file: new File([blob], "resume-photo.jpg", { type: "image/jpeg", lastModified: Date.now() }),
    };
  } finally {
    bitmap.close();
  }
}

/** Whether a chosen file is a photo, and so needs the normalization above before it uploads. */
export function isPhotoUpload(file: Pick<File, "name" | "type">): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}
