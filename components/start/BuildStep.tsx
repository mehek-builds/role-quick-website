"use client";

/* 04 WATCH IT BUILD: the screen the product stops being described on and starts being watched.
 *
 * One screen, two phases, no route change: it names the posting, runs the stages, and hands off.
 *
 * IT NO LONGER DRAWS THE DOCUMENT (Mehek, 2026-09-01). This screen used to show the posting and
 * the finished resume in two panes, and the review screen showed the same two panes again after
 * the questions, the second time with "it cannot be unsent" attached. Two screens deep in a
 * ten-step flow, drawing the same thing twice made the second one read as a repeat the student
 * had already dealt with rather than as the decision it is. The panes now live on the review
 * screen alone, which is the screen that asks for the irreversible yes, and this one is what it
 * always actually was: the progress of a real build.
 *
 * THE SEQUENCE LIVES IN lib/onboarding-build.ts, not here. That is deliberate: generating a
 * tailored resume costs money and consumes one of the trial's five, so the orchestration has to be
 * provable without running it. This file owns the layout, the orbs, and the two phases.
 *
 * The rule that governs everything below: no stage is marked done before its own call resolves.
 * A stage list that runs the same length whether the build took two seconds or forty is a fake
 * progress bar wearing better clothes, and this is the one screen where a student will believe
 * anything they are shown.
 */

import { useEffect, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { ErrorNote } from "@/components/app/ui";
import { api, ApiError, getJob, getPostingQuestions, isGuestSession, type MonitoredJob, type ResumeSpec } from "@/lib/api";
import {
  fetchJdMatch,
  prescriptMetadataBlockers,
  prescriptReadNothing,
  resumeSpecText,
  type JdMatchResponse,
  type ProfileIdentity,
} from "@/features/applications";
import { isStructuredUpgradeDenial } from "@/features/billing";
import {
  BuildPreconditionError,
  buildActionLabel,
  initialStages,
  runOnboardingBuild,
  type BuildResult,
  type BuildStage,
} from "@/lib/onboarding-build";
import { track } from "@/lib/analytics";
import { LaterLink, PrimaryButton, StartShell, usePreferredLocations } from "./ui";

/* THE RAIL POSITION FOR THIS SCREEN IS "match", NOT "build", and that is not a rename.
 *
 * `build` stopped being a rail step when the two phases were folded into one entry
 * (features/onboarding/domain/rail.ts: "One screen, two phases: the posting, then it building").
 * STEPS has no `build` key, so StepRail's findIndex returned -1, `known` stayed false, and the rail
 * rendered its loading shimmer with aria-busy for the WHOLE screen - on the longest wait in
 * onboarding, around a minute, where a student most wants to know where they are. It was not a
 * flash before state arrived; there was no key for it to ever resolve to.
 *
 * All three shells here take the same position, including the Litos+ and failed-build screens,
 * because a student on either of those is still standing on the match step of the flow. */
import { narrowPostingLocation } from "@/lib/posting-location";
import type { OnboardingMatch } from "@/lib/onboarding-match";

/* The employer-form pre-scan is a flaky live read (a managed-browser pass that times out, loads
   slow, or drops a run). It is a PREVIEW, never a gate, so onboarding retries it a bounded few
   times - re-reading genuinely often succeeds and the server caches a good one - and then proceeds
   regardless. Small counts on purpose: each attempt is a real scan and there is an hourly server
   cap, so this recovers the common transient miss without hammering the provider. */
const POSTING_SCAN_RETRIES = 2;
const POSTING_SCAN_RETRY_DELAY_MS = 700;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* What this screen learned that the screens after it need: the full posting (the match feed's row
   may not carry the description), the requirement match both panes were marked with, and the
   applicant's name for the paper header. Passed up rather than re-fetched: the review screen is the
   only screen that draws the posting and the paper, and it should not have to re-ask the network
   for what this screen already has in hand. */
export type BuildContext = {
  posting: MonitoredJob;
  jdMatch: JdMatchResponse | null;
  applicantName: string | null;
};

/* CONSECUTIVE QUALITY HOLDS THIS SITTING, across remounts.
 *
 * "Show me a different one" unmounts this component and a fresh posting mounts a new one, so a
 * counter in state forgets exactly the pattern it exists to notice. Module scope survives the
 * remount and resets on a full page load, the same shape onboarding-flow.ts already uses for its
 * session deferrals.
 *
 * WHY IT EXISTS. The quality hold is per-posting - the backend audits the resume AGAINST this
 * posting's text - so one hold rightly says "try another posting". But a resume with no bullet
 * that answers ANY of the board's postings holds every time, and the screen sent the student
 * round that loop with the same sentence each pass: measured live, three holds in a row, each
 * blaming the posting while the error above it named the resume. After the second consecutive
 * hold the pattern points at the resume, so the screen says that and offers the way to fix it.
 * Reset on any successful build, because one success breaks the pattern honestly. */
let consecutiveQualityHolds = 0;

export function BuildStep({
  match,
  onQuestions,
  onPickAnother,
  onReviseResume,
  onLater,
}: {
  match: OnboardingMatch;
  /** Built. The questions screen takes the result from here. */
  onQuestions: (result: BuildResult, context: BuildContext) => void;
  /** Back to the match screen to choose a different posting. The way out of a build that cannot
   *  succeed for THIS posting no matter how many times it is retried. */
  onPickAnother: () => void;
  /** Opens the resume revisit. Offered only once consecutive quality holds say the resume is the
   *  pattern, and optional so the QA harness renders unchanged. */
  onReviseResume?: () => void;
  onLater: () => void;
}) {
  const [stages, setStages] = useState<BuildStage[]>(() => initialStages());
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState<{ message: string; fixable: boolean; field: "full_name" | "resume_email" | "education" | null; entitlement: boolean; qualityHold: boolean } | null>(null);
  /* Bumped by "Read the form again". The scan stage runs before anything is spent, so re-running
     the whole build after a scan failure costs nothing until the scan actually passes. */
  const [attempt, setAttempt] = useState(0);
  const [posting, setPosting] = useState<MonitoredJob>(match.job);
  /* THE APPLICANT'S NAME, held here because ResumeSpec has no name field.
   *
   * That absence has produced the same bug four times: a resume surface renders `spec.school` in
   * the top slot and the student reads their university where their name belongs. The build
   * already loads identity as a precondition of generating at all, so the name is in hand - this
   * keeps it rather than throwing it away and rendering a headless document. */
  const [applicantName, setApplicantName] = useState<string | null>(null);
  /* The requirement match both panes are coloured with: one request, one meaning per colour, the
     same index driving the posting's marks and the paper's (via RequirementProvider). Null while
     the build runs and after a failed fetch, in which case both panes render unmarked prose, which
     is the pre-ISSUE-047 state rather than a new failure mode. */
  const [jdMatch, setJdMatch] = useState<JdMatchResponse | null>(null);
  /* The offices this student asked for, out of the ones the employer listed. See
     lib/posting-location.ts: an unread preference list narrows nothing, so the line below falls
     back to the employer's full location field. */
  const preferredLocations = usePreferredLocations();

  useEffect(() => {
    let cancelled = false;
    runOnboardingBuild(
      {
        loadPosting: async (jobId) => {
          const full = await getJob(jobId);
          if (!cancelled) setPosting(full);
          return { description: full.description, title: full.title, company: full.company_name };
        },
        loadIdentity: async () => {
          const identity = await api<ProfileIdentity>("/profile");
          if (!cancelled) setApplicantName(identity.full_name ?? null);
          return { fullName: identity.full_name ?? null, resumeEmail: identity.resume_email ?? null };
        },
        generateResume: async (input) => {
          const generated = await api<{ canonical_application_id?: string; application?: { id?: string; spec?: ResumeSpec } }>("/resume/generate", {
          method: "POST",
          body: JSON.stringify({
            initiation: "explicit_click",
            company: input.company,
            role: input.role,
            jd_text: input.jdText,
            job_id: input.jobId,
            contact: { full_name: input.fullName, email: input.resumeEmail },
          }),
          });
          return {
            /* THE LEGACY generated_resumes ID, NOT canonical_application_id, and getting this wrong
               is a 404 on the send. POST /applications/:id/submit-request resolves its row through
               ownedResume, which reads generated_resumes alone; the canonical application is a
               parallel row that carries this one as legacy_generated_resume_id. Handing the
               canonical id to the review screen made every onboarding send answer "Application not
               found" (measured live, 2026-09-01). */
            applicationId: generated.application?.id ?? null,
            resumeSpec: generated.application?.spec ?? null,
          };
        },
        loadQuestions: async (jobId) => {
          /* THE PRE-SCAN IS A PREVIEW, NEVER A GATE (Mehek, 2026-09-01). Reading the employer's form
             ahead of time lets onboarding pre-answer questions, but it is a flaky live read and it
             used to DEAD-END this screen ("could not read the form") whenever it came up empty - a
             student hit that across many different jobs in a row. Onboarding must never dead-end here.

             So: retry a bounded few times (re-reading often succeeds and a good scan is cached), and
             if it STILL reads nothing - or the request itself fails - PROCEED with an empty ask. An
             empty ask skips the questions screen straight to Review and send, where the form is
             opened and read fresh anyway: a form we could not PREVIEW is not a form we cannot SUBMIT,
             and the send is the authority on what it asks. A scan that read SOME questions but could
             not verify every option is untouched - prescriptReadNothing is false, so it still
             proceeds-and-asks in the follow-up boxes. */
          let prescript: Awaited<ReturnType<typeof getPostingQuestions>> | null = null;
          for (let attempt = 0; attempt <= POSTING_SCAN_RETRIES; attempt++) {
            try {
              prescript = await getPostingQuestions(jobId);
            } catch {
              prescript = null;
            }
            if (prescript && !prescriptReadNothing(prescript)) break;
            if (attempt < POSTING_SCAN_RETRIES) await delay(POSTING_SCAN_RETRY_DELAY_MS);
          }
          if (!prescript || prescriptReadNothing(prescript)) {
            /* Deferred entirely to send. No questions surfaced now: outstandingQuestions becomes 0,
               which is the case that skips the questions screen straight to Review and send. The live
               form is read there. */
            return { total: 0, alreadyAnswered: 0, ask: [], deferredFields: 0 };
          }
          return {
            total: prescript.question_count,
            alreadyAnswered: prescript.already_answered,
            ask: prescript.ask,
            /* The employer fields whose exact options Litos could not read on this pass. Not
               blocking: they are confirmed against the live form at send time. Surfaced on the
               questions screen so the count is honest rather than hidden. */
            deferredFields: prescriptMetadataBlockers(prescript).length,
          };
        },
      },
      match.job.id,
      (next) => { if (!cancelled) setStages(next); },
    )
      .then((built) => {
        if (cancelled) return;
        consecutiveQualityHolds = 0;
        setResult(built);
        track("onboarding_build_completed", {
          outstanding: built.outstandingQuestions,
          total: built.totalQuestions,
        });
      })
      .catch((reason) => {
        if (cancelled) return;
        /* A precondition is a one-line fix the student can make, so it is presented as one rather
           than as a failed build. Everything else is a genuine failure and offers a retry. */
        const fixable = reason instanceof BuildPreconditionError;
        /* A 402 IS NOT A VERDICT ON THE POSTING, and presenting it as one sent a student in a loop.
           Measured live 2026-09-01: an account whose one setup build was already spent got the
           generic failure screen, whose copy blamed the fit ("not a fit Litos can write honestly")
           and whose only forward control re-ran the same entitlement check against a different
           posting, which refuses identically for every posting there is. Only the structured
           denial shape takes this branch, for the same reason the dashboard checks it: an
           unrelated 402 must not become an upsell. */
        const entitlement = isStructuredUpgradeDenial(reason, "ai_resume_tailoring");
        /* A PROFILE GAP IS NOT A POSTING VERDICT, the sibling of the 402 rule above and read the
           same structured way. The engine cannot write a resume with no school or degree on file,
           and that gap follows the student to every posting - so routes/resume.ts sends a DISTINCT
           code, "resume_profile_incomplete" (never "resume_quality_hold"), naming the field to fix.
           It is discovered server-side, unlike the name/email preconditions, because only the
           server holds the profile; but the recovery is the same one-place fix, so it takes the
           precondition branch rather than the "try another posting" one. `field` defaults to
           education, the only field the backend sends today, if a newer server omits it. */
        const profileIncompleteField = reason instanceof ApiError
          && typeof reason.data === "object" && reason.data !== null
          && (reason.data as { code?: string }).code === "resume_profile_incomplete"
          ? ((reason.data as { field?: "education" }).field ?? "education")
          : null;
        /* The 422's own name for itself, read from the structured body rather than matched on the
           sentence: routes/resume.ts sends code "resume_quality_hold" with the message, and the
           message is allowed to be rewritten. A profile gap is deliberately NOT one of these: it
           must not increment the consecutive-hold counter, whose whole subject is a resume that is
           thin against these postings. */
        const qualityHold = reason instanceof ApiError
          && typeof reason.data === "object" && reason.data !== null
          && (reason.data as { code?: string }).code === "resume_quality_hold";
        consecutiveQualityHolds = qualityHold ? consecutiveQualityHolds + 1 : 0;
        const accountFixable = fixable || profileIncompleteField !== null;
        setError({
          message: reason instanceof Error ? reason.message : "Litos could not build this application.",
          fixable: accountFixable,
          qualityHold,
          /* WHICH field, not just that there was one. A missing name, a missing email and a missing
             education are fixed in different places, and for a guest the email is not fixable in
             Account at all. */
          field: reason instanceof BuildPreconditionError ? reason.field : profileIncompleteField,
          entitlement,
        });
        track("onboarding_build_failed", { fixable: accountFixable, entitlement });
      });
    return () => { cancelled = true; };
    /* `attempt` re-runs the whole sequence for "Read the form again". Safe by construction: every
       stage that can refuse runs before the one that spends, so a retry only ever pays when it is
       actually going to reach the questions screen. */
  }, [match.job.id, attempt]);

  /* Score the built resume against the posting, once both exist. Separate from the build effect
     because it is decoration on top of a finished build, not a stage of it: a failure here must
     never mark the build failed or block the way forward. */
  useEffect(() => {
    const spec = result?.resumeSpec;
    const jdText = posting.description ?? "";
    if (!spec || !jdText.trim()) return;
    let cancelled = false;
    const resumeText = resumeSpecText(spec);
    if (!resumeText.trim()) return;
    fetchJdMatch(jdText, resumeText, {
      company: posting.company_name,
      role: posting.title,
      job_id: posting.id,
    })
      /* Validated at the boundary, because both this screen and the review screen build the
         requirement index from these two arrays in render: a response without them (an older
         backend, a proxy error page) must degrade to unmarked panes, never to a render crash. */
      .then((next) => {
        if (cancelled) return;
        setJdMatch(Array.isArray(next?.matched) && Array.isArray(next?.missing) ? next : null);
      })
      .catch(() => { if (!cancelled) setJdMatch(null); });
    return () => { cancelled = true; };
  }, [result, posting.description, posting.company_name, posting.title, posting.id]);

  /* The one precondition a guest cannot satisfy from Account, because a guest has no account email.
     Read at render rather than stored: the student may have claimed one in another tab. */
  const guestNeedsEmail = error?.fixable === true && error.field === "resume_email" && isGuestSession();

  /* A missing school or degree is fixed on the resume step, not in Account, and it follows the
     student to every posting - so this screen must send them back to add it, never on to another
     posting that will fail on the same gap. The backend proves it with the resume_profile_incomplete
     code (see the catch above); this is where that becomes a way forward instead of a dead end. */
  const needsEducation = error?.fixable === true && error.field === "education";

  /* THE PAYWALL SAYS IT IS A PAYWALL. The generic failure screen below blames the posting and
     offers another one, and both halves are false here: the refusal is about the account, and the
     next posting refuses identically. Setup's own argument (see the free build first, card at step
     10) is intact for a fresh account, which never sees this; it appears only when the free build
     is no longer available, and the honest forward control is the plans page, where the ask
     already lives. Nothing is lost by leaving: the flow resumes from this same step. */
  if (error?.entitlement) {
    return (
      <StartShell step="match" title="This one needs Litos+.">
        <p className="text-sm leading-6 text-muted">
          The free build that comes with setup is not available on this account anymore, so
          tailoring another application is a Litos+ action. Nothing was sent and nothing was lost:
          your resume, your roles, and everything else you set up are saved.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <PrimaryButton onClick={() => { track("onboarding_build_upgrade_opened", {}); window.location.assign("/pricing"); }}>
            See Litos+ plans
          </PrimaryButton>
          <LaterLink onClick={onLater} />
        </div>
      </StartShell>
    );
  }

  /* The employer form pre-scan no longer has a failure screen of its own: it is a preview, not a
     gate, so a scan that reads nothing PROCEEDS straight to Review and send (see loadQuestions)
     rather than dead-ending here. What remains below is the genuine build failure - a resume the
     engine would not write - which is a different sentence with a different recovery. */

  if (error) {
    /* A FAILED BUILD USED TO BE A DEAD END, and it is step 3 of 10.
     *
     * The only control here was "Finish later", which ends setup. Measured on production
     * 2026-08-20 across ten builds: a frontend student was offered a high-frequency trading firm's
     * SWE internship by the board, and the resume engine refused it with `resume_quality_hold` -
     * "no selected bullet shares supported domain evidence with a primary ask". That refusal is
     * RIGHT: the alternative is leading a resume with an experience that does not answer the
     * posting, which is the fabrication this product exists not to do.
     *
     * But it left the student stranded three screens in, on a posting THEY did not choose - the
     * board offered it. The fix for that failure is another posting, so the screen offers one.
     * The grant is not spent either: the free build is released on any response from 400 up, so
     * the next posting builds for free exactly as this one would have.
     *
     * A precondition failure is different and keeps its own wording: a missing resume email is
     * fixed in Account and follows the student to every posting, so offering a different one would
     * send them round a loop that fails identically. */
    return (
      <StartShell step="match" title="That build did not finish.">
        <ErrorNote message={error.message} />
        <p className="mt-4 text-sm leading-6 text-muted">
          {error.fixable
            ? needsEducation
              /* A profile gap, not a posting verdict. A resume needs a school and a degree, they
                 are not on this profile yet, and no other posting changes that - so the fix is to
                 add them, said as the one-line fix it is rather than as a verdict on this job. */
              ? "A resume needs your school and degree, and they are not on your profile yet. Add them and Litos will build this one again. The posting is saved."
              : guestNeedsEmail
                /* A GUEST HAS NO ACCOUNT EMAIL TO GO AND FIND, which is what made this a dead end.
                 *
                   `resume_email` is seeded from the login email at upload, so a signed-in student
                   never sees this screen - measured on prod 2026-08-19, 7 of 7 have one. A guest has
                   no email anywhere, so "add it in Account" sent them to a page with nothing to add,
                   three screens into setup. Claiming one is the actual fix, it is the same route the
                   plan screen already uses for a guest who cannot check out, and an application needs
                   a contact address anyway: the employer has to be able to reply to it. */
                ? "An employer needs somewhere to reply. Add your email and Litos will build this one again, with the posting saved."
                : "Add it in Account and Litos will build this one again. The posting is saved."
            : error.qualityHold && consecutiveQualityHolds >= 2 && onReviseResume
              /* The pattern, said out loud. One hold is a fact about one posting; this many in a
                 row is a fact about the resume, and repeating the posting sentence a third time
                 would send the student round the same loop it already failed to fix twice. */
              ? "Nothing was sent and nothing was lost. This has now happened on more than one posting, which usually means the resume itself is thin where these jobs ask for evidence. You can change it, or try one more posting."
              : "Nothing was sent and nothing was lost. Your resume and roles are saved, and this one is not a fit Litos can write honestly. Try another posting."}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          {!error.fixable && error.qualityHold && consecutiveQualityHolds >= 2 && onReviseResume && (
            <PrimaryButton onClick={onReviseResume}>Let me change my resume</PrimaryButton>
          )}
          {!error.fixable && (
            <PrimaryButton onClick={onPickAnother}>Show me a different one</PrimaryButton>
          )}
          {needsEducation && onReviseResume && (
            /* Back to the resume step, where school and degree come from - not on to another
               posting, which is the loop this whole branch exists to break. */
            <PrimaryButton onClick={() => { track("onboarding_build_add_education", {}); onReviseResume(); }}>
              Add my education
            </PrimaryButton>
          )}
          {guestNeedsEmail && (
            <PrimaryButton onClick={() => { track("onboarding_build_claim_required", {}); window.location.assign("/login?intent=claim&next=/start"); }}>
              Add my email
            </PrimaryButton>
          )}
          <LaterLink onClick={onLater} />
        </div>
      </StartShell>
    );
  }

  const building = result === null;

  return (
    <StartShell
      step="match"
      title={building ? "Building your application." : "Your application is built."}
    >
      {/* ONE LINE, NOT A PANE. The posting and the paper are drawn exactly once in this flow, on
          the review screen, and this screen no longer draws either: showing them here and again
          after the questions asked the student to approve the same document twice, the second time
          with a warning attached, which read as a repeat rather than a decision (Mehek,
          2026-09-01). What this screen owes them is which posting is being worked on and what is
          actually happening, so it names the posting and shows the stages doing it. */}
      <p className="font-mono text-[11px] leading-relaxed text-muted">
        {posting.title}
        <br />
        {[posting.company_name, narrowPostingLocation(posting.location, preferredLocations)].filter(Boolean).join(" \u00b7 ")}
      </p>

      {!building && (
        /* The promise that makes one document screen enough: nothing is sent before they have
           read it. The button below carries them to the questions when there are any, and to the
           document itself when there are not. */
        <p className="mt-4 text-[13px] leading-6 text-muted">
          You will see every line of it, and what it is going to, before anything is sent.
        </p>
      )}

      {/* The stage list. Each row is a real call, and its orb runs only while that call is in
          flight. Five of the six shipped orb states map onto real work here; the three used are
          the ones whose animation matches what is happening. */}
      <ol className="mt-6 flex flex-col gap-2.5">
        {stages.map((stage) => (
          <li key={stage.key} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
            <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">
              {stage.status === "active"
                ? <ThinkingOrb state={stage.orb} size={20} />
                : <span className={`h-1.5 w-1.5 rounded-full ${stage.status === "done" ? "bg-positive" : stage.status === "failed" ? "bg-danger" : "bg-border"}`} />}
            </span>
            {/* muted, never faint, for a stage NAME. The colour gate restricts faint to audited
                decoration, and it is right to: a stage list is content a student reads to know
                what is happening, and a waiting row is the one they are reading ahead to. */}
            <span className={stage.status === "done" ? "text-ink" : "text-muted"}>
              {stage.label}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              {stage.status === "done" ? "done" : stage.status === "active" ? stage.orb : stage.status === "failed" ? "failed" : "waiting"}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <PrimaryButton
          onClick={() => result && onQuestions(result, { posting, jdMatch, applicantName })}
          disabled={building}
        >
          {/* The count is REAL or the button does not claim it. While building it says what is
              happening; once built it reports what actually needs the student, and zero outstanding
              sends them to review rather than to an empty screen. */}
          {building ? "Building" : buildActionLabel(result)}
        </PrimaryButton>
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}
