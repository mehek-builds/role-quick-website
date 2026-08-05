"use client";

import { Button } from "@/components/app/Button";
import { Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  api,
  ApiError,
  getStoredEmail,
  type ApplicationQuestion,
  type ApplicationProfile,
  type ApplicationReview,
  type CoverLetter,
  type GeneratedResume,
  type JobsPage,
  type MonitoredJob,
  type ResumeSpec,
} from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, PendingLabel, ShimmerRows, TerminalActionBar, formatRelativeDate } from "@/components/app/ui";
import { ThinkingOrb } from "thinking-orbs";
import { explicitTerms, mergeDiscoveredQuestions, portalName, reviewablePackets as onlyReviewablePackets, screenForStatus, sectionHeading, startsNewSection, statusLabel, stripMetadata } from "@/features/applications";
import { applicationFilterFromSearch, applicationFilterHeading, ledgerRendersOnLanding, reviewCanBeSent, statusMatchesApplicationFilter, type ApplicationFilter } from "@/features/applications";
import { canGenerateFrom, nextPreferredReadyPacket, packetMatchesJob } from "@/features/applications";
import { isHttpsJobUrl, missingApplicationFields, type ApplicationDraftField } from "@/features/applications";
import { MatchScore, MatchGaps } from "@/components/app/MatchScore";
import { nextMatchScoreRequest } from "@/features/applications";
import { getBaseResume } from "@/lib/base-resume";
import { RequirementBreakdown } from "@/components/app/RequirementBreakdown";
import { ResumeHealth } from "@/components/app/ResumeHealth";
import { Board } from "@/components/app/Board";
import { SectionBoundary } from "@/components/app/SectionBoundary";
/* contactName and contactLine, not a local read of `_contact`. They are the fourth and fifth
   readers of that record, and the two that already know its exact key names: the backend stores it
   verbatim from the resume request body, so "location" and "linkedin" resolve to nothing and fail
   silently after a .filter(Boolean). Sharing them is the reason this screen cannot drift from the
   packet pane the way it just did. */
import { ApplicationPacket, contactLine, contactName } from "@/components/app/ApplicationPacket";
import { ResumePaper } from "@/components/app/ApplicationPacket";
import { AutopilotLockNote, NextMatchCard, useAutopilot, type NextMatch } from "@/components/app/Autopilot";
import { InterviewPrep } from "@/components/app/InterviewPrep";
import { fetchJdMatch, resumeSpecText } from "@/features/applications";
import { applyBankVariant, type ApplyOutcome } from "@/features/applications";
import { RequirementProvider, RequirementText, MatchLegend } from "@/components/app/RequirementText";
import { buildRequirementIndex, EMPTY_REQUIREMENT_INDEX } from "@/features/applications";
import { educationDrift, educationDriftMessage, type EducationProfile } from "@/features/applications";
import type { JdMatchResponse, JobMatch } from "@/features/applications";
import { userFacingError } from "@/lib/user-facing-error";
import { track } from "@/lib/analytics";
import { replaceClosedComposerUrl } from "./composer-url";

type Screen = "review" | "questions" | "submitting" | "portal" | "submitted";
type ApplicationSort = "recent" | "company";
type SubmissionResponse = { application_id: string; review: ApplicationReview; cover_letter?: CoverLetter | null; handoff_url?: string; configured?: boolean };

type ResumeGenerationResponse = { resume_id: string; application?: GeneratedResume };
type CoverLetterResponse = { cover_letter: CoverLetter; download_url: string };
type ProfileIdentity = {
  full_name?: string;
  email?: string;
  school?: string;
  degree?: string;
  grad_date?: string;
  grad_year?: number;
  currently_enrolled?: boolean;
  coursework?: string[];
  school_location?: string;
};
type EducationProfileStatus = "loading" | "ready" | "failed";
type NewApplicationDraft = {
  company: string;
  role: string;
  portalUrl: string;
  jobDescription: string;
  /* Set only when the draft was opened from a posting on the jobs list. It is recorded on the
     application so that list can later mark this exact posting "Applied" instead of every posting
     sharing its company and title. Null for a hand-typed link, which points at no posting we
     watch, and the student can edit the company and role here anyway, so the id must not survive
     that and claim a row it no longer describes, which is why nothing below carries it over. */
  jobId: string | null;
};

const EMPTY_APPLICATION_DRAFT: NewApplicationDraft = {
  company: "",
  role: "",
  portalUrl: "",
  jobDescription: "",
  jobId: null,
};

/* A Suspense boundary over the useSearchParams read. DEFENSIVE, not required: this was first
   written down as "Next fails the build without it", and that was checked afterwards and is not
   true on the version this repo pins. Removing the wrapper with a wiped .next still builds, and
   this route is still prerendered.

   It stays because useSearchParams is the documented reason a route opts into client-side
   rendering, that behaviour has moved across Next majors, and the price is a fallback the page
   already showed while its own packets loaded. So the boundary is invisible here and it means a
   future upgrade cannot quietly turn the query read into a blank first paint. */
export default function ApplicationsPage() {
  return (
    <Suspense fallback={<ShimmerRows rows={4} />}>
      <Applications />
    </Suspense>
  );
}

function Applications() {
  const [packets, setPackets] = useState<GeneratedResume[] | null>(null);
  const [currentMatches, setCurrentMatches] = useState<MonitoredJob[] | null>(null);
  /* The student's education block as GET /profile serves it today. Status is separate from the
     profile object because null is not safe: a missing comparison cannot approve a real send. */
  const [educationProfile, setEducationProfile] = useState<EducationProfile | null>(null);
  const [educationProfileStatus, setEducationProfileStatus] = useState<EducationProfileStatus>("loading");
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /* The packet being looked at in the read-only viewer, held as an ID and resolved against `packets`
     at render. Separate from selectedId on purpose, so opening the viewer cannot put the page onto
     the review flow for a packet the user only wanted to LOOK at.

     It stored the packet OBJECT until review. That was wrong in a way that defeated the feature:
     every update in this file replaces packets immutably (`setPackets((current) => current?.map(
     ... ? { ...item, spec: { ...item.spec, _review: result.review } } : item))`), so the array got a
     new object and the captured one went stale. The board and the autopilot countdown both stay
     mounted behind the viewer, so an autopilot send landing while it was open left the screen
     insisting "Built ..., not sent" about an application that had just gone out. Deriving means the
     viewer follows the same data as the page, and closes itself if the packet leaves the window. */
  const [revisitingId, setRevisitingId] = useState<string | null>(null);
  const revisitingPacket = revisitingId ? (packets ?? []).find((item) => item.id === revisitingId) ?? null : null;
  /* Stable identity. The viewer's focus-trap effect keys on its onClose, and an inline arrow here
     gave it a new one on every render of this page: each parent commit tore the effect down and
     rebuilt it, which ran the cleanup's `previous?.focus?.()` and threw focus out of an open
     aria-modal dialog back onto the board behind it, then re-locked body scroll. A keyboard user
     reading the answers got yanked back to Close every time the autopilot ticked. */
  const closeRevisit = useCallback(() => setRevisitingId(null), []);
  // Mirrors selectedId for in-flight async work to compare against. State reads inside an awaited
  // callback are the value captured when the callback was created, which is exactly the stale value
  // a cross-packet race needs to go unnoticed.
  const selectedIdRef = useRef<string | null>(null);
  /* The poll reads the submission it is about to overwrite. A ref, not the state value, so the
     poll callback does not have to re-subscribe on every submission update. */
  const submissionRef = useRef<SubmissionResponse | null>(null);
  /* The posting we have already auto-generated for, so arriving from "Apply now" can never spend
     two resumes on one job. A ref, not state: it must be readable and writable within the same
     tick the effect runs in, before any re-render. */
  const autoGeneratedFor = useRef<string | null>(null);
  const capturedSubmissionIds = useRef(new Set<string>());
  const [spec, setSpec] = useState<ResumeSpec | null>(null);
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [screen, setScreen] = useState<Screen>("review");
  /* WHICH action put us on the "submitting" screen, which the status alone cannot tell us.
     The progress screen says one of two things, and the difference is the whole point of it:
     preparing the form is "nothing is sent yet", and approving is "sending it now". It read that
     off `submission.review.status`, but during an approve the status is still
     `ready_for_final_approval` for the entire duration of the request, because the only thing that
     updates it is the response we are waiting for. So the screen spent the whole send promising
     that nothing was being sent, which is the one moment the reassurance must not be wrong. */
  const [submittingPhase, setSubmittingPhase] = useState<"preparing" | "sending">("preparing");
  /* True from the moment "Send it" is pressed until the approve request settles.
     This is the guard on a REAL application going to a REAL employer twice, and it exists because
     the 2.5s submission poll is running the whole time. During an approve the server's status is
     still `ready_for_final_approval` (that is the premise of this whole change), and
     screenForStatus maps that to "portal", so the first poll tick used to take the student off the
     sending screen and back to SubmissionScreen with a live "Send it" button, roughly 2.5 seconds
     into every send that lasts longer than that. Nothing guarded a second press.
     A ref rather than state on purpose: it has to be readable synchronously by the poll and by a
     second click that lands in the same tick, before any re-render. */
  /* The application currently being approved, not a bare boolean. Page-level flags meant that
     sending A greyed out "Send it" on B with no explanation, and the guard that drops a second
     press would have dropped a legitimate press on a different application. */
  const approveInFlight = useRef<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  /* When the student pressed "Send it", so the progress clock measures the SEND rather than the
     review. It was anchored to `review.updated_at`, which is stamped when preparation finished, so
     a student who spent six minutes reading the packet before approving saw "6m 00s elapsed" and
     the "start the application again" milestone the instant their send actually began. */
  const [approveStartedAt, setApproveStartedAt] = useState<string | null>(null);
  /* Same idea for "Fill the form": the selected packet may still carry the timestamp from an older
     ready state while the fresh submit-request is in flight. The server now clears stale run fields
     too, but the screen is entered before that response returns, so the UI needs its own local
     click-time anchor. */
  const [prepareStartedAt, setPrepareStartedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* Null means the localhost-only fixture gate has not resolved yet. Treating that as false let
     authenticated effects fire during the first render of a QA page, and a 401 redirected the
     fixture to /login before it could verify anything. */
  const [qaMode, setQaMode] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);
  const [extractingJd, setExtractingJd] = useState(false);
  const [showNewApplication, setShowNewApplication] = useState(false);
  const [newApplication, setNewApplication] = useState(EMPTY_APPLICATION_DRAFT);
  /* ISSUE-040: the composer's own refusal, kept OUT of the page-level `error` on purpose.
     "Fill in all four boxes first." used to render in the banner above the composer, which on a
     723px viewport measured y = -281 while the button that raised it sat at y = 434: announced to a
     screen reader, invisible to everyone else, because the job description textarea alone is ~320px
     tall. It now renders beside the button and names the boxes it is about, so it is perceivable
     from where the action was taken without any scrolling or animation. One alert, not two.

     ISSUE-043 widened this from validation to EVERY message either composer button raises. The
     rule, drawn once so later call sites do not have to re-argue it:

       A message caused by pressing a button INSIDE the composer belongs beside that button.
       A message about the state of the PAGE belongs in the page banner.

     So the composer owns both of its buttons end to end: "Make my resume" (its two validation
     guards and the failure of /profile, /profile/application and /resume/generate) and "Read job"
     (its two URL guards and the failure of /jobs/extract). The banner keeps what the student did
     not ask for and cannot answer from the composer: the applications list failing to load, the
     preferences fetch failing, the autopilot sending on its own, and every control on the review
     screen, which is a different surface with its own geometry.

     Measured on production before the fix, with /resume/generate returning 500 on a filled form:
     the banner sat at y = -126 on a 1280x723 viewport and y = -195 on a 375x812 one while the
     button was on screen in both, and the failure ALSO moved scrollY (345 -> 413, 560 -> 628),
     pushing the banner further out of reach than the ISSUE-040 case it replaced.

     `fields` stays empty for anything the server did. A 500 is not the student mistyping, so
     marking the four boxes aria-invalid would be a lie about their input; an empty array renders
     the sentence and marks nothing, which `invalid()` in NewApplicationPanel gives for free.

     `at` is which of the composer's two buttons is being answered, and it exists because "inside
     the composer" was not close enough. The first cut of ISSUE-043 sent Read job's messages to the
     generate row, and the harness measured them at y = 979 on a 375x812 viewport with the Read job
     button at y = 554: off screen in the other direction, the same defect upside down. The two
     buttons are ~440px apart, so the composer needs two slots and not one. Exactly one is ever
     live, because `at` holds one value. */
  const [composerRefusal, setComposerRefusal] = useState<{ message: string; fields: ApplicationDraftField[]; at: ComposerSlot } | null>(null);
  /* One announcement, never two. The page banner and this alert are both live regions, so leaving a
     stale `error` up while raising a refusal makes a screen reader read the old problem and the new
     one. Everything that speaks for the composer goes through here and clears the other channel.

     KNOWN ASYMMETRY, accepted rather than overlooked: setError(null) is unconditional, so the
     composer always wins over the page. If the list failed to load and the banner reads "We could
     not load your applications. Reload the page.", the next composer press erases a fact that is
     still true. That is the opposite of the principle argued two comments up, applied in one
     direction only. It is accepted because every page-level error on this screen is reload advice
     the student can act on later, and the alternative is two live regions firing on a single press,
     which is the louder failure. If a page-level error ever appears here that is NOT reload advice,
     revisit this line rather than adding a second alert. */
  const refuseInComposer = useCallback((at: ComposerSlot, message: string, fields: ApplicationDraftField[]) => {
    setError(null);
    setComposerRefusal({ message, fields, at });
  }, []);
  const [pendingJob, setPendingJob] = useState<MonitoredJob | null>(null);
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
  const [coverLetterBody, setCoverLetterBody] = useState("");
  const [coverLetterDownloadUrl, setCoverLetterDownloadUrl] = useState<string | null>(null);
  const [coverLetterBusy, setCoverLetterBusy] = useState(false);
  /* ?state= IS the filter. Not a seed for it, the thing itself.
     Home's Overview metrics link here with it, and it has to work on the path a student actually
     takes, which is a click.

     This was `useState(() => applicationFilterFromSearch(window.location.search))`, under a comment
     saying it was read once at mount. Both halves of that were the bug (ISSUE-042). Measured in a
     driven browser against a stubbed backend: clicking Home's "5 stopped for you" banner runs this
     component's initialiser while `window.location.pathname` is still `/dashboard` and its search
     is still empty, because the App Router renders the incoming route inside a transition BEFORE it
     commits the new URL. So the read resolved to "all". Being a first-mount-only read, nothing
     re-ran it when the URL did land a moment later. A hard load worked, because there the URL is
     already correct when the component first renders, which is exactly why pasting the link and
     reloading both looked fine while all four Home controls were dead.

     useSearchParams is the router's own view of the query, so it is correct during that transition
     and it UPDATES, which a first-mount read cannot.

     THE URL IS THE SINGLE SOURCE OF TRUTH, deliberately, rather than mirroring the param into local
     state. Mirroring needs a "last seen param" to tell an arriving ?state= apart from a value the
     student just chose, and getting that wrong in either direction is silent: too eager and the
     select is stomped back on every render, too lazy and the deep link stops working again. There
     is no second copy to disagree here. It also buys three things the mirrored version cannot: the
     filtered view is shareable, it survives a reload, and Back returns to it. */
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const applicationFilter = applicationFilterFromSearch(searchParams.toString());
  /* Writes the choice back to the URL, so the select and the deep link move the same thing.
     Everything removes the parameter rather than writing state=all: a URL that says nothing is
     what a plain visit looks like, and this is also what closes the ledger section.
     scroll: false because this is a filter, not a navigation; the student is looking at the list
     they just filtered and must not be thrown to the top of the page. */
  const setApplicationFilter = useCallback((next: ApplicationFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("state");
    else params.set("state", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);
  const [applicationSort, setApplicationSort] = useState<ApplicationSort>("recent");

  const closeNewApplication = useCallback(() => {
    setShowNewApplication(false);
    setPendingJob(null);
    // A refusal about a form that is no longer open would greet the next student to open it.
    setComposerRefusal(null);

    replaceClosedComposerUrl(
      window.location,
      (data, unused, url) => window.history.replaceState(data, unused, url),
    );
  }, []);

  /* Mirror `submission` into the ref the poll reads. An effect keeps it correct for every path;
     approveFinalSubmission ALSO assigns it synchronously, because the window this guard closes is
     between the approve resolving and this effect running, and a poll can land inside it. */
  useEffect(() => {
    submissionRef.current = submission;
  }, [submission]);

  const captureCompletedSubmission = useCallback((result: SubmissionResponse, source: string) => {
    if (result.review.status !== "submitted" || capturedSubmissionIds.current.has(result.application_id)) return;
    capturedSubmissionIds.current.add(result.application_id);
    track("application_submission_completed", { source });
  }, []);

  const moveToScreen = useCallback((next: Screen) => {
    setScreen((current) => {
      if (current === next) return current;
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      return next;
    });
  }, []);

  // Lifted out of MatchScore so the gap list and BOTH panes' highlighting read one /jd-match
  // result. The JD pane used to highlight against resumeTerms, every content word anywhere in the
  // resume, which lit up "backed", "services" and "deployed" in the same blue as "PostgreSQL" and
  // so told the student nothing.
  const [matchResult, setMatchResult] = useState<JdMatchResponse | null>(null);
  // What the last accept actually did, so the student is told and can undo it. Accepting used to
  // mutate the resume with no feedback at all, and could silently no-op or silently delete.
  const [lastApply, setLastApply] = useState<{ outcome: ApplyOutcome; previous: ResumeSpec } | null>(null);

  /**
   * Put one of the student's own stored bullets onto the tailored resume.
   *
   * All the judgement lives in the applications domain, which is pure and tested. This only records
   * what happened so the UI can report it and offer an undo.
   */
  const acceptBankVariant = useCallback((org: string, variant: string) => {
    setSpec((current) => {
      if (!current) return current;
      const { spec: next, outcome } = applyBankVariant(current, { org, variant });
      setLastApply({ outcome, previous: current });
      return next;
    });
  }, []);

  const undoLastApply = useCallback(() => {
    setLastApply((last) => {
      if (last) setSpec(last.previous);
      return null;
    });
  }, []);

  const selectPacket = useCallback((packet: GeneratedResume) => {
    // Updated synchronously, before any state commit, so an in-flight poll comparing against it
    // sees the new selection immediately rather than one render later.
    selectedIdRef.current = packet.id;
    setSelectedId(packet.id);
    // Highlighting is per (resume, posting). Carrying the previous packet's result over marks the
    // new JD against a resume and a posting that are no longer on screen.
    setMatchResult(null);
    setSpec(stripMetadata(packet.spec));
    setQuestions(packet.spec._review?.questions ?? []);
    setCoverLetterBody(packet.spec._cover_letter?.body ?? "");
    setCoverLetterDownloadUrl(packet.cover_letter_download_url ?? null);
    const status = packet.spec._review?.status;
    /* A different packet, so any "sending" flag belongs to the one we are leaving. Without this,
       switching to a packet whose stored status is `filling` captioned it "You told Litos to send
       this" for an application the student never authorised. */
    setPrepareStartedAt(null);
    setApproveStartedAt(null);
    setSubmittingPhase("preparing");
    moveToScreen(screenForStatus(status, "review"));
    setSubmission(status ? { application_id: packet.id, review: packet.spec._review! } : null);
    setError(null);
    setNotice(null);
  }, [moveToScreen]);

  const refreshSubmission = useCallback(async () => {
    if (!selectedId || qaMode) return;
    const requestedId = selectedId;
    const result = await api<SubmissionResponse>(`/applications/${requestedId}/submission`);

    // A poll for packet A can land after the user has switched to packet B: the fetch closes over
    // the id it asked for, but the poll effect's cleanup cannot reach inside an in-flight request.
    // Without this guard A's review would be installed while B is selected, so the portal preview,
    // filled fields and blockers on screen belong to A while the Submit button approves B. That is
    // an application sent to the wrong employer, so the response is discarded unless it is still
    // the packet the user is looking at. The ref, not the closure, is the current truth.
    if (selectedIdRef.current !== requestedId) return;

    /* Never go backwards off a finished send. A poll issued BEFORE the approve returned can land
       after it, carrying the pre-send `ready_for_final_approval`; installing it would replace the
       receipt with a live "Send it" for an application that has already gone. The id guard above
       cannot see this, because it is the right packet, just an older answer. */
    if (
      submissionRef.current?.application_id === result.application_id
      && submissionRef.current?.review.status === "submitted"
      && result.review.status !== "submitted"
    ) return;

    captureCompletedSubmission(result, "poll");
    setSubmission((current) => current?.review.updated_at === result.review.updated_at ? current : result);
    setQuestions((current) => mergeDiscoveredQuestions(current, result.review.questions));
    setPackets((current) => {
      if (!current) return current;
      const packet = current.find((item) => item.id === requestedId);
      if (packet?.spec._review?.updated_at === result.review.updated_at) return current;
      return current.map((item) => item.id === requestedId ? { ...item, spec: { ...item.spec, _review: result.review } } : item);
    });
    // A poll that succeeds clears a stale banner from an earlier transient failure. Without this a
    // single 502 during a multi-minute run left "Could not refresh portal status" pinned above a
    // run that had since succeeded.
    setError(null);
    /* While the student's own send is in flight the poll is usually reporting the status from
       BEFORE the approve, and acting on that walks them backwards onto a live "Send it".
       TERMINAL states are the exception, and the exception is load-bearing: `api()` has no
       AbortController and no timeout, so a stalled approve request never rejects and the flag stays
       set for as long as the socket hangs. Suppressing everything would then reproduce the
       never-resolving spinner this branch is named for, reached through a hung connection instead
       of a missing route, with the poll already holding the answer. Only the backwards moves are
       dropped. */
    const terminal = result.review.status === "submitted" || result.review.status === "failed";
    if (approveInFlight.current !== null && !terminal) return;
    moveToScreen(screenForStatus(result.review.status, "submitting"));
  }, [captureCompletedSubmission, moveToScreen, qaMode, selectedId]);

  useEffect(() => {
    if (!selectedId || qaMode || !["submitting", "portal"].includes(screen)) return;
    let cancelled = false;
    let timer: number | undefined;
    let inFlight = false;

    // A hidden tab skipped the fetch outright and then waited a further 10s before even
    // reconsidering, so a run that finished while the user was on another tab left the dashboard
    // frozen on "Preparing" long after the portal had come back with blockers. Backgrounding should
    // slow the poll, never withhold the terminal state: catch up the moment the tab is visible.
    const tick = async () => {
      if (cancelled || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        await refreshSubmission();
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "We lost sight of the form. Reload the page to check.");
      } finally {
        inFlight = false;
      }
    };

    const poll = async () => {
      await tick();
      if (!cancelled) timer = window.setTimeout(poll, document.visibilityState === "visible" ? 2500 : 10_000);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    timer = window.setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [qaMode, refreshSubmission, screen, selectedId]);

  useEffect(() => {
    const qaScenario = new URLSearchParams(window.location.search).get("qa");
    const localQa = window.location.hostname === "localhost" && qaScenario !== null;
    if (localQa) {
      queueMicrotask(async () => {
        const { QA_PACKET, QA_SCENARIOS } = await import("./qa-data");
        const scenario = qaScenario === "1" ? "acme" : qaScenario === "no-questions" ? "stripe" : qaScenario;
        const packet = QA_SCENARIOS[scenario ?? "acme"] ?? QA_PACKET;
        setQaMode(true);
        setEducationProfileStatus("ready");
        setPackets(Object.values(QA_SCENARIOS));
        selectPacket(packet);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setQaMode(false);
    });
    api<{ resumes: GeneratedResume[] }>("/resume/history")
      .then((result) => {
        if (cancelled) return;
        const reviewable = onlyReviewablePackets(result.resumes);
        setPackets(result.resumes);
        const requestedId = new URLSearchParams(window.location.search).get("application");
        const requested = reviewable.find((packet) => packet.id === requestedId);
        if (requested) selectPacket(requested);
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "We could not load your applications. Reload the page."));
    /* The education block as it stands NOW, to check the frozen packet against. Failure is not the
       same as agreement: sending stays blocked until the comparison succeeds. */
    queueMicrotask(() => {
      if (!cancelled) setEducationProfileStatus("loading");
    });
    api<EducationProfile>("/profile")
      .then((result) => {
        if (cancelled) return;
        setEducationProfile(result);
        setEducationProfileStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setEducationProfile(null);
        setEducationProfileStatus("failed");
      });
    api<JobsPage>("/jobs?offset=0")
      .then((result) => {
        if (cancelled) return;
        setCurrentMatches(result.jobs);
        setPreferenceError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentMatches([]);
        setPreferenceError("We could not check your current job preferences. Automatic sending is paused.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectPacket]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    if (params.get("new") === "1") queueMicrotask(() => setShowNewApplication(true));
    if (!jobId) return;
    if (qaMode !== false) return;
    let cancelled = false;
    api<{ job: MonitoredJob }>(`/jobs/${jobId}`)
      .then(({ job }) => {
        if (cancelled) return;
        setPendingJob(job);
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "We could not load that job. Try opening it again."));
    return () => {
      cancelled = true;
    };
  }, [qaMode]);

  useEffect(() => {
    if (!pendingJob || packets === null) return;
    const existing = onlyReviewablePackets(packets).find((packet) => packetMatchesJob(packet, pendingJob));
    queueMicrotask(() => {
      if (existing) {
        selectPacket(existing);
        setShowNewApplication(false);
        setNotice("Your resume is ready. Compare it with the job below.");
      } else {
        /* Arriving from "Apply now" IS the request, so build it now rather than showing a filled
           form and asking again. Nothing here came from the student's typing: company, role, link
           and description are all read off the posting.

           The draft is passed to createApplication directly, not read back from state, because
           setNewApplication has not committed yet in this tick. The panel is still opened so the
           work is visible and the fields stay editable if the generation fails. */
        const draft = {
          company: pendingJob.company_name,
          role: pendingJob.title,
          portalUrl: pendingJob.apply_url,
          jobDescription: pendingJob.description,
          jobId: pendingJob.id,
        };
        setNewApplication(draft);
        setShowNewApplication(true);
        if (autoGeneratedFor.current === pendingJob.id) {
          /* Already built for this posting in this session. The effect clears pendingJob in this
             same microtask, so a second run should not be reachable, but "should not" is the wrong
             standard for something that spends a resume from the student's quota and leaves a
             duplicate packet behind. This makes it structurally impossible instead. */
          setNotice("Building your resume for this job.");
        } else if (canGenerateFrom(draft)) {
          autoGeneratedFor.current = pendingJob.id;
          setNotice("Building your resume for this job.");
          void createApplication(draft);
        } else {
          /* Some postings arrive with a stub description or a link the generator will not accept.
             Firing anyway would spend the attempt and answer with "Fill in all four boxes first",
             which is nonsense to someone who filled in nothing. Say what is actually missing. */
          setNotice("This posting did not come with enough detail. Paste the job description below, then generate.");
        }
      }
      setPendingJob(null);
    });
    // createApplication is redeclared every render and is not a dependency worth chasing: the
    // effect is keyed on pendingJob, which is cleared above, so it runs once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packets, pendingJob, selectPacket]);

  const selected = packets?.find((packet) => packet.id === selectedId) ?? null;
  const review = selected?.spec._review;
  const reviewablePackets = useMemo(() => onlyReviewablePackets(packets ?? []), [packets]);
  const visiblePackets = useMemo(() => {
    const filtered = reviewablePackets.filter((packet) =>
      statusMatchesApplicationFilter(packet.spec._review, applicationFilter));
    return [...filtered].sort((a, b) => applicationSort === "company"
      ? (a.job_context.company ?? "").localeCompare(b.job_context.company ?? "")
      : packetTimestamp(b).localeCompare(packetTimestamp(a)));
  }, [applicationFilter, applicationSort, reviewablePackets]);
  const legacyCount = (packets?.length ?? 0) - reviewablePackets.length;

  /* ---- sending without being asked ----
     The setting itself lives on the server and is shared with Account; this page reads it, shows
     what it is doing while it is on, and gives the student the seconds in which to stop it. */
  const autopilot = useAutopilot(qaMode === false);

  const nextPacket = useMemo(
    () => qaMode
      ? reviewablePackets
          .filter((packet) => reviewCanBeSent(packet.spec._review))
          .sort((a, b) => packetTimestamp(b).localeCompare(packetTimestamp(a)))[0] ?? null
      : nextPreferredReadyPacket(reviewablePackets, currentMatches ?? []),
    [currentMatches, qaMode, reviewablePackets],
  );

  /* The BASE resume, once, from the same source use-job-match-scores.ts reads. The next-best-match
     row prints a bare percentage beside a company and a role with no document on screen, so it has
     to be the number every other job card carries; scoring the tailored packet here is what made
     one psiquantum posting read 33 on Home and 42% on this row in the same session (ISSUE-038). */
  const [baseResumeText, setBaseResumeText] = useState<string | null>(null);
  useEffect(() => {
    if (qaMode !== false) return;
    let cancelled = false;
    void getBaseResume()
      .then((stored) => !cancelled && stored?.spec && setBaseResumeText(resumeSpecText(stored.spec)))
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [qaMode]);

  /* Keyed by the packet it was measured against. A bare number would survive the card changing
     underneath it and print one job's score on another job's row. */
  const [nextScore, setNextScore] = useState<{ id: string; match: JobMatch | null } | null>(null);
  useEffect(() => {
    if (qaMode !== false || selectedId) return;
    const request = nextMatchScoreRequest(nextPacket, baseResumeText);
    if (!nextPacket || !request) return;
    let cancelled = false;
    /* The SAME question Home and Jobs answer about this posting: how much of what it asks for is on
       the student's base resume. See nextMatchScoreRequest for why the packet is not the subject
       here and why the frozen jd_text yields to the live posting row. */
    void fetchJdMatch(request.jdText, request.resumeText, request.jobContext)
      .then((result) => {
        if (cancelled) return;
        setNextScore({
          id: nextPacket.id,
          // Never a zero we did not measure: unscorable resolves to no number at all.
          match: result.scorable && result.score !== null
            ? { score: result.score, band: result.band?.label ?? null, matched: result.matched.length, total: result.term_count }
            : null,
        });
      })
      // No number rather than a wrong one.
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [baseResumeText, nextPacket, qaMode, selectedId]);

  const nextMatch: NextMatch | null = nextPacket
    ? {
        id: nextPacket.id,
        company: nextPacket.job_context.company ?? "Company",
        role: nextPacket.job_context.role ?? "Role",
        match: nextScore?.id === nextPacket.id ? nextScore.match : null,
      }
    : null;

  /* Counts what was actually sent since midnight, from the submitted_at the server stamped. A
     count of "applications touched today" would climb every time a resume was regenerated, which
     is the number every rival inflates. */
  const appliedToday = useMemo(() => {
    if (packets === null) return null;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return reviewablePackets.filter((packet) => {
      const at = packet.spec._review?.submitted_at;
      return at ? new Date(at).getTime() >= midnight.getTime() : false;
    }).length;
  }, [packets, reviewablePackets]);

  /* What the countdown reaching zero does. It is the same POST the review screen's own send makes,
     so an unattended send goes through the identical server path, quota and refusal rules as one
     the student clicked. The backend still stops and asks when an answer is missing. */
  const sendWithoutAsking = useCallback(
    async (id: string) => {
      const packet = (packets ?? []).find((item) => item.id === id);
      if (!packet || qaMode) return;
      if (educationProfileStatus !== "ready") {
        setError("We did not send this one on its own. Litos has to check this resume against your current profile first.");
        return;
      }
      /* THE ONE PLACE A PACKET GOES OUT WITH NOTHING RE-CHECKED. Sending from the review screen
         runs saveResume first, and PATCH /applications/:id/resume re-validates the spec's
         education against the current profile server-side, so a drifted packet is refused there
         already (with an opaque message, which the banner below fixes). This path posts
         submit-request on its own, and the backend then uploads the PDF blob rendered at build
         time. So an unattended send is the only way a resume stating a graduation year the
         student has since corrected reaches an employer with no human and no check in between.
         Refusing keeps the packet; it just has to be opened. */
      const drift = educationDriftMessage(educationDrift(packet.spec, educationProfile));
      if (drift) {
        setError(`We did not send this one on its own. ${drift}`);
        return;
      }
      try {
        track("application_submission_requested", { source: "autopilot" });
        const result = await api<SubmissionResponse>(`/applications/${id}/submit-request`, {
          method: "POST",
          body: JSON.stringify({ questions: packet.spec._review?.questions ?? [] }),
        });
        captureCompletedSubmission(result, "autopilot");
        setPackets((current) => current?.map((item) => (item.id === id ? { ...item, spec: { ...item.spec, _review: result.review } } : item)) ?? current);
      } catch (reason) {
        /* Stays in the page banner, deliberately, and is NOT a composer refusal. Nobody pressed a
           composer button: this is the countdown on NextMatchCard reaching zero, or that card's own
           Send. Routing it into the composer would put an answer about the autopilot next to a
           button that did not ask, in a panel that is usually closed when this fires. */
        setError(reason instanceof Error ? reason.message : "Could not send that application on its own. It is still here for you.");
      }
    },
    [captureCompletedSubmission, educationProfile, educationProfileStatus, packets, qaMode],
  );
  // The review surface is meant to be read without scrolling, so while it is open the page chrome
  // above it shrinks to what is still useful: the title stays for orientation, the tagline and the
  // legacy-resumes banner go, because together they cost roughly 120px of the one screen the JD and
  // the resume are supposed to share.
  const reviewOpen = Boolean(selected && spec && review) && screen === "review";
  const educationDriftBanner = useMemo(
    () => (spec ? educationDriftMessage(educationDrift(spec, educationProfile)) : null),
    [educationProfile, spec],
  );
  const deferredSpec = useDeferredValue(spec);
  const editedTerms = useMemo(() => explicitTerms(review?.edited_terms ?? []), [review?.edited_terms]);
  const requirementIndex = useMemo(
    () => (matchResult ? buildRequirementIndex(matchResult.matched, matchResult.missing) : EMPTY_REQUIREMENT_INDEX),
    [matchResult],
  );

  /* Every edit the student makes to the draft goes through here so the posting id cannot outlive
     the posting it describes. Retyping the company or the role means this is no longer the job
     that was opened from the list, and an id kept across that edit would mark THAT row "Applied"
     on the strength of an application to something else: the same false positive the id exists to
     remove, just arrived at from the other direction. Changing the link or the description is not
     a change of identity, so those leave it alone. */
  function applyDraftEdit(next: NewApplicationDraft) {
    // The refusal described the form as it was. Typing is the student answering it.
    setComposerRefusal(null);
    setNewApplication((current) => {
      const identityChanged = next.company !== current.company || next.role !== current.role;
      return identityChanged ? { ...next, jobId: null } : next;
    });
  }

  /* "Read job" is the composer's other button, and every one of these three answers is about the
     Job URL box six pixels away. They went to the page banner until ISSUE-043; the first two are
     the same class of validation ISSUE-040 moved for "Make my resume" and were simply missed. */
  async function fetchJobDescription() {
    const portalUrl = newApplication.portalUrl.trim();
    if (!portalUrl) {
      refuseInComposer("url", "Add the job link first, then get the description.", ["portalUrl"]);
      return;
    }
    try {
      if (new URL(portalUrl).protocol !== "https:") throw new Error("Job URL must use HTTPS");
    } catch {
      refuseInComposer("url", "Enter a complete job URL beginning with https://.", ["portalUrl"]);
      return;
    }
    setExtractingJd(true);
    setComposerRefusal(null);
    setError(null);
    setNotice(null);
    try {
      const extracted = await api<{ jd_text: string; page_title?: string }>("/jobs/extract", {
        method: "POST",
        body: JSON.stringify({ job_url: portalUrl }),
      });
      setNewApplication((current) => ({ ...current, jobDescription: extracted.jd_text }));
      setNotice("Pulled the job description from that URL. Skim it before generating - some boards need a manual paste instead.");
    } catch (err) {
      // A 502 here is expected for some client-rendered boards (see backend jobExtract.ts) - the
      // manual textarea right below stays the fallback, this just saves the copy/paste when it works.
      /* No fields marked: a board that will not give up its text is not the student's URL being
         wrong, and border-danger on the box they typed correctly reads as an accusation. */
      refuseInComposer("url", err instanceof ApiError ? err.message : "We could not read that page. Paste the job description below instead.", []);
    } finally {
      setExtractingJd(false);
    }
  }

  /* Takes the draft explicitly rather than reading state, because arriving from "Apply now" builds
     the draft and generates from it in the same tick. React has not committed setNewApplication by
     then, so reading state here would generate from the PREVIOUS draft, or from an empty one on
     first load. The panel's own button passes nothing and gets the state, as before. */
  async function createApplication(draft: NewApplicationDraft = newApplication) {
    const company = draft.company.trim();
    const role = draft.role.trim();
    const portalUrl = draft.portalUrl.trim();
    const jobDescription = draft.jobDescription.trim();
    /* Both refusals go to composerRefusal, never to setError: they are answers to a button inside
       the composer and have to appear next to it. See the state declaration for the measurement. */
    const missing = missingApplicationFields({ company, role, portalUrl, jobDescription });
    if (missing.length > 0) {
      refuseInComposer("generate", "Fill in all four boxes first.", missing);
      return;
    }
    if (!isHttpsJobUrl(portalUrl)) {
      refuseInComposer("generate", "Enter a complete job URL beginning with https://.", ["portalUrl"]);
      return;
    }
    setComposerRefusal(null);

    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const [identity, applicationProfile] = await Promise.all([
        api<ProfileIdentity>("/profile"),
        api<ApplicationProfile>("/profile/application"),
      ]);
      const fullName = identity.full_name?.trim();
      if (!fullName) throw new Error("Your main resume is missing your name. Replace it on the Resume page first.");

      const generated = await api<ResumeGenerationResponse>("/resume/generate", {
        method: "POST",
        body: JSON.stringify({
          company,
          role,
          jd_text: jobDescription,
          profile_education: {
            school: identity.school,
            degree: identity.degree,
            grad_date: identity.grad_date,
            grad_year: identity.grad_year,
            currently_enrolled: identity.currently_enrolled,
            coursework: identity.coursework,
            school_location: identity.school_location,
          },
          /* Omitted rather than sent as null when this did not come from a posting: the backend
             field is optional, and only a present id gets written into the stored job_context. */
          ...(draft.jobId ? { job_id: draft.jobId } : {}),
          application: {
            ats_name: portalName(portalUrl),
            portal_url: portalUrl,
          },
          contact: {
            full_name: fullName,
            email: identity.email?.trim() || getStoredEmail(),
            phone: applicationProfile.phone || undefined,
            linkedin_url: applicationProfile.linkedin_url || undefined,
            github_url: applicationProfile.github_url || undefined,
            portfolio_url: applicationProfile.portfolio_url || undefined,
          },
        }),
      });

      const created = generated.application;
      if (created?.spec._review) {
        setPackets((current) => [created, ...(current ?? []).filter((packet) => packet.id !== created.id)]);
        selectPacket(created);
        setNewApplication(EMPTY_APPLICATION_DRAFT);
        setShowNewApplication(false);
        track("application_generation_completed", { source: draft.jobId ? "monitored_job" : "manual" });
        setNotice("Your resume is ready. We will check whether this employer wants a cover letter.");
        return;
      }

      // Compatibility path while an older backend deployment is still serving traffic.
      await api(`/applications/${generated.resume_id}/review`, {
        method: "PUT",
        body: JSON.stringify({
          ats_name: portalName(portalUrl),
          portal_url: portalUrl,
          questions: [],
          skipped_reasons: [],
        }),
      });

      const history = await api<{ resumes: GeneratedResume[] }>("/resume/history");
      const fallbackCreated = history.resumes.find((packet) => packet.id === generated.resume_id);
      setPackets(history.resumes);
      if (!fallbackCreated?.spec._review) throw new Error("Your resume was made, but we could not open it. Reload the page.");
      selectPacket(fallbackCreated);
      setNewApplication(EMPTY_APPLICATION_DRAFT);
      setShowNewApplication(false);
      track("application_generation_completed", { source: draft.jobId ? "monitored_job" : "manual" });
      setNotice("Your resume is ready. We will check whether this employer wants a cover letter.");
    } catch (reason) {
      /* ISSUE-043. This is the press of "Make my resume" failing, so it is answered beside "Make my
         resume". Empty fields on purpose: a 500 from /resume/generate, or a missing name on the
         main resume, says nothing about the four boxes, and marking them would send the student
         back to retype input that was already fine. */
      refuseInComposer("generate", reason instanceof Error ? reason.message : "We could not build this application. Check the job description and try again.", []);
    } finally {
      setCreating(false);
    }
  }

  async function generateCoverLetter(applicationId = selected?.id) {
    if (!applicationId) return;
    setCoverLetterBusy(true);
    setError(null);
    try {
      if (qaMode) {
        const body = `I am excited to apply for the ${selected?.job_context.role ?? "role"} position at ${selected?.job_context.company ?? "your company"}. My experience building production software and working across product requirements aligns closely with this opportunity.\n\nI would bring a practical, evidence-led approach to the team, with attention to reliable implementation, clear communication, and measurable outcomes. I am especially interested in applying these strengths to the priorities described in this role.\n\nThank you for considering my application. I would welcome the opportunity to discuss how my background can support the team.`;
        setCoverLetterBody(body);
        return;
      }
      const result = await api<CoverLetterResponse>(`/applications/${applicationId}/cover-letter`, { method: "POST" });
      setPackets((current) => current?.map((packet) => packet.id === applicationId ? { ...packet, cover_letter_download_url: result.download_url, spec: { ...packet.spec, _cover_letter: result.cover_letter } } : packet) ?? current);
      if (selectedIdRef.current === applicationId) {
        setCoverLetterBody(result.cover_letter.body);
        setCoverLetterDownloadUrl(result.download_url);
      }
      setNotice("Cover letter written and checked against the work you told us about.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate the tailored cover letter.");
      throw reason;
    } finally {
      setCoverLetterBusy(false);
    }
  }

  async function saveCoverLetter(): Promise<boolean> {
    if (!selected) return false;
    setCoverLetterBusy(true);
    setError(null);
    try {
      if (!qaMode) {
        const applicationId = selected.id;
        if (!coverLetterBody.trim()) {
          if (selected.spec._cover_letter) {
            await api(`/applications/${applicationId}/cover-letter`, { method: "DELETE" });
            setPackets((current) => current?.map((packet) => packet.id === applicationId
              ? { ...packet, cover_letter_download_url: undefined, spec: { ...packet.spec, _cover_letter: undefined } }
              : packet) ?? current);
            if (selectedIdRef.current === applicationId) setCoverLetterDownloadUrl(null);
            setNotice("Cover letter removed from this application.");
          }
          return true;
        }
        const result = await api<CoverLetterResponse>(`/applications/${selected.id}/cover-letter`, { method: "PATCH", body: JSON.stringify({ body: coverLetterBody }) });
        setPackets((current) => current?.map((packet) => packet.id === applicationId ? { ...packet, cover_letter_download_url: result.download_url, spec: { ...packet.spec, _cover_letter: result.cover_letter } } : packet) ?? current);
        if (selectedIdRef.current === applicationId) {
          setCoverLetterBody(result.cover_letter.body);
          setCoverLetterDownloadUrl(result.download_url);
        }
      }
      setNotice("Cover letter saved. Every line checks out against your real work.");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not save your cover letter. Try again.");
      return false;
    } finally {
      setCoverLetterBusy(false);
    }
  }

  function patchEntry(index: number, patch: Partial<ResumeSpec["experience"][number]>) {
    setSpec((current) =>
      current
        ? { ...current, experience: current.experience.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) }
        : current,
    );
  }

  async function saveResume(): Promise<boolean> {
    if (!selected || !spec) return false;
    setSaving(true);
    setError(null);
    try {
      if (!qaMode) {
        const updated = await api<{ spec: GeneratedResume["spec"]; download_url: string }>(
          `/applications/${selected.id}/resume`,
          { method: "PATCH", body: JSON.stringify({ spec }) },
        );
        setPackets((current) =>
          current?.map((packet) =>
            packet.id === selected.id ? { ...packet, spec: updated.spec, download_url: updated.download_url } : packet,
          ) ?? current,
        );
      }
      setNotice("Resume saved and rechecked.");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not save your resume. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function continueFromResume() {
    if (coverLetterBusy) {
      setError("Wait for the cover letter check to finish before preparing the application.");
      return;
    }
    if (!(await saveResume())) return;
    if (!qaMode && !(await saveCoverLetter())) return;
    const missingRequiredAnswers = questions.filter((question) => question.required && !question.answer.trim());
    if (missingRequiredAnswers.length > 0) {
      moveToScreen("questions");
      return;
    }
    await prepareApplication(questions);
  }

  async function prepareApplication(finalQuestions = questions) {
    if (!selected) return;
    if (finalQuestions.some((question) => question.required && !question.answer.trim())) {
      setError("Some answers are missing. Add them first.");
      return;
    }
    setPrepareStartedAt(new Date().toISOString());
    setSubmittingPhase("preparing");
    moveToScreen("submitting");
    setError(null);
    track("application_submission_requested", { source: qaMode ? "qa" : "review" });
    try {
      if (!qaMode) {
        const result = await api<SubmissionResponse>(`/applications/${selected.id}/submit-request`, {
          method: "POST",
          body: JSON.stringify({ questions: finalQuestions }),
        });
        captureCompletedSubmission(result, "review");
        setSubmission(result);
        setPackets((current) => current?.map((packet) => packet.id === selected.id ? { ...packet, spec: { ...packet.spec, _review: result.review } } : packet) ?? current);
        // This response is the END of the run, not an acknowledgement of its start, and it is
        // routinely terminal ("failed", "needs_attention", "ready_for_final_approval"). It used to
        // be installed into state and then ignored for routing, which left the progress screen
        // spinning over a run that was already over.
        moveToScreen(screenForStatus(result.review.status, "submitting"));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 650));
        const now = new Date().toISOString();
        setSubmission({ application_id: selected.id, review: { ...review!, status: "submitted", submission_authorized_at: now, submitted_at: now, filled_fields: ["name", "email", "resume", "cover letter"], receipt: { confirmation_text: "Thank you. Your controlled test application was received.", final_url: "/qa/portal-submission/success", screenshot_url: "/qa/portal-receipt.svg", captured_at: now, reference_id: "LITOS-QA-2027" } } });
        moveToScreen("submitted");
        return;
      }
    } catch (reason) {
      moveToScreen("review");
      setError(reason instanceof Error ? reason.message : "We could not open the company's application page.");
    }
  }

  async function completeHandoff() {
    if (!selected || !submission) return;
    setError(null);
    try {
      const result = qaMode
        ? { ...submission, review: { ...submission.review, status: "ready_for_final_approval" as const, attention_reason: undefined } }
        : await api<SubmissionResponse>(`/applications/${selected.id}/submission/handoff-complete`, { method: "POST" });
      setSubmission(result);
      moveToScreen("portal");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not tell whether it went through.");
    }
  }

  function reviewPortalQuestions() {
    if (!submission) return;
    setQuestions((current) => mergeDiscoveredQuestions(current, submission.review.questions));
    moveToScreen("questions");
  }

  async function retryPreparation() {
    if (!submission) return;
    const currentQuestions = mergeDiscoveredQuestions(questions, submission.review.questions);
    setQuestions(currentQuestions);
    await prepareApplication(currentQuestions);
  }

  async function approveFinalSubmission() {
    if (!selected || !submission) return;
    if (qaMode === false && educationProfileStatus !== "ready") {
      setError("Litos has to check this resume against your current profile before sending.");
      moveToScreen("portal");
      return;
    }
    const drift = educationDriftMessage(educationDrift(selected.spec, educationProfile));
    if (drift) {
      setError(drift);
      moveToScreen("review");
      return;
    }
    // Second press of "Send it" for THIS application while the first is still going.
    if (approveInFlight.current === selected.id) return;
    const requestedId = selected.id;
    approveInFlight.current = requestedId;
    setApprovingId(requestedId);
    setApproveStartedAt(new Date().toISOString());
    setError(null);
    setSubmittingPhase("sending");
    moveToScreen("submitting");
    try {
      if (qaMode) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        const now = new Date().toISOString();
        const result = { ...submission, review: { ...submission.review, status: "submitted" as const, submitted_at: now, receipt: { confirmation_text: "Thank you. Your controlled test application was received.", final_url: "/qa/portal-submission/success", screenshot_url: "/qa/portal-receipt.svg", captured_at: now, reference_id: "LITOS-QA-2027" } } };
        setSubmission(result);
        moveToScreen("submitted");
      } else {
        const result = await api<SubmissionResponse>(`/applications/${selected.id}/submission/approve`, { method: "POST" });
        captureCompletedSubmission(result, "final_approval");
        /* The packet the student is LOOKING at, which after a multi-minute send need not be the one
           they approved: the packet switcher renders above every screen including this one, so
           tapping another row mid-send is a single tap. refreshSubmission has guarded exactly this
           since the wrong-employer finding; this path did not, and installing A's result while B is
           selected renders A's confirmation text and reference id under B's role and company. The
           send still completed and the poll will pick it up when they return to it. */
        if (selectedIdRef.current !== requestedId) return;
        submissionRef.current = result;
        setSubmission(result);
        /* This response is the END of the send, not an acknowledgement that it started, exactly as
           in prepareApplication above, and it was installed into state and then never routed off.
           The QA branch four lines up has always called moveToScreen; the real one never did.
           BE PRECISE ABOUT WHAT THAT COSTS, because the obvious overstatement is wrong: the
           submission poll below also routes off the status, so a FOREGROUNDED tab recovers within
           its 2.5s tick and the student sees the receipt. The poll is the only thing that was
           saving this, and it is deliberately suppressed while `document.visibilityState` is not
           "visible". So the screen that never resolves is the backgrounded one, which is the
           ordinary case here: a portal run takes minutes and the whole point of the copy is that
           you can go and do something else. Routing off the response we already hold costs nothing
           and does not depend on the tab being watched.
           The fallback is "portal", the screen this was entered from, so an unrecognised status
           returns to a screen with controls on it rather than parking on the spinner again. */
        moveToScreen(screenForStatus(result.review.status, "portal"));
      }
    } catch (reason) {
      /* Back to the screen this came from, and back to "preparing": leaving the phase on "sending"
         would caption the NEXT run of the progress screen as a send that is not happening. */
      setSubmittingPhase("preparing");
      moveToScreen("portal");
      setError(reason instanceof Error ? reason.message : "Could not approve the final portal submission.");
    } finally {
      approveInFlight.current = null;
      setApprovingId(null);
    }
  }

  if (error && packets === null) return <ErrorNote message={error} />;

  return (
    <div className={reviewOpen ? "space-y-4" : "space-y-6"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={`font-normal leading-[1.15] tracking-[-0.02em] text-ink ${reviewOpen ? "text-heading" : "text-section"}`}>Tracker</h1>
          {/* Every selected screen needs a way back to the mobile list. Desktop keeps the compact
              switcher beside the detail, so this control would only repeat it there. */}
          {selected && spec && review && (
            <button
              type="button"
              onClick={() => {
                selectedIdRef.current = null;
                setSelectedId(null);
                setMatchResult(null);
              }}
              className="mt-1 text-sm text-muted transition-colors hover:text-ink"
            >
              ← All applications
            </button>
          )}
        </div>
        {/* The selected packet's status already prints on its own row and inside the review
            surface; a third copy in the page header was noise. */}
        {/* The "Send without asking" switch used to sit here. It now lives on the Jobs header,
            beside the list the sending draws from. This page still READS the same server field,
            because the lock note and the cancel window below are that setting's consequence, and
            the consequence stays where the applications are. */}
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            onClick={showNewApplication ? closeNewApplication : () => setShowNewApplication(true)}
          >
            {showNewApplication ? "Close" : "Add job"}
          </Button>
        </div>
      </div>

      {/* No autopilot.error row here any more. That error is only ever set by the toggle's own
          save, and the toggle is on Jobs now, so a copy on this page could never fire. */}
      {!selected && <AutopilotLockNote enabled={autopilot.enabled} eligibility={autopilot.eligibility} />}
      {!selected && (
        <p className="text-sm leading-6 text-muted">
          Your full application history stays here. Next best match and automatic sending follow your current Account preferences.
        </p>
      )}
      {!selected && preferenceError && <ErrorNote message={preferenceError} />}
      {!selected && packets !== null && reviewablePackets.length > 0 && (
        <NextMatchCard
          match={nextMatch}
          /* The only thing this card is still waiting on. Packets are loaded by the time it mounts
             (the guard above requires it), so the preferences fetch is what decides whether a null
             match means "not yet" or "none". It settles to [] even when it fails, so this cannot
             stay true forever the way `match === null` could. */
          searching={currentMatches === null}
          autopilot={Boolean(autopilot.enabled)}
          appliedToday={appliedToday}
          onSend={(id) => void sendWithoutAsking(id)}
          onOpen={(id) => {
            const packet = (packets ?? []).find((item) => item.id === id);
            if (packet) selectPacket(packet);
          }}
        />
      )}

      {/* KNOWN, NOT IN SCOPE, and recorded here because it is the mechanism behind a number in the
          ISSUE-043 measurements. This banner renders IMMEDIATELY ABOVE the composer, so a
          page-level error arriving while the composer is open pushes the whole composer down by
          this element's height. That is why the baseline scroll position moved 586 -> 674 and
          420 -> 488 when the generate request failed: the banner appeared here and shoved
          everything below it, carrying the banner itself further from the button.

          ISSUE-043 means the refusal now travels WITH the button, so the message can no longer be
          pushed away from the control that raised it. The button itself can still jump under the
          student's cursor when a genuine page-level error lands mid-press. Not a regression, and
          not something a placement fix can reach: it needs this banner reserved or moved, which is
          a layout change to the whole screen. */}
      {error && <ErrorNote message={error} />}
      {/* Derived from the SPEC BEING EDITED, not from the stored packet, so it clears the moment
          the student fixes the education line rather than sitting there until she saves. */}
      {reviewOpen && educationDriftBanner && (
        <p role="alert" className="rounded-inner bg-danger-soft px-4 py-3 text-sm text-danger">{educationDriftBanner}</p>
      )}
      {notice && <p role="status" className="rounded-inner bg-positive-soft px-4 py-3 text-sm text-positive">{notice}</p>}
      {showNewApplication && (
        <NewApplicationPanel
          value={newApplication}
          onChange={applyDraftEdit}
          /* React click handlers receive the click event. Passing createApplication directly made
             that event replace the optional draft argument, so the first .trim() crashed in
             production instead of generating the application. */
          onGenerate={() => void createApplication()}
          creating={creating}
          onFetchJobDescription={fetchJobDescription}
          extractingJd={extractingJd}
          refusal={composerRefusal}
        />
      )}
      {legacyCount > 0 && !reviewOpen && (
        <p className="border-y border-border py-3 text-sm text-muted">
          {legacyCount} saved resume{legacyCount === 1 ? "" : "s"} · Add a job URL to turn one into a reviewable application.
        </p>
      )}

      {/* Two reasons this section exists, and it has to render for both.

          With a packet open it is the switcher: the only in-context way to move to another
          application. With nothing open and a filter on, it is the answer to the deep link Home
          just followed. Gating the whole thing on `selected` made every ?state= arrival inert,
          because the filter it had just set had no rows to apply to and no visible control to
          change: Home's banner promised the applications that had stopped for the student and
          delivered the same board as the plain URL.

          It stays hidden on an unfiltered board view, where it would only restate the board below
          it. Setting the select back to Everything is what closes it, which is also how the
          filter is cleared. */}
      {packets !== null && (selected ? reviewablePackets.length > 1 : ledgerRendersOnLanding(applicationFilter, reviewablePackets.length)) && (
        /* Keep the switcher above every screen branch. Historical marker for the invariant:
           packet.job_context.role} · {packet.job_context.company} */
        /* Every control in here used to sit behind `hidden lg:block`. Filter and sort being
           desktop-only was a deliberate trade; the switcher going with them was not, and it is the
           only in-context way to move between applications, so a phone user's sole escape from an
           open packet was the "All applications" link. Litos's traffic is TikTok and Instagram, so
           most real sessions were the ones missing it. */
        <section aria-labelledby="application-ledger-heading" className="border-y border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-baseline gap-2">
              {/* Visible whenever this is the landing view for a filter, so the student reads what
                  they are looking at in words. Beside an open packet it goes back to being the
                  switcher's label: the heading there would compete with the packet's own. */}
              <h2 id="application-ledger-heading" className={selected ? "sr-only" : "text-sm font-medium text-ink"}>
                {selected ? "Your applications" : applicationFilterHeading(applicationFilter)}
              </h2>
              <span className="font-mono text-[11px] text-faint">{visiblePackets.length} of {reviewablePackets.length}</span>
            </div>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="application-filter">Filter applications</label>
              <select id="application-filter" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value as ApplicationFilter)} className="min-h-11 rounded-full border border-border bg-surface px-3 text-xs text-ink">
                <option value="all">Everything</option>
                <option value="action">Needs you</option>
                <option value="ready">Ready</option>
                <option value="submitted">Sent</option>
              </select>
              <label className="sr-only" htmlFor="application-sort">Sort applications</label>
              <select id="application-sort" value={applicationSort} onChange={(event) => setApplicationSort(event.target.value as ApplicationSort)} className="min-h-11 rounded-full border border-border bg-surface px-3 text-xs text-ink">
                <option value="recent">Recent first</option>
                <option value="company">Company A-Z</option>
              </select>
            </div>
          </div>
          {/* Below lg the ledger becomes a horizontally scrolling strip of chips rather than a
              table. Four columns of role, company, date and status do not survive 375px, and a
              vertical list of 50 rows between the page header and the review surface would bury
              the thing the student actually opened. The strip is the shape this codebase already
              uses for the same problem: the Board's stage picker and the Account tab strip. The
              negative margin lets it bleed to both edges of the phone screen, so the last chip is
              visibly cut rather than looking like the end of the list. */}
          <div className="-mx-4 overflow-x-auto border-t border-border px-4 py-2.5 sm:-mx-6 sm:px-6 lg:hidden">
            {visiblePackets.length === 0 ? (
              <p className="py-2 text-sm text-muted">No applications in this view.</p>
            ) : (
              <div className="flex min-w-max gap-2">
                {visiblePackets.map((packet) => (
                  <button
                    key={packet.id}
                    type="button"
                    onClick={() => selectPacket(packet)}
                    aria-pressed={packet.id === selected?.id}
                    className={`flex min-h-11 max-w-[15rem] shrink-0 flex-col justify-center rounded-inner border px-3 py-2 text-left ${packet.id === selected?.id ? "border-brand bg-brand-soft" : "border-border"}`}
                  >
                    <span className={`truncate text-[13px] font-medium ${packet.id === selected?.id ? "text-brand-ink" : "text-ink"}`}>{packet.job_context.role || "Role"}</span>
                    <span className="truncate text-[11px] text-muted">{packet.job_context.company || "Company"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Whole rows: max-h-72 cut the fifth row in half, which reads as a broken layout
              rather than as "there is more below". */}
          <div className="hidden max-h-[280px] overflow-y-auto border-t border-border lg:block">
            {visiblePackets.length === 0 ? (
              <p className="py-5 text-sm text-muted">No applications in this view.</p>
            ) : (
              <>
                {/* An unlabelled column of company names and bare dates left "Jul 21, 2026"
                    meaning nothing. Say what each column is. */}
                <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border px-2 py-2 text-[11px] text-faint sm:grid">
                  <span>Role</span>
                  <span>Company</span>
                  <span>Last updated</span>
                  <span>Status</span>
                </div>
                <div className="divide-y divide-border">
                  {visiblePackets.map((packet) => (
                    <button key={packet.id} onClick={() => selectPacket(packet)} aria-pressed={packet.id === selected?.id} className={`grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 text-left transition-colors sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] ${packet.id === selected?.id ? "bg-brand-soft/55" : "hover:bg-surface-alt"}`}>
                      <span className="truncate text-sm font-medium text-ink">{packet.job_context.role || "Role"}</span>
                      <span className="hidden truncate text-xs text-muted sm:block">{packet.job_context.company || "Company"}</span>
                      <time className="hidden text-xs text-faint sm:block">{formatRelativeDate(packetTimestamp(packet))}</time>
                      {/* A column where every cell reads the same carries no information and costs
                          a fifth of the row. It only renders when the rows actually differ. */}
                      {packet.spec._review && <Chip label={statusLabel(false, packet.spec._review.status)} kind={chipKind(packet.spec._review.status)} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {packets === null ? (
        <ShimmerRows rows={4} />
      ) : reviewablePackets.length === 0 ? (
        <EmptyState title={legacyCount > 0 ? `${legacyCount} resumes saved` : "No applications yet"} body={legacyCount > 0 ? "Add a job URL to create your first reviewable application." : "Add a job URL. Litos will prepare the resume and review."}>
          <Button type="button" onClick={() => setShowNewApplication(true)} >Start an application</Button>
        </EmptyState>
      ) : !selected || !spec || !review ? (
        /* A board, not a list. Reviewers of Huntr and Teal both describe the Kanban as the thing
           that replaced their spreadsheet, and what retains is that the data accumulates and stays
           theirs. The flat list this replaces showed only role and company, with no way to record
           what had actually happened with any of them. */
        /* The board is the whole of this branch, so containing it here does not save a sibling on
           this screen. It saves the SHELL: the sidebar, the mobile tab bar and the page title stay
           mounted, so a student whose board fails still has Home, Jobs and Emails one tap away
           rather than the route boundary's full-page recovery screen. */
        <SectionBoundary band="tracker-board" title="Your applications">
        <Board
          openableIds={new Set((packets ?? []).map((item) => item.id))}
          onOpen={(id) => {
            const packet = (packets ?? []).find((item) => item.id === id);
            if (packet) selectPacket(packet);
          }}
          /* Revisit does NOT call selectPacket. Selecting drives the review flow and moves the
             whole page onto a screen for that packet; looking at what was already sent should
             leave the board exactly where it was, so this opens over the top and closes back to
             the same scroll position. */
          onRevisit={setRevisitingId}
          /* The ids the viewer can actually open, which is NOT the same set as openableIds.
             `_review` is optional on the spec, and the mark used to render for every packet in
             history while the handler quietly did nothing for the ones without a review: a fully
             styled, focusable, labelled button that was inert on click and on Enter. A control
             that cannot act should be absent, not dead. */
          revisitableIds={new Set((packets ?? []).filter((item) => item.spec._review).map((item) => item.id))}
        />
        </SectionBoundary>
      ) : screen === "questions" ? (
        <QuestionsScreen
          questions={questions}
          onChange={setQuestions}
          onBack={() => moveToScreen(submission?.review.status === "needs_attention" ? "portal" : "review")}
          onSubmit={() => prepareApplication()}
          reviewDiscovered={submission?.review.status === "needs_attention"}
        />
      ) : screen === "submitting" ? (
        <PortalProgress
          status={submission?.review.status}
          startedAt={submittingPhase === "sending" ? approveStartedAt ?? submission?.review.updated_at : prepareStartedAt ?? submission?.review.updated_at}
          sending={submittingPhase === "sending"}
        />
      ) : screen === "portal" && submission ? (
        <SubmissionScreen
          packet={selected}
          submission={submission}
          approving={approvingId === selected.id}
          educationProfile={educationProfile}
          educationProfileStatus={qaMode === true ? "ready" : educationProfileStatus}
          onCheckResume={() => moveToScreen("review")}
          onHandoffComplete={completeHandoff}
          onApprove={approveFinalSubmission}
          onRetry={retryPreparation}
          onReviewQuestions={reviewPortalQuestions}
        />
      ) : screen === "submitted" ? (
        <SubmissionReceipt review={submission?.review ?? review} role={selected.job_context.role ?? "Role"} company={selected.job_context.company ?? "Company"} />
      ) : (
        <>
          {/* The review surface is built to be read WITHOUT SCROLLING. It used to stack a JD pane, a
              resume pane, a gaps card, a cover-letter card and a legend down the page, so the two
              things a student is actually comparing were never both fully on screen, and the
              whitespace beside a short JD pushed everything else further down.
              Now: one compact header carrying the score and the legend, then two columns that each
              scroll INSIDE themselves against a shared height. The page holds still; the panes
              move. The gap list sits under the JD, which is where the dead space was. */}
          <RequirementProvider index={requirementIndex}>
            <div className="rounded-card border border-border bg-surface-alt px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {selected.job_context.role} · {selected.job_context.company}
                  </p>
                  <p className="text-[11px] text-faint">
                    {review.ats_name ?? "the company's application page"} · resume built {formatRelativeDate(selected.created_at)}
                  </p>
                </div>
                {/* Was <ScoreRing score={extractScore(selected.spec)} /> under the caption "match".
                    That read spec._quality.atsCoverage, which counts every non-stopword in the
                    posting and therefore sat at 12-17% for a strong resume. */}
                <MatchScore
                  jdText={review.jd_text}
                  spec={deferredSpec ?? spec}
                  jobContext={selected.job_context}
                  onResult={setMatchResult}
                  disabled={qaMode !== false}
                />
              </div>
              <div className="mt-3 border-t border-border pt-2.5">
                <MatchLegend missingCount={matchResult?.scorable ? matchResult.missing.length : null} />
                {/* "Point at any highlighted term to see it light up on both
                    sides." came off 2026-07-28: instructions for a hover. */}
              </div>
            </div>

            {/* min-h-0 on the children is what actually lets them scroll inside a grid row. */}
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <section className="flex min-h-0 flex-col rounded-card border border-border bg-surface">
                <p className="border-b border-border px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  Job description
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 xl:max-h-[calc(100vh-15.5rem)]">
                  <div className="prose-copy whitespace-pre-line text-sm leading-6 text-ink">
                    <RequirementText text={review.jd_text} />
                  </div>
                  {/* Every requirement the posting states, met or not, with the student's own
                      bullet as the reason. Collapsed behind a click because it costs a model call
                      the first time: opening it is the student asking. Sits directly under the
                      posting so a row can be read against the sentence it came from. */}
                  <div className="mt-5 border-t border-border pt-4">
                    <RequirementBreakdown
                      jdText={review.jd_text}
                      spec={deferredSpec ?? spec}
                      jobContext={selected.job_context}
                      disabled={qaMode !== false}
                    />
                  </div>
                  {/* Preparation for later, under the posting it comes from. Collapsed by default:
                      expanding it is the student saying they are at that stage. */}
                  <div className="mt-5 border-t border-border pt-4">
                    <InterviewPrep jdText={review.jd_text} spec={deferredSpec ?? spec} jobContext={selected.job_context} />
                  </div>
                  {matchResult && matchResult.missing.length > 0 && (
                    <div className="mt-5 border-t border-border pt-4">
                      <MatchGaps
                        missing={matchResult.missing}
                        resumeText={resumeSpecText(deferredSpec ?? spec)}
                        onUseVariant={({ org, variant }) => acceptBankVariant(org, variant)}
                        lastApply={lastApply}
                        onUndo={undoLastApply}
                      />
                    </div>
                  )}
                </div>
              </section>

              <section className="flex min-h-0 flex-col rounded-card border border-border bg-surface">
                <p className="border-b border-border px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  Your resume for this job
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 xl:max-h-[calc(100vh-15.5rem)]">
                  {/* `selected.spec` for the name and contact, NOT the `spec` beside them, and the
                      difference is the entire bug this fixes. `spec` is the editable copy, and it
                      is built by `setSpec(stripMetadata(packet.spec))`: stripMetadata drops
                      `_contact` deliberately, so the name is not merely absent from that object,
                      it is removed on the way in. Reading the applicant off it is impossible, which
                      is why the header silently became whatever sorted first.
                      `selected` is the raw packet and still has it. */}
                  <ResumeEditor
                    spec={spec}
                    name={contactName(selected.spec)}
                    contact={contactLine(selected.spec)}
                    editedTerms={editedTerms}
                    onChange={setSpec}
                    onPatchEntry={patchEntry}
                  />
                  {/* Under the resume, inside the same scroll area: the checks describe the page
                      directly above them, so they belong to it rather than to the screen. */}
                  <div className="mx-auto mt-5 max-w-[640px] border-t border-border pt-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                      Resume checks
                    </p>
                    <div className="mt-3">
                      {/* The first of the three occurrences was here: an undefined `findings` from
                          /resume/health crashed this whole review screen, taking the JD, the resume,
                          the match score and the gap list with it, for a panel that is four lines of
                          advice in the corner. It is the clearest case in the audit for scoping a
                          boundary to a panel. */}
                      <SectionBoundary band="resume-health" title="Resume checks">
                        <ResumeHealth spec={deferredSpec ?? spec} disabled={qaMode !== false} />
                      </SectionBoundary>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </RequirementProvider>

          {review.cover_letter_supported === true ? <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-ink">Cover letter</h2>
                <p className="mt-1 text-sm text-muted">Written from your resume.</p>
              </div>
              <div className="flex gap-2">
                {coverLetterDownloadUrl && <a href={coverLetterDownloadUrl} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">View PDF</a>}
                <Button type="button" onClick={() => void generateCoverLetter()} disabled={coverLetterBusy} variant="secondary" className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{coverLetterBody ? "Regenerate" : "Generate"}</Button>
                <Button type="button" onClick={saveCoverLetter} disabled={coverLetterBusy || (!coverLetterBody.trim() && !selected.spec._cover_letter)} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{coverLetterBusy ? "Checking..." : coverLetterBody.trim() ? "Save cover letter" : "Remove cover letter"}</Button>
              </div>
            </div>
            <textarea aria-label="Tailored cover letter" value={coverLetterBody} onChange={(event) => setCoverLetterBody(event.target.value)} rows={12} placeholder="Generate a cover letter tailored to this job description" className="mt-5 w-full rounded-inner border border-border bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none focus:border-brand" />
            {(selected.spec._cover_letter?.warnings?.length ?? 0) > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-warn">
                {selected.spec._cover_letter!.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </Card> : <Card className="p-6">
            {/* Was an eyebrow, a headline and a two-sentence body: three tiers
                of type for one idea the headline already carried. */}
            <h2 className="text-lg font-medium text-ink">{review.cover_letter_supported === false ? "This company does not take a cover letter." : "Litos will check the company's form first."}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {review.cover_letter_supported === false
                ? "This application will continue without one."
                : "If the form has a cover-letter attachment, Litos writes one and attaches it, even when it is marked optional."}
            </p>
          </Card>}

          {/* The Blue/Green legend was REMOVED 2026-07-28. This screen carried
              two legends for one colour code: MatchLegend above the panes and
              this one below them. Not merely similar, identical Tailwind
              classes, with different words for the same two colours.
              MatchLegend wins: it names all three tones rather than two, and
              it says what the colour MEANS rather than what it IS. Two names
              for one colour is worse than no name. Guarded by R-046 in
              tests/review-highlighting.test.mjs. */}
          {/* The send control is gated on portal_supported, not just on saving state.
              Packets on company-owned careers pages used to sit here behind a live "Fill the form"
              button that could only ever fail: the run started, drove a browser for minutes, and
              came back with "This portal is not supported yet". Nine of one account's ten failures
              were that. The tailored resume is still worth having, so this says what Litos cannot
              do and hands the applicant the page instead of hiding the job. */}
          {/* The two sentences are NOT the same kind of sentence, which is why only one of them is
              allowed to disappear on a phone.
              The supported line describes what the button next to it already says: on a 375px
              screen it wraps to two rows and the bar, which is now sticky, was eating ~150px of an
              812px viewport to restate "Fill the form" in a longer form. It comes back at sm.
              The unsupported line is the opposite: it is the only thing that explains why the
              button says "Open the company page" instead, and dropping it would leave a student
              with a control that looks like a mistake. It is shown at every width. */}
          {/* justify-end below sm is not a style preference. `hidden` is display:none, so the caption
              is not a flex item there at all, and justify-between with ONE item resolves to
              flex-start: the primary action slid to the left edge on a phone while the same bar on
              the questions screen sat right. Same bar, three alignments, depending on branch. */}
          <TerminalActionBar className="justify-end sm:justify-between">
            {review.portal_supported === false
              ? <p className="text-sm text-ink">Litos cannot fill in this company’s page. Your resume is ready, so apply on their site.</p>
              : <p className="hidden text-sm text-ink sm:block">Litos fills the form with your saved answers and this resume.</p>}
            <div className="flex gap-2">
              {selected.download_url && selected.download_url !== "#" && <a href={selected.download_url} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View PDF</a>}
              {review.portal_supported === false
                ? review.portal_url && <a href={review.portal_url} target="_blank" rel="noreferrer" className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Open the company page</a>
                : <Button onClick={continueFromResume} disabled={saving || coverLetterBusy} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                  {saving || coverLetterBusy ? <PendingLabel state="solving" onColor>Making...</PendingLabel> : "Fill the form"}
                </Button>}
            </div>
          </TerminalActionBar>
        </>
      )}

      {/* Rendered last and positioned fixed, so it lies over whichever screen the page is already
          on and closing it returns the user to exactly that, untouched.

          Resolved from `packets` every render rather than from a captured object, so what the
          viewer shows is what the page knows. If the packet leaves the 50-row window, this falls
          to null and the viewer closes rather than showing a record nothing can corroborate. */}
      {revisitingPacket?.spec._review && (
        <ApplicationPacket
          packet={revisitingPacket}
          review={revisitingPacket.spec._review}
          onClose={closeRevisit}
        />
      )}
    </div>
  );
}

function packetTimestamp(packet: GeneratedResume): string {
  return packet.spec._review?.updated_at ?? packet.created_at ?? "";
}

function NewApplicationPanel({
  value,
  onChange,
  onGenerate,
  creating,
  onFetchJobDescription,
  extractingJd,
  refusal,
}: {
  value: NewApplicationDraft;
  onChange: (value: NewApplicationDraft) => void;
  onGenerate: () => void;
  creating: boolean;
  onFetchJobDescription: () => void;
  extractingJd: boolean;
  /** Why the last press of a composer button did nothing, which boxes it was about, and which of
      the two buttons is being answered. */
  refusal: { message: string; fields: ApplicationDraftField[]; at: ComposerSlot } | null;
}) {
  const patch = (next: Partial<NewApplicationDraft>) => onChange({ ...value, ...next });
  const invalid = (field: ApplicationDraftField) => refusal?.fields.includes(field) ?? false;
  return (
    <Card className="p-6">
      <div className="max-w-2xl">
        <p className="text-xs text-muted">New application</p>
        <h2 className="mt-2 text-xl font-medium text-ink">Add a job.</h2>
        <p className="mt-1 text-sm leading-6 text-muted">It opens beside the job description.</p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ApplicationField label="Company" value={value.company} onChange={(company) => patch({ company })} placeholder="Google" invalid={invalid("company")} />
        <ApplicationField label="Role" value={value.role} onChange={(role) => patch({ role })} placeholder="Software Engineer" invalid={invalid("role")} />
      </div>
      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <ApplicationField label="Job URL" value={value.portalUrl} onChange={(portalUrl) => patch({ portalUrl })} placeholder="https://company.com/jobs/..." type="url" invalid={invalid("portalUrl")} />
        </div>
        <Button
          type="button"
          onClick={onFetchJobDescription}
          disabled={extractingJd || !value.portalUrl.trim()} variant="secondary" className="mb-0.5 whitespace-nowrap">
          {extractingJd ? <PendingLabel state="composing">Reading...</PendingLabel> : "Read job"}
        </Button>
      </div>
      {/* Read job's own slot. Measured: the two composer buttons are ~440px apart, so the generate
          row is not "beside" this one. With the message down there it sat at y = 979 on a 375x812
          viewport while this button was at y = 554. */}
      <ComposerRefusalNote refusal={refusal} at="url" />
      <label className="mt-4 block text-xs font-medium text-muted" htmlFor="new-application-jd">Job description</label>
      <textarea id="new-application-jd" value={value.jobDescription} onChange={(event) => patch({ jobDescription: event.target.value })} rows={12} placeholder="Paste the complete job description, or fetch it from the URL above" aria-invalid={invalid("jobDescription") || undefined} className={`mt-1.5 w-full rounded-inner border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand ${invalid("jobDescription") ? "border-danger" : "border-border"}`} />
      {/* Beside the button that raised it, not in the page banner far above it. The button and this
          line are in the same flex row, so a student who can reach the button can read the refusal
          without scrolling: no scrollIntoView, no requestAnimationFrame, nothing that stops running
          in a background tab. role="alert" is here and nowhere else for this message, so a screen
          reader still hears it exactly once. */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <ComposerRefusalNote refusal={refusal} at="generate" />
        <Button type="button" onClick={onGenerate} disabled={creating} >
          {creating ? <PendingLabel state="composing" onColor>Making...</PendingLabel> : "Make my resume"}
        </Button>
      </div>
    </Card>
  );
}

/** Which composer button a refusal is answering. The composer has exactly two, far enough apart
    that a message beside one is off screen from the other. */
type ComposerSlot = "url" | "generate";

/* The refusal is written ONCE and mounted in whichever slot matches, rather than duplicated into
   both places behind two conditions. Two copies would be two live regions the day someone changes
   one condition and not the other, and a screen reader would read the same refusal twice. `at`
   holds a single value, so at most one of these ever renders anything. */
function ComposerRefusalNote({
  refusal,
  at,
}: {
  refusal: { message: string; fields: ApplicationDraftField[]; at: ComposerSlot } | null;
  at: ComposerSlot;
}) {
  if (!refusal || refusal.at !== at) return null;
  /* Gated on the refusal existing, never on it naming a field: a server failure names none, and
     that is exactly the case ISSUE-043 was about. */
  return <p className={at === "generate" ? "mr-auto text-sm text-danger" : "mt-1.5 text-sm text-danger"} role="alert">{refusal.message}</p>;
}

function ApplicationField({ label, value, onChange, placeholder, type = "text", invalid = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; invalid?: boolean }) {
  const id = `new-application-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div>
      <label className="block text-xs font-medium text-muted" htmlFor={id}>{label}</label>
      {/* aria-invalid rather than a second message per field: the one alert beside the button says
          what is wrong, and this says which boxes it meant, in both channels at once. Omitted (not
          set to "false") when valid, so nothing is announced about a field that is fine. */}
      <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-invalid={invalid || undefined} className={`mt-1.5 w-full rounded-full border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand ${invalid ? "border-danger" : "border-border"}`} />
    </div>
  );
}

/* THE HEADER IS THE APPLICANT, NOT THE SCHOOL, and `name` is a prop for a reason.
 *
 * This opened with `spec.school` in the name slot, centred and heaviest on the page, with the
 * degree beneath it: the student read their university where their own name belongs, on the screen
 * they check before sending. It is the third surface to ship that exact bug, and the cause is the
 * same every time. `ResumeSpec` has no name field. The applicant lives on `_contact.full_name`, and
 * `stripMetadata` drops `_contact` on purpose, so the editable spec this component receives cannot
 * carry a name even in principle. A component typed `spec: ResumeSpec` is therefore STRUCTURALLY
 * unable to render a header, and whatever field happens to sort first floats into the empty slot.
 *
 * So the name and the contact line arrive as their own props, off the raw packet, the same way
 * ResumePaper takes them. That is the whole fix: a renderer that needs the applicant has to be
 * given the applicant. tests/packet-resume-header.test.mjs now holds every resume surface to it.
 *
 * `name` is NOT editable here and that is deliberate. `onChange` carries a ResumeSpec, which has
 * nowhere to put a name; a field that looked editable and silently discarded the edit would be
 * worse than a printed line. The name is changed where it is stored, on the profile. */
function ResumeEditor({ spec, name, contact, editedTerms, onChange, onPatchEntry }: { spec: ResumeSpec; name: string; contact: string; editedTerms: ReadonlySet<string>; onChange: (spec: ResumeSpec) => void; onPatchEntry: (index: number, patch: Partial<ResumeSpec["experience"][number]>) => void }) {
  return (
    <div className="mx-auto max-w-[640px] rounded-inner border border-border bg-white px-5 py-5 font-serif text-[11.5px] leading-[1.35] text-black shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_-12px_rgba(0,0,0,0.18)] sm:px-8">
      {/* Name, rule, contact line: the order drawHeader() draws them in, and the order the packet
          pane shows. On a packet generated before `_contact` existed there is no name, and then
          education simply leads under its own heading rather than a blank line appearing. */}
      {name && <p className="text-center text-[15px] font-semibold leading-tight">{name}</p>}
      {contact && (
        <>
          <div className="mt-1 h-px w-full bg-neutral-300" />
          <p className="mt-1 text-center text-[9.5px] leading-tight text-neutral-600">{contact}</p>
        </>
      )}

      {/* EDUCATION as a real section, because it is one. Without the heading the school sat at the
          top of the page looking like a header, which is exactly how it came to occupy the name
          slot: nothing marked it as belonging to a section. drawEducation() emits this heading. */}
      <p className="mb-1.5 mt-4 border-b border-ink pb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]">Education</p>
      <EditableLine value={spec.school} onChange={(school) => onChange({ ...spec, school })} className="font-semibold" />
      {/* STILL two fields, never one string round-tripped through a " · " separator. The separator
          form was lossy in both directions: a degree legitimately containing " · " split wrong, and
          any third separator silently discarded the tail. R-047 was a mangled degree that could not
          be corrected, so a control that can mangle it again works against the fix.

          The drawn dot between them is gone with the centring. It existed to join two fields into
          one centred sub-heading under the school when the school was acting as the page header;
          now that education is a section, drawEducation()'s own shape applies: degree on the left,
          date pushed right. That is also the shape every experience entry below already uses, so
          the eye reads dates from one column down the whole page instead of two.

          Dropping the dot took the items-center/lg:items-baseline note with it. That was about the
          dot alone: it was the one thing in the row that was not a field, so it needed aligning
          against two 44px touch boxes. With no drawn glyph left, the fields align as fields. */}
      {/* Width comes from these wrappers, never from the textarea itself: an auto-width textarea
          falls back to its ~20-column default, which squeezed a long joint degree into a narrow
          stacked column. The degree takes the remaining space and the date gets just what it
          needs. */}
      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-muted">
        <span className="min-w-0 flex-1">
          <EditableLine value={spec.degree} onChange={(degree) => onChange({ ...spec, degree })} className="italic" />
        </span>
        <span className="w-[5.5rem] shrink-0">
          <EditableLine value={spec.grad_date} onChange={(grad_date) => onChange({ ...spec, grad_date })} className="text-right" />
        </span>
      </div>

      {/* The section heading used to render inside this map, so four jobs printed "EXPERIENCE" four
          times down the page. A resume has one Experience section containing four roles. Print the
          heading only where the section actually changes. */}
      {spec.experience.map((entry, index) => {
        const heading = sectionHeading(entry.type);
        const startsSection = startsNewSection(spec.experience.map((item) => item.type), index);
        return (
          <section key={`${entry.org}-${index}`} className={startsSection ? "mt-4" : "mt-3"}>
            {startsSection && (
              <p className="mb-1.5 border-b border-ink pb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]">{heading}</p>
            )}
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 flex-1">
                <EditableLine value={entry.org} onChange={(org) => onPatchEntry(index, { org })} className="font-semibold" />
              </span>
              {/* Wide enough for the longest real range ("September 2025 - Present") so the date
                  does not wrap, and fixed so it cannot squeeze the org name beside it. */}
              <span className="w-[9.8rem] shrink-0">
                <EditableLine value={entry.date_range} onChange={(date_range) => onPatchEntry(index, { date_range })} className="text-right text-xs text-muted" />
              </span>
            </div>
            <EditableLine value={entry.title} onChange={(title) => onPatchEntry(index, { title })} className="text-xs italic text-muted" />
            <ul className="mt-1 space-y-0.5">
              {entry.bullets.map((bullet, bulletIndex) => (
                <li key={bulletIndex} className="grid grid-cols-[12px_1fr] gap-1.5"><span>•</span><EditableHighlight value={bullet} terms={editedTerms} onChange={(value) => onPatchEntry(index, { bullets: entry.bullets.map((item, i) => (i === bulletIndex ? value : item)) })} /></li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="mt-4">
        <p className="mb-1.5 border-b border-ink pb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]">Skills</p>
        <EditableHighlight value={spec.skills.join(" • ")} terms={editedTerms} onChange={(value) => onChange({ ...spec, skills: value.split("•").map((item) => item.trim()).filter(Boolean) })} />
      </section>
    </div>
  );
}

// This was a single-line <input>, which cannot wrap, so any value wider than the column was simply
// cut off: the education headline stopped at "Marshall School of B" and date ranges at
// "September 2025 - Presen". The user could not read their own resume, let alone check it. A
// one-row textarea that grows to its content wraps instead of truncating and keeps the field
// editable in place. It is always full-width: sizing belongs to the caller's wrapper, because an
// auto-width textarea silently falls back to its ~20-column default and squeezes long values into
// a narrow stacked column.
function EditableLine({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const composing = useRef(false);

  const resize = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    /* The touch floor below lg is suspended for the duration of the measurement. scrollHeight on a
       textarea reports the padding box when the box is taller than its text, so with min-h-11 in
       force `height: auto` still resolves to 44px and the number written back is 44px rather than
       the height of the words. That bakes a breakpoint-specific figure into an inline height, and
       an inline height outranks min-height, so the field then stays 44px on the desktop layout with
       no way back down short of a re-measure. Measuring with the floor off keeps this value the
       content height at every width, which is what makes crossing lg need no re-measure at all. */
    node.style.minHeight = "0";
    node.style.height = `${node.scrollHeight}px`;
    node.style.minHeight = "";
  }, []);

  // useLayoutEffect, not useEffect: measuring after paint made every field flash at one-row height
  // before growing on first render.
  useLayoutEffect(resize, [resize, value]);

  // Re-measure on anything that changes the wrap point rather than only on value change. The
  // element carries overflow-hidden and a JS-set pixel height, so a stale height silently CLIPS
  // with no scrollbar and no ellipsis, which is worse than the truncation this replaced. Crossing
  // the xl:grid-cols-2 breakpoint, zooming, and a late-loading webfont all move the wrap point
  // without touching the value. The school headline is the sharpest case: it is text-sm sm:text-lg,
  // so its CONTENT height changes at 640px (20px to 28px) even though the stored inline height is
  // otherwise breakpoint-independent. Nothing but this observer catches that.
  //
  // This observer was reported dead twice, on 2026-08-03, by agents who forced the parent width and
  // saw zero re-measure. It is not dead, and nothing here needs changing. Both reports were taken
  // in a tab where document.visibilityState was "hidden", which suspends the whole rendering
  // lifecycle: in that state requestAnimationFrame never runs and ResizeObserver delivers nothing,
  // not even the initial observation a freshly constructed observer is owed. A control observer
  // built in the same tab, on the same two elements, fired zero times, which is the tell that the
  // harness and not the code was the subject of the measurement.
  //
  // Measured again the same day in headless Chromium with rendering actually running, against this
  // exact code: forcing the parent 446px -> 120px -> 446px moved the school headline 28 -> 168 ->
  // 28px, 375 -> 1280 finished at 28px (equal to a fresh load at 1280), and 1280 -> 375 finished at
  // a 20px content height inside the 44px touch floor, with scrollHeight == clientHeight, i.e. no
  // clipping in either direction. If this is ever re-reported, check document.visibilityState in
  // the measuring tab before touching this effect.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => resize());
    observer.observe(node);
    if (node.parentElement) observer.observe(node.parentElement);
    void document.fonts?.ready.then(resize).catch(() => {});
    return () => observer.disconnect();
  }, [resize]);

  // These fields were structurally single-line under <input>: an org, a title, a date range and the
  // school headline cannot contain a newline, and the element guaranteed it. A textarea removes
  // that guarantee, and the value flows straight into the resume spec, the rendered PDF and the
  // portal autofill payload, where a newline in a date or org field is a broken line at best and a
  // mis-parsed ATS field at worst. Wrapping is a presentation need; multi-line content is not.
  const commit = (raw: string) => onChange(raw.replace(/\s*[\r\n]+\s*/g, " "));

  return (
    <textarea
      ref={ref}
      aria-label="Editable resume text"
      rows={1}
      value={value}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
      }}
      // Intermediate IME states (Japanese, Chinese, Korean, dead-key accents) must reach the DOM
      // untouched: rewriting the value mid-composition drops pre-edit characters and jumps the
      // caret. Commit the cleaned value once the composition ends.
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        commit(event.currentTarget.value);
      }}
      onChange={(event) => {
        if (composing.current) onChange(event.target.value);
        else commit(event.target.value);
      }}
      // Touch sizing below lg only. These fields render at 12-13px with a 16-20px line box, so on a
      // phone the tap target for "Product Engineer" was 16px tall: under the 44px comfort figure,
      // and under the 24px WCAG 2.5.8 AA floor as well, on the primary editing affordance of the
      // product's core screen. Above lg the floor lifts entirely, because the editor is deliberately
      // compact there so it reads as a document rather than as a form.
      //
      // min-height ONLY, deliberately: nothing here may change what `resize` measures. That function
      // writes an inline pixel height, and an inline height outranks min-height, so a floor built
      // out of padding would be baked into the measured value and would then have to be measured
      // away again on the way back up. The first attempt did exactly that and left all nine fields
      // stuck at 44px on the desktop layout after dragging a window past lg. Because min-height is
      // the only thing that varies by breakpoint, the inline height stays the content height at
      // every width, and crossing lg needs no re-measure at all: the floor simply stops applying and
      // the box drops straight back to it.
      //
      // content-center is what puts the words in the middle of that taller box instead of along its
      // top edge. It is alignment, not sizing, so unlike padding it is invisible to scrollHeight and
      // cannot get baked into the measurement. A browser without align-content on block containers
      // just leaves the text at the top, which is untidy but fully usable, so this degrades rather
      // than breaks.
      className={`w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none focus:ring-1 focus:ring-brand/30 min-h-11 content-center lg:min-h-0 lg:content-normal ${className}`}
    />
  );
}

function EditableHighlight({ value, terms, onChange }: { value: string; terms: ReadonlySet<string>; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <textarea autoFocus aria-label="Edit optimized resume text" value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => setEditing(false)} rows={Math.max(2, Math.ceil(value.length / 75))} className="w-full resize-none rounded-inner border border-brand bg-white px-2 py-1 outline-none" />
  ) : (
    <button type="button" onClick={() => setEditing(true)} className="text-left leading-[1.35] hover:bg-brand-soft/50 focus:outline-none focus:ring-2 focus:ring-brand/30">
      {/* hideMissing: an amber "asked for and NOT on your resume" mark cannot honestly appear on
          the resume. If the word were here the scorer would have counted it as covered. */}
      <RequirementText text={value} editedTerms={terms} hideMissing />
    </button>
  );
}

function QuestionsScreen({ questions, onChange, onBack, onSubmit, reviewDiscovered = false }: { questions: ApplicationQuestion[]; onChange: (questions: ApplicationQuestion[]) => void; onBack: () => void; onSubmit: () => void; reviewDiscovered?: boolean }) {
  const missingQuestions = questions.filter((question) => question.required && !question.answer.trim());
  const visibleQuestions = reviewDiscovered ? questions : missingQuestions;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={onBack} className="text-sm text-muted hover:text-ink">← {reviewDiscovered ? "Back to how it is going" : "Back to resume"}</button>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-teal-ink">{reviewDiscovered ? "Their questions" : "Questions we could not answer"}</p>
        <h2 className="mt-2 text-heading font-medium tracking-tight text-ink">{reviewDiscovered ? "The company asked for these." : "A few answers we could not work out."}</h2>
        <p className="mt-1 text-sm text-muted">{reviewDiscovered ? "The form asked for things we did not know. Answer them, then try again." : "Everything we already knew is filled in. This page only shows the blanks."}</p>
      </div>
      {visibleQuestions.map((question) => (
        <Card key={question.id} className="p-6">
          <label htmlFor={`question-${question.id}`} className="text-sm font-medium text-ink">{question.question}</label>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-teal-ink">{question.required && !question.answer.trim() ? "Required information missing" : "Review before retry"}</p>
          <textarea id={`question-${question.id}`} value={question.answer} onChange={(event) => onChange(questions.map((item) => item.id === question.id ? { ...item, answer: event.target.value } : item))} rows={6} className="mt-4 w-full rounded-inner border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand" />
        </Card>
      ))}
      {/* Same trap as the review screen, one screen later: N six-row textareas and then the button
          that ends the screen, so at 744px the action is off the bottom of a document whose every
          other element eats the keyboard. Same treatment. */}
      <TerminalActionBar className="justify-end">
        <Button onClick={onSubmit} >{reviewDiscovered ? "Save answers and try again" : "Save answers and make my application"}</Button>
      </TerminalActionBar>
    </div>
  );
}

function SubmissionScreen({ packet, submission, approving, educationProfile, educationProfileStatus, onCheckResume, onHandoffComplete, onApprove, onRetry, onReviewQuestions }: { packet: GeneratedResume; submission: SubmissionResponse; approving: boolean; educationProfile: EducationProfile | null; educationProfileStatus: EducationProfileStatus; onCheckResume: () => void; onHandoffComplete: () => void; onApprove: () => void; onRetry: () => void; onReviewQuestions: () => void }) {
  const { review } = submission;
  const needsAttention = review.status === "needs_attention";
  const hasQuestionsToReview = needsAttention && review.questions.length > 0;
  const coverLetterPending = review.cover_letter_supported === true && !submission.cover_letter;
  const requiredAnswerMissing = review.questions.some((question) => question.required && !(question.answer ?? "").trim());
  const educationDriftWarning = educationDriftMessage(educationDrift(packet.spec, educationProfile));
  const educationProfilePending = educationProfileStatus !== "ready";
  const [previewState, setPreviewState] = useState<{ url: string; loaded: boolean; failed: boolean } | null>(null);
  const previewUrl = review.preview_screenshot_url ?? "";
  const previewLoaded = Boolean(previewUrl) && previewState?.url === previewUrl && previewState.loaded;
  const previewFailed = Boolean(previewUrl) && previewState?.url === previewUrl && previewState.failed;
  const previewReady = Boolean(previewUrl) && previewLoaded && !previewFailed;
  const finalApprovalBlocked = educationProfilePending || Boolean(educationDriftWarning) || coverLetterPending || requiredAnswerMissing || !previewReady || approving;
  function approveVerifiedPreview() {
    if (finalApprovalBlocked) return;
    onApprove();
  }
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_1.15fr]">
      <Card className="p-7">
        <p className="text-xs text-muted">Filling it in for you</p>
        <h2 className="mt-2 text-heading font-medium text-ink">{needsAttention ? "This one needs you." : review.status === "failed" ? "Litos stopped before sending." : "Check it over before it goes."}</h2>
        {/* The backend joins blockers with newlines, but they were rendered into a single <p>, where
            HTML collapses the breaks. Four separate blockers arrived as one run-on sentence, which
            is how "CAPTCHA requires your attention ... is required required field is required ..."
            reached the screen. Each blocker is its own item, because each is its own task. */}
        {needsAttention ? (
          <BlockerList reason={review.attention_reason} />
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted">
            {review.status === "failed" ? userFacingError(review.submission_error, "Litos could not open the company’s form. Try again in a minute.") : "You asked to check every application first. Look it over, then send it when you are happy."}
          </p>
        )}
        {review.status === "ready_for_final_approval" && educationDriftWarning && (
          <div role="alert" className="mt-4 rounded-inner bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">
            <p>{educationDriftWarning}</p>
            <button type="button" onClick={onCheckResume} className="mt-3 rounded-full bg-danger px-4 py-2 text-sm font-medium text-white">Check resume</button>
          </div>
        )}
        {review.status === "ready_for_final_approval" && educationProfilePending && (
          <p role="alert" className="mt-4 rounded-inner bg-warn-soft px-4 py-3 text-sm leading-6 text-warn">
            {educationProfileStatus === "loading"
              ? "Litos is checking this resume against your current profile before it can be sent."
              : "Litos could not check this resume against your current profile. Reload, then review it again before sending."}
          </p>
        )}
        {review.filled_fields && review.filled_fields.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium text-muted">Fields filled by Litos</p>
            <div className="mt-2 flex flex-wrap gap-2">{review.filled_fields.map((field) => <Chip key={field} label={field.replace("question:", "Answer: ")} kind="ready" />)}</div>
          </div>
        )}
        {submission.cover_letter && (
          <div className="mt-6 rounded-inner border border-border bg-surface-alt p-4">
            <p className="text-xs font-medium text-muted">Cover letter included with final submission</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink">{submission.cover_letter.body}</p>
            {submission.cover_letter.warnings.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-warn">
                {submission.cover_letter.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </div>
        )}
        {coverLetterPending && <p className="mt-6 text-sm text-muted">Loading the exact cover letter that will be attached before final approval.</p>}
        {review.status === "ready_for_final_approval" && (
          <div className="mt-6 rounded-inner border border-border bg-surface-alt p-4">
            <p className="text-xs font-medium text-muted">Resume attached to this application</p>
            <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-inner border border-border bg-white p-2">
              <ResumePaper spec={stripMetadata(packet.spec)} name={contactName(packet.spec)} contact={contactLine(packet.spec)} />
            </div>
            {packet.download_url && packet.download_url !== "#" && (
              <a href={packet.download_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-medium text-brand-ink underline-offset-2 hover:underline">
                Open exact PDF
              </a>
            )}
          </div>
        )}
        {review.status === "ready_for_final_approval" && review.questions.length > 0 && (
          <div className="mt-6 rounded-inner border border-border bg-surface-alt p-4">
            <p className="text-xs font-medium text-muted">Answers included with final submission</p>
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-inner border border-border bg-surface">
              {review.questions.map((question) => (
                <div key={question.id} className="px-3 py-3">
                  <p className="text-xs font-medium leading-5 text-ink">{question.question}</p>
                  <p className={`mt-1 whitespace-pre-line text-xs leading-5 ${(question.answer ?? "").trim() ? "text-muted" : question.required ? "text-warn" : "text-faint"}`}>
                    {(question.answer ?? "").trim() || (question.required ? "Left blank, and this one is required" : "Left blank")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {review.verification?.status === "completed" && (
          <div className="mt-4 rounded-inner border border-border bg-surface-alt px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-teal-ink">Code found</p>
            <p className="mt-1 text-xs text-muted">
              Litos used the one-time code from your connected {review.verification.provider === "outlook" ? "Outlook" : "Gmail"} account. The code was not saved.
            </p>
          </div>
        )}
        {review.verification?.status === "handoff" && (
          <div className="mt-4 rounded-inner border border-border bg-surface px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">The code needs you</p>
            <p className="mt-1 text-xs text-muted">
              Litos was not sure it finished this step. Open the company page and finish it yourself.
            </p>
          </div>
        )}
        <div className="mt-7 flex flex-wrap gap-2">
          {needsAttention && submission.handoff_url && <a href={submission.handoff_url} target="_blank" rel="noreferrer" className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Open the company page</a>}
          {hasQuestionsToReview && <Button onClick={onReviewQuestions} >Check the answers</Button>}
          {needsAttention && <Button onClick={onRetry} variant="secondary">Try again</Button>}
          {needsAttention && <Button onClick={onHandoffComplete} variant="secondary">I finished it myself</Button>}
          {review.status === "failed" && <Button onClick={onRetry} >Try again</Button>}
          {review.status === "ready_for_final_approval" && educationDriftWarning && <Button onClick={onCheckResume} variant="secondary">Check resume</Button>}
          {review.status === "ready_for_final_approval" && <button onClick={approveVerifiedPreview} disabled={finalApprovalBlocked} className="rounded-full bg-positive px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-positive disabled:opacity-50">Send it</button>}
        </div>
        {review.status === "ready_for_final_approval" && educationDriftWarning && (
          <p className="mt-3 text-xs leading-5 text-warn">
            Save the corrected resume, then Litos will refill the company form with the updated PDF.
          </p>
        )}
        {review.status === "ready_for_final_approval" && educationProfilePending && (
          <p className="mt-3 text-xs leading-5 text-warn">
            The current profile check has to finish before this can be sent.
          </p>
        )}
        {review.status === "ready_for_final_approval" && !previewReady && (
          <p className="mt-3 text-xs leading-5 text-warn">
            Litos has to show the filled form preview before this can be sent.
          </p>
        )}
        {review.status === "ready_for_final_approval" && requiredAnswerMissing && (
          <p className="mt-3 text-xs leading-5 text-warn">
            A required answer is still blank. Check the answers before sending.
          </p>
        )}
        <p className="mt-5 text-xs leading-5 text-faint">Litos will never pretend to be you. It will not get past the puzzle that checks you are human, a code on your phone, a login, or anything you have to swear to. It only says an application is sent once the company confirms it.</p>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4"><p className="text-sm font-medium text-ink">What the form looked like after we filled it in</p></div>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="The company's application page after Litos filled it in"
            className="h-auto w-full"
            onLoad={() => setPreviewState({ url: previewUrl, loaded: true, failed: false })}
            onError={() => setPreviewState({ url: previewUrl, loaded: false, failed: true })}
          />
        ) : (
          <div className="p-10 text-center text-sm text-muted">Litos is still taking the picture.</div>
        )}
      </Card>
    </div>
  );
}

function SubmissionReceipt({ review, role, company }: { review: ApplicationReview; role: string; company: string }) {
  const receipt = review.receipt;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <CenteredState title="Sent to the company." body={`${role} at ${company} is complete. The company confirmed receipt.`} />
      {receipt && <Card className="overflow-hidden">
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <div><p className="font-mono text-[11px] uppercase tracking-[0.08em] text-positive">Proof it was sent</p><p className="mt-2 text-sm leading-6 text-ink">{receipt.confirmation_text}</p></div>
          <dl className="space-y-3 text-sm"><div><dt className="text-xs text-muted">Captured</dt><dd className="text-ink">{new Date(receipt.captured_at).toLocaleString()}</dd></div>{receipt.reference_id && <div><dt className="text-xs text-muted">Reference</dt><dd className="font-mono text-ink">{receipt.reference_id}</dd></div>}<div><dt className="text-xs text-muted">Where it was sent</dt><dd><a href={receipt.final_url} target="_blank" rel="noreferrer" className="break-all text-brand-ink underline">Open confirmation</a></dd></div></dl>
        </div>
        {receipt.screenshot_url && <img src={receipt.screenshot_url} alt="The company's confirmation that the application arrived" className="h-auto w-full border-t border-border" />}
      </Card>}
    </div>
  );
}

function CenteredState({ title, body, loading = false }: { title: string; body: string; loading?: boolean }) {
  return <Card className="mx-auto max-w-2xl p-12 text-center">{loading ? <div className="mx-auto flex h-16 w-16 items-center justify-center"><ThinkingOrb state="searching" size={64} /></div> : <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-positive-soft text-positive"><svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true"><path d="M4 8.5l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}<h2 className="mt-5 text-xl font-medium text-ink">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{body}</p></Card>;
}

function BlockerList({ reason }: { reason?: string }) {
  const safeReason = userFacingError(reason, "Litos could not finish the company’s form. Try again in a minute.");
  const blockers = reason ? safeReason.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  if (blockers.length === 0) {
    return <p className="mt-2 text-sm leading-6 text-muted">Finish the last step on the company&apos;s page.</p>;
  }
  if (blockers.length === 1) {
    return <p className="mt-2 text-sm leading-6 text-muted">{blockers[0]}</p>;
  }
  return (
    <ul className="mt-3 space-y-1.5">
      {blockers.map((blocker, index) => (
        <li key={index} className="grid grid-cols-[14px_1fr] gap-2 text-sm leading-6 text-muted">
          <span aria-hidden className="mt-[1px] text-faint">•</span>
          <span>{blocker}</span>
        </li>
      ))}
    </ul>
  );
}

// A real portal run took over two minutes against Greenhouse with no elapsed time, no detail and no
// timeout, which is indistinguishable from a hung run: the operator's only move was a manual reload,
// and a user's would be to re-trigger a run that was working fine.
const PORTAL_SLOW_AFTER_S = 45;
// Past this the client genuinely cannot claim the run is healthy, only that the last poll returned a
// non-terminal status. Saying "still running" identically at 45 seconds and at 45 minutes just moves
// the original defect past the first threshold.
const PORTAL_STUCK_AFTER_S = 300;

function PortalProgress({ status, startedAt, sending = false }: { status?: ApplicationReview["status"]; startedAt?: string;
  /** True when this screen was entered by pressing "Send it". See submittingPhase. */
  sending?: boolean }) {
  // Anchored to the server's timestamp, not to mount. A reload or a return via ?application=<id>
  // during a live run remounts this component, and a mount-anchored clock would restart at 0s and
  // report "3s elapsed" for a run four minutes old, defeating the one thing the clock is for.
  // Parsing stays pure and returns null when there is no usable timestamp; the effect below picks
  // the mount-time fallback, because reading the clock during render is both impure
  // (react-hooks/purity) and a server/client hydration mismatch.
  const startedMs = useMemo(() => {
    const parsed = startedAt ? Date.parse(startedAt) : NaN;
    return Number.isNaN(parsed) ? null : parsed;
  }, [startedAt]);

  // Starts at 0 rather than reading the clock in the initializer: a useState initializer must be
  // pure (react-hooks/purity), and Date.now() there also differs between the server render and the
  // client hydration. The effect corrects it to the true elapsed time on the first tick, which runs
  // immediately rather than after a second's delay.
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Deliberately a self-rescheduling timeout rather than an interval. The repo bans setInterval in
    // this file (tests/application-submission-gate.test.mjs) so portal polling can never stack
    // overlapping requests, and a display clock is not worth carving an exception into that rule.
    let timer: number | undefined;
    let cancelled = false;
    const anchor = startedMs ?? Date.now();
    const tick = () => {
      if (cancelled) return;
      setElapsed(Math.max(0, Math.floor((Date.now() - anchor) / 1000)));
      timer = window.setTimeout(tick, 1000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [startedMs]);

  // The old copy asserted "Nothing is submitted during this preparation step" on every status,
  // including the genuinely-submitting one. That reassurance was false at exactly the moment it
  // mattered most, so each stage now states only what is true of that stage.
  //
  // `sending` is first and is not redundant with the status test. During an approve the status on
  // hand is still `ready_for_final_approval` for the whole request, because the response that
  // changes it is the thing being awaited, so the status alone put the "nothing is sent yet" line
  // on screen for the entire duration of the send. What the caller pressed is known immediately;
  // the status only catches up afterwards. Unlike the routing problem above, this one does NOT
  // depend on the tab being hidden: the poll cannot fix it either, because the status genuinely is
  // still ready_for_final_approval until the send returns.
  const submitting = sending || status === "submitting" || status === "submission_claimed";
  const title = submitting ? "Sending it to the company now." : "Getting the company's page ready.";
  const body = submitting
    ? "You told Litos to send this. It is finishing the form now, and will not say it is sent until the company confirms it."
    : "Litos is typing in your saved answers, your new resume, and the cover letter you approved. Nothing is sent yet.";

  const milestone =
    elapsed >= PORTAL_STUCK_AFTER_S
      ? "This is taking longer than usual. It is still going, so you can leave this page and come back. If it has not moved soon, start the application again."
      : elapsed >= PORTAL_SLOW_AFTER_S
        ? "This normally takes a few minutes. It is still going."
        : null;

  return (
    <div className="space-y-3">
      <CenteredState title={title} body={body} loading />
      {/* aria-hidden on the ticking number: as an aria-live region it announced "1s elapsed, 2s
          elapsed, 3s elapsed" every second for the several minutes a run takes, burying the
          terminal state under it. The live region belongs on the milestone copy, which changes
          twice in a run. */}
      <p className="text-center text-xs text-muted" aria-hidden>
        {formatElapsed(elapsed)} elapsed
      </p>
      {milestone && (
        <p role="status" className="mx-auto max-w-lg text-center text-xs text-muted">
          {milestone}
        </p>
      )}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

// "Needs attention" and "Stopped safely" were painted in the same ready/success treatment as
// "Ready for review", so the label was the only signal anything was wrong.
function chipKind(status: ApplicationReview["status"]): "sent" | "ready" | "warn" | "bounced" {
  if (status === "submitted") return "sent";
  if (status === "needs_attention" || status === "failed") return "bounced";
  if (status === "ready_for_final_approval") return "warn";
  return "ready";
}

function applicationCardClasses(packet: GeneratedResume, selected: boolean): string {
  const status = packet.spec._review?.status;
  const semantic = status === "submitted"
    ? "border border-positive/20 bg-positive-soft text-positive"
    : status === "needs_attention" || status === "failed"
      ? "border border-danger/20 bg-danger-soft text-danger"
      : "border border-border bg-surface text-ink hover:border-brand/35 hover:bg-brand-soft/35";
  return selected ? `${semantic} ring-2 ring-brand ring-offset-2` : semantic;
}
