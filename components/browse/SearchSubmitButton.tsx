"use client";

import { useEffect, useState } from "react";

/**
 * The board's Search button, and the progress it shows while a search is loading.
 *
 * THIS BUTTON MUST NEVER CARRY `disabled`. It did until 2026-08-27, and that single attribute
 * broke every search on the public board - not slowly, and not only under load. The shape was:
 *
 *   <button type="submit" onClick={() => setPending(true)} disabled={pending}>
 *
 * A click on a submit button runs its handlers first and performs the form's submission as the
 * DEFAULT ACTION afterwards. React flushes state synchronously for a trusted click, so `disabled`
 * was already true on the DOM node by the time the browser got there, and the HTML spec says a
 * form is not submitted when its submitter is disabled. The browser skipped it silently: no
 * request, no navigation, no error.
 *
 * Then it deadlocked. `pending` is only ever cleared by `pageshow`, which needs a new document to
 * fire, and no document was ever loaded - so the button sat on "Searching..." forever while the
 * page underneath it never changed. Measured live on trylitos.com: one click on an empty form left
 * `location.href` at /browse-jobs with no query string, `document.readyState` at "complete", and
 * exactly one request in the network log (the original page load).
 *
 * IT DOES NOT REPRODUCE FROM A SCRIPT. `button.click()` submits the form perfectly well, because
 * an untrusted click orders the default action differently. Only a real user click fails, which is
 * why this survived: every scripted check of the button passed.
 *
 * So the pending state is now COSMETIC ONLY - a label and a style hook, on a button that stays
 * enabled and stays submittable. Double-submitting a GET form costs one extra navigation to the
 * same URL, which is a fair price and was never worth paying with the search itself.
 */
export function SearchSubmitButton() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <button
      type="submit"
      onClick={() => setPending(true)}
      /* A marker rather than `disabled`, so the button keeps a waiting affordance without ever
         becoming an inert submitter. See the note above before changing this. */
      data-pending={pending ? "true" : undefined}
      aria-live="polite"
      /* The waiting styles are applied as plain conditional classes rather than through a
         `data-[pending=true]:` variant. Nothing else in this codebase uses an arbitrary data
         variant, so there is no precedent proving the scanner emits it here, and the cost of
         being wrong is a button that silently loses its waiting state. Two literal class names
         the scanner cannot miss are worth more than the tidier variant. */
      className={`min-h-[44px] rounded-control bg-action px-6 text-sm font-medium text-action-ink transition-colors hover:bg-brand-ink sm:col-span-3 lg:col-span-1 lg:self-end${pending ? " cursor-wait opacity-70" : ""}`}
    >
      {pending ? "Searching..." : "Search"}
    </button>
  );
}
