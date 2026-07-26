/* THE HARD RULE, client side: every resume bullet opens with a strong action verb.
 *
 * This list is a MIRROR of STRONG_VERBS in student-outreach-backend/src/engine/resumeValidate.ts,
 * which stays the single source of truth. The server enforces the rule on everything it generates
 * (both prompts list these verbs, the validator rejects anything else, and the base build retries
 * once naming the offenders). The copy exists because the /start editor lets a student type their
 * own bullet, and a rule the student can silently break by hand is not a hard rule.
 *
 * Flagging here is ADVISORY on purpose. It marks a weak opener while they type so they can fix it
 * in the moment; it never blocks a save, because the student's own account of their work outranks
 * our whitelist and we would rather show them the problem than refuse their words.
 *
 * If the server list changes, regenerate this one. Both are plain word lists precisely so the
 * diff is trivial to eyeball.
 */
const STRONG_VERBS = new Set(
  `administered advised advocated analyzed applied architected assembled audited authored automated
benchmarked briefed built calibrated campaigned catalogued championed classified co-founded
collaborated collected communicated conducted consolidated constructed consulted coordinated
counseled cracked created cultivated cultured curated cut delivered demoed deployed designed
developed devised diagnosed directed dissected documented drafted drove earned edited elected
engineered established evaluated executed exhibited facilitated forecasted formalized formulated
founded fundraised grew guided identified illustrated implemented improved increased inspected
instructed instrumented integrated interviewed isolated launched led managed measured mediated
mentored modeled negotiated onboarded optimized organized overhauled owned partnered pioneered
prepared presented processed produced profiled published purified quantified ran rebuilt recruited
redesigned reduced refined rehabilitated researched resolved sampled scaled scheduled screened
secured sequenced shipped sized solved spearheaded staffed standardized streamlined structured
supervised surveyed synthesized taught tracked trained transformed translated treated triaged
tutored uncovered validated verified won`
    .split(/\s+/)
    .filter(Boolean),
);

export function firstWordOf(bullet: string): string {
  return (bullet.trim().split(/\s+/)[0] ?? "").replace(/[^a-zA-Z-]/g, "").toLowerCase();
}

/** Mirrors startsWithStrongVerb() on the server, including the "co-" inheritance rule. */
export function startsWithStrongVerb(bullet: string): boolean {
  const first = firstWordOf(bullet);
  if (!first) return false;
  return STRONG_VERBS.has(first) || (first.startsWith("co-") && STRONG_VERBS.has(first.slice(3)));
}
