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
import { Card, Chip, EmptyState, ErrorNote, Meter, PendingLabel, ScoreRing, ShimmerRows, formatRelativeDate } from "@/components/app/ui";
import { Funnel } from "@/components/app/Funnel";
import { DailyMatchesComplete } from "@/components/app/DailyMatchesComplete";
import { CompanyLogo } from "@/components/app/CompanyLogo";
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
import { targetingHeadline } from "@/lib/periods";
import { userFacingError } from "@/lib/user-facing-error";

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
  locations: ["San Francisco", "New York"],
  remote_only: false,
  primary_period: "Summer 2027",
  backup_period: null,
};

const QA_PROFILE: Partial<ParsedProfile> = {
  skills: ["React", "TypeScript", "APIs", "Product", "Data"],
  target_roles: ["Software Engineer", "Product Engineer"],
};

/* Only the first QA job carries a packet, and that asymmetry is the point.
 *
 * Every QA job used to have one, so the harness could only ever draw a row of "Ready" cards. The
 * state that broke, a matched job with no packet and no way to start one, was the one state this
 * fixture could not render, which is a large part of why it shipped and sat there for five days.
 * Jobs two and three now stand in for the rest of the matrix: "Not started" with a live Prepare
 * button, which is what most students actually see. */
function qaPacketFor(job: MonitoredJob): GeneratedResume {
  return {
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
  };
}

const QA_PACKETS: GeneratedResume[] = QA_JOBS.slice(0, 1).map(qaPacketFor);

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
  /* No parsed-profile state here any more: the header was its only reader, and it now names saved
     targeting instead. The /profile fetch behind it is not dead - loadDashboardInitialState still
     derives identity.full_name from the same response, and the prewarm below needs that. */
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
  /* Jobs whose packet is being built right now, by either path. This is what lets the card say
     "Getting ready" and mean it, instead of saying it about work nobody ever started. */
  const [preparingJobs, setPreparingJobs] = useState<string[]>([]);
  /* Why a build stopped, per job. Kept so "Paused" can say something rather than leaving a
     student to guess whether to wait, fix something, or give up. */
  const [preparationErrors, setPreparationErrors] = useState<Record<string, string>>({});
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

  const rankedJobs = useMemo(() => rankJobs(jobs ?? []), [jobs]);
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
        if (prewarmLockHeld(job.id)) continue;
        claimPrewarmLock(job.id);
        setPreparingJobs((current) => [...new Set([...current, job.id])]);
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
          releasePrewarmLock(job.id);
          const message = reason instanceof Error ? reason.message : "Resume preparation paused.";
          if (!cancelled) {
            setPrewarmFailures((current) => [...new Set([...current, job.id])]);
            setPreparationErrors((current) => ({ ...current, [job.id]: userFacingError(reason) }));
          }
          if (/limit|quota|slow down|temporarily unavailable/i.test(message)) {
            halted = true;
          }
        } finally {
          /* Not guarded on `cancelled`. An unmount must still clear the in-flight mark, or a job
             stays "Getting ready" for the rest of the session with no request behind it, which is
             the exact lie this whole change exists to remove. */
          setPreparingJobs((current) => current.filter((jobId) => jobId !== job.id));
        }
      }
    };

    void Promise.all(Array.from({ length: Math.min(3, missing.length) }, () => worker()));
    return () => {
      cancelled = true;
    };
    /* preparingJobs is written here but never read here, so it stays out of the deps: putting a
       value in the list that the effect only ever sets makes the effect retrigger itself. */
  }, [applicationProfile, autoSubmitEnabled, dailyJobs, identity, me, packets, qaMode]);

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

  /* Build one packet, because this student asked for this job.
   *
   * The prewarm loop above only runs for students who turned automatic submission on. Everyone
   * else was promised a packet "when they ask for one", but Home never gave them a way to ask:
   * the card's action slot rendered inert text, so a matched job sat at "Getting ready" forever
   * with nothing able to move it. This is the asking.
   *
   * It takes the same two steps as a prewarm worker (fetch the complete job, then generate), and
   * it writes the same day-scoped lock first, so the prewarm loop skips any job already being
   * built here and a student on automatic submission cannot spend the quota twice for one job. */
  async function preparePacket(jobId: string) {
    if (!identity?.full_name?.trim() || !applicationProfile) return;
    if (preparingJobs.includes(jobId)) return;

    /* A QA render has no session, and api() answers a 401 by clearing what session there is and
       sending the browser to /login. Without this the harness's own Prepare button would bounce
       it off the screen it exists to show, which is the trap the layout already documents. The
       fixture transition is real enough to demo: Not started, then Getting ready, then Ready. */
    if (qaMode) {
      const job = QA_JOBS.find((candidate) => candidate.id === jobId);
      if (!job) return;
      setPreparingJobs((current) => [...new Set([...current, jobId])]);
      window.setTimeout(() => {
        setPackets((current) => [qaPacketFor(job), ...current]);
        setPreparingJobs((current) => current.filter((id) => id !== jobId));
      }, 1200);
      return;
    }

    setPreparingJobs((current) => [...new Set([...current, jobId])]);
    setPrewarmFailures((current) => current.filter((id) => id !== jobId));
    /* Last attempt's reason goes with the last attempt. Leaving it up under a fresh "Getting
       ready" would explain a failure that is no longer the one happening. */
    setPreparationErrors((current) => {
      if (!(jobId in current)) return current;
      const next = { ...current };
      delete next[jobId];
      return next;
    });
    claimPrewarmLock(jobId);

    try {
      const { job: completeJob } = await api<{ job: MonitoredJob }>(`/jobs/${jobId}`);
      const generated = await api<{ application?: GeneratedResume }>("/resume/generate", {
        method: "POST",
        body: JSON.stringify(resumeGenerationBody(completeJob, identity, applicationProfile, getStoredEmail())),
      });
      if (generated.application) {
        setPackets((current) => [generated.application!, ...current.filter((packet) => packet.id !== generated.application!.id)]);
      }
    } catch (reason) {
      /* The lock comes off so the next attempt is allowed to run at all. Quota and rate limits are
         the backend's call, not a rule duplicated here where it would drift: a refusal arrives as
         a failure, the card says Paused, and "Try again" is a real button.

         The reason is kept. "Paused" on its own is the same dead end in a politer font: it tells a
         student something stopped without telling them whether to wait, fix something, or stop
         trying. userFacingError drops anything that reads like a stack trace or a 5xx and
         substitutes a plain sentence, so a backend fault never reaches the card as jargon. */
      releasePrewarmLock(jobId);
      setPrewarmFailures((current) => [...new Set([...current, jobId])]);
      setPreparationErrors((current) => ({ ...current, [jobId]: userFacingError(reason) }));
    } finally {
      setPreparingJobs((current) => current.filter((id) => id !== jobId));
    }
  }

  /* Retry is the same request, not a nudge to the prewarm loop. It used to clear the lock and bump
     a counter so the effect would re-run, which does nothing at all for the students who never had
     that effect running in the first place. */
  function retryPreparation(jobId: string) {
    releasePrewarmLock(jobId);
    void preparePacket(jobId);
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

  /* Saved targeting only, and only the parts the "Change what you want" link below can edit. This
     used to fall through to profile.target_roles when no titles were saved, so the header claimed
     one thing while the feed underneath ranked by the saved categories. See targetingHeadline for
     why target_roles is not a rung even though it is user-editable on /dashboard/resume. */
  const targetLabel = targetingHeadline(targeting?.titles, targeting?.categories) ?? "Your target roles";
  const trialActive = Boolean(
    me?.trial_ends_at && loadedAt > 0 && new Date(me.trial_ends_at).getTime() > loadedAt,
  );

  if (error && !jobs) return <ErrorNote message={error} />;

  return (
    /* One rhythm down the page. The desktop step-up this replaces existed to help the stretched
       panels reach the fold; with the panels sized by their content there is nothing to pad out,
       and two different section gaps depending on width was itself part of why the page read as
       assembled rather than composed. */
    <div className="space-y-6">
      {/* The header carries the one thing a person comes here to do. "Change what you want" is a
          setting, so it sits as a text link under the subtitle rather than occupying the primary
          button slot. */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-section font-normal leading-[1.15] tracking-[-0.02em] text-ink">Home</h1>
          <p className="mt-1 text-sm text-muted">
            {targetLabel}
            <span aria-hidden="true" className="mx-2 text-faint">·</span>
            <Link href="/dashboard/settings#job-search" className="text-muted underline decoration-border underline-offset-4 hover:text-ink">
              Change what you want
            </Link>
          </p>
        </div>
        <Link href="/dashboard/applications?new=1" className="flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-medium text-white transition-opacity hover:opacity-90">
          Add job
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

      {/* One instrument, read three ways.
          This was three tinted cards, each holding its own white sub-tiles, so a single number sat
          three containers deep and the row read as nine objects instead of one. The band is now a
          single card divided by hairlines: the tints are gone, the sub-tiles are gone, and
          hierarchy comes from type and spacing. Pillar colour survives where it still carries
          meaning, on each column's own link, rather than as a wash behind the figures.

          grid-flow-col with auto-cols-fr, not grid-cols-3: Momentum hides itself on a brand new
          account and the other two are conditional, so the row has to divide evenly across however
          many columns actually render. empty:hidden keeps the card border from drawing around
          nothing when none of them do. */}
      <section aria-label="At a glance">
        <div className="grid divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-rest empty:hidden lg:auto-cols-fr lg:grid-flow-col lg:divide-x lg:divide-y-0">
          <Funnel />
          {applicationTotal > 0 && (
            <OverviewColumn
              id="applications-summary"
              title="Applications"
              href="/dashboard/applications"
              tone="applications"
              metrics={[
                { label: "Ready", value: applicationSummary.ready, href: "/dashboard/applications?state=ready" },
                { label: "Needs you", value: applicationSummary.needsAction, href: "/dashboard/applications?state=action" },
                { label: "Sent", value: applicationSummary.submitted, href: "/dashboard/applications?state=submitted" },
              ]}
              action={applicationSummary.needsAction > 0 ? {
                label: `${applicationSummary.needsAction} stopped for you`,
                detail: "Finish the missing answers",
                href: "/dashboard/applications?state=action",
              } : undefined}
            />
          )}
          {outreach.length > 0 && (
            <OverviewColumn
              id="outreach-summary"
              title="Emails"
              href="/dashboard/outreach"
              tone="emails"
              metrics={[
                { label: "Drafted", value: outreachSummary.drafted, href: "/dashboard/outreach" },
                { label: "Sent", value: outreachSummary.sent, href: "/dashboard/outreach" },
                { label: "Replied", value: outreachSummary.replied, href: "/dashboard/outreach" },
              ]}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="matches-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="matches-heading" className="text-base font-medium text-ink">Your top jobs today</h2>
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {/* Content sets the height here, at every width. The viewport-derived minimum this
              replaces stretched each card to whatever the window had left over, which opened a
              hole between the pay line and the Skip/Review pair and pushed the two apart exactly
              when they need to be read together. A single screen is worth having, but it has to
              come from the content being compact, not from the containers being inflated. */}
          {visibleJobs.map((job) => (
            <JobMatchCard
              key={job.id}
              job={job}
              prepared={packets.some((packet) => packetMatchesJob(packet, job))}
              preparing={preparingJobs.includes(job.id)}
              preparationFailed={prewarmFailures.includes(job.id)}
              /* Generating needs a name and an application profile. Without them the request is a
                 guaranteed failure, so the card sends the student to the one page that fixes it
                 rather than offering a button that cannot work. */
              canPrepare={Boolean(identity?.full_name?.trim() && applicationProfile)}
              preparationError={preparationErrors[job.id]}
              onDismiss={() => dismiss(job.id)}
              onReview={() => openReview(job)}
              onPrepare={() => void preparePacket(job.id)}
              onRetry={() => retryPreparation(job.id)}
            />
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

type OverviewMetric = { label: string; value: number; href: string };

/* A column of the shared overview card.
 *
 * The tint and the white sub-tiles it used to carry are both gone. A tinted panel holding lighter
 * panels put every figure three containers deep, and with a different wash behind each pillar
 * nothing in the row could recede: colour was labelling the category rather than pointing at what
 * needed attention. The pillar colour is kept on the one element where it still means something,
 * the link out to that pillar's own page.
 *
 * Figures print in the same order and at the same scale as Momentum's, so the row scans as one
 * line of numbers rather than as three separate readouts that happen to be adjacent. */
function OverviewColumn({
  id,
  title,
  href,
  tone,
  metrics,
  action,
}: {
  id: string;
  title: string;
  href: string;
  tone: "applications" | "emails";
  metrics: OverviewMetric[];
  action?: { label: string; detail: string; href: string };
}) {
  const linkClass = tone === "applications" ? "text-brand-ink" : "text-coral-ink";

  return (
    <section aria-labelledby={id} className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-base font-medium text-ink">{title}</h2>
        <Link href={href} className={`text-small font-medium ${linkClass}`}>View all</Link>
      </div>
      {/* Plain markup, matching Momentum's Stat. The dl this replaces held anchors as direct
          children, which a description list may not have, and it printed the term above the
          description so the figures sat on a different baseline to Momentum's. */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {metrics.map((metric) => (
          /* A zero prints quieter. At full ink a bucket holding nothing was typeset exactly like a
             bucket holding three, so the one figure worth acting on had to be hunted for among
             its empty neighbours. The zero still shows, because the label is the useful part and
             dropping it would break the row, but it stops competing.

             text-muted, not text-faint: faint is #a3a19a, which is 2.6:1 on this surface and fails
             WCAG AA for 20px regular text. Muted is 5.4:1 and still drops well back from ink. A
             number a person cannot read is not de-emphasis, it is a number that is not there. */
          <Link key={metric.label} href={metric.href} className="group">
            <span className={`block font-mono text-heading leading-none ${metric.value === 0 ? "text-muted" : "text-ink"}`}>{metric.value}</span>
            <span className="mt-1 line-clamp-2 block text-label text-muted underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-border">{metric.label}</span>
          </Link>
        ))}
      </div>
      {action && (
        <Link href={action.href} className="mt-4 flex items-center justify-between gap-3 rounded-inner bg-warn-soft px-3 py-2 text-warn">
          <span className="min-w-0">
            <span className="block truncate text-small font-medium">{action.label}</span>
            <span className="block truncate text-label">{action.detail}</span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </section>
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

/* A matched job, in one of four states.
 *
 * There used to be three, and one of them was a trap. A card with no packet rendered the words
 * "Getting ready" in an inert span, on the assumption that something was always building it.
 * That stopped being true when prewarming narrowed to automatic-submission students: for everyone
 * else nothing was building it, nothing ever would, and the card had no control that could start
 * anything. "Not started" and "Getting ready" are now two different states, and only one of them
 * claims work is happening. */
function JobMatchCard({
  job,
  prepared,
  preparing,
  preparationFailed,
  preparationError,
  canPrepare,
  onDismiss,
  onReview,
  onPrepare,
  onRetry,
}: {
  job: RankedJob;
  prepared: boolean;
  preparing: boolean;
  preparationFailed: boolean;
  preparationError?: string;
  canPrepare: boolean;
  onDismiss: () => void;
  onReview: () => void;
  onPrepare: () => void;
  onRetry: () => void;
}) {
  const status = prepared ? "ready" : preparing ? "preparing" : preparationFailed ? "failed" : "idle";
  return (
    <Card className="h-full overflow-hidden shadow-rest transition-[border-color,box-shadow] hover:border-ink/30 hover:shadow-raised">
      {/* Lead with the employer, then put the score in the corner where it can be compared across
          cards without hiding who the role is for. The logo uses the same domain and fallback
          rules as the full Jobs list, so one company cannot show two different identities. */}
      <div className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CompanyLogo company={job.company_name} careerUrl={job.career_url} companyDomain={job.company_domain} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  label={status === "ready" ? "Ready" : status === "preparing" ? "Getting ready" : status === "failed" ? "Paused" : "Not started"}
                  kind={status === "ready" ? "ready" : "generating"}
                />
                <span className="text-small text-faint">Found {formatRelativeDate(job.first_seen_at)}</span>
              </div>
              <p className="mt-1 truncate text-small text-muted">{job.company_name}</p>
            </div>
          </div>
          {/* No ring at all for an account with no saved preferences. `match` is null there rather
              than 0, because a ring drawn empty says "this job fits you 0 out of 100" when the
              truth is that nothing has been asked of it yet. */}
          {job.match !== null && (
            <div className="justify-self-end text-center">
              <ScoreRing score={job.match} metricLabel="preference fit for this job" />
              <p className="mt-1 w-12 text-center text-[11px] text-faint">fit</p>
            </div>
          )}
        </div>

        <h2 className="mt-4 text-heading font-medium text-ink">{job.title}</h2>
        <p className="mt-1 truncate text-small text-muted">
          {job.location ?? (job.remote ? "Remote" : "Location not listed")}
          {job.remote && !/remote/i.test(job.location ?? "") ? " · Remote" : ""}
        </p>
        <PayLine job={job} />
        {job.reasons.length > 0 && (
          <p className="mt-2 truncate text-small text-faint">Matches your {job.reasons.join(", ")}</p>
        )}

        {/* Paused says what stopped. A status word with no reason behind it leaves a student
            deciding between waiting, fixing something and giving up, with nothing to decide on. */}
        {status === "failed" && preparationError && (
          <p className="mt-3 line-clamp-2 text-label text-warn">{preparationError}</p>
        )}

        {/* Only one state here has nothing to click, and it is the one where a request really is
            in flight. The chip and this slot use one name for each state, so a card never says
            two things at once. */}
        <div className="mt-auto flex items-center justify-end gap-2 pt-4">
          <button type="button" onClick={onDismiss} aria-label={`Skip ${job.title} at ${job.company_name}`} className="min-h-11 px-3 text-sm font-medium text-muted transition-colors hover:text-ink">
            Skip
          </button>
          {status === "preparing" ? (
            <span className="flex min-h-11 items-center px-3 text-sm text-muted">
              <PendingLabel>Getting ready</PendingLabel>
            </span>
          ) : status === "ready" ? (
            <button type="button" onClick={onReview} aria-label={`Review ${job.title} at ${job.company_name}`} className="flex min-h-11 items-center rounded-full bg-brand px-5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90">
              Review
            </button>
          ) : !canPrepare ? (
            /* No name or no application profile yet. The packet cannot be built until that exists,
               so the card points at the fix instead of offering a button that would only fail. */
            <Link href="/dashboard/profile" className="flex min-h-11 items-center rounded-full bg-brand px-5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90">
              Complete profile
            </Link>
          ) : (
            <button type="button" onClick={status === "failed" ? onRetry : onPrepare} aria-label={`${status === "failed" ? "Try again for" : "Prepare an application for"} ${job.title} at ${job.company_name}`} className="flex min-h-11 items-center rounded-full bg-brand px-5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90">
              {status === "failed" ? "Try again" : "Prepare"}
            </button>
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

/* The one lock protocol, shared by both paths that can build a packet.
 *
 * A student on automatic submission has the prewarm loop running while the Prepare button is also
 * live, so the two have to agree on what "already being built" means or one job costs two model
 * calls and two entries against the monthly quota. Keeping claim, check and release as three
 * functions next to the key they share is what stops that agreement drifting.
 *
 * Module scope, not the component body: these read the clock, and the render-purity rule cannot
 * tell an event handler from something it might call while rendering. */
const PREWARM_LOCK_MS = 10 * 60 * 1000;

function claimPrewarmLock(jobId: string): void {
  window.localStorage.setItem(prewarmLockKey(jobId), String(Date.now()));
}

function prewarmLockHeld(jobId: string): boolean {
  const claimedAt = Number(window.localStorage.getItem(prewarmLockKey(jobId)));
  return Boolean(claimedAt) && Date.now() - claimedAt < PREWARM_LOCK_MS;
}

function releasePrewarmLock(jobId: string): void {
  window.localStorage.removeItem(prewarmLockKey(jobId));
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
              {job.match !== null && (
                <div className="text-center">
                  <ScoreRing score={job.match} metricLabel="preference fit for this job" />
                  <p className="mt-1 w-12 text-[11px] text-faint">fit</p>
                </div>
              )}
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
          {error && <p role="alert" className="mb-3 text-sm text-warn">{userFacingError(error)}</p>}
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
