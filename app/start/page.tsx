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
import { RevisitProvider, StartFlowProvider, StepRail } from "@/components/start/ui";
import { RecentExperienceStep } from "@/components/start/RecentExperienceStep";
import { deferOnboardingForSession } from "@/lib/onboarding-flow";
import { saveOnboardingAnswers } from "@/lib/api";
import { MatchStep } from "@/components/start/MatchStep";
import { BuildStep } from "@/components/start/BuildStep";
import { QuestionsStep } from "@/components/start/QuestionsStep";
import { ReviewStep } from "@/components/start/ReviewStep";
import { TrialStep } from "@/components/start/TrialStep";
import { NotificationsStep } from "@/components/start/NotificationsStep";
import { PlanStep } from "@/components/start/PlanStep";
import type { OnboardingMatch } from "@/lib/onboarding-match";
import type { BuildResult } from "@/lib/onboarding-build";

/* Whether this account's flow is one the acknowledgement ledger exists for.
 *
 * This was ten hardcoded `state.flow_version === 2` checks, and the roles-first reorder bumped the
 * server to 3. Every one of them would have gone quietly false: the screens would still render and
 * still advance, and not one acknowledgement would ever be written, so the ledger would sit empty
 * while looking healthy. A >= test is the honest shape of the question, because the ledger arrived
 * in version 2 and no later version removes it. */
function hasFlowLedger(state: OnboardingState): state is OnboardingState & { flow_version: number } {
  return typeof state.flow_version === "number" && state.flow_version >= 2;
}

export default function Start() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  /* THE APPLICATION SEQUENCE'S IN-MEMORY HANDOFF.
     match -> build -> questions -> review each need what the screen before produced, and none of it
     is worth a column: the packet, the resume and the answers are all already persisted server-side
     by the calls those screens make. What is held here is only the pointer between screens for this
     sitting. A reload mid-sequence therefore lands the student back on the step the LEDGER says
     they are on with nothing carried over, which is why each screen re-reads what it needs rather
     than assuming this state survived. */
  const [chosenMatch, setChosenMatch] = useState<OnboardingMatch | null>(null);
  const [built, setBuilt] = useState<BuildResult | null>(null);
  const [answersGiven, setAnswersGiven] = useState(0);
  /* The screen the student stepped BACK to, if any. It overrides the server's answer for as long
     as they are there and is cleared on return, so the flow itself never moves: the ledger still
     says where they actually are, and coming back is a trip rather than a rewind. */
  const [revisiting, setRevisiting] = useState<OnboardingStep | null>(null);
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
          /* The application sequence is part of the QA flow too, so the rail counts the six and a
             reviewer can open any of them directly with ?qa=1&step=match. */
          includes_application_steps: true,
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

  /* Acknowledging an application-sequence screen. Thin on purpose: every one of the six advances
     the same way, and repeating the ternary six times is how the ten hardcoded flow_version checks
     happened. `hasFlowLedger` is the same guard the setup screens use, so a backend without the
     ledger simply advances on its own derivation instead of erroring. */
  const ack = useCallback(
    (step: Parameters<typeof acknowledgeOnboardingFlowStep>[0]) =>
      hasFlowLedger(state!) ? acknowledgeOnboardingFlowStep(step, "continued", state!.flow_version) : Promise.resolve(),
    [state],
  );
  /* Rejoining the sequence after a reload, which drops the per-sitting handoff.
   *
   * Routes on WHAT IS MISSING rather than always restarting: no match means pick one, a match
   * without a build means build it. Restarting from the match screen in both cases is what
   * produced a loop with no exit, because picking a match never fills in the build.
   *
   * Rebuilding does spend another tailored generation, and that is the honest cost of a reload
   * mid-sequence: the alternative is carrying a packet the student cannot see and cannot check. */
  const resumeSequence = useCallback(() => {
    if (!chosenMatch) return <MatchStep onLater={later} onBuild={setChosenMatch} />;
    return <BuildStep match={chosenMatch} onLater={later} onQuestions={setBuilt} />;
  }, [chosenMatch, later]);

  const fail = useCallback(
    (reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not continue."),
    [],
  );
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
    /* A revisit overrides the server's answer, and only for as long as the student is there. The
       ledger is untouched, so "where they actually are" survives the trip and the return lands them
       back on it rather than replaying the flow forward. */
    const served: OnboardingStep = state.step === "gaps" && gapsHandled ? "done" : state.step;
    const step: OnboardingStep = revisiting ?? served;
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
        /* NO RESUME REDIRECT HERE ANY MORE, and its removal is the whole reorder.
         *
         * This case used to answer `focus` with the upload screen whenever `has_resume` was false,
         * which was correct while the resume came first: a state response saying "focus" without a
         * resume could only be a stale mixed-version read. Under the roles-first contract that is
         * the NORMAL state of every new account, and leaving the redirect in place would show the
         * upload screen under a rail reading "Your roles" to literally everyone.
         *
         * The reorder is safe in the other direction too. An OLDER backend answers `resume` first,
         * and that case still renders the upload, so a rolling deploy degrades to the old order
         * rather than to a broken screen. */
        if (state.has_resume && !profile) {
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
              void (hasFlowLedger(state) ? acknowledgeOnboardingFlowStep("focus", "continued", state.flow_version) : Promise.resolve()).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
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
              void (hasFlowLedger(state) ? acknowledgeOnboardingFlowStep("sponsorship", "continued", state.flow_version) : Promise.resolve()).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
            }}
          />
        );

      case "resume":
        if (hasFlowLedger(state) && state.has_resume && !state.flow_completed && parsedProfileStatus !== "ready") {
          return parsedProfileGate();
        }
        return (
          <ResumeStep
            savedProfile={hasFlowLedger(state) && state.has_resume && state.flow_completed === false ? profile : undefined}
            onLater={later}
            onDone={() => {
              stepDone("resume");
              void (async () => {
                if (hasFlowLedger(state)) await acknowledgeOnboardingFlowStep("resume", "continued", state.flow_version);
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
              void (hasFlowLedger(state) ? acknowledgeOnboardingFlowStep("impact", "continued", state.flow_version) : Promise.resolve()).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
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
              void (hasFlowLedger(state) ? acknowledgeOnboardingFlowStep("base", "continued", state.flow_version) : Promise.resolve()).then(refresh).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
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
                if (hasFlowLedger(state)) await acknowledgeOnboardingFlowStep("gaps", skipped ? "skipped" : "continued", state.flow_version);
                void refresh();
              })().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not continue."));
            }}
          />
        );

      // An older backend may briefly return one of the removed steps during a rolling deploy. Treat
      // it as ready rather than sending the student through the deleted extension and sample-form
      // detour until the next state refresh reaches the new backend.
      /* ── THE APPLICATION SEQUENCE ──────────────────────────────────────────
         Each screen acknowledges itself on the way out, and the ledger is what advances the flow.
         Acknowledging means SEEN: declining a match or saving a packet for later still moves on,
         because the alternative is a student parked forever on a screen they have answered. */
      /* ONE STEP, TWO PHASES. The match screen shows the posting and asks; pressing Build keeps
         the student on the same step number while the packet is made. `build` used to be a step of
         its own, which made the rail count a transition rather than a decision. The step is
         acknowledged once, when the build lands and the student moves on. */
      case "match":
        if (!chosenMatch) {
          return <MatchStep onLater={later} onBuild={setChosenMatch} />;
        }
        return (
          <BuildStep
            match={chosenMatch}
            onLater={later}
            onQuestions={(result) => {
              setBuilt(result);
              stepDone("match");
              void ack("match").then(refresh).catch(fail);
            }}
          />
        );

      case "questions":
        /* Both halves matter, and getting this wrong was a trap worth naming. Falling back to the
           match screen whenever `built` was missing produced a loop with no exit: picking a match
           sets `chosenMatch` and leaves `built` null, so the very next render fell back to the
           match screen again, forever. `resumeSequence` routes on what is actually missing. */
        if (!built || !chosenMatch) return resumeSequence();
        return (
          <QuestionsStep
            company={chosenMatch.job.company_name}
            questions={built.ask}
            alreadyAnswered={built.alreadyAnswered}
            onLater={later}
            onSaved={async (answers) => {
              /* THE WRITE THAT WAS MISSING. This screen used to count the answers and discard them,
                 so a student answered a real employer's questions into nothing. The save also
                 decides whether the work-visa screen appears at all: when the posting asked both
                 halves, the server records the declaration for that posting's country and the
                 refresh below returns a flow without that step. */
              await saveOnboardingAnswers({
                job_id: chosenMatch.job.id,
                company: chosenMatch.job.company_name,
                answers,
              });
              setAnswersGiven(answers.length);
              stepDone("questions");
              await ack("questions");
              await refresh();
            }}
          />
        );

      case "review":
        if (!chosenMatch || !built) return resumeSequence();
        return (
          <ReviewStep
            posting={chosenMatch.job}
            applicationId={built?.applicationId ?? null}
            resumeSpec={built?.resumeSpec ?? null}
            educationProfile={profile}
            answersSaved={answersGiven}
            fieldsAnswered={built?.totalQuestions ?? 0}
            onSent={() => { stepDone("review"); void ack("review").then(refresh).catch(fail); }}
            onSaveForLater={() => { stepDone("review"); void ack("review").then(refresh).catch(fail); }}
          />
        );

      case "trial":
        return (
          <TrialStep onContinue={() => { stepDone("trial"); void ack("trial").then(refresh).catch(fail); }} />
        );

      case "notifications":
        /* 08, between the gift and the price. It needs nothing from the sitting: the two answers
           are account facts, so unlike `build` and `questions` a reload lands here and simply
           works rather than having to rejoin the sequence. */
        return (
          <NotificationsStep
            onLater={later}
            onDone={() => { stepDone("notifications"); void ack("notifications").then(refresh).catch(fail); }}
          />
        );

      case "plan":
        /* Paying navigates to Stripe from inside PlanStep and returns to /start, so the
           screen never acknowledges itself on the way out. This callback is what closes
           that loop on the way back in: PlanStep fires it once it reads an entitlement
           that already holds Litos+. It is NOT a way to decline: the free-escape link is
           gone, and there is no path past this screen without a card. */
        return (
          <PlanStep onSettled={() => { stepDone("plan"); void ack("plan").then(refresh).catch(fail); }} />
        );

      case "install":
      case "apply":
      case "targeting":
      case "done":
      /* AN UNKNOWN STEP RENDERS THE DONE SCREEN RATHER THAN NOTHING.
       *
       * Without this the switch has no exhaustive arm, so a step name this build does not know
       * matches no case, renderStep() returns undefined, and /start is a BLANK PAGE. That is not
       * hypothetical: both repos deploy to production on merge, so every backend change that adds
       * a step is a window in which the live website is one deploy behind and every account
       * reaching the new step sees nothing at all. It made the application sequence a
       * website-must-ship-first change, and the PR description for it got that order backwards
       * once already.
       *
       * The done screen is the right fallback rather than an error: an unknown step means this
       * build cannot advance the flow, and the honest thing to offer someone in that position is
       * the exit, with everything they have done already saved. */
      default:
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
                if (hasFlowLedger(state)) await completeOnboardingFlow(state.flow_version);
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

  return (
    <StartFlowProvider state={state}>
      <RevisitProvider
        value={{
          revisiting,
          onRevisit: (target) => { track("onboarding_revisit_opened", { step: target }); setRevisiting(target); },
          onReturn: () => { setRevisiting(null); void refresh(); },
        }}
      >
        {renderStep()}
      </RevisitProvider>
    </StartFlowProvider>
  );
}
