"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  api,
  getStoredEmail,
  type ApplicationProfile,
  type GeneratedResume,
  type Me,
  type MonitoredJob,
  type ParsedProfile,
  type Targeting,
} from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, ShimmerRows, formatDate } from "@/components/app/ui";
import {
  countPreparedJobs,
  DAILY_PREPARED_RESUME_LIMIT,
  packetMatchesJob,
  rankJobs,
  resumeGenerationBody,
  type ProfileIdentity,
  type RankedJob,
} from "@/lib/daily-matches";

const QA_JOBS: MonitoredJob[] = [
  {
    id: "qa-job-1",
    company_name: "Acme Labs",
    title: "Product Engineer",
    location: "San Francisco, CA",
    department: "Engineering",
    employment_type: "Full-time",
    description: "Build product features with React, TypeScript, APIs, and data systems. Collaborate with product and design teams.",
    apply_url: "https://boards.greenhouse.io/acme/qa",
    posting_url: "https://boards.greenhouse.io/acme/qa",
    remote: false,
    posted_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
    ats_name: "greenhouse",
  },
  {
    id: "qa-job-2",
    company_name: "Stripe",
    title: "Software Engineering Intern",
    location: "New York, NY",
    department: "Product Engineering",
    employment_type: "Internship",
    description: "Ship customer-facing software using React, TypeScript, and backend APIs. Own projects from design through launch.",
    apply_url: "https://jobs.lever.co/stripe/qa",
    posting_url: "https://jobs.lever.co/stripe/qa",
    remote: false,
    posted_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
    ats_name: "lever",
  },
  {
    id: "qa-job-3",
    company_name: "Deepgram",
    title: "Software Engineering Intern",
    location: "Remote, US",
    department: "Engineering",
    employment_type: "Full-time",
    description: "Build reliable voice AI infrastructure and developer tools with TypeScript, Python, APIs, and distributed systems.",
    apply_url: "https://jobs.ashbyhq.com/deepgram/qa",
    posting_url: "https://jobs.ashbyhq.com/deepgram/qa",
    remote: true,
    posted_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
    ats_name: "ashby",
  },
];

const QA_ME: Me = {
  email: "qa@trylitos.com",
  tier: "pro",
  trial_ends_at: null,
  usage: {
    contacts: { used: 18, limit: 500 },
    drafts: { used: 11, limit: 1000 },
    resumes: { used: 7, limit: 100000 },
  },
};

const QA_TARGETING: Targeting = {
  categories: ["Software engineering", "Product engineering"],
  titles: ["Software Engineer", "Product Engineer"],
  role_types: ["internship", "new-grad"],
  primary_period: "Summer 2027",
  backup_period: null,
};

const QA_PROFILE: Partial<ParsedProfile> = {
  skills: ["React", "TypeScript", "APIs", "Product", "Data"],
  target_roles: ["Software Engineer", "Product Engineer"],
};

const QA_PACKETS: GeneratedResume[] = QA_JOBS.map((job) => ({
  id: `resume-${job.id}`,
  job_context: { company: job.company_name, role: job.title, jd_hash: job.id },
  created_at: new Date().toISOString(),
  spec: {
    school: "University of Southern California",
    degree: "B.S. Computer Science",
    grad_date: "May 2027",
    coursework: "Data Structures, Software Engineering",
    experience: [],
    skills: QA_PROFILE.skills ?? [],
    _review: {
      jd_text: job.description,
      portal_url: job.apply_url,
      ats_name: job.ats_name,
      status: "ready_to_submit",
      edited_terms: [],
      questions: [],
      skipped_reasons: [],
      updated_at: new Date().toISOString(),
    },
  },
}));

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [jobs, setJobs] = useState<MonitoredJob[] | null>(null);
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [profile, setProfile] = useState<Partial<ParsedProfile> | null>(null);
  const [identity, setIdentity] = useState<ProfileIdentity | null>(null);
  const [applicationProfile, setApplicationProfile] = useState<ApplicationProfile | null>(null);
  const [packets, setPackets] = useState<GeneratedResume[]>([]);
  const [qaMode, setQaMode] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [lastDismissed, setLastDismissed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prewarmError, setPrewarmError] = useState<string | null>(null);
  const [preparingCount, setPreparingCount] = useState(0);
  const prewarmStarted = useRef(false);

  useEffect(() => {
    queueMicrotask(() => setDismissed(readDismissed(dailyDismissalKey())));
    const qaMode = window.location.hostname === "localhost" && new URLSearchParams(window.location.search).has("qa");
    if (qaMode) {
      queueMicrotask(() => {
        setQaMode(true);
        setMe(QA_ME);
        setJobs(QA_JOBS);
        setTargeting(QA_TARGETING);
        setProfile(QA_PROFILE);
        setIdentity({ full_name: "Alex Rivera", email: "qa@trylitos.com" });
        setApplicationProfile({});
        setPackets(QA_PACKETS);
      });
      return;
    }

    let cancelled = false;
    Promise.all([
      api<Me>("/me"),
      api<{ jobs: MonitoredJob[] }>("/jobs?offset=0"),
      api<Targeting>("/profile/targeting").catch(() => ({ categories: null, titles: null, role_types: null, primary_period: null, backup_period: null })),
      api<Partial<ParsedProfile>>("/profile").catch(() => ({ skills: [], target_roles: [] })),
      api<{ resumes: GeneratedResume[] }>("/resume/history").catch(() => ({ resumes: [] })),
      api<ApplicationProfile>("/profile/application").catch(() => ({})),
    ])
      .then(([meResult, jobsResult, targetingResult, profileResult, historyResult, applicationProfileResult]) => {
        if (cancelled) return;
        setMe(meResult);
        setJobs(jobsResult.jobs);
        setTargeting(targetingResult);
        setProfile(profileResult);
        setIdentity({
          full_name: "full_name" in profileResult ? profileResult.full_name : undefined,
          email: meResult.email,
        });
        setApplicationProfile(applicationProfileResult);
        setPackets(historyResult.resumes);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load today's matches.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rankedJobs = useMemo(() => rankJobs(jobs ?? [], targeting, profile), [jobs, profile, targeting]);
  const dailyJobs = useMemo(() => rankedJobs.slice(0, DAILY_PREPARED_RESUME_LIMIT), [rankedJobs]);
  const visibleJobs = useMemo(
    () => rankedJobs.filter((job) => !dismissed.includes(job.id)).slice(0, 5),
    [dismissed, rankedJobs],
  );
  const preparedCount = useMemo(() => countPreparedJobs(dailyJobs, packets), [dailyJobs, packets]);

  useEffect(() => {
    if (qaMode || prewarmStarted.current || !me || !identity || !applicationProfile || dailyJobs.length === 0) return;
    if (!identity.full_name?.trim()) return;
    prewarmStarted.current = true;

    const remainingQuota = me.usage.resumes.limit >= 100000
      ? DAILY_PREPARED_RESUME_LIMIT
      : Math.max(0, me.usage.resumes.limit - me.usage.resumes.used);
    const missing = dailyJobs
      .filter((job) => !packets.some((packet) => packetMatchesJob(packet, job)))
      .slice(0, remainingQuota);
    if (missing.length === 0) return;

    let cancelled = false;
    let cursor = 0;
    let halted = false;
    queueMicrotask(() => setPreparingCount(missing.length));

    const worker = async () => {
      while (!cancelled && !halted) {
        const job = missing[cursor++];
        if (!job) return;
        const lockKey = prewarmLockKey(job.id);
        const existingLock = Number(window.localStorage.getItem(lockKey));
        if (existingLock && Date.now() - existingLock < 10 * 60 * 1000) {
          setPreparingCount((count) => Math.max(0, count - 1));
          continue;
        }
        window.localStorage.setItem(lockKey, String(Date.now()));
        try {
          const { job: completeJob } = await api<{ job: MonitoredJob }>(`/jobs/${job.id}`);
          const generated = await api<{ application?: GeneratedResume }>("/resume/generate", {
            method: "POST",
            body: JSON.stringify(resumeGenerationBody(completeJob, identity, applicationProfile, getStoredEmail())),
          });
          if (generated.application && !cancelled) {
            setPackets((current) => [generated.application!, ...current.filter((packet) => packet.id !== generated.application!.id)]);
          }
        } catch (reason) {
          window.localStorage.removeItem(lockKey);
          const message = reason instanceof Error ? reason.message : "Resume preparation paused.";
          if (/limit|quota|slow down|temporarily unavailable/i.test(message)) {
            halted = true;
            setPreparingCount(0);
          }
          if (!cancelled) setPrewarmError(message);
        } finally {
          if (!cancelled) setPreparingCount((count) => Math.max(0, count - 1));
        }
      }
    };

    void Promise.all(Array.from({ length: Math.min(3, missing.length) }, () => worker()));
    return () => {
      cancelled = true;
    };
  }, [applicationProfile, dailyJobs, identity, me, packets, qaMode]);

  function dismiss(jobId: string) {
    const next = [...new Set([...dismissed, jobId])];
    setDismissed(next);
    setLastDismissed(jobId);
    window.localStorage.setItem(dailyDismissalKey(), JSON.stringify(next));
  }

  function undoDismiss() {
    if (!lastDismissed) return;
    const next = dismissed.filter((id) => id !== lastDismissed);
    setDismissed(next);
    setLastDismissed(null);
    window.localStorage.setItem(dailyDismissalKey(), JSON.stringify(next));
  }

  const targetLabel = targeting?.titles?.[0] ?? profile?.target_roles?.[0] ?? "your target roles";

  if (error && !jobs) return <ErrorNote message={error} />;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Today</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.025em] text-ink sm:text-[40px]">Your best matches.</h1>
          <p className="mt-2 text-sm text-muted">Ranked from your resume and target roles.</p>
        </div>
        <Link href="/dashboard/profile" className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink">
          Targeting: {targetLabel}
        </Link>
      </section>

      {jobs === null ? (
        <ShimmerRows rows={4} />
      ) : visibleJobs.length === 0 ? (
        <EmptyState
          title={dismissed.length ? "Today's queue is clear" : "No matches yet"}
          body={dismissed.length ? "You reviewed every match. New roles will appear after the next job-board scan." : "Complete your profile so Litos can rank roles from the job boards it monitors."}
        >
          <Link href={dismissed.length ? "/dashboard/jobs" : "/dashboard/profile"} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">
            {dismissed.length ? "Browse all jobs" : "Complete profile"}
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-faint">{visibleJobs.length} READY TO REVIEW</p>
            <Link href="/dashboard/jobs" className="text-sm text-muted hover:text-ink">See all jobs</Link>
          </div>
          {visibleJobs.map((job) => (
            <JobMatchCard key={job.id} job={job} rank={rankedJobs.findIndex((ranked) => ranked.id === job.id) + 1} qaMode={qaMode} prepared={packets.some((packet) => packetMatchesJob(packet, job))} onDismiss={() => dismiss(job.id)} />
          ))}
        </div>
      )}

      {dailyJobs.length > 0 && (
        <section aria-label="Daily resume preparation" className="rounded-[16px] border border-brand/20 bg-brand-soft/55 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-brand-ink">Top {Math.min(DAILY_PREPARED_RESUME_LIMIT, dailyJobs.length)} resumes</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-brand-ink/70">
                {preparedCount} ready{preparingCount > 0 ? ` · ${preparingCount} preparing` : ""}
              </p>
            </div>
            <Link href="/dashboard/applications" className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white">Open applications</Link>
          </div>
          {prewarmError && <p className="mt-2 text-xs text-warn">Preparation paused. Open any role to continue generating its resume.</p>}
        </section>
      )}

      {lastDismissed && (
        <div role="status" className="flex items-center justify-between rounded-[12px] bg-surface-alt px-4 py-3 text-sm text-muted">
          <span>Passed for today.</span>
          <button type="button" onClick={undoDismiss} className="font-medium text-ink">Undo</button>
        </div>
      )}

      {me && (
        <section className="border-t border-border pt-7">
          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-medium text-ink">This month</p>
              <p className="mt-1 font-mono text-xs text-faint">
                {me.usage.resumes.used} applications prepared · {me.usage.drafts.used} outreach drafts
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/applications" className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink">Applications</Link>
              <Link href="/dashboard/applications?new=1" className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink">Add a job URL</Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function JobMatchCard({ job, rank, qaMode, prepared, onDismiss }: { job: RankedJob; rank: number; qaMode: boolean; prepared: boolean; onDismiss: () => void }) {
  return (
    <Card className="overflow-hidden transition-colors hover:border-ink/30">
      <div className="grid gap-5 p-5 sm:grid-cols-[44px_1fr_auto] sm:items-center sm:p-6">
        <div className="hidden size-11 items-center justify-center rounded-full bg-brand-soft font-mono text-xs font-medium text-brand-ink sm:flex">
          {String(rank).padStart(2, "0")}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip label={`${job.match}% match`} kind="ready" />
            <Chip label={prepared ? "Resume ready" : "Preparing"} kind={prepared ? "sent" : "generating"} />
            {job.remote && <Chip label="Remote" kind="sent" />}
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">Found {formatDate(job.first_seen_at)}</span>
          </div>
          <h2 className="mt-3 text-lg font-medium text-ink">{job.title}</h2>
          <p className="mt-1 text-sm text-muted">{job.company_name}{job.location ? ` · ${job.location}` : ""}</p>
          <p className="mt-2 text-xs text-faint">{job.reasons.join(" · ")}</p>
        </div>
        <div className="flex gap-2 sm:justify-end">
          <button type="button" onClick={onDismiss} aria-label={`Pass on ${job.title} at ${job.company_name}`} className="rounded-full border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:border-danger/40">
            Pass
          </button>
          <Link href={`/dashboard/applications?job=${job.id}${qaMode ? `&qa=${qaScenarioKey(job)}` : ""}`} className="rounded-full border border-positive/20 bg-positive-soft px-5 py-2.5 text-center text-sm font-medium text-positive transition-colors hover:border-positive/40">
            {prepared ? "Review" : "Approve"}
          </Link>
        </div>
      </div>
    </Card>
  );
}

function dailyDismissalKey(): string {
  return `litos-dismissed-${new Date().toISOString().slice(0, 10)}`;
}

function readDismissed(key: string): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function prewarmLockKey(jobId: string): string {
  return `litos-prewarm-${new Date().toISOString().slice(0, 10)}-${jobId}`;
}

function qaScenarioKey(job: MonitoredJob): string {
  return job.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
