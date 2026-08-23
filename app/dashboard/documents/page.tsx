"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ResumeWorkspace from "../resume/page";
import { api, getApplicationProfile, type ApplicationProfile, type CanonicalApplication, type CanonicalCoverLetterResponse, type DocumentSummary, type GeneratedResume } from "@/lib/api";
import { Button, ButtonLink } from "@/components/app/Button";
import { Card, DataErrorState, EmptyState, ErrorNote, ShimmerRows } from "@/components/app/ui";
import { MotionPanel, runDashboardTransition } from "@/components/app/Motion";
import { useBilling } from "@/components/billing/BillingProvider";
import { userFacingError } from "@/lib/user-facing-error";

const TABS = [
  ["base-resume", "Main resume"],
  ["tailored-resumes", "Tailored resumes"],
  ["cover-letters", "Cover letters"],
  ["saved-answers", "Saved answers"],
  ["attachments", "Attachments"],
] as const;
type Tab = typeof TABS[number][0];
type DocumentResource = "resumes" | "coverLetters" | "applications" | "attachments" | "profile";
type DocumentResourceErrors = Partial<Record<DocumentResource, string>>;

export default function DocumentsPage() {
  const router = useRouter();
  const { canUse, openUpgrade } = useBilling();
  const [tab, setTab] = useState<Tab>("base-resume");
  const [resumes, setResumes] = useState<GeneratedResume[] | null>(null);
  const [coverLetters, setCoverLetters] = useState<CanonicalCoverLetterResponse[] | null>(null);
  const [applications, setApplications] = useState<CanonicalApplication[] | null>(null);
  const [attachments, setAttachments] = useState<DocumentSummary[] | null>(null);
  const [profile, setProfile] = useState<ApplicationProfile | null>(null);
  const [resourceErrors, setResourceErrors] = useState<DocumentResourceErrors>({});
  const [documentsTabsViewport, setDocumentsTabsViewport] = useState<HTMLDivElement | null>(null);
  const [showDocumentsTabOverflowCue, setShowDocumentsTabOverflowCue] = useState(false);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const setResourceError = useCallback((resource: DocumentResource, message: string | null) => {
    setResourceErrors((current) => {
      const next = { ...current };
      if (message) next[resource] = message;
      else delete next[resource];
      return next;
    });
  }, []);

  const loadResumes = useCallback(async () => {
    try {
      const history = await api<{ resumes: GeneratedResume[] }>("/resume/history");
      setResumes(history.resumes);
      setResourceError("resumes", null);
    } catch (reason) {
      setResourceError("resumes", userFacingError(reason, "Your tailored resume history could not load."));
    }
  }, [setResourceError]);

  const loadCoverLetters = useCallback(async () => {
    try {
      const result = await api<{ cover_letters?: CanonicalCoverLetterResponse[] }>("/cover-letters", { cache: "no-store" });
      setCoverLetters(result.cover_letters ?? []);
      setResourceError("coverLetters", null);
    } catch (reason) {
      setResourceError("coverLetters", userFacingError(reason, "Your cover letters could not load."));
    }
  }, [setResourceError]);

  const loadApplications = useCallback(async () => {
    try {
      const result = await api<{ applications?: CanonicalApplication[] }>("/applications?limit=200");
      setApplications(result.applications ?? []);
      setResourceError("applications", null);
    } catch (reason) {
      setResourceError("applications", userFacingError(reason, "Application details for your cover letters could not load."));
    }
  }, [setResourceError]);

  const loadAttachments = useCallback(async () => {
    try {
      const result = await api<{ documents?: DocumentSummary[] } | DocumentSummary[]>("/documents");
      setAttachments(Array.isArray(result) ? result : result.documents ?? []);
      setResourceError("attachments", null);
    } catch (reason) {
      setResourceError("attachments", userFacingError(reason, "Your reusable attachments could not load."));
    }
  }, [setResourceError]);

  const loadProfile = useCallback(async () => {
    try {
      setProfile(await getApplicationProfile());
      setResourceError("profile", null);
    } catch (reason) {
      setResourceError("profile", userFacingError(reason, "Your saved application answers could not load."));
    }
  }, [setResourceError]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some(([value]) => value === requested)) queueMicrotask(() => setTab(requested as Tab));
    queueMicrotask(() => {
      void Promise.allSettled([
        loadResumes(),
        loadCoverLetters(),
        loadApplications(),
        loadAttachments(),
        loadProfile(),
      ]);
    });
  }, [loadApplications, loadAttachments, loadCoverLetters, loadProfile, loadResumes]);

  useEffect(() => {
    const viewport = documentsTabsViewport;
    if (!viewport) return;

    const updateOverflowCue = () => {
      const remaining = viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft;
      setShowDocumentsTabOverflowCue(remaining > 2);
    };

    updateOverflowCue();
    viewport.addEventListener("scroll", updateOverflowCue, { passive: true });
    window.addEventListener("resize", updateOverflowCue);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateOverflowCue);
    observer?.observe(viewport);

    return () => {
      viewport.removeEventListener("scroll", updateOverflowCue);
      window.removeEventListener("resize", updateOverflowCue);
      observer?.disconnect();
    };
  }, [documentsTabsViewport]);

  function choose(next: Tab) {
    if (next === tab) return;
    runDashboardTransition(() => {
      setTab(next);
      router.replace(`/dashboard/documents?tab=${next}`, { scroll: false });
    });
  }

  function moveTab(current: Tab, key: string) {
    const currentIndex = TABS.findIndex(([value]) => value === current);
    const nextIndex = key === "Home"
      ? 0
      : key === "End"
        ? TABS.length - 1
        : key === "ArrowRight"
          ? (currentIndex + 1) % TABS.length
          : (currentIndex - 1 + TABS.length) % TABS.length;
    const next = TABS[nextIndex][0];
    choose(next);
    requestAnimationFrame(() => tabRefs.current[next]?.focus());
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
  const coverLetterResourcesFailed = Boolean(resourceErrors.coverLetters || resourceErrors.resumes || resourceErrors.applications);
  const hasCoverLetterContent = (coverLetters?.length ?? 0) > 0 || (legacyCoverLetters?.length ?? 0) > 0;

  function retryCoverLetterResources() {
    const retries: Promise<void>[] = [];
    if (resourceErrors.coverLetters) retries.push(loadCoverLetters());
    if (resourceErrors.resumes) retries.push(loadResumes());
    if (resourceErrors.applications) retries.push(loadApplications());
    void Promise.all(retries);
  }

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

      <div className="relative">
        <div
          ref={setDocumentsTabsViewport}
          role="tablist"
          aria-label="Document sections"
          className="flex gap-2 overflow-x-auto border-b border-border pb-3"
        >
          {TABS.map(([value, label]) => (
            <button
              key={value}
              ref={(node) => { tabRefs.current[value] = node; }}
              type="button"
              role="tab"
              id={`documents-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`documents-panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => choose(value)}
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                  event.preventDefault();
                  moveTab(value, event.key);
                }
              }}
              className={`min-h-11 shrink-0 rounded-control px-4 text-small ${tab === value ? "bg-brand-soft font-medium text-brand-ink" : "text-muted hover:bg-surface-alt hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {showDocumentsTabOverflowCue && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-end bg-gradient-to-l from-bg via-bg/95 to-transparent pr-2 sm:hidden"
          >
            <span className="flex size-7 items-center justify-center rounded-full border border-border bg-surface text-base text-muted shadow-rest">
              ›
            </span>
          </div>
        )}
      </div>

      <MotionPanel key={tab} name="dashboard-documents-panel">
        <div id={`documents-panel-${tab}`} role="tabpanel" aria-labelledby={`documents-tab-${tab}`} tabIndex={0}>
        {tab === "base-resume" && <ResumeWorkspace />}
        {tab === "tailored-resumes" && (
          resourceErrors.resumes ? (
            <DataErrorState
              headingLevel="h2"
              title="Tailored resumes did not load."
              body={resourceErrors.resumes}
              onRetry={() => void loadResumes()}
            />
          ) : <GeneratedLibrary kind="resume" items={resumes} />
        )}
        {tab === "cover-letters" && (
          <div className="space-y-6">
            {coverLetterResourcesFailed && (
              <DataErrorState
                headingLevel="h2"
                title="Cover letters did not fully load."
                body="Your saved documents are unchanged. Try loading the missing details again."
                onRetry={retryCoverLetterResources}
              />
            )}
            {(!coverLetterResourcesFailed || hasCoverLetterContent) && (
              <CoverLetterLibrary
                canonical={resourceErrors.coverLetters ? [] : coverLetters}
                legacy={resourceErrors.resumes ? [] : legacyCoverLetters}
                applications={applications ?? []}
                onChanged={() => void loadCoverLetters()}
              />
            )}
          </div>
        )}
        {tab === "saved-answers" && (
          resourceErrors.profile ? (
            <DataErrorState
              headingLevel="h2"
              title="Saved answers did not load."
              body={resourceErrors.profile}
              onRetry={() => void loadProfile()}
            />
          ) : (
            <Card className="p-6">
              <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Reusable profile answers</p>
              <h2 className="mt-2 text-heading font-[450] text-ink">{profile === null ? "Loading saved answers" : `${savedAnswerCount} saved answer${savedAnswerCount === 1 ? "" : "s"}`}</h2>
              <p className="mt-2 text-small text-muted">Application facts remain editable in Account and are used only where the employer asks for them.</p>
              <ButtonLink href="/dashboard/settings#application-details" variant="secondary" className="mt-5">Review saved answers</ButtonLink>
            </Card>
          )
        )}
        {tab === "attachments" && (
          resourceErrors.attachments ? (
            <DataErrorState
              headingLevel="h2"
              title="Attachments did not load."
              body={resourceErrors.attachments}
              onRetry={() => void loadAttachments()}
            />
          ) : attachments === null ? <ShimmerRows rows={3} /> : attachments.length === 0 ? (
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
      </MotionPanel>
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
