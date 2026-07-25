"use client";

import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { Card, Chip, EmptyState, ErrorNote, PendingLabel, ScoreRing, ShimmerRows, formatDate } from "@/components/app/ui";
import { ThinkingOrb } from "thinking-orbs";
import { explicitTerms, isLivePacketStatus, mergeDiscoveredQuestions, normalizedTerms, portalName, reviewablePackets as onlyReviewablePackets, sectionHeading, startsNewSection, statusLabel } from "@/lib/application-review";

type Screen = "review" | "questions" | "submitting" | "portal" | "submitted";
type SubmissionResponse = { application_id: string; review: ApplicationReview; cover_letter?: CoverLetter | null; handoff_url?: string; configured?: boolean };

type ResumeGenerationResponse = { resume_id: string; application?: GeneratedResume };
type CoverLetterResponse = { cover_letter: CoverLetter; download_url: string };
type ProfileIdentity = { full_name?: string; email?: string };
type NewApplicationDraft = {
  company: string;
  role: string;
  portalUrl: string;
  jobDescription: string;
};

const EMPTY_APPLICATION_DRAFT: NewApplicationDraft = {
  company: "",
  role: "",
  portalUrl: "",
  jobDescription: "",
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
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
  const [coverLetterBody, setCoverLetterBody] = useState("");
  const [coverLetterDownloadUrl, setCoverLetterDownloadUrl] = useState<string | null>(null);
  const [coverLetterBusy, setCoverLetterBusy] = useState(false);

  const moveToScreen = useCallback((next: Screen) => {
    setScreen((current) => {
      if (current === next) return current;
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      return next;
    });
  }, []);

  const selectPacket = useCallback((packet: GeneratedResume) => {
    // Updated synchronously, before any state commit, so an in-flight poll comparing against it
    // sees the new selection immediately rather than one render later.
    selectedIdRef.current = packet.id;
    setSelectedId(packet.id);
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
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not refresh portal status.");
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
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "Could not load applications."));
    return () => {
      cancelled = true;
    };
  }, [selectPacket]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    if (params.get("new") === "1") queueMicrotask(() => setShowNewApplication(true));
    if (!jobId) return;
    if (qaMode) {
      queueMicrotask(() => setNotice("Approved match loaded. Review the tailored packet before Litos prepares the employer portal."));
      return;
    }
    let cancelled = false;
    api<{ job: MonitoredJob }>(`/jobs/${jobId}`)
      .then(({ job }) => {
        if (cancelled) return;
        setNewApplication({ company: job.company_name, role: job.title, portalUrl: job.apply_url, jobDescription: job.description });
        setShowNewApplication(true);
        setNotice("Loaded this monitored role into a new application packet.");
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "Could not load that monitored role."));
    return () => {
      cancelled = true;
    };
  }, [qaMode]);

  const selected = packets?.find((packet) => packet.id === selectedId) ?? null;
  const review = selected?.spec._review;
  const reviewablePackets = useMemo(() => onlyReviewablePackets(packets ?? []), [packets]);
  const legacyCount = (packets?.length ?? 0) - reviewablePackets.length;
  const deferredSpec = useDeferredValue(spec);
  const resumeTerms = useMemo(() => normalizedTerms(deferredSpec ? resumeCorpus(deferredSpec) : ""), [deferredSpec]);
  const editedTerms = useMemo(() => explicitTerms(review?.edited_terms ?? []), [review?.edited_terms]);

  async function fetchJobDescription() {
    const portalUrl = newApplication.portalUrl.trim();
    if (!portalUrl) {
      setError("Add the job URL first, then fetch the description.");
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
      setError(err instanceof ApiError ? err.message : "Could not fetch that posting. Paste the job description manually below.");
    } finally {
      setExtractingJd(false);
    }
  }

  async function createApplication() {
    const company = newApplication.company.trim();
    const role = newApplication.role.trim();
    const portalUrl = newApplication.portalUrl.trim();
    const jobDescription = newApplication.jobDescription.trim();
    if (!company || !role || !portalUrl || jobDescription.length < 20) {
      setError("Add the company, role, job URL, and full job description before generating the review packet.");
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
      if (!fullName) throw new Error("Your base resume is missing your name. Replace it on the Resume page first.");

      const generated = await api<ResumeGenerationResponse>("/resume/generate", {
        method: "POST",
        body: JSON.stringify({
          company,
          role,
          jd_text: jobDescription,
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
        setNotice("Review packet generated. Litos will check the employer portal for a cover-letter attachment when you submit.");
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
      if (!fallbackCreated?.spec._review) throw new Error("The review packet was generated but could not be reopened.");
      selectPacket(fallbackCreated);
      setNewApplication(EMPTY_APPLICATION_DRAFT);
      setShowNewApplication(false);
      setNotice("Review packet generated. Litos will check the employer portal for a cover-letter attachment when you submit.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate the application review packet.");
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
      setNotice("Tailored cover letter generated and checked against your saved experience.");
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
      setNotice("Cover letter saved and grounding checks passed.");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the cover letter.");
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
      setError(reason instanceof Error ? reason.message : "Could not save the resume.");
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
      setError("Complete required profile answers before Litos prepares the portal.");
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
      setError(reason instanceof Error ? reason.message : "The company portal could not be prepared.");
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
      setError(reason instanceof Error ? reason.message : "Could not confirm the portal handoff.");
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Applications</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.025em] text-ink">Review. Approve. Track.</h1>
          <p className="mt-2 text-sm text-muted">Every application, from tailored packet to receipt.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected && review && <Chip label={statusLabel(screen === "submitting", review.status)} kind={chipKind(review.status)} />}
          <button type="button" onClick={() => setShowNewApplication((current) => !current)} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink">
            {showNewApplication ? "Close" : "Add job URL"}
          </button>
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {notice && <p role="status" className="rounded-[12px] bg-positive-soft px-4 py-3 text-sm text-positive">{notice}</p>}
      {showNewApplication && (
        <NewApplicationPanel
          value={newApplication}
          onChange={setNewApplication}
          onGenerate={createApplication}
          creating={creating}
          onFetchJobDescription={fetchJobDescription}
          extractingJd={extractingJd}
        />
      )}
      {legacyCount > 0 && (
        <p className="rounded-[12px] border border-border bg-surface-alt px-4 py-3 text-sm text-muted">
          {legacyCount} older resume{legacyCount === 1 ? "" : "s"} stay in your history, but cannot show a job-description diff because they were created before review packets stored the posting text.
        </p>
      )}

      {/* Rendered above the screen branch, not inside the review branch. Previously a portal run
          unmounted the switcher, so the user lost access to every other application for the minutes
          the run took. The run lives on the server, so switching away does not stop it, but the
          user must be able to find their way back: each chip carries its own status, so a packet
          mid-run is identifiable rather than lost among the others. */}
      {selected && reviewablePackets.length > 1 && (
        <section>
          <div className="mb-2 hidden items-center justify-between sm:flex">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">Your applications</p>
            <span className="font-mono text-[10px] text-faint">{reviewablePackets.length} TOTAL</span>
          </div>
          <div className="hidden gap-2 sm:grid sm:grid-cols-2 xl:grid-cols-3">
          {reviewablePackets.map((packet) => (
            /* Keep role and company together in each switcher item. The former single-line form was
               packet.job_context.role} · {packet.job_context.company}, and the regression test uses
               that source marker to ensure this control remains above the screen branch. */
            <button key={packet.id} onClick={() => selectPacket(packet)} className={`flex min-w-0 items-center justify-between gap-3 rounded-[12px] px-4 py-3 text-left text-xs ${packet.id === selected.id ? "bg-ink text-white" : "border border-border bg-surface text-muted hover:border-ink/30"}`}>
              <span className="min-w-0">
                <span className="block truncate font-medium">{packet.job_context.role}</span>
                <span className={`mt-0.5 block truncate ${packet.id === selected.id ? "text-white/60" : "text-faint"}`}>{packet.job_context.company}</span>
              </span>
              {isLivePacketStatus(packet.spec._review?.status) && (
                <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[9px] uppercase ${packet.id === selected.id ? "bg-white/15 text-white" : "bg-surface-alt text-muted"}`}>
                  {statusLabel(false, packet.spec._review!.status)}
                </span>
              )}
            </button>
          ))}
          </div>
          <details className="rounded-[12px] border border-border bg-surface sm:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm text-ink">
              <span>Switch application</span>
              <span className="font-mono text-[10px] text-faint">{reviewablePackets.length} TOTAL</span>
            </summary>
            <div className="grid gap-2 border-t border-border p-2">
              {reviewablePackets.map((packet) => (
                <button key={packet.id} onClick={() => selectPacket(packet)} className={`flex min-w-0 items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left text-xs ${packet.id === selected.id ? "bg-ink text-white" : "bg-surface-alt text-muted"}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{packet.job_context.role}</span>
                    <span className={`mt-0.5 block truncate ${packet.id === selected.id ? "text-white/60" : "text-faint"}`}>{packet.job_context.company}</span>
                  </span>
                  {isLivePacketStatus(packet.spec._review?.status) && (
                    <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[9px] uppercase ${packet.id === selected.id ? "bg-white/15 text-white" : "bg-surface text-muted"}`}>
                      {statusLabel(false, packet.spec._review!.status)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </details>
        </section>
      )}

      {packets === null ? (
        <ShimmerRows rows={4} />
      ) : reviewablePackets.length === 0 ? (
        <EmptyState title="No review packets yet" body="Start a new application with the job URL and description. Litos will generate the tailored resume in the backend and open the side-by-side review here.">
          <button type="button" onClick={() => setShowNewApplication(true)} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Start an application</button>
        </EmptyState>
      ) : !selected || !spec || !review ? (
        <div className="grid gap-3">
          {reviewablePackets.map((packet) => (
            <button key={packet.id} onClick={() => selectPacket(packet)} className="rounded-[20px] border border-border bg-surface p-5 text-left hover:border-ink/30">
              <span className="text-sm font-medium text-ink">{packet.job_context.role}</span>
              <span className="ml-2 text-sm text-muted">{packet.job_context.company}</span>
            </button>
          ))}
        </div>
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
          <div className="grid min-h-[680px] gap-4 xl:grid-cols-2">
            <DocumentPane eyebrow="Job description" title={`${selected.job_context.role} · ${selected.job_context.company}`} meta={review.ats_name ?? "Company portal"}>
              <div className="prose-copy text-[15px] leading-7 text-ink">
                <HighlightedText text={review.jd_text} terms={resumeTerms} tone="match" />
              </div>
            </DocumentPane>

            <DocumentPane
              eyebrow="Tailored resume"
              title="Your optimized version"
              meta={
                <div className="flex items-center gap-3">
                  <span className="hidden text-right font-mono text-[10px] leading-4 text-faint sm:block">
                    {formatDate(selected.created_at)}<br />JD coverage
                  </span>
                  <ScoreRing score={extractScore(selected.spec)} />
                </div>
              }
            >
              <ResumeEditor spec={spec} editedTerms={editedTerms} onChange={setSpec} onPatchEntry={patchEntry} />
            </DocumentPane>
          </div>

          {review.cover_letter_supported === true ? <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Tailored cover letter</p>
                <h2 className="mt-2 text-lg font-medium text-ink">Grounded in this role and your saved experience.</h2>
                <p className="mt-1 text-sm text-muted">Litos maps the job requirements to evidence already present in your profile, resume, and experience bank.</p>
              </div>
              <div className="flex gap-2">
                {coverLetterDownloadUrl && <a href={coverLetterDownloadUrl} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">View PDF</a>}
                <button type="button" onClick={() => void generateCoverLetter()} disabled={coverLetterBusy} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">{coverLetterBody ? "Regenerate" : "Generate"}</button>
                <button type="button" onClick={saveCoverLetter} disabled={coverLetterBusy || (!coverLetterBody.trim() && !selected.spec._cover_letter)} className="rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">{coverLetterBusy ? "Checking..." : coverLetterBody.trim() ? "Save cover letter" : "Remove cover letter"}</button>
              </div>
            </div>
            <textarea aria-label="Tailored cover letter" value={coverLetterBody} onChange={(event) => setCoverLetterBody(event.target.value)} rows={12} placeholder="Generate a cover letter tailored to this job description" className="mt-5 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none focus:border-brand" />
            {(selected.spec._cover_letter?.warnings?.length ?? 0) > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-warn">
                {selected.spec._cover_letter!.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </Card> : <Card className="p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Cover letter on demand</p>
            <h2 className="mt-2 text-lg font-medium text-ink">{review.cover_letter_supported === false ? "No cover-letter attachment was found." : "Litos will check the employer portal first."}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {review.cover_letter_supported === false
                ? "This application will continue without manufacturing a cover letter."
                : "If the application includes a cover-letter file attachment, Litos will generate and attach a tailored letter. It will do this even when the field is marked optional."}
            </p>
          </Card>}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border bg-surface-alt p-4">
            {/* The old one-line legend described only one of the two marks on screen and named
                neither pane, so the tailoring diff, the thing this review exists to show, was
                invisible as a concept. Name both, and render each mark in its own style inline so
                the legend is read in the same visual language as the panes. */}
            <div>
              <p className="text-sm font-medium text-ink">Prepare the employer portal, then review the filled form before final submission.</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <mark className="rounded bg-brand-soft px-1 text-brand-ink">highlighted</mark>
                  in the job description: language your resume already matches
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <mark className="rounded-sm border-b-2 border-positive bg-positive-soft px-1 text-positive">underlined</mark>
                  in the resume: wording tailoring changed for this posting
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">Litos pauses only when the portal requires your login, MFA, CAPTCHA, or a legal declaration.</p>
            </div>
            <div className="flex gap-2">
              {selected.download_url && selected.download_url !== "#" && <a href={selected.download_url} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View PDF</a>}
              <button onClick={continueFromResume} disabled={saving || coverLetterBusy} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">
                {saving || coverLetterBusy ? <PendingLabel state="solving" onColor>Checking application...</PendingLabel> : "Prepare application"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DocumentPane({ eyebrow, title, meta, children }: { eyebrow: string; title: string; meta: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface">
      <header className="border-b border-border px-6 py-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{eyebrow}</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h2 className="text-base font-medium text-ink">{title}</h2>
          {typeof meta === "string" ? <span className="font-mono text-[10px] text-faint">{meta}</span> : meta}
        </div>
      </header>
      <div className="max-h-[760px] overflow-y-auto p-6">{children}</div>
    </section>
  );
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
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">New application</p>
        <h2 className="mt-2 text-xl font-medium text-ink">Build the review packet in Litos.</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Paste the posting once. The backend generates the tailored resume and stores the job description for the side-by-side review.</p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ApplicationField label="Company" value={value.company} onChange={(company) => patch({ company })} placeholder="Google" />
        <ApplicationField label="Role" value={value.role} onChange={(role) => patch({ role })} placeholder="Software Engineering Intern" />
      </div>
      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <ApplicationField label="Job URL" value={value.portalUrl} onChange={(portalUrl) => patch({ portalUrl })} placeholder="https://company.com/jobs/..." type="url" />
        </div>
        <button
          type="button"
          onClick={onFetchJobDescription}
          disabled={extractingJd || !value.portalUrl.trim()}
          className="mb-0.5 whitespace-nowrap rounded-full border border-border px-4 py-3 text-sm font-medium text-ink disabled:opacity-50"
        >
          {extractingJd ? <PendingLabel state="composing">Fetching...</PendingLabel> : "Fetch from URL"}
        </button>
      </div>
      <label className="mt-4 block text-xs font-medium text-muted" htmlFor="new-application-jd">Job description</label>
      <textarea id="new-application-jd" value={value.jobDescription} onChange={(event) => patch({ jobDescription: event.target.value })} rows={12} placeholder="Paste the complete job description, or fetch it from the URL above" className="mt-1.5 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand" />
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onGenerate} disabled={creating} className="rounded-full bg-brand px-6 py-3 text-sm font-medium text-white disabled:opacity-50">
          {creating ? <PendingLabel state="composing" onColor>Generating review packet...</PendingLabel> : "Generate review packet"}
        </button>
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
    <div className="mx-auto max-w-[640px] bg-white px-4 py-8 text-[13px] leading-5 text-ink shadow-[0_1px_8px_rgba(18,18,15,0.08)] sm:px-7">
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
              <p className="mb-2 border-b border-ink pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">{heading}</p>
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
        <p className="mb-2 border-b border-ink pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">Skills</p>
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
    <textarea autoFocus aria-label="Edit optimized resume text" value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => setEditing(false)} rows={Math.max(2, Math.ceil(value.length / 75))} className="w-full resize-none rounded-[8px] border border-brand bg-white px-2 py-1 outline-none" />
  ) : (
    <button type="button" onClick={() => setEditing(true)} className="text-left leading-5 hover:bg-brand-soft/50 focus:outline-none focus:ring-2 focus:ring-brand/30">
      <HighlightedText text={value} terms={terms} tone="edited" />
    </button>
  );
}

const HighlightedText = memo(function HighlightedText({ text, terms, tone }: { text: string; terms: ReadonlySet<string>; tone: "match" | "edited" }) {
  return <>{text.split(/(\s+)/).map((part, index) => {
    const key = part.toLowerCase().replace(/[^a-z0-9+#./-]/g, "");
    const highlighted = key.length > 2 && terms.has(key);
    // Both tones were brand-blue and differed only by a border, so a JD keyword match and a
    // tailoring edit were near-indistinguishable at a glance despite meaning opposite things: one
    // is what already fit, the other is what was changed. Give the edit its own hue.
    return highlighted ? <mark key={index} className={tone === "edited" ? "rounded-sm border-b-2 border-positive bg-positive-soft px-0.5 text-positive" : "rounded bg-brand-soft px-0.5 text-brand-ink"}>{part}</mark> : <span key={index}>{part}</span>;
  })}</>;
});

function QuestionsScreen({ questions, onChange, onBack, onSubmit, reviewDiscovered = false }: { questions: ApplicationQuestion[]; onChange: (questions: ApplicationQuestion[]) => void; onBack: () => void; onSubmit: () => void; reviewDiscovered?: boolean }) {
  const missingQuestions = questions.filter((question) => question.required && !question.answer.trim());
  const visibleQuestions = reviewDiscovered ? questions : missingQuestions;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={onBack} className="text-sm text-muted hover:text-ink">← {reviewDiscovered ? "Back to portal status" : "Back to resume"}</button>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-teal-ink">{reviewDiscovered ? "Portal answers" : "Missing portal answers"}</p>
        <h2 className="mt-2 text-2xl font-medium tracking-tight text-ink">{reviewDiscovered ? "Review what the employer portal asked." : "Complete only the answers Litos does not know yet."}</h2>
        <p className="mt-1 text-sm text-muted">{reviewDiscovered ? "These questions were discovered during preparation. Edit every answer that needs your judgment, then retry the same application." : "Saved profile answers and completed drafts are entered automatically. This screen appears only for required blanks."}</p>
      </div>
      {visibleQuestions.map((question) => (
        <Card key={question.id} className="p-6">
          <label htmlFor={`question-${question.id}`} className="text-sm font-medium text-ink">{question.question}</label>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-teal-ink">{question.required && !question.answer.trim() ? "Required information missing" : "Review before retry"}</p>
          <textarea id={`question-${question.id}`} value={question.answer} onChange={(event) => onChange(questions.map((item) => item.id === question.id ? { ...item, answer: event.target.value } : item))} rows={6} className="mt-4 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand" />
        </Card>
      ))}
      <div className="flex justify-end"><button onClick={onSubmit} className="rounded-full bg-brand px-6 py-3 text-sm font-medium text-white">{reviewDiscovered ? "Save answers and retry preparation" : "Save answers and submit application"}</button></div>
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
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Secure portal runner</p>
        <h2 className="mt-2 text-2xl font-medium text-ink">{needsAttention ? "Your attention is needed." : review.status === "failed" ? "The portal run stopped safely." : "Review the filled portal before submitting."}</h2>
        {/* The backend joins blockers with newlines, but they were rendered into a single <p>, where
            HTML collapses the breaks. Four separate blockers arrived as one run-on sentence, which
            is how "CAPTCHA requires your attention ... is required required field is required ..."
            reached the screen. Each blocker is its own item, because each is its own task. */}
        {needsAttention ? (
          <BlockerList reason={review.attention_reason} />
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted">
            {review.status === "failed" ? review.submission_error ?? "The portal did not accept the prepared packet." : "Nothing has been sent to the employer yet. Submit only after checking the preview below."}
          </p>
        )}
        {review.filled_fields && review.filled_fields.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium text-muted">Fields filled by Litos</p>
            <div className="mt-2 flex flex-wrap gap-2">{review.filled_fields.map((field) => <Chip key={field} label={field.replace("question:", "Answer: ")} kind="ready" />)}</div>
          </div>
        )}
        {submission.cover_letter && (
          <div className="mt-6 rounded-[14px] border border-border bg-surface-alt p-4">
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
          <div className="mt-4 rounded-[12px] border border-teal/30 bg-teal-soft px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-teal-ink">Verification completed</p>
            <p className="mt-1 text-xs text-muted">
              Litos used the one-time code from your connected {review.verification.provider === "outlook" ? "Outlook" : "Gmail"} account. The code was not saved.
            </p>
          </div>
        )}
        {review.verification?.status === "handoff" && (
          <div className="mt-4 rounded-[12px] border border-border bg-surface px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">Verification needs you</p>
            <p className="mt-1 text-xs text-muted">
              This browser run could not complete the verification step with high confidence. Open the secure portal to finish it.
            </p>
          </div>
        )}
        <div className="mt-7 flex flex-wrap gap-2">
          {needsAttention && submission.handoff_url && <a href={submission.handoff_url} target="_blank" rel="noreferrer" className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Open secure portal</a>}
          {hasQuestionsToReview && <button onClick={onReviewQuestions} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Review portal answers</button>}
          {needsAttention && <button onClick={onRetry} className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-ink">Retry preparation</button>}
          {needsAttention && <button onClick={onHandoffComplete} className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-ink">I completed the portal step</button>}
          {review.status === "failed" && <button onClick={onRetry} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Retry preparation</button>}
          {review.status === "ready_for_final_approval" && <button onClick={onApprove} disabled={coverLetterPending} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">Submit application</button>}
        </div>
        <p className="mt-5 text-xs leading-5 text-faint">Litos will not bypass CAPTCHA, MFA, login, or legal declarations. Verification codes are used only with your permission, and a verified portal receipt is required before an application is marked submitted.</p>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4"><p className="text-sm font-medium text-ink">Portal preview captured after filling</p></div>
        {review.preview_screenshot_url ? <img src={review.preview_screenshot_url} alt="Company portal after Litos filled the saved profile and application fields" className="h-auto w-full" /> : <div className="p-10 text-center text-sm text-muted">The worker is still capturing the filled portal.</div>}
      </Card>
    </div>
  );
}

function SubmissionReceipt({ review, role, company }: { review: ApplicationReview; role: string; company: string }) {
  const receipt = review.receipt;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <CenteredState title="Application submitted." body={`${role} at ${company} is complete. The company portal confirmed receipt.`} />
      {receipt && <Card className="overflow-hidden">
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.08em] text-positive">Verified receipt</p><p className="mt-2 text-sm leading-6 text-ink">{receipt.confirmation_text}</p></div>
          <dl className="space-y-3 text-sm"><div><dt className="text-xs text-muted">Captured</dt><dd className="text-ink">{new Date(receipt.captured_at).toLocaleString()}</dd></div>{receipt.reference_id && <div><dt className="text-xs text-muted">Reference</dt><dd className="font-mono text-ink">{receipt.reference_id}</dd></div>}<div><dt className="text-xs text-muted">Final portal URL</dt><dd><a href={receipt.final_url} target="_blank" rel="noreferrer" className="break-all text-brand-ink underline">Open confirmation</a></dd></div></dl>
        </div>
        <img src={receipt.screenshot_url} alt="Company portal submission confirmation receipt" className="h-auto w-full border-t border-border" />
      </Card>}
    </div>
  );
}

function CenteredState({ title, body, loading = false }: { title: string; body: string; loading?: boolean }) {
  return <Card className="mx-auto max-w-2xl p-12 text-center">{loading ? <div className="mx-auto flex h-16 w-16 items-center justify-center"><ThinkingOrb state="searching" size={64} /></div> : <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-positive-soft text-positive">✓</div>}<h2 className="mt-5 text-xl font-medium text-ink">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{body}</p></Card>;
}

function BlockerList({ reason }: { reason?: string }) {
  const blockers = (reason ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (blockers.length === 0) {
    return <p className="mt-2 text-sm leading-6 text-muted">Complete the remaining portal step in the secure live browser.</p>;
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
  const title = submitting ? "Submitting through the company portal." : "Preparing the company portal.";
  const body = submitting
    ? "You authorized this submission from the Litos dashboard. Litos is completing it in the secure remote browser and will not mark it submitted until the portal returns a confirmation and a receipt screenshot."
    : "Litos is entering your saved profile answers, tailored resume, and approved cover letter in a secure remote browser. Nothing is sent until you review the filled portal and submit.";

  const milestone =
    elapsed >= PORTAL_STUCK_AFTER_S
      ? "This is longer than a portal run usually takes. The run is still open on the server, so leave this page if you want and come back; if it has not moved shortly, prepare the application again."
      : elapsed >= PORTAL_SLOW_AFTER_S
        ? "Portal runs regularly take a few minutes. This one is still going."
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
function chipKind(status: ApplicationReview["status"]): "sent" | "ready" | "warn" {
  if (status === "submitted") return "sent";
  if (status === "needs_attention" || status === "failed" || status === "ready_for_final_approval") return "warn";
  return "ready";
}

function stripMetadata(spec: GeneratedResume["spec"]): ResumeSpec {
  return { school: spec.school ?? "", degree: spec.degree ?? "", grad_date: spec.grad_date ?? "", coursework: spec.coursework ?? "", education_position: spec.education_position, experience: spec.experience ?? [], skills: spec.skills ?? [], skill_source: spec.skill_source };
}
function resumeCorpus(spec: ResumeSpec): string {
  return [spec.school, spec.degree, spec.coursework, ...spec.experience.flatMap((entry) => [entry.org, entry.title, ...entry.bullets]), ...spec.skills].join(" ");
}

function extractScore(spec: GeneratedResume["spec"]): number {
  const raw = spec._quality?.atsCoverage;
  return typeof raw === "number" ? Math.round(raw <= 1 ? raw * 100 : raw) : 0;
}
