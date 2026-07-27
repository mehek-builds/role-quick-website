"use client";

/* /start - onboarding.
 *
 * The thesis: the first application IS the onboarding. Nobody fills in a citizenship field
 * because a settings page asked; they fill it in because a job they want is asking. So we stop
 * asking and watch one real application instead, and everything after it takes seconds.
 *
 * PRD-v2 Section 4D splits every field into three buckets. Bucket 1 ("auto-extract, no ask") is
 * what the resume gives us at step 01. Bucket 3 ("always ask, never attempt extraction") is
 * citizenship, DOB, salary, availability - exactly the questions that are invasive cold and
 * ordinary on an application - so they are harvested at step 03 rather than asked here.
 *
 * Which leaves targeting: the only thing an application cannot teach us, because it is about the
 * next hundred postings rather than the one in front of them. Its five questions split on whether
 * they need the resume: category and type do not, so they open the flow at step 00 (where they
 * cost one tap and earn the upload some goodwill); titles and periods are derived from the parse,
 * so they close it at step 05.
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
import { track } from "@/lib/analytics";
import { DoneStep, FocusStep, GapsStep, InstallStep, ResumeStep, TargetStep } from "@/components/start/steps";
import { BaseResumeStep } from "@/components/start/BaseResumeStep";
import { focusSeed } from "@/lib/rolesFeed";
import type { RoleType } from "@/lib/api";
import { StepRail } from "@/components/start/ui";

// An autofill_event is proof of install because only a running extension can POST one, so we poll
// for it while the student is off applying.
//
// NOTE, corrected 2026-07-26: an older comment here claimed the web app "cannot see the extension
// (no externally_connectable)". That has not been true for some time - wxt.config.ts declares
// externally_connectable for trylitos.com - so a direct handshake is available and would let this
// screen advance the moment the extension is installed, rather than waiting for a whole
// application to complete. The poll stays as the fallback for the case it also covers (the student
// applied on a portal the extension does not support), but it should no longer be the only signal.
//
// Backs off 5s -> 30s. The event we are waiting for lands somewhere inside a ~12-minute
// application, so 5s granularity is only useful for the first few seconds and is pure waste after
// that. It is not free waste either: /onboarding/state is the heaviest read in the API (six
// queries plus the auth check), and on Vercel the pool is max:1 per instance, so those six run
// SERIALLY down one connection - six network round-trips to Neon per poll. At a flat 5s, a
// thousand students sitting on this screen is ~200 req/s of polling alone; backing off cuts that
// to ~33 req/s at the tail for a delay nobody can perceive against a 12-minute form.
const POLL_START_MS = 5000;
const POLL_MAX_MS = 30000;

export default function Start() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [profile, setProfile] = useState<ParsedProfile | null>(null);
  // Only the base step needs this, and only to fill the resume's contact line. Most of it is still
  // empty at this point in the flow (harvest has not run yet), which is correct rather than a bug:
  // the contact line fills in as the first application teaches us, and the student can see that.
  const [appProfile, setAppProfile] = useState<ApplicationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Client-side sub-step: the backend's "install" step covers both installing and applying,
  // since it cannot tell them apart. The click is the only signal we get.
  const [clickedInstall, setClickedInstall] = useState(false);
  // Same shape: gaps are optional, so skipping them cannot be expressed as server state without
  // inventing a "declined" flag per field. The backend keeps deriving 'gaps' while any are
  // empty, so the choice to move on lives here, for this session.
  const [skippedGaps, setSkippedGaps] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calibration handoff: the homepage card saved hunt/field in
  // localStorage (litos.profile.v1). Seed the Focus step so its taps
  // arrive pre-answered; unlike query params this survives the login
  // round-trip. Computed once; FocusStep only renders after the state
  // fetch resolves, so there is no SSR/hydration divergence.
  // Set once, alongside the QA state stub below, so the base step can replay a canned build.
  const [qaDemo, setQaDemo] = useState(false);

  const [calibSeed] = useState<{
    categories: string[];
    roleTypes: RoleType[];
  } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("litos.profile.v1");
      if (!raw) return null;
      const p = JSON.parse(raw) as { hunt?: string; field?: string };
      const s = focusSeed(p.hunt ?? "", p.field ?? "");
      return s
        ? { categories: s.categories, roleTypes: s.roleTypes as RoleType[] }
        : null;
    } catch {
      return null;
    }
  });

  const refresh = useCallback(async () => {
    const s = await getOnboardingState();
    setState(s);
    return s;
  }, []);

  useEffect(() => {
    // Same localhost-only QA bypass the dashboard uses (?qa=1&step=resume), so every step of the
    // flow can be opened and reviewed without a live account. Never reachable in production.
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("qa")) {
        const state: OnboardingState = {
          step: (params.get("step") as OnboardingStep) ?? "focus",
          completed_at: null,
          has_focus: true,
          has_resume: true,
          has_base_resume: false,
          has_applied: false,
          has_targeting: false,
          learned: [],
          gaps: ["gpa", "gpa_scale", "major", "languages"],
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
          target_roles: ["Software Engineer", "Product Engineer"],
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
          setProfile(await api<ParsedProfile>("/profile").catch(() => null as unknown as ParsedProfile));
          setAppProfile(await getApplicationProfile().catch(() => null));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your setup.");
      }
    })();
  }, [router, refresh]);

  // Poll only while they are off applying. Anything else is a wasted request.
  useEffect(() => {
    const applying = state?.step === "install" && clickedInstall;
    if (!applying) return;

    let delay = POLL_START_MS;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      // A backgrounded tab is a student who is off filling the form in another tab - which is
      // exactly when we are waiting, but also when nobody is looking at this screen. Skip the
      // request and re-check on the next tick rather than polling a hidden page.
      if (typeof document !== "undefined" && document.hidden) {
        timer.current = setTimeout(tick, delay);
        return;
      }
      try {
        const s = await refresh();
        if (s.step !== "install") return; // moved on; the effect tears down
      } catch {
        /* transient; keep polling */
      }
      delay = Math.min(delay * 2, POLL_MAX_MS);
      timer.current = setTimeout(tick, delay);
    };

    timer.current = setTimeout(tick, delay);
    // Coming back to the tab is a strong signal they just finished, so check immediately and
    // reset the backoff rather than making them wait out a 30s tail.
    const onVisible = () => {
      if (document.hidden || stopped) return;
      delay = POLL_START_MS;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(tick, 0);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state?.step, clickedInstall, refresh]);

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
      </div>
    );
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <StepRail current="focus" />
        <div className="rq-shimmer mt-10 h-9 w-2/3 rounded-full" />
        <div className="rq-shimmer mt-6 h-32 rounded-inner" />
      </div>
    );
  }

  switch (state.step) {
    case "focus":
      return (
        <FocusStep
          seed={calibSeed}
          onLater={later}
          onDone={() => {
            stepDone("focus");
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
              if (s.has_resume) {
                setProfile(await api<ParsedProfile>("/profile").catch(() => null as unknown as ParsedProfile));
                setAppProfile(await getApplicationProfile().catch(() => null));
              }
            })();
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
          demo={qaDemo}
          onLater={later}
          onDone={() => {
            stepDone("base");
            void refresh();
          }}
        />
      );

    case "install":
    case "apply":
      return (
        <InstallStep
          phase={clickedInstall ? "apply" : "install"}
          onInstalled={() => {
            // Install and apply are one backend step, so the click is the only boundary we can
            // see. Without it, a student who installs and then abandons the application is
            // indistinguishable from one who never installed - and those need different fixes.
            stepDone("install");
            track("onboarding_step_view", { step: "apply" });
            setClickedInstall(true);
          }}
          onLater={later}
        />
      );

    case "gaps":
      // Saving gaps usually empties them, which re-derives 'targeting' on its own. Skipping
      // does not, so the flag carries them forward rather than looping on this screen.
      if (skippedGaps) {
        return (
          <TargetStep
            gradYear={profile?.grad_year ?? 0}
            suggestedTitles={profile?.target_roles ?? []}
            onLater={later}
            onDone={() => void refresh()}
          />
        );
      }
      return (
        <GapsStep
          gaps={state.gaps}
          onLater={later}
          onDone={(skipped) => {
            track(skipped ? "onboarding_step_skip" : "onboarding_step_done", {
              step: "gaps",
              fields: state.gaps.length,
            });
            setSkippedGaps(true);
            void refresh();
          }}
        />
      );

    case "targeting":
      return (
        <TargetStep
          gradYear={profile?.grad_year ?? 0}
          suggestedTitles={profile?.target_roles ?? []}
          onLater={later}
          onDone={() => {
            stepDone("targeting");
            void refresh();
          }}
        />
      );

    case "done":
      return (
        <>
        {error && <div className="mx-auto mb-4 max-w-2xl px-6"><ErrorNote message={error} /></div>}
        <DoneStep
          state={state}
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
