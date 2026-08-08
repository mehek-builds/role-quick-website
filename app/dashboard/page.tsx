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
  type OutreachEvent,
  type ParsedProfile,
  type Targeting,
} from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, Meter, PendingLabel, ScoreRing, ShimmerRows, formatRelativeDate } from "@/components/app/ui";
import { Funnel } from "@/components/app/Funnel";
import { SectionBoundary } from "@/components/app/SectionBoundary";
import { DailyMatchesComplete } from "@/components/app/DailyMatchesComplete";
import { CompanyLogo } from "@/components/app/CompanyLogo";
/* MatchScore, ResumePaper, contactName, contactLine and stripMetadata were all imported for the
   review drawer and went with it. The dashboard renders no resume and scores no packet against a
   posting now; the card's ScoreRing is a different, already-fetched number. */
import {
  AUTO_SUBMIT_PREPARED_LIMIT,
  MATCH_WEIGHTING_NOTE,
  jobSubmittedOnDay,
  packetMatchesJob,
  rankJobs,
  reviewCanBeSent,
  resumeGenerationBody,
  useJobMatchScores,
  visibleMatches,
  type JobMatch,
  type ProfileIdentity,
  type RankedJob,
} from "@/features/applications";
import { formatPay, jobTypeLabel, type PayFacts } from "@/features/jobs";
import { loadDashboardInitialState } from "@/features/dashboard";
import { localDayKey } from "@/lib/local-day";
import { targetingHeadline } from "@/lib/periods";
import { userFacingError } from "@/lib/user-facing-error";
import { waitingApplications } from "@/lib/captcha-queue";
import { WaitingOnYou } from "@/components/app/WaitingOnYou";

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
  const [prewarmFailures, setPrewarmFailures] = useState<string[]>([]);
  /* Jobs whose packet is being built right now, by either path. This is what lets the card say
     "Getting ready" and mean it, instead of saying it about work nobody ever started. */
  const [preparingJobs, setPreparingJobs] = useState<string[]>([]);
  /* Why a build stopped, per job. Kept so "Paused" can say something rather than leaving a
     student to guess whether to wait, fix something, or give up. */
  const [preparationErrors, setPreparationErrors] = useState<Record<string, string>>({});
  const [loadedAt, setLoadedAt] = useState(0);
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
  /* One definition of the number, shared with Jobs. See use-job-match-scores.ts. */
  const matches = useJobMatchScores(jobs === null ? null : visibleJobs, !qaMode);
  /* Applications stopped on a human-verification check, oldest first. Kept out of the summary
     numbers on purpose: this is a different kind of debt from the rest of "Needs you", and folding
     it in would bury a thing that takes seconds to clear inside a count of things that do not. */
  const waitingOnYou = useMemo(() => waitingApplications(packets), [packets]);
  const applicationSummary = useMemo(() => {
    const submitted = packets.filter((packet) => packet.spec._review?.status === "submitted").length;
    /* THIS COUNTS EXACTLY WHAT ?state=action HOLDS, including the rows the waiting-on-you block
       above already names.
       It used to exclude them, and the reason it gave has since stopped being true: "Tracker's
       action reads 'N stopped for you / Finish the missing answers', which is the wrong instruction
       for a CAPTCHA". That copy is now "Review the stopped applications", which is right for a
       CAPTCHA and for a missing answer alike. What the exclusion cost was a tile reading 20 over a
       link that landed on a list headed "21 of 50", measured on 2026-08-08, and a number you cannot
       reconcile with the screen it takes you to is the defect this whole pass is about. Overlapping
       with the block above is the cheaper error: that block is an emphasis, not a partition. */
    const needsAction = packets.filter((packet) => (
      ["needs_attention", "ready_for_final_approval", "failed"].includes(packet.spec._review?.status ?? "")
      || (
        ["resume_ready", "questions_ready", "ready_to_submit"].includes(packet.spec._review?.status ?? "")
        && packet.spec._review?.portal_supported === false
      )
    )).length;
    const ready = packets.filter((packet) => reviewCanBeSent(packet.spec._review)).length;
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

  /* Where a card's Review goes, or null when there is nothing built to review yet.
     The same packet lookup the card used to decide "prepared", now returning the packet so the
     link can carry its id: the card is Ready exactly when this is non-null. */
  function reviewHrefFor(job: RankedJob): string | null {
    const packet = packets.find((candidate) => packetMatchesJob(candidate, job));
    return packet ? `/dashboard/applications?application=${packet.id}` : null;
  }

  /* Retry is the same request, not a nudge to the prewarm loop. It used to clear the lock and bump
     a counter so the effect would re-run, which does nothing at all for the students who never had
     that effect running in the first place. */
  function retryPreparation(jobId: string) {
    releasePrewarmLock(jobId);
    void preparePacket(jobId);
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
            <Funnel stopped={{ count: applicationSummary.needsAction, href: "/dashboard/applications?state=action" }} />
          </SectionBoundary>
          {applicationTotal > 0 && (
            <SectionBoundary band="tracker-summary" title="Tracker">
            <OverviewColumn
              id="applications-summary"
              title="Tracker"
              href="/dashboard/applications"
              tone="applications"
              metrics={[
                { label: "Ready", value: applicationSummary.ready, href: "/dashboard/applications?state=ready" },
                { label: "Needs you", value: applicationSummary.needsAction, href: "/dashboard/applications?state=action" },
                { label: "Sent", value: applicationSummary.submitted, href: "/dashboard/applications?state=submitted" },
              ]}
              action={applicationSummary.needsAction > 0 ? {
                label: `${applicationSummary.needsAction} stopped for you`,
                detail: "Review the stopped applications",
                href: "/dashboard/applications?state=action",
              } : undefined}
            />
            </SectionBoundary>
          )}
          {outreach.length > 0 && (
            <SectionBoundary band="outreach-summary" title="Emails">
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
            </SectionBoundary>
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
        dayQueueFinished ? (
          <DailyMatchesComplete />
        ) : (
          /* Reached only when the day never had a match to begin with. Sending someone to "Browse
             all jobs" here would be sending them to another empty list. */
          <EmptyState
            title="No matches yet"
            body="Fill in your profile so Litos can pick out the best jobs from the job boards it watches."
          >
            <Link href="/dashboard/profile" className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">
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
              reviewHref={reviewHrefFor(job)}
              preparing={preparingJobs.includes(job.id)}
              preparationFailed={prewarmFailures.includes(job.id)}
              /* Generating needs a name and an application profile. Without them the request is a
                 guaranteed failure, so the card sends the student to the one page that fixes it
                 rather than offering a button that cannot work. */
              canPrepare={Boolean(identity?.full_name?.trim() && applicationProfile)}
              preparationError={preparationErrors[job.id]}
              onDismiss={() => dismiss(job.id)}
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
/* `reviewHref` replaces the `prepared` boolean AND the `onReview` callback, which is more than a
   plumbing change: the card is "Ready" precisely when there is a packet to review, and the link to
   that packet is built from the packet's own id. One value now decides the chip and the control, so
   a card cannot say "Ready" while offering nothing to open, which is what a separate boolean and a
   separate handler make possible. Null means there is nothing to review yet. */
function JobMatchCard({
  job,
  match,
  reviewHref,
  preparing,
  preparationFailed,
  preparationError,
  canPrepare,
  onDismiss,
  onPrepare,
  onRetry,
}: {
  job: RankedJob;
  match: JobMatch | null | undefined;
  reviewHref: string | null;
  preparing: boolean;
  preparationFailed: boolean;
  preparationError?: string;
  canPrepare: boolean;
  onDismiss: () => void;
  onPrepare: () => void;
  onRetry: () => void;
}) {
  const status = reviewHref ? "ready" : preparing ? "preparing" : preparationFailed ? "failed" : "idle";
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
              <p className="mt-1 w-12 text-center text-[11px] text-faint">match</p>
            </div>
          )}
        </div>

        <h2 className="mt-4 text-heading font-medium text-ink">{job.title}</h2>
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
        <div className="mt-auto flex items-center justify-end gap-2 pt-4">
          <button type="button" onClick={onDismiss} aria-label={`Skip ${job.title} at ${job.company_name}`} className="min-h-11 px-3 text-sm font-medium text-muted transition-colors hover:text-ink">
            Skip
          </button>
          {status === "preparing" ? (
            <span className="flex min-h-11 items-center px-3 text-sm text-muted">
              <PendingLabel>Getting ready</PendingLabel>
            </span>
          ) : reviewHref ? (
            /* A LINK, not a button that opened a drawer here. Reviewing a packet is one screen,
               /dashboard/applications, and this is the way in. It navigates rather than overlaying
               so there is exactly one place the requirement highlighting, the legend, the gap
               breakdown and the send control have to be kept correct. */
            <Link href={reviewHref} aria-label={`Review ${job.title} at ${job.company_name}`} className="flex min-h-11 items-center rounded-full bg-brand px-5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90">
              Review
            </Link>
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
