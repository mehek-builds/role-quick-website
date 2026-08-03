import type {
  ApplicationProfile,
  GeneratedResume,
  MonitoredJob,
  ParsedProfile,
  Targeting,
} from "@/lib/api";
/* Relative, not "@/lib/local-day": this module is loaded directly by the node test runner, which
   resolves no tsconfig path aliases. Every other "@/lib" import here is type-only and erased. */
import { localDayKeyOf } from "../../../lib/local-day.ts";

/* NO `match` FIELD, and that is the ISSUE-014 fix in its final form.
 *
 * This type has now carried a score twice and lost it twice, for opposite reasons, and both are
 * worth keeping in view before anyone adds a third:
 *
 *   1. `match: preference_score ?? match_score ?? 0` - two metrics and a fabricated zero in one
 *      expression. A card could silently swap from "fits what you asked for" to "your resume is a
 *      poor match" with nothing on screen saying so.
 *   2. `match: number | null`, preference fit only. Coherent, and it shipped, but it meant the
 *      number a student read beside a job was about OUR RANKING rather than about them.
 *
 * The number on a card is now resume-to-JD coverage on every surface, fetched per posting by
 * features/applications/application/use-job-match-scores.ts. rankJobs cannot supply it, because it
 * needs the resume and a network round trip, so the honest thing is for this type not to offer a
 * score at all. preference_score still orders the feed - GET /jobs remains the single ranking
 * authority and this function preserves its order - and still supplies `reasons`, which is words
 * rather than a number and now says "You asked for ..." so it cannot be read as the score's
 * caption. */
export type RankedJob = MonitoredJob & {
  /** Preference signals: what the STUDENT asked for. Never a caption for the resume-coverage
   *  score, which is a different question with a different denominator. */
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
     different formula, ignored role type and location, and made Home disagree with Jobs.

     THIS FUNCTION HANDS BACK NO SCORE. See the note on RankedJob: the number beside a job is
     resume-to-JD coverage, which needs the resume and a round trip, so it is fetched by
     use-job-match-scores.ts rather than derived here. preference_score stays out of the UI
     entirely; it orders the feed, which is the job it is good at.

     `reasons` survives because it is WORDS, and true ones: it says what the student asked for. It
     is rendered as "You asked for ..." rather than "Matches your ...", so it cannot be misread as
     the caption for the coverage number sitting above it. That misreading, one metric's score over
     another metric's reasons, is the defect the ISSUE-014 audit actually found. */
  return jobs.map((job) => ({
    ...job,
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

const READY_TO_SEND_STATUSES = new Set([
  "resume_ready",
  "questions_ready",
  "ready_to_submit",
]);

/**
 * Select the next ready packet in the backend's current preference order.
 *
 * The application board is history and must not lose older records when targeting changes. The
 * packet offered as "Next best match" is different: it can be sent automatically, so it must
 * still belong to the current criteria-aware jobs response. Iterating jobs first preserves the
 * backend's ranking authority and fails closed when no current match exists.
 */
export function nextPreferredReadyPacket(
  packets: GeneratedResume[],
  currentJobs: MonitoredJob[],
): GeneratedResume | null {
  for (const job of currentJobs) {
    const matching = packets
      .filter((packet) => READY_TO_SEND_STATUSES.has(packet.spec._review?.status ?? ""))
      .filter((packet) => packetMatchesJob(packet, job))
      .sort((a, b) => packetUpdatedAt(b).localeCompare(packetUpdatedAt(a)));
    if (matching[0]) return matching[0];
  }
  return null;
}

function packetUpdatedAt(packet: GeneratedResume): string {
  return packet.spec._review?.updated_at ?? packet.created_at ?? "";
}

export function countPreparedJobs(jobs: RankedJob[], packets: GeneratedResume[]): number {
  return jobs.filter((job) => packets.some((packet) => packetMatchesJob(packet, job))).length;
}

/**
 * Whether this exact posting was submitted during the requested local day.
 *
 * dayKey comes from localDayKey, so submitted_at has to be converted to a local day too. This used
 * to be `review.submitted_at?.slice(0, 10)`, which reads the UTC day off the stored instant. Once
 * the caller's key is local, comparing it against a UTC day is wrong for the hours either side of
 * local midnight, every day, in every timezone that is not UTC. The two sides of this comparison
 * must be produced by the same function or they will drift apart again.
 */
export function jobSubmittedOnDay(
  job: Pick<MonitoredJob, "id" | "company_name" | "title">,
  packets: GeneratedResume[],
  dayKey: string,
): boolean {
  return packets.some((packet) => {
    const review = packet.spec._review;
    return packetMatchesJob(packet, job)
      && review?.status === "submitted"
      && localDayKeyOf(review.submitted_at) === dayKey;
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

/* How many matches Home shows at once. */
export const HOME_MATCH_WINDOW = 3;

/**
 * The matches Home is currently showing.
 *
 * A WINDOW over the day's ranked set, not a page of it. Filter to whatever is still unfinished,
 * then cut to the window size, so finishing one match drops it out and the next-best slides up in
 * the same render. The order matters: cutting before filtering would freeze the window and leave a
 * gap where the finished match used to be, instead of refilling it.
 *
 * A match is finished either way a student can finish one. Submitting it and skipping it are
 * different intentions but the same fact here: it is no longer waiting on them.
 *
 * The window refills right up until the day's set runs out, so the only thing that can leave Home
 * showing fewer than `size` is the set itself being smaller. That is a supply question for the
 * job monitor, and nothing here can invent a third match out of a set of two.
 */
export function visibleMatches<T extends { id: string }>(
  todayJobs: readonly T[],
  options: { dismissed?: readonly string[]; submitted?: ReadonlySet<string>; size?: number } = {},
): T[] {
  const dismissed = options.dismissed ?? [];
  const submitted = options.submitted ?? new Set<string>();
  const size = options.size ?? HOME_MATCH_WINDOW;
  return todayJobs
    .filter((job) => !dismissed.includes(job.id) && !submitted.has(job.id))
    .slice(0, size);
}
