"use client";

import { useEffect, useMemo, useState } from "react";
import {
  api,
  type ApplicationQuestion,
  type ApplicationReview,
  type GeneratedResume,
  type ResumeSpec,
} from "@/lib/api";
import { EXTENSION_ID, STORE_URL } from "@/lib/config";
import { Card, Chip, EmptyState, ErrorNote, ShimmerRows, formatDate } from "@/components/app/ui";

type Screen = "review" | "questions" | "submitting" | "submitted";

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

  useEffect(() => {
    const qaScenario = new URLSearchParams(window.location.search).get("qa");
    const localQa = process.env.NODE_ENV !== "production" && qaScenario !== null;
    if (localQa) {
      queueMicrotask(() => {
        const packet = qaScenario === "no-questions" ? withoutQuestions(QA_PACKET) : QA_PACKET;
        setQaMode(true);
        setPackets([packet]);
        selectPacket(packet);
      });
      return;
    }
    let cancelled = false;
    api<{ resumes: GeneratedResume[] }>("/resume/history")
      .then((result) => {
        if (cancelled) return;
        setPackets(result.resumes);
        const requestedId = new URLSearchParams(window.location.search).get("application");
        const requested = result.resumes.find((packet) => packet.id === requestedId && packet.spec._review);
        const first = requested ?? result.resumes.find((packet) => packet.spec._review);
        if (first) selectPacket(first);
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "Could not load applications."));
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = packets?.find((packet) => packet.id === selectedId) ?? null;
  const review = selected?.spec._review;
  const resumeText = useMemo(() => (spec ? resumeCorpus(spec).toLowerCase() : ""), [spec]);

  function selectPacket(packet: GeneratedResume) {
    setSelectedId(packet.id);
    setSpec(stripMetadata(packet.spec));
    setQuestions(packet.spec._review?.questions ?? []);
    setScreen(packet.spec._review?.status === "submitted" ? "submitted" : "review");
    setError(null);
    setNotice(null);
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
    if (questions.length > 0) setScreen("questions");
    else await submitApplication([]);
  }

  async function submitApplication(finalQuestions = questions) {
    if (!selected) return;
    if (finalQuestions.some((question) => question.required && !question.answer.trim())) {
      setError("Answer every required question before submitting.");
      return;
    }
    setScreen("submitting");
    setError(null);
    try {
      if (!qaMode) {
        await api(`/applications/${selected.id}/submit-request`, {
          method: "POST",
          body: JSON.stringify({ questions: finalQuestions }),
        });
        await sendToExtension({ type: "LITOS_SUBMIT_APPLICATION", applicationId: selected.id, questions: finalQuestions });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
      setScreen("submitted");
    } catch (reason) {
      setScreen(finalQuestions.length > 0 ? "questions" : "review");
      setError(reason instanceof Error ? reason.message : "The company portal did not accept the submission.");
    }
  }

  if (error && packets === null) return <ErrorNote message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Application review</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Review the job and your resume together.</h1>
          <p className="mt-1 text-sm text-muted">Litos handles the portal in the background. You stay here through submission.</p>
        </div>
        {selected && review && <Chip label={statusLabel(screen, review.status)} kind={screen === "submitted" ? "sent" : "ready"} />}
      </div>

      {error && <ErrorNote message={error} />}
      {notice && <p role="status" className="rounded-[12px] bg-positive-soft px-4 py-3 text-sm text-positive">{notice}</p>}

      {packets === null ? (
        <ShimmerRows rows={4} />
      ) : packets.length === 0 ? (
        <EmptyState title="No applications ready" body="When the extension prepares a job in the background, its job description and tailored resume will appear here.">
          <a href={STORE_URL} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white">Add Litos to Chrome</a>
        </EmptyState>
      ) : !selected || !spec || !review ? (
        <div className="grid gap-3">
          {packets.map((packet) => (
            <button key={packet.id} onClick={() => selectPacket(packet)} className="rounded-[20px] border border-border bg-surface p-5 text-left hover:border-ink/30">
              <span className="text-sm font-medium text-ink">{packet.job_context.role}</span>
              <span className="ml-2 text-sm text-muted">{packet.job_context.company}</span>
            </button>
          ))}
        </div>
      ) : screen === "questions" ? (
        <QuestionsScreen questions={questions} onChange={setQuestions} onBack={() => setScreen("review")} onSubmit={() => submitApplication()} />
      ) : screen === "submitting" ? (
        <CenteredState title="Submitting through the company portal." body="Keep this dashboard open. Litos is applying your approved resume and answers in the background." loading />
      ) : screen === "submitted" ? (
        <CenteredState title="Application submitted." body={`${selected.job_context.role} at ${selected.job_context.company} is complete. The company portal confirmed receipt.`} />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {packets.map((packet) => (
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

            <DocumentPane eyebrow="Tailored resume" title="Your optimized version" meta={`${formatDate(selected.created_at)} · ${extractScore(selected.spec)}% match`}>
              <ResumeEditor spec={spec} editedTerms={review.edited_terms} onChange={setSpec} onPatchEntry={patchEntry} />
            </DocumentPane>
          </div>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border bg-white/95 p-4 shadow-[0_10px_40px_rgba(18,18,15,0.08)] backdrop-blur">
            <div>
              <p className="text-sm font-medium text-ink">Your edits are checked before anything is submitted.</p>
              <p className="mt-0.5 text-xs text-muted">Blue matches the job. Coral marks wording Litos tailored from your source resume.</p>
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

function DocumentPane({ eyebrow, title, meta, children }: { eyebrow: string; title: string; meta: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-surface">
      <header className="border-b border-border px-6 py-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{eyebrow}</p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-medium text-ink">{title}</h2>
          <span className="font-mono text-[10px] text-faint">{meta}</span>
        </div>
      </header>
      <div className="max-h-[760px] overflow-y-auto p-6">{children}</div>
    </section>
  );
}

function ResumeEditor({ spec, editedTerms, onChange, onPatchEntry }: { spec: ResumeSpec; editedTerms: string[]; onChange: (spec: ResumeSpec) => void; onPatchEntry: (index: number, patch: Partial<ResumeSpec["experience"][number]>) => void }) {
  return (
    <div className="mx-auto max-w-[640px] bg-white px-7 py-8 text-[13px] leading-5 text-ink shadow-[0_1px_8px_rgba(18,18,15,0.08)]">
      <EditableLine value={spec.school} onChange={(school) => onChange({ ...spec, school })} className="text-center text-lg font-semibold" />
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
    return highlighted ? <mark key={index} className={tone === "edited" ? "rounded bg-coral-soft px-0.5 text-coral-ink" : "rounded bg-brand-soft px-0.5 text-brand-ink"}>{part}</mark> : <span key={index}>{part}</span>;
  })}</>;
}

function QuestionsScreen({ questions, onChange, onBack, onSubmit }: { questions: ApplicationQuestion[]; onChange: (questions: ApplicationQuestion[]) => void; onBack: () => void; onSubmit: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={onBack} className="text-sm text-muted hover:text-ink">← Back to resume</button>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-coral-ink">Portal questions</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Review the answers that need your voice.</h2>
        <p className="mt-1 text-sm text-muted">This screen appears only when the company portal asks for more than your profile already provides.</p>
      </div>
      {questions.map((question, index) => (
        <Card key={question.id} className="p-6">
          <label htmlFor={`question-${question.id}`} className="text-sm font-medium text-ink">{question.question}</label>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{question.kind === "essay" ? "Litos draft · edit freely" : "Required by the portal"}</p>
          <textarea id={`question-${question.id}`} value={question.answer} onChange={(event) => onChange(questions.map((item, i) => (i === index ? { ...item, answer: event.target.value } : item)))} rows={6} className="mt-4 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand" />
        </Card>
      ))}
      <div className="flex justify-end"><button onClick={onSubmit} className="rounded-full bg-brand px-6 py-3 text-sm font-medium text-white">Submit application</button></div>
    </div>
  );
}

function CenteredState({ title, body, loading = false }: { title: string; body: string; loading?: boolean }) {
  return <Card className="mx-auto max-w-2xl p-12 text-center"><div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${loading ? "rq-shimmer" : "bg-positive-soft text-positive"}`}>{loading ? "" : "✓"}</div><h2 className="mt-5 text-xl font-semibold text-ink">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{body}</p></Card>;
}

function stripMetadata(spec: GeneratedResume["spec"]): ResumeSpec {
  return { school: spec.school ?? "", degree: spec.degree ?? "", grad_date: spec.grad_date ?? "", coursework: spec.coursework ?? "", education_position: spec.education_position, experience: spec.experience ?? [], skills: spec.skills ?? [], skill_source: spec.skill_source };
}

function withoutQuestions(packet: GeneratedResume): GeneratedResume {
  const review = packet.spec._review;
  if (!review) return packet;
  return {
    ...packet,
    spec: {
      ...packet.spec,
      _review: { ...review, questions: [], status: "ready_to_submit" },
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

function sendToExtension(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const runtime = (window as unknown as { chrome?: { runtime?: { sendMessage?: (id: string, message: unknown, callback: (response: unknown) => void) => void; lastError?: { message?: string } } } }).chrome?.runtime;
    if (!runtime?.sendMessage) {
      reject(new Error("Litos could not reach the browser extension. Keep the extension installed and try again."));
      return;
    }
    runtime.sendMessage(EXTENSION_ID, message, (response) => {
      if (runtime.lastError) reject(new Error(runtime.lastError.message ?? "Could not reach the Litos extension."));
      else if ((response as { error?: string } | null)?.error) reject(new Error((response as { error: string }).error));
      else resolve(response);
    });
  });
}
