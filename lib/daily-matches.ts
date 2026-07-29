import type { ApplicationProfile, GeneratedResume, MonitoredJob, ParsedProfile, Targeting } from "./api";

export type RankedJob = MonitoredJob & {
  match: number;
  reasons: string[];
};

export type ProfileIdentity = { full_name?: string; email?: string };

export const DAILY_PREPARED_RESUME_LIMIT = 30;

export function rankJobs(
  jobs: MonitoredJob[],
  targeting: Targeting | null,
  profile: Partial<ParsedProfile> | null,
): RankedJob[] {
  const titleTerms = tokens([...(targeting?.titles ?? []), ...(profile?.target_roles ?? [])].join(" "));
  const skillTerms = tokens([...(profile?.skills ?? []), ...(targeting?.categories ?? [])].join(" "));

  return jobs
    .map((job) => {
      const title = tokens(job.title);
      const corpus = tokens(`${job.title} ${job.department ?? ""} ${job.description}`);
      const titleMatches = [...titleTerms].filter((term) => title.has(term));
      const skillMatches = [...skillTerms].filter((term) => corpus.has(term));
      const match = Math.min(98, 72 + titleMatches.length * 6 + Math.min(14, skillMatches.length * 2));
      const reasons = [...new Set([...titleMatches, ...skillMatches])].slice(0, 3).map(readableTerm);
      return {
        ...job,
        match,
        reasons: reasons.length ? reasons : [job.department || job.employment_type || "Role fit"],
      };
    })
    .sort((a, b) => b.match - a.match || (b.posted_at ?? b.first_seen_at).localeCompare(a.posted_at ?? a.first_seen_at));
}

export function packetMatchesJob(packet: GeneratedResume, job: Pick<MonitoredJob, "company_name" | "title">): boolean {
  return normalized(packet.job_context.company) === normalized(job.company_name)
    && normalized(packet.job_context.role) === normalized(job.title);
}

export function countPreparedJobs(jobs: RankedJob[], packets: GeneratedResume[]): number {
  return jobs.filter((job) => packets.some((packet) => packetMatchesJob(packet, job))).length;
}

export function resumeGenerationBody(
  job: MonitoredJob,
  identity: ProfileIdentity,
  applicationProfile: ApplicationProfile,
  storedEmail: string | null,
) {
  return {
    company: job.company_name,
    role: job.title,
    jd_text: job.description,
    /* The posting this resume is for, recorded at creation so the jobs list can later mark exactly
       this row "Applied" rather than every posting sharing its company and title.

       IT HAS TO BE SET HERE, not only where the student fills the form by hand. This function feeds
       the dashboard's prewarm loop, which generates a resume per matched job automatically, so it
       is how most packets come into existence. And once a packet exists, opening the posting from
       the jobs list takes the "existing packet" branch in app/dashboard/applications/page.tsx and
       never calls /resume/generate at all. Leaving it out here therefore did not just miss the
       prewarmed rows; it meant the id was almost never recorded for anyone. */
    job_id: job.id,
    application: {
      ats_name: portalName(job.apply_url),
      portal_url: job.apply_url,
    },
    contact: {
      full_name: identity.full_name?.trim(),
      email: identity.email?.trim() || storedEmail,
      phone: applicationProfile.phone || undefined,
      linkedin_url: applicationProfile.linkedin_url || undefined,
      github_url: applicationProfile.github_url || undefined,
      portfolio_url: applicationProfile.portfolio_url || undefined,
    },
  };
}

export function portalName(portalUrl: string): string {
  const hostname = new URL(portalUrl).hostname.toLowerCase();
  if (hostname.includes("greenhouse")) return "Greenhouse";
  if (hostname.includes("lever")) return "Lever";
  if (hostname.includes("ashby")) return "Ashby";
  if (hostname.includes("workday")) return "Workday";
  if (hostname.includes("linkedin")) return "LinkedIn";
  return "the company's application page";
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z][a-z0-9+#.]{1,}/g)?.filter((term) => !STOP_WORDS.has(term)) ?? []);
}

function readableTerm(term: string): string {
  if (term === "api" || term === "apis") return "API experience";
  if (term === "typescript") return "TypeScript";
  if (term === "react") return "React";
  return term.charAt(0).toUpperCase() + term.slice(1);
}

function normalized(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const STOP_WORDS = new Set(["and", "the", "with", "for", "from", "that", "this", "your", "engineer", "engineering", "intern", "internship", "new", "grad"]);
