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
import { Card, Chip, EmptyState, ErrorNote, Meter, ScoreRing, ShimmerRows, formatRelativeDate } from "@/components/app/ui";
import { Funnel } from "@/components/app/Funnel";
import { DailyMatchesComplete } from "@/components/app/DailyMatchesComplete";
import {
  AUTO_SUBMIT_PREPARED_LIMIT,
  jobSubmittedOnDay,
  packetMatchesJob,
  rankJobs,
  resumeGenerationBody,
  type ProfileIdentity,
  type RankedJob,
} from "@/features/applications";
import { formatPay, jobTypeLabel, type PayFacts } from "@/features/jobs";
import { loadDashboardInitialState } from "@/features/dashboard";

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
    salary_min: 145700,
    salary_max: 200300,
    salary_currency: "USD",
    salary_interval: "year",
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
    salary_min: 45,
    salary_max: 55,
    salary_currency: "USD",
    salary_interval: "hour",
  },
  {
    id: "qa-job-3",
    company_name: "Deepgram",
    title: "Software Engineer",
    location: "Remote, US",
    department: "Engineering",
    /* Publishes neither pay nor a job type, like most of the real board. This card must show
       no pay line at all rather than gaining a placeholder. */
    employment_type: null,
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
    subject: "Fellow Trojan interested in Acme",
    draft_text: "Hi Jordan, fellow Trojan here, and interested in Acme's product engineering work.",
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
    subject: "Stripe engineering, quick question",
    draft_text: "Hi Sam, I would value your perspective on how Stripe's engineering teams are structured.",
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
  /* Starts false, not null, and stays false unless /onboarding/state says otherwise. The prewarm
     below reads it, and "we do not know yet" must not build anything. */
  const [autoSubmitEnabled, setAutoSubmitEnabled] = useState(false);
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
        setIdentity({ full_name: "John Doe", email: "qa@trylitos.com" });
        setApplicationProfile({});
        setPackets(QA_PACKETS);
        setOutreach(QA_OUTREACH);
      });
      return;
    }

    let cancelled = false;
    loadDashboardInitialState(api)
      .then((initial) => {
        if (cancelled) return;
        setMe(initial.me);
        setLoadedAt(Date.now());
        setJobs(initial.jobs);
        setTargeting(initial.targeting);
        setProfile(initial.profile);
        setIdentity(initial.identity);
        setApplicationProfile(initial.applicationProfile);
        setPackets(initial.packets);
        setOutreach(initial.outreach);
        setAutoSubmitEnabled(initial.autoSubmitEnabled);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "We could not load your jobs. Reload the page.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rankedJobs = useMemo(() => rankJobs(jobs ?? [], targeting, profile), [jobs, profile, targeting]);
  /* The build-ahead queue, and ONLY that: nothing renders this list. Empty unless automatic
     submission is on, which is what stops resumes being built for students who never asked. */
  const dailyJobs = useMemo(
    () => (autoSubmitEnabled ? rankedJobs.slice(0, AUTO_SUBMIT_PREPARED_LIMIT) : []),
    [autoSubmitEnabled, rankedJobs],
  );
  // The backend response is today's complete match set, and its size can vary. Home shows only
  // the next three unfinished matches, but completion must account for every match in this set.
  const todayJobs = rankedJobs;
  const todayKey = new Date().toISOString().slice(0, 10);
  const submittedToday = useMemo(
    () => new Set(todayJobs.filter((job) => jobSubmittedOnDay(job, packets, todayKey)).map((job) => job.id)),
    [packets, todayJobs, todayKey],
  );
  const visibleJobs = useMemo(
    () => todayJobs.filter((job) => !dismissed.includes(job.id) && !submittedToday.has(job.id)).slice(0, 3),
    [dismissed, submittedToday, todayJobs],
  );
  const allTodaySubmitted = todayJobs.length > 0 && submittedToday.size === todayJobs.length;
  const applicationSummary = useMemo(() => {
    const submitted = packets.filter((packet) => packet.spec._review?.status === "submitted").length;
    const needsAction = packets.filter((packet) => ["needs_attention", "ready_for_final_approval", "failed"].includes(packet.spec._review?.status ?? "")).length;
    const ready = packets.filter((packet) => ["resume_ready", "questions_ready", "ready_to_submit"].includes(packet.spec._review?.status ?? "")).length;
    return { ready, submitted, needsAction };
  }, [packets]);
  /* Each summary block gates on its own total, so a student with emails but no applications is
     not shown a row of application zeros to prove it (and vice versa). */
  const applicationTotal = applicationSummary.ready + applicationSummary.submitted + applicationSummary.needsAction;
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
        setReviewError(reason instanceof Error ? reason.message : "We could not find this application. Reload the page.");
        timer = window.setTimeout(tick, 5_000);
      }
    };

    timer = window.setTimeout(tick, 2_500);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [qaMode, reviewPacket?.id, reviewPacket?.spec._review?.status]);

  /* Build resumes ahead of being asked, for automatic-submission students only.
   *
   * The opt-in is checked HERE as well as in dailyJobs, which is deliberate redundancy rather than
   * an oversight. This loop spends a student's monthly resume quota and makes a model call per
   * job, so the two things guarding it are the one gate that must not be edited away by accident.
   * Everyone else gets a packet when they ask for one. */
  useEffect(() => {
    if (!autoSubmitEnabled) return;
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
  }, [applicationProfile, autoSubmitEnabled, dailyJobs, identity, me, packets, prewarmRetry, qaMode]);

  function dismiss(jobId: string) {
    const next = [...new Set([...dismissed, jobId])];
    setDismissed(next);
    setLastDismissed(jobId);
    window.localStorage.setItem(dailyDismissalKey(), JSON.stringify(next));
    // Undo is a second chance, not furniture. It used to sit there until you skipped something
    // else, so a status message stayed on screen for the rest of the session.
    window.setTimeout(() => setLastDismissed((current) => (current === jobId ? null : current)), 8000);
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
        setReviewError(reason instanceof Error ? reason.message : "We could not send this application. Try again.");
      }
    } finally {
      if (activeReviewJobIdRef.current === submittedJobId) setReviewSubmitting(false);
    }
  }

  const targetLabel = targeting?.titles?.[0] ?? profile?.target_roles?.[0] ?? "Your target roles";
  const trialActive = Boolean(
    me?.trial_ends_at && loadedAt > 0 && new Date(me.trial_ends_at).getTime() > loadedAt,
  );

  if (error && !jobs) return <ErrorNote message={error} />;

  return (
    <div className="space-y-8">
      {/* The header carries the one thing a person comes here to do. "Change what you want" is a
          setting, so it sits as a text link under the subtitle rather than occupying the primary
          button slot. */}
      <section className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-section font-normal leading-[1.15] tracking-[-0.02em] text-ink">Home</h1>
          <p className="mt-1 text-sm text-muted">
            {targetLabel}
            <span aria-hidden="true" className="mx-2 text-faint">·</span>
            <Link href="/dashboard/profile" className="text-muted underline decoration-border underline-offset-4 hover:text-ink">
              Change what you want
            </Link>
          </p>
        </div>
        <Link href="/dashboard/applications?new=1" className="flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-medium text-white transition-opacity hover:opacity-90">
          Add a job link
        </Link>
      </section>

      {me?.is_guest && trialActive && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium text-ink">You have not saved this yet.</p>
            <p className="mt-1 text-xs text-muted">Add your email or you will lose everything on this page.</p>
          </div>
          <Link href="/login?claim=1" className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">
            Save my work
          </Link>
        </Card>
      )}

      {me?.is_guest && !trialActive && me.checkout_available && (
        <Card className="flex flex-wrap items-center justify-between gap-4 bg-brand-soft p-5">
          <div>
            <p className="text-sm font-medium text-ink">Your free week is over.</p>
            <p className="mt-1 text-xs text-muted">Save your work here, then keep going.</p>
          </div>
          <Link
            href="/login?claim=1&next=upgrade"
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white"
          >
            Get Pro
          </Link>
        </Card>
      )}

      {/* Above the per-application detail: the student's own throughput is the thing they open the
          dashboard to check, and it is the number the teardown found behind every product with real
          retention. It renders nothing at all until there is something to report. */}
      <Funnel />

      {/* On day one every one of these counters is 0, and six zeros is a worse first screen than
          no counters at all. They appear once there is something to count. */}
      {/* Each group gates on its OWN total. Sharing one `hasHistory` flag meant a student with two
          emails and no applications was shown a row of application zeros to prove it. */}
      {applicationTotal > 0 && (
      <section aria-labelledby="applications-summary">
        <div className="flex items-center justify-between gap-4">
          <h2 id="applications-summary" className="text-base font-medium text-ink">Applications</h2>
          <Link href="/dashboard/applications" className="text-sm font-medium text-brand hover:text-brand-ink">View all</Link>
        </div>
        {/* Every metric is a filter link. A number you cannot act on is decoration, and the
            old "Action needed" panel below restated these same counts a second and third time. */}
        <dl className="mt-4 grid grid-cols-3 border-y border-border">
          {/* "Applied", not "Sent". The Emails group below also has a "Sent" and the two sat a
              hundred pixels apart meaning two different things. */}
          <SummaryMetric label="Ready" value={applicationSummary.ready} href="/dashboard/applications?state=ready" />
          <SummaryMetric label="Needs you" value={applicationSummary.needsAction} href="/dashboard/applications?state=action" />
          <SummaryMetric label="Sent" value={applicationSummary.submitted} href="/dashboard/applications?state=submitted" />
        </dl>
      </section>
      )}

      {applicationSummary.needsAction > 0 && (
        <DashboardRow
          label={`${applicationSummary.needsAction} application${applicationSummary.needsAction === 1 ? "" : "s"} stopped for you`}
          detail="Finish the missing answers"
          href="/dashboard/applications?state=action"
        />
      )}

      {outreach.length > 0 && (
      <section aria-labelledby="outreach-summary">
        <div className="flex items-center justify-between gap-4">
          <h2 id="outreach-summary" className="text-base font-medium text-ink">Emails</h2>
          <Link href="/dashboard/outreach" className="text-sm font-medium text-brand hover:text-brand-ink">View all</Link>
        </div>
        <dl className="mt-4 grid grid-cols-3 border-y border-border">
          <SummaryMetric label="Drafted" value={outreachSummary.drafted} href="/dashboard/outreach" />
          <SummaryMetric label="Sent" value={outreachSummary.sent} href="/dashboard/outreach" />
          <SummaryMetric label="Replied" value={outreachSummary.replied} href="/dashboard/outreach" />
        </dl>
      </section>
      )}

      <section aria-labelledby="matches-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="matches-heading" className="text-base font-medium text-ink">Your top jobs today</h2>
            <p className="mt-1 text-xs text-muted">Picked to match what you said you want.</p>
          </div>
          <Link href="/dashboard/jobs" className="text-sm font-medium text-brand hover:text-brand-ink">View all</Link>
        </div>

      {jobs === null ? (
        <ShimmerRows rows={4} />
      ) : visibleJobs.length === 0 ? (
        allTodaySubmitted ? (
          <DailyMatchesComplete />
        ) : (
          <EmptyState
            title={dismissed.length ? "Today's queue is clear" : "No matches yet"}
            body={dismissed.length ? "You have looked at all of them. New jobs turn up when we next check the job boards." : "Fill in your profile so Litos can pick out the best jobs from the job boards it watches."}
          >
            <Link href={dismissed.length ? "/dashboard/jobs" : "/dashboard/profile"} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">
              {dismissed.length ? "Browse all jobs" : "Complete profile"}
            </Link>
          </EmptyState>
        )
      ) : (
        <div className="space-y-3">
          {visibleJobs.map((job) => (
            <JobMatchCard key={job.id} job={job} prepared={packets.some((packet) => packetMatchesJob(packet, job))} preparationFailed={prewarmFailures.includes(job.id)} onDismiss={() => dismiss(job.id)} onReview={() => openReview(job)} onRetry={() => retryPreparation(job.id)} />
          ))}
        </div>
      )}
      </section>

      {lastDismissed && (
        <div role="status" className="flex items-center justify-between rounded-inner bg-surface-alt px-4 py-3 text-sm text-muted">
          <span>Skipped for today.</span>
          <button type="button" onClick={undoDismiss} className="font-medium text-ink">Undo</button>
        </div>
      )}

      {/* A quota readout at 0.7% is noise, and it was competing with the header for the page's one
          primary action. It appears only once it can actually change a decision, and then it uses
          the real Meter rather than a sentence. Plan lives in Account, where settings live. */}
      {me && nearLimit(me) && (
        <section aria-labelledby="usage-heading" className="border-t border-border pt-6">
          <h2 id="usage-heading" className="sr-only">Usage</h2>
          <Meter label="Resumes this month" used={me.usage.resumes.used} limit={applicationLimit(me)} />
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

function SummaryMetric({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <div className="border-border first:pl-0 even:border-l sm:border-l sm:first:border-l-0">
      {/* DESIGN.md hard law: color never encodes urgency. A count is a quantity, so it stays ink
          and the label carries the meaning. */}
      <Link href={href} className="block px-3 py-4 transition-colors hover:bg-surface-alt sm:px-5">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="mt-1 font-mono text-heading text-ink">{value}</dd>
      </Link>
    </div>
  );
}

function DashboardRow({ label, detail, href }: { label: string; detail: string; href: string }) {
  return (
    <Link href={href} className="group grid min-h-16 grid-cols-[1fr_auto] items-center gap-4 rounded-card border border-border px-5 py-3">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
      <span aria-hidden="true" className="text-brand transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

/* One pay line, used by every job surface on this page.
 *
 * Returns null when the employer published neither a salary nor a job type, which is the common
 * case: two thirds of the board publishes no pay and Greenhouse states no employment type at all.
 * Nothing is substituted for that silence - no "Competitive", no defaulted "Full-time" chip - so a
 * figure on a card always means an employer published one. Same rule, same formatter as
 * /dashboard/jobs and /browse-jobs. */
function PayLine({ job }: { job: Pick<MonitoredJob, "employment_type"> & PayFacts }) {
  const pay = formatPay(job);
  const type = jobTypeLabel(job.employment_type);
  if (!pay && !type) return null;
  return (
    <p className="mt-1 truncate text-sm text-ink">
      {pay && <span className="font-medium">{pay}</span>}
      {pay && type && <span className="text-faint"> · </span>}
      {type && <span className="text-muted">{type}</span>}
    </p>
  );
}

function JobMatchCard({ job, prepared, preparationFailed, onDismiss, onReview, onRetry }: { job: RankedJob; prepared: boolean; preparationFailed: boolean; onDismiss: () => void; onReview: () => void; onRetry: () => void }) {
  return (
    <Card className="overflow-hidden transition-colors hover:border-ink/30">
      {/* Two signals, not five. The score is the ring (deck 07 says the score is a ring, and the
          Applications page already renders it that way, so Home now matches). One status chip
          carries the only thing that changes. "Remote" is a fact about the job, so it reads as
          text beside the location instead of borrowing the success colour. */}
      <div className="grid gap-5 p-5 sm:grid-cols-[48px_1fr_auto] sm:items-center sm:p-6">
        <div className="hidden sm:block">
          <ScoreRing score={job.match} />
          <p className="mt-1 w-12 text-center text-[11px] text-faint">fit</p>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip label={prepared ? "Ready" : preparationFailed ? "Paused" : "Getting ready"} kind={prepared ? "ready" : "generating"} />
            <span className="text-xs text-faint">Found {formatRelativeDate(job.first_seen_at)}</span>
          </div>
          <h2 className="mt-3 text-lg font-medium text-ink">{job.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {job.company_name}
            {job.location ? ` · ${job.location}` : ""}
            {/* Only when the location line does not already say it, or a remote role reads
                "Remote, US · Remote". */}
            {job.remote && !/remote/i.test(job.location ?? "") ? " · Remote" : ""}
          </p>
          {/* Pay and job type, same formatter and same rule as /dashboard/jobs and the public
              board (lib/pay.ts): shown only where the employer published it, and rendered as
              nothing at all otherwise. This card is where the applicant decides whether the role
              is worth a resume, so leaving the figure to the posting meant deciding without it. */}
          <PayLine job={job} />
          {/* The ranker's reasons used to be dumped raw at 12px with nothing saying what they
              were. One word of framing turns a list of nouns into a sentence. */}
          {job.reasons.length > 0 && (
            <p className="mt-2 text-xs text-faint">Matches your {job.reasons.join(", ")}</p>
          )}
        </div>
        {/* While Litos is still working there is nothing to click, so the primary slot holds a
            plain line of text rather than a greyed-out button that reads as broken. And the
            waiting state says "Getting ready" here too: the chip and the button used to call the
            same moment two different things. */}
        <div className="flex items-center gap-2 sm:justify-end">
          <button type="button" onClick={onDismiss} aria-label={`Skip ${job.title} at ${job.company_name}`} className="min-h-11 px-3 text-sm font-medium text-muted transition-colors hover:text-ink">
            Skip
          </button>
          {prepared || preparationFailed ? (
            <button type="button" onClick={prepared ? onReview : onRetry} aria-label={`${prepared ? "Review" : "Try again for"} ${job.title} at ${job.company_name}`} className="flex min-h-11 items-center rounded-full bg-brand px-5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90">
              {prepared ? "Review" : "Try again"}
            </button>
          ) : (
            <span className="flex min-h-11 items-center px-3 text-sm text-muted">Getting ready</span>
          )}
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

function applicationLimit(me: Me): number {
  return me.usage.resumes.limit;
}

/** Show the quota only once it is close enough to change what someone does today. */
function nearLimit(me: Me): boolean {
  const limit = applicationLimit(me);
  if (limit <= 0) return false;
  return me.usage.resumes.used / limit >= 0.6;
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
  /* One word per state, and no two states that differ only by an ellipsis. "Submitting..." and
     "Submitting" were separate labels for the same thing. */
  const buttonLabel = submitting || inProgress
    ? "Sending..."
    : status === "ready_for_final_approval"
      ? "Send it"
      : submitted
        ? "Sent"
        : "Send it";

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
      {/* Deck 04: borders do the separating, shadows almost never appear. */}
      <aside role="dialog" aria-modal="true" aria-labelledby="review-title" onKeyDown={containFocus} className="dashboard-drawer absolute inset-y-0 right-0 flex w-full max-w-[1120px] flex-col border-l border-border bg-white">
        <header className="flex items-start justify-between gap-6 border-b border-border px-5 py-5 sm:px-8">
          <div className="min-w-0">
            <p className="text-xs text-faint">Check before you send</p>
            <h2 id="review-title" className="mt-1 truncate text-xl font-medium tracking-[-0.02em] text-ink">{job.title}</h2>
            <p className="mt-1 truncate text-sm text-muted">{job.company_name}{job.location ? ` · ${job.location}` : ""}</p>
            {/* The last screen before an application is sent is the one place pay matters most. */}
            <PayLine job={job} />
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-xl text-muted transition-colors hover:border-ink hover:text-ink" aria-label="Close review">×</button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
          <section aria-labelledby="job-description-heading" className="border-b border-border p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h3 id="job-description-heading" className="text-sm font-medium text-ink">Job description</h3>
              {/* Same score, same shape as Home and Applications. It was a blue chip here and a
                  ring everywhere else. */}
              <div className="text-center">
                <ScoreRing score={job.match} />
                <p className="mt-1 w-12 text-[11px] text-faint">fit</p>
              </div>
            </div>
            <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted">{review?.jd_text || job.description}</p>
          </section>

          <section aria-labelledby="resume-heading" className="bg-surface-alt p-5 lg:overflow-y-auto sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h3 id="resume-heading" className="text-sm font-medium text-ink">Your new resume</h3>
              {packet?.created_at && <span className="text-xs text-faint">{formatRelativeDate(packet.created_at)}</span>}
            </div>
            {packet ? <ResumePreview packet={packet} /> : <p className="mt-6 text-sm text-muted">Resume is still preparing.</p>}
          </section>
        </div>

        <footer className="border-t border-border bg-white px-5 py-4 sm:px-8">
          {error && <p role="alert" className="mb-3 text-sm text-warn">{error}</p>}
          {missingAnswers.length > 0 && <p className="mb-3 text-sm text-warn">{missingAnswers.length} answer{missingAnswers.length === 1 ? "" : "s"} needed.</p>}
          {needsAttention && <p className="mb-3 text-sm text-warn">This application needs you.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">If anything is missing, Litos stops and asks you first.</p>
            <div className="flex items-center gap-2">
              {(missingAnswers.length > 0 || needsAttention) && packet && (
                <Link href={`/dashboard/applications?application=${packet.id}`} className="flex min-h-11 items-center px-3 text-sm font-medium text-ink">Finish your answers</Link>
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
    <article className="mt-6 rounded-card border border-border bg-white p-5 sm:p-7">
      <div className="border-b border-ink pb-4">
        <h4 className="text-lg font-medium tracking-[-0.02em] text-ink">{packet.job_context.role || "Tailored resume"}</h4>
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
                  <p className="font-mono text-[11px] text-faint">{entry.date_range}</p>
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
      <h5 className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">{title}</h5>
      {children}
    </section>
  );
}
