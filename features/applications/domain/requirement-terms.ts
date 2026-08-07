import type { JdTermView } from "./match-model";

/**
 * The shared vocabulary that links the job description to the resume.
 *
 * Before this, the JD pane highlighted every content word that appeared anywhere in the resume
 * (`resumeTerms` = normalizedTerms(resumeCorpus(spec))). On a real posting that lit up "backed",
 * "services", "deployed", "Computer" and "Science" in the same blue as "PostgreSQL", so the colour
 * carried no information: almost every other word was marked, and none of the marks told the
 * student anything about whether they were a fit.
 *
 * Highlighting is driven by the JD match model instead, which means a mark now means exactly one
 * of three things, and the same term wears the same colour in both panes:
 *
 *   covered  - this posting asks for it AND your resume says it. Blue, in both panes.
 *   missing  - this posting asks for it and your resume does not say it. Amber, JD pane only,
 *              because there is nothing to mark on a resume that does not contain the word.
 *   edited   - Litos changed this wording for this job. Green, resume pane only. Kept from the
 *              existing tailoring-provenance signal; it answers a different question from the
 *              other two and must stay visually distinct from both.
 */

export type TermTone = "covered" | "missing" | "edited";

/** Mirrors normalizeTerm in the backend's engine/jdMatch.ts. The two must agree or a term the
 *  scorer counted as matched will fail to highlight, and the panes will contradict the number. */
export function normalizeTerm(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.’']/g, "")
    // Every other non-alphanumeric becomes a separator, matching the backend. When this was only
    // [-_/], a comma stayed glued to the word and the two copies disagreed about whether a resume
    // saying "Docker, Kubernetes" contained `docker`, which is exactly how the panes came to
    // contradict the score.
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

/** Mirrors singular() in the backend's engine/jdMatch.ts. */
function singular(word: string): string {
  if (/(ss|us|is)$/.test(word)) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/es$/.test(word) && /(ch|sh|x|s)es$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Look a candidate up the way the BACKEND matches, not by exact key.
 *
 * resumeCovers credits singular/plural variants, so the score could count "api" as covered on the
 * strength of a resume that says "APIs" while this pane, doing an exact lookup, marked nothing.
 * The student was told the requirement was met and given no way to see where. Any lookup rule here
 * that is stricter than the backend's produces that class of bug.
 *
 * IT MATCHES IN BOTH NUMBER DIRECTIONS, because resumeCovers does:
 *
 *   const singularNeedle = needle.split(' ').map(singular).join(' ');
 *   if (hay.includes(` ${singularNeedle} `)) return true;
 *   return words.includes(` ${needle}s `) || words.includes(` ${needle}es `);
 *
 * This function used to run only the first line of that, singularising the CANDIDATE, so it could
 * never get from a resume that says "Software Developer" to the plural requirement key `software
 * developers`. Five Rings' "Summer Intern 2027 - Software Developer" (packet 0c6e832a) writes
 * "mentored by experienced Software Developers"; that term is one of only two the scorer matched,
 * worth about half the packet's score, and the resume pane had no mark for it at all. The one term
 * the student would most want to locate was the one with no anchor.
 *
 * Returns the KEY THAT MATCHED, not the candidate, so a mark identifies the requirement the score
 * is about rather than the accident of how the page spelled it.
 */
function lookupTone(
  index: RequirementIndex,
  candidate: string,
): { term: string; tone: TermTone } | undefined {
  const direct = index.tone.get(candidate);
  if (direct) return { term: candidate, tone: direct };
  const sing = candidate.split(" ").map(singular).join(" ");
  if (sing !== candidate) {
    const viaSingular = index.tone.get(sing);
    if (viaSingular) return { term: sing, tone: viaSingular };
  }
  const bare = candidate.replace(/s$/, "");
  if (bare !== candidate) {
    const viaBare = index.tone.get(bare);
    if (viaBare) return { term: bare, tone: viaBare };
  }
  // The other direction: the requirement is plural and the page writes the singular. Only the last
  // word is inflected, because that is the head of the noun phrase and the only part resumeCovers
  // suffixes.
  const words = candidate.split(" ");
  const head = words.slice(0, -1);
  const last = words[words.length - 1];
  for (const suffix of ["s", "es"]) {
    const plural = [...head, `${last}${suffix}`].join(" ");
    const viaPlural = index.tone.get(plural);
    if (viaPlural) return { term: plural, tone: viaPlural };
  }
  return undefined;
}

export type RequirementIndex = {
  /** normalized term -> tone */
  tone: ReadonlyMap<string, TermTone>;
  /** longest term in words, so the matcher knows how far to look ahead */
  maxWords: number;
};

export function buildRequirementIndex(matched: JdTermView[], missing: JdTermView[]): RequirementIndex {
  const tone = new Map<string, TermTone>();
  for (const t of matched) tone.set(t.term, "covered");
  // A term cannot be both; matched wins if the backend ever disagrees with itself.
  for (const t of missing) if (!tone.has(t.term)) tone.set(t.term, "missing");
  let maxWords = 1;
  for (const key of tone.keys()) maxWords = Math.max(maxWords, key.split(" ").length);
  return { tone, maxWords };
}

export const EMPTY_REQUIREMENT_INDEX: RequirementIndex = { tone: new Map(), maxWords: 1 };

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "mark"; text: string; term: string; tone: TermTone };

/**
 * A word is a run containing at least one letter or digit. Everything else, including a bullet dash
 * and a comma, is a gap.
 *
 * This distinction is load-bearing. When "-" counted as a word, the two-word candidate
 * "PostgreSQL\n-" normalized to "postgresql" (a lone dash contributes nothing once hyphens become
 * spaces) and matched the one-word term, so the mark swallowed the line break AND the next bullet's
 * dash. On the rendered page that showed up as stray coloured dashes down the left margin.
 */
// Character class mirrors the backend's tokenizer exactly. It used to admit a leading digit,
// which the backend's does not, so digit-suffixed tokens tokenized differently on the two sides.
const WORD_RE = /[A-Za-z][A-Za-z0-9+#./_-]*/g;

/** Slash forms that are ONE skill, not two. Mirrors SLASH_FORMS in the backend's engine/jdMatch.ts,
 *  and checked against the normalized (space-joined) key for the same reason it is there. */
const SLASH_FORMS = new Set(["ci cd", "a b", "r d"]);

/** A lowercase English word glued to a dotted product name by a scrape that lost a space:
 *  "Understanding of.NET Framework". Mirrors GLUED_LOWERCASE_PREFIX in the backend. */
const GLUED_LOWERCASE_PREFIX = /^([a-z]+)(\.[A-Z][A-Za-z0-9+#./_-]*)$/;

type Token = { text: string; start: number; end: number };

/**
 * Cut text into the same pieces the backend's tokenizeSection does. THE WHOLE OF THE SHARED
 * SURFACE, and the half nobody mirrored.
 *
 * `normalizeTerm` and `singular` above were kept byte-identical with the backend on purpose and are
 * checked whenever either moves. The TOKENIZERS around them were not, and the gap was silent for as
 * long as no posting wrote a requirement compactly. The backend SPLITS a token on "/" (unless the
 * slash form is itself one skill) and this file did not, so "HTML/CSS" arrived here as one token,
 * normalized to the two-word key `html css`, and matched neither of the two requirements `html` and
 * `css` that the scorer had already counted. Measured over the 25 most recent real packets on
 * 2026-08-08: 20 of them affected, 22.7% of every term-instance the product owed the student, and
 * on one packet five of twelve requirements - a 37% score whose evidence was 42% invisible.
 *
 * Agreement is held by tokenizer-contract.ts, a corpus duplicated byte-for-byte in both repos and
 * asserted by a test on each side. Change this function and that test fails in front of you.
 *
 * It is deliberately correct ON ITS OWN, not only alongside a matching backend deploy: the two
 * repos ship independently, and every rule here brings this file TOWARD the tokenizer that is
 * already in production on the other side.
 */
export function tokenizeForMatch(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const start = m.index ?? 0;
    let body = m[0];
    // The token stops at the word. "." lives inside the class so node.js survives, which also
    // swallowed sentence-final periods and let phrases form across sentence boundaries.
    const trail = body.match(/[./_-]+$/)?.[0] ?? "";
    if (trail) body = body.slice(0, -trail.length);
    if (!body) continue;

    const slashPieces =
      body.includes("/") && !SLASH_FORMS.has(normalizeTerm(body))
        ? body.split("/").filter(Boolean)
        : [body];
    const pieces = slashPieces.flatMap((piece) => {
      const glued = GLUED_LOWERCASE_PREFIX.exec(piece);
      return glued ? [glued[1], glued[2]] : [piece];
    });

    let offset = start;
    for (const piece of pieces) {
      const at = text.indexOf(piece, offset);
      const pieceStart = at === -1 ? offset : at;
      out.push({ text: piece, start: pieceStart, end: pieceStart + piece.length });
      offset = pieceStart + piece.length;
    }
  }
  return out;
}

/**
 * Punctuation carried at the edge of a written word, stripped before lookup and re-emitted outside
 * the mark. Without this, "React," never matched the term `react`, so on a real posting the
 * Requirements line "Familiarity with React, PostgreSQL, and Docker" marked only Docker: the two
 * terms the student DID have went uncredited in the pane while the score counted them.
 *
 * `+` and `#` are kept as part of the core so "C++" and "C#" survive.
 */
function stripEdges(word: string): { core: string; lead: string; trail: string } {
  const lead = word.match(/^[^A-Za-z0-9]+/)?.[0] ?? "";
  const rest = word.slice(lead.length);
  const trail = rest.match(/[^A-Za-z0-9+#]+$/)?.[0] ?? "";
  return { core: trail ? rest.slice(0, -trail.length) : rest, lead, trail };
}

/**
 * Split text into plain runs and highlighted runs.
 *
 * Multi-word aware and greedy longest-first, so "machine learning" marks as one phrase rather than
 * two adjacent words. A single token also normalizes on its own, which is what lets the two-word
 * term "ci cd" match the single written token "CI/CD" without a special case.
 *
 * A phrase may only span words separated by SPACES. A comma, a semicolon or a line break between
 * two words means they are separate list items, mirroring the same rule in the backend's
 * extractJdTerms: "React, PostgreSQL, and Docker" is three requirements, not one phrase.
 *
 * `editedTerms` is the tailoring-provenance set, consulted only where no requirement claimed the
 * span: a term that is both a JD requirement and a Litos edit is more useful shown as the
 * requirement, since that is the one the score depends on.
 *
 * EDITED TERMS ARE LOOKED UP THE SAME WAY REQUIREMENTS ARE, over phrases and not only over single
 * tokens. They used to be matched by a separate one-token path against a set built by a SECOND
 * normalizeTerm living in application-review.ts, which deleted the characters this one separates
 * on. The two agreed only on a bare alphanumeric word: the set held "node.js", "ci/cd",
 * "machine-learning" and "productengineering" while the keys read here were "nodejs", "ci cd",
 * "machine learning" and "product engineering". Zero overlap, so every dotted, slashed, hyphenated
 * or multiword edit was invisible in the resume pane, and the shipped QA fixtures ("Product
 * Engineering", "Distributed Systems", "Voice AI") were all of that shape, so the QA screen
 * demonstrated the bug instead of the tone. There is one normalizeTerm now, and one lookup.
 */
export function segmentText(
  text: string,
  index: RequirementIndex,
  editedTerms?: ReadonlySet<string>,
): Segment[] {
  const tokens = tokenizeForMatch(text);

  let editedMaxWords = 0;
  if (editedTerms) {
    for (const key of editedTerms) editedMaxWords = Math.max(editedMaxWords, key.split(" ").length);
  }
  const maxWords = Math.min(Math.max(index.maxWords, editedMaxWords), 5);

  const segments: Segment[] = [];
  let cursor = 0;
  const pushTextUpTo = (upto: number) => {
    if (upto > cursor) segments.push({ kind: "text", text: text.slice(cursor, upto) });
    cursor = upto;
  };

  for (let i = 0; i < tokens.length; i++) {
    // EVERY token is offered to the matcher, including one a previous mark already covered. The
    // loop used to skip past a consumed token entirely, which is what made an overlap fatal rather
    // than partial; the clamp below is what keeps a consumed token from being marked twice.
    let hit: { start: number; end: number; term: string; tone: TermTone } | null = null;

    for (let len = maxWords; len >= 1 && !hit; len--) {
      if (i + len > tokens.length) continue;

      let joinable = true;
      for (let k = i; k < i + len - 1 && joinable; k++) {
        if (!/^ +$/.test(text.slice(tokens[k].end, tokens[k + 1].start))) joinable = false;
      }
      if (!joinable) continue;

      const pieces = [];
      for (let k = i; k < i + len; k++) pieces.push(stripEdges(tokens[k].text));
      if (pieces.some((piece) => !piece.core)) continue;

      const candidate = normalizeTerm(pieces.map((piece) => piece.core).join(" "));
      const match =
        lookupTone(index, candidate) ??
        (editedTerms && candidate.length > 2 && editedTerms.has(candidate)
          ? ({ term: candidate, tone: "edited" } as const)
          : undefined);
      if (!match) continue;

      // A REQUIREMENT WHOSE FIRST WORDS WERE ALREADY MARKED STILL MARKS ITS REMAINDER.
      //
      // The matcher is greedy longest-first from each token and the cursor only moves forward, so
      // of two requirements overlapping on a shared word the leftmost used to take the word and the
      // other coloured nowhere at all. Point72's "Quantitative Developer Intern" (packet 90062b81)
      // writes "Point72 Internal Alpha Capture (IAC)" and the extractor takes BOTH `internal alpha`
      // and `alpha capture` out of it: "Internal Alpha" marked, "Alpha Capture" vanished, and the
      // student was charged for a requirement the page never pointed at.
      //
      // Marks cannot overlap in a flat run of segments, so the shared word belongs to whichever
      // requirement claimed it first and the second is anchored on what is left of it. That is a
      // partial anchor rather than a perfect one, and it is the honest option: it puts a colour on
      // every requirement the score counted, which is the contract, instead of silently dropping
      // one because two requirements were written over the same word.
      let first = -1;
      for (let k = i; k < i + len; k++) {
        if (tokens[k].start >= cursor) {
          first = k;
          break;
        }
      }
      if (first === -1) continue;

      const start = tokens[first].start + (first === i ? pieces[0].lead.length : 0);
      const end = tokens[i + len - 1].end - pieces[len - 1].trail.length;
      if (end <= start) continue;

      hit = { start, end, term: match.term, tone: match.tone };
    }

    if (hit) {
      pushTextUpTo(hit.start);
      segments.push({ kind: "mark", text: text.slice(hit.start, hit.end), term: hit.term, tone: hit.tone });
      cursor = hit.end;
    }
  }

  pushTextUpTo(text.length);
  return segments;
}
