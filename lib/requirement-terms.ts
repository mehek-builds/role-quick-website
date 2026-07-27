import type { JdTermView } from "./jd-match";

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
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
 * Split text into plain runs and highlighted runs.
 *
 * Multi-word aware, and greedy longest-first, so "machine learning" marks as one phrase rather than
 * two adjacent words. A single token also normalizes on its own, which is what lets the two-word
 * term "ci cd" match the single written token "CI/CD" without a special case.
 *
 * `editedTerms` is the legacy single-word provenance set and is only consulted where a requirement
 * did not already claim the run: a term that is both a JD requirement and a Litos edit is more
 * useful shown as the requirement, since that is the one the score depends on.
 */
export function segmentText(
  text: string,
  index: RequirementIndex,
  editedTerms?: ReadonlySet<string>,
): Segment[] {
  // Keep separators so the text can be reassembled exactly as written.
  const parts = text.split(/(\s+)/);
  const isWord = (s: string) => s.length > 0 && !/^\s+$/.test(s);
  const segments: Segment[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      segments.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!isWord(part)) {
      buffer += part;
      continue;
    }

    // Try the longest phrase first.
    let hit: { len: number; term: string; tone: TermTone } | null = null;
    for (let len = Math.min(index.maxWords, 5); len >= 1 && !hit; len--) {
      // Collect `len` words plus the separators between them.
      const slice: string[] = [];
      let words = 0;
      let j = i;
      while (j < parts.length && words < len) {
        slice.push(parts[j]);
        if (isWord(parts[j])) words++;
        j++;
      }
      if (words < len) continue;
      const candidate = normalizeTerm(slice.filter(isWord).join(" "));
      const tone = index.tone.get(candidate);
      if (tone) hit = { len: slice.length, term: candidate, tone };
    }

    if (hit) {
      flush();
      const raw = parts.slice(i, i + hit.len).join("");
      // Trailing punctuation belongs outside the mark so "Docker." does not underline the period.
      const trailing = raw.match(/[),.;:]+$/)?.[0] ?? "";
      const marked = trailing ? raw.slice(0, -trailing.length) : raw;
      segments.push({ kind: "mark", text: marked, term: hit.term, tone: hit.tone });
      if (trailing) buffer += trailing;
      i += hit.len - 1;
      continue;
    }

    const key = normalizeTerm(part).replace(/[^a-z0-9+#. ]/g, "");
    if (editedTerms && key.length > 2 && editedTerms.has(key)) {
      flush();
      segments.push({ kind: "mark", text: part, term: key, tone: "edited" });
      continue;
    }

    buffer += part;
  }

  flush();
  return segments;
}
