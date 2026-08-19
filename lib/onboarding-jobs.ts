import type { RoleType, Targeting } from "./api";

export type OnboardingJob = {
  id: string;
  company: string;
  title: string;
  location: string;
  ats: string;
  applyUrl: string;
};

const STOP_WORDS = new Set(["and", "associate", "junior", "manager", "senior", "the"]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/engineering/g, "engineer")
      .replace(/[^a-z0-9+#]+/g, " ")
      .split(" ")
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

/* One branch per stage, and NO default arm.
 *
 * There used to be a trailing `return !internship && !coOp && !newGrad` standing in for full-time,
 * which read as a sensible default right up until the stage list grew: part-time, contract,
 * apprenticeship and fellowship would each have fallen into it, so a student who asked for
 * contract work would have had every ordinary full-time posting scored as a stage match. The
 * fall-through is now `false` - an unrecognised stage claims nothing rather than claiming
 * everything - and full-time states its own condition. */
function matchesType(title: string, roleTypes: RoleType[]): boolean {
  if (roleTypes.length === 0) return false;
  const internship = /\bintern(ship)?\b/i.test(title);
  const coOp = /\bco-?op\b/i.test(title);
  const newGrad = /\b(new grad|graduate|entry.level)\b/i.test(title);
  const apprenticeship = /\bapprentice(ship)?\b/i.test(title);
  const fellowship = /\bfellow(ship)?\b/i.test(title);
  const partTime = /\bpart.?time\b/i.test(title);
  const contract = /\b(contract|contractor|temporary|freelance)\b/i.test(title);
  return roleTypes.some((type) => {
    if (type === "internship") return internship;
    if (type === "co-op") return coOp;
    if (type === "new-grad") return newGrad;
    if (type === "apprenticeship") return apprenticeship;
    if (type === "fellowship") return fellowship;
    if (type === "part-time") return partTime;
    if (type === "contract") return contract;
    // Unchanged: an apprenticeship or a fellowship is still an ordinary full-time job here, the
    // same reading the backend's matchingRoleType keeps.
    if (type === "full-time") return !internship && !coOp && !newGrad && !partTime && !contract;
    return false;
  });
}

export function rankOnboardingJobs(
  jobs: OnboardingJob[],
  targeting: Pick<Targeting, "titles" | "role_types"> | null | undefined,
  limit = 3,
): OnboardingJob[] {
  const roleTokens = (targeting?.titles ?? []).map(tokens);
  const roleTypes = (targeting?.role_types ?? []) as RoleType[];
  return jobs
    .map((job, index) => {
      const jobTokens = tokens(job.title);
      const titleScore = roleTokens.reduce((best, target) => {
        let overlap = 0;
        for (const token of target) if (jobTokens.has(token)) overlap += 1;
        return Math.max(best, overlap);
      }, 0);
      return {
        job,
        index,
        // Type is a real eligibility preference, not a tie-breaker. An exact full-stack title must
        // not outrank the software internship the student explicitly asked for.
        score: titleScore * 4 + (matchesType(job.title, roleTypes) ? 8 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ job }) => job);
}
