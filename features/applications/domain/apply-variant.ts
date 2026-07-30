import type { ResumeSpec } from "@/lib/api";


// ---- similarity, kept in this module so it has no runtime imports ----
//
// This file is the only place a suggestion mutates the resume, so it is exercised directly by
// apply-variant.test.mts. Node's type-stripping test runner cannot resolve extensionless
// runtime imports, and the project forbids .ts extensions in imports (allowImportingTsExtensions
// is off), so the two helpers it needs live here rather than being imported.

const STOPWORDS = new Set(
  `the and for with you your our are will from that this have their they who whom able strong good
using use used per via etc a an of to in on at by as is be we it its or if not but all any more
most than then what when where how why which while into out up down over under about after before
during through been was were has had do does did also may might could each both few own same so
too very just now here there these those them`
    .split(/\s+/)
    .filter(Boolean),
);

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)));
}

/** Jaccard over content words. Mirrors the entry_overlaps measure in the backend's resumeValidate. */
export function bulletOverlap(a: string, b: string): number {
  const left = contentWords(a);
  const right = contentWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((w) => right.has(w)).length;
  const union = new Set([...left, ...right]).size;
  return shared / union;
}

/** Deliberately mirrors normalizeTerm in requirement-terms.ts: punctuation separates, dots vanish. */
function normalizeBullet(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.’']/g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

/**
 * Put one of the student's stored bullets onto the tailored resume.
 *
 * This is the only place in the product where accepting a suggestion MUTATES the resume, so it is
 * a pure function with its own tests rather than a closure inside a 1200-line page component. The
 * first version lived there, and pre-merge review reproduced four ways it destroyed work:
 *
 *  - It swapped the FIRST bullet over the similarity threshold rather than the most similar one.
 *    Measured: accepting "Automated payroll reconciliation with Alteryx for 12 entities, cutting
 *    close time by three days" scored 0.462 against an invoice-reconciliation bullet and 0.818
 *    against the payroll one, and findIndex took the 0.462. It deleted a distinct accomplishment
 *    AND left the near-duplicate it existed to remove.
 *  - The threshold alone called distinct bullets duplicates. "Led a team of four engineers building
 *    the payments service" vs "Led a team of three analysts building the reporting service" scores
 *    0.333 and would have been silently overwritten.
 *  - A swap could LOWER the match score, because the removed bullet was sometimes the only place
 *    the resume covered some other requirement. That one is NOT solved by refusing the swap: the
 *    student explicitly chose this wording, and the flagship case (their AWS phrasing giving way to
 *    their Kubernetes phrasing) legitimately trades one covered term for another. Refusing it would
 *    print a near-duplicate instead. It is solved by making the swap visible and reversible: the
 *    outcome always names what was removed, along with any words the resume no longer carries, and
 *    the UI offers an undo.
 *  - It matched the target entry by org NAME, ignoring the entry_id the backend already returns, so
 *    a bullet could be printed under a different role at the same employer.
 *
 * The rule now: a swap must be an improvement or it does not happen. Anything uncertain appends,
 * and nothing is ever removed silently.
 */

/** Above this, two bullets are candidates for being the same accomplishment reworded. */
const SWAP_FLOOR = 0.5;

/**
 * ...and the winner must beat the runner-up by this much. When two existing bullets are both
 * plausibly "the same" as the accepted one, we cannot tell which the student meant, so we append
 * rather than guess and delete.
 */
const SWAP_MARGIN = 0.15;

export type ApplyOutcome =
  | { kind: "appended"; org: string }
  | {
      kind: "replaced";
      org: string;
      /** The exact bullet that left the page, so the UI can name it and undo it. */
      removed: string;
      /** Words the resume no longer carries anywhere as a result. Often empty. */
      dropped: string[];
    }
  | { kind: "already_present"; org: string }
  | { kind: "role_not_on_resume"; org: string }
  | { kind: "ambiguous_role"; org: string };

export interface ApplyResult {
  spec: ResumeSpec;
  outcome: ApplyOutcome;
}

/** Words a bullet contributes to the match score, so a swap can be checked for coverage loss. */
function coverageWords(text: string): Set<string> {
  return new Set(normalizeBullet(text).split(" ").filter((w) => w.length > 1));
}

/**
 * Which words does the resume stop carrying if `removed` is replaced by `added`?
 *
 * The scorer reads the whole resume as one string, so a bullet is only load-bearing for a word when
 * nothing else on the page says it. Reported rather than vetoed: the student chose this wording,
 * and the UI names the loss so the trade is theirs to make.
 */
function droppedWords(spec: ResumeSpec, entryIndex: number, removed: string, added: string): string[] {
  const rest: string[] = [];
  spec.experience.forEach((entry, i) => {
    entry.bullets.forEach((bullet) => {
      if (!(i === entryIndex && bullet === removed)) rest.push(bullet);
    });
    rest.push(entry.org, entry.title, entry.date_range);
  });
  rest.push(spec.school, spec.degree, spec.coursework, ...spec.skills);
  const elsewhere = coverageWords(rest.join(" "));
  const addedWords = coverageWords(added);
  return [...coverageWords(removed)].filter((word) => !elsewhere.has(word) && !addedWords.has(word));
}

/** Exact identity, not the scorer's morphology-tolerant matcher. */
function sameBullet(a: string, b: string): boolean {
  return normalizeBullet(a) === normalizeBullet(b);
}

export function applyBankVariant(
  spec: ResumeSpec,
  { org, variant }: { org: string; variant: string },
): ApplyResult {
  const matches = spec.experience
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.org.trim().toLowerCase() === org.trim().toLowerCase());

  if (matches.length === 0) return { spec, outcome: { kind: "role_not_on_resume", org } };
  // Two roles at one employer: printing the bullet under the wrong title is worse than declining.
  if (matches.length > 1) return { spec, outcome: { kind: "ambiguous_role", org } };

  const { entry, index } = matches[0];
  if (entry.bullets.some((bullet) => sameBullet(bullet, variant))) {
    return { spec, outcome: { kind: "already_present", org } };
  }

  const ranked = entry.bullets
    .map((bullet) => ({ bullet, score: bulletOverlap(bullet, variant) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const runnerUp = ranked[1];
  const decisive =
    best !== undefined &&
    best.score >= SWAP_FLOOR &&
    (runnerUp === undefined || best.score - runnerUp.score >= SWAP_MARGIN);

  const swap = decisive;

  const bullets = swap
    ? entry.bullets.map((bullet) => (bullet === best.bullet ? variant : bullet))
    : [...entry.bullets, variant];

  return {
    spec: {
      ...spec,
      experience: spec.experience.map((item, i) => (i === index ? { ...item, bullets } : item)),
    },
    outcome: swap
      ? {
          kind: "replaced",
          org,
          removed: best.bullet,
          dropped: droppedWords(spec, index, best.bullet, variant),
        }
      : { kind: "appended", org },
  };
}
