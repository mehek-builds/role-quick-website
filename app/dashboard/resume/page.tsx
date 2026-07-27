"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError, ExperienceEntry, getToken } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { litosClientHeaders } from "@/lib/product";
import { Card, Chip, PendingLabel, ShimmerRows, ErrorNote } from "@/components/app/ui";

type ParsedProfile = Record<string, unknown>;

export default function ResumeWorkspace() {
  const [profile, setProfile] = useState<ParsedProfile | null | "missing">(null);
  const [entries, setEntries] = useState<ExperienceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [profileRes, bankRes] = await Promise.all([
        api<ParsedProfile>("/profile").catch((err) =>
          err instanceof ApiError && err.status === 404 ? ("missing" as const) : null,
        ),
        api<{ entries: ExperienceEntry[] }>("/profile/experience-bank").catch(
          () => ({ entries: [] as ExperienceEntry[] }),
        ),
      ]);
      if (cancelled) return;
      setProfile(profileRes ?? "missing");
      setEntries(bankRes.entries);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      // The backend multipart handler only reads the part named "resume" (profile.ts);
      // "file" is silently ignored and the upload 400s.
      form.append("resume", file);
      const res = await fetch(`${API_URL}/profile`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, ...litosClientHeaders() },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Upload failed. Is it a PDF under 10 MB?");
      } else {
        setProfile(data as ParsedProfile);
        // Re-pull the bank: a fresh parse may have seeded new entries.
        const bank = await api<{ entries: ExperienceEntry[] }>(
          "/profile/experience-bank",
        ).catch(() => null);
        if (bank) setEntries(bank.entries);
      }
    } catch {
      setError("Network error during upload.");
    } finally {
      setUploading(false);
    }
  }

  async function saveBank() {
    if (!entries) return;
    setSaving(true);
    setError(null);
    try {
      const cleaned = entries
        .map((e) => ({
          ...(e.id ? { id: e.id } : {}),
          type: e.type,
          org: e.org.trim(),
          title: e.title?.trim() || undefined,
          date_range: e.date_range?.trim() || undefined,
          bullet_variants: e.bullet_variants.map((b) => b.trim()).filter(Boolean),
          tags: (e.tags ?? []).map((t) => t.trim()).filter(Boolean),
        }))
        .filter((e) => e.org && e.bullet_variants.length > 0);
      const res = await api<{ entries: ExperienceEntry[] }>(
        "/profile/experience-bank",
        { method: "PUT", body: JSON.stringify({ entries: cleaned }) },
      );
      setEntries(res.entries);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function patchEntry(i: number, patch: Partial<ExperienceEntry>) {
    setEntries((prev) =>
      prev ? prev.map((e, j) => (j === i ? { ...e, ...patch } : e)) : prev,
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[32px] font-normal leading-[1.15] tracking-[-0.02em] text-ink">Resume</h1>
        <p className="mt-1 text-sm text-muted">
          Your main resume and everything you have done. Every resume we make is built
          from what lives here, so the richer it is, the better the fit.
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      {/* Base resume */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-ink">Your main resume</h2>
            <p className="mt-1 text-sm text-muted">
              {profile === null
                ? <PendingLabel>Reading...</PendingLabel>
                : profile === "missing"
                  ? "No resume uploaded yet. Upload a PDF and we will fill in the rest from it."
                  : "Read and saved. Uploading a new PDF replaces it."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {profile !== null && profile !== "missing" && (
              <Chip label="Parsed" kind="ready" />
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {uploading
                ? <PendingLabel state="composing" onColor>Reading...</PendingLabel>
                : profile === "missing"
                  ? "Upload resume PDF"
                  : "Replace resume"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {profile !== null && profile !== "missing" && (
          <ProfilePreview profile={profile} onProfileChange={(next) => setProfile(next as ParsedProfile)} />
        )}
      </Card>

      {/* Experience bank */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-ink">Everything you have done</h2>
            <p className="mt-1 text-sm text-muted">
              Every role, project, and bullet variant. Tailoring picks the
              best-fit subset per posting.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && !saving && (
              <span className="text-xs text-positive">Saved</span>
            )}
            <button
              onClick={() =>
                setEntries((prev) => [
                  ...(prev ?? []),
                  { type: "job", org: "", title: "", date_range: "", bullet_variants: [""], tags: [] },
                ])
              }
              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink"
            >
              Add entry
            </button>
            <button
              onClick={saveBank}
              disabled={saving || entries === null}
              className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <PendingLabel onColor>Saving...</PendingLabel> : "Save changes"}
            </button>
          </div>
        </div>

        {entries === null ? (
          <ShimmerRows rows={3} />
        ) : entries.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            No entries yet. Upload a resume above and we will fill this in, or add
            entries by hand.
          </Card>
        ) : (
          <div className="space-y-4">
            {entries.map((entry, i) => (
              <Card key={entry.id ?? `new-${i}`} className="p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_140px_auto]">
                  <Field
                    label="Organization"
                    value={entry.org}
                    onChange={(v) => patchEntry(i, { org: v })}
                    placeholder="Acme Corp"
                  />
                  <Field
                    label="Title"
                    value={entry.title ?? ""}
                    onChange={(v) => patchEntry(i, { title: v })}
                    placeholder="Software Engineering Intern"
                  />
                  <Field
                    label="Dates"
                    value={entry.date_range ?? ""}
                    onChange={(v) => patchEntry(i, { date_range: v })}
                    placeholder="Jun 2025 - Aug 2025"
                  />
                  <div>
                    <label className="block text-xs font-medium text-muted">Type</label>
                    <select
                      value={entry.type}
                      onChange={(e) =>
                        patchEntry(i, { type: e.target.value as "job" | "project" })
                      }
                      className="mt-1.5 w-full rounded-full border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                    >
                      <option value="job">Job</option>
                      <option value="project">Project</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-medium text-muted">
                    Different ways to write this line (one per line)
                  </label>
                  <textarea
                    value={entry.bullet_variants.join("\n")}
                    onChange={(e) =>
                      patchEntry(i, { bullet_variants: e.target.value.split("\n") })
                    }
                    rows={Math.max(3, entry.bullet_variants.length)}
                    className="mt-1.5 w-full rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-sm leading-6 text-ink outline-none focus:border-brand"
                    placeholder="Shipped X that did Y, measured by Z"
                  />
                </div>

                <div className="mt-3 flex items-end justify-between gap-4">
                  <div className="flex-1">
                    <Field
                      label="Tags (comma-separated)"
                      value={(entry.tags ?? []).join(", ")}
                      onChange={(v) =>
                        patchEntry(i, { tags: v.split(",").map((t) => t.trim()) })
                      }
                      placeholder="python, data, leadership"
                    />
                  </div>
                  <button
                    onClick={() =>
                      setEntries((prev) => prev?.filter((_, j) => j !== i) ?? prev)
                    }
                    className="pb-1 text-xs text-muted hover:text-danger"
                  >
                    Remove entry
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
      />
    </div>
  );
}

/* The parse shape has evolved; show the common fields when present and keep
   the full parse inspectable rather than guessing at every key. */
function ProfilePreview({ profile, onProfileChange }: { profile: Record<string, unknown>; onProfileChange: (profile: Record<string, unknown>) => void }) {
  const str = (k: string) =>
    typeof profile[k] === "string" ? (profile[k] as string) : null;
  const list = (k: string) =>
    Array.isArray(profile[k])
      ? (profile[k] as unknown[]).filter((x) => typeof x === "string") as string[]
      : [];
  const name = str("full_name") ?? str("name");
  const skills = list("skills");
  const gradYear = profile["grad_year"];
  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {name && <KV label="Name" value={name} />}
        {str("email") && <KV label="Email" value={str("email")!} />}
        {str("phone") && <KV label="Phone" value={str("phone")!} />}
      </div>
      {/* R-052: school, degree and graduation date used to render as read-only truncated text, so a
          mis-parse could only be fixed by producing a new PDF, and the truncation meant the user
          could not even read the stored value to notice it was wrong. R-047 was exactly that: the
          parser dropped "Computer Science &" from a joint degree and there was no way to put it
          back. These three are the education block, so they are edited together. */}
      <EducationEditor
        school={str("school") ?? ""}
        degree={str("degree") ?? ""}
        gradDate={str("grad_date") ?? (typeof gradYear === "number" ? String(gradYear) : "")}
        onSaved={(patched) => onProfileChange({ ...profile, ...patched })}
      />
      {skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {skills.slice(0, 14).map((s) => (
            <span
              key={s}
              className="rounded-full bg-surface-alt px-2.5 py-0.5 font-mono text-[11px] text-muted"
            >
              {s}
            </span>
          ))}
        </div>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-faint hover:text-muted">
          View full parsed profile
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-[12px] bg-surface-alt p-4 font-mono text-[11px] leading-5 text-muted">
          {JSON.stringify(profile, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      {/* `truncate` hid the end of every long value, which is how a wrong stored degree stayed
          invisible. Wrap instead: these cards are read to check the value is right. */}
      <p className="mt-0.5 break-words text-sm text-ink">{value}</p>
    </div>
  );
}

function EducationEditor({ school, degree, gradDate, onSaved }: { school: string; degree: string; gradDate: string; onSaved: (patch: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ school, degree, grad_date: gradDate });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft({ school, degree, grad_date: gradDate });
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!draft.school.trim()) {
      setError("School cannot be empty. Autofill has no fallback for it.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api<Record<string, unknown>>("/profile/education", {
        method: "PATCH",
        body: JSON.stringify({ school: draft.school, degree: draft.degree, grad_date: draft.grad_date }),
      });
      onSaved(updated);
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your education.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {school && <KV label="School" value={school} />}
          <KV label="Degree" value={degree || "Not captured from your resume"} />
          {gradDate && <KV label="Graduation" value={gradDate} />}
        </div>
        <button type="button" onClick={startEditing} className="mt-3 text-xs text-brand-ink underline underline-offset-2">
          Correct education
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-[12px] border border-border bg-surface-alt p-4">
      <p className="text-xs text-muted">
        Every tailored resume prints this exactly as written here. Keep a joint degree whole, for example
        &quot;Bachelor of Science in Computer Science &amp; Business Administration, Finance Emphasis&quot;.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="School" value={draft.school} onChange={(school) => setDraft({ ...draft, school })} placeholder="University of Southern California" />
        <Field label="Degree" value={draft.degree} onChange={(degree) => setDraft({ ...draft, degree })} placeholder="Bachelor of Science in Computer Science" />
        <Field label="Graduation" value={draft.grad_date} onChange={(grad_date) => setDraft({ ...draft, grad_date })} placeholder="May 2028" />
      </div>
      {error && <p className="mt-2 text-xs text-warn">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={save} disabled={saving} className="rounded-full bg-brand px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
          {saving ? "Saving..." : "Save education"}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="rounded-full border border-border px-4 py-2 text-xs text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
