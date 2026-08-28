/**
 * Strips application-form chrome out of a captured job description before anything renders or
 * scores it.
 *
 * `jd_text` is a page capture, and on an apply-page capture (Lever's /apply URL is the live
 * example: Belvedere Trading, 2026-08-28) the text carries the FORM, not just the posting: "SUBMIT
 * YOUR APPLICATION", "ATTACH RESUME/CV", bare field labels ("Full name", "Email", "Phone"), lone
 * required-field asterisks, the LinkedIn autofill pitch, and literally the word "Loading". Rendered
 * under the heading "Job description" that reads as a broken product, and scored it is worse: the
 * matcher counted "loading" as a requirement and highlighted it as a gap in the resume.
 *
 * LINE-BASED AND CONSERVATIVE, BY DESIGN. Only whole lines matching known chrome are dropped,
 * because this text is the evidence a student reads before trusting a send. No tail-drop from
 * "SUBMIT YOUR APPLICATION": Lever puts the form after the posting, but a capture that caught only
 * the form would then clean down to nothing, and a pattern list can be audited line by line while a
 * positional rule cannot. Anything dropped is returned in `removedLines`, so every renderer can
 * offer the raw capture instead of silently hiding text.
 *
 * The packet-audit path must NEVER receive cleaned text: exactPacketAuditRanges binds clause
 * offsets to the exact stored jd_text, and display cleaning would shift every range. This function
 * is for the draft (unaudited) surfaces only.
 */

/* Lines that only an ATS application form renders. One of these must be present before any
   cleaning happens at all: a pasted or scraped posting with no form on it never contains them, so
   gating on them keeps the field-label patterns below from eating a legitimate JD line that is
   exactly "Email" or "Cover Letter" (a how-to-apply heading, for example). */
const STRONG_CHROME_MARKERS: readonly RegExp[] = [
  /^submit your application$/i,
  /^apply for this job$/i,
  /^submit application$/i,
  /^attach resume\/?cv$/i,
  /^authorize sharing of selected$/i,
  /^auto-?complete this form\.?\s*(learn more)?$/i,
];

const CHROME_LINE_PATTERNS: readonly RegExp[] = [
  /^submit your application$/i,
  /^apply for this job$/i,
  /^apply now$/i,
  /^submit application$/i,
  /^loading[.…\s]*$/i,
  /^[.…]+$/,
  /^attach resume\/?cv$/i,
  /^resume\/?cv[\s*✱✲❋]*$/i,
  /^cover letter[\s*✱✲❋]*$/i,
  /^[*✱✲❋]+$/,
  /^(full name|first name|last name|email|e-mail|phone|phone number|current location|current company|pronouns)[\s*✱✲❋]*$/i,
  /^(linkedin|github|portfolio|twitter|x|website|other) (profile|url)[\s*✱✲❋]*$/i,
  /^authorize sharing of selected$/i,
  /^linkedin profile details to$/i,
  /^auto-?complete this form\.?\s*(learn more)?$/i,
  /^learn more$/i,
  /^required fields?[\s*✱✲❋]*$/i,
];

export type CleanedJdCapture = {
  /** What the draft surfaces should render and score. */
  text: string;
  /** Every line the cleaner removed, in order, so the raw capture stays one click away. */
  removedLines: string[];
};

export function cleanJdCapture(jdText: string | null | undefined): CleanedJdCapture {
  const raw = jdText ?? "";
  if (!raw.trim()) return { text: raw, removedLines: [] };
  const lines = raw.split(/\r?\n/);
  /* No strong marker means this is not a form capture, so nothing is touched. */
  if (!lines.some((line) => STRONG_CHROME_MARKERS.some((pattern) => pattern.test(line.trim())))) {
    return { text: raw, removedLines: [] };
  }
  const removedLines: string[] = [];
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && CHROME_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      removedLines.push(trimmed);
      continue;
    }
    kept.push(line);
  }
  if (removedLines.length === 0) return { text: raw, removedLines };
  /* Dropping lines leaves runs of blanks where the form sat; collapse them so the pane does not
     render the removal as a hole. */
  const text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  /* A capture that was ONLY form chrome must come back untouched rather than empty: an empty
     result renders "posting text was not saved" (false) in the packet modal and leaves the match
     ring loading forever, and hiding all stored text contradicts the disclosure rule above. */
  if (!text) return { text: raw, removedLines: [] };
  return { text, removedLines };
}
