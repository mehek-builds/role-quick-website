import type {
  ApplicationProfile,
  GeneratedResume,
  MonitoredJob,
  ParsedProfile,
  Targeting,
} from "@/lib/api";

export type RankedJob = MonitoredJob & {
  match: number;
  reasons: string[];
};

export type ProfileIdentity = { full_name?: string; email?: string };

/**
 * How many of the day's top matches get a resume built ahead of time, for students who have turned
 * automatic submission ON.
 *
 * IT APPLIES TO NOBODY ELSE. Building a packet is a real cost: it spends a resume from the
 * student's monthly quota and runs a model call, so doing it speculatively for everyone spent
 * people's quota on jobs they never opened. With automatic submission on, the build-ahead is the
 * point, because the runner needs a packet ready to send. With it off, the packet is created when
 * the student asks for one.
 *
 * Replaces DAILY_PREPARED_RESUME_LIMIT (30), which fed the same loop for every account.
 */
export const AUTO_SUBMIT_PREPARED_LIMIT = 20;

export function rankJobs(
  jobs: MonitoredJob[],
  _targeting?: Targeting | null,
  _profile?: Partial<ParsedProfile> | null,
): RankedJob[] {
  /* GET /jobs is the single ranking authority. Re-ranking its first page in the browser used a
     different formula, ignored role type and location, and made Home disagree with Jobs. */
  return jobs.map((job) => ({
    ...job,
    match: job.preference_score ?? job.match_score ?? 0,
    reasons: job.preference_reasons ?? [],
  }));
}

/**
 * Whether this packet is the one for this posting.
 *
 * PREFERS THE POSTING ID, and when the packet has one it is the ONLY thing consulted. A packet
 * built for the Mountain View req must not answer for the New York req of the same title, and
 * company+role cannot tell those apart. That mattered more than it looked: this decides whether
 * "Apply now" reuses an existing packet or builds a new one, so a wrong match showed the student a
 * resume tailored to a different posting and skipped the build for the one they actually opened.
 *
 * The same rule as the "Applied" badge in the jobs feature, for the same reason: where a precise
 * identity exists it has to REPLACE the imprecise one, not sit alongside it. Falling back to
 * company+role for a packet that has an id would let the sibling match anyway and change nothing.
 *
 * The fallback stays for packets that have no id and never will: everything generated before the
 * id was recorded, and anything from the extension, where there is no monitored posting to point
 * at. Those keep the old imprecision, which is unfixable rather than merely unfixed.
 */
export function packetMatchesJob(
  packet: GeneratedResume,
  job: Pick<MonitoredJob, "id" | "company_name" | "title">,
): boolean {
  const packetJobId = packet.job_context.job_id;
  if (packetJobId) return packetJobId === job.id;
  return normalized(packet.job_context.company) === normalized(job.company_name)
    && normalized(packet.job_context.role) === normalized(job.title);
}

export function countPreparedJobs(jobs: RankedJob[], packets: GeneratedResume[]): number {
  return jobs.filter((job) => packets.some((packet) => packetMatchesJob(packet, job))).length;
}

/** Whether this exact posting was submitted during the requested UTC day. */
export function jobSubmittedOnDay(
  job: Pick<MonitoredJob, "id" | "company_name" | "title">,
  packets: GeneratedResume[],
  dayKey: string,
): boolean {
  return packets.some((packet) => {
    const review = packet.spec._review;
    return packetMatchesJob(packet, job)
      && review?.status === "submitted"
      && review.submitted_at?.slice(0, 10) === dayKey;
  });
}

/** Shortest job description the generator will accept. Mirrors the backend's `jd_text` minimum. */
export const MIN_JD_CHARS = 20;

/**
 * Whether a draft can be generated from without the request being rejected.
 *
 * Exists because "Apply now" generates immediately, with nothing typed by the student. A posting
 * that arrives with a stub description or a link the generator refuses would otherwise spend the
 * attempt and come back with "Fill in all four boxes first", which is nonsense to someone who
 * filled in nothing. Checking first lets the page say what is actually missing.
 *
 * Deliberately the same shape as the guard inside createApplication, sharing MIN_JD_CHARS so the
 * two cannot drift into disagreeing about what is generatable.
 */
export function canGenerateFrom(draft: {
  company: string;
  role: string;
  portalUrl: string;
  jobDescription: string;
}): boolean {
  if (!draft.company.trim() || !draft.role.trim()) return false;
  if (draft.jobDescription.trim().length < MIN_JD_CHARS) return false;
  const portalUrl = draft.portalUrl.trim();
  if (!portalUrl) return false;
  try {
    return new URL(portalUrl).protocol === "https:";
  } catch {
    return false;
  }
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

function normalized(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
