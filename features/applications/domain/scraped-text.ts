/**
 * Employer form text, rendered in Litos's voice instead of the employer's DOM.
 *
 * WHY THIS EXISTS
 * ===============
 * Everything on the answers screen and in the packet record is SCRAPED. It arrives as whatever the
 * employer's page happened to contain, and until now it was printed verbatim under Litos's own
 * headings. Measured live 2026-08-29:
 *
 *   prompt  "select all that apply. note: this information will only be used to ensure compliance
 *            with u.s. sanctions..."
 *   label   "Preferred first name* preferred first name preferred_name"
 *
 * The first reads as a product that cannot write a sentence. The second is three captures of ONE
 * field concatenated - the visible label with its required marker, the accessible name, and the raw
 * form key - and it reads as a bug in the record of what was submitted on the applicant's behalf.
 * This is the surface where she decides whether to trust a send, so the presentation is part of the
 * claim.
 *
 * THE JD CLEANER'S RULES, APPLIED TO SHORTER STRINGS
 * ==================================================
 * jd-display.ts shipped the day before and proves the shape, so this follows it deliberately:
 *
 *   NEVER CLEAN TO EMPTY. Every function here returns the original when its result would be blank.
 *   A prompt is the question an employer is asking; losing it entirely is far worse than printing
 *   it awkwardly, and a blank label in the packet record would silently erase evidence.
 *
 *   ONLY REMOVE WHAT IS DEMONSTRABLY DUPLICATE OR MACHINE-FACING. Nothing is paraphrased, reworded
 *   or truncated. The duplicate-fragment rule fires only on an EXACT repeat under normalisation,
 *   and the field-key rule only on a token that cannot be prose (snake_case, camelCase, or a
 *   bracketed path). A label that merely looks redundant to a human is left alone.
 *
 *   CASE IS RESTORED, NEVER IMPOSED. Sentence casing applies only where the source is entirely
 *   lowercase, which is evidence of a machine-lowercased capture rather than an authorial choice.
 *   A prompt with any existing capital is left exactly as the employer wrote it, so acronyms,
 *   product names and deliberate styling survive untouched.
 *
 * THE PACKET-AUDIT PATH MUST NEVER RECEIVE CLEANED TEXT, the same rule jd-display.ts states: audit
 * ranges bind to exact stored bytes, and any edit here would shift them. These are display
 * functions for the review and record surfaces only.
 */

/* Acronyms an application form actually uses, restored when a lowercased capture flattened them.
   Kept short on purpose: an aggressive list uppercases ordinary words that happen to collide.

   BARE "us" IS DELIBERATELY NOT HERE, and its absence is the whole reason this list is restated
   rather than shared with submission-checklist.ts. "Tell us about yourself" and "why do you want to
   work with us" are two of the most common prompts on any application form, and restoring that
   token turns them into "Tell US about yourself". The country is still reached through the dotted
   form below and through "usa", both of which are unambiguous. Losing the uppercase on a rare bare
   "us" costs a capital; the false positive costs the sentence. */
const DISPLAY_ACRONYM_PATTERN = /\b(act|ai|gpa|imc|sat|uk|usa|usc)\b/gi;
const DISPLAY_ACRONYMS: Record<string, string> = {
  act: "ACT",
  ai: "AI",
  gpa: "GPA",
  imc: "IMC",
  sat: "SAT",
  uk: "UK",
  usa: "USA",
  usc: "USC",
};

/* Dotted initialisms, which the word-boundary list above cannot reach: "u.s." is three tokens to a
   \b pattern, so "compliance with u.s. sanctions" stayed lowercase through the acronym pass. */
const DOTTED_INITIALISMS: readonly { pattern: RegExp; display: string }[] = [
  { pattern: /\bu\.s\.a\./gi, display: "U.S.A." },
  { pattern: /\bu\.s\./gi, display: "U.S." },
  { pattern: /\bu\.k\./gi, display: "U.K." },
];

/** Required markers an ATS appends to a visible label. Same two characters the question-metadata
 *  reader recognises (question-review-presentation.ts REQUIRED_MARKER), plus their siblings. */
const TRAILING_REQUIRED_MARKER = /[\s*✱✲❋]+$/;

/**
 * A comparison key for "is this fragment the same text as that one".
 *
 * Case, punctuation, underscores and required markers are all removed, because the three captures
 * of one field differ in exactly those ways: "Preferred first name*", "preferred first name" and
 * "preferred_name" all reduce to "preferredfirstname"... except the third, which reduces to
 * "preferredname" - a genuinely different string. That is why the field-key rule below is separate
 * and does not rely on this.
 */
function fragmentKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** True for a token that is a machine field key rather than anything a person wrote. */
function isRawFieldKey(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  /* snake_case or a dotted path ("preferred_name", "work_authorization_us", "applicant.email"), or
     a bracketed form path ("job_application[answers][3]"). A single ordinary word is NOT a field
     key: "Pronouns" is a real label and must survive.

     THE BRACKET RULE NEEDS A NAME IN FRONT OF THE BRACKET. Matching a bare bracket anywhere in the
     token ate genuine label fragments - "Salary expectation [USD]" and "Rate your experience [1-5]"
     both lose the unit or the scale, which silently changes the question being answered. A form
     path always has an identifier before its first subscript; a bracketed aside in prose does not. */
  return /^[a-z0-9]+(?:[_.][a-z0-9]+)+$/i.test(trimmed) || /^[a-z0-9_.]+\[[^\]]*\]/i.test(trimmed);
}

/**
 * One employer label, with the duplicate captures and the raw key removed.
 *
 * "Preferred first name* preferred first name preferred_name" -> "Preferred first name".
 *
 * HOW THE THREE PIECES ARE TOLD APART. Raw field keys are dropped wherever they appear, because a
 * token that cannot be prose is never the label. What remains is walked left to right, and the walk
 * stops at the first point where everything still to come is an exact restatement of everything
 * kept so far. The FIRST occurrence therefore wins, which is correct: the visible label is captured
 * first and is the one a person wrote, while the accessible name and the field key are derivatives
 * of it.
 *
 * Returns the input unchanged whenever nothing is demonstrably duplicate, and never returns empty.
 */
export function cleanScrapedLabel(value: string | null | undefined): string {
  const raw = value ?? "";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return raw;

  /* Field keys first: they are unambiguous, and removing them shortens the duplicate search. */
  const words = collapsed.split(" ");
  const withoutKeys = words.filter((word) => !isRawFieldKey(word));
  const kept: string[] = [];
  /* Longest-first phrase dedupe over the remaining words. A trailing phrase whose key is already
     covered by what has been kept is a re-capture of the same label, not new information. */
  for (let index = 0; index < withoutKeys.length; index += 1) {
    kept.push(withoutKeys[index]);
    const keptKey = fragmentKey(kept.join(" "));
    const remainder = withoutKeys.slice(index + 1).join(" ");
    const remainderKey = fragmentKey(remainder);
    if (remainderKey && keptKey.endsWith(remainderKey) && remainderKey.length >= 6) {
      /* Everything after this point restates what is already kept. Six characters is a floor, so a
         short coincidental echo ("name ... name") cannot truncate a real sentence. */
      break;
    }
  }

  const cleaned = kept.join(" ").replace(TRAILING_REQUIRED_MARKER, "").trim();
  /* NEVER CLEAN TO EMPTY, and never hand back something shorter than the evidence justifies. */
  if (!cleaned) return collapsed;
  return cleaned;
}

/**
 * A scraped question prompt, in sentence case, with initialisms restored.
 *
 * Casing is applied ONLY to an all-lowercase capture. Any existing capital is treated as authorial
 * and the string is left alone apart from acronym restoration, so an employer's own styling
 * survives. Sentences are split on terminal punctuation so a prompt made of several sentences does
 * not keep the lowercase ones ("select all that apply. note: this information..." was capitalised
 * on its first character only, and the rest stayed as the DOM had it).
 */
export function cleanScrapedPrompt(value: string | null | undefined): string {
  const raw = value ?? "";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return raw;

  /* INITIALISMS ARE MASKED BEFORE SENTENCE CASING, not after. "compliance with u.s. sanctions"
     contains ". " inside a single word, so the sentence splitter read it as a sentence boundary and
     produced "U.S. Sanctions" - a capital in the middle of a clause, which is exactly the kind of
     tell this module exists to remove. Masking makes the abbreviation opaque to the splitter and
     the restore puts the real text back. */
  const masked = DOTTED_INITIALISMS.reduce(
    (text, { pattern }, index) => text.replace(pattern, `\u0000${index}\u0000`),
    collapsed,
  );
  const cased = collapsed === collapsed.toLowerCase() ? sentenceCase(masked) : masked;
  const unmasked = DOTTED_INITIALISMS.reduce(
    (text, { display }, index) => text.split(`\u0000${index}\u0000`).join(display),
    cased,
  );
  const restored = unmasked.replace(
    DISPLAY_ACRONYM_PATTERN,
    (token) => DISPLAY_ACRONYMS[token.toLowerCase()] ?? token,
  );
  return restored.trim() || collapsed;
}

/**
 * Capitalise the first letter of the string and of each following sentence.
 *
 * Splits after `.`, `?` or `!` followed by whitespace. A colon does NOT start a new sentence:
 * "note: this information..." is one clause, and capitalising after the colon would read as a
 * heading rather than a sentence. Abbreviations are protected by the dotted-initialism pass, which
 * runs afterwards and restores them wholesale.
 */
function sentenceCase(value: string): string {
  return value.replace(/(^|[.?!]\s+)([a-z])/g, (_match, boundary: string, letter: string) => (
    `${boundary}${letter.toUpperCase()}`
  ));
}
