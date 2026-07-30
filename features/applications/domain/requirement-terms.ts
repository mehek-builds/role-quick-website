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
 */
function lookupTone(index: RequirementIndex, candidate: string): TermTone | undefined {
  const direct = index.tone.get(candidate);
  if (direct) return direct;
  const sing = candidate.split(" ").map(singular).join(" ");
  if (sing !== candidate) {
    const viaSingular = index.tone.get(sing);
    if (viaSingular) return viaSingular;
  }
  const bare = candidate.replace(/s$/, "");
  return bare !== candidate ? index.tone.get(bare) : undefined;
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

type Token = { text: string; start: number; end: number };

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
 * `editedTerms` is the legacy single-word provenance set, consulted only where no requirement
 * claimed the word: a term that is both a JD requirement and a Litos edit is more useful shown as
 * the requirement, since that is the one the score depends on.
 */
export function segmentText(
  text: string,
  index: RequirementIndex,
  editedTerms?: ReadonlySet<string>,
): Segment[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    tokens.push({ text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }

  const segments: Segment[] = [];
  let cursor = 0;
  const pushTextUpTo = (upto: number) => {
    if (upto > cursor) segments.push({ kind: "text", text: text.slice(cursor, upto) });
    cursor = upto;
  };

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].start < cursor) continue; // consumed by a phrase already emitted

    let hit: { start: number; end: number; term: string; tone: TermTone; span: number } | null = null;

    for (let len = Math.min(index.maxWords, 5); len >= 1 && !hit; len--) {
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
      const tone = lookupTone(index, candidate);
      if (tone) {
        hit = {
          start: tokens[i].start + pieces[0].lead.length,
          end: tokens[i + len - 1].end - pieces[len - 1].trail.length,
          term: candidate,
          tone,
          span: len,
        };
      }
    }

    if (hit) {
      pushTextUpTo(hit.start);
      segments.push({ kind: "mark", text: text.slice(hit.start, hit.end), term: hit.term, tone: hit.tone });
      cursor = hit.end;
      i += hit.span - 1;
      continue;
    }

    const { core, lead } = stripEdges(tokens[i].text);
    const key = normalizeTerm(core);
    if (editedTerms && key.length > 2 && editedTerms.has(key)) {
      const start = tokens[i].start + lead.length;
      const end = start + core.length;
      pushTextUpTo(start);
      segments.push({ kind: "mark", text: text.slice(start, end), term: key, tone: "edited" });
      cursor = end;
    }
  }

  pushTextUpTo(text.length);
  return segments;
}
