"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  getStoredEmail,
  type ApplicationQuestion,
  type ApplicationProfile,
  type ApplicationReview,
  type GeneratedResume,
  type ResumeSpec,
} from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, ScoreRing, ShimmerRows, formatDate } from "@/components/app/ui";
import { portalName, reviewablePackets as onlyReviewablePackets } from "@/lib/application-review";

type Screen = "review" | "questions" | "submitting" | "submitted";

type ResumeGenerationResponse = { resume_id: string };
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

const QA_PACKET: GeneratedResume = {
  id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b01",
  job_context: { company: "Acme Labs", role: "Product Engineer", jd_hash: "qa" },
  resume_object_key: "qa",
  created_at: "2026-07-21T12:00:00.000Z",
  download_url: "#",
  spec: {
    school: "University of Southern California",
    degree: "B.S. Computer Science",
    grad_date: "May 2027",
    coursework: "Data Structures, Software Engineering",
    education_position: "top",
    experience: [
      {
        type: "job",
        org: "Elemental AI",
        title: "Product Engineer",
        date_range: "Jan 2026 - Present",
        bullets: [
          "Built a TypeScript workflow engine that automated 18 client handoffs and reduced turnaround time by 42%.",
          "Shipped accessible React dashboards used by 6 teams, with tested empty, loading, and error states.",
        ],
      },
      {
        type: "project",
        org: "Litos",
        title: "Founder and Engineer",
        date_range: "Jun 2026 - Present",
        bullets: [
          "Designed a job-application system that tailors grounded resumes and reviews every answer before submission.",
        ],
      },
    ],
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Product Engineering"],
    _quality: { atsCoverage: 76 },
    _review: {
      jd_text:
        "Acme Labs is hiring a Product Engineer to build TypeScript workflow systems and accessible React interfaces. You will partner with product teams, automate operational handoffs, write tested code, and improve application performance. Experience with Node.js, PostgreSQL, and customer-facing product engineering is preferred.",
      portal_url: "https://jobs.example.com/acme/product-engineer",
      ats_name: "Greenhouse",
      status: "questions_ready",
      edited_terms: ["workflow", "automated", "accessible", "tested", "Product Engineering"],
      questions: [
        {
          id: "why-acme",
          question: "Why are you interested in building products at Acme Labs?",
          answer:
            "I am drawn to Acme Labs because the role combines product judgment with hands-on engineering. I have built workflow systems and customer-facing tools where speed only mattered when the experience stayed clear and reliable.",
          kind: "essay",
          required: true,
        },
        {
          id: "example",
          question: "Describe a workflow you improved.",
          answer:
            "At Elemental AI, I built a TypeScript workflow engine that automated 18 client handoffs and reduced turnaround time by 42%. I mapped failure states first, then added visible recovery paths so every handoff remained traceable.",
          kind: "essay",
          required: true,
        },
      ],
      skipped_reasons: [],
      updated_at: "2026-07-21T12:00:00.000Z",
    },
  },
};

const QA_SCENARIOS: Record<string, GeneratedResume> = {
  acme: QA_PACKET,
  stripe: qaVariant(QA_PACKET, {
    id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b02",
    company: "Stripe",
    role: "Software Engineering Intern",
    ats: "Lever",
    score: 82,
    jd: "Stripe is hiring a Software Engineering Intern to build reliable TypeScript services and React tools. You will improve payment workflows, write tested code, analyze production performance, and collaborate across engineering and product. Experience with Node.js, PostgreSQL, and accessible interfaces is valued.",
    title: "Software Engineering Intern",
    bullets: [
      "Built reliable TypeScript services that automated 18 operational handoffs and reduced turnaround time by 42%.",
      "Shipped tested React tools for 6 teams and documented production recovery paths.",
    ],
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Software Engineering"],
    editedTerms: ["reliable", "automated", "tested", "production", "Software Engineering"],
    questions: [],
  }),
  notion: qaVariant(QA_PACKET, {
    id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b03",
    company: "Notion",
    role: "Product Design Intern",
    ats: "Ashby",
    score: 74,
    jd: "Notion is looking for a Product Design Intern who can turn complex workflows into calm, accessible product experiences. You will prototype in Figma, partner with engineers, test interaction details, and communicate clear design rationale. Experience designing dashboards and systems for real users is preferred.",
    title: "Product Designer",
    bullets: [
      "Designed accessible workflow dashboards in Figma and React for 6 client teams.",
      "Tested interaction details with users and reduced handoff turnaround time by 42%.",
    ],
    skills: ["Figma", "Product Design", "Design Systems", "React", "User Research"],
    editedTerms: ["accessible", "Figma", "interaction", "users", "Design Systems"],
    questions: [
      {
        id: "notion-craft",
        question: "Tell us about a product detail you refined through user feedback.",
        answer: "While designing a workflow dashboard, I saw that users understood system status but could not recover confidently from a failed handoff. I added visible recovery paths, tested the revised interaction, and used the findings to simplify the surrounding controls.",
        kind: "essay",
        required: true,
      },
    ],
  }),
  figma: qaVariant(QA_PACKET, {
    id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b04",
    company: "Figma",
    role: "Data Analyst Intern",
    ats: "Workday",
    score: 79,
    jd: "Figma is hiring a Data Analyst Intern to define product metrics, build trustworthy dashboards, and translate behavioral data into clear recommendations. You will work with SQL, PostgreSQL, experimentation, and cross-functional product teams. Strong communication and careful data validation are required.",
    title: "Data Analyst",
    bullets: [
      "Built trustworthy PostgreSQL dashboards that tracked 18 workflow handoffs across 6 teams.",
      "Analyzed product metrics and validated reporting changes that reduced turnaround time by 42%.",
    ],
    skills: ["SQL", "PostgreSQL", "Product Analytics", "Experimentation", "Data Visualization"],
    editedTerms: ["trustworthy", "dashboards", "metrics", "validated", "Product Analytics"],
    questions: [],
  }),
  vercel: qaVariant(QA_PACKET, {
    id: "d6693be1-9d1d-4f61-9911-8d95f1ad1b05",
    company: "Vercel",
    role: "Developer Advocate Intern",
    ats: "Greenhouse",
    score: 77,
    jd: "Vercel is seeking a Developer Advocate Intern to teach developers through clear technical content, product demos, and community programs. You will build examples with React and TypeScript, explain complex workflows, gather developer feedback, and partner with product engineering. Strong writing and public communication are essential.",
    title: "Developer Advocate",
    bullets: [
      "Built React and TypeScript product demos that explained workflow automation to 6 client teams.",
      "Translated developer feedback into tested examples and clear implementation guidance.",
    ],
    skills: ["TypeScript", "React", "Technical Writing", "Developer Education", "Public Speaking"],
    editedTerms: ["demos", "explained", "developer", "guidance", "Technical Writing"],
    questions: [
      {
        id: "vercel-teach",
        question: "What technical concept have you enjoyed teaching others?",
        answer: "I enjoy teaching state and failure handling because a small, concrete demo can turn an abstract reliability concept into something a developer can immediately apply.",
        kind: "essay",
        required: true,
      },
      {
        id: "vercel-community",
        question: "How would you learn what a developer community needs?",
        answer: "I would combine direct conversations with support themes, documentation searches, and product feedback, then test a small piece of content before investing in a larger program.",
        kind: "essay",
        required: true,
      },
      {
        id: "vercel-why",
        question: "Why Vercel?",
        answer: "Vercel sits at the intersection of product engineering and developer education, which matches how I like to work: build the example, understand the friction, and explain the path clearly.",
        kind: "essay",
        required: true,
      },
    ],
  }),
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

  const moveToScreen = useCallback((next: Screen) => {
    setScreen(next);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }, []);

  const selectPacket = useCallback((packet: GeneratedResume) => {
    setSelectedId(packet.id);
    setSpec(stripMetadata(packet.spec));
    setQuestions(packet.spec._review?.questions ?? []);
    moveToScreen(packet.spec._review?.status === "submitted" ? "submitted" : "review");
    setError(null);
    setNotice(null);
  }, [moveToScreen]);

  useEffect(() => {
    const qaScenario = new URLSearchParams(window.location.search).get("qa");
    const localQa = process.env.NODE_ENV !== "production" && qaScenario !== null;
    if (localQa) {
      queueMicrotask(() => {
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
  const resumeText = useMemo(() => (spec ? resumeCorpus(spec).toLowerCase() : ""), [spec]);

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
      const created = history.resumes.find((packet) => packet.id === generated.resume_id);
      setPackets(history.resumes);
      if (!created?.spec._review) throw new Error("The review packet was generated but could not be reopened.");
      selectPacket(created);
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
    if (questions.length > 0) moveToScreen("questions");
    else await submitApplication([]);
  }

  async function submitApplication(finalQuestions = questions) {
    if (!selected) return;
    if (finalQuestions.some((question) => question.required && !question.answer.trim())) {
      setError("Answer every required question before submitting.");
      return;
    }
    moveToScreen("submitting");
    setError(null);
    try {
      if (!qaMode) {
        throw new Error("Backend-only portal submission is not connected yet. Your approved packet is saved, but nothing was sent to the employer.");
      } else {
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
      moveToScreen("submitted");
    } catch (reason) {
      moveToScreen(finalQuestions.length > 0 ? "questions" : "review");
      setError(reason instanceof Error ? reason.message : "The company portal did not accept the submission.");
    }
  }

  if (error && packets === null) return <ErrorNote message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Application review</p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight text-ink">Review the job and your resume together.</h1>
          <p className="mt-1 text-sm text-muted">Build and review application packets here. Employer submission stays blocked until the backend portal runner is connected.</p>
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
        <QuestionsScreen questions={questions} onChange={setQuestions} onBack={() => moveToScreen("review")} onSubmit={() => submitApplication()} />
      ) : screen === "submitting" ? (
        <CenteredState title="Submitting through the company portal." body="Keep this dashboard open. Litos is applying your approved resume and answers in the background." loading />
      ) : screen === "submitted" ? (
        <CenteredState title="Application submitted." body={`${selected.job_context.role} at ${selected.job_context.company} is complete. The company portal confirmed receipt.`} />
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
                <HighlightedText text={review.jd_text} terms={resumeText.split(/\s+/).filter((term) => term.length > 4)} tone="match" />
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
              <ResumeEditor spec={spec} editedTerms={review.edited_terms} onChange={setSpec} onPatchEntry={patchEntry} />
            </DocumentPane>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border bg-surface-alt p-4">
            <div>
              <p className="text-sm font-medium text-ink">Your edits are checked before anything is submitted.</p>
              <p className="mt-0.5 text-xs text-muted">Blue highlights job language. Underlined blue marks wording Litos tailored from your source resume.</p>
            </div>
            <div className="flex gap-2">
              {selected.download_url && selected.download_url !== "#" && <a href={selected.download_url} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View PDF</a>}
              <button onClick={continueFromResume} disabled={saving} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {saving ? "Checking resume..." : questions.length > 0 ? `Continue to ${questions.length} question${questions.length === 1 ? "" : "s"}` : "Submit application"}
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
          {creating ? "Generating review packet..." : "Generate review packet"}
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

function ResumeEditor({ spec, editedTerms, onChange, onPatchEntry }: { spec: ResumeSpec; editedTerms: string[]; onChange: (spec: ResumeSpec) => void; onPatchEntry: (index: number, patch: Partial<ResumeSpec["experience"][number]>) => void }) {
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

function EditableHighlight({ value, terms, onChange }: { value: string; terms: string[]; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <textarea autoFocus aria-label="Edit optimized resume text" value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => setEditing(false)} rows={Math.max(2, Math.ceil(value.length / 75))} className="w-full resize-none rounded-[8px] border border-brand bg-white px-2 py-1 outline-none" />
  ) : (
    <button type="button" onClick={() => setEditing(true)} className="text-left leading-5 hover:bg-brand-soft/50 focus:outline-none focus:ring-2 focus:ring-brand/30">
      <HighlightedText text={value} terms={terms} tone="edited" />
    </button>
  );
}

function HighlightedText({ text, terms, tone }: { text: string; terms: string[]; tone: "match" | "edited" }) {
  const normalized = new Set(terms.map((term) => term.toLowerCase().replace(/[^a-z0-9+#./-]/g, "")).filter(Boolean));
  return <>{text.split(/(\s+)/).map((part, index) => {
    const key = part.toLowerCase().replace(/[^a-z0-9+#./-]/g, "");
    const highlighted = key.length > 2 && normalized.has(key);
    return highlighted ? <mark key={index} className={tone === "edited" ? "border-b-2 border-brand bg-surface-alt px-0.5 text-brand-ink" : "rounded bg-brand-soft px-0.5 text-brand-ink"}>{part}</mark> : <span key={index}>{part}</span>;
  })}</>;
}

function QuestionsScreen({ questions, onChange, onBack, onSubmit }: { questions: ApplicationQuestion[]; onChange: (questions: ApplicationQuestion[]) => void; onBack: () => void; onSubmit: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={onBack} className="text-sm text-muted hover:text-ink">← Back to resume</button>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-teal-ink">Portal questions</p>
        <h2 className="mt-2 text-2xl font-medium tracking-tight text-ink">Review the answers that need your voice.</h2>
        <p className="mt-1 text-sm text-muted">This screen appears only when the company portal asks for more than your profile already provides.</p>
      </div>
      {questions.map((question, index) => (
        <Card key={question.id} className="p-6">
          <label htmlFor={`question-${question.id}`} className="text-sm font-medium text-ink">{question.question}</label>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-teal-ink">{question.kind === "essay" ? "Litos draft · edit freely" : "Required by the portal"}</p>
          <textarea id={`question-${question.id}`} value={question.answer} onChange={(event) => onChange(questions.map((item, i) => (i === index ? { ...item, answer: event.target.value } : item)))} rows={6} className="mt-4 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand" />
        </Card>
      ))}
      <div className="flex justify-end"><button onClick={onSubmit} className="rounded-full bg-brand px-6 py-3 text-sm font-medium text-white">Submit application</button></div>
    </div>
  );
}

function CenteredState({ title, body, loading = false }: { title: string; body: string; loading?: boolean }) {
  return <Card className="mx-auto max-w-2xl p-12 text-center"><div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${loading ? "rq-shimmer" : "bg-positive-soft text-positive"}`}>{loading ? "" : "✓"}</div><h2 className="mt-5 text-xl font-medium text-ink">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{body}</p></Card>;
}

function stripMetadata(spec: GeneratedResume["spec"]): ResumeSpec {
  return { school: spec.school ?? "", degree: spec.degree ?? "", grad_date: spec.grad_date ?? "", coursework: spec.coursework ?? "", education_position: spec.education_position, experience: spec.experience ?? [], skills: spec.skills ?? [], skill_source: spec.skill_source };
}

function qaVariant(packet: GeneratedResume, options: {
  id: string;
  company: string;
  role: string;
  ats: string;
  score: number;
  jd: string;
  title: string;
  bullets: string[];
  skills: string[];
  editedTerms: string[];
  questions: ApplicationQuestion[];
}): GeneratedResume {
  const review = packet.spec._review;
  if (!review) return packet;
  return {
    ...packet,
    id: options.id,
    job_context: { company: options.company, role: options.role, jd_hash: `qa-${options.company.toLowerCase()}` },
    spec: {
      ...packet.spec,
      experience: packet.spec.experience.map((entry, index) =>
        index === 0 ? { ...entry, title: options.title, bullets: options.bullets } : entry,
      ),
      skills: options.skills,
      _quality: { ...packet.spec._quality, atsCoverage: options.score },
      _review: {
        ...review,
        jd_text: options.jd,
        portal_url: `https://jobs.example.com/${options.company.toLowerCase()}/${options.role.toLowerCase().replaceAll(" ", "-")}`,
        ats_name: options.ats,
        status: options.questions.length > 0 ? "questions_ready" : "ready_to_submit",
        edited_terms: options.editedTerms,
        questions: options.questions,
      },
    },
  };
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
  return "Ready for review";
}
