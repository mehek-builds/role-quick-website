"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApplicationProfile,
  OnboardingState,
  OnboardingStep,
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
import { TEST_TYPE_LABELS, TEST_TYPE_OPTIONS, TEST_TYPE_UNANSWERED_LABEL, chooseTestType } from "@/features/onboarding";
import {
  ROLE_TYPES,
  defaultBackup,
  defaultPrimary,
  periodsFor,
} from "@/lib/periods";
import { Chip, LaterLink, PrimaryButton, Receipt, SkipLink, STEPS, StartShell, flowSteps } from "./ui";
import { Highlights, WelcomeNote } from "./Welcome";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { ThinkingOrb } from "thinking-orbs";
import { JOB_TITLES } from "@/lib/job-titles";
import { focusPatch, focusSeed, inferResumeTargeting, type SavedFocus } from "@/lib/onboarding-role-inference";
import { rankOnboardingJobs, type OnboardingJob } from "@/lib/onboarding-jobs";

/* ------------------------------------------------------------------- 00 FOCUS */

/* This screen is reachable long after setup: the step is derived, and `hasFocusTargeting` wants a
 * non-empty titles array, so an account whose targeting predates that field lands here on every
 * visit to /start with a complete profile and a history of sent applications behind it.
 *
 * So saved targeting has to be READ before anything is drawn. Seeding from the resume inference
 * and committing it was one click of silent data loss on the record that aims every
 * recommendation (see lib/onboarding-role-inference.ts for the rule and why categories merge). Loading it
 * first is also why a failed read shows a retry instead of falling through to the guess: a PUT
 * built without knowing what is stored is the same overwrite by another route. */
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
  /* undefined while the read is in flight. null means there is genuinely nothing stored, which is
     the normal state for a new account: /profile/targeting answers 200-with-nulls, never 404. */
  const [saved, setSaved] = useState<SavedFocus | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    /* No token is the localhost QA bypass (?qa=1&step=focus), not a failure: nothing is stored for
       a signed-out reviewer, so the guess is the whole truth and there is nothing to lose. It
       resolves through the same promise rather than an early setSaved so the effect body never
       sets state synchronously. */
    (getToken() ? getTargeting() : Promise.resolve<SavedFocus>(null))
      .then((targeting) => {
        if (!cancelled) setSaved(targeting);
      })
      .catch((reason) => {
        if (!cancelled) setLoadError(reason instanceof Error ? reason.message : "Could not load the jobs you want.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loadError) {
    return (
      <StartShell step="focus" title="Here's where we'd start.">
        <ErrorNote message={loadError} />
        <button
          type="button"
          onClick={() => {
            setLoadError(null);
            setAttempt((n) => n + 1);
          }}
          className="mt-4 text-sm text-brand-ink underline underline-offset-4"
        >
          Try loading again
        </button>
      </StartShell>
    );
  }

  if (saved === undefined) {
    return (
      <StartShell step="focus" title="Here's where we'd start.">
        <div className="rq-shimmer h-32 rounded-inner" />
      </StartShell>
    );
  }

  /* Keyed on the read so the form's lazy initial state is built from a settled `saved` rather than
     patched into place by an effect afterwards. There is no window where the student can click
     Continue against a pre-fill that has not seen their stored answer yet. */
  return (
    <FocusForm
      key={attempt}
      guess={guess}
      saved={saved}
      onDone={onDone}
      onLater={onLater}
    />
  );
}

function FocusForm({
  guess,
  saved,
  onDone,
  onLater,
}: {
  guess: ReturnType<typeof inferResumeTargeting>;
  saved: SavedFocus;
  onDone: () => void;
  onLater: () => void;
}) {
  const seed = useMemo(() => focusSeed(saved, guess), [saved, guess]);
  const [selectedTitles, setSelectedTitles] = useState<string[]>(() => seed.titles);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>(() => seed.roleTypes);
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
      /* Partial by omission, and additive on categories. This screen shows titles and one type; it
         must not be able to remove a category the student cannot see. See lib/onboarding-role-inference.ts. */
      await putTargeting(focusPatch(saved, { titles: selectedTitles, roleTypes }));
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
          <label htmlFor="additional-role" className="text-xs text-muted">Add another job</label>
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
              className="min-h-[44px] min-w-0 flex-1 rounded-inner border border-control-border bg-white px-4 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
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
      title="Start with your resume."
    >
{/* The welcome, then the ask, then the walkthrough. This screen used to open on the ask
          alone, under a title ("Tell us what you want.") that described the roles step rather than
          this one.

          The walkthrough sits BELOW the drop zone rather than above it, and that ordering was
          measured rather than guessed: at 375px the three rows are tall enough to push "Choose a
          file" off the screen, and a setup step whose one ask is below the fold is a worse trade
          than a walkthrough that needs a scroll. The welcome line is one sentence and stays on
          top, so a student still learns what this is before being asked for anything. */}
      <div className="mb-7"><WelcomeNote /></div>


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

      <div className="mt-6 flex items-center gap-3">
        <PrimaryButton onClick={() => {
          if (inputRef.current) inputRef.current.value = "";
          inputRef.current?.click();
        }} disabled={busy}>
          {busy ? <PendingLabel onColor>Reading...</PendingLabel> : "Choose a file"}
        </PrimaryButton>
        <LaterLink onClick={onLater} />
      </div>

      <div className="mt-9"><Highlights /></div>
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
            className="rounded-full bg-action px-5 py-2.5 text-sm font-medium text-action-ink transition-colors hover:bg-brand-ink"
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
          <span className="font-mono text-[11px] text-muted">Refreshed daily</span>
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
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
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
  referral_source_default: {
    label: "Default referral source",
    note: "Use a source you personally choose, such as LinkedIn or a university event. Litos detects job boards for each application.",
    placeholder: "LinkedIn or university career fair",
  },
  /* Measured across 158 packets: each of these blocked 8 applications that could not be finished
     without it. The note says plainly why Litos is asking, because a question about a test score
     reads as intrusive unless the reason is on the screen with it.

     A coursework question sat here on this branch and was removed before merge: it needs a column
     on the backend's `profiles` table, and that cannot ship in the same change as its migration.
     See the note in the backend's db/schema.ts. */
  standardized_test_type: {
    label: "Which standardized test did you take?",
    note: "Trading and quant firms ask for this by name. Answer \u201cI have not taken either\u201d and Litos says so on their form where it can; leave it blank and it leaves their field blank too.",
    placeholder: "SAT, ACT, both, or neither",
  },
  sat_score: { label: "SAT score", placeholder: "1520" },
  act_score: { label: "ACT score", placeholder: "34" },
};

/* The closed list and the reducer that clears scores when the test changes both live in
   features/onboarding/domain/test-scores.ts, so the state machine can be driven by a test rather
   than described by a regex. See that file for the contradiction it exists to prevent. */

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
  // One block for all three test fields: the scores are meaningless without the type, so they are
  // shown and hidden together rather than as three independent gaps.
  const showTests = gaps.includes("standardized_test_type")
    || gaps.includes("sat_score")
    || gaps.includes("act_score");
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
    /* A score without the test it belongs to is not an answer: the forms that ask for one ask which
       test first, and a stored 1520 with no declared type cannot tell an ACT field to stay empty.
       Same shape as the GPA and salary pairs above. */
    const hasScore = !!body.sat_score || !!body.act_score;
    if (hasScore && !body.standardized_test_type) {
      setError("Choose which test you took, or clear the score.");
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
        className="min-h-11 w-full rounded-full border border-control-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
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

      {showTests && (
        <div className="mb-5">
          <label htmlFor="gap-standardized_test_type" className="text-[13px] text-ink">
            {GAP_LABEL.standardized_test_type.label}
          </label>
          <div className="mt-2">
            <select
              id="gap-standardized_test_type"
              value={values.standardized_test_type ?? ""}
              onChange={(e) => setValues((v) => chooseTestType(v, e.target.value))}
              aria-label={GAP_LABEL.standardized_test_type.label}
              className="min-h-11 w-full rounded-full border border-control-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
            >
              {/* The empty option is the default and it means "not answered". Every question on this
                  screen is skippable, and a select with no blank choice would answer for her.
                  It is worded so it cannot be confused with "I have not taken either", which is a
                  DECLARATION and the only answer that lets Litos fill a test-score field at all.
                  See TEST_TYPE_LABELS: the stored values are the backend enum, the words are not. */}
              <option value="">{TEST_TYPE_UNANSWERED_LABEL}</option>
              {TEST_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{TEST_TYPE_LABELS[option]}</option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">{GAP_LABEL.standardized_test_type.note}</p>
          {/* The score inputs appear only once a test is named, so nobody is shown an SAT box they
              have no use for, and "None" collapses them again. */}
          {(values.standardized_test_type === "SAT" || values.standardized_test_type === "Both") && (
            <div className="mt-3">
              <label htmlFor="gap-sat_score" className="text-[13px] text-ink">{GAP_LABEL.sat_score.label}</label>
              <div className="mt-2">{field("sat_score")}</div>
            </div>
          )}
          {(values.standardized_test_type === "ACT" || values.standardized_test_type === "Both") && (
            <div className="mt-3">
              <label htmlFor="gap-act_score" className="text-[13px] text-ink">{GAP_LABEL.act_score.label}</label>
              <div className="mt-2">{field("act_score")}</div>
            </div>
          )}
        </div>
      )}

      {gaps.includes("referral_source_default") && (
        <div className="mb-5">
          <label htmlFor="gap-referral_source_default" className="text-[13px] text-ink">
            {GAP_LABEL.referral_source_default.label}
          </label>
          <div className="mt-2">{field("referral_source_default")}</div>
          <p className="mt-1 text-xs leading-5 text-muted">{GAP_LABEL.referral_source_default.note}</p>
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

/* Two jobs on one screen, and this screen used to do neither.
 *
 * It was a title ("Your job matches are ready.") and a button, which is a handoff without a
 * receipt: nothing confirmed that setup was over, and nothing said what the student was supposed
 * to do on the other side of the button. The last screen of a flow has to close the flow before it
 * opens the product.
 *
 * So: the confirmation is the Receipt motif, which is already the product's way of stating a
 * finished machine action as fact. Every row is read from the derived onboarding state rather than
 * assumed from having arrived here, because the fallback cases in app/start/page.tsx route removed
 * steps to this screen too, and a receipt that prints "Built" over an unbuilt resume is worse than
 * no receipt. Then the first action, named in words before it is offered as a button.
 *
 * No celebration, per the Guardrails: no confetti, no streak, no score. The receipt IS the
 * acknowledgement, in the same register the rest of the product uses when it finishes something.
 */

/* What each rail step reads as once it is behind you.
 *
 * Keyed by step, and the LABELS are deliberately absent: they come from STEPS, so the rail and the
 * receipt cannot drift into calling one screen two different things. It also means a step added to
 * the flow appears in this receipt on its own, as "Not recorded" until someone gives it a row,
 * which is visible rather than silently missing.
 *
 * `of` returns `boolean | undefined`, and the third case is the whole point of it. GET
 * /onboarding/state is an unchecked cast (`api<OnboardingState>(...)`, no zod, no defaults), so
 * every field the type calls non-optional is a compile-time fiction at runtime, and the legacy
 * steps app/start/page.tsx routes here during a rolling deploy are the payloads most likely to be
 * missing one. `undefined` means "this backend did not tell us", which is neither done nor
 * pending. A receipt is the last place to guess: printing "Answered" over a work-authorization
 * question nobody was asked would be a false statement about the student's own account, on the one
 * screen whose entire job is to state facts. */
type ReceiptRowSpec = { done: string; pending: string; of: (s: OnboardingState) => boolean | undefined };

/** A field the type promises but the wire may not deliver. Anything not a boolean is unknown. */
const flag = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

const RECEIPT: Partial<Record<OnboardingStep, ReceiptRowSpec>> = {
  resume: { done: "Read", pending: "Not read", of: (s) => flag(s.has_resume) },
  impact: { done: "Reviewed", pending: "Not reviewed", of: (s) => flag(s.has_impact_review) },
  focus: { done: "Saved", pending: "Not saved", of: (s) => flag(s.has_focus) },
  sponsorship: { done: "Answered", pending: "Not answered", of: (s) => flag(s.has_sponsorship_answer) },
  base: { done: "Built", pending: "Not built", of: (s) => flag(s.has_base_resume) },
  /* `gaps` is what is STILL outstanding, so an empty list is the finished state.
   *
   * The pending value states the FACT, not the motive. "Skipped" was wrong on three reachable
   * paths: a student who filled some fields and pressed Continue, one who left through "Finish
   * later", and one routed straight here from a legacy step who was never shown the screen at all.
   * None of them chose to skip anything, and the receipt cannot tell which happened. */
  gaps: {
    done: "None missing",
    pending: "Some outstanding",
    of: (s) => (Array.isArray(s.gaps) ? s.gaps.length === 0 : undefined),
  },
};

/** Printed when the backend did not say. Uniform across rows on purpose: the reason is always the
 *  same one, and a per-row phrasing would imply we know more about the gap than we do. */
const NOT_RECORDED = "Not recorded";

export function DoneStep({
  onFinish,
  verificationEnabled,
  state,
}: {
  onFinish: (settings: { automatic_submission_enabled?: boolean; automatic_verification_enabled: boolean }) => Promise<void>;
  verificationEnabled: boolean;
  state: OnboardingState;
}) {
  const [busy, setBusy] = useState(false);
  const rows = useMemo(
    () =>
      /* Every step in STEPS, minus the screen the student is standing on. Deliberately STEPS and
         NOT the rail's own `flowSteps`: the rail lists the screens this student was WALKED through,
         and the receipt reports the state of their account, which is a wider set. The details row
         is the difference. It is worth printing whether or not a screen ever asked for them,
         because "some outstanding" is a true and useful fact about the account either way.
         Numbering, on the other hand, has to come from the rail, which is what the block below
         does. */
      STEPS.filter((step) => step.key !== "done").map((step) => {
        const spec = RECEIPT[step.key];
        const value = spec?.of(state);
        /* Position in the RAIL, not in this list, and that distinction is the whole point of
           computing it here. The gutter used to be this row's own index, which lined up only while
           the rail counted all seven steps. Now that the conditional details screen is counted only
           when the flow routes to it, an index would print "06  A few details" directly under a
           rail reading "Step 6 of 6, Done" - two different sixes on one screen, one of them naming
           a screen the student never saw. A row the rail does not count gets no number rather than
           a wrong one; the gutter is a cross-reference, and a blank is honest where a digit is not. */
        const railIndex = flowSteps("done", state).findIndex((s) => s.key === step.key);
        return {
          /* The Receipt's first column is a mono gutter, and on this screen there is no timestamp
             to put in it: the steps happened over whatever span the student took, and inventing a
             duration is the exact thing the receipt motif exists NOT to do. Left empty it reads as
             a misalignment rather than as a gutter, so it carries the step number instead, in the
             two-digit form the rail already borrows from the homepage film's act labels. */
          t: railIndex >= 0 ? String(railIndex + 1).padStart(2, "0") : "",
          k: step.label,
          v: spec === undefined || value === undefined ? NOT_RECORDED : value ? spec.done : spec.pending,
          /* No `done` row, deliberately.
           *
           * Receipt renders `done` as a separator plus a brand-ink value, and it earns that on the
           * resume step because the last line there ("Ready in ... banked") SUMMARISES the rows
           * above it, categorically different from them. Here every row is the same kind of fact,
           * so marking the last one borrows an emphasis that means nothing. Blue is also the action
           * colour and never appears on anything that is not an action (DESIGN.md colour law), so
           * it must not land on a value like "Some outstanding". */
        };
      }),
    [state],
  );

  return (
    <StartShell
      step="done"
      title="Setup complete."
    >
{/* Absorbed from #286. The step changes inside the same page, with no route change and no
          focus move, so without a live region a screen reader gets no signal that setup finished
          at all. Deliberately terse and separate from the receipt: pushing six rows of mono text
          through a live region is noise, and the receipt is ordinary readable content once the
          reader arrives at it. */}
      <p role="status" className="sr-only">Setup complete.</p>

      <Receipt rows={rows} />

      {/* The first action, in words. The button label alone ("See my jobs") names a destination,
          not a thing to do, and the value of the product is one step past the destination. */}
      <p className="mt-7 text-[15px] leading-7 text-ink">
        Open a match on your dashboard and Litos builds the application for you to review.
      </p>

      <div className="mt-5">
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
