"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  api,
  getStoredEmail,
  type ApplicationReview,
  type ApplicationProfile,
  type GeneratedResume,
  type Me,
  type MonitoredJob,
  type OutreachEvent,
  type ParsedProfile,
  type Targeting,
} from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, ShimmerRows, formatDate } from "@/components/app/ui";
import {
  DAILY_PREPARED_RESUME_LIMIT,
  packetMatchesJob,
  rankJobs,
  resumeGenerationBody,
  type ProfileIdentity,
  type RankedJob,
} from "@/lib/daily-matches";

type SubmissionResponse = { application_id: string; review: ApplicationReview; handoff_url?: string };

const MONTHLY_PRO_APPLICATION_LIMIT = 1_000;
const ACTIVE_SUBMISSION_STATUSES = new Set<ApplicationReview["status"]>([
  "submit_requested",
  "preparing",
  "filling",
  "submitting",
  "submission_claimed",
]);

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
  is_guest: false,
  tier: "pro",
  trial_ends_at: null,
  usage: {
    contacts: { used: 18, limit: 500 },
    drafts: { used: 11, limit: 1000 },
    resumes: { used: 7, limit: MONTHLY_PRO_APPLICATION_LIMIT },
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

const QA_OUTREACH: OutreachEvent[] = [
  {
    id: "qa-outreach-1",
    channel: "gmail",
    subject: "USC student interested in Acme",
    draft_text: "Hi Jordan, I am a USC student interested in Acme's product engineering work.",
    sent_at: new Date().toISOString(),
    opened_at: null,
    replied_at: new Date().toISOString(),
    bounced: false,
    follow_up_count: 0,
    status: "replied",
    contact: { id: "qa-contact-1", full_name: "Jordan Lee", title: "Product Engineer", company_domain: "acme.com" },
  },
  {
    id: "qa-outreach-2",
    channel: "gmail",
    subject: "Stripe engineering internship",
    draft_text: "Hi Sam, I would value your perspective on Stripe's internship program.",
    sent_at: new Date(Date.now() - 86_400_000).toISOString(),
    opened_at: null,
    replied_at: null,
    bounced: false,
    follow_up_count: 0,
    status: "sent",
    contact: { id: "qa-contact-2", full_name: "Sam Chen", title: "Software Engineer", company_domain: "stripe.com" },
  },
];

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [jobs, setJobs] = useState<MonitoredJob[] | null>(null);
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [profile, setProfile] = useState<Partial<ParsedProfile> | null>(null);
  const [identity, setIdentity] = useState<ProfileIdentity | null>(null);
  const [applicationProfile, setApplicationProfile] = useState<ApplicationProfile | null>(null);
  const [packets, setPackets] = useState<GeneratedResume[]>([]);
  const [outreach, setOutreach] = useState<OutreachEvent[]>([]);
  const [qaMode, setQaMode] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [lastDismissed, setLastDismissed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewJob, setReviewJob] = useState<RankedJob | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [prewarmFailures, setPrewarmFailures] = useState<string[]>([]);
  const [prewarmRetry, setPrewarmRetry] = useState(0);
  const [loadedAt, setLoadedAt] = useState(0);
  const prewarmStarted = useRef(false);
  const reviewTriggerRef = useRef<HTMLElement | null>(null);
  const activeReviewJobIdRef = useRef<string | null>(null);

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
        setOutreach(QA_OUTREACH);
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
      api<{ events?: OutreachEvent[] } | OutreachEvent[]>("/track/events").catch(() => []),
    ])
      .then(([meResult, jobsResult, targetingResult, profileResult, historyResult, applicationProfileResult, outreachResult]) => {
        if (cancelled) return;
        setMe(meResult);
        setLoadedAt(Date.now());
        setJobs(jobsResult.jobs);
        setTargeting(targetingResult);
        setProfile(profileResult);
        setIdentity({
          full_name: "full_name" in profileResult ? profileResult.full_name : undefined,
          email: meResult.email ?? undefined,
        });
        setApplicationProfile(applicationProfileResult);
        setPackets(historyResult.resumes);
        setOutreach(Array.isArray(outreachResult) ? outreachResult : (outreachResult.events ?? []));
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
  const applicationSummary = useMemo(() => {
    const submitted = packets.filter((packet) => packet.spec._review?.status === "submitted").length;
    const needsAction = packets.filter((packet) => ["needs_attention", "ready_for_final_approval", "failed"].includes(packet.spec._review?.status ?? "")).length;
    const ready = packets.filter((packet) => ["resume_ready", "questions_ready", "ready_to_submit"].includes(packet.spec._review?.status ?? "")).length;
    return { ready, submitted, needsAction };
  }, [packets]);
  const outreachSummary = useMemo(() => ({
    drafted: outreach.filter((event) => event.status === "drafted").length,
    sent: outreach.filter((event) => ["sent", "replied"].includes(event.status)).length,
    replied: outreach.filter((event) => event.status === "replied").length,
  }), [outreach]);
  const reviewPacket = useMemo(
    () => reviewJob ? packets.find((packet) => packetMatchesJob(packet, reviewJob)) ?? null : null,
    [packets, reviewJob],
  );

  useEffect(() => {
    if (!reviewJob) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        activeReviewJobIdRef.current = null;
        setReviewSubmitting(false);
        setReviewJob(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      reviewTriggerRef.current?.focus();
    };
  }, [reviewJob]);

  useEffect(() => {
    const packetId = reviewPacket?.id;
    const status = reviewPacket?.spec._review?.status;
    if (qaMode || !packetId || !status || !ACTIVE_SUBMISSION_STATUSES.has(status)) return;

    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const result = await api<SubmissionResponse>(`/applications/${packetId}/submission`);
        if (cancelled) return;
        setPackets((current) => current.map((packet) => packet.id === packetId
          ? { ...packet, spec: { ...packet.spec, _review: result.review } }
          : packet));
        setReviewError(null);
        if (ACTIVE_SUBMISSION_STATUSES.has(result.review.status)) {
          timer = window.setTimeout(tick, 2_500);
        }
      } catch (reason) {
        if (cancelled) return;
        setReviewError(reason instanceof Error ? reason.message : "Could not refresh submission status.");
        timer = window.setTimeout(tick, 5_000);
      }
    };

    timer = window.setTimeout(tick, 2_500);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [qaMode, reviewPacket?.id, reviewPacket?.spec._review?.status]);

  useEffect(() => {
    if (qaMode || prewarmStarted.current || !me || !identity || !applicationProfile || dailyJobs.length === 0) return;
    if (!identity.full_name?.trim()) return;
    prewarmStarted.current = true;

    const remainingQuota = Math.max(0, applicationLimit(me) - me.usage.resumes.used);
    const missing = dailyJobs
      .filter((job) => !packets.some((packet) => packetMatchesJob(packet, job)))
      .slice(0, remainingQuota);
    if (missing.length === 0) return;

    let cancelled = false;
    let cursor = 0;
    let halted = false;
    const worker = async () => {
      while (!cancelled && !halted) {
        const job = missing[cursor++];
        if (!job) return;
        const lockKey = prewarmLockKey(job.id);
        const existingLock = Number(window.localStorage.getItem(lockKey));
        if (existingLock && Date.now() - existingLock < 10 * 60 * 1000) {
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
            setPrewarmFailures((current) => current.filter((jobId) => jobId !== job.id));
          }
        } catch (reason) {
          window.localStorage.removeItem(lockKey);
          if (!cancelled) setPrewarmFailures((current) => [...new Set([...current, job.id])]);
          const message = reason instanceof Error ? reason.message : "Resume preparation paused.";
          if (/limit|quota|slow down|temporarily unavailable/i.test(message)) {
            halted = true;
          }
        }
      }
    };

    void Promise.all(Array.from({ length: Math.min(3, missing.length) }, () => worker()));
    return () => {
      cancelled = true;
    };
  }, [applicationProfile, dailyJobs, identity, me, packets, prewarmRetry, qaMode]);

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

  function openReview(job: RankedJob) {
    reviewTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeReviewJobIdRef.current = job.id;
    setReviewSubmitting(false);
    setReviewError(null);
    setReviewJob(job);
  }

  function closeReview() {
    activeReviewJobIdRef.current = null;
    setReviewSubmitting(false);
    setReviewJob(null);
  }

  function retryPreparation(jobId: string) {
    window.localStorage.removeItem(prewarmLockKey(jobId));
    setPrewarmFailures((current) => current.filter((id) => id !== jobId));
    prewarmStarted.current = false;
    setPrewarmRetry((current) => current + 1);
  }

  async function submitFromDrawer() {
    if (!reviewPacket || reviewSubmitting) return;
    const submittedJobId = reviewJob?.id ?? null;
    const review = reviewPacket.spec._review;
    if (!review) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      if (qaMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 550));
        const nextReview: ApplicationReview = {
          ...review,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setPackets((current) => current.map((packet) => packet.id === reviewPacket.id ? { ...packet, spec: { ...packet.spec, _review: nextReview } } : packet));
        return;
      }

      const endpoint = review.status === "ready_for_final_approval"
        ? `/applications/${reviewPacket.id}/submission/approve`
        : `/applications/${reviewPacket.id}/submit-request`;
      const result = await api<SubmissionResponse>(endpoint, {
        method: "POST",
        body: endpoint.endsWith("submit-request") ? JSON.stringify({ questions: review.questions }) : undefined,
      });
      setPackets((current) => current.map((packet) => packet.id === reviewPacket.id ? { ...packet, spec: { ...packet.spec, _review: result.review } } : packet));
    } catch (reason) {
      if (activeReviewJobIdRef.current === submittedJobId) {
        setReviewError(reason instanceof Error ? reason.message : "Could not submit this application.");
      }
    } finally {
      if (activeReviewJobIdRef.current === submittedJobId) setReviewSubmitting(false);
    }
  }

  const targetLabel = targeting?.titles?.[0] ?? profile?.target_roles?.[0] ?? "your target roles";
  const trialActive = Boolean(
    me?.trial_ends_at && loadedAt > 0 && new Date(me.trial_ends_at).getTime() > loadedAt,
  );

  if (error && !jobs) return <ErrorNote message={error} />;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-medium tracking-[-0.025em] text-ink">Overview</h1>
          <p className="mt-1 text-sm text-muted">{targetLabel}</p>
        </div>
        <Link href="/dashboard/profile" className="flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium text-ink transition-colors hover:border-ink">
          Edit targeting
        </Link>
      </section>

      {me?.is_guest && trialActive && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium text-ink">Keep this workspace.</p>
            <p className="mt-1 text-xs text-muted">Verify a new email before this browser session is lost.</p>
          </div>
          <Link href="/login?claim=1" className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">
            Save workspace
          </Link>
        </Card>
      )}

      {me?.is_guest && !trialActive && me.checkout_available && (
        <Card className="flex flex-wrap items-center justify-between gap-4 bg-brand-soft p-5">
          <div>
            <p className="text-sm font-medium text-ink">Your seven-day trial has ended.</p>
            <p className="mt-1 text-xs text-muted">Save this workspace, then continue with Litos Pro.</p>
          </div>
          <Link
            href="/login?claim=1&next=upgrade"
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white"
          >
            Get Pro
          </Link>
        </Card>
      )}

      <section aria-labelledby="applications-summary">
        <div className="flex items-center justify-between gap-4">
          <h2 id="applications-summary" className="text-base font-medium text-ink">Applications</h2>
          <Link href="/dashboard/applications" className="text-sm font-medium text-brand hover:text-brand-ink">View all</Link>
        </div>
        <dl className="mt-4 grid grid-cols-3 border-y border-border">
          <SummaryMetric label="Ready" value={applicationSummary.ready} />
          <SummaryMetric label="Needs action" value={applicationSummary.needsAction} urgent={applicationSummary.needsAction > 0} />
          <SummaryMetric label="Submitted" value={applicationSummary.submitted} />
        </dl>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="action-heading">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
            <h2 id="action-heading" className="text-base font-medium text-ink">Action needed</h2>
            <span className="font-mono text-xs text-faint">{applicationSummary.needsAction + applicationSummary.ready}</span>
          </div>
          {applicationSummary.needsAction + applicationSummary.ready > 0 ? (
            <div className="divide-y divide-border">
              {applicationSummary.needsAction > 0 && (
                <DashboardRow label={`${applicationSummary.needsAction} application${applicationSummary.needsAction === 1 ? "" : "s"} blocked`} detail="Resolve required details" href="/dashboard/applications" />
              )}
              {applicationSummary.ready > 0 && (
                <DashboardRow label={`${applicationSummary.ready} application${applicationSummary.ready === 1 ? "" : "s"} ready`} detail="Review and submit" href="/dashboard/applications" />
              )}
            </div>
          ) : (
            <p className="py-5 text-sm text-muted">Nothing needs you.</p>
          )}
        </section>

        <section aria-labelledby="outreach-summary">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
            <h2 id="outreach-summary" className="text-base font-medium text-ink">Outreach</h2>
            <Link href="/dashboard/outreach" className="text-sm font-medium text-brand hover:text-brand-ink">View all</Link>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-border py-5">
            <MiniMetric label="Drafted" value={outreachSummary.drafted} />
            <MiniMetric label="Sent" value={outreachSummary.sent} />
            <MiniMetric label="Replied" value={outreachSummary.replied} />
          </dl>
        </section>
      </div>

      <section aria-labelledby="matches-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="matches-heading" className="text-base font-medium text-ink">Today&apos;s matches</h2>
            <p className="mt-1 text-xs text-muted">Ranked from your profile.</p>
          </div>
          <Link href="/dashboard/jobs" className="text-sm font-medium text-brand hover:text-brand-ink">View all</Link>
        </div>

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
            <span />
          </div>
          {visibleJobs.map((job) => (
            <JobMatchCard key={job.id} job={job} rank={rankedJobs.findIndex((ranked) => ranked.id === job.id) + 1} prepared={packets.some((packet) => packetMatchesJob(packet, job))} preparationFailed={prewarmFailures.includes(job.id)} onDismiss={() => dismiss(job.id)} onReview={() => openReview(job)} onRetry={() => retryPreparation(job.id)} />
          ))}
        </div>
      )}
      </section>

      {lastDismissed && (
        <div role="status" className="flex items-center justify-between rounded-[12px] bg-surface-alt px-4 py-3 text-sm text-muted">
          <span>Passed for today.</span>
          <button type="button" onClick={undoDismiss} className="font-medium text-ink">Undo</button>
        </div>
      )}

      {me && (
        <section aria-labelledby="usage-heading" className="border-t border-border pt-6">
          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <h2 id="usage-heading" className="text-sm font-medium text-ink">Usage</h2>
                <span className="font-mono text-[10px] uppercase text-faint">{me.tier}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{usageLabel(me.usage.resumes.used, applicationLimit(me), "resumes this month")} · {usageLabel(me.usage.drafts.used, me.usage.drafts.limit, "drafts")}</p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/settings" className="flex min-h-11 items-center px-2 text-sm font-medium text-muted hover:text-ink">Plan</Link>
              <Link href="/dashboard/applications?new=1" className="flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-medium text-white">Add job URL</Link>
            </div>
          </div>
        </section>
      )}

      {reviewJob && (
        <ReviewDrawer
          job={reviewJob}
          packet={reviewPacket}
          submitting={reviewSubmitting}
          error={reviewError}
          onClose={closeReview}
          onSubmit={submitFromDrawer}
        />
      )}
    </div>
  );
}

function SummaryMetric({ label, value, urgent = false }: { label: string; value: number; urgent?: boolean }) {
  return (
    <div className="border-border px-3 py-4 first:pl-0 even:border-l sm:border-l sm:first:border-l-0 sm:px-5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl ${urgent ? "text-warn" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 first:pl-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-xl text-ink">{value}</dd>
    </div>
  );
}

function DashboardRow({ label, detail, href }: { label: string; detail: string; href: string }) {
  return (
    <Link href={href} className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-4 py-2 group">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
      <span aria-hidden="true" className="text-brand transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

function JobMatchCard({ job, rank, prepared, preparationFailed, onDismiss, onReview, onRetry }: { job: RankedJob; rank: number; prepared: boolean; preparationFailed: boolean; onDismiss: () => void; onReview: () => void; onRetry: () => void }) {
  return (
    <Card className="overflow-hidden transition-colors hover:border-ink/30">
      <div className="grid gap-5 p-5 sm:grid-cols-[44px_1fr_auto] sm:items-center sm:p-6">
        <div className="hidden size-11 items-center justify-center rounded-full bg-brand-soft font-mono text-xs font-medium text-brand-ink sm:flex">
          {String(rank).padStart(2, "0")}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip label={`${job.match}% match`} kind="ready" />
            <Chip label={prepared ? "Resume ready" : preparationFailed ? "Preparation paused" : "Preparing"} kind={prepared ? "sent" : "generating"} />
            {job.remote && <Chip label="Remote" kind="sent" />}
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">Found {formatDate(job.first_seen_at)}</span>
          </div>
          <h2 className="mt-3 text-lg font-medium text-ink">{job.title}</h2>
          <p className="mt-1 text-sm text-muted">{job.company_name}{job.location ? ` · ${job.location}` : ""}</p>
          <p className="mt-2 text-xs text-faint">{job.reasons.join(" · ")}</p>
        </div>
        <div className="flex gap-2 sm:justify-end">
          <button type="button" onClick={onDismiss} aria-label={`Pass on ${job.title} at ${job.company_name}`} className="min-h-11 px-3 text-sm font-medium text-muted transition-colors hover:text-ink">
            Pass
          </button>
          <button type="button" onClick={prepared ? onReview : onRetry} disabled={!prepared && !preparationFailed} aria-label={`${prepared ? "Review" : preparationFailed ? "Retry preparation for" : "Preparing"} ${job.title} at ${job.company_name}`} className="flex min-h-11 items-center rounded-full bg-brand px-5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:bg-surface-strong disabled:text-faint">
            {prepared ? "Review" : preparationFailed ? "Retry" : "Preparing"}
          </button>
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

function usageLabel(used: number, limit: number, noun: string): string {
  return `${used.toLocaleString()} of ${limit.toLocaleString()} ${noun}`;
}

function applicationLimit(me: Me): number {
  return me.usage.resumes.limit;
}

function ReviewDrawer({ job, packet, submitting, error, onClose, onSubmit }: { job: RankedJob; packet: GeneratedResume | null; submitting: boolean; error: string | null; onClose: () => void; onSubmit: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const review = packet?.spec._review;
  const missingAnswers = review?.questions.filter((question) => question.required && !question.answer.trim()) ?? [];
  const status = review?.status;
  const submitted = status === "submitted";
  const inProgress = status ? ACTIVE_SUBMISSION_STATUSES.has(status) : false;
  const needsAttention = ["needs_attention", "failed"].includes(status ?? "");
  const canSubmit = Boolean(packet && review && missingAnswers.length === 0 && !submitted && !inProgress && !needsAttention);
  const buttonLabel = submitting
    ? "Submitting..."
    : status === "ready_for_final_approval"
      ? "Approve submission"
      : submitted
        ? "Submitted"
        : inProgress
          ? "Submitting"
      : "Submit application";

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  function containFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" tabIndex={-1} aria-label="Close review" onClick={onClose} className="dashboard-drawer-backdrop absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
      <aside role="dialog" aria-modal="true" aria-labelledby="review-title" onKeyDown={containFocus} className="dashboard-drawer absolute inset-y-0 right-0 flex w-full max-w-[1120px] flex-col bg-white shadow-[-24px_0_80px_rgba(20,20,18,0.14)]">
        <header className="flex items-start justify-between gap-6 border-b border-border px-5 py-5 sm:px-8">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">Review match</p>
            <h2 id="review-title" className="mt-1 truncate text-xl font-medium tracking-[-0.02em] text-ink">{job.title}</h2>
            <p className="mt-1 truncate text-sm text-muted">{job.company_name}{job.location ? ` · ${job.location}` : ""}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-xl text-muted transition-colors hover:border-ink hover:text-ink" aria-label="Close review">×</button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
          <section aria-labelledby="job-description-heading" className="border-b border-border p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h3 id="job-description-heading" className="text-sm font-medium text-ink">Job description</h3>
              <Chip label={`${job.match}% match`} kind="ready" />
            </div>
            <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted">{review?.jd_text || job.description}</p>
          </section>

          <section aria-labelledby="resume-heading" className="bg-surface-alt p-5 lg:overflow-y-auto sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h3 id="resume-heading" className="text-sm font-medium text-ink">Tailored resume</h3>
              {packet?.created_at && <span className="font-mono text-[10px] uppercase text-faint">{formatDate(packet.created_at)}</span>}
            </div>
            {packet ? <ResumePreview packet={packet} /> : <p className="mt-6 text-sm text-muted">Resume is still preparing.</p>}
          </section>
        </div>

        <footer className="border-t border-border bg-white px-5 py-4 sm:px-8">
          {error && <p role="alert" className="mb-3 text-sm text-warn">{error}</p>}
          {missingAnswers.length > 0 && <p className="mb-3 text-sm text-warn">{missingAnswers.length} answer{missingAnswers.length === 1 ? "" : "s"} needed.</p>}
          {needsAttention && <p className="mb-3 text-sm text-warn">This application needs attention.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">Safety checks pause when you are needed.</p>
            <div className="flex items-center gap-2">
              {(missingAnswers.length > 0 || needsAttention) && packet && (
                <Link href={`/dashboard/applications?application=${packet.id}`} className="flex min-h-11 items-center px-3 text-sm font-medium text-ink">Resolve details</Link>
              )}
              <button type="button" onClick={onSubmit} disabled={!canSubmit || submitting} className={`min-h-11 rounded-full px-6 text-sm font-medium transition-opacity ${submitted ? "bg-positive-soft text-positive disabled:bg-positive-soft disabled:text-positive" : "bg-brand text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-faint"}`}>
                {buttonLabel}
              </button>
            </div>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function ResumePreview({ packet }: { packet: GeneratedResume }) {
  const spec = packet.spec;
  return (
    <article className="mt-6 rounded-[14px] border border-border bg-white p-5 shadow-[0_12px_36px_rgba(20,20,18,0.06)] sm:p-7">
      <div className="border-b border-ink pb-4">
        <h4 className="text-lg font-semibold tracking-[-0.02em] text-ink">{packet.job_context.role || "Tailored resume"}</h4>
        <p className="mt-1 text-xs text-muted">{packet.job_context.company}</p>
      </div>
      <ResumeSection title="Education">
        <p className="text-sm font-medium text-ink">{spec.school}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{[spec.degree, spec.grad_date].filter(Boolean).join(" · ")}</p>
        {spec.coursework && <p className="mt-2 text-xs leading-5 text-muted">{spec.coursework}</p>}
      </ResumeSection>
      {spec.experience.length > 0 && (
        <ResumeSection title="Experience">
          <div className="space-y-5">
            {spec.experience.map((entry, index) => (
              <div key={`${entry.org}-${entry.title}-${index}`}>
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{entry.title} · {entry.org}</p>
                  <p className="font-mono text-[10px] text-faint">{entry.date_range}</p>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted">
                  {entry.bullets.map((bullet, bulletIndex) => <li key={`${bullet}-${bulletIndex}`}>{bullet}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </ResumeSection>
      )}
      <ResumeSection title="Skills">
        <p className="text-xs leading-6 text-muted">{spec.skills.join(" · ")}</p>
      </ResumeSection>
    </article>
  );
}

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border py-4 last:border-b-0 last:pb-0">
      <h5 className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{title}</h5>
      {children}
    </section>
  );
}
