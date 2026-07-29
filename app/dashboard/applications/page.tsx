"use client";

import { Button } from "@/components/app/Button";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  getStoredEmail,
  type ApplicationQuestion,
  type ApplicationProfile,
  type ApplicationReview,
  type CoverLetter,
  type GeneratedResume,
  type MonitoredJob,
  type ResumeSpec,
} from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, PendingLabel, ShimmerRows, formatRelativeDate } from "@/components/app/ui";
import { ThinkingOrb } from "thinking-orbs";
import { explicitTerms, mergeDiscoveredQuestions, portalName, reviewablePackets as onlyReviewablePackets, sectionHeading, startsNewSection, statusLabel } from "@/lib/application-review";
import { MIN_JD_CHARS, canGenerateFrom, packetMatchesJob } from "@/lib/daily-matches";
import { MatchScore, MatchGaps } from "@/components/app/MatchScore";
import { ResumeHealth } from "@/components/app/ResumeHealth";
import { Board } from "@/components/app/Board";
import { AutopilotToggle, NextMatchCard, useAutopilot, type NextMatch } from "@/components/app/Autopilot";
import { InterviewPrep } from "@/components/app/InterviewPrep";
import { fetchJdMatch, resumeSpecText } from "@/lib/jd-match";
import { applyBankVariant, type ApplyOutcome } from "@/lib/apply-variant";
import { RequirementProvider, RequirementText, MatchLegend } from "@/components/app/RequirementText";
import { buildRequirementIndex, EMPTY_REQUIREMENT_INDEX } from "@/lib/requirement-terms";
import type { JdMatchResponse } from "@/lib/jd-match";

type Screen = "review" | "questions" | "submitting" | "portal" | "submitted";
type ApplicationFilter = "all" | "action" | "ready" | "submitted";
type ApplicationSort = "recent" | "company";
type SubmissionResponse = { application_id: string; review: ApplicationReview; cover_letter?: CoverLetter | null; handoff_url?: string; configured?: boolean };

type ResumeGenerationResponse = { resume_id: string; application?: GeneratedResume };
type CoverLetterResponse = { cover_letter: CoverLetter; download_url: string };
type ProfileIdentity = { full_name?: string; email?: string };
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

export default function Applications() {
  const [packets, setPackets] = useState<GeneratedResume[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mirrors selectedId for in-flight async work to compare against. State reads inside an awaited
  // callback are the value captured when the callback was created, which is exactly the stale value
  // a cross-packet race needs to go unnoticed.
  const selectedIdRef = useRef<string | null>(null);
  const [spec, setSpec] = useState<ResumeSpec | null>(null);
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [screen, setScreen] = useState<Screen>("review");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [qaMode, setQaMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [extractingJd, setExtractingJd] = useState(false);
  const [showNewApplication, setShowNewApplication] = useState(false);
  const [newApplication, setNewApplication] = useState(EMPTY_APPLICATION_DRAFT);
  const [pendingJob, setPendingJob] = useState<MonitoredJob | null>(null);
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
  const [coverLetterBody, setCoverLetterBody] = useState("");
  const [coverLetterDownloadUrl, setCoverLetterDownloadUrl] = useState<string | null>(null);
  const [coverLetterBusy, setCoverLetterBusy] = useState(false);
  // Seeded from ?state= so the Overview metrics are real filter links rather than decoration.
  // Read once at mount: after that the select on this page is the only thing that moves it.
  const [applicationFilter, setApplicationFilter] = useState<ApplicationFilter>(() => {
    if (typeof window === "undefined") return "all";
    const requested = new URLSearchParams(window.location.search).get("state");
    return requested === "action" || requested === "ready" || requested === "submitted" ? requested : "all";
  });
  const [applicationSort, setApplicationSort] = useState<ApplicationSort>("recent");

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
   * All the judgement lives in lib/apply-variant.ts, which is pure and tested. This only records
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
    moveToScreen(status === "submitted" ? "submitted" : ["submit_requested", "preparing", "filling", "submitting", "submission_claimed"].includes(status ?? "") ? "submitting" : ["needs_attention", "ready_for_final_approval", "failed"].includes(status ?? "") ? "portal" : "review");
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
    if (result.review.status === "submitted") moveToScreen("submitted");
    else if (["needs_attention", "ready_for_final_approval", "failed"].includes(result.review.status)) moveToScreen("portal");
    else moveToScreen("submitting");
  }, [moveToScreen, qaMode, selectedId]);

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
        setPackets(Object.values(QA_SCENARIOS));
        selectPacket(packet);
      });
      return;
    }
    let cancelled = false;
    api<{ resumes: GeneratedResume[] }>("/resume/history")
      .then((result) => {
        if (cancelled) return;
        const reviewable = onlyReviewablePackets(result.resumes);
        setPackets(result.resumes);
        const requestedId = new URLSearchParams(window.location.search).get("application");
        const requested = reviewable.find((packet) => packet.id === requestedId);
        const first = requested ?? reviewable[0];
        if (first) selectPacket(first);
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "We could not load your applications. Reload the page."));
    return () => {
      cancelled = true;
    };
  }, [selectPacket]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    if (params.get("new") === "1") queueMicrotask(() => setShowNewApplication(true));
    if (!jobId) return;
    if (qaMode) return;
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
        if (canGenerateFrom(draft)) {
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
    const filtered = reviewablePackets.filter((packet) => {
      const status = packet.spec._review?.status;
      if (applicationFilter === "action") return ["needs_attention", "ready_for_final_approval", "failed"].includes(status ?? "");
      if (applicationFilter === "ready") return ["resume_ready", "questions_ready", "ready_to_submit"].includes(status ?? "");
      if (applicationFilter === "submitted") return status === "submitted";
      return true;
    });
    return [...filtered].sort((a, b) => applicationSort === "company"
      ? (a.job_context.company ?? "").localeCompare(b.job_context.company ?? "")
      : packetTimestamp(b).localeCompare(packetTimestamp(a)));
  }, [applicationFilter, applicationSort, reviewablePackets]);
  const legacyCount = (packets?.length ?? 0) - reviewablePackets.length;

  /* ---- sending without being asked ----
     The setting itself lives on the server and is shared with Account; this page reads it, shows
     what it is doing while it is on, and gives the student the seconds in which to stop it. */
  const autopilot = useAutopilot();

  /* Statuses that mean "this one is finished and nothing is stopping it". Deliberately the same
     list the "Ready" filter uses: two different definitions of ready on one page is how a student
     ends up watching something send that the filter told them was not ready. */
  const READY_TO_SEND = useMemo(() => ["resume_ready", "questions_ready", "ready_to_submit"], []);

  const nextPacket = useMemo(
    () =>
      reviewablePackets
        .filter((packet) => READY_TO_SEND.includes(packet.spec._review?.status ?? ""))
        .sort((a, b) => packetTimestamp(b).localeCompare(packetTimestamp(a)))[0] ?? null,
    [READY_TO_SEND, reviewablePackets],
  );

  /* Keyed by the packet it was measured against. A bare number would survive the card changing
     underneath it and print one job's score on another job's row. */
  const [nextScore, setNextScore] = useState<{ id: string; score: number | null } | null>(null);
  useEffect(() => {
    const jd = nextPacket?.spec._review?.jd_text;
    if (!nextPacket || !jd) return;
    let cancelled = false;
    void fetchJdMatch(jd, resumeSpecText(nextPacket.spec), { company: nextPacket.job_context.company, role: nextPacket.job_context.role })
      .then((result) => !cancelled && setNextScore({ id: nextPacket.id, score: result.scorable ? result.score : null }))
      // No number rather than a wrong one.
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [nextPacket]);

  const nextMatch: NextMatch | null = nextPacket
    ? {
        id: nextPacket.id,
        company: nextPacket.job_context.company ?? "Company",
        role: nextPacket.job_context.role ?? "Role",
        score: nextScore?.id === nextPacket.id ? nextScore.score : null,
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
      try {
        const result = await api<SubmissionResponse>(`/applications/${id}/submit-request`, {
          method: "POST",
          body: JSON.stringify({ questions: packet.spec._review?.questions ?? [] }),
        });
        setPackets((current) => current?.map((item) => (item.id === id ? { ...item, spec: { ...item.spec, _review: result.review } } : item)) ?? current);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not send that application on its own. It is still here for you.");
      }
    },
    [packets, qaMode],
  );
  // The review surface is meant to be read without scrolling, so while it is open the page chrome
  // above it shrinks to what is still useful: the title stays for orientation, the tagline and the
  // legacy-resumes banner go, because together they cost roughly 120px of the one screen the JD and
  // the resume are supposed to share.
  const reviewOpen = Boolean(selected && spec && review) && screen === "review";
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
    setNewApplication((current) => {
      const identityChanged = next.company !== current.company || next.role !== current.role;
      return identityChanged ? { ...next, jobId: null } : next;
    });
  }

  async function fetchJobDescription() {
    const portalUrl = newApplication.portalUrl.trim();
    if (!portalUrl) {
      setError("Add the job link first, then get the description.");
      return;
    }
    try {
      if (new URL(portalUrl).protocol !== "https:") throw new Error("Job URL must use HTTPS");
    } catch {
      setError("Enter a complete job URL beginning with https://.");
      return;
    }
    setExtractingJd(true);
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
      setError(err instanceof ApiError ? err.message : "We could not read that page. Paste the job description below instead.");
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
    if (!company || !role || !portalUrl || jobDescription.length < MIN_JD_CHARS) {
      setError("Fill in all four boxes first.");
      return;
    }
    try {
      if (new URL(portalUrl).protocol !== "https:") throw new Error("Job URL must use HTTPS");
    } catch {
      setError("Enter a complete job URL beginning with https://.");
      return;
    }

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
      setNotice("Your resume is ready. We will check whether this employer wants a cover letter.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not build this application. Check the job description and try again.");
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
    moveToScreen("submitting");
    setError(null);
    try {
      if (!qaMode) {
        const result = await api<SubmissionResponse>(`/applications/${selected.id}/submit-request`, {
          method: "POST",
          body: JSON.stringify({ questions: finalQuestions }),
        });
        setSubmission(result);
        setPackets((current) => current?.map((packet) => packet.id === selected.id ? { ...packet, spec: { ...packet.spec, _review: result.review } } : packet) ?? current);
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
    setError(null);
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
        setSubmission(result);
      }
    } catch (reason) {
      moveToScreen("portal");
      setError(reason instanceof Error ? reason.message : "Could not approve the final portal submission.");
    }
  }

  if (error && packets === null) return <ErrorNote message={error} />;

  return (
    <div className={reviewOpen ? "space-y-4" : "space-y-6"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={`font-normal leading-[1.15] tracking-[-0.02em] text-ink ${reviewOpen ? "text-heading" : "text-section"}`}>Applications</h1>
          {!reviewOpen && <p className="mt-1 text-sm text-muted">Review and track.</p>}
          {/* Gated on `selected`, not on reviewOpen. A packet auto-selects on load, and it can land
              on ANY of the screens (review, questions, portal, the submitted receipt), none of
              which had a way back to the list. Gating on reviewOpen left every other screen a dead
              end, which is how the board turned out to be unreachable. */}
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
        <div className="flex flex-wrap items-center gap-4">
          {/* Always on the page header, including while one application is open. A packet
              auto-selects on load, so gating this on the board view would have hidden the switch
              on the screen almost every visit actually lands on. */}
          <AutopilotToggle
            enabled={autopilot.enabled}
            eligibility={autopilot.eligibility}
            saving={autopilot.saving}
            onToggle={(next) => void autopilot.toggle(next)}
          />
          <Button type="button" onClick={() => setShowNewApplication((current) => !current)}>
            {showNewApplication ? "Close" : "Add a job link"}
          </Button>
        </div>
      </div>

      {autopilot.error && <ErrorNote message={autopilot.error} />}
      {!selected && packets !== null && reviewablePackets.length > 0 && (
        <NextMatchCard
          match={nextMatch}
          autopilot={Boolean(autopilot.enabled)}
          appliedToday={appliedToday}
          onSend={(id) => void sendWithoutAsking(id)}
          onOpen={(id) => {
            const packet = (packets ?? []).find((item) => item.id === id);
            if (packet) selectPacket(packet);
          }}
        />
      )}

      {error && <ErrorNote message={error} />}
      {notice && <p role="status" className="rounded-inner bg-positive-soft px-4 py-3 text-sm text-positive">{notice}</p>}
      {showNewApplication && (
        <NewApplicationPanel
          value={newApplication}
          onChange={applyDraftEdit}
          onGenerate={createApplication}
          creating={creating}
          onFetchJobDescription={fetchJobDescription}
          extractingJd={extractingJd}
        />
      )}
      {legacyCount > 0 && !reviewOpen && (
        <p className="border-y border-border py-3 text-sm text-muted">
          {legacyCount} saved resume{legacyCount === 1 ? "" : "s"} · Add a job URL to turn one into a reviewable application.
        </p>
      )}

      {selected && reviewablePackets.length > 1 && (
        /* Keep the switcher above every screen branch. Historical marker for the invariant:
           packet.job_context.role} · {packet.job_context.company} */
        <section aria-labelledby="application-ledger-heading" className="border-y border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-baseline gap-2">
              <h2 id="application-ledger-heading" className="sr-only">Your applications</h2>
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
          {/* Whole rows: max-h-72 cut the fifth row in half, which reads as a broken layout
              rather than as "there is more below". */}
          <div className="max-h-[280px] overflow-y-auto border-t border-border">
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
                    <button key={packet.id} onClick={() => selectPacket(packet)} aria-pressed={packet.id === selected.id} className={`grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 text-left transition-colors sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] ${packet.id === selected.id ? "bg-brand-soft/55" : "hover:bg-surface-alt"}`}>
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
        <Board
          openableIds={new Set((packets ?? []).map((item) => item.id))}
          onOpen={(id) => {
            const packet = (packets ?? []).find((item) => item.id === id);
            if (packet) selectPacket(packet);
          }}
        />
      ) : screen === "questions" ? (
        <QuestionsScreen
          questions={questions}
          onChange={setQuestions}
          onBack={() => moveToScreen(submission?.review.status === "needs_attention" ? "portal" : "review")}
          onSubmit={() => prepareApplication()}
          reviewDiscovered={submission?.review.status === "needs_attention"}
        />
      ) : screen === "submitting" ? (
        <PortalProgress status={submission?.review.status} startedAt={submission?.review.updated_at} />
      ) : screen === "portal" && submission ? (
        <SubmissionScreen submission={submission} onHandoffComplete={completeHandoff} onApprove={approveFinalSubmission} onRetry={retryPreparation} onReviewQuestions={reviewPortalQuestions} />
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
                <MatchScore jdText={review.jd_text} spec={deferredSpec ?? spec} jobContext={selected.job_context} onResult={setMatchResult} />
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
                  <ResumeEditor spec={spec} editedTerms={editedTerms} onChange={setSpec} onPatchEntry={patchEntry} />
                  {/* Under the resume, inside the same scroll area: the checks describe the page
                      directly above them, so they belong to it rather than to the screen. */}
                  <div className="mx-auto mt-5 max-w-[640px] border-t border-border pt-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                      Resume checks
                    </p>
                    <div className="mt-3">
                      <ResumeHealth spec={deferredSpec ?? spec} />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </RequirementProvider>

          {review.cover_letter_supported === true ? <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs text-muted">Tailored cover letter</p>
                <h2 className="mt-2 text-lg font-medium text-ink">Written for this job, from work you really did.</h2>
                <p className="mt-1 text-sm text-muted">Every line points back to something already in your resume or in the work you told us about.</p>
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-alt p-4">
            <p className="text-sm text-ink">Litos fills the form with your saved answers and this resume.</p>
            <div className="flex gap-2">
              {selected.download_url && selected.download_url !== "#" && <a href={selected.download_url} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View PDF</a>}
              <Button onClick={continueFromResume} disabled={saving || coverLetterBusy} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                {saving || coverLetterBusy ? <PendingLabel state="solving" onColor>Making...</PendingLabel> : "Fill the form"}
              </Button>
            </div>
          </div>
        </>
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
}: {
  value: NewApplicationDraft;
  onChange: (value: NewApplicationDraft) => void;
  onGenerate: () => void;
  creating: boolean;
  onFetchJobDescription: () => void;
  extractingJd: boolean;
}) {
  const patch = (next: Partial<NewApplicationDraft>) => onChange({ ...value, ...next });
  return (
    <Card className="p-6">
      <div className="max-w-2xl">
        <p className="text-xs text-muted">New application</p>
        <h2 className="mt-2 text-xl font-medium text-ink">Make the resume for this job.</h2>
        <p className="mt-1 text-sm leading-6 text-muted">It opens beside the job description.</p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ApplicationField label="Company" value={value.company} onChange={(company) => patch({ company })} placeholder="Google" />
        <ApplicationField label="Role" value={value.role} onChange={(role) => patch({ role })} placeholder="Software Engineer" />
      </div>
      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <ApplicationField label="Job URL" value={value.portalUrl} onChange={(portalUrl) => patch({ portalUrl })} placeholder="https://company.com/jobs/..." type="url" />
        </div>
        <Button
          type="button"
          onClick={onFetchJobDescription}
          disabled={extractingJd || !value.portalUrl.trim()} variant="secondary" className="mb-0.5 whitespace-nowrap">
          {extractingJd ? <PendingLabel state="composing">Reading...</PendingLabel> : "Fetch from URL"}
        </Button>
      </div>
      <label className="mt-4 block text-xs font-medium text-muted" htmlFor="new-application-jd">Job description</label>
      <textarea id="new-application-jd" value={value.jobDescription} onChange={(event) => patch({ jobDescription: event.target.value })} rows={12} placeholder="Paste the complete job description, or fetch it from the URL above" className="mt-1.5 w-full rounded-inner border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand" />
      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={onGenerate} disabled={creating} >
          {creating ? <PendingLabel state="composing" onColor>Making...</PendingLabel> : "Make my resume"}
        </Button>
      </div>
    </Card>
  );
}

function ApplicationField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  const id = `new-application-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div>
      <label className="block text-xs font-medium text-muted" htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand" />
    </div>
  );
}

function ResumeEditor({ spec, editedTerms, onChange, onPatchEntry }: { spec: ResumeSpec; editedTerms: ReadonlySet<string>; onChange: (spec: ResumeSpec) => void; onPatchEntry: (index: number, patch: Partial<ResumeSpec["experience"][number]>) => void }) {
  return (
    <div className="mx-auto max-w-[640px] rounded-card border border-border bg-white px-4 py-8 text-[13px] leading-5 text-ink sm:px-7">
      <EditableLine value={spec.school} onChange={(school) => onChange({ ...spec, school })} className="text-center text-sm font-semibold sm:text-lg" />
      {/* Two fields, not one string round-tripped through a " · " separator. The separator form was
          lossy in both directions: a degree legitimately containing " · " split wrong, and any
          third separator silently discarded the tail. R-047 was a mangled degree that could not be
          corrected, so a control that can mangle it again works against the fix. The dot is drawn
          between them rather than stored in either. */}
      {/* Width comes from these wrappers, never from the textarea itself: an auto-width textarea
          falls back to its ~20-column default, which squeezed a long joint degree into a narrow
          stacked column. The degree takes the remaining space and the date gets just what it
          needs. */}
      <div className="mt-1 flex items-baseline justify-center gap-1.5 text-xs text-muted">
        <span className="min-w-0 flex-1">
          <EditableLine value={spec.degree} onChange={(degree) => onChange({ ...spec, degree })} className="text-right" />
        </span>
        <span aria-hidden>·</span>
        <span className="w-[5.5rem] shrink-0">
          <EditableLine value={spec.grad_date} onChange={(grad_date) => onChange({ ...spec, grad_date })} className="text-left" />
        </span>
      </div>

      {/* The section heading used to render inside this map, so four jobs printed "EXPERIENCE" four
          times down the page. A resume has one Experience section containing four roles. Print the
          heading only where the section actually changes. */}
      {spec.experience.map((entry, index) => {
        const heading = sectionHeading(entry.type);
        const startsSection = startsNewSection(spec.experience.map((item) => item.type), index);
        return (
          <section key={`${entry.org}-${index}`} className={startsSection ? "mt-6" : "mt-4"}>
            {startsSection && (
              <p className="mb-2 border-b border-ink pb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]">{heading}</p>
            )}
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 flex-1">
                <EditableLine value={entry.org} onChange={(org) => onPatchEntry(index, { org })} className="font-semibold" />
              </span>
              {/* Wide enough for the longest real range ("September 2025 - Present") so the date
                  does not wrap, and fixed so it cannot squeeze the org name beside it. */}
              <span className="w-[10.5rem] shrink-0">
                <EditableLine value={entry.date_range} onChange={(date_range) => onPatchEntry(index, { date_range })} className="text-right text-xs text-muted" />
              </span>
            </div>
            <EditableLine value={entry.title} onChange={(title) => onPatchEntry(index, { title })} className="text-xs italic text-muted" />
            <ul className="mt-2 space-y-1.5">
              {entry.bullets.map((bullet, bulletIndex) => (
                <li key={bulletIndex} className="grid grid-cols-[12px_1fr] gap-1.5"><span>•</span><EditableHighlight value={bullet} terms={editedTerms} onChange={(value) => onPatchEntry(index, { bullets: entry.bullets.map((item, i) => (i === bulletIndex ? value : item)) })} /></li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="mt-6">
        <p className="mb-2 border-b border-ink pb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]">Skills</p>
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
    node.style.height = `${node.scrollHeight}px`;
  }, []);

  // useLayoutEffect, not useEffect: measuring after paint made every field flash at one-row height
  // before growing on first render.
  useLayoutEffect(resize, [resize, value]);

  // Re-measure on anything that changes the wrap point rather than only on value change. The
  // element carries overflow-hidden and a JS-set pixel height, so a stale height silently CLIPS
  // with no scrollbar and no ellipsis, which is worse than the truncation this replaced. Crossing
  // the xl:grid-cols-2 breakpoint, zooming, and a late-loading webfont all move the wrap point
  // without touching the value.
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
      className={`w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none focus:ring-1 focus:ring-brand/30 ${className}`}
    />
  );
}

function EditableHighlight({ value, terms, onChange }: { value: string; terms: ReadonlySet<string>; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <textarea autoFocus aria-label="Edit optimized resume text" value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => setEditing(false)} rows={Math.max(2, Math.ceil(value.length / 75))} className="w-full resize-none rounded-inner border border-brand bg-white px-2 py-1 outline-none" />
  ) : (
    <button type="button" onClick={() => setEditing(true)} className="text-left leading-5 hover:bg-brand-soft/50 focus:outline-none focus:ring-2 focus:ring-brand/30">
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
      <div className="flex justify-end"><Button onClick={onSubmit} >{reviewDiscovered ? "Save answers and try again" : "Save answers and make my application"}</Button></div>
    </div>
  );
}

function SubmissionScreen({ submission, onHandoffComplete, onApprove, onRetry, onReviewQuestions }: { submission: SubmissionResponse; onHandoffComplete: () => void; onApprove: () => void; onRetry: () => void; onReviewQuestions: () => void }) {
  const { review } = submission;
  const needsAttention = review.status === "needs_attention";
  const hasQuestionsToReview = needsAttention && review.questions.length > 0;
  const coverLetterPending = review.cover_letter_supported === true && !submission.cover_letter;
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
            {review.status === "failed" ? review.submission_error ?? "The company's form would not accept it." : "You asked to check every application first. Look it over, then send it when you are happy."}
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
          {review.status === "ready_for_final_approval" && <button onClick={onApprove} disabled={coverLetterPending} className="rounded-full bg-positive px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-positive disabled:opacity-50">Send it</button>}
        </div>
        <p className="mt-5 text-xs leading-5 text-faint">Litos will never pretend to be you. It will not get past the puzzle that checks you are human, a code on your phone, a login, or anything you have to swear to. It only says an application is sent once the company confirms it.</p>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4"><p className="text-sm font-medium text-ink">What the form looked like after we filled it in</p></div>
        {review.preview_screenshot_url ? <img src={review.preview_screenshot_url} alt="The company's application page after Litos filled it in" className="h-auto w-full" /> : <div className="p-10 text-center text-sm text-muted">Litos is still taking the picture.</div>}
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
        <img src={receipt.screenshot_url} alt="The company's confirmation that the application arrived" className="h-auto w-full border-t border-border" />
      </Card>}
    </div>
  );
}

function CenteredState({ title, body, loading = false }: { title: string; body: string; loading?: boolean }) {
  return <Card className="mx-auto max-w-2xl p-12 text-center">{loading ? <div className="mx-auto flex h-16 w-16 items-center justify-center"><ThinkingOrb state="searching" size={64} /></div> : <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-positive-soft text-positive"><svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true"><path d="M4 8.5l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}<h2 className="mt-5 text-xl font-medium text-ink">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{body}</p></Card>;
}

function BlockerList({ reason }: { reason?: string }) {
  const blockers = (reason ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (blockers.length === 0) {
    return <p className="mt-2 text-sm leading-6 text-muted">Finish the last step on the company's page.</p>;
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

function PortalProgress({ status, startedAt }: { status?: ApplicationReview["status"]; startedAt?: string }) {
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
  const submitting = status === "submitting" || status === "submission_claimed";
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

function stripMetadata(spec: GeneratedResume["spec"]): ResumeSpec {
  return { school: spec.school ?? "", degree: spec.degree ?? "", grad_date: spec.grad_date ?? "", coursework: spec.coursework ?? "", education_position: spec.education_position, experience: spec.experience ?? [], skills: spec.skills ?? [], skill_source: spec.skill_source };
}


