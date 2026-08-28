import type {
  ApplicationProfile,
  CanonicalApplication,
  DashboardBootstrap,
  GeneratedResume,
  Me,
  MonitoredJob,
  OutreachEvent,
  ParsedProfile,
  Targeting,
} from "@/lib/api";

export type DashboardInitialState = {
  me: Me;
  jobs: MonitoredJob[];
  targeting: Targeting;
  profile: Partial<ParsedProfile>;
  identity: { full_name?: string; email?: string; resume_email?: string };
  applicationProfile: ApplicationProfile;
  packets: GeneratedResume[];
  outreach: OutreachEvent[];
  autoSubmitEnabled: boolean;
};

export type DashboardRequester = <T>(path: string, init?: RequestInit) => Promise<T>;

function isBootstrapV1(value: unknown): value is DashboardBootstrap {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DashboardBootstrap>;
  return candidate.schema_version === 1
    && Boolean(candidate.me && typeof candidate.me === "object")
    && Boolean(candidate.jobs && typeof candidate.jobs === "object")
    && Array.isArray(candidate.jobs?.jobs);
}

function supportsLegacyFallback(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  return status === 404 || status === 501;
}

/** Keep wire-shape normalization out of the presentation layer so staggered deploys fail soft. */
export function dashboardStateFromBootstrap(bootstrap: DashboardBootstrap): DashboardInitialState {
  const profile = bootstrap.profile && typeof bootstrap.profile === "object"
    ? bootstrap.profile
    : { skills: [], target_roles: [] };

  return {
    me: bootstrap.me,
    jobs: Array.isArray(bootstrap.jobs?.jobs) ? bootstrap.jobs.jobs : [],
    targeting: bootstrap.targeting,
    profile,
    identity: {
      full_name: "full_name" in profile ? profile.full_name : undefined,
      email: bootstrap.me.email ?? undefined,
      resume_email: "resume_email" in profile ? profile.resume_email : undefined,
    },
    applicationProfile: bootstrap.application_profile ?? {},
    packets: Array.isArray(bootstrap.resume_history?.resumes) ? bootstrap.resume_history.resumes : [],
    outreach: Array.isArray(bootstrap.outreach) ? bootstrap.outreach : [],
    autoSubmitEnabled: bootstrap.onboarding?.automatic_submission_enabled === true,
  };
}

/**
 * Home counts what the Tracker counts, from the same two sources.
 *
 * /resume/history is deliberately capped at fifty FULL specs (the Tracker's own comment: widening
 * it restores the transfer problem that required the cap), and the Tracker completes the picture
 * by merging the canonical /applications list through mergeCanonicalApplicationHistory. Home used
 * to read history alone, so with a 100-row Tracker its tiles read "44 need something from you"
 * against an action view showing 88 (measured live 2026-08-28) and "6 Sent" against 13 on the
 * board. Same merge, same numbers; a failed canonical fetch keeps the history window, which is
 * the same fail-soft the Tracker chose for a rolling deploy.
 */
/* Injected rather than imported: the architecture boundary allows only the applications feature's
   public barrel from here, and that barrel cannot load under the node test runner. Home passes the
   real mergeCanonicalApplicationHistory; a caller that passes nothing gets the plain history
   window, unchanged. */
export type CanonicalHistoryMerge = (
  legacy: readonly GeneratedResume[],
  canonical: readonly CanonicalApplication[],
) => GeneratedResume[];

async function withCanonicalApplications(
  packets: GeneratedResume[],
  merge: CanonicalHistoryMerge | undefined,
  canonicalRequest: Promise<{ applications: CanonicalApplication[] } | null> | null,
): Promise<GeneratedResume[]> {
  if (!merge || !canonicalRequest) return packets;
  const canonical = await canonicalRequest;
  if (!canonical || !Array.isArray(canonical.applications)) return packets;
  return merge(packets, canonical.applications);
}

/** Keep the web deploy reversible while the aggregate endpoint rolls out independently. */
export async function loadDashboardInitialState(request: DashboardRequester, mergeCanonicalHistory?: CanonicalHistoryMerge): Promise<DashboardInitialState> {
  /* Started before anything is awaited: the canonical list depends on nothing above it, and
     serializing it behind the bootstrap cost every Home load a full round trip. The LIMIT MUST
     STAY IN LOCKSTEP with the Tracker's own fetch or Home's counts drift from the board again;
     tests/home-tracker-canonical-limit.test.mjs pins the two literals together. Both surfaces
     truncate at the same limit, so past it they undercount together rather than disagree.

     200, RAISED FROM 100 ON 2026-08-29, because the Tracker draws a THIRD surface off a different
     window: GET /applications/board has its own server-side ceiling of 200 (see board-stages.ts).
     At 100 the ledger and the board were two honest counts of two different universes rendered six
     pixels apart - "Your applications 100" directly above "187 of 200 have not been sent yet" - and
     the board's Applied column could hold a card the ledger's window did not reach, which is what
     made "Applied 13" and "12 Sent" both correct and irreconcilable. Matching the board's own
     ceiling makes the board a SUBSET of the merged inventory, which is the property
     boardStageReconciliationNote's claim depends on. This is a list of canonical rows with no
     resume specs on it, and the Tracker page already pays for 200 of the same rows through
     /applications/board, so the extra rows cost a larger JSON body and nothing else. */
  const canonicalRequest = mergeCanonicalHistory
    ? request<{ applications: CanonicalApplication[] }>("/applications?limit=200").catch(() => null)
    : null;
  try {
    // Account saves targeting through a different URL. The aggregate endpoint is privately cached,
    // so a normal fetch here can legally replay the pre-save subtitle after navigating Home.
    const bootstrap = await request<unknown>("/dashboard/bootstrap", { cache: "no-store" });
    if (isBootstrapV1(bootstrap)) {
      const state = dashboardStateFromBootstrap(bootstrap);
      return { ...state, packets: await withCanonicalApplications(state.packets, mergeCanonicalHistory, canonicalRequest) };
    }
  } catch (error) {
    if (!supportsLegacyFallback(error)) throw error;
  }

  const [me, jobs, targeting, profile, resumeHistory, applicationProfile, outreach, onboarding] = await Promise.all([
    request<Me>("/me"),
    request<{ jobs: MonitoredJob[] }>("/jobs?offset=0"),
    request<Targeting>("/profile/targeting").catch(() => ({ categories: null, titles: null, role_types: null, locations: null, remote_only: false, primary_period: null, backup_period: null })),
    request<Partial<ParsedProfile>>("/profile").catch(() => ({ skills: [], target_roles: [] })),
    request<{ resumes: GeneratedResume[] }>("/resume/history").catch(() => ({ resumes: [] })),
    request<ApplicationProfile>("/profile/application").catch(() => ({})),
    request<OutreachEvent[]>("/track/events").catch(() => []),
    request<{ automatic_submission_enabled?: boolean }>("/onboarding/state").catch(() => ({ automatic_submission_enabled: false })),
  ]);

  return dashboardStateFromBootstrap({
    schema_version: 1,
    me,
    jobs,
    targeting,
    profile,
    resume_history: { resumes: await withCanonicalApplications(resumeHistory.resumes ?? [], mergeCanonicalHistory, canonicalRequest) },
    application_profile: applicationProfile,
    outreach,
    onboarding: { automatic_submission_enabled: onboarding.automatic_submission_enabled === true },
    warnings: [],
  });
}
