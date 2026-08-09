"use client";

/* /start - onboarding.
 *
 * Setup collects only what changes the first dashboard experience: a resume, the roles inferred
 * from it, the sponsorship filter, and the one-page resume Litos will tailor. The Chrome extension
 * is a secondary path for jobs found elsewhere, so it is not an onboarding gate. Missing form
 * answers are asked in context when a real application needs them instead of through a sample form.
 *
 * Steps are DERIVED server-side from data that already exists (see routes/onboarding.ts), not
 * stored as a cursor, so "Finish later" and a fresh start are the same code path and neither can
 * disagree with reality.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApplicationProfile,
  OnboardingState,
  OnboardingStep,
  ParsedProfile,
  api,
  completeOnboarding,
  getApplicationProfile,
  getOnboardingState,
  getStoredEmail,
  getToken,
} from "@/lib/api";
import { ErrorNote } from "@/components/app/ui";
import { Button } from "@/components/app/Button";
import { track } from "@/lib/analytics";
import { DoneStep, FocusStep, GapsStep, ResumeStep } from "@/components/start/steps";
import { BaseResumeStep } from "@/components/start/BaseResumeStep";
import { SponsorshipStep } from "@/components/start/SponsorshipStep";
import { StartFlowProvider, StepRail } from "@/components/start/ui";
import { RecentExperienceStep } from "@/components/start/RecentExperienceStep";

export default function Start() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [profile, setProfile] = useState<ParsedProfile | null>(null);
  // Only the base step needs this, and only to fill the resume's contact line. Most of it is still
  // empty at this point in the flow (harvest has not run yet), which is correct rather than a bug:
  // the contact line fills in as the first application teaches us, and the student can see that.
  const [appProfile, setAppProfile] = useState<ApplicationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  // Set alongside the QA state stub below so the base step can replay a canned build.
  const [qaDemo, setQaDemo] = useState(false);
  const refresh = useCallback(async () => {
    const s = await getOnboardingState();
    setState(s);
    return s;
  }, []);

  const loadProfile = useCallback(async () => {
    setProfileLoadError(null);
    try {
      setProfile(await api<ParsedProfile>("/profile"));
      setAppProfile(await getApplicationProfile().catch(() => null));
    } catch (reason) {
      setProfileLoadError(reason instanceof Error ? reason.message : "Could not load your resume details.");
    }
  }, []);

  useEffect(() => {
    // Same localhost-only QA bypass the dashboard uses (?qa=1&step=resume), so every step of the
    // flow can be opened and reviewed without a live account. Never reachable in production.
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("qa")) {
        const qaStep = (params.get("step") as OnboardingStep) ?? "resume";
        const state: OnboardingState = {
          step: qaStep,
          completed_at: null,
          has_focus: true,
          has_resume: true,
          has_impact_review: qaStep !== "impact",
          /* Step-aware like its siblings. Absent, this made the done screen's receipt report the
             work-visa row as "Not recorded" in QA, which is the honest reading of a missing flag
             but not the state a reviewer wants to see as the default. */
          has_sponsorship_answer: qaStep !== "sponsorship",
          // Same convention as has_impact_review above: every step except the one being reviewed
          // reads as finished. The done screen's setup receipt is derived from these flags, so a
          // flat `false` here would make QA of that screen show a resume it never built.
          has_base_resume: qaStep !== "base",
          has_applied: false,
          has_targeting: false,
          learned: [],
          /* Step-aware for the same reason has_base_resume is, one field up: the done screen's
             receipt reads this, so a hardcoded non-empty list made QA of that screen report details
             outstanding on an account that has none. The gaps step itself still gets its full list. */
          gaps: qaStep === "done" ? [] : ["gpa", "gpa_scale", "major", "languages", "referral_source_default"],
          // Populated so the base step's languages line is reviewable in QA in its prefilled
          // state, which is the state almost every real student will see.
          gap_suggestions: { languages: ["English", "Hindi", "Spanish"] },
          // Multi-page on purpose: the comparison's whole argument is 3 pages against 1, so a
          // 1 here would make the step's signature moment unreviewable in QA.
          source_pages: 3,
          // No stored file in QA, so the comparison pane exercises its own empty state.
          source_resume_url: null,
          harvest_active: false,
          automatic_submission_enabled: false,
          automatic_submission_consented_at: null,
          automatic_submission_consent_version: null,
          automatic_verification_enabled: false,
        };
        setState(state);
        setProfile({
          full_name: "Mehek Mandal",
          school: "University of Southern California",
          grad_year: 2028,
          target_roles: ["Software Engineer", "Product Engineer", "Frontend Engineer", "Full Stack Engineer", "Data Engineer"],
          currently_enrolled: true,
          skills: ["TypeScript", "React", "Python", "SQL"],
          projects: [],
          experience: [
            {
              company: "Litos",
              title: "Software Engineering Intern",
              start: "May 2025",
              end: "August 2025",
              description: "Built a TypeScript application",
            },
          ],
        } as ParsedProfile);
        setQaDemo(true);
        return;
      }
    }
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const s = await refresh();
        if (s.has_resume) {
          // Needed by the targeting screen's derived defaults and by the base screen's education
          // block, which takes school/degree/grad date from the parse rather than from the model.
          await loadProfile();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your setup.");
      }
    })();
  }, [loadProfile, router, refresh]);

  // One step_view per step, from the one place that knows every step. Deduped on the step itself
  // so a refresh() that returns the same step (the install poll fires one every few seconds)
  // doesn't inflate the denominator and make drop-off look better than it is.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!state || state.step === seen.current) return;
    seen.current = state.step;
    track("onboarding_step_view", { step: state.step });
  }, [state]);

  // "Finish later" is the exit. Measured separately from a skip, because a skip means the student
  // stayed and a later means they left - collapsing them would hide which is happening.
  const later = useCallback(() => {
    if (state) track("onboarding_step_later", { step: state.step });
    router.push("/dashboard");
  }, [router, state]);

  const stepDone = useCallback((step: OnboardingStep) => track("onboarding_step_done", { step }), []);

  if (error && !state) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <ErrorNote message={error} />
        <Button type="button" onClick={() => window.location.reload()} className="mt-4">
          Try again
        </Button>
      </div>
    );
  }

  if (!state) {
    /* No `current`, on purpose. This branch renders before GET /onboarding/state has answered, so
       the step is not known yet, and it used to pass "resume" as a stand-in: a returning student
       halfway through setup read "Step 1 of 7, Your resume" for the length of the request, on the
       one device in the flow whose whole job is to say where they are. The rail draws the shape of
       the flow and nothing else until there is a real answer to give. */
    return (
      <StartFlowProvider state={null}>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <StepRail />
          <div className="rq-shimmer mt-10 h-9 w-2/3 rounded-full" />
          <div className="rq-shimmer mt-6 h-32 rounded-inner" />
        </div>
      </StartFlowProvider>
    );
  }

  /* Every screen below renders StartShell, which renders the rail, and the rail's denominator is
     the steps THIS student's flow contains (components/start/ui.tsx flowSteps). Provided once here
     rather than threaded through every step component's props to reach one string. */
  return <StartFlowProvider state={state}>{renderStep(state)}</StartFlowProvider>;

  /* Hoisted so the provider can wrap it above without re-indenting every branch of the switch.
     The parameter deliberately shadows the outer `state`: a hoisted declaration can be called from
     anywhere, so TypeScript drops the non-null narrowing the guard above established, and taking it
     as an argument restores it for every branch at once rather than a `!` per use. */
  function renderStep(state: OnboardingState) {
  switch (state.step) {
    case "focus":
      // During a rolling backend deploy an older state response can still say "focus" before a
      // resume exists. Keeping the upload here makes the new resume-first contract resilient to
      // that short mixed-version window.
      if (!state.has_resume) {
        return (
          <ResumeStep
            onLater={later}
            onDone={() => {
              stepDone("resume");
              void (async () => {
                const s = await refresh();
                if (s.has_resume) await loadProfile();
              })();
            }}
          />
        );
      }
      if (!profile) {
        return (
          <div className="mx-auto max-w-2xl px-6 py-16">
            <StepRail current="focus" />
            {profileLoadError ? (
              <div className="mt-10">
                <ErrorNote message={profileLoadError} />
                <button type="button" onClick={() => void loadProfile()} className="mt-4 text-sm text-brand underline underline-offset-4">
                  Try loading again
                </button>
              </div>
            ) : (
              <>
                <div className="rq-shimmer mt-10 h-9 w-2/3 rounded-full" />
                <div className="rq-shimmer mt-6 h-32 rounded-inner" />
              </>
            )}
          </div>
        );
      }
      return (
        <FocusStep
          profile={profile}
          onLater={later}
          onDone={() => {
            stepDone("focus");
            void refresh();
          }}
        />
      );

    case "sponsorship":
      return (
        <SponsorshipStep
          onDone={() => {
            stepDone("sponsorship");
            void refresh();
          }}
        />
      );

    case "resume":
      return (
        <ResumeStep
          onLater={later}
          onDone={() => {
            stepDone("resume");
            void (async () => {
              const s = await refresh();
              if (s.has_resume) await loadProfile();
            })();
          }}
        />
      );

    case "impact":
      return (
        <RecentExperienceStep
          demo={qaDemo}
          onLater={later}
          onDone={() => {
            stepDone("impact");
            void refresh();
          }}
        />
      );

    case "base":
      return (
        <BaseResumeStep
          parsed={profile}
          profile={appProfile}
          email={getStoredEmail()}
          sourcePages={state.source_pages}
          sourceUrl={state.source_resume_url}
          languageGap={state.gaps.includes("languages")}
          languageSuggestion={state.gap_suggestions?.languages ?? []}
          demo={qaDemo}
          onLater={later}
          onDone={() => {
            stepDone("base");
            void refresh();
          }}
        />
      );

    case "gaps":
      return (
        <GapsStep
          gaps={state.gaps}
          onLater={later}
          onDone={() => {
            stepDone("gaps");
            void refresh();
          }}
        />
      );

    // An older backend may briefly return one of the removed steps during a rolling deploy. Treat
    // it as ready rather than sending the student through the deleted extension and sample-form
    // detour until the next state refresh reaches the new backend.
    case "install":
    case "apply":
    case "targeting":
    case "done":
      return (
        <>
        {error && <div className="mx-auto mb-4 max-w-2xl px-6"><ErrorNote message={error} /></div>}
        <DoneStep
          state={state}
          verificationEnabled={state.automatic_verification_enabled}
          onFinish={async (settings) => {
            try {
              await completeOnboarding(settings);
              track("onboarding_complete", {
                learned: state.learned.length,
                applied: state.has_applied,
              });
              router.push("/dashboard");
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Could not save your automation permissions.");
            }
          }}
        />
        </>
      );
  }
  }
}
