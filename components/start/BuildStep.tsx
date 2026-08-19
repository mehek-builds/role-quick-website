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
import { api, getJob, getPostingQuestions, type MonitoredJob } from "@/lib/api";
import { type ProfileIdentity } from "@/features/applications";
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
  onLater,
}: {
  match: OnboardingMatch;
  /** Built. The questions screen takes the result from here. */
  onQuestions: (result: BuildResult) => void;
  onLater: () => void;
}) {
  const [stages, setStages] = useState<BuildStage[]>(() => initialStages());
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState<{ message: string; fixable: boolean } | null>(null);
  const [posting, setPosting] = useState<MonitoredJob>(match.job);

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
          return { fullName: identity.full_name ?? null, resumeEmail: identity.resume_email ?? null };
        },
        generateResume: (input) => api<unknown>("/resume/generate", {
          method: "POST",
          body: JSON.stringify({
            initiation: "explicit_click",
            company: input.company,
            role: input.role,
            jd_text: input.jdText,
            job_id: input.jobId,
            contact: { full_name: input.fullName, email: input.resumeEmail },
          }),
        }),
        loadQuestions: async (jobId) => {
          const prescript = await getPostingQuestions(jobId);
          /* NULL IS NOT A FAILURE HERE, and the existing contract is why: getPostingQuestions
             catches every failure mode to null because they all mean the same thing to Apply,
             which is that there is nothing extra to ask. Onboarding follows that rather than
             inventing a second meaning for the same response. The consequence is stated on the
             button: no outstanding questions sends the student straight to review. */
          return { total: prescript?.question_count ?? 0, outstanding: prescript?.ask.length ?? 0 };
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
        });
        track("onboarding_build_failed", { fixable });
      });
    return () => { cancelled = true; };
  }, [match.job.id]);

  if (error) {
    return (
      <StartShell step="focus" title="That build did not finish.">
        <ErrorNote message={error.message} />
        <p className="mt-4 text-sm leading-6 text-muted">
          {error.fixable
            ? "Add it in Account and Litos will build this one again. The posting is saved."
            : "Nothing was sent, and nothing was lost. Your resume and roles are saved."}
        </p>
        <div className="mt-6"><LaterLink onClick={onLater} /></div>
      </StartShell>
    );
  }

  const building = result === null;

  return (
    <StartShell
      step="focus"
      title={building ? "Building your application." : "Here is your application."}
      wide
    >
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
          <div className="flex flex-col gap-2 p-3.5">
            <p className="text-[15px] leading-snug text-ink">{posting.title}</p>
            <p className="font-mono text-[11px] leading-relaxed text-muted">
              {[posting.company_name, posting.location].filter(Boolean).join(" · ")}
              <br />
              {posting.ats_name}
            </p>
          </div>
        </section>

        {/* RIGHT: the resume. Skeleton while building, real bullets once it exists. */}
        <section className="overflow-hidden rounded-inner border border-border">
          <header className="flex min-h-[38px] items-center justify-between gap-3 border-b border-border bg-surface-alt px-3.5 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Your resume for it</span>
            {building
              ? <ThinkingOrb state="composing" size={20} />
              : <span className="font-mono text-[11px] text-positive">1 page</span>}
          </header>
          <div className="flex min-h-[170px] flex-col gap-2 p-3.5">
            {building ? (
              <>
                <span className="rq-shimmer h-1.5 w-3/5 rounded-full" />
                <span className="rq-shimmer h-1.5 w-full rounded-full" />
                <span className="rq-shimmer h-1.5 w-11/12 rounded-full" />
                <span className="rq-shimmer h-1.5 w-2/5 rounded-full" />
              </>
            ) : (
              <p className="text-[13px] leading-6 text-muted">
                Written for this posting from your own resume. You will see every line of it before
                anything is sent.
              </p>
            )}
          </div>
        </section>
      </div>

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
