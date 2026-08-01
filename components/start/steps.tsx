"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApplicationProfile,
  OnboardingState,
  ParsedProfile,
  RoleType,
  Targeting,
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
import { Chip, FounderNote, LaterLink, PrimaryButton, Receipt, RefusalList, SkipLink, StartShell } from "./ui";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { ThinkingOrb } from "thinking-orbs";
import { JOB_TITLES } from "@/lib/job-titles";
import { categoriesForRoles, inferResumeTargeting } from "@/lib/onboarding-role-inference";

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
      sub="We used your experience and past titles to make a first guess. Change anything."
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="mb-7">
        <div className="flex min-h-5 items-baseline justify-between">
          <p className="text-sm text-ink">Jobs that fit</p>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
            {guess.yearsExperience > 0 ? `About ${guess.yearsExperience} years read` : "From your resume"}
          </span>
        </div>
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

        <div className="relative mt-4 max-w-sm">
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
        <p className="mt-0.5 text-xs text-faint">We picked the most likely one. Choose a different type if needed.</p>
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
    const seeded = parsed.bank_seeded ?? 0;
    const elapsed = parseSeconds === null ? "" : `${parseSeconds.toFixed(1)}s`;
    return [
      { k: "Received", v: `${file.name} · ${kb} KB` },
      { k: "Name", v: parsed.full_name || "not found" },
      { k: "School", v: parsed.school || "not found" },
      { k: "Graduation", v: parsed.grad_year ? String(parsed.grad_year) : "not found" },
      { k: "Experience", v: `${exp} ${exp === 1 ? "entry" : "entries"}` },
      { k: "Projects", v: `${proj} ${proj === 1 ? "entry" : "entries"}` },
      { k: "Skills", v: `${parsed.skills?.length ?? 0} tagged` },
      { t: elapsed, k: "Ready in", v: `${seeded} ${seeded === 1 ? "entry" : "entries"} banked`, done: true },
    ];
  }, [parsed, file, parseSeconds]);

  if (parsed) {
    // bank_seeded === 0 is the difference between an account that works and one that looks fine
    // and 400s at apply time. Say so here rather than letting it fail 12 minutes from now.
    const empty = (parsed.bank_seeded ?? 0) === 0;
    return (
      <StartShell
        step="resume"
        title="Here's what we read."
        sub="You won't type any of this again. Anything wrong, fix it in Settings later."
      >
        <Receipt rows={rows} />
        {empty && (
          <p className="mt-4 rounded-inner bg-warn-soft px-4 py-3 text-[13px] leading-6 text-warn">
            We couldn&apos;t pull any experience out of that file, so tailored resumes won&apos;t
            work yet. It usually means the PDF is an image rather than text. Try a different
            export, or carry on and add entries by hand later.
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          <PrimaryButton onClick={onDone}>See my matches</PrimaryButton>
          <button
            type="button"
            onClick={() => {
              setParsed(null);
              setFile(null);
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
      sub="Upload your resume. We'll read your experience and suggest the jobs that fit."
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
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
          if (f) void upload(f);
        }}
      />

      <p className="mt-6 max-w-[46ch] text-sm leading-6 text-muted">
        Used only for your applications. Never sold.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <PrimaryButton onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <PendingLabel onColor>Reading...</PendingLabel> : "Choose a file"}
        </PrimaryButton>
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

/* ------------------------------------------------------ 02 INSTALL + 03 APPLY */

type TryJob = { id: string; company: string; title: string; location: string; ats: string; applyUrl: string };

/** One backend step ("install" until an autofill_event proves the extension exists), two phases
 *  here: the web app has no way to see the extension, so the click is the only signal we get. */
export function InstallStep({
  phase,
  onInstalled,
  onLater,
}: {
  phase: "install" | "apply";
  onInstalled: () => void;
  onLater: () => void;
}) {
  const [jobs, setJobs] = useState<TryJob[] | null>(null);

  useEffect(() => {
    if (phase !== "apply") return;
    // The same live feed /try uses: real postings, real apply URLs, refreshed daily.
    fetch("/try-jobs.json")
      .then((r) => r.json())
      .then((d) => setJobs((d.jobs ?? []).slice(0, 6)))
      .catch(() => setJobs([]));
  }, [phase]);

  if (phase === "install") {
    return (
      <StartShell
        step="install"
        title="Add Litos to Chrome."
        sub="Litos does its work on the job posting itself. Add it to Chrome, then apply to one job as normal."
      >
        <div className="flex items-center gap-3">
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
          <LaterLink onClick={onLater} />
        </div>
      </StartShell>
    );
  }

  return (
    <StartShell
      step="apply"
      title="Now apply to one job. All the way through."
      sub="Fill every field yourself, this once. Litos watches and keeps what it learns, so the next one takes seconds."
      aside={<RefusalList />}
    >
      {/* The only screen in the flow that carries a voice, because it is the only one whose ask
          is genuinely hard to justify from the UI alone. */}
      <div className="mb-6">
        <FounderNote>
          I know it&apos;s backwards to ask you to fill one in by hand when the whole point is that
          Litos fills them. It&apos;s the only way it learns what these forms actually ask you,
          and I&apos;d rather learn it from a real one than guess. This is the last one you type.
        </FounderNote>
      </div>
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
                {j.ats}
              </span>
            </a>
          ))
        )}
      </div>

      <p className="mt-5 text-[13px] leading-6 text-muted">
        Or open any posting you already had open. We&apos;ll pick it up either way, and this page
        moves on by itself once your application lands.
      </p>
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
  const n = [showGpa, gaps.includes("major"), showSalary, gaps.includes("languages")].filter(Boolean).length;

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
    try {
      if (Object.keys(body).length > 0) await putApplicationProfile(body);
      onDone(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  /* Every visible label is tied to its input by id. These were bare <label> elements with no
     htmlFor and an aria-label on the input, so the label was announced twice and clicking it
     focused nothing. */
  function field(key: string) {
    const meta = GAP_LABEL[key];
    return (
      <input
        key={key}
        id={`gap-${key}`}
        value={values[key] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        placeholder={meta.placeholder}
        className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
      />
    );
  }

  return (
    <StartShell
      step="gaps"
      title={`${n === 1 ? "One question left" : n === 2 ? "Two questions left" : "A few questions left"} that job didn't ask.`}
      /* "This is the last of the boring part." came off 2026-07-28: the flow
         narrating its own tedium, which does not make it shorter. */
      sub="Most forms ask for these."
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {showGpa && (
        <div className="mb-5">
          <label htmlFor="gap-gpa" className="text-[13px] text-ink">GPA</label>
          {/* R-005: store the value AND the scale, then convert through a disclosed mapping.
              A bare 3.89 tells a UK form nothing, and guessing 97% would be a lie. */}
          <p className="mt-1 text-xs leading-5 text-faint">
            Stored the way you earned it. Some forms want a percentage instead, and we work that out
            and show you the mapping first.
          </p>
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
          <p className="mt-1 text-xs leading-5 text-faint">
            Separate them with commas. Forms that ask get exactly this list, nothing inferred.
          </p>
          <div className="mt-2">{field("languages")}</div>
        </div>
      )}

      {showSalary && (
        <div className="mb-5">
          <label htmlFor="gap-desired_salary" className="text-[13px] text-ink">Desired salary</label>
          <p className="mt-1 text-xs leading-5 text-faint">
            Optional, and left blank on every form unless you set it. We need the currency too, or
            the number means nothing on a posting priced somewhere else.
          </p>
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
      backup_period: backup,
    };
    try {
      await putTargeting(body);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  return (
    <StartShell
      step="targeting"
      title="When do you want to start?"
      sub="Pick your main hiring season and a backup."
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="mb-7">
        <p className="text-sm text-ink">When you want to start</p>
        <p className="mt-0.5 text-xs text-faint">
          {gradYear
            ? `You graduate in ${gradYear}, so this is the one that matters.`
            : "The season you are aiming at."}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {periods.map((p) => (
            <Chip
              key={p.slug}
              label={p.label}
              on={primary === p.slug}
              onClick={() => setPrimary(p.slug)}
            />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <p className="text-sm text-ink">If that does not work out</p>
        <p className="mt-0.5 text-xs text-faint">The next season you would take.</p>
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
  state,
  onFinish,
}: {
  state: OnboardingState;
  onFinish: (settings: { automatic_submission_enabled?: boolean; automatic_verification_enabled: boolean }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  // Not offered on this screen any more, and deliberately NOT carried through from state either:
  // finishing onboarding must never be the thing that turns unattended submission on. An existing
  // grant is untouched because the field is simply omitted from the patch below.
  const [automaticVerification, setAutomaticVerification] = useState(state.automatic_verification_enabled);
  return (
    <StartShell
      step="done"
      title="Setup complete."
      sub="One thing you can let Litos do on its own. It is off unless you turn it on."
    >
      <div className="divide-y divide-border border-y border-border">
        {/* The "send without asking me again" checkbox used to live here, and it was the single
            most dangerous control in the product sitting on the screen where the student has the
            least information: they have not yet watched Litos fill in one real form. The server
            now refuses to enable it until they have approved three submissions themselves, so
            offering it here would have been a checkbox that 403s the whole finish action. It
            appears in Settings once it is theirs to make. */}
        {/* Removed 2026-07-28. It described the auto-submit setting, which is
            deliberately NOT on this screen (see the note above), so it was the
            page explaining a control the reader cannot reach. Settings says it
            at the moment it becomes theirs to make. */}
        <label className="flex min-h-20 cursor-pointer items-start gap-3 py-4">
          <input type="checkbox" checked={automaticVerification} onChange={(event) => setAutomaticVerification(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand" />
          <span>
            <span className="block text-base text-ink">Read the code a company emails me</span>
            <span className="mt-1 block text-sm leading-6 text-muted">
              Only while an application is running, only that code, and it is never saved.
            </span>
          </span>
        </label>
      </div>

      {/* "both" was wrong, and had been since the auto-submit checkbox was
          pulled off this screen: one control is offered here, not two. */}
      <p className="mt-4 text-[13px] leading-5 text-muted">
        You can change this any time in Account. Litos never answers a CAPTCHA, the puzzle that checks you are human, and never answers anything you have to swear to.
      </p>

      <div className="mt-6">
        <PrimaryButton
          onClick={() => {
            setBusy(true);
            void onFinish({
              automatic_verification_enabled: automaticVerification,
            }).finally(() => setBusy(false));
          }}
          disabled={busy}
        >
          {busy ? <PendingLabel state="shaping" onColor>Saving...</PendingLabel> : "Go to dashboard"}
        </PrimaryButton>
      </div>
    </StartShell>
  );
}
