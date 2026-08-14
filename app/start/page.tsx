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
 *
 * ONE bounded exception, and it is deliberate: the gaps screen's EXIT is not derivable from the
 * profile, because skipping it saves nothing. The server records having asked
 * (application_profile.setup_gaps_asked_at) and that is what makes leaving durable; `gapsHandled`
 * below makes it immediate, and keeps a student off a dead end if the stamp could not be written at
 * all. It lives in memory, for this session, for that one screen. Every other step stays exactly as
 * derived. See the "gaps" case in renderStep.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApplicationProfile,
  OnboardingState,
  OnboardingStep,
  ParsedProfile,
  api,
  acknowledgeOnboardingFlowStep,
  completeOnboarding,
  completeOnboardingFlow,
  getApplicationProfile,
  getOnboardingState,
  getStoredEmail,
  getToken,
  markGapsAsked,
  setAutomationSettings,
} from "@/lib/api";
import { ErrorNote } from "@/components/app/ui";
import { Button } from "@/components/app/Button";
import { track } from "@/lib/analytics";
import { DoneStep, FocusStep, GapsStep, ResumeStep } from "@/components/start/steps";
import { BaseResumeStep } from "@/components/start/BaseResumeStep";
import { SponsorshipStep } from "@/components/start/SponsorshipStep";
import { StartFlowProvider, StepRail } from "@/components/start/ui";
import { RecentExperienceStep } from "@/components/start/RecentExperienceStep";
import { deferOnboardingForSession } from "@/lib/onboarding-flow";

export default function Start() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [profile, setProfile] = useState<ParsedProfile | null>(null);
  const [parsedProfileStatus, setParsedProfileStatus] = useState<"loading" | "ready" | "error">("loading");
  const [parsedProfileLoadError, setParsedProfileLoadError] = useState<string | null>(null);
  // Only the base step needs this, and only to fill the resume's contact line. Most of it is still
  // empty at this point in the flow (harvest has not run yet), which is correct rather than a bug:
  // the contact line fills in as the first application teaches us, and the student can see that.
  const [appProfile, setAppProfile] = useState<ApplicationProfile | null>(null);
  const [appProfileStatus, setAppProfileStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  // Set alongside the QA state stub below so the base step can replay a canned build.
  const [qaDemo, setQaDemo] = useState(false);
  // The setup gaps screen has been answered or skipped in THIS session. See the "gaps" case below.
  const [gapsHandled, setGapsHandled] = useState(false);
  const refresh = useCallback(async () => {
    const s = await getOnboardingState();
    setState(s);
    return s;
  }, []);

  const loadProfile = useCallback(async () => {
    setProfileLoadError(null);
    setParsedProfileLoadError(null);
    setParsedProfileStatus("loading");
    setAppProfileStatus("loading");
    try {
      setProfile(await api<ParsedProfile>("/profile"));
      setParsedProfileStatus("ready");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not load your resume details.";
      setParsedProfileLoadError(message);
      setProfileLoadError(message);
      setParsedProfileStatus("error");
    }
    /* These stores fail independently. A parsed-resume failure must not stop the application
       profile from loading: the one-page builder can still run without parsed contact details,
       while approval must never mistake an unknown saved application profile for a blank one. */
    try {
      setAppProfile(await getApplicationProfile());
      setAppProfileStatus("ready");
    } catch (reason) {
      setAppProfile(null);
      setProfileLoadError(reason instanceof Error ? reason.message : "Could not load your application details.");
      setAppProfileStatus("error");
    }
  }, []);

  useEffect(() => {
    // Same localhost-only QA bypass the dashboard uses (?qa=1&step=resume), so every step of the
    // flow can be opened and reviewed without a live account. Never reachable in production.
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("qa")) {
        const qaStep = (params.get("step") as OnboardingStep) ?? "resume";
        const qaSaved = params.get("scenario") === "saved";
        const state: OnboardingState = {
          step: qaStep,
          flow_version: qaSaved ? 2 : 0,
          flow_completed: false,
          requires_onboarding: true,
          completed_at: qaSaved ? "2026-08-01T10:00:00.000Z" : null,
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
          /* The rail's denominator, and in QA it has to follow the step being reviewed rather than
             the gap list: `gaps` above is emptied on the done screen so its receipt reads honestly,
             and a denominator re-derived from that would drop the screen out of the rail on the one
             step where a reviewer is checking the final count. The real backend answers this from
             whether the screen was SHOWN, which stays true across both. */
          includes_gaps_step: true,
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
          /* Ungranted, which is the state a new account reaches this screen in and therefore the one
             worth reviewing: the box unticked, with the words being agreed to. */
          automatic_captcha_enabled: false,
          automatic_captcha_consented_at: null,
          automatic_captcha_consent_version: null,
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
        setParsedProfileStatus("ready");
        if (qaSaved) {
          setAppProfile({
            phone: "+1 213 555 0100",
            address_city: "Los Angeles",
            address_state: "CA",
            address_zip: "90007",
            address_country: "United States",
            linkedin_url: "https://linkedin.com/in/mehek",
            github_url: "https://github.com/mehek",
            portfolio_url: "https://mehek.dev",
            citizenship: "United States",
            major: "Computer Science",
            gpa: "3.89",
            gpa_scale: "4.0",
            languages: ["English", "Hindi", "Spanish"],
            availability_term: "14 weeks",
            desired_salary: "Market rate",
            desired_salary_currency: "USD",
            referral_source_default: "University career fair",
            pronouns: "she/her",
            eeo_prefs: { gender: "Female", veteran_status: "No", disability_status: "No" },
          });
        }
        setAppProfileStatus("ready");
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
        if (s.requires_onboarding === false && s.step === "done") {
          router.replace("/dashboard");
          return;
        }
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
    deferOnboardingForSession();
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
     rather than threaded through every step component's props to reach one string.

     A `const` arrow rather than a hoisted `function`: `state` is a const binding, so the non-null
     narrowing from the guard above survives into an arrow defined after it, and a declaration is
     the one form that loses it (a hoisted name is callable from anywhere, including above the
     guard). The earlier fix for that took the state as a same-named parameter, which shadowed the
     outer one to buy something the arrow gives for free. */
  const renderStep = () => {
    /* The one place the client overrides the server's derived step, and it is bounded to the screen
       whose exit is not derivable. The stamp POST /onboarding/gaps-asked writes is what makes
       leaving durable; this is what makes it immediate, and what keeps a student off a dead end if
       the stamp could not be written at all (see the gaps case below). Every other step stays
       exactly as derived - a stored cursor is the thing this flow is built to avoid. */
    const step: OnboardingStep = state.step === "gaps" && gapsHandled ? "done" : state.step;
    const applicationProfileGate = (current: OnboardingStep) => (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <StepRail current={current} />
        {appProfileStatus === "error" ? (
          <div className="mt-10">
            <ErrorNote message={profileLoadError ?? "Could not load your saved application details."} />
            <button type="button" onClick={() => void loadProfile()} className="mt-4 min-h-11 text-sm text-brand-ink underline underline-offset-4">
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
    const parsedProfileGate = () => (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <StepRail current="resume" />
        {parsedProfileStatus === "error" ? (
          <div className="mt-10">
            <ErrorNote message={parsedProfileLoadError ?? "Could not load your saved resume."} />
            <button type="button" onClick={() => void loadProfile()} className="mt-4 min-h-11 text-sm text-brand-ink underline underline-offset-4">
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
    switch (step) {
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
                  if (state.flow_version === 2) await acknowledgeOnboardingFlowStep("resume", "continued");
                  const s = await refresh();
                  if (s.has_resume) await loadProfile();
                })().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
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
                  <button type="button" onClick={() => void loadProfile()} className="mt-4 text-sm text-brand-ink underline underline-offset-4">
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
              void (state.flow_version === 2 ? acknowledgeOnboardingFlowStep("focus", "continued") : Promise.resolve()).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
            }}
          />
        );

      case "sponsorship":
        if (!qaDemo && appProfileStatus !== "ready") return applicationProfileGate("sponsorship");
        return (
          <SponsorshipStep
            profile={appProfile}
            sponsorshipAnswer={state.sponsorship_answer}
            onLater={later}
            onDone={() => {
              stepDone("sponsorship");
              void (state.flow_version === 2 ? acknowledgeOnboardingFlowStep("sponsorship", "continued") : Promise.resolve()).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
            }}
          />
        );

      case "resume":
        if (state.flow_version === 2 && state.has_resume && !state.flow_completed && parsedProfileStatus !== "ready") {
          return parsedProfileGate();
        }
        return (
          <ResumeStep
            savedProfile={state.flow_version === 2 && state.has_resume && state.flow_completed === false ? profile : undefined}
            onLater={later}
            onDone={() => {
              stepDone("resume");
              void (async () => {
                if (state.flow_version === 2) await acknowledgeOnboardingFlowStep("resume", "continued");
                const s = await refresh();
                if (s.has_resume) await loadProfile();
              })().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
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
              void (state.flow_version === 2 ? acknowledgeOnboardingFlowStep("impact", "continued") : Promise.resolve()).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
            }}
          />
        );

      case "base":
        if (!qaDemo && appProfileStatus !== "ready") return applicationProfileGate("base");
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
              void (state.flow_version === 2 ? acknowledgeOnboardingFlowStep("base", "continued") : Promise.resolve()).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
            }}
          />
        );

      /* Reached for a student whose resume printed no GPA, GPA scale or major. Those three are the
         only fields that route anyone here (backend SETUP_GAP_FIELDS); the screen then renders
         every outstanding gap it is given, because they are already on it. */
      case "gaps":
        return (
          <GapsStep
            gaps={state.gaps}
            onLater={later}
            onDone={(skipped) => {
              stepDone("gaps");
              void (async () => {
                /* Both Save and Skip land here, and BOTH have to record that the screen was shown.
                   Skipping saves no fields, so without this the server keeps deriving 'gaps' from
                   the same missing values and the student can never leave - the defect that had
                   this step deleted from the flow in backend #116.

                   `gapsHandled` is set whatever the stamp did, and that is the point: on a backend
                   that deployed ahead of its migration there is nowhere to record it, and re-reading
                   `state.step` would put them straight back on a screen with no exit. The server
                   suppresses the step entirely in that window, so the next load agrees. */
                setGapsHandled(true);
                await markGapsAsked();
                if (state.flow_version === 2) await acknowledgeOnboardingFlowStep("gaps", skipped ? "skipped" : "continued");
                void refresh();
              })().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
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
            onFinish={async (settings) => {
              try {
                if (state.completed_at) {
                  if (Object.keys(settings).length > 0) await setAutomationSettings(settings);
                } else {
                  await completeOnboarding({
                    automatic_verification_enabled: state.automatic_verification_enabled,
                    ...settings,
                  });
                }
                if (state.flow_version === 2) await completeOnboardingFlow();
                track("onboarding_complete", {
                  learned: state.learned.length,
                  applied: state.has_applied,
                });
                router.push("/dashboard");
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "Could not finish setup.");
              }
            }}
          />
          </>
        );
    }
  };

  return <StartFlowProvider state={state}>{renderStep()}</StartFlowProvider>;
}
