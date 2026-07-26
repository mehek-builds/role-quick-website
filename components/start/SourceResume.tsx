"use client";

/* The student's ORIGINAL upload, drawn at the same sheet proportions as the rebuilt one.
 *
 * This pane exists to make one argument without making it in words: their resume was three pages
 * and dense, and the new one is a single page a recruiter will actually read. That argument only
 * lands if the thing on the left is genuinely THEIR document, so this renders the real uploaded
 * PDF rather than an illustration of one.
 *
 * Deliberately non-interactive. It is evidence, not a control: `pointer-events-none` over the
 * embed stops the browser's PDF viewer from capturing scroll and swallowing the page's own
 * scrolling, and stops a click landing on a PDF toolbar instead of on the choice we are asking
 * them to make.
 */
export function SourceResume({ url, pages }: { url: string | null; pages: number }) {
  return (
    <div
      className="relative aspect-[612/792] w-full overflow-hidden bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_-12px_rgba(0,0,0,0.18)]"
      aria-label={pages > 0 ? `Your uploaded resume, ${pages} pages` : "Your uploaded resume"}
    >
      {url ? (
        <>
          {/* #toolbar=0&navpanes=0&view=FitH strips the viewer chrome so this reads as paper
              rather than as an embedded document viewer. Support varies by browser, which is
              exactly why the wrapper also clips: worst case a toolbar renders and is cropped. */}
          <iframe
            src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            title="Your uploaded resume"
            className="pointer-events-none h-full w-full border-0"
            tabIndex={-1}
          />
          {/* The stack: a hint of the pages underneath, so "3 pages" is something you can see and
              not just a number we assert. Sits inside the clip so it never escapes the sheet. */}
          {pages > 1 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/10 to-transparent"
            />
          )}
        </>
      ) : (
        /* The blob upload is best-effort, so there genuinely may be no file to show. Say that
           plainly instead of rendering an empty sheet that reads as a loading failure. */
        <div className="flex h-full w-full items-center justify-center px-8">
          <p className="max-w-[28ch] text-center text-[13px] leading-6 text-muted">
            We parsed your upload but did not keep a copy of the file, so there is nothing to show
            here. Everything we read from it is on the right.
          </p>
        </div>
      )}
    </div>
  );
}
