"use client";

import { Button } from "@/components/app/Button";
import { useEffect, useId, useRef, useState } from "react";
import { api, ApiError, ExperienceEntry, getTargeting, getToken } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { litosClientHeaders } from "@/lib/product";
import { Card, Chip, PendingLabel, ShimmerRows, ErrorNote } from "@/components/app/ui";
import { userFacingError } from "@/lib/user-facing-error";
import {
  courseworkLine,
  hasCompleteTargetRoleSet,
  parseEditableLines,
  parseEditableList,
  splitBankByCategory,
  targetRolesChanged,
} from "@/lib/profile-editor";

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
      const [profileRes, bankRes, targetingRes] = await Promise.all([
        api<ParsedProfile>("/profile").catch((err) =>
          err instanceof ApiError && err.status === 404 ? ("missing" as const) : null,
        ),
        api<{ entries: ExperienceEntry[] }>("/profile/experience-bank").catch(
          () => ({ entries: [] as ExperienceEntry[] }),
        ),
        getTargeting().catch(() => null),
      ]);
      if (cancelled) return;
      setProfile(
        profileRes && profileRes !== "missing" && targetingRes?.titles?.length
          ? { ...profileRes, target_roles: targetingRes.titles }
          : profileRes ?? "missing",
      );
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
        // Re-pull the bank and targeting. Existing targeting is authoritative and intentionally
        // survives a replacement PDF, so do not display the parser's fresh guesses over it.
        const [bank, targeting] = await Promise.all([
          api<{ entries: ExperienceEntry[] }>("/profile/experience-bank").catch(() => null),
          getTargeting().catch(() => null),
        ]);
        setProfile(
          targeting?.titles?.length
            ? { ...(data as ParsedProfile), target_roles: targeting.titles }
            : data as ParsedProfile,
        );
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
          /* This PUT replaces the whole bank, so omitting a field does not leave the stored value
             alone, it deletes it - which is how every parsed city was lost the first time. Now
             editable above, so an empty string here is the student clearing it on purpose. */
          location: e.location?.trim() || undefined,
          bullet_variants: e.bullet_variants.map((b) => b.trim()).filter(Boolean),
          tags: (e.tags ?? []).map((t) => t.trim()).filter(Boolean),
        }));
      /* The API requires an org and at least one bullet per entry, so incomplete rows cannot be
         sent. They used to be dropped here silently and the page still said "Saved", so a half
         filled entry disappeared and reported success. That was survivable while the only way in
         was one "Add entry" button; two Add buttons and two empty states inviting "add one by
         hand" make it the common case. Say what is wrong instead, and save nothing until it is
         fixed: a partial save would renumber the bank under the student mid-edit.
         A row with nothing typed in it at all is the student changing their mind after clicking
         Add, so it is dropped without complaint. */
      const started = cleaned.filter((e) => !(e.org && e.bullet_variants.length > 0))
        .filter((e) => e.org || e.bullet_variants.length > 0 || e.title || e.date_range);
      if (started.length > 0) {
        const named = started.find((e) => e.org)?.org;
        setError(
          started.length === 1
            ? `${named ? `"${named}"` : "One entry"} needs both an organization and at least one bullet before it can be saved.`
            : `${started.length} entries need both an organization and at least one bullet before they can be saved.`,
        );
        setSaving(false);
        return;
      }
      const complete = cleaned.filter((e) => e.org && e.bullet_variants.length > 0);
      const res = await api<{ entries: ExperienceEntry[] }>(
        "/profile/experience-bank",
        { method: "PUT", body: JSON.stringify({ entries: complete }) },
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

  function removeEntry(i: number) {
    setEntries((prev) => prev?.filter((_, j) => j !== i) ?? prev);
  }

  function addEntry(type: ExperienceEntry["type"]) {
    setEntries((prev) => [
      ...(prev ?? []),
      { type, org: "", title: "", date_range: "", location: "", bullet_variants: [""], tags: [] },
    ]);
  }

  /* One array in, two groups out, every entry still carrying the index it holds in the stored bank.
     Lives in lib/profile-editor so the index-preservation rule is covered by tests rather than
     asserted by a comment - saveBank PUTs the whole bank in one request, and a group-local index
     would write the wrong row as soon as the two categories interleave. */
  const { work: workEntries, leadership: leadershipEntries } = splitBankByCategory(entries ?? []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-section font-normal leading-[1.15] tracking-[-0.02em] text-ink">Resume</h1>
        {/* The second sentence explained the system to itself. A page called
            Resume, holding the resume, does not need to justify holding it. */}
        <p className="mt-1 text-sm text-muted">
          Your resume and work history.
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      {/* Base resume */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-ink">Your resume</h2>
            <p className="mt-1 text-sm text-muted">
              {profile === null
                ? <PendingLabel>Reading...</PendingLabel>
                : profile === "missing"
                  ? "No resume uploaded yet. Upload a PDF and we will fill in the rest from it."
                  : "Saved from your uploaded PDF."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {profile !== null && profile !== "missing" && (
              <Chip label="Ready" kind="ready" />
            )}
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading} >
              {uploading
                ? <PendingLabel state="composing" onColor>Reading...</PendingLabel>
                : profile === "missing"
                  ? "Upload resume PDF"
                  : "Replace resume"}
            </Button>
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

      {/* Everything you have done */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-ink">Work history</h2>
            {/* "We pick the ones that fit each job" is the same promise the
                whole product makes on every screen. The heading plus the
                first sentence is the whole idea. */}
            <p className="mt-1 text-sm text-muted">
              Saved work Litos can use for each job.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && !saving && (
              <span className="text-xs text-positive">Saved</span>
            )}
            <Button
              onClick={saveBank}
              disabled={saving || entries === null} >
              {saving ? <PendingLabel onColor>Saving...</PendingLabel> : "Save changes"}
            </Button>
          </div>
        </div>

        {entries === null ? (
          <ShimmerRows rows={3} />
        ) : (
          /* Two groups, one bank. The split is by the `type` the parser already assigns, so a
             resume that printed its clubs under a "Leadership" heading arrives sorted. One Save
             covers both because they are one array underneath. */
          <div className="space-y-8">
            <EntryGroup
              heading="Work experience"
              blurb="Jobs, internships and projects. This is the work history employers read."
              indexed={workEntries}
              emptyLabel="Nothing here yet. Upload a resume above and we will fill this in, or add an entry by hand."
              addLabel="Add work experience"
              onAdd={() => addEntry("job")}
              patchEntry={patchEntry}
              removeEntry={removeEntry}
            />
            <EntryGroup
              heading="Leadership and activities"
              blurb="Clubs, societies, volunteering and student government. Kept separate so a club role is never offered to an employer as a job."
              indexed={leadershipEntries}
              emptyLabel="Nothing here yet. Move an entry here with its Type, or add one by hand."
              addLabel="Add leadership role"
              onAdd={() => addEntry("leadership")}
              patchEntry={patchEntry}
              removeEntry={removeEntry}
            />
          </div>
        )}
      </section>
    </div>
  );
}

/* One category of the bank. Rendered from (entry, index) pairs so every edit still addresses the
   single underlying array - see indexedEntries above for why the groups are not their own state. */
function EntryGroup({
  heading,
  blurb,
  indexed,
  emptyLabel,
  addLabel,
  onAdd,
  patchEntry,
  removeEntry,
}: {
  heading: string;
  blurb: string;
  indexed: { entry: ExperienceEntry; index: number }[];
  emptyLabel: string;
  addLabel: string;
  onAdd: () => void;
  patchEntry: (i: number, patch: Partial<ExperienceEntry>) => void;
  removeEntry: (i: number) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">{heading}</h3>
          <p className="mt-0.5 text-xs text-muted">{blurb}</p>
        </div>
        <Button onClick={onAdd} variant="secondary">{addLabel}</Button>
      </div>
      {indexed.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">{emptyLabel}</Card>
      ) : (
        <div className="space-y-4">
          {indexed.map(({ entry, index }) => (
            <EntryCard
              key={entry.id ?? `new-${index}`}
              entry={entry}
              index={index}
              patchEntry={patchEntry}
              removeEntry={removeEntry}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  index,
  patchEntry,
  removeEntry,
}: {
  entry: ExperienceEntry;
  index: number;
  patchEntry: (i: number, patch: Partial<ExperienceEntry>) => void;
  removeEntry: (i: number) => void;
}) {
  return (
    <Card className="p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Organization"
          value={entry.org}
          onChange={(v) => patchEntry(index, { org: v })}
          placeholder="Acme Corp"
        />
        <Field
          label="Title"
          value={entry.title ?? ""}
          onChange={(v) => patchEntry(index, { title: v })}
          placeholder="Software Engineer"
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_160px]">
        <Field
          label="Dates"
          value={entry.date_range ?? ""}
          onChange={(v) => patchEntry(index, { date_range: v })}
          placeholder="Jun 2025 - Aug 2025"
        />
        {/* Was round-tripped but never shown, so a city the reader got wrong (or never found) could
            only be fixed by producing a new PDF - and it prints on the generated resume. */}
        <Field
          label="Location"
          value={entry.location ?? ""}
          onChange={(v) => patchEntry(index, { location: v })}
          placeholder="Los Angeles, CA"
        />
        <SelectField
          label="Type"
          value={entry.type}
          onChange={(v) => patchEntry(index, { type: v as ExperienceEntry["type"] })}
          options={[
            { value: "job", label: "Job" },
            { value: "project", label: "Project" },
            { value: "leadership", label: "Leadership" },
          ]}
        />
      </div>

      <LinesField
        className="mt-4"
        label="Resume bullets, one per line"
        value={entry.bullet_variants.join("\n")}
        onChange={(v) => patchEntry(index, { bullet_variants: v.split("\n") })}
        rows={Math.max(3, entry.bullet_variants.length)}
        placeholder="Shipped X that did Y, measured by Z"
      />

      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="flex-1">
          <Field
            label="Skills, separated by commas"
            value={(entry.tags ?? []).join(", ")}
            onChange={(v) => patchEntry(index, { tags: v.split(",").map((t) => t.trim()) })}
            placeholder="python, data, leadership"
          />
        </div>
        <button
          onClick={() => removeEntry(index)}
          className="pb-1 text-xs text-muted hover:text-danger"
        >
          Remove entry
        </button>
      </div>
    </Card>
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
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
      />
    </label>
  );
}

/* ISSUE-034. The Type select and the bullets textarea used to be written inline in the entry
   card, each with a <label> that was only a sibling: no htmlFor, no wrapping element, so nothing
   computed an accessible name and a reader announced six unnamed selects reading "Job / Project"
   and six unnamed multi-line boxes (WCAG 4.1.2 and 3.3.2). The four fields beside them went
   through Field, whose <label> wraps its input, so they were named correctly the whole time. That
   is exactly why it survived: the page looked and read consistently to a sighted user.

   Both controls now live in a helper that owns the label and the control together, so a field
   added to the entry card later cannot be born unnamed the way these two were. Association is by
   htmlFor/id off useId, matching the fix ISSUE-012 made in Settings: useId because the value has
   to agree between the server render and the client render, and htmlFor rather than aria-label
   because the visible text IS the name, so a copy edit cannot leave a reader on the old wording. */
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const fieldId = useId();
  return (
    <div>
      <label htmlFor={fieldId} className="block text-xs font-medium text-muted">{label}</label>
      <select
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-full border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

/* Distinct from TextAreaField below: that one is the parsed-profile editor's box, which always
   carries a hint line and resizes. This is the work-history bullets box, which does not. Keeping
   them separate is deliberate, since merging them would change how one of the two looks. */
function LinesField({
  className,
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  className?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder?: string;
}) {
  const fieldId = useId();
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="block text-xs font-medium text-muted">
        {label}
      </label>
      <textarea
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1.5 w-full rounded-inner border border-border bg-surface px-3.5 py-2.5 text-sm leading-6 text-ink outline-none focus:border-brand"
        placeholder={placeholder}
      />
    </div>
  );
}

/* The parse shape has evolved. The common profile facts are reviewable here, while structured work
   history stays in its purpose-built editor below. */
function ProfilePreview({ profile, onProfileChange }: { profile: Record<string, unknown>; onProfileChange: (profile: Record<string, unknown>) => void }) {
  const str = (k: string) =>
    typeof profile[k] === "string" ? (profile[k] as string) : null;
  const list = (k: string) =>
    Array.isArray(profile[k])
      ? (profile[k] as unknown[]).filter((x) => typeof x === "string") as string[]
      : [];
  const name = str("full_name") ?? str("name");
  const skills = list("skills");
  const languages = list("languages");
  const targetRoles = list("target_roles");
  const gradYear = profile["grad_year"];
  return (
    <div className="mt-6 border-t border-border pt-5">
      <ParsedProfileEditor
        name={name ?? ""}
        email={str("email") ?? ""}
        phone={str("phone") ?? ""}
        school={str("school") ?? ""}
        degree={str("degree") ?? ""}
        gradDate={str("grad_date") ?? (typeof gradYear === "number" ? String(gradYear) : "")}
        coursework={courseworkLine(profile["coursework"])}
        objective={str("objective") ?? ""}
        skills={skills}
        languages={languages}
        targetRoles={targetRoles}
        onSaved={onProfileChange}
      />
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-faint hover:text-muted">
          View full parsed profile
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-inner bg-surface-alt p-4 font-mono text-[11px] leading-5 text-muted">
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

type ParsedProfileDraft = {
  full_name: string;
  phone: string;
  school: string;
  degree: string;
  grad_date: string;
  coursework: string;
  objective: string;
  skills: string;
  languages: string;
  target_roles: string;
};

function ParsedProfileEditor({
  name,
  email,
  phone,
  school,
  degree,
  gradDate,
  coursework,
  objective,
  skills,
  languages,
  targetRoles,
  onSaved,
}: {
  name: string;
  email: string;
  phone: string;
  school: string;
  degree: string;
  gradDate: string;
  coursework: string;
  objective: string;
  skills: string[];
  languages: string[];
  targetRoles: string[];
  onSaved: (profile: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const initialDraft = (): ParsedProfileDraft => ({
    full_name: name,
    phone,
    school,
    degree,
    grad_date: gradDate,
    coursework,
    objective,
    skills: skills.join(", "),
    languages: languages.join(", "),
    target_roles: targetRoles.join("\n"),
  });
  const [draft, setDraft] = useState<ParsedProfileDraft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(initialDraft());
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!draft.full_name.trim()) {
      setError("Name cannot be empty. Autofill has no fallback for it.");
      return;
    }
    if (school && !draft.school.trim()) {
      setError("School cannot be empty. You can replace a parsed school, but not erase it.");
      return;
    }
    const roles = parseEditableLines(draft.target_roles);
    if (!hasCompleteTargetRoleSet(roles, targetRoles)) {
      setError("Keep five target roles so Litos has a complete search set.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rolesChanged = roles.length > 0 && targetRolesChanged(roles, targetRoles);
      const updated = await api<Record<string, unknown>>("/profile/parsed", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: draft.full_name,
          phone: draft.phone,
          ...(draft.school.trim() || school ? { school: draft.school } : {}),
          degree: draft.degree,
          grad_date: draft.grad_date,
          /* Sent ONLY when it changed, which makes this screen work against a backend that does not
             know the field yet. parsedProfilePatchSchema is .strict(), so an unknown key is a 400 on
             the whole save, not a partial one: shipping this page ahead of the matching backend
             would break every profile save rather than just the coursework part of one. Same shape
             as target_roles below, for the same reason. */
          ...(draft.coursework !== coursework ? { coursework: draft.coursework } : {}),
          objective: draft.objective,
          skills: parseEditableList(draft.skills),
          languages: parseEditableList(draft.languages),
          ...(rolesChanged ? { target_roles: roles } : {}),
        }),
      });
      // Targeting is stored separately from the parse and is authoritative. When this save did not
      // change roles, keep the titles already loaded from /profile/targeting instead of letting an
      // older parser guess in parsed_json flash back into the card until the next page load.
      onSaved({ ...updated, target_roles: rolesChanged ? roles : targetRoles });
      setEditing(false);
    } catch (reason) {
      setError(userFacingError(reason, "Could not save your profile changes."));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div>
        <div className="flex justify-end">
          <button type="button" onClick={startEditing} className="text-xs text-brand-ink underline underline-offset-2">
            Edit parsed details
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {name && <KV label="Name" value={name} />}
          {email && <KV label="Email" value={email} />}
          {phone && <KV label="Phone" value={phone} />}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {school && <KV label="School" value={school} />}
          <KV label="Degree" value={degree || "Not captured from your resume"} />
          {gradDate && <KV label="Graduation" value={gradDate} />}
        </div>
        {coursework && <div className="mt-4"><KV label="Relevant coursework" value={coursework} /></div>}
        {objective && <div className="mt-4"><KV label="Objective" value={objective} /></div>}
        {skills.length > 0 && <ProfileChips label="Skills" values={skills} />}
        {/* Shown as its own group rather than merged into Skills. The two lists are read for
            different reasons, and the parser used to run them together, which is how six spoken
            languages ended up leading the skills section of every generated resume. */}
        {languages.length > 0 && <ProfileChips label="Languages" values={languages} />}
        {targetRoles.length > 0 && <ProfileChips label="Target roles" values={targetRoles} />}
      </div>
    );
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="rounded-inner border border-border bg-surface-alt p-4">
      <div>
        <p className="text-sm font-medium text-ink">Review parsed details</p>
        <p className="mt-1 text-xs text-muted">Correct what the PDF reader got wrong. Your login email stays unchanged.</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" value={draft.full_name} onChange={(full_name) => setDraft({ ...draft, full_name })} placeholder="Your full name" />
        <Field label="Phone" value={draft.phone} onChange={(phone) => setDraft({ ...draft, phone })} placeholder="Optional" />
      </div>
      {email && <p className="mt-2 text-xs text-faint">Login email: {email}</p>}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="School" value={draft.school} onChange={(nextSchool) => setDraft({ ...draft, school: nextSchool })} placeholder="University of Southern California" />
        <Field label="Degree" value={draft.degree} onChange={(nextDegree) => setDraft({ ...draft, degree: nextDegree })} placeholder="Bachelor of Science in Computer Science" />
        <Field label="Graduation" value={draft.grad_date} onChange={(grad_date) => setDraft({ ...draft, grad_date })} placeholder="May 2028" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextAreaField label="Skills" value={draft.skills} onChange={(nextSkills) => setDraft({ ...draft, skills: nextSkills })} rows={4} hint="Separate skills with commas or new lines." />
        <TextAreaField label="Target roles" value={draft.target_roles} onChange={(target_roles) => setDraft({ ...draft, target_roles })} rows={4} hint="Keep five roles, one per line. Any real job title is valid." />
      </div>
      <div className="mt-4">
        <TextAreaField
          label="Languages"
          value={draft.languages}
          onChange={(nextLanguages) => setDraft({ ...draft, languages: nextLanguages })}
          rows={2}
          hint="Spoken languages your resume lists. Keep these out of Skills. To tell employers which ones you are fluent in, use Settings."
        />
      </div>
      <div className="mt-4">
        <TextAreaField
          label="Relevant coursework"
          value={draft.coursework}
          onChange={(nextCoursework) => setDraft({ ...draft, coursework: nextCoursework })}
          rows={2}
          hint="Course names, separated by commas. This prints on your generated resume."
        />
      </div>
      <div className="mt-4">
        <TextAreaField label="Objective or summary" value={draft.objective} onChange={(nextObjective) => setDraft({ ...draft, objective: nextObjective })} rows={3} hint="Optional. Keep this true to your experience." />
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-warn">{userFacingError(error)}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="rounded-full border border-border px-4 py-2 text-xs text-ink">Cancel</button>
      </div>
    </form>
  );
}

function TextAreaField({ label, value, onChange, rows, hint }: { label: string; value: string; onChange: (value: string) => void; rows: number; hint: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="mt-1.5 w-full resize-y rounded-inner border border-border bg-surface px-3.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand" />
      <span className="mt-1 block text-[11px] text-faint">{hint}</span>
    </label>
  );
}

function ProfileChips({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs text-faint">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => <span key={value} className="rounded-full bg-surface-alt px-2.5 py-0.5 font-mono text-[11px] text-muted">{value}</span>)}
      </div>
    </div>
  );
}
