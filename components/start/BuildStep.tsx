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

import { useEffect, useMemo, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { ErrorNote } from "@/components/app/ui";
import { RequirementProvider, RequirementText } from "@/components/app/RequirementText";
import { api, getJob, getPostingQuestions, isGuestSession, type MonitoredJob, type ResumeSpec } from "@/lib/api";
import {
  buildRequirementIndex,
  EMPTY_REQUIREMENT_INDEX,
  fetchJdMatch,
  resumeSpecText,
  type JdMatchResponse,
  type ProfileIdentity,
} from "@/features/applications";
import {
  BuildPreconditionError,
  buildActionLabel,
  initialStages,
  runOnboardingBuild,
  type BuildResult,
  type BuildStage,
} from "@/lib/onboarding-build";
import { track } from "@/lib/analytics";
import { LaterLink, PrimaryButton, StartShell } from "./ui";
import type { OnboardingMatch } from "@/lib/onboarding-match";

export function BuildStep({
  match,
  onQuestions,
  onPickAnother,
  onLater,
}: {
  match: OnboardingMatch;
  /** Built. The questions screen takes the result from here. */
  onQuestions: (result: BuildResult) => void;
  /** Back to the match screen to choose a different posting. The way out of a build that cannot
   *  succeed for THIS posting no matter how many times it is retried. */
  onPickAnother: () => void;
  onLater: () => void;
}) {
  const [stages, setStages] = useState<BuildStage[]>(() => initialStages());
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState<{ message: string; fixable: boolean; field: "full_name" | "resume_email" | null } | null>(null);
  const [posting, setPosting] = useState<MonitoredJob>(match.job);
  /* WHAT THE TAILORING ACTUALLY DID, scored against this posting.
   *
   * Without it the right pane was a sentence of prose - "Written for this posting from your own
   * resume" - which is the product ASSERTING the one thing this screen exists to SHOW. A student
   * watching three stages tick over and then being told, in words, that something was tailored has
   * been given a progress bar and a promise.
   *
   * The scoring is a separate call on purpose. It is not part of runOnboardingBuild: the build has
   * to be provable without running it, and a failed score must never turn a successful build into a
   * failed one. Hence its own state and its own catch - the panes fall back to plain, unmarked text
   * and the flow continues, because the resume is real whether or not it could be scored. */
  const [scored, setScored] = useState<JdMatchResponse | null>(null);
  /* THE APPLICANT'S NAME, held here because ResumeSpec has no name field.
   *
   * That absence has produced the same bug four times: a resume surface renders `spec.school` in
   * the top slot and the student reads their university where their name belongs. The build
   * already loads identity as a precondition of generating at all, so the name is in hand - this
   * keeps it rather than throwing it away and rendering a headless document. */
  const [applicantName, setApplicantName] = useState<string | null>(null);

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
          const generated = await api<{ canonical_application_id?: string; application?: { spec?: ResumeSpec } }>("/resume/generate", {
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
            applicationId: generated.canonical_application_id ?? null,
            resumeSpec: generated.application?.spec ?? null,
          };
        },
        loadQuestions: async (jobId) => {
          const prescript = await getPostingQuestions(jobId);
          /* NULL IS NOT A FAILURE HERE, and the existing contract is why: getPostingQuestions
             catches every failure mode to null because they all mean the same thing to Apply,
             which is that there is nothing extra to ask. Onboarding follows that rather than
             inventing a second meaning for the same response. The consequence is stated on the
             button: no outstanding questions sends the student straight to review. */
          return {
            total: prescript?.question_count ?? 0,
            alreadyAnswered: prescript?.already_answered ?? 0,
            ask: prescript?.ask ?? [],
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
        setError({
          message: reason instanceof Error ? reason.message : "Litos could not build this application.",
          fixable,
          /* WHICH precondition, not just that there was one. A missing name and a missing email are
             fixed in different places, and for a guest the email is not fixable in Account at all. */
          field: reason instanceof BuildPreconditionError ? reason.field : null,
        });
        track("onboarding_build_failed", { fixable });
      });
    return () => { cancelled = true; };
  }, [match.job.id]);

  /* Scoring the finished resume against this posting, which is what gives both panes their colours.
   *
   * Runs AFTER the build rather than inside it, and its failure is not the build's failure: the
   * resume is real whether or not it could be scored, and turning a successful generation into
   * "That build did not finish" because a scoring call timed out would be the worst possible trade.
   * A failed score leaves EMPTY_REQUIREMENT_INDEX, both panes render as plain text, and the student
   * still gets their resume. */
  useEffect(() => {
    if (!result?.resumeSpec) return;
    let cancelled = false;
    fetchJdMatch(posting.description ?? null, resumeSpecText(result.resumeSpec), { job_id: posting.id })
      .then((match) => { if (!cancelled) setScored(match); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [result, posting.description, posting.id]);

  /* The one precondition a guest cannot satisfy from Account, because a guest has no account email.
     Read at render rather than stored: the student may have claimed one in another tab. */
  const guestNeedsEmail = error?.fixable === true && error.field === "resume_email" && isGuestSession();

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

  /* THE COLOUR CONTRACT, and it is the reason this pane renders the resume rather than describing
     it. ISSUE-047: every colour on one side must be supported by something on the other. A term
     marked in the job description and markable nowhere in the resume is a colour pointing at
     nothing, which was measured on 111 of 313 matched terms. Both panes here run through the same
     `RequirementText`, over the same index, so a mark on the left has a mark on the right by
     construction - and hovering either lifts both. */
  const index = useMemo(
    () => (scored ? buildRequirementIndex(scored.matched, scored.missing) : EMPTY_REQUIREMENT_INDEX),
    [scored],
  );

  return (
    <StartShell
      step="build"
      title={building ? "Building your application." : "Here is your application."}
      wide
    >
      {/* One provider over BOTH panes, which is what makes the link real rather than a coincidence
          of colour. The hover state lives in this context too, so pointing at a term in the posting
          lifts the same term in the resume and vice versa. */}
      <RequirementProvider index={index}>
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
                than a job title. Marked term by term against the same index as the resume, so
                pointing at anything here lifts its answer over there. Only after the build: marking
                a posting against a resume that does not exist yet would colour it from a previous
                student's score or from nothing at all.

                `hideMissing` because the legend is gone (Mehek 2026-08-20). A mark now means one
                thing and one thing only - the posting asked for this and your resume says it - so
                it explains itself by appearing on both sides at once, and hovering either lifts the
                pair. The missing tone cannot do that: nothing on the resume side answers it, so
                without a key it was an orange underline the student had no way to read, attached to
                a count of what they lack on the screen that is meant to show what Litos just built
                for them. */}
            {!building && posting.description && (
              <p className="mt-1 whitespace-pre-line text-[12.5px] leading-6 text-ink">
                <RequirementText text={posting.description} hideMissing />
              </p>
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
              <ResumePane spec={result.resumeSpec} name={applicantName} />
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
          onClick={() => result && onQuestions(result)}
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

/* THE RESUME LITOS JUST WROTE, rendered rather than described.
 *
 * Every line here is marked through RequirementText, so a term the posting asked for and this
 * resume answers carries the same colour on both sides of the screen and hovering either lifts
 * both. That is the whole point of the pane: the student can see WHICH of their own lines answer
 * WHICH part of the posting, instead of being told that tailoring happened.
 *
 * Deliberately not the print layout. This is a reading view at 12.5px inside a 380px scroller,
 * sitting next to the job description it was written against; the real one-page document is the
 * next screen, and pretending this is it would set the wrong expectation about what can be edited
 * here. Nothing on this pane is editable, because nothing has been sent yet and the review screen
 * is where lines get changed.
 */
function ResumePane({ spec, name }: { spec: ResumeSpec; name: string | null }) {
  return (
    <div className="flex flex-col gap-3 text-[12.5px] leading-6 text-ink">
      {/* THE NAME, FIRST, and it is a prop rather than a spec field because ResumeSpec has none.
          Without it the school renders into the top slot and the student reads their university
          where their own name belongs - the failure tests/packet-resume-header.test.mjs exists to
          stop, having happened four times. Not marked: a name is not a requirement the posting
          asked for, and colouring it would be a colour with nothing behind it. */}
      {name && <p className="text-[14px] font-medium text-ink">{name}</p>}
      <section className="flex flex-col gap-0.5">
        <p className="font-medium">
          <RequirementText text={spec.school ?? ""} />
        </p>
        <p className="text-muted">
          <RequirementText text={[spec.degree, spec.grad_date].filter(Boolean).join(" · ")} />
        </p>
        {/* Coursework is marked because the PDF prints it and the scorer reads it. Leaving it off
            the screen while crediting its terms is half of what ISSUE-047 measured. */}
        {spec.coursework && (
          <p className="text-muted">
            <RequirementText text={spec.coursework} />
          </p>
        )}
      </section>

      {/* EVERY LIST IS GUARDED, and not as defensive habit. A spec that reached this pane came back
          from a real generation, so its shape is normally complete - but `application.spec` is
          whatever the backend sent, an older or partial response drops fields, and `undefined.map`
          in a render turns a SUCCESSFUL build into a blank screen. The resume exists either way;
          this pane must never be the reason a student cannot see that. */}
      {(spec.experience ?? []).map((entry, i) => (
        <section key={`${entry.org}-${i}`} className="flex flex-col gap-1">
          <p className="font-medium">
            <RequirementText text={[entry.title, entry.org].filter(Boolean).join(", ")} />
          </p>
          <p className="font-mono text-[11px] text-muted">{entry.date_range}</p>
          <ul className="flex flex-col gap-1">
            {(entry.bullets ?? []).map((bullet, b) => (
              <li key={b} className="pl-3 -indent-3">
                <span aria-hidden="true" className="text-muted">· </span>
                <RequirementText text={bullet} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {(spec.skills ?? []).length > 0 && (
        <section>
          <p className="text-muted">
            <RequirementText text={(spec.skills ?? []).join(", ")} />
          </p>
        </section>
      )}
    </div>
  );
}
