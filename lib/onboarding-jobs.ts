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

function matchesType(title: string, roleTypes: RoleType[]): boolean {
  if (roleTypes.length === 0) return false;
  const internship = /\bintern(ship)?\b/i.test(title);
  const coOp = /\bco-?op\b/i.test(title);
  const newGrad = /\b(new grad|graduate|entry.level)\b/i.test(title);
  return roleTypes.some((type) => {
    if (type === "internship") return internship;
    if (type === "co-op") return coOp;
    if (type === "new-grad") return newGrad;
    return !internship && !coOp && !newGrad;
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
