"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ResumeWorkspace from "../resume/page";
import { api, type ApplicationProfile, type CanonicalApplication, type CanonicalCoverLetterResponse, type DocumentSummary, type GeneratedResume } from "@/lib/api";
import { Button, ButtonLink } from "@/components/app/Button";
import { Card, EmptyState, ErrorNote, ShimmerRows } from "@/components/app/ui";
import { useBilling } from "@/components/billing/BillingProvider";

const TABS = [
  ["base-resume", "Main resume"],
  ["tailored-resumes", "Tailored resumes"],
  ["cover-letters", "Cover letters"],
  ["saved-answers", "Saved answers"],
  ["attachments", "Attachments"],
] as const;
type Tab = typeof TABS[number][0];

export default function DocumentsPage() {
  const router = useRouter();
  const { canUse, openUpgrade } = useBilling();
  const [tab, setTab] = useState<Tab>("base-resume");
  const [resumes, setResumes] = useState<GeneratedResume[] | null>(null);
  const [coverLetters, setCoverLetters] = useState<CanonicalCoverLetterResponse[] | null>(null);
  const [applications, setApplications] = useState<CanonicalApplication[]>([]);
  const [attachments, setAttachments] = useState<DocumentSummary[] | null>(null);
  const [profile, setProfile] = useState<ApplicationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some(([value]) => value === requested)) queueMicrotask(() => setTab(requested as Tab));
    Promise.all([
      api<{ resumes: GeneratedResume[] }>("/resume/history").catch(() => ({ resumes: [] })),
      api<{ cover_letters?: CanonicalCoverLetterResponse[] }>("/cover-letters").catch(() => ({ cover_letters: [] })),
      api<{ applications?: CanonicalApplication[] }>("/applications?limit=200").catch(() => ({ applications: [] })),
      api<{ documents?: DocumentSummary[] } | DocumentSummary[]>("/documents").catch(() => []),
      api<ApplicationProfile>("/profile/application").catch(() => ({})),
    ]).then(([history, canonicalLetters, canonicalApplications, documents, applicationProfile]) => {
      setResumes(history.resumes);
      setCoverLetters(canonicalLetters.cover_letters ?? []);
      setApplications(canonicalApplications.applications ?? []);
      setAttachments(Array.isArray(documents) ? documents : documents.documents ?? []);
      setProfile(applicationProfile);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Documents could not load."));
  }, []);

  function choose(next: Tab) {
    setTab(next);
    router.replace(`/dashboard/documents?tab=${next}`, { scroll: false });
  }

  function tailor() {
    if (canUse("ai_resume_tailoring") === true) {
      router.push("/dashboard/applications?intent=tailor");
      return;
    }
    openUpgrade({
      feature: "ai_resume_tailoring",
      placement: "documents",
      trigger: "tailor_resume",
      manualLabel: "Fill with main resume",
      onManual: () => router.push("/dashboard/applications?intent=fill"),
    });
  }

  const legacyCoverLetters = resumes?.filter((resume) => resume.spec._cover_letter) ?? null;
  const savedAnswerCount = profile ? Object.values(profile).filter((value) => typeof value === "string" && value.trim()).length : 0;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Application library</p>
          <h1 className="mt-2 text-section font-[450] text-ink">Documents</h1>
          <p className="mt-2 text-body text-muted">Your main resume, tailored work, answers, and employer attachments stay together.</p>
        </div>
        <Button type="button" variant="secondary" onClick={tailor}>Tailor a resume</Button>
      </header>

      <nav aria-label="Document sections" className="flex gap-2 overflow-x-auto border-b border-border pb-3">
        {TABS.map(([value, label]) => (
          <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => choose(value)} className={`min-h-11 shrink-0 rounded-control px-4 text-small ${tab === value ? "bg-brand-soft font-medium text-brand-ink" : "text-muted hover:bg-surface-alt hover:text-ink"}`}>{label}</button>
        ))}
      </nav>

      {error && <ErrorNote message={error} />}
      {tab === "base-resume" && <ResumeWorkspace />}
      {tab === "tailored-resumes" && <GeneratedLibrary kind="resume" items={resumes} />}
      {tab === "cover-letters" && (
        <CoverLetterLibrary
          canonical={coverLetters}
          legacy={legacyCoverLetters}
          applications={applications}
          onChanged={() => {
            void api<{ cover_letters?: CanonicalCoverLetterResponse[] }>("/cover-letters", { cache: "no-store" })
              .then((result) => setCoverLetters(result.cover_letters ?? []))
              .catch((reason) => setError(reason instanceof Error ? reason.message : "Cover letters could not refresh."));
          }}
        />
      )}
      {tab === "saved-answers" && (
        <Card className="p-6">
          <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Reusable profile answers</p>
          <h2 className="mt-2 text-heading font-[450] text-ink">{profile === null ? "Loading saved answers" : `${savedAnswerCount} saved answer${savedAnswerCount === 1 ? "" : "s"}`}</h2>
          <p className="mt-2 text-small text-muted">Application facts remain editable in Account and are used only where the employer asks for them.</p>
          <ButtonLink href="/dashboard/settings#application-details" variant="secondary" className="mt-5">Review saved answers</ButtonLink>
        </Card>
      )}
      {tab === "attachments" && (
        attachments === null ? <ShimmerRows rows={3} /> : attachments.length === 0 ? (
          <EmptyState visual="applications" title="No reusable attachments" body="Employer documents you upload will stay available here when the application allows reuse." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {attachments.filter((item) => !item.deleted_at).map((item) => (
              <Card key={item.id} className="p-5">
                <p className="truncate text-small font-medium text-ink">{item.file_name}</p>
                <p className="mt-2 font-mono text-label text-muted">{item.kind} · {Math.max(1, Math.round(item.byte_size / 1024))} KB</p>
                <p className="mt-3 text-label text-muted">Uploaded {new Date(item.created_at).toLocaleDateString()}</p>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function GeneratedLibrary({ kind, items }: { kind: "resume" | "cover letter"; items: GeneratedResume[] | null }) {
  if (items === null) return <ShimmerRows rows={3} />;
  if (items.length === 0) {
    return <EmptyState visual="applications" title={`No tailored ${kind}s yet`} body={`Existing ${kind}s will remain available here, even if your plan changes.`} />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Card key={item.id} className="flex flex-col p-5">
          <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">{kind}</p>
          <h2 className="mt-2 text-heading font-[450] text-ink">{item.job_context.role ?? "Application document"}</h2>
          <p className="mt-1 text-small text-muted">{item.job_context.company ?? "Company not recorded"}</p>
          <p className="mt-4 font-mono text-label text-muted">{item.created_at ? new Date(item.created_at).toLocaleDateString() : "Date not recorded"}</p>
          <ButtonLink href={`/dashboard/applications?application=${item.id}`} variant="secondary" className="mt-5">Open application</ButtonLink>
        </Card>
      ))}
    </div>
  );
}

function CoverLetterLibrary({
  canonical,
  legacy,
  applications,
  onChanged,
}: {
  canonical: CanonicalCoverLetterResponse[] | null;
  legacy: GeneratedResume[] | null;
  applications: CanonicalApplication[];
  onChanged: () => void;
}) {
  const [reuseTargets, setReuseTargets] = useState<Record<string, string>>({});
  const [reuseBusy, setReuseBusy] = useState<string | null>(null);
  const [reuseError, setReuseError] = useState<string | null>(null);
  if (canonical === null || legacy === null) return <ShimmerRows rows={3} />;
  const applicationsById = new Map(applications.map((application) => [application.id, application]));
  const canonicalPacketIds = new Set(canonical.flatMap((item) => item.packet_id ? [item.packet_id] : []));
  const unlinkedLegacy = legacy.filter((item) => !canonicalPacketIds.has(item.id));
  if (canonical.length === 0 && unlinkedLegacy.length === 0) {
    return (
      <EmptyState visual="applications" title="No cover letters yet" body="Write, upload, or reuse a cover letter from any saved application. Manual cover letters stay free.">
        <ButtonLink href="/dashboard/applications?intent=fill">Open applications</ButtonLink>
      </EmptyState>
    );
  }

  async function reuse(item: CanonicalCoverLetterResponse) {
    const targetApplicationId = reuseTargets[item.cover_letter.artifact_id];
    if (!targetApplicationId) return;
    setReuseBusy(item.cover_letter.artifact_id);
    setReuseError(null);
    try {
      await api(`/applications/${targetApplicationId}/cover-letter/reuse`, {
        method: "POST",
        body: JSON.stringify({ artifact_id: item.cover_letter.artifact_id }),
      });
      onChanged();
    } catch (reason) {
      setReuseError(reason instanceof Error ? reason.message : "This cover letter could not be reused.");
    } finally {
      setReuseBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {reuseError && <ErrorNote message={reuseError} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {canonical.map((item) => {
          const application = applicationsById.get(item.application_id);
          const reuseOptions = applications.filter((candidate) => candidate.id !== item.application_id);
          return (
            <Card key={`${item.application_id}:${item.cover_letter.artifact_id}`} className="flex flex-col p-5">
              <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Cover letter</p>
              <h2 className="mt-2 text-heading font-[450] text-ink">{application?.role ?? "Application document"}</h2>
              <p className="mt-1 text-small text-muted">{application?.company ?? "Company not recorded"}</p>
              <p className="mt-3 text-label text-muted">{item.cover_letter.source === "user_uploaded_cover_letter" ? "Uploaded" : item.cover_letter.source === "user_edited_cover_letter" ? "Written by you" : "Drafted with Litos+"}</p>
              {item.cover_letter.body && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-small leading-6 text-muted">{item.cover_letter.body}</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink href={`/dashboard/applications?application=${item.application_id}&intent=detail`} variant="secondary">Open application</ButtonLink>
                <ButtonLink href={item.download_url} variant="quiet">Download</ButtonLink>
              </div>
              {reuseOptions.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <label className="text-label text-muted">
                    Reuse for another application
                    <select
                      value={reuseTargets[item.cover_letter.artifact_id] ?? ""}
                      onChange={(event) => setReuseTargets((current) => ({ ...current, [item.cover_letter.artifact_id]: event.target.value }))}
                      className="rq-field mt-2 w-full rounded-inner px-3 py-2.5 text-small text-ink"
                    >
                      <option value="">Choose an application</option>
                      {reuseOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.role} at {candidate.company}</option>)}
                    </select>
                  </label>
                  <Button type="button" variant="quiet" className="mt-2" disabled={!reuseTargets[item.cover_letter.artifact_id] || reuseBusy === item.cover_letter.artifact_id} onClick={() => void reuse(item)}>
                    {reuseBusy === item.cover_letter.artifact_id ? "Reusing..." : "Reuse cover letter"}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
        {unlinkedLegacy.map((item) => (
          <Card key={item.id} className="flex flex-col p-5">
            <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Cover letter</p>
            <h2 className="mt-2 text-heading font-[450] text-ink">{item.job_context.role ?? "Application document"}</h2>
            <p className="mt-1 text-small text-muted">{item.job_context.company ?? "Company not recorded"}</p>
            <p className="mt-4 font-mono text-label text-muted">Saved before the document library update</p>
            <ButtonLink href={`/dashboard/applications?application=${item.id}`} variant="secondary" className="mt-5">Open application</ButtonLink>
          </Card>
        ))}
      </div>
    </div>
  );
}
