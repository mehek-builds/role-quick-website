"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  api,
  getStoredEmail,
  type ApplicationQuestion,
  type ApplicationProfile,
  type ApplicationReview,
  type GeneratedResume,
  type ResumeSpec,
} from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, PendingLabel, ScoreRing, ShimmerRows, formatDate } from "@/components/app/ui";
import { ThinkingOrb } from "thinking-orbs";
import { portalName, reviewablePackets as onlyReviewablePackets } from "@/lib/application-review";

type Screen = "review" | "questions" | "submitting" | "portal" | "submitted";
type SubmissionResponse = { application_id: string; review: ApplicationReview; handoff_url?: string; configured?: boolean };

type ResumeGenerationResponse = { resume_id: string; application?: GeneratedResume };
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
  const [spec, setSpec] = useState<ResumeSpec | null>(null);
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [screen, setScreen] = useState<Screen>("review");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [qaMode, setQaMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showNewApplication, setShowNewApplication] = useState(false);
  const [newApplication, setNewApplication] = useState(EMPTY_APPLICATION_DRAFT);
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);

  const moveToScreen = useCallback((next: Screen) => {
    setScreen((current) => {
      if (current === next) return current;
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      return next;
    });
  }, []);

  const selectPacket = useCallback((packet: GeneratedResume) => {
    setSelectedId(packet.id);
    setSpec(stripMetadata(packet.spec));
    setQuestions(packet.spec._review?.questions ?? []);
    const status = packet.spec._review?.status;
    moveToScreen(status === "submitted" ? "submitted" : ["submit_requested", "preparing", "filling", "submitting"].includes(status ?? "") ? "submitting" : ["needs_attention", "ready_for_final_approval", "failed"].includes(status ?? "") ? "portal" : "review");
    setSubmission(status ? { application_id: packet.id, review: packet.spec._review! } : null);
    setError(null);
    setNotice(null);
  }, [moveToScreen]);

  const refreshSubmission = useCallback(async () => {
    if (!selectedId || qaMode) return;
    const result = await api<SubmissionResponse>(`/applications/${selectedId}/submission`);
    setSubmission((current) => current?.review.updated_at === result.review.updated_at ? current : result);
    setPackets((current) => {
      if (!current) return current;
      const packet = current.find((item) => item.id === selectedId);
      if (packet?.spec._review?.updated_at === result.review.updated_at) return current;
      return current.map((item) => item.id === selectedId ? { ...item, spec: { ...item.spec, _review: result.review } } : item);
    });
    if (result.review.status === "submitted") moveToScreen("submitted");
    else if (["needs_attention", "ready_for_final_approval", "failed"].includes(result.review.status)) moveToScreen("portal");
    else moveToScreen("submitting");
  }, [moveToScreen, qaMode, selectedId]);

  useEffect(() => {
    if (!selectedId || qaMode || !["submitting", "portal"].includes(screen)) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        if (document.visibilityState === "visible") await refreshSubmission();
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not refresh portal status.");
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, document.visibilityState === "visible" ? 2500 : 10_000);
      }
    };
    timer = window.setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [qaMode, refreshSubmission, screen, selectedId]);

  useEffect(() => {
    const qaScenario = new URLSearchParams(window.location.search).get("qa");
    const localQa = process.env.NODE_ENV !== "production" && qaScenario !== null;
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

  const selected = packets?.find((packet) => packet.id === selectedId) ?? null;
  const review = selected?.spec._review;
  const reviewablePackets = useMemo(() => onlyReviewablePackets(packets ?? []), [packets]);
  const legacyCount = (packets?.length ?? 0) - reviewablePackets.length;
  const deferredSpec = useDeferredValue(spec);
  const resumeTerms = useMemo(() => normalizedTerms(deferredSpec ? resumeCorpus(deferredSpec) : ""), [deferredSpec]);
  const editedTerms = useMemo(() => normalizedTerms(review?.edited_terms ?? []), [review?.edited_terms]);

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
        setNotice("Review packet generated from the job description.");
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
      setNotice("Review packet generated from the job description.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate the application review packet.");
    } finally {
      setCreating(false);
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
    if (!(await saveResume())) return;
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
        setSubmission({ application_id: selected.id, review: { ...review!, status: "ready_for_final_approval", preview_screenshot_url: "/qa/portal-preview.svg", filled_fields: ["name", "email", "resume"] } });
        moveToScreen("portal");
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not confirm the portal handoff.");
    }
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
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Application review</p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight text-ink">Review the job and your resume together.</h1>
          <p className="mt-1 text-sm text-muted">Build, review, approve, and verify employer submissions from one dashboard.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected && review && <Chip label={statusLabel(screen, review.status)} kind={screen === "submitted" ? "sent" : "ready"} />}
          <button type="button" onClick={() => setShowNewApplication((current) => !current)} className="rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white">
            {showNewApplication ? "Close" : "New application"}
          </button>
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {notice && <p role="status" className="rounded-[12px] bg-positive-soft px-4 py-3 text-sm text-positive">{notice}</p>}
      {showNewApplication && (
        <NewApplicationPanel value={newApplication} onChange={setNewApplication} onGenerate={createApplication} creating={creating} />
      )}
      {legacyCount > 0 && (
        <p className="rounded-[12px] border border-border bg-surface-alt px-4 py-3 text-sm text-muted">
          {legacyCount} older resume{legacyCount === 1 ? "" : "s"} stay in your history, but cannot show a job-description diff because they were created before review packets stored the posting text.
        </p>
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
        <QuestionsScreen questions={questions} onChange={setQuestions} onBack={() => moveToScreen("review")} onSubmit={() => prepareApplication()} />
      ) : screen === "submitting" ? (
        <CenteredState title={submission?.review.status === "submitting" ? "Submitting through the company portal." : "Preparing the company portal."} body="Litos is entering your saved profile answers and resume in a secure remote browser. Nothing is submitted during this preparation step." loading />
      ) : screen === "portal" && submission ? (
        <SubmissionScreen submission={submission} onHandoffComplete={completeHandoff} onApprove={approveFinalSubmission} onRetry={() => prepareApplication()} />
      ) : screen === "submitted" ? (
        <SubmissionReceipt review={submission?.review ?? review} role={selected.job_context.role ?? "Role"} company={selected.job_context.company ?? "Company"} />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {reviewablePackets.map((packet) => (
              <button key={packet.id} onClick={() => selectPacket(packet)} className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs ${packet.id === selected.id ? "bg-ink text-white" : "border border-border bg-surface text-muted"}`}>
                {packet.job_context.role} · {packet.job_context.company}
              </button>
            ))}
          </div>

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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border bg-surface-alt p-4">
            <div>
              <p className="text-sm font-medium text-ink">Litos enters saved answers before asking for final submission approval.</p>
              <p className="mt-0.5 text-xs text-muted">Blue highlights job language. Nothing reaches the employer until you review the filled portal and click Submit application.</p>
            </div>
            <div className="flex gap-2">
              {selected.download_url && selected.download_url !== "#" && <a href={selected.download_url} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View PDF</a>}
              <button onClick={continueFromResume} disabled={saving} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {saving ? <PendingLabel state="solving" onColor>Checking resume...</PendingLabel> : "Prepare application"}
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
}: {
  value: NewApplicationDraft;
  onChange: (value: NewApplicationDraft) => void;
  onGenerate: () => void;
  creating: boolean;
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
      <div className="mt-4">
        <ApplicationField label="Job URL" value={value.portalUrl} onChange={(portalUrl) => patch({ portalUrl })} placeholder="https://company.com/jobs/..." type="url" />
      </div>
      <label className="mt-4 block text-xs font-medium text-muted" htmlFor="new-application-jd">Job description</label>
      <textarea id="new-application-jd" value={value.jobDescription} onChange={(event) => patch({ jobDescription: event.target.value })} rows={12} placeholder="Paste the complete job description" className="mt-1.5 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand" />
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
      <EditableLine value={`${spec.degree} · ${spec.grad_date}`} onChange={(value) => {
        const [degree, grad_date = ""] = value.split(" · ");
        onChange({ ...spec, degree, grad_date });
      }} className="mt-1 text-center text-xs text-muted" />

      {spec.experience.map((entry, index) => (
        <section key={`${entry.org}-${index}`} className="mt-6">
          <p className="mb-2 border-b border-ink pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">{entry.type === "project" ? "Projects" : entry.type === "leadership" ? "Leadership" : "Experience"}</p>
          <div className="grid grid-cols-[1fr_auto] gap-x-4">
            <EditableLine value={entry.org} onChange={(org) => onPatchEntry(index, { org })} className="font-semibold" />
            <EditableLine value={entry.date_range} onChange={(date_range) => onPatchEntry(index, { date_range })} className="text-right text-xs text-muted" />
          </div>
          <EditableLine value={entry.title} onChange={(title) => onPatchEntry(index, { title })} className="text-xs italic text-muted" />
          <ul className="mt-2 space-y-1.5">
            {entry.bullets.map((bullet, bulletIndex) => (
              <li key={bulletIndex} className="grid grid-cols-[12px_1fr] gap-1.5"><span>•</span><EditableHighlight value={bullet} terms={editedTerms} onChange={(value) => onPatchEntry(index, { bullets: entry.bullets.map((item, i) => (i === bulletIndex ? value : item)) })} /></li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-6">
        <p className="mb-2 border-b border-ink pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">Skills</p>
        <EditableHighlight value={spec.skills.join(" • ")} terms={editedTerms} onChange={(value) => onChange({ ...spec, skills: value.split("•").map((item) => item.trim()).filter(Boolean) })} />
      </section>
    </div>
  );
}

function EditableLine({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  return <input aria-label="Editable resume text" value={value} onChange={(event) => onChange(event.target.value)} className={`w-full border-0 bg-transparent p-0 outline-none focus:ring-1 focus:ring-brand/30 ${className}`} />;
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
    return highlighted ? <mark key={index} className={tone === "edited" ? "border-b-2 border-brand bg-surface-alt px-0.5 text-brand-ink" : "rounded bg-brand-soft px-0.5 text-brand-ink"}>{part}</mark> : <span key={index}>{part}</span>;
  })}</>;
});

function normalizedTerms(source: string | readonly string[]): ReadonlySet<string> {
  const values = typeof source === "string" ? source.split(/\s+/) : source;
  return new Set(values.map((term) => term.toLowerCase().replace(/[^a-z0-9+#./-]/g, "")).filter((term) => term.length > 2));
}

function QuestionsScreen({ questions, onChange, onBack, onSubmit }: { questions: ApplicationQuestion[]; onChange: (questions: ApplicationQuestion[]) => void; onBack: () => void; onSubmit: () => void }) {
  const missingQuestions = questions.filter((question) => question.required && !question.answer.trim());
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={onBack} className="text-sm text-muted hover:text-ink">← Back to resume</button>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-teal-ink">Missing portal answers</p>
        <h2 className="mt-2 text-2xl font-medium tracking-tight text-ink">Complete only the answers Litos does not know yet.</h2>
        <p className="mt-1 text-sm text-muted">Saved profile answers and completed drafts are entered automatically. This screen appears only for required blanks.</p>
      </div>
      {missingQuestions.map((question) => (
        <Card key={question.id} className="p-6">
          <label htmlFor={`question-${question.id}`} className="text-sm font-medium text-ink">{question.question}</label>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-teal-ink">Required information missing</p>
          <textarea id={`question-${question.id}`} value={question.answer} onChange={(event) => onChange(questions.map((item) => item.id === question.id ? { ...item, answer: event.target.value } : item))} rows={6} className="mt-4 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand" />
        </Card>
      ))}
      <div className="flex justify-end"><button onClick={onSubmit} className="rounded-full bg-brand px-6 py-3 text-sm font-medium text-white">Save answers and prepare application</button></div>
    </div>
  );
}

function SubmissionScreen({ submission, onHandoffComplete, onApprove, onRetry }: { submission: SubmissionResponse; onHandoffComplete: () => void; onApprove: () => void; onRetry: () => void }) {
  const { review } = submission;
  const needsAttention = review.status === "needs_attention";
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_1.15fr]">
      <Card className="p-7">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Secure portal runner</p>
        <h2 className="mt-2 text-2xl font-medium text-ink">{needsAttention ? "Your attention is needed." : review.status === "failed" ? "The portal run stopped safely." : "The portal is filled and ready."}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {needsAttention ? review.attention_reason ?? "Complete the remaining portal step in the secure live browser." : review.status === "failed" ? review.submission_error ?? "The portal did not accept the prepared packet." : "Review the captured form. The employer receives nothing until you click Submit application below."}
        </p>
        {review.filled_fields && review.filled_fields.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium text-muted">Fields filled by Litos</p>
            <div className="mt-2 flex flex-wrap gap-2">{review.filled_fields.map((field) => <Chip key={field} label={field.replace("question:", "Answer: ")} kind="ready" />)}</div>
          </div>
        )}
        <div className="mt-7 flex flex-wrap gap-2">
          {needsAttention && submission.handoff_url && <a href={submission.handoff_url} target="_blank" rel="noreferrer" className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Open secure portal</a>}
          {needsAttention && <button onClick={onHandoffComplete} className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-ink">I completed the portal step</button>}
          {review.status === "failed" && <button onClick={onRetry} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Retry preparation</button>}
          {review.status === "ready_for_final_approval" && <button onClick={onApprove} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Submit application</button>}
        </div>
        <p className="mt-5 text-xs leading-5 text-faint">Litos will not bypass CAPTCHA, MFA, login, or legal declarations. A verified receipt is required before the application is marked submitted.</p>
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

function statusLabel(screen: Screen, status: ApplicationReview["status"]): string {
  if (screen === "submitted" || status === "submitted") return "Submitted";
  if (screen === "submitting" || status === "submitting") return "Submitting";
  if (status === "needs_attention") return "Needs attention";
  if (status === "ready_for_final_approval") return "Approval required";
  if (status === "failed") return "Stopped safely";
  return "Ready for review";
}
