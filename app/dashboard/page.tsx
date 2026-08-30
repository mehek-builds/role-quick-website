"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ensureExtensionSession } from "@/lib/extension-bridge";
import {
  api,
  getToken,
  isGuestSession,
  type ApplicationProfile,
  type GeneratedResume,
  type Me,
  type MonitoredJob,
  type OutreachEvent,
  type ParsedProfile,
  type Targeting,
} from "@/lib/api";
import { Card, Chip, EmptyState, Meter, PendingLabel, ScoreRing, ShimmerRows, formatRelativeDate } from "@/components/app/ui";
import { Button, ButtonLink } from "@/components/app/Button";
import { Funnel } from "@/components/app/Funnel";
import { SectionBoundary } from "@/components/app/SectionBoundary";
import { DailyMatchesComplete } from "@/components/app/DailyMatchesComplete";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import { MotionPanel, runDashboardTransition } from "@/components/app/Motion";
/* MatchScore, ResumePaper, contactName, contactLine and stripMetadata were all imported for the
   review drawer and went with it. The dashboard renders no resume and scores no packet against a
   posting now; the card's ScoreRing is a different, already-fetched number. */
import {
  AUTO_SUBMIT_PREPARED_LIMIT,
  MATCH_WEIGHTING_NOTE,
  jobSubmittedOnDay,
  mergeCanonicalApplicationHistory,
  pipelineCounts,
  packetMatchesJob,
  rankJobs,
  statusMatchesApplicationFilter,
  resumeGenerationBody,
  useJobMatchScores,
  visibleMatches,
  type JobMatch,
  type ProfileIdentity,
  type RankedJob,
  type ResumeGenerationInitiation,
} from "@/features/applications";
import { formatPay, jobApplicationActionLabel, jobTypeLabel, type JobApplicationMatch, type PayFacts } from "@/features/jobs";
import { homePrimaryAction, loadDashboardInitialState } from "@/features/dashboard";
import { localDayKey } from "@/lib/local-day";
import { targetingHeadline } from "@/lib/periods";
import { userFacingError } from "@/lib/user-facing-error";
import { waitingApplications } from "@/lib/captcha-queue";
import { WaitingOnYou } from "@/components/app/WaitingOnYou";
import { PlanStatus } from "@/components/billing/PlanStatus";
import { useBilling } from "@/components/billing/BillingProvider";
import { isStructuredUpgradeDenial } from "@/features/billing";
import { completeOperationId, operationIdFor } from "@/lib/operation-id";

/* SubmissionResponse and ACTIVE_SUBMISSION_STATUSES went with the review drawer. The dashboard no
   longer starts or polls a submission, so the statuses it would have watched are not its business
   to name. /dashboard/applications owns that vocabulary. */

const MONTHLY_PRO_APPLICATION_LIMIT = 1_000;

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
  /* Four and five exist so the harness can show the window REFILLING.
     With exactly three fixtures, Home rendered three cards and finishing one just left two: the
     backfill that the whole window is built around had nothing to pull from and could not be seen,
     let alone caught if it broke. A set larger than the window is also the realistic case. */
  {
    id: "qa-job-4",
    company_name: "Ramp",
    title: "Backend Engineer, New Grad",
    location: "New York, NY",
    department: "Engineering",
    employment_type: "Full-time",
    description: "Build payments and card infrastructure with TypeScript, Python, Postgres, and distributed systems at high transaction volume.",
    apply_url: "https://jobs.ashbyhq.com/ramp/qa",
    posting_url: "https://jobs.ashbyhq.com/ramp/qa",
    remote: false,
    posted_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
    ats_name: "ashby",
    salary_min: 150000,
    salary_max: 190000,
    salary_currency: "USD",
    salary_interval: "year",
  },
  {
    id: "qa-job-5",
    company_name: "Notion",
    title: "Product Engineer Intern",
    location: "San Francisco, CA",
    department: "Product Engineering",
    employment_type: "Internship",
    description: "Ship collaborative editing and workspace features with React, TypeScript, and APIs alongside product and design.",
    apply_url: "https://boards.greenhouse.io/notion/qa",
    posting_url: "https://boards.greenhouse.io/notion/qa",
    remote: false,
    posted_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
    ats_name: "greenhouse",
    salary_min: 50,
    salary_max: 60,
    salary_currency: "USD",
    salary_interval: "hour",
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
  const { canUse, openUpgrade } = useBilling();
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
  const focusUndoAfterDismissRef = useRef<string | null>(null);
  const focusSkipAfterUndoRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prewarmFailures, setPrewarmFailures] = useState<string[]>([]);
  /* Jobs whose packet is being built right now, by either path. This is what lets the card say
     "Getting ready" and mean it, instead of saying it about work nobody ever started. */
  const [preparingJobs, setPreparingJobs] = useState<string[]>([]);
  /* Why a build stopped, per job. Kept so "Paused" can say something rather than leaving a
     student to guess whether to wait, fix something, or give up. */
  const [preparationErrors, setPreparationErrors] = useState<Record<string, string>>({});
  const [loadedAt, setLoadedAt] = useState(0);
  const prewarmStarted = useRef(false);
  const resumeOperationIds = useRef(new Map<string, string>());
  const homeMountedRef = useRef(true);

  useLayoutEffect(() => {
    homeMountedRef.current = true;
    return () => {
      homeMountedRef.current = false;
    };
  }, []);

  /* Hand this session to the extension.
   *
   * Here rather than inside the one card that needs it, because the extension being signed out is
   * not a "waiting on you" problem: it breaks every fill on every employer page. Home is the screen
   * everybody lands on, so this is the earliest honest moment. Idempotent, cheap, and a no-op when
   * the extension is not installed. */
  useEffect(() => {
    void ensureExtensionSession({ token: getToken(), guest: isGuestSession() });
  }, []);

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
    loadDashboardInitialState(api, mergeCanonicalApplicationHistory)
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
  const backgroundGenerationAllowed = canUse("hover_generation") === true;
  const tailoringAccess = canUse("ai_resume_tailoring");
  /* Build ahead only for an explicit automatic-submission opt-in on an active paid account.
     Trial and Free accounts keep every generation behind a named click. */
  const dailyJobs = useMemo(
    () => (autoSubmitEnabled && backgroundGenerationAllowed ? rankedJobs.slice(0, AUTO_SUBMIT_PREPARED_LIMIT) : []),
    [autoSubmitEnabled, backgroundGenerationAllowed, rankedJobs],
  );
  // The backend response is today's complete match set, and its size can vary. Home shows only
  // the next three unfinished matches, but completion must account for every match in this set.
  const todayJobs = rankedJobs;
  const todayKey = localDayKey();
  const submittedToday = useMemo(
    () => new Set(todayJobs.filter((job) => jobSubmittedOnDay(job, packets, todayKey)).map((job) => job.id)),
    [packets, todayJobs, todayKey],
  );
  const visibleJobs = useMemo(
    () => visibleMatches(todayJobs, { dismissed, submitted: submittedToday }),
    [dismissed, submittedToday, todayJobs],
  );
  /* The day's matches are done, however they got done.
   *
   * This was `submittedToday.size === todayJobs.length`, so "No matches left for the day" only
   * appeared to a student who SUBMITTED every match. Skip them instead and the queue emptied into
   * a different, weaker screen ("Today's queue is clear"), which is the same fact reported two
   * ways depending on which button got pressed. Finished is finished. The only state that is
   * genuinely different is having had no matches at all, and that is todayJobs.length === 0. */
  const dayQueueFinished = todayJobs.length > 0 && visibleJobs.length === 0;
  const matchQueueKey = jobs === null
    ? "loading"
    : visibleJobs.length > 0
      ? `jobs-${visibleJobs.map((job) => job.id).join(":")}`
      : dayQueueFinished
        ? "complete"
        : "empty";
  useEffect(() => {
    const jobId = focusUndoAfterDismissRef.current;
    if (!jobId || lastDismissed !== jobId) return;
    const frame = window.requestAnimationFrame(() => {
      const undo = document.getElementById("dashboard-skip-undo");
      if (!(undo instanceof HTMLButtonElement)) return;
      undo.focus();
      focusUndoAfterDismissRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lastDismissed]);
  useEffect(() => {
    const jobId = focusSkipAfterUndoRef.current;
    if (!jobId || lastDismissed !== null || dismissed.includes(jobId)) return;
    const frame = window.requestAnimationFrame(() => {
      const restoredSkip = [...document.querySelectorAll<HTMLButtonElement>("[data-dashboard-skip-id]")]
        .find((button) => button.dataset.dashboardSkipId === jobId);
      if (!restoredSkip) return;
      restoredSkip.focus();
      focusSkipAfterUndoRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dismissed, lastDismissed]);
  /* One definition of the number, shared with Jobs. See use-job-match-scores.ts. */
  const matches = useJobMatchScores(jobs === null ? null : visibleJobs, !qaMode);
  /* Applications stopped on a human-verification check, oldest first. Kept out of the summary
     numbers on purpose: this is a different kind of debt from the rest of "Needs you", and folding
     it in would bury a thing that takes seconds to clear inside a count of things that do not. */
  const waitingOnYou = useMemo(() => waitingApplications(packets), [packets]);
  /* THE ONE DERIVATION, shared with the Tracker's ledger, its board and Momentum.
     These three tiles used to be counted inline here, with their own copies of the status lists, so
     nothing else on the dashboard could reuse them and every other surface grew its own arithmetic.
     Six figures for one pipeline was the result; pipeline-counts.ts has the measurement and the
     four causes. The counting rule itself is unchanged - it is now `statusMatchesApplicationFilter`,
     the same predicate that decides which rows each tile's `?state=` link lands on, which is what
     makes "Needs you 88" and the 88 rows the link opens the same 88 applications.

     THIS COUNTS EXACTLY WHAT ?state=action HOLDS, including the rows the waiting-on-you block above
     already names. It used to exclude them, and the reason it gave has since stopped being true:
     "Tracker's action reads 'N stopped for you / Finish the missing answers', which is the wrong
     instruction for a CAPTCHA". That copy is now "Review the stopped applications", which is right
     for a CAPTCHA and for a missing answer alike. What the exclusion cost was a tile reading 20 over
     a link that landed on a list headed "21 of 50", measured on 2026-08-08, and a number you cannot
     reconcile with the screen it takes you to is the defect this whole pass is about. Overlapping
     with the block above is the cheaper error: that block is an emphasis, not a partition. */
  const pipeline = useMemo(() => pipelineCounts(packets), [packets]);
  const applicationSummary = useMemo(
    () => ({ ready: pipeline.ready, submitted: pipeline.sent, needsAction: pipeline.needsYou }),
    [pipeline],
  );
  const primaryAction = homePrimaryAction(applicationSummary);
  /* Each summary block gates on its own total, so a student with emails but no applications is
     not shown a row of application zeros to prove it (and vice versa). */
  const applicationTotal = applicationSummary.ready + applicationSummary.submitted + applicationSummary.needsAction;
  const outreachSummary = useMemo(() => ({
    drafted: outreach.filter((event) => event.status === "drafted").length,
    sent: outreach.filter((event) => ["sent", "replied"].includes(event.status)).length,
    replied: outreach.filter((event) => event.status === "replied").length,
  }), [outreach]);
  /* THE REVIEW DRAWER AND ITS SUBMISSION MACHINERY LIVED HERE. Deleted, not moved: reviewing a
     packet happens on ONE screen now, /dashboard/applications, and the Review button on a card is
     a link to it.

     The drawer was a second review screen that had drifted into a lesser copy of the first. It
     rendered the job description as plain text and the resume beside it, with no requirement
     highlighting, no legend and no gap breakdown, while showing the same MatchScore ring: a
     student was told "1 of 8 requirements" on the screen where they decide whether to send, and
     given no way to see WHICH one. The colour link between the panes, the thing that answers it,
     only ever existed on the Applications pane.

     Everything removed with it already exists there and is exercised on every application:
     submit-request and submission/approve (continueFromResume), the 2.5s submission poll
     (PortalProgress), the questions gate, and the failure and receipt screens.

     Rebuilding any of it here is how the two screens diverged the first time. */

  useEffect(() => {
    if (!autoSubmitEnabled || !backgroundGenerationAllowed) return;
    if (qaMode || prewarmStarted.current || !me || !identity || !applicationProfile || dailyJobs.length === 0) return;
    if (!identity.full_name?.trim() || !identity.resume_email?.trim()) return;
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
          const operationId = operationIdFor(resumeOperationIds.current, job.id);
          const generated = await api<{ application?: GeneratedResume }>("/resume/generate", {
            method: "POST",
            body: JSON.stringify(resumeGenerationBody(completeJob, identity, applicationProfile, "hover_prewarm", operationId)),
          });
          if (generated.application) {
            completeOperationId(resumeOperationIds.current, job.id);
            if (!cancelled) {
              setPackets((current) => [generated.application!, ...current.filter((packet) => packet.id !== generated.application!.id)]);
              setPrewarmFailures((current) => current.filter((jobId) => jobId !== job.id));
            }
          }
        } catch (reason) {
          releasePrewarmLock(job.id);
          const message = reason instanceof Error ? reason.message : "Resume preparation paused.";
          if (!cancelled) {
            setPrewarmFailures((current) => [...new Set([...current, job.id])]);
            setPreparationErrors((current) => ({ ...current, [job.id]: userFacingError(reason) }));
          }
          if (/limit|quota|slow down|temporarily unavailable/i.test(message)) halted = true;
        } finally {
          setPreparingJobs((current) => current.filter((jobId) => jobId !== job.id));
        }
      }
    };

    void Promise.all(Array.from({ length: Math.min(3, missing.length) }, () => worker()));
    return () => { cancelled = true; };
  }, [applicationProfile, autoSubmitEnabled, backgroundGenerationAllowed, dailyJobs, identity, me, packets, qaMode]);

  function dismiss(jobId: string) {
    const next = [...new Set([...dismissed, jobId])];
    focusUndoAfterDismissRef.current = jobId;
    runDashboardTransition(() => {
      setDismissed(next);
      setLastDismissed(jobId);
    });
    window.localStorage.setItem(dailyDismissalKey(), JSON.stringify(next));
    // Undo is a second chance, not furniture. It used to sit there until you skipped something
    // else, so a status message stayed on screen for the rest of the session.
    window.setTimeout(() => {
      runDashboardTransition(() => setLastDismissed((current) => (
        current === jobId && document.activeElement?.id !== "dashboard-skip-undo" ? null : current
      )));
    }, 8000);
  }

  function undoDismiss() {
    if (!lastDismissed) return;
    const restoredJobId = lastDismissed;
    const next = dismissed.filter((id) => id !== restoredJobId);
    focusSkipAfterUndoRef.current = restoredJobId;
    runDashboardTransition(() => {
      setDismissed(next);
      setLastDismissed(null);
    });
    window.localStorage.setItem(dailyDismissalKey(), JSON.stringify(next));
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
  function homeUpgradeFocusTarget(jobId: string, trigger: HTMLElement | null): HTMLElement | null {
    if (trigger?.isConnected) return trigger;
    const jobHeading = [...document.querySelectorAll<HTMLElement>("[data-dashboard-job-focus-id]")]
      .find((candidate) => candidate.dataset.dashboardJobFocusId === jobId && candidate.isConnected)
      ?? null;
    if (jobHeading) return jobHeading;
    const matchesHeading = document.getElementById("matches-heading");
    return matchesHeading instanceof HTMLElement && matchesHeading.isConnected ? matchesHeading : null;
  }

  async function preparePacket(
    jobId: string,
    initiation: ResumeGenerationInitiation,
    upgradeTrigger: HTMLElement | null = null,
  ) {
    const requestIsCurrent = () => homeMountedRef.current;
    if (!qaMode && canUse("ai_resume_tailoring") !== true) {
      if (canUse("ai_resume_tailoring") === false) {
        openUpgrade({
          feature: "ai_resume_tailoring",
          placement: "home_job_card",
          trigger: "tailor_resume",
          manualLabel: "Fill with main resume",
          jobId,
          returnRoute: `/dashboard/applications?job=${encodeURIComponent(jobId)}&checkout_action=tailor`,
          onManual: () => window.location.assign(`/dashboard/applications?job=${jobId}&intent=fill`),
        }, { trigger: homeUpgradeFocusTarget(jobId, upgradeTrigger) });
      }
      return;
    }
    if (!identity?.full_name?.trim() || !applicationProfile) return;
    if (preparingJobs.includes(jobId) || (!qaMode && prewarmLockHeld(jobId))) return;

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

    if (!identity.resume_email?.trim()) {
      setPrewarmFailures((current) => [...new Set([...current, jobId])]);
      setPreparationErrors((current) => ({
        ...current,
        [jobId]: "Add the personal email that should appear on your resume before preparing this application.",
      }));
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
      if (!requestIsCurrent()) return;
      const operationId = operationIdFor(resumeOperationIds.current, jobId);
      const generated = await api<{ application?: GeneratedResume }>("/resume/generate", {
        method: "POST",
        body: JSON.stringify(resumeGenerationBody(completeJob, identity, applicationProfile, initiation, operationId)),
      });
      if (!requestIsCurrent()) return;
      if (generated.application) {
        completeOperationId(resumeOperationIds.current, jobId);
        setPackets((current) => [generated.application!, ...current.filter((packet) => packet.id !== generated.application!.id)]);
      }
    } catch (reason) {
      if (!requestIsCurrent()) return;
      if (isStructuredUpgradeDenial(reason, "ai_resume_tailoring")) {
        openUpgrade({
          feature: "ai_resume_tailoring",
          placement: "home_job_card",
          trigger: "server_entitlement_denial",
          manualLabel: "Fill with main resume",
          jobId,
          returnRoute: `/dashboard/applications?job=${encodeURIComponent(jobId)}&checkout_action=tailor`,
          onManual: () => window.location.assign(`/dashboard/applications?job=${jobId}&intent=fill`),
        }, {
          source: "server_denial",
          trigger: homeUpgradeFocusTarget(jobId, upgradeTrigger),
        });
        return;
      }
      /* The lock comes off so the next attempt is allowed to run at all. Quota and rate limits are
         the backend's call, not a rule duplicated here where it would drift: a refusal arrives as
         a failure, the card says Paused, and "Try again" is a real button.

         The reason is kept. "Paused" on its own is the same dead end in a politer font: it tells a
         student something stopped without telling them whether to wait, fix something, or stop
         trying. userFacingError drops anything that reads like a stack trace or a 5xx and
         substitutes a plain sentence, so a backend fault never reaches the card as jargon. */
      setPrewarmFailures((current) => [...new Set([...current, jobId])]);
      setPreparationErrors((current) => ({ ...current, [jobId]: userFacingError(reason) }));
    } finally {
      releasePrewarmLock(jobId);
      if (requestIsCurrent()) {
        setPreparingJobs((current) => current.filter((id) => id !== jobId));
      }
    }
  }

  /* Where a card's Review goes, or null when there is nothing built to review yet.
     The same packet lookup the card used to decide "prepared", now returning the packet so the
     link can carry its id: the card is Ready exactly when this is non-null. */
  /* One lookup carrying everything the card needs to agree with the rest of the product: the
     link, whether the packet is stopped on the applicant, and the SAME action words the Jobs list
     prints (jobApplicationActionLabel). Measured 2026-08-28: three Home cards chipped READY over
     rows the Jobs page offered "Finish application" for, because the chip and the CTA were derived
     here from packet existence alone. "Stopped" is the tile's own membership
     (statusMatchesApplicationFilter "action") plus awaiting_security_code, which the tile keeps in
     its separate waiting block but which is still the applicant's turn. */
  function packetActionFor(job: RankedJob): { href: string; stopped: boolean; label: string } | null {
    const packet = packets.find((candidate) => packetMatchesJob(candidate, job));
    if (!packet) return null;
    const review = packet.spec._review;
    const status = review?.status ?? "";
    return {
      href: `/dashboard/applications?application=${packet.id}`,
      stopped: status === "awaiting_security_code" || (review != null && statusMatchesApplicationFilter(review, "action")),
      label: jobApplicationActionLabel({
        packetId: packet.id,
        submissionStatus: status,
        stage: "saved",
        sent: false,
        updatedAt: null,
        /* Home holds the whole review, so it can answer "has anything actually happened here"
           from evidence rather than from a status word. canonicalStatus returns needs_attention
           for a canonical row that was only ever recorded, and these cards were offering "Finish
           application" over postings never opened (2026-08-29). A run leaves traces: questions it
           discovered, fields it filled, a reason it stopped, or a run id. None of those means
           nothing has been started, whatever the status says. */
        started: Boolean(
          (review?.questions?.length ?? 0) > 0
          || (review?.filled_fields?.length ?? 0) > 0
          || review?.attention_reason?.trim()
          || review?.submission_run_id?.trim()
          || review?.submitted_at?.trim(),
        ),
      } as JobApplicationMatch),
    };
  }

  /* Retry is the same request, not a nudge to the prewarm loop. It used to clear the lock and bump
     a counter so the effect would re-run, which does nothing at all for the students who never had
     that effect running in the first place. */
  function retryPreparation(jobId: string, upgradeTrigger: HTMLElement | null) {
    releasePrewarmLock(jobId);
    void preparePacket(jobId, "explicit_click", upgradeTrigger);
  }

  /* Saved targeting only, and only the parts the "Change what you want" link below can edit. This
     used to fall through to profile.target_roles when no titles were saved, so the header claimed
     one thing while the feed underneath ranked by the saved categories. See targetingHeadline for
     why target_roles is not a rung even though it is user-editable on /dashboard/resume. */
  const targetLabel = targetingHeadline(targeting?.titles, targeting?.categories) ?? "Your target roles";
  const trialActive = Boolean(
    me?.trial_ends_at && loadedAt > 0 && new Date(me.trial_ends_at).getTime() > loadedAt,
  );

  if (error && !jobs) {
    return (
      <EmptyState
        visual="error"
        headingLevel="h1"
        title="Your dashboard did not load."
        body="Nothing you saved was lost. Try loading your dashboard again."
      >
        <Button type="button" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </EmptyState>
    );
  }

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
            <Link href="/dashboard/settings#job-search" className="inline-flex min-h-6 items-center text-muted underline decoration-border underline-offset-4 hover:text-ink">
              Change what you want
            </Link>
          </p>
        </div>
        <ButtonLink href={primaryAction.href}>{primaryAction.label}</ButtonLink>
      </section>

      {me?.is_guest && trialActive && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium text-ink">You have not saved this yet.</p>
            <p className="mt-1 text-xs text-muted">Add your email or you will lose everything on this page.</p>
          </div>
          <Link href="/login?claim=1" className="rounded-full bg-action px-5 py-2.5 text-sm font-medium text-action-ink">
            Save my work
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
      <WaitingOnYou items={waitingOnYou} />
      <section aria-label="At a glance">
        <div className="grid divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-rest empty:hidden lg:auto-cols-fr lg:grid-flow-col lg:divide-x lg:divide-y-0">
          {/* One boundary PER COLUMN, not one around the band. A single boundary here would still
              be an improvement on the route boundary and would still be the reported bug: Momentum
              throwing would take Tracker and Emails with it, and Tracker is the column that carries
              "N stopped for you", the only thing on Home that tells a student they have work
              waiting. The three columns share a grid and nothing else, so they get three. */}
          <SectionBoundary band="momentum" title="Momentum">
            {/* The same count the Tracker tile prints, from the same packets, so the two figures on
                this row can never disagree. It is what turns "N prepared / 0 sent" from two true
                numbers with an unexplained gap into a sentence with somewhere to go. */}
            <Funnel sent={pipeline.sent} stopped={{ count: applicationSummary.needsAction, href: "/dashboard/applications?state=action" }} />
          </SectionBoundary>
          {applicationTotal > 0 && (
            <SectionBoundary band="tracker-summary" title="Applications">
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
                label: applicationSummary.needsAction === 1
                  ? "1 application needs you"
                  : `${applicationSummary.needsAction} applications need you`,
                detail: "Continue where Litos stopped",
                href: "/dashboard/applications?state=action",
              } : undefined}
            />
            </SectionBoundary>
          )}
          {outreach.length > 0 && (
            <SectionBoundary band="outreach-summary" title="Outreach">
            <OverviewColumn
              id="outreach-summary"
              title="Outreach"
              href="/dashboard/outreach"
              tone="emails"
              metrics={[
                { label: "Drafted", value: outreachSummary.drafted, href: "/dashboard/outreach" },
                { label: "Sent", value: outreachSummary.sent, href: "/dashboard/outreach" },
                { label: "Replied", value: outreachSummary.replied, href: "/dashboard/outreach" },
              ]}
            />
            </SectionBoundary>
          )}
        </div>
      </section>

      <PlanStatus compact />

      <section aria-labelledby="matches-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="matches-heading" tabIndex={-1} className="text-base font-medium text-ink outline-none">Your top jobs today</h2>
          </div>
          <Link href="/dashboard/jobs" className="inline-flex min-h-6 items-center text-sm font-medium text-brand-ink underline-offset-2 hover:underline">View all</Link>
        </div>

      <MotionPanel key={matchQueueKey} name="dashboard-home-matches">
      {jobs === null ? (
        <ShimmerRows rows={4} />
      ) : visibleJobs.length === 0 ? (
        dayQueueFinished ? (
          <DailyMatchesComplete />
        ) : (
          /* Reached only when the day never had a match to begin with. Sending someone to "Browse
             all jobs" here would be sending them to another empty list. */
          <EmptyState
            visual="profile"
            title="No matches yet"
            body="Fill in your profile so Litos can pick out the best jobs from the job boards it watches."
          >
            <Link href="/dashboard/profile" className="rounded-full bg-action px-5 py-2.5 text-sm font-medium text-action-ink">
              Complete profile
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
              match={matches[job.id]}
              /* `?application=<packet id>`, not `?job=<job id>`. Both are handled over there, but
                 the job form treats "no packet found" as a request to BUILD one, and it resolves
                 the packet out of its own 50-row history window. A packet that has aged out of
                 that window would silently spend a resume from the student's quota and leave a
                 duplicate behind. Addressing the packet directly cannot generate anything: the
                 worst case is that nothing is selected. Both screens read the same history
                 endpoint, so a packet the card can see is one that screen can find. */
              packetAction={packetActionFor(job)}
              preparing={preparingJobs.includes(job.id)}
              preparationFailed={prewarmFailures.includes(job.id)}
              /* Generating needs a name and an application profile. Without them the request is a
                 guaranteed failure, so the card sends the student to the one page that fixes it
                 rather than offering a button that cannot work. */
              canPrepare={Boolean(identity?.full_name?.trim() && applicationProfile)}
              preparationError={preparationErrors[job.id]}
              tailoringAccess={qaMode ? true : tailoringAccess}
              hoverGenerationEnabled={canUse("hover_generation") === true}
              onDismiss={() => dismiss(job.id)}
              onPrepare={(upgradeTrigger) => void preparePacket(job.id, "explicit_click", upgradeTrigger)}
              onHoverPrepare={() => void preparePacket(job.id, "hover_prewarm")}
              onRetry={(upgradeTrigger) => retryPreparation(job.id, upgradeTrigger)}
            />
          ))}
        </div>
      )}
      </MotionPanel>
      </section>

      {lastDismissed && (
        <MotionPanel key={lastDismissed} name="dashboard-home-skip-status">
          <div
            role="status"
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              runDashboardTransition(() => setLastDismissed((current) => current === lastDismissed ? null : current));
            }}
            className="flex items-center justify-between rounded-inner bg-surface-alt px-4 py-3 text-sm text-muted"
          >
            <span>Skipped for today.</span>
            <button id="dashboard-skip-undo" type="button" onClick={undoDismiss} className="font-medium text-ink">Undo</button>
          </div>
        </MotionPanel>
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
        <Link href={href} className={`inline-flex min-h-6 items-center text-small font-medium ${linkClass}`}>View all</Link>
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
/* `reviewHref` replaces the `prepared` boolean AND the `onReview` callback, which is more than a
   plumbing change: the card is "Ready" precisely when there is a packet to review, and the link to
   that packet is built from the packet's own id. One value now decides the chip and the control, so
   a card cannot say "Ready" while offering nothing to open, which is what a separate boolean and a
   separate handler make possible. Null means there is nothing to review yet. */
function JobMatchCard({
  job,
  match,
  packetAction,
  preparing,
  preparationFailed,
  preparationError,
  tailoringAccess,
  hoverGenerationEnabled,
  canPrepare,
  onDismiss,
  onPrepare,
  onHoverPrepare,
  onRetry,
}: {
  job: RankedJob;
  match: JobMatch | null | undefined;
  /** The existing packet's link, stopped-on-applicant fact, and Jobs-list action words, or null
      when nothing is built yet. One object so the chip, the Review link and the primary CTA can
      never disagree about the same packet. */
  packetAction: { href: string; stopped: boolean; label: string } | null;
  preparing: boolean;
  preparationFailed: boolean;
  preparationError?: string;
  tailoringAccess: boolean | null;
  hoverGenerationEnabled: boolean;
  canPrepare: boolean;
  onDismiss: () => void;
  onPrepare: (upgradeTrigger: HTMLButtonElement) => void;
  onHoverPrepare: () => void;
  onRetry: (upgradeTrigger: HTMLButtonElement) => void;
}) {
  const status = packetAction ? (packetAction.stopped ? "needs-you" : "ready") : preparing ? "preparing" : preparationFailed ? "failed" : "idle";
  return (
    <Card
      className="h-full overflow-hidden shadow-rest transition-[border-color,box-shadow] hover:border-ink/30 hover:shadow-raised"
      onMouseEnter={() => {
        if (hoverGenerationEnabled && canPrepare && status === "idle") onHoverPrepare();
      }}
    >
      {/* Lead with the employer, then put the score in the corner where it can be compared across
          cards without hiding who the role is for. The logo uses the same domain and fallback
          rules as the full Jobs list, so one company cannot show two different identities. */}
      <div className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CompanyLogo company={job.company_name} boardUrl={job.career_url} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  label={status === "ready" ? "Ready" : status === "needs-you" ? "Needs you" : status === "preparing" ? "Getting ready" : status === "failed" ? "Paused" : "Not started"}
                  kind={status === "ready" ? "ready" : status === "needs-you" ? "warn" : "generating"}
                />
                <span className="text-small text-muted">Found {formatRelativeDate(job.first_seen_at)}</span>
              </div>
              <p className="mt-1 truncate text-small text-muted">{job.company_name}</p>
            </div>
          </div>
          {/* No ring while the score is still being fetched, and none at all for a posting the
              backend declines to score. `undefined` is "not yet", `null` is "nothing honest to
              say", and both print nothing: a ring drawn empty says "your resume covers 0 of what
              this job asks for" when the truth is that we never got an answer. */}
          {match && (
            <div className="justify-self-end text-center">
              {/* The weighting clause is APPENDED, never folded in: the text before it is pinned
                  literally by tests/preference-score-copy.regression-1.test.mjs.
                  MATCH_WEIGHTING_NOTE carries why a count sits beside a score it does not divide
                  out to. */}
              <ScoreRing
                score={match.score}
                metricLabel={`of what this job asks for is on your resume (${match.matched} of the ${match.total} requirements Litos counted). ${MATCH_WEIGHTING_NOTE}`}
              />
              <p className="mt-1 w-12 text-center text-[11px] text-muted">match</p>
            </div>
          )}
        </div>

        <h2
          tabIndex={-1}
          data-dashboard-job-focus-id={job.id}
          className="mt-4 text-heading font-medium text-ink outline-none"
        >
          {job.title}
        </h2>
        <p className="mt-1 truncate text-small text-muted">
          {job.location ?? (job.remote ? "Remote" : "Location not listed")}
          {job.remote && !/remote/i.test(job.location ?? "") ? " · Remote" : ""}
        </p>
        <PayLine job={job} />
        {/* The preference-fit line ("You asked for ...") used to sit here. It repeated the saved
            search on every card, so it was removed. The ring above stays the only thing on this
            card that speaks to fit, and it speaks only for resume-to-JD coverage. */}

        {/* Paused says what stopped. A status word with no reason behind it leaves a student
            deciding between waiting, fixing something and giving up, with nothing to decide on. */}
        {status === "failed" && preparationError && (
          <p className="mt-3 line-clamp-2 text-label text-warn">{preparationError}</p>
        )}

        {/* Only one state here has nothing to click, and it is the one where a request really is
            in flight. The chip and this slot use one name for each state, so a card never says
            two things at once. */}
        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4">
          <button type="button" data-dashboard-skip-id={job.id} onClick={onDismiss} aria-label={`Skip ${job.title} at ${job.company_name}`} className="min-h-11 px-3 text-sm font-medium text-muted transition-colors hover:text-ink">
            Skip
          </button>
          {status === "preparing" ? (
            <span className="flex min-h-11 items-center px-3 text-sm text-muted">
              <PendingLabel>Getting ready</PendingLabel>
            </span>
          ) : packetAction ? null : tailoringAccess === null ? (
            <span className="flex min-h-11 items-center px-3 text-sm text-muted">
              <PendingLabel>Checking plan</PendingLabel>
            </span>
          ) : !canPrepare ? (
            /* No name or no application profile yet. The packet cannot be built until that exists,
               so the card points at the fix instead of offering a button that would only fail. */
            <Link href="/dashboard/profile" className="flex min-h-11 items-center rounded-full border border-control-border bg-surface px-4 text-center text-sm font-medium text-ink transition-colors hover:border-ink">
              Complete profile
            </Link>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                const upgradeTrigger = event.currentTarget;
                if (status === "failed") onRetry(upgradeTrigger);
                else onPrepare(upgradeTrigger);
              }}
              aria-label={`${status === "failed" ? "Try tailoring again for" : "Tailor a resume for"} ${job.title} at ${job.company_name}`}
              className="flex min-h-11 items-center rounded-full border border-brand bg-surface px-4 text-center text-sm font-medium text-brand-ink transition-colors hover:bg-brand-soft"
            >
              {status === "failed" ? "Try tailoring again" : "Tailor resume"}
            </button>
          )}
          {packetAction ? (
            /* One packet, one action. The destination owns the full review and next human step, so
               a second Review control here only makes the student choose between two links to the
               same application. */
            <Link href={`${packetAction.href}&intent=apply`} aria-label={`${packetAction.label}: ${job.title} at ${job.company_name}`} className="flex min-h-11 items-center rounded-full border border-brand bg-surface px-5 text-center text-sm font-medium text-brand-ink transition-colors hover:bg-brand-soft">{packetAction.label}</Link>
          ) : (
            <Link href={`/dashboard/applications?job=${job.id}&intent=fill`} aria-label={`Fill an application for ${job.title} at ${job.company_name}`} className="flex min-h-11 items-center rounded-full border border-brand bg-surface px-5 text-center text-sm font-medium text-brand-ink transition-colors hover:bg-brand-soft">Fill application</Link>
          )}
        </div>
      </div>
    </Card>
  );
}

/* Keyed on the LOCAL day, so "Skipped for today" lasts until the student's own midnight.
 *
 * No legacy read of the old UTC-dated key. Where the two disagree (the hours between local and UTC
 * midnight) a student can see one day's skip list reset once, and that is the whole cost: the list
 * is same-day only, it holds nothing but "not this one", and re-skipping is one click on a card
 * that is already on screen. A fallback read would have to merge two keys, decide which one wins
 * when both exist, and then be deleted later anyway. That is more moving parts, permanently, to
 * avoid one cheap click, once. Take the reset. */
function dailyDismissalKey(): string {
  return `litos-dismissed-${localDayKey()}`;
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
  return `litos-prewarm-${localDayKey()}-${jobId}`;
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
function claimPrewarmLock(jobId: string): void {
  window.localStorage.setItem(prewarmLockKey(jobId), String(Date.now()));
}

function prewarmLockHeld(jobId: string): boolean {
  const startedAt = Number(window.localStorage.getItem(prewarmLockKey(jobId)));
  if (Number.isFinite(startedAt) && Date.now() - startedAt < 10 * 60 * 1000) return true;
  window.localStorage.removeItem(prewarmLockKey(jobId));
  return false;
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

/* ReviewDrawer lived here: a modal that reviewed a packet on the dashboard. It is gone, and the
   Review button on a card now links to /dashboard/applications, which is the only screen that
   reviews a packet.

   It was the second review screen, and it had quietly become the worse one. It showed the
   MatchScore ring ("1 of 8 requirements we counted") over a plain-text job description, with no
   requirement highlighting, no legend and no gap breakdown: the number without the explanation,
   on the last screen before a send. The colour link that answers "where does my resume actually
   say this?" lives in RequirementText and was only ever wired up on the Applications pane.

   That pane cannot simply be lifted into a drawer, and this is the reason the duplication existed:
   it is an editor, wired to spec editing, cover-letter generation, bank variants, undo and the
   portal run. Two live editors of one packet on two routes is a worse problem than the one being
   solved. So the drawer is deleted rather than upgraded, and there is one review screen.

   The drawer's resume pane has its own version of this story, and it is why the drawer is gone
   rather than patched. It began as a private ResumePreview here: a second renderer of the same
   document whose header was the posting's role and company, in the slot where the applicant's
   name belongs. That was fixed by pointing it at the shared ResumePaper. Days later the same
   screen turned out to be missing the requirement highlighting too. Two defects, one cause, and
   deduplicating a component at a time was only ever going to find them one at a time.

   The dashboard renders no resume now. */
