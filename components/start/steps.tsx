"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApplicationProfile,
  ParsedProfile,
  RoleType,
  Targeting,
  getToken,
  getTargeting,
  putApplicationProfile,
  putTargeting,
  uploadResume,
} from "@/lib/api";
import { STORE_URL } from "@/lib/config";
import {
  ROLE_TYPES,
  defaultBackup,
  defaultPrimary,
  periodsFor,
} from "@/lib/periods";
import { Chip, LaterLink, PrimaryButton, Receipt, SkipLink, StartShell } from "./ui";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { ThinkingOrb } from "thinking-orbs";
import { JOB_TITLES } from "@/lib/job-titles";
import { categoriesForRoles, inferResumeTargeting } from "@/lib/onboarding-role-inference";
import { rankOnboardingJobs, type OnboardingJob } from "@/lib/onboarding-jobs";

/* ------------------------------------------------------------------- 00 FOCUS */

export function FocusStep({
  onDone,
  onLater,
  profile,
}: {
  onDone: () => void;
  onLater: () => void;
  profile: ParsedProfile;
}) {
  const guess = useMemo(() => inferResumeTargeting(profile), [profile]);
  const [selectedTitles, setSelectedTitles] = useState<string[]>(() => guess.roles[0] ? [guess.roles[0]] : []);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>(() => [guess.roleType]);
  const [newTitle, setNewTitle] = useState("");
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customMatches = useMemo(() => {
    const needle = newTitle.trim().toLowerCase();
    return JOB_TITLES
      .filter((title) => !guess.roles.some((role) => role.toLowerCase() === title.toLowerCase()))
      .filter((title) => !needle || title.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [guess.roles, newTitle]);

  useEffect(() => setActiveMatchIndex(0), [newTitle]);

  function toggleTitle(title: string) {
    setSelectedTitles((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : current.length < 12 ? [...current, title] : current,
    );
  }

  function addTitle(title: string) {
    const clean = title.trim();
    if (!clean) return;
    setSelectedTitles((current) =>
      current.some((item) => item.toLowerCase() === clean.toLowerCase()) || current.length >= 12
        ? current
        : [...current, clean],
    );
    setNewTitle("");
    setRoleMenuOpen(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await putTargeting({
        categories: categoriesForRoles(selectedTitles),
        titles: selectedTitles,
        role_types: roleTypes,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  return (
    <StartShell
      step="focus"
      title="Here's where we'd start."
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="mb-7">
        <p className="text-sm text-ink">Jobs that fit</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {guess.roles.map((title) => (
            <Chip
              key={title}
              label={title}
              on={selectedTitles.includes(title)}
              derived
              onClick={() => toggleTitle(title)}
            />
          ))}
        </div>

        <div
          className="relative mt-4 max-w-sm"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setRoleMenuOpen(false);
          }}
        >
          <label htmlFor="additional-role" className="text-xs text-faint">Add another job</label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="additional-role"
              value={newTitle}
              onChange={(event) => {
                setNewTitle(event.target.value);
                setRoleMenuOpen(true);
              }}
              onFocus={() => setRoleMenuOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTitle(roleMenuOpen && customMatches[activeMatchIndex] ? customMatches[activeMatchIndex] : newTitle);
                }
                if (event.key === "Escape") setRoleMenuOpen(false);
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setRoleMenuOpen(true);
                  setActiveMatchIndex((current) => Math.min(current + 1, Math.max(0, customMatches.length - 1)));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveMatchIndex((current) => Math.max(0, current - 1));
                }
              }}
              placeholder="Type any job title"
              maxLength={80}
              role="combobox"
              aria-expanded={roleMenuOpen}
              aria-controls="additional-role-options"
              aria-activedescendant={roleMenuOpen && customMatches[activeMatchIndex] ? `additional-role-option-${activeMatchIndex}` : undefined}
              autoComplete="off"
              className="min-h-[44px] min-w-0 flex-1 rounded-inner border border-border bg-white px-4 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
            />
            <button
              type="button"
              onClick={() => addTitle(newTitle)}
              disabled={!newTitle.trim()}
              className="min-h-[44px] rounded-inner border border-border px-4 text-sm text-ink hover:border-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {roleMenuOpen && customMatches.length > 0 && (
            <ul
              id="additional-role-options"
              role="listbox"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-inner border border-border bg-white py-1 shadow-overlay"
            >
              {customMatches.map((title, index) => (
                <li
                  key={title}
                  id={`additional-role-option-${index}`}
                  role="option"
                  aria-selected={index === activeMatchIndex}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    addTitle(title);
                  }}
                  className={`cursor-pointer px-4 py-2 text-sm hover:text-ink ${index === activeMatchIndex ? "bg-surface-alt text-ink" : "text-muted hover:bg-surface-alt"}`}
                >
                  {title}
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedTitles.some((title) => !guess.roles.includes(title)) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedTitles.filter((title) => !guess.roles.includes(title)).map((title) => (
              <Chip key={title} label={title} on onClick={() => toggleTitle(title)} />
            ))}
          </div>
        )}
      </div>

      <div className="mb-8">
        <p className="text-sm text-ink">Type</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {ROLE_TYPES.map((r) => {
            const slug = r.slug as RoleType;
            const on = roleTypes.includes(slug);
            return (
              <Chip
                key={r.slug}
                label={r.label}
                on={on}
                derived={slug === guess.roleType}
                onClick={() => setRoleTypes(on ? [] : [slug])}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={() => void save()} disabled={busy || selectedTitles.length === 0 || roleTypes.length === 0}>
          {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Continue"}
        </PrimaryButton>
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

/* ------------------------------------------------------------------ 01 RÉSUMÉ */

export function ResumeStep({ onDone, onLater }: { onDone: () => void; onLater: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Measured, not decorated. See the receipt comment below. */
  const [parseSeconds, setParseSeconds] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(f: File) {
    if (busy) return;
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    const isDocx =
      f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      f.name.toLowerCase().endsWith(".docx");
    if (!isPdf && !isDocx) {
      setError("Use a PDF or DOCX file.");
      return;
    }
    setError(null);
    setFile(f);
    setBusy(true);
    const startedAt = Date.now();
    try {
      const result = await uploadResume(f);
      setParseSeconds((Date.now() - startedAt) / 1000);
      setParsed(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that resume.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  /* The receipt (DESIGN.md signature motif #1): speed shown as a fact, never claimed.
   *
   * The timestamp column used to be the literals "00:00", "00:02", "00:03", "00:04" while the
   * comment here claimed they were a real measurement. They were not: they were the same eight
   * strings for every student, on the one component whose entire job is to be a receipt. A brand
   * that stakes itself on not claiming speed cannot fake the number that proves it.
   *
   * So there is now one time, and it is measured: how long this student's parse actually took.
   * Per-row timings would need per-row instrumentation the API does not expose, and inventing
   * them again is exactly the thing being fixed. */
  const rows = useMemo(() => {
    if (!parsed || !file) return [];
    const kb = Math.max(1, Math.round(file.size / 1024));
    const exp = parsed.experience?.length ?? 0;
    const proj = parsed.projects?.length ?? 0;
    const banked = parsed.bank_total ?? parsed.bank_seeded ?? 0;
    const elapsed = parseSeconds === null ? "" : `${parseSeconds.toFixed(1)}s`;
    return [
      { k: "Received", v: `${file.name} · ${kb} KB` },
      { k: "Name", v: parsed.full_name || "not found" },
      { k: "School", v: parsed.school || "not found" },
      { k: "Graduation", v: parsed.grad_year ? String(parsed.grad_year) : "not found" },
      { k: "Experience", v: `${exp} ${exp === 1 ? "entry" : "entries"}` },
      { k: "Projects", v: `${proj} ${proj === 1 ? "entry" : "entries"}` },
      { k: "Skills", v: `${parsed.skills?.length ?? 0} tagged` },
      { t: elapsed, k: "Ready in", v: `${banked} ${banked === 1 ? "entry" : "entries"} banked`, done: true },
    ];
  }, [parsed, file, parseSeconds]);

  if (parsed) {
    const distinctRoles = new Set(
      (parsed.target_roles ?? []).map((role) => role.trim().toLowerCase()).filter(Boolean),
    ).size;
    // Mirror the server's has_resume gate. Advancing on a partial parse only returns the student
    // to this same screen, which looks like a dead button rather than a validation failure.
    const ready = !!parsed.full_name?.trim() && distinctRoles >= 5 && (parsed.bank_total ?? parsed.bank_seeded ?? 0) > 0;
    return (
      <StartShell
        step="resume"
        title="Here's what we read."
      >
        <Receipt rows={rows} />
        {!ready && (
          <p className="mt-4 rounded-inner bg-warn-soft px-4 py-3 text-[13px] leading-6 text-warn">
            We couldn&apos;t read enough from that file. Try another PDF or DOCX.
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          {ready && <PrimaryButton onClick={onDone}>See my matches</PrimaryButton>}
          <button
            type="button"
            onClick={() => {
              setParsed(null);
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="px-1 py-2.5 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Upload a different file
          </button>
        </div>
      </StartShell>
    );
  }

  return (
    <StartShell
      step="resume"
      title="Tell us what you want."
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div
        role="button"
        tabIndex={0}
        aria-busy={busy}
        aria-disabled={busy}
        onClick={() => {
          if (busy) return;
          if (inputRef.current) inputRef.current.value = "";
          inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (busy) return;
            if (inputRef.current) inputRef.current.value = "";
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (busy) return;
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
        className={`flex min-h-28 w-full min-w-0 cursor-pointer items-center justify-between gap-5 rounded-inner border border-dashed border-border bg-surface-alt px-5 py-5 text-left transition-colors hover:border-brand sm:px-6 ${
          busy ? "pointer-events-none" : ""
        }`}
      >
        {busy ? (
          <>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <ThinkingOrb state="composing" size={20} />
            </div>
            <p className="min-w-0 truncate font-mono text-xs text-muted">
              Reading {file?.name}
            </p>
          </>
        ) : (
          <>
            {/* Label removed 2026-07-28: the button below it said "Choose a
                file" and the step title says "Start with your resume." */}
            <p className="shrink-0 text-right font-mono text-xs text-muted">
              PDF or DOCX<br />10 MB max
            </p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />

      <p className="mt-6 max-w-[46ch] text-sm leading-6 text-muted">
        Used only for your applications. Never sold.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <PrimaryButton onClick={() => {
          if (inputRef.current) inputRef.current.value = "";
          inputRef.current?.click();
        }} disabled={busy}>
          {busy ? <PendingLabel onColor>Reading...</PendingLabel> : "Choose a file"}
        </PrimaryButton>
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

/* ------------------------------------------------------ 02 INSTALL + 03 APPLY */

/** One backend step ("install" until an autofill_event proves the extension exists), two phases
 *  here: the web app has no way to see the extension, so the click is the only signal we get. */
export function InstallStep({
  phase,
  onInstalled,
  onLater,
  targetingFallback,
  allowSavedTargeting = true,
}: {
  phase: "install" | "apply";
  onInstalled: () => void;
  onLater: () => void;
  targetingFallback?: Pick<Targeting, "titles" | "role_types"> | null;
  allowSavedTargeting?: boolean;
}) {
  const [feed, setFeed] = useState<OnboardingJob[] | null>(null);
  const [savedTargeting, setSavedTargeting] = useState<Pick<Targeting, "titles" | "role_types"> | null>(null);
  const jobs = useMemo(
    () => feed === null ? null : rankOnboardingJobs(feed, savedTargeting ?? targetingFallback, 3),
    [feed, savedTargeting, targetingFallback],
  );

  useEffect(() => {
    if (phase !== "apply") return;
    let cancelled = false;
    // The same live feed /try uses: real postings, real apply URLs, refreshed daily.
    fetch("/try-jobs.json")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const feed = (d.jobs ?? []) as OnboardingJob[];
        // Render useful resume-ranked choices immediately. The saved targeting request can be
        // slow or unavailable in QA, and it should refine the list rather than hold it hostage.
        setFeed(feed);
        if (!allowSavedTargeting || !getToken()) return;
        void getTargeting()
          .then((targeting) => {
            if (!cancelled) setSavedTargeting(targeting);
          })
          .catch(() => undefined);
      })
      .catch(() => {
        if (!cancelled) setFeed([]);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, allowSavedTargeting]);

  if (phase === "install") {
    return (
      <StartShell
        step="install"
        title="Add Litos to Chrome."
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* Opening the store is not installing. This used to advance the flow from its own
              onClick, so closing the store tab straight away still moved you to step 04. */}
          <a
            href={STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add to Chrome
          </a>
          {/* The only way past this screen for anyone who already has the extension, or who
              applies on a portal Litos cannot see. It was 11px uppercase faint text below the
              button row: the least visible thing on the screen, doing the most important job on
              it. It is a real secondary control now, beside the primary. */}
          <button
            type="button"
            onClick={onInstalled}
            className="flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            I have added it
          </button>
        </div>
        <div className="mt-3"><LaterLink onClick={onLater} /></div>
      </StartShell>
    );
  }

  return (
    <StartShell
      step="apply"
      title="Apply to one job."
    >
      <p className="mb-5 text-sm leading-6 text-muted">
        Fill this one out yourself. Litos learns the answers for next time.
      </p>
      <div className="overflow-hidden rounded-inner border border-border">
        <div className="flex items-center justify-between border-b border-border bg-surface-alt px-4 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            Live postings
          </span>
          <span className="font-mono text-[11px] text-faint">Refreshed daily</span>
        </div>
        {jobs === null ? (
          <div className="space-y-2 p-4">
            <div className="rq-shimmer h-10 rounded-inner" />
            <div className="rq-shimmer h-10 rounded-inner" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-muted">
            The feed is empty right now. Open any posting on Lever, Greenhouse, Ashby, Workday, or
            LinkedIn and Litos will pick it up the same way.
          </p>
        ) : (
          jobs.map((j) => (
            <a
              key={j.id}
              href={j.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 transition-colors first:border-t-0 hover:bg-surface-alt"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{j.title}</span>
                <span className="block truncate text-xs text-muted">
                  {j.company} · {j.location}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-faint">
                Open
              </span>
            </a>
          ))
        )}
      </div>

      <p className="mt-4 text-[13px] leading-6 text-muted">Already have a job open? Use that instead.</p>
      <div className="mt-4">
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

/* -------------------------------------------------------------------- 04 GAPS */

const GAP_LABEL: Record<string, { label: string; note?: string; placeholder: string }> = {
  gpa: { label: "GPA", placeholder: "3.89" },
  gpa_scale: { label: "Out of", placeholder: "4.0" },
  major: { label: "Major", placeholder: "Computer Science" },
  desired_salary: { label: "Desired salary", note: "Optional. Left blank on every form unless you set it.", placeholder: "Leave blank" },
  desired_salary_currency: { label: "Currency", placeholder: "EUR" },
  languages: { label: "Which languages are you fluent in?", placeholder: "English, Hindi, Spanish" },
};

export function GapsStep({
  gaps,
  onDone,
  onLater,
}: {
  gaps: string[];
  /** `skipped` distinguishes "I don't have a GPA handy" from "saved" - both advance, but only one
   *  is a signal that the question is wrong for this student. */
  onDone: (skipped: boolean) => void;
  onLater: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showGpa = gaps.includes("gpa") || gaps.includes("gpa_scale");
  const showSalary = gaps.includes("desired_salary") || gaps.includes("desired_salary_currency");
  async function save() {
    setBusy(true);
    setError(null);
    const body: Partial<ApplicationProfile> = {};
    for (const [k, v] of Object.entries(values)) {
      if (!v.trim()) continue;
      if (k === "languages") {
        // The backend stores languages as a jsonb array of names, not a string.
        body.languages = v.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        (body as Record<string, string>)[k] = v.trim();
      }
    }
    const hasGpa = !!body.gpa;
    const hasGpaScale = !!body.gpa_scale;
    if (hasGpa !== hasGpaScale) {
      setError("Enter both your GPA and what it is out of.");
      setBusy(false);
      return;
    }
    const hasSalary = !!body.desired_salary;
    const hasCurrency = !!body.desired_salary_currency;
    if (hasSalary !== hasCurrency) {
      setError("Enter both a salary and its currency, or leave both blank.");
      setBusy(false);
      return;
    }
    try {
      if (Object.keys(body).length > 0) await putApplicationProfile(body);
      onDone(Object.keys(body).length === 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  /* Every visible label is tied to its first input by id. The remaining fields have concise
     accessible names so paired values such as GPA and scale stay distinct to screen readers. */
  function field(key: string) {
    const meta = GAP_LABEL[key];
    return (
      <input
        key={key}
        id={`gap-${key}`}
        value={values[key] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        placeholder={meta.placeholder}
        aria-label={meta.label}
        className="min-h-11 w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
      />
    );
  }

  return (
    <StartShell
      step="gaps"
      title="A few details."
      /* "This is the last of the boring part." came off 2026-07-28: the flow
         narrating its own tedium, which does not make it shorter. */
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {showGpa && (
        <div className="mb-5">
          <label htmlFor="gap-gpa" className="text-[13px] text-ink">GPA</label>
          {/* R-005: store the value AND the scale, then convert through a disclosed mapping.
              A bare 3.89 tells a UK form nothing, and guessing 97% would be a lie. */}
          <div className="mt-2 grid grid-cols-2 gap-3">
            {field("gpa")}
            {field("gpa_scale")}
          </div>
        </div>
      )}

      {gaps.includes("major") && (
        <div className="mb-5">
          <label htmlFor="gap-major" className="text-[13px] text-ink">Major</label>
          <div className="mt-2">{field("major")}</div>
        </div>
      )}

      {gaps.includes("languages") && (
        <div className="mb-5">
          <label htmlFor="gap-languages" className="text-[13px] text-ink">Which languages are you fluent in?</label>
          <div className="mt-2">{field("languages")}</div>
        </div>
      )}

      {showSalary && (
        <div className="mb-5">
          <label htmlFor="gap-desired_salary" className="text-[13px] text-ink">Desired salary</label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {field("desired_salary")}
            {field("desired_salary_currency")}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <PrimaryButton onClick={() => void save()} disabled={busy}>
          {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Continue"}
        </PrimaryButton>
        <SkipLink onClick={() => onDone(true)} what="these" />
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

/* ------------------------------------------------------------------ 05 TARGET */

/* Job titles and type are chosen immediately after the resume. This final targeting screen only
 * asks for timing, which still depends on the graduation year read from that resume. */
export function TargetStep({
  gradYear,
  onDone,
  onLater,
}: {
  gradYear: number;
  onDone: () => void;
  onLater: () => void;
}) {
  const periods = useMemo(() => periodsFor(gradYear), [gradYear]);
  const [primary, setPrimary] = useState<string | null>(() => defaultPrimary(gradYear));
  const [backup, setBackup] = useState<string | null>(() => defaultBackup(gradYear));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    // Partial by omission: roles, categories and type were saved after the upload and must not be
    // clobbered here.
    const body: Partial<Targeting> = {
      primary_period: primary,
      backup_period: backup === primary ? null : backup,
    };
    try {
      await putTargeting(body);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  function choosePrimary(value: string) {
    setPrimary(value);
    setBackup((current) => {
      if (current !== value) return current;
      return periods.find((period) => period.slug !== value)?.slug ?? null;
    });
  }

  return (
    <StartShell
      step="targeting"
      title="When do you want to start?"
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="mb-7">
        <p className="text-sm text-ink">First choice</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {periods.map((p) => (
            <Chip
              key={p.slug}
              label={p.label}
              on={primary === p.slug}
              onClick={() => choosePrimary(p.slug)}
            />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <p className="text-sm text-ink">Backup</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {periods
            .filter((p) => p.slug !== primary)
            .map((p) => (
              <Chip
                key={p.slug}
                label={p.label}
                on={backup === p.slug}
                onClick={() => setBackup(backup === p.slug ? null : p.slug)}
              />
            ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={() => void save()} disabled={busy || !primary}>
          {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Continue"}
        </PrimaryButton>
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

/* -------------------------------------------------------------------- 06 DONE */

export function DoneStep({
  onFinish,
  verificationEnabled,
}: {
  onFinish: (settings: { automatic_submission_enabled?: boolean; automatic_verification_enabled: boolean }) => Promise<void>;
  verificationEnabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <StartShell
      step="done"
      title="Your job matches are ready."
    >
      <div>
        <PrimaryButton
          onClick={() => {
            setBusy(true);
            void onFinish({
              automatic_verification_enabled: verificationEnabled,
            }).finally(() => setBusy(false));
          }}
          disabled={busy}
        >
          {busy ? <PendingLabel state="shaping" onColor>Saving...</PendingLabel> : "See my jobs"}
        </PrimaryButton>
      </div>
    </StartShell>
  );
}
