"use client";

/* 04 WATCH IT BUILD: the screen the product stops being described on and starts being watched.
 *
 * One screen, two phases, no route change. The posting stays pinned on the left the whole time so
 * the student can read what Litos is reading; the right pane is where the resume assembles.
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
import { ResumePaper, type ContactHeader } from "./ResumePaper";
import { api, getJob, getPostingQuestions, isGuestSession, type MonitoredJob, type ResumeSpec } from "@/lib/api";
import {
  buildRequirementIndex,
  EMPTY_REQUIREMENT_INDEX,
  fetchJdMatch,
  prescriptMetadataBlockers,
  resumeSpecText,
  type JdMatchResponse,
  type ProfileIdentity,
} from "@/features/applications";
import { MatchLegend, RequirementProvider, RequirementText } from "@/components/app/RequirementText";
import { isStructuredUpgradeDenial } from "@/features/billing";
import {
  BuildPreconditionError,
  PostingReadError,
  buildActionLabel,
  initialStages,
  runOnboardingBuild,
  type BuildResult,
  type BuildStage,
} from "@/lib/onboarding-build";
import { track } from "@/lib/analytics";
import { LaterLink, PrimaryButton, StartShell } from "./ui";
import type { OnboardingMatch } from "@/lib/onboarding-match";

/* What this screen learned that the screens after it need: the full posting (the match feed's row
   may not carry the description), the requirement match both panes were marked with, and the
   applicant's name for the paper header. Passed up rather than re-fetched, because the review
   screen draws the same two panes and re-asking the network for what is already in hand would make
   the transition between them flicker. */
export type BuildContext = {
  posting: MonitoredJob;
  jdMatch: JdMatchResponse | null;
  applicantName: string | null;
};

/* The posting's words with their requirement marks and legend, shared by the build screen and the
   review screen so the two panes cannot drift apart: what the student approves on review is
   rendered by the same code that showed it building. Callers wrap it in a RequirementProvider. */
export function MarkedPostingBody({ description, jdMatch }: { description: string; jdMatch: JdMatchResponse | null }) {
  return (
    <>
      {jdMatch?.scorable && (
        <div className="mt-1">
          <MatchLegend missingCount={jdMatch.missing.length} />
        </div>
      )}
      <p className="mt-1 whitespace-pre-line text-[12.5px] leading-6 text-ink">
        <RequirementText text={description} />
      </p>
    </>
  );
}

export function BuildStep({
  match,
  onQuestions,
  onPickAnother,
  onLater,
}: {
  match: OnboardingMatch;
  /** Built. The questions screen takes the result from here. */
  onQuestions: (result: BuildResult, context: BuildContext) => void;
  /** Back to the match screen to choose a different posting. The way out of a build that cannot
   *  succeed for THIS posting no matter how many times it is retried. */
  onPickAnother: () => void;
  onLater: () => void;
}) {
  const [stages, setStages] = useState<BuildStage[]>(() => initialStages());
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState<{ message: string; fixable: boolean; field: "full_name" | "resume_email" | null; entitlement: boolean; postingRead: boolean } | null>(null);
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
          const prescript = await getPostingQuestions(jobId);
          if (prescript.discovery_status !== "ok" || prescriptMetadataBlockers(prescript).length > 0) {
            /* Typed, so the failure screen can offer the recovery this actually has: read the form
               again (the stage runs before anything is spent now, so a retry costs nothing), or
               pick another posting. The generic screen's copy blames the fit, which a scan failure
               says nothing about. */
            throw new PostingReadError("Litos could not verify every employer question yet. Try reading the company form again.");
          }
          return {
            total: prescript.question_count,
            alreadyAnswered: prescript.already_answered,
            ask: prescript.ask,
          };
        },
      },
      match.job.id,
      (next) => { if (!cancelled) setStages(next); },
    )
      .then((built) => {
        if (cancelled) return;
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
        const postingRead = reason instanceof PostingReadError;
        setError({
          message: reason instanceof Error ? reason.message : "Litos could not build this application.",
          fixable,
          /* WHICH precondition, not just that there was one. A missing name and a missing email are
             fixed in different places, and for a guest the email is not fixable in Account at all. */
          field: reason instanceof BuildPreconditionError ? reason.field : null,
          entitlement,
          postingRead,
        });
        track("onboarding_build_failed", { fixable, entitlement, posting_read: postingRead });
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

  /* THE PAYWALL SAYS IT IS A PAYWALL. The generic failure screen below blames the posting and
     offers another one, and both halves are false here: the refusal is about the account, and the
     next posting refuses identically. Setup's own argument (see the free build first, card at step
     10) is intact for a fresh account, which never sees this; it appears only when the free build
     is no longer available, and the honest forward control is the plans page, where the ask
     already lives. Nothing is lost by leaving: the flow resumes from this same step. */
  if (error?.entitlement) {
    return (
      <StartShell step="build" title="This one needs Litos+.">
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

  /* A SCAN FAILURE IS ABOUT THE EMPLOYER'S PAGE, NOT THE STUDENT'S FIT. The generic screen below
     says "this one is not a fit Litos can write honestly", which is the right sentence for a
     resume-quality refusal and a falsehood for a form Litos could not read. This branch says what
     happened and offers the recovery it actually has: the read runs before anything is spent, so
     trying again is free, and a protected form that will never read (a Cloudflare-gated portal)
     still has "Show me a different one" as the way on. */
  if (error?.postingRead) {
    return (
      <StartShell step="build" title="That build did not finish.">
        <ErrorNote message={error.message} />
        <p className="mt-4 text-sm leading-6 text-muted">
          Litos reads the employer&apos;s application form before writing anything, and this read
          could not verify every question. That is about {posting.company_name}&apos;s page, not
          about your fit. Reading it again often works; nothing was spent and nothing was lost.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <PrimaryButton
            onClick={() => {
              track("onboarding_build_form_reread", {});
              setError(null);
              setResult(null);
              setJdMatch(null);
              setStages(initialStages());
              setAttempt((n) => n + 1);
            }}
          >
            Read the form again
          </PrimaryButton>
          <button
            type="button"
            onClick={onPickAnother}
            className="text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            Show me a different one
          </button>
          <LaterLink onClick={onLater} />
        </div>
      </StartShell>
    );
  }

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
      <StartShell step="build" title="That build did not finish.">
        <ErrorNote message={error.message} />
        <p className="mt-4 text-sm leading-6 text-muted">
          {error.fixable
            ? guestNeedsEmail
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
            : "Nothing was sent and nothing was lost. Your resume and roles are saved, and this one is not a fit Litos can write honestly. Try another posting."}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          {!error.fixable && (
            <PrimaryButton onClick={onPickAnother}>Show me a different one</PrimaryButton>
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
  const requirementIndex = jdMatch
    ? buildRequirementIndex(jdMatch.matched, jdMatch.missing)
    : EMPTY_REQUIREMENT_INDEX;

  return (
    <StartShell
      step="build"
      title={building ? "Building your application." : "Here is your application."}
      wide
    >
      {/* ONE PROVIDER OVER BOTH PANES, which is the whole feature: the same index colours a term
          in the posting and in the paper, and hovering either side lifts it on both. */}
      <RequirementProvider index={requirementIndex}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* LEFT: the posting, pinned. Unchanged between phases on purpose, so the student can read
            what Litos is reading rather than watching it disappear at the moment it matters. */}
        <section className="overflow-hidden rounded-inner border border-border">
          <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-alt px-3.5 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">The posting</span>
            {typeof posting.match_score === "number" && (
              <span className="font-mono text-[11px] text-teal-ink">{posting.match_score}</span>
            )}
          </header>
          <div className="flex max-h-[380px] flex-col gap-2 overflow-y-auto p-3.5">
            <p className="text-[15px] leading-snug text-ink">{posting.title}</p>
            <p className="font-mono text-[11px] leading-relaxed text-muted">
              {[posting.company_name, posting.location].filter(Boolean).join(" · ")}
              <br />
              {posting.ats_name}
            </p>
            {/* THE POSTING'S OWN WORDS, which is what makes the left pane a job description rather
                than a job title. There is something to compare against on the right now, so the
                text has to actually be here.

                MARKED, and the mark has support on the other side (Mehek, 2026-09-01). ISSUE-047
                took the marking out because ResumePaper drew an unmarked document, so a colour here
                pointed at nothing there. ResumePaper now renders its read-only text through
                RequirementText under the same provider, so both panes carry the same colours for
                the same meanings, which is what closes the issue instead of re-opening it. */}
            {!building && posting.description && (
              <MarkedPostingBody description={posting.description} jdMatch={jdMatch} />
            )}
          </div>
        </section>

        {/* RIGHT: the resume itself. Skeleton while building, the student's own real lines after.
            Marked through the same index as the posting on the left. */}
        <section className="overflow-hidden rounded-inner border border-border">
          <header className="flex min-h-[38px] items-center justify-between gap-3 border-b border-border bg-surface-alt px-3.5 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Your resume for it</span>
            {building
              ? <ThinkingOrb state="composing" size={20} />
              : <span className="font-mono text-[11px] text-positive">1 page</span>}
          </header>
          <div className="flex max-h-[380px] min-h-[170px] flex-col gap-3 overflow-y-auto p-3.5">
            {building ? (
              <>
                <span className="rq-shimmer h-1.5 w-3/5 rounded-full" />
                <span className="rq-shimmer h-1.5 w-full rounded-full" />
                <span className="rq-shimmer h-1.5 w-11/12 rounded-full" />
                <span className="rq-shimmer h-1.5 w-2/5 rounded-full" />
              </>
            ) : result?.resumeSpec ? (
              /* THE SAME PAPER THE REST OF THE PRODUCT DRAWS, not a second one written for this
                 screen. It already lays out the header the way a resume lays it out - name centred,
                 contact line beneath - and it already owns the education, experience and skills
                 blocks and the one-page fit. A parallel implementation here would drift from it on
                 the first change to either, and mine already had: no contact line at all. */
              <div className="origin-top scale-[0.62] [transform-box:content-box]">
                <ResumePaper spec={result.resumeSpec} contact={contactHeaderOf(result.resumeSpec, applicantName)} />
              </div>
            ) : (
              /* Generation succeeded but returned no spec to show. Says so rather than printing an
                 empty pane that reads as a failure, and the packet is still real. */
              <p className="text-[13px] leading-6 text-muted">
                Built for this posting. You will see every line of it on the next screen.
              </p>
            )}
          </div>
        </section>
      </div>
      </RequirementProvider>

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

/* The contact block for the paper, off the spec the generator just returned.
 *
 * `_contact` is what the backend rendered the PDF's own header from (engine/resumeRender.ts), so
 * reading it here is what keeps this preview and the document the employer receives saying the same
 * thing. The name falls back to the loaded identity for a spec that predates `_contact`. */
export function contactHeaderOf(spec: ResumeSpec, fallbackName: string | null): ContactHeader {
  const contact = (spec as ResumeSpec & { _contact?: Partial<ContactHeader> })._contact ?? {};
  return { ...contact, full_name: contact.full_name?.trim() || fallbackName || "" };
}
