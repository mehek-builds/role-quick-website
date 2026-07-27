/**
 * Are two bullets two phrasings of the same accomplishment?
 *
 * experience_bank.bullet_variants stores every wording a student has used for one entry, so the
 * Kubernetes phrasing and the AWS phrasing of a single deploy bullet live side by side. When they
 * accept one to close a gap, printing both would put a near-duplicate on a resume the renderer
 * holds to one page.
 *
 * The threshold mirrors the backend's entry_overlaps warning in engine/resumeValidate.ts, which
 * already flags two bullets in one entry that share 30% of their content words. Using the same
 * number means the swap happens exactly when keeping both would have been flagged as a defect.
 */
const STOPWORDS = new Set(
  `the and for with you your our are will from that this have their they who whom able strong good
using use used per via etc a an of to in on at by as is be we it its or if not but all any more
most than then what when where how why which while into out up down over under about after before
during through been was were has had do does did also may might could each both few own same so
too very just now here there these those them`
    .split(/\s+/)
    .filter(Boolean),
);

const OVERLAP_THRESHOLD = 0.3;

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)));
}

export function bulletOverlap(a: string, b: string): number {
  const left = contentWords(a);
  const right = contentWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((w) => right.has(w)).length;
  const union = new Set([...left, ...right]).size;
  return shared / union;
}

export function restatesSameBullet(a: string, b: string): boolean {
  return bulletOverlap(a, b) >= OVERLAP_THRESHOLD;
}
