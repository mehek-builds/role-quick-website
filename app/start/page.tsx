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
  attachMonitoredJob,
  completeOnboarding,
  completeOnboardingFlow,
  createGuestSession,
  getApplicationProfile,
  getJob,
  getOnboardingState,
  getStoredEmail,
  getToken,
  LOGIN_REDIRECT_REASON,
  loginRedirectPath,
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
import { freshnessOf, hoursSinceSeen, type OnboardingMatch } from "@/lib/onboarding-match";
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
  /* THE ANSWERS THEMSELVES, not just how many. Kept because a student can now come BACK to this
     screen, and a revisit that shows an empty form has lost their work: the built `ask` carries the
     employer's questions with no answers on them, so seeding from it alone blanks everything they
     typed and disables the save button they came to press. */
  const [answersGiven, setAnswersGiven] = useState<{ question: string; answer: string }[]>([]);
  /* The screen the student stepped BACK to, if any. It overrides the server's answer for as long
     as they are there and is cleared on return, so the flow itself never moves: the ledger still
     says where they actually are, and coming back is a trip rather than a rewind. */
  const [revisiting, setRevisiting] = useState<OnboardingStep | null>(null);
  /* Whether the review screen SENT or saved for later. The trial screen opens on the student's own
     last action, and that screen offers both, so asserting "Sent." was a false statement about
     what they had just done whenever they chose the other one. */
  const [applicationSent, setApplicationSent] = useState(false);
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
  // Guards the job-first guest bootstrap below against firing twice: React 18 dev StrictMode
  // mounts, tears down, and re-mounts effects, and getToken() still reads null on the second
  // mount because the first createGuestSession call has not resolved yet.
  const guestBootstrapStarted = useRef(false);
  // The signed-in twin of guestBootstrapStarted, and a separate ref on purpose: the two branches
  // guard different requests, and sharing one flag would let a StrictMode re-mount that took the
  // guest path first silently swallow the signed-in attach (or the reverse).
  const jobAttachStarted = useRef(false);
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

  /* The synchronous setters in this effect construct a localhost-only QA fixture after inspecting
     window.location. Production takes the asynchronous server path below. Keeping this exception
     at the fixture boundary makes the intentional client-only initialization explicit. */
  /* eslint-disable react-hooks/set-state-in-effect */
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
          /* Both cut screens. The fixture keeps the keys rather than dropping them so a reviewer
             reading this file sees the answer is NO rather than an omission, and so a stale client
             pointed at this fixture cannot read a missing field as a screen it should render. */
          includes_gaps_step: false,
          /* The QA flow is the TEN-step one: a student whose first employer did not ask about work
             eligibility, and who therefore still walks the work-visa screen. Nine is the other flow
             and it is pinned in tests/start-rail-denominator.test.mjs, where the fixture can vary. */
          includes_sponsorship_step: true,
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
      /* JOB-FIRST ENTRY: a /browse-jobs tile links straight here as `/start?job=<id>` rather than
         through /login, because the whole point of that click is speed to the tailored resume for
         THAT posting. window.location.search rather than useSearchParams for the same reason the
         QA bypass above reads it that way: this runs once, inside an effect, and a search-params
         hook would require wrapping the page in a Suspense boundary for one param read here.
         Anyone without a `job` param falls through to the ordinary redirect unchanged. */
      const jobId = new URLSearchParams(window.location.search).get("job");
      if (jobId) {
        // Guards against acting on this request after the component has unmounted - navigating
        // away from /start before createGuestSession resolves must not rewrite the URL bar out
        // from under whatever page is showing, or call setState/refresh on a gone component.
        // Declared for every mount (including a StrictMode re-mount below) so each has its own
        // cleanup, even though only the first actually starts a request.
        let cancelled = false;
        // Guards against React 18 dev StrictMode's mount/teardown/re-mount firing this twice:
        // getToken() still reads null on the second mount because the first createGuestSession
        // call has not resolved yet, so without this a second guest-creation request would fire
        // right alongside it.
        if (!guestBootstrapStarted.current) {
          guestBootstrapStarted.current = true;
          void createGuestSession(jobId).then((result) => {
            if (cancelled) return;
            if (!result.ok) {
              setError(result.error);
              return;
            }
            // Clears the id from the URL so a later reload of this same tab (bookmarked, or the
            // back button) does not re-read it - the account already carries the pin server-side
            // now, in pinned_target_job_id, which is the durable copy.
            window.history.replaceState(null, "", "/start");
            void refresh();
          });
        }
        return () => {
          cancelled = true;
        };
      }
      router.replace(loginRedirectPath(LOGIN_REDIRECT_REASON.SIGNIN_REQUIRED));
      return;
    }
    /* JOB-FIRST ENTRY, SIGNED IN. The same /start?job=<id> click as the guest branch above, from
       an account that already has a session - the strong-match email lands here too, and its
       promise is the full posting and an apply-ready packet. Until this branch existed the param
       was simply dropped: the ordinary flow below bounced a finished account to /dashboard and
       the job in the link was lost (measured live 2026-08-28). The backend attaches the posting
       to the account - the existing application for it when one exists, otherwise a new one built
       through the same pipeline as onboarding's build step - and the student lands selected on
       exactly that application. Same one-shot ref guard and same cancellation rule as the guest
       branch, for the same StrictMode and unmount reasons recorded there. */
    const attachJobId = new URLSearchParams(window.location.search).get("job");
    if (attachJobId) {
      let cancelled = false;
      if (!jobAttachStarted.current) {
        jobAttachStarted.current = true;
        void attachMonitoredJob(attachJobId).then((result) => {
          if (cancelled) return;
          if (!result.ok) {
            /* A 404 means the POSTING is gone, not that anything about the account needs fixing:
               boards rotate ids and purge closed rows daily, so a tile rendered hours ago can
               name a row that no longer exists. Parking the student on that sentence with a
               retry button is a dead end - no retry brings the row back (measured live
               2026-08-31: "Job not found" over an otherwise empty page). Rejoining /start
               without the param re-runs this whole decision tree cleanly: a finished account
               lands on /dashboard, an unfinished one continues onboarding from its own step.
               location.replace rather than the router so the dead param URL also leaves the
               history - the back button must not re-run the attach against the same gone id. */
            if (result.jobGone) {
              window.location.replace("/start");
              return;
            }
            setError(result.error);
            return;
          }
          router.replace(`/dashboard/applications?application=${encodeURIComponent(result.applicationId)}&intent=apply`);
        });
      }
      return () => {
        cancelled = true;
      };
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
  /* eslint-enable react-hooks/set-state-in-effect */

  // Set only when loading the PINNED job (job-first entry) fails. Kept apart from the general
  // `error` state above because that one has its own top-level "no state yet" rendering path,
  // and this failure is local to one step and needs its own retry rather than a full-page one.
  const [pinnedJobError, setPinnedJobError] = useState<string | null>(null);
  /* Set once the student presses "Show me a different one" while building against a pinned job.
     Without this, clearing chosenMatch just satisfies the effect below's guard again, which
     re-fetches the SAME pinned job and hands it straight back to BuildStep - the exact dead end
     onPickAnother exists to avoid (BuildStep's own doc comment: "the way out of a build that
     cannot succeed for THIS posting no matter how many times it is retried"). Once declined, the
     "match" case below falls through to the ordinary MatchStep instead, which is the only source
     of a genuinely DIFFERENT posting there is. Never reset back to false: once a student has left
     the pinned job behind for this sitting, a later poll tick must not silently pull them back. */
  const [pinnedJobDeclined, setPinnedJobDeclined] = useState(false);
  // Prevents a second GET /jobs/:id for the same job while one is already in flight - see the
  // effect below for how more than one could otherwise fire.
  const pinnedJobFetchInFlight = useRef(false);
  /* THE JOB-FIRST SHORTCUT PAST THE MATCH SCREEN'S OWN ALGORITHM.
   *
   * An ordinary account reaches 'match' and MatchStep fetches a ranked posting itself. A
   * job-first account already told Litos which posting it wants, by clicking it on
   * /browse-jobs, so re-running the algorithm here would silently substitute a different job for
   * the one the student came for. loadPinnedJob fetches THAT job directly and hands it to
   * BuildStep the same way MatchStep's own "yes, build this" would, skipping MatchStep's screen
   * entirely rather than rendering it and immediately auto-advancing - a screen that flashes and
   * vanishes is not a lower-friction version of not showing it.
   *
   * A stable callback rather than inline effect logic, so the retry button below can call it
   * directly - the same "call the loader again" idiom loadProfile already uses elsewhere in this
   * file, rather than a second, novel retry mechanism living only here. */
  const loadPinnedJob = useCallback(async (jobId: string) => {
    if (pinnedJobFetchInFlight.current) return;
    pinnedJobFetchInFlight.current = true;
    setPinnedJobError(null);
    try {
      const job = await getJob(jobId);
      setChosenMatch({
        job,
        freshness: freshnessOf(job),
        hoursSinceSeen: hoursSinceSeen(job.first_seen_at),
        widened: false,
      });
    } catch (reason) {
      setPinnedJobError(reason instanceof Error ? reason.message : "Could not load that job.");
    } finally {
      pinnedJobFetchInFlight.current = false;
    }
  }, []);
  const pinnedJobStep = state?.step;
  const pinnedJobId = state?.pinned_target_job_id;
  useEffect(() => {
    if (pinnedJobStep !== "match" || chosenMatch || pinnedJobDeclined || !pinnedJobId) return;
    // Same nested-async idiom loadProfile's own effect call uses elsewhere in this file: an
    // async function invoked directly here reads to the set-state-in-effect lint rule as this
    // effect body calling setState synchronously (loadPinnedJob's first line, before its own
    // await), even though nothing actually runs before the microtask queue turns.
    void (async () => {
      await loadPinnedJob(pinnedJobId);
    })();
    /* Depends on the PRIMITIVES the guard above actually reads, not the whole `state` object.
       refresh() (the install poll fires one every few seconds, per the comment two effects down)
       replaces `state` wholesale on every tick even when nothing relevant changed, which would
       otherwise re-run this effect - and re-fetch the same job - on every poll while parked here.
       loadPinnedJob's own in-flight ref is a second backstop, not a substitute: without primitive
       deps, a poll landing in the gap between this effect scheduling and the fetch actually
       starting could still queue a redundant call before the ref is set. */
  }, [pinnedJobStep, pinnedJobId, chosenMatch, pinnedJobDeclined, loadPinnedJob]);

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
  /* FINISHING A SCREEN THE STUDENT CAME BACK TO, which is not the same act as finishing it the
     first time and must not be handled as one.
   *
   * Every screen's own Continue acknowledges and refreshes. That is right going forward and wrong
   * on a revisit twice over: the ledger already holds this screen (acknowledging again is a write
   * that says nothing new), and `step` is `revisiting ?? served`, so refreshing alone leaves the
   * student standing on the screen they just finished with a button that appears to do nothing.
   *
   * So a revisit ends the way it began, by clearing the override, and the server's own answer
   * carries them back to wherever they actually were. Returns true when it handled the completion,
   * which is what lets each caller keep its ordinary forward path untouched. */
  const completedRevisit = useCallback(() => {
    if (revisiting === null) return false;
    track("onboarding_revisit_saved", { step: revisiting });
    setRevisiting(null);
    void refresh();
    return true;
  }, [revisiting, refresh]);
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
    return <BuildStep match={chosenMatch} onLater={later} onPickAnother={() => setChosenMatch(null)} onQuestions={setBuilt} />;
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
              if (completedRevisit()) return;
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
              if (completedRevisit()) return;
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
              /* A revisit still reloads the parsed profile, because a re-uploaded resume changes it.
                 It just does not acknowledge or advance. */
              const cameBack = revisiting !== null;
              /* Returned rather than voided: a clean parse now advances without rendering the recap,
                 and ResumeStep needs to know whether the advance landed. `false` is its cue to fall
                 back to the recap so the student keeps a control next to the error banner. */
              return (async () => {
                if (!cameBack && hasFlowLedger(state)) await acknowledgeOnboardingFlowStep("resume", "continued", state.flow_version);
                const s = await refresh();
                if (s.has_resume) await loadProfile();
                if (cameBack) { track("onboarding_revisit_saved", { step: "resume" }); setRevisiting(null); }
                /* A refresh that still serves "resume" did not advance, whatever the requests said.
                   Reporting it as an advance would leave the auto-advancing upload on a spinner
                   forever, because the screen it is waiting to be unmounted by never changes. A
                   revisit is the exception: it returns to the step the student came from, which the
                   cleared override restores on its own. */
                return cameBack || s.step !== "resume";
              })().catch((reason) => {
                setError(reason instanceof Error ? reason.message : "Could not continue.");
                return false;
              });
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
          if (state.pinned_target_job_id && !pinnedJobDeclined) {
            return (
              <div className="mx-auto max-w-2xl px-6 py-16">
                <StepRail current="match" />
                {pinnedJobError ? (
                  <div className="mt-10">
                    <ErrorNote message={pinnedJobError} />
                    <button
                      type="button"
                      onClick={() => void loadPinnedJob(state.pinned_target_job_id!)}
                      className="mt-4 min-h-11 text-sm text-brand-ink underline underline-offset-4"
                    >
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
          return <MatchStep onLater={later} onBuild={setChosenMatch} />;
        }
        return (
          <BuildStep
            match={chosenMatch}
            onLater={later}
            /* Clearing the match is what returns this case to the match screen, which is the same
               route a student takes when they press "Show me a different one" there. For a
               job-first build, clearing alone would just re-satisfy loadPinnedJob's effect guard
               and hand the SAME posting straight back - so declining is recorded first, which is
               what routes the fallthrough above to the ordinary MatchStep instead. */
            onPickAnother={() => {
              if (state.pinned_target_job_id) setPinnedJobDeclined(true);
              setChosenMatch(null);
            }}
            onQuestions={(result) => {
              setBuilt(result);
              stepDone("match");
              /* A SCREEN WITH NOTHING TO ASK IS NOT A SCREEN, so it is acknowledged here rather
                 than shown.
               *
                 QuestionsStep has always carried an empty branch reading "<Employer> asks nothing
                 Litos cannot answer" above a single Continue, and its own comment called that
                 branch unreachable "because the build screen sends the student straight to review".
                 It never did: this handler acknowledged `match` alone, so the server served
                 `questions` next whether or not any existed, and a student whose posting asked
                 nothing extra was shown a screen that told them so and charged them a click for it.
                 Caught by walking the flow for screenshots on 2026-08-20.
               *
                 The step is ACKNOWLEDGED, not removed: the rail still counts it and marks it done,
                 which is both true - Litos answered everything the employer asked - and the only
                 way to skip it without the total shrinking underneath somebody standing on step 3,
                 which is the failure #616 exists for. */
              const nothingToAsk = result.outstandingQuestions === 0;
              void (async () => {
                await ack("match");
                if (nothingToAsk) await ack("questions");
                await refresh();
              })().catch(fail);
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
            /* What they answered last time, replayed onto the employer's questions. Only matters on
               a revisit: the first time through this is empty and the screen is the blank form it
               has always been. */
            given={answersGiven}
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
              setAnswersGiven(answers);
              stepDone("questions");
              if (completedRevisit()) return;
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
            answersSaved={answersGiven.length}
            fieldsAnswered={built?.totalQuestions ?? 0}
            onSent={() => { setApplicationSent(true); stepDone("review"); void ack("review").then(refresh).catch(fail); }}
            onSaveForLater={() => { setApplicationSent(false); stepDone("review"); void ack("review").then(refresh).catch(fail); }}
          />
        );

      case "trial":
        return (
          <TrialStep sent={applicationSent} onContinue={() => { stepDone("trial"); void ack("trial").then(refresh).catch(fail); }} />
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
