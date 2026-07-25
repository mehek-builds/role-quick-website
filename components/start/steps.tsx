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
  CATEGORIES,
  MAX_CATEGORIES,
  MAX_ROLE_TYPES,
  ROLE_TYPES,
  defaultBackup,
  defaultPrimary,
  periodLabel,
  periodsFor,
} from "@/lib/periods";
import { Chip, FounderNote, LaterLink, PrimaryButton, Receipt, RefusalList, StartShell } from "./ui";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { ThinkingOrb } from "thinking-orbs";

/* ------------------------------------------------------------------- 00 FOCUS */

/* The two targeting questions that do NOT need the resume, moved in front of it.
 *
 * Walking Simplify (2026-07-17): they ask for your resume FOURTH. Two cheap questions come first,
 * neither of which they need beforehand, and the effect is that you have already said yes twice
 * before the expensive ask lands. /start used to open on the upload.
 *
 * The honest version of that is a reorder, not a manufactured yes. `titles` seed from the parsed
 * resume and the period options are computed from grad_year, so those three genuinely cannot be
 * asked yet. Category and type can: a student knows what work they want before they upload
 * anything. So they move here, where they cost one tap and buy the resume screen some goodwill.
 *
 * Both are capped (3 and 2). An uncapped multi-select lets someone tick everything and quietly
 * destroy their own matching, because "interested in everything" and "hasn't chosen" become the
 * same answer. The cap is stated up front and the chips visibly disable at the limit, rather than
 * letting them select a fourth and bounce off a 400.
 */
export function FocusStep({
  onDone,
  onLater,
  seed,
}: {
  onDone: () => void;
  onLater: () => void;
  /* calibration handoff from the homepage card; taps arrive pre-answered */
  seed?: { categories: string[]; roleTypes: RoleType[] } | null;
}) {
  const [categories, setCategories] = useState<string[]>(seed?.categories ?? []);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>(seed?.roleTypes ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catFull = categories.length >= MAX_CATEGORIES;
  const typeFull = roleTypes.length >= MAX_ROLE_TYPES;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await putTargeting({ categories, role_types: roleTypes });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  }

  return (
    <StartShell
      step="focus"
      title="What are you looking for?"
      sub="Two taps. It aims everything after this, and it's the last thing we ask before we do some work for you."
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {seed && (
        <p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          Calibrated from your homepage answers · adjust freely
        </p>
      )}

      <div className="mb-7">
        <div className="flex items-baseline justify-between">
          <p className="text-[14px] text-ink">Kind of work</p>
          <span className="font-mono text-[11px] text-faint">Up to {MAX_CATEGORIES}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = categories.includes(c.slug);
            return (
              <Chip
                key={c.slug}
                label={c.label}
                on={on}
                disabled={!on && catFull}
                // Functional update: reading `categories` from the closure loses updates when
                // two clicks land in the same tick, because both see the same stale array.
                onClick={() =>
                  setCategories((prev) =>
                    prev.includes(c.slug) ? prev.filter((x) => x !== c.slug) : [...prev, c.slug],
                  )
                }
              />
            );
          })}
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <p className="text-[14px] text-ink">Type</p>
          <span className="font-mono text-[11px] text-faint">Up to {MAX_ROLE_TYPES}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {ROLE_TYPES.map((r) => {
            const slug = r.slug as RoleType;
            const on = roleTypes.includes(slug);
            return (
              <Chip
                key={r.slug}
                label={r.label}
                on={on}
                disabled={!on && typeFull}
                onClick={() =>
                  setRoleTypes((prev) =>
                    prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug],
                  )
                }
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={() => void save()} disabled={busy || categories.length === 0}>
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
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(f: File) {
    if (f.type !== "application/pdf") {
      setError("That needs to be a PDF. It's the only format we can read reliably.");
      return;
    }
    setError(null);
    setFile(f);
    setBusy(true);
    try {
      setParsed(await uploadResume(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that résumé.");
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  // The receipt. Times are relative to the upload, so they are a real measurement of this
  // student's parse rather than decoration.
  const rows = useMemo(() => {
    if (!parsed || !file) return [];
    const kb = Math.max(1, Math.round(file.size / 1024));
    const exp = parsed.experience?.length ?? 0;
    const proj = parsed.projects?.length ?? 0;
    const seeded = parsed.bank_seeded ?? 0;
    return [
      { t: "00:00", k: "Received", v: `${file.name} · ${kb} KB` },
      { t: "00:02", k: "Name", v: parsed.full_name || "—" },
      { t: "00:02", k: "School", v: parsed.school || "—" },
      { t: "00:03", k: "Graduation", v: parsed.grad_year ? String(parsed.grad_year) : "not found" },
      { t: "00:03", k: "Experience", v: `${exp} ${exp === 1 ? "entry" : "entries"}` },
      { t: "00:04", k: "Projects", v: `${proj} ${proj === 1 ? "entry" : "entries"}` },
      { t: "00:04", k: "Skills", v: `${parsed.skills?.length ?? 0} tagged` },
      { t: "00:04", k: "Ready", v: `${seeded} ${seeded === 1 ? "entry" : "entries"} banked`, done: true },
    ];
  }, [parsed, file]);

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
          <p className="mt-4 rounded-[12px] bg-warn-soft px-4 py-3 text-[13px] leading-6 text-warn">
            We couldn&apos;t pull any experience out of that file, so tailored résumés won&apos;t
            work yet. It usually means the PDF is an image rather than text. Try a different
            export, or carry on and add entries by hand later.
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          <PrimaryButton onClick={onDone}>Looks right</PrimaryButton>
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
      title="Start with your résumé."
      sub="We read it once and pull out everything an application asks for. About ten seconds."
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
        className={`cursor-pointer rounded-[12px] border border-dashed border-border bg-surface-alt px-6 py-9 text-center transition-colors hover:border-brand ${
          busy ? "pointer-events-none" : ""
        }`}
      >
        {busy ? (
          <>
            <div className="mx-auto flex h-8 w-8 items-center justify-center">
              <ThinkingOrb state="composing" size={20} />
            </div>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
              Reading {file?.name}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-ink">Drop your résumé</p>
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
              PDF · 10 MB max
            </p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />

      <div className="mt-6 flex items-center gap-3">
        <LaterLink onClick={onLater} />
      </div>
      <p className="mt-6 text-[12px] leading-5 text-faint">
        Your résumé is used to write your own applications. It is never sold and never shown to
        anyone else.
      </p>
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
        title="Litos works on the job posting, not here."
        sub="This page is the record. The extension is what fills the form. Install it, then go apply to one job."
      >
        <div className="flex items-center gap-3">
          <a
            href={STORE_URL}
            target="_blank"
            rel="noreferrer"
            onClick={onInstalled}
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add to Chrome
          </a>
          <LaterLink onClick={onLater} />
        </div>
        <button
          type="button"
          onClick={onInstalled}
          className="mt-6 block font-mono text-[11px] uppercase tracking-[0.08em] text-faint underline-offset-4 hover:text-muted hover:underline"
        >
          Already installed →
        </button>
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
      <div className="overflow-hidden rounded-[12px] border border-border">
        <div className="flex items-center justify-between border-b border-border bg-surface-alt px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            Live postings
          </span>
          <span className="font-mono text-[10px] text-faint">Refreshed daily</span>
        </div>
        {jobs === null ? (
          <div className="space-y-2 p-4">
            <div className="rq-shimmer h-10 rounded-[8px]" />
            <div className="rq-shimmer h-10 rounded-[8px]" />
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
                <span className="block truncate text-[14px] text-ink">{j.title}</span>
                <span className="block truncate text-[12px] text-muted">
                  {j.company} · {j.location}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-faint">
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
  gpa: { label: "Grade average", placeholder: "3.89" },
  gpa_scale: { label: "Out of", placeholder: "4.0" },
  major: { label: "Major", placeholder: "Computer Science" },
  desired_salary: { label: "Desired salary", note: "Optional. Left blank on every form unless you set it.", placeholder: "—" },
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

  function field(key: string) {
    const meta = GAP_LABEL[key];
    return (
      <input
        key={key}
        value={values[key] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        placeholder={meta.placeholder}
        aria-label={meta.label}
        className="w-full rounded-full border border-border bg-surface px-4 py-2.5 font-mono text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
      />
    );
  }

  return (
    <StartShell
      step="gaps"
      title={`${n === 1 ? "One thing" : n === 2 ? "Two things" : "A few things"} that job didn't ask.`}
      sub="Most others will. This is the last of the boring part."
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {showGpa && (
        <div className="mb-5">
          <label className="text-[13px] text-ink">Grade average</label>
          {/* R-005: store the value AND the scale, then convert through a disclosed mapping.
              A bare 3.89 tells a UK form nothing, and guessing 97% would be a lie. */}
          <p className="mt-1 text-[12px] leading-5 text-faint">
            Stored as you earned it. When a form wants a percentage or a classification, we convert
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
          <label className="text-[13px] text-ink">Major</label>
          <div className="mt-2">{field("major")}</div>
        </div>
      )}

      {gaps.includes("languages") && (
        <div className="mb-5">
          <label className="text-[13px] text-ink">Which languages are you fluent in?</label>
          <p className="mt-1 text-[12px] leading-5 text-faint">
            Separate them with commas. Forms that ask get exactly this list, nothing inferred.
          </p>
          <div className="mt-2">{field("languages")}</div>
        </div>
      )}

      {showSalary && (
        <div className="mb-5">
          <label className="text-[13px] text-ink">Desired salary</label>
          <p className="mt-1 text-[12px] leading-5 text-faint">
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
          {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Save"}
        </PrimaryButton>
        <button
          type="button"
          onClick={() => onDone(true)}
          className="px-1 py-2.5 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Skip these
        </button>
        <LaterLink onClick={onLater} />
      </div>
    </StartShell>
  );
}

/* ------------------------------------------------------------------ 05 TARGET */

/* The three questions that NEEDED the resume, and could not have been asked at step 00:
 * titles are seeded from ParsedProfile.target_roles, and the period options are computed from
 * grad_year. Category and type were asked up front (see FocusStep). */
export function TargetStep({
  gradYear,
  suggestedTitles,
  onDone,
  onLater,
}: {
  gradYear: number;
  suggestedTitles: string[];
  onDone: () => void;
  onLater: () => void;
}) {
  const periods = useMemo(() => periodsFor(gradYear), [gradYear]);
  const [titles, setTitles] = useState<string[]>(suggestedTitles.slice(0, 6));
  const [primary, setPrimary] = useState<string | null>(() => defaultPrimary(gradYear));
  const [backup, setBackup] = useState<string | null>(() => defaultBackup(gradYear));
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Functional updater for the same reason as FocusStep: a stale closure loses rapid toggles.
  function toggle<T>(_list: T[], v: T, set: React.Dispatch<React.SetStateAction<T[]>>) {
    set((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    // Partial by omission: categories and role_types were saved at step 00 and must not be
    // clobbered with null here.
    const body: Partial<Targeting> = {
      titles: titles.length ? titles : null,
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
      title="Last thing."
      sub="Your résumé told us most of this. Correct anything that's wrong."
    >
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="mb-7">
        <p className="text-[14px] text-ink">Titles</p>
        {/* target_roles has been written by the parser since v0 and read by nothing. First use. */}
        <p className="mt-0.5 text-[12px] text-faint">
          {suggestedTitles.length > 0
            ? "Pulled from your résumé. Drop any that are wrong."
            : "Add the titles you'd actually accept."}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {titles.map((t) => (
            <Chip key={t} label={t} on derived onClick={() => toggle(titles, t, setTitles)} />
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                e.preventDefault();
                if (!titles.includes(newTitle.trim())) setTitles([...titles, newTitle.trim()]);
                setNewTitle("");
              }
            }}
            placeholder="Add a title"
            aria-label="Add a title"
            className="w-56 rounded-full border border-border bg-surface px-4 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
          />
        </div>
      </div>

      <div className="mb-7">
        <p className="text-[14px] text-ink">Main focus</p>
        <p className="mt-0.5 text-[12px] text-faint">
          {gradYear
            ? `You graduate in ${gradYear}, so this is the one that matters.`
            : "The term you're aiming at."}
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
        <p className="text-[14px] text-ink">Backup</p>
        <p className="mt-0.5 text-[12px] text-faint">If the main one doesn&apos;t land.</p>
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
          {busy ? <PendingLabel onColor>Saving...</PendingLabel> : "Done"}
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
  onFinish: (automaticVerificationEnabled: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [automaticVerification, setAutomaticVerification] = useState(state.automatic_verification_enabled);
  const learned = state.learned.length;

  // Three real states, because applying and learning are independent. Someone can skip the
  // application entirely (Finish later, then come back), and someone can fill one that taught us
  // nothing new. "0 things learned" is true in the second case and reads as a failure report;
  // "that was the last long one" is simply false in the first. Claiming a result they did not
  // get is the fastest way to lose them.
  const applied = state.has_applied;
  const title = applied ? "That was the last long one." : "You're set up.";
  const sub = !applied
    ? "Open any posting and Litos fills what it can from your résumé. It learns the rest from the first application you fill in."
    : learned > 0
      ? `${learned} ${learned === 1 ? "thing" : "things"} learned. Open any posting and the form is already filled by the time you get there.`
      : "Open any posting and the form is already filled by the time you get there.";

  return (
    <StartShell step="done" title={title} sub={sub}>
      {/* The payoff. The contrast is measured on their own application, not claimed in a
          headline - 14 minutes is real because they just lived it. No confetti, no badge:
          the Guardrails ban them, and the number is more persuasive anyway. */}
      {/* The payoff, and it is only earned if they actually filled one. Showing a
          "first one / every one after" contrast to someone who skipped the first one would be
          claiming a result they never got. */}
      {applied && (
        <div className="overflow-hidden rounded-[12px] border border-border">
          <div className="grid grid-cols-[100px_minmax(0,1fr)_84px] items-baseline gap-4 px-4 py-3.5">
            <span className="font-mono text-[10px] tracking-[0.06em] text-faint">FIRST ONE</span>
            <span className="text-[14px] text-ink">Filled by hand, start to finish</span>
            <span className="text-right font-mono text-[12.5px] text-muted">once</span>
          </div>
          <div className="grid grid-cols-[100px_minmax(0,1fr)_84px] items-baseline gap-4 border-t border-border bg-brand-soft px-4 py-3.5">
            <span className="font-mono text-[10px] tracking-[0.06em] text-brand-ink">
              EVERY ONE AFTER
            </span>
            <span className="text-[14px] text-brand-ink">Whatever you open next</span>
            <span className="text-right font-mono text-[12.5px] text-brand-ink">~9 s</span>
          </div>
        </div>
      )}

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[12px] border border-border bg-white px-4 py-4">
        <input
          type="checkbox"
          checked={automaticVerification}
          onChange={(event) => setAutomaticVerification(event.target.checked)}
          className="mt-1 size-4 accent-[#6b84e8]"
        />
        <span>
          <span className="block text-[14px] text-ink">Automatically use application verification codes</span>
          <span className="mt-1 block text-[12px] leading-5 text-muted">
            With your permission, Litos can use your connected Gmail or Outlook account to find verification codes related to an active application. Codes are used only for that application and are not saved.
          </span>
        </span>
      </label>

      <p className="mt-4 text-[12px] leading-5 text-faint">
        If a portal requires a CAPTCHA or an unsupported verification step, Litos pauses and opens the secure browser for you.
      </p>

      <div className="mt-6">
        <PrimaryButton
          onClick={() => {
            setBusy(true);
            onFinish(automaticVerification);
          }}
          disabled={busy}
        >
          {busy ? <PendingLabel state="shaping" onColor>Finishing...</PendingLabel> : "Go to dashboard"}
        </PrimaryButton>
      </div>
    </StartShell>
  );
}
