"use client";

import { Button } from "@/components/app/Button";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { api, ApiError, ExperienceEntry, getTargeting, getToken } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL, validateApplicationDocument } from "@/lib/document-size";
import { restoreFocusAfterRetry } from "@/lib/latest-request";
import { litosClientHeaders } from "@/lib/product";
import { Card, Chip, DataErrorState, PendingLabel, ShimmerRows, ErrorNote } from "@/components/app/ui";
import { userFacingError } from "@/lib/user-facing-error";
import {
  courseworkLine,
  hasCompleteTargetRoleSet,
  parseEditableLines,
  parseEditableList,
  splitBankByCategory,
  targetRolesChanged,
} from "@/lib/profile-editor";
import {
  useResumeMutationController,
  type ResumeMutationController,
  type ResumeParsedProfile,
  type ResumeParsedProfileDraft,
  type ResumeResource,
} from "./mutation-controller";

type ProfileLoadResult =
  | { kind: "missing" }
  | { kind: "ready"; profile: ResumeParsedProfile; targetingError: string | null };

export default function ResumeWorkspace() {
  const embedded = usePathname() === "/dashboard/documents";
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  /* True when the shown error refused selectedFile before any request: re-running the upload on
     that same File object can never end differently, so the affordance next to the error must
     offer a different file, not a retry. */
  const [selectedFileRejected, setSelectedFileRejected] = useState(false);
  const mutations = useResumeMutationController();
  const {
    bankLoadError,
    entries,
    entriesRevisionRef,
    error,
    parsedProfileEditing,
    parsedProfileSaving,
    pendingResources,
    profile,
    profileLoadError,
    profileRevisionRef,
    resourceRequests,
    savedAt,
    savedEntriesJson,
    saving,
    selectedFile,
    setBankLoadError,
    setEntries,
    setError,
    setParsedProfileSaving,
    setPendingResources,
    setProfile,
    setProfileLoadError,
    setSavedAt,
    setSavedEntriesJson,
    setSaving,
    setSelectedFile,
    setTargetingRefreshError,
    setUploading,
    targetingRefreshError,
    uploadedProfileRef,
    uploading,
  } = mutations;
  const shouldLoadProfileOnMount = useRef(
    profile === null && !pendingResources.profile && profileLoadError === null && !mutations.isActive(),
  );
  const shouldLoadBankOnMount = useRef(
    entries === null && !pendingResources.bank && bankLoadError === null && !mutations.isActive(),
  );

  const setResourcePending = useCallback((resource: ResumeResource, pending: boolean) => {
    setPendingResources((current) => ({ ...current, [resource]: pending }));
  }, [setPendingResources]);

  const loadProfile = useCallback((supersede = false) => {
    const requestRevision = profileRevisionRef.current;
    return resourceRequests.run<ProfileLoadResult>(
      "profile",
      async () => {
        const profileRes = await api<ResumeParsedProfile>("/profile").catch((reason) => {
          if (reason instanceof ApiError && reason.status === 404) return "missing" as const;
          throw reason;
        });
        if (profileRes === "missing") return { kind: "missing" };

        try {
          const targetingRes = await getTargeting();
          return {
            kind: "ready",
            profile: targetingRes.titles?.length
              ? { ...profileRes, target_roles: targetingRes.titles }
              : profileRes,
            targetingError: null,
          };
        } catch (reason) {
          const profileWithoutTargetRoles = { ...profileRes };
          delete profileWithoutTargetRoles.target_roles;
          return {
            kind: "ready",
            profile: profileWithoutTargetRoles,
            targetingError: userFacingError(reason, "Your resume loaded, but target roles could not load."),
          };
        }
      },
      {
        onStart: () => {
          setResourcePending("profile", true);
          setProfileLoadError(null);
          setTargetingRefreshError(null);
        },
        onSuccess: (result) => {
          if (profileRevisionRef.current !== requestRevision) return;
          profileRevisionRef.current += 1;
          if (result.kind === "missing") {
            setProfile("missing");
            setTargetingRefreshError(null);
            return;
          }
          setProfile(result.profile);
          setTargetingRefreshError(result.targetingError);
        },
        onError: (reason) => {
          if (profileRevisionRef.current !== requestRevision) return;
          setProfileLoadError(userFacingError(reason, "Your resume could not load."));
        },
        onSettled: () => setResourcePending("profile", false),
      },
      { supersede },
    );
  }, [profileRevisionRef, resourceRequests, setProfile, setProfileLoadError, setResourcePending, setTargetingRefreshError]);

  const loadBank = useCallback((
    failureMessage = "Your work history could not load.",
    supersede = false,
  ) => {
    const requestRevision = entriesRevisionRef.current;
    return resourceRequests.run(
      "bank",
      () => api<{ entries: ExperienceEntry[] }>("/profile/experience-bank"),
      {
        onStart: () => {
          setResourcePending("bank", true);
          setBankLoadError(null);
        },
        onSuccess: (bank) => {
          if (entriesRevisionRef.current !== requestRevision) return;
          entriesRevisionRef.current += 1;
          setEntries(bank.entries);
          setSavedEntriesJson(JSON.stringify(bank.entries));
        },
        onError: (reason) => setBankLoadError(userFacingError(reason, failureMessage)),
        onSettled: () => setResourcePending("bank", false),
      },
      { supersede },
    );
  }, [entriesRevisionRef, resourceRequests, setBankLoadError, setEntries, setResourcePending, setSavedEntriesJson]);

  const loadTargeting = useCallback((
    failureMessage: string,
    useUploadedFallback = false,
    supersede = false,
  ) => resourceRequests.run(
    "targeting",
    getTargeting,
    {
      onStart: () => {
        setResourcePending("targeting", true);
        setTargetingRefreshError(null);
      },
      onSuccess: (targeting) => {
        if (targeting.titles?.length) {
          profileRevisionRef.current += 1;
          setProfile((current) => {
            const base = current === null || current === "missing" ? uploadedProfileRef.current : current;
            return base ? { ...base, target_roles: targeting.titles } : current;
          });
        } else if (useUploadedFallback && uploadedProfileRef.current) {
          const inferredRoles = Array.isArray(uploadedProfileRef.current.target_roles)
            ? uploadedProfileRef.current.target_roles
            : [];
          if (inferredRoles.length > 0) {
            profileRevisionRef.current += 1;
            setProfile((current) => {
              const base = current === null || current === "missing" ? uploadedProfileRef.current : current;
              return base ? { ...base, target_roles: inferredRoles } : current;
            });
          }
        }
      },
      onError: (reason) => setTargetingRefreshError(userFacingError(reason, failureMessage)),
      onSettled: () => setResourcePending("targeting", false),
    },
    { supersede },
  ), [profileRevisionRef, resourceRequests, setProfile, setResourcePending, setTargetingRefreshError, uploadedProfileRef]);

  const refreshUploadedProfile = useCallback(async () => {
    await Promise.allSettled([
      loadBank("Your resume uploaded, but its refreshed work history could not load.", true),
      loadTargeting("Your resume uploaded, but target roles could not refresh.", true, true),
    ]);
  }, [loadBank, loadTargeting]);

  useEffect(() => {
    queueMicrotask(() => {
      const requests: Promise<unknown>[] = [];
      if (shouldLoadProfileOnMount.current) requests.push(loadProfile());
      if (shouldLoadBankOnMount.current) requests.push(loadBank());
      void Promise.allSettled(requests);
    });
  }, [loadBank, loadProfile]);

  function retryProfile() {
    void loadProfile();
    restoreFocusAfterRetry("resume-profile-heading");
  }

  function retryBank() {
    void loadBank();
    restoreFocusAfterRetry("resume-bank-heading");
  }

  function retryTargeting() {
    void loadTargeting("Target roles could not load.", true);
    restoreFocusAfterRetry("resume-profile-heading");
  }

  async function upload(file: File) {
    await mutations.run("upload", async () => {
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
          /* Size cannot be the cause here: the client gate in chooseUpload already excluded it,
             so blaming it would send the student checking a number that is fine. Same fallback
             as uploadResume in lib/api.ts for the same response. */
          setError(data?.error ?? "Could not read that resume.");
        } else {
          const parsedProfile = data as ResumeParsedProfile;
          uploadedProfileRef.current = parsedProfile;
          const parsedProfileWithoutTargetRoles = { ...parsedProfile };
          delete parsedProfileWithoutTargetRoles.target_roles;
          const currentRoles = profile && profile !== "missing" && Array.isArray(profile.target_roles)
            ? profile.target_roles
            : [];
          profileRevisionRef.current += 1;
          setProfile(
            currentRoles.length > 0
              ? { ...parsedProfileWithoutTargetRoles, target_roles: currentRoles }
              : parsedProfileWithoutTargetRoles,
          );
          entriesRevisionRef.current += 1;
          setEntries(null);
          await refreshUploadedProfile();
        }
      } catch {
        /* A fetch that rejects has no response at all: offline, a dropped connection, or a
           platform-level rejection served without CORS headers. The browser's own words are
           "Failed to fetch", which explains nothing. Same wording as uploadResume in lib/api.ts. */
        setError("The upload did not reach us. Check your connection and try again.");
      } finally {
        setUploading(false);
      }
    });
  }

  async function saveBank() {
    if (!entries || mutations.isActive()) return;
    const editorRevision = entriesRevisionRef.current;
    const submittedEntries = entries;
    await mutations.run("save", async () => {
      setSaving(true);
      setError(null);
      try {
        const cleaned = submittedEntries
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
          return;
        }
        const complete = cleaned.filter((e) => e.org && e.bullet_variants.length > 0);
        const res = await api<{ entries: ExperienceEntry[] }>(
          "/profile/experience-bank",
          { method: "PUT", body: JSON.stringify({ entries: complete }) },
        );
        if (entriesRevisionRef.current !== editorRevision) return;
        entriesRevisionRef.current += 1;
        setEntries(res.entries);
        setSavedEntriesJson(JSON.stringify(res.entries));
        setSavedAt(Date.now());
      } catch (err) {
        if (entriesRevisionRef.current !== editorRevision) return;
        setError(err instanceof Error ? err.message : "Could not save.");
      } finally {
        setSaving(false);
      }
    });
  }

  function patchEntry(i: number, patch: Partial<ExperienceEntry>) {
    entriesRevisionRef.current += 1;
    setEntries((prev) =>
      prev ? prev.map((e, j) => (j === i ? { ...e, ...patch } : e)) : prev,
    );
  }

  function removeEntry(i: number) {
    entriesRevisionRef.current += 1;
    setEntries((prev) => prev?.filter((_, j) => j !== i) ?? prev);
  }

  function addEntry(type: ExperienceEntry["type"]) {
    entriesRevisionRef.current += 1;
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
  const entriesDirty = entries !== null && JSON.stringify(entries) !== savedEntriesJson;
  const profileRefreshing = Boolean(pendingResources.profile || pendingResources.targeting);
  const bankRefreshing = Boolean(pendingResources.bank);
  const uploadPending = uploading || mutations.activeMutation === "upload";
  const bankSavePending = saving || mutations.activeMutation === "save";
  const parsedProfileSavePending = parsedProfileSaving || mutations.activeMutation === "parsed-profile";
  const mutationBusy = uploadPending || bankSavePending || parsedProfileSavePending;
  const uploadBlockedReason = parsedProfileEditing && entriesDirty
    ? "Save or cancel profile edits, and save work history, before replacing your resume."
    : parsedProfileEditing
      ? "Save or cancel profile edits before replacing your resume."
      : entriesDirty
        ? "Save work history changes before replacing your resume."
        : null;
  const uploadReady = profile !== null
    && entries !== null
    && profileLoadError === null
    && bankLoadError === null
    && !parsedProfileEditing
    && !entriesDirty
    && !mutationBusy
    && !profileRefreshing
    && !bankRefreshing;

  const runParsedProfileMutation = useCallback(
    (operation: () => Promise<void>) => mutations.run("parsed-profile", operation),
    [mutations],
  );

  function chooseUpload(file: File | undefined) {
    if (!file || !uploadReady || mutations.isActive()) return;
    /* The type check, the cap, and the refusal copy are the shared gate's (document-size.ts):
       past the cap the platform rejects the body as an unreadable 413, so the check happens
       before any bytes move, with the same sentence every upload surface shows. */
    const problem = validateApplicationDocument(file, {
      accept: "pdf",
      typeMessage: "Choose one PDF file.",
      oversizeHint: 'Export a smaller PDF (most editors have a "reduce file size" option) and try again.',
    });
    if (problem) {
      setSelectedFile(file);
      setSelectedFileRejected(true);
      setError(problem);
      return;
    }
    setSelectedFile(file);
    setSelectedFileRejected(false);
    void upload(file);
  }

  return (
    <div className="space-y-8">
      {!embedded && <div>
        <h1 className="text-section font-normal leading-[1.15] tracking-[-0.02em] text-ink">Resume</h1>
        {/* The second sentence explained the system to itself. A page called
            Resume, holding the resume, does not need to justify holding it. */}
        <p className="mt-1 text-sm text-muted">
          Your resume and work history.
        </p>
      </div>}

      {error && <ErrorNote message={error} />}

      {/* Base resume */}
      <Card className="p-6" aria-busy={profileRefreshing || uploadPending || parsedProfileSavePending}>
        {profileLoadError ? (
          <DataErrorState
            headingLevel="h2"
            title="Your resume did not load."
            body={profileLoadError}
            onRetry={retryProfile}
          />
        ) : <>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="resume-profile-heading" tabIndex={-1} className="text-base font-medium text-ink">Your resume</h2>
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
              aria-describedby={uploadBlockedReason ? "resume-upload-blocked-reason" : undefined}
              disabled={mutationBusy || !uploadReady} >
              {uploadPending
                ? <PendingLabel state="composing" onColor>Reading...</PendingLabel>
                : profile === "missing"
                  ? "Upload resume PDF"
                  : "Replace resume"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              disabled={mutationBusy || !uploadReady}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                chooseUpload(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {uploadBlockedReason && (
          <p id="resume-upload-blocked-reason" className="mt-3 text-xs text-muted">
            {uploadBlockedReason}
          </p>
        )}

        <div
          onDragEnter={(event) => { event.preventDefault(); if (uploadReady && !mutationBusy) setDragActive(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
          onDrop={(event) => { event.preventDefault(); setDragActive(false); chooseUpload(event.dataTransfer.files[0]); }}
          className={`mt-5 rounded-inner border border-dashed px-5 py-4 text-sm ${dragActive ? "border-brand bg-brand-soft text-brand-ink" : "border-border bg-surface-alt text-muted"}`}
          aria-label="Resume PDF upload drop zone"
          aria-describedby={uploadBlockedReason ? "resume-upload-blocked-reason" : undefined}
          aria-disabled={!uploadReady}
          aria-busy={uploadPending}
        >
          <p><span className="font-medium text-ink">Drop one PDF here</span>, or use the upload button. Maximum {APPLICATION_DOCUMENT_SIZE_LIMIT_LABEL}.</p>
          {selectedFile && <div className="mt-3 flex flex-wrap items-center gap-3"><span className="font-mono text-xs text-ink">{selectedFile.name}</span>{uploadPending ? <span role="status" aria-live="polite" className="inline-flex items-center gap-2"><progress aria-label="Uploading and reading resume" className="h-1.5 w-24 accent-brand" />Reading the PDF...</span> : error ? <button type="button" onClick={() => { if (selectedFileRejected) { fileRef.current?.click(); } else { chooseUpload(selectedFile); } }} aria-describedby={uploadBlockedReason ? "resume-upload-blocked-reason" : undefined} disabled={!uploadReady} className="font-medium text-brand-ink underline underline-offset-4 disabled:text-muted disabled:no-underline">{selectedFileRejected ? "Choose another file" : "Retry"}</button> : <span role="status" className="text-positive">Upload complete</span>}</div>}
        </div>

        {profileRefreshing && profile !== null && profile !== "missing" && !uploadPending && (
          <p role="status" className="mt-5 text-small text-muted">
            <PendingLabel>Refreshing resume details...</PendingLabel>
          </p>
        )}
        {profile !== null && profile !== "missing" && !uploadPending && !profileRefreshing && targetingRefreshError === null && (
          <ProfilePreview
            profile={profile}
            onProfileChange={(next) => {
              profileRevisionRef.current += 1;
              setProfile(next);
            }}
            otherMutationBusy={mutationBusy}
            onParsedProfileSavingChange={setParsedProfileSaving}
            runParsedProfileMutation={runParsedProfileMutation}
            resumeSession={mutations}
          />
        )}
        {parsedProfileSavePending && !parsedProfileSaving && (
          <p role="status" aria-live="polite" className="mt-5 text-small text-muted">
            <PendingLabel>Saving profile changes...</PendingLabel>
          </p>
        )}
        {targetingRefreshError && (
          <div className="mt-5 space-y-3">
            <ErrorNote message={targetingRefreshError} />
            <Button type="button" variant="secondary" onClick={retryTargeting}>
              Try refresh again
            </Button>
          </div>
        )}
        </>}
      </Card>

      {/* Everything you have done */}
      <section aria-busy={bankRefreshing || bankSavePending}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="resume-bank-heading" tabIndex={-1} className="text-base font-medium text-ink">Work history</h2>
            {/* "We pick the ones that fit each job" is the same promise the
                whole product makes on every screen. The heading plus the
                first sentence is the whole idea. */}
            <p className="mt-1 text-sm text-muted">
              Saved work Litos can use for each job.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && !bankSavePending && !entriesDirty && (
              <span className="text-xs text-positive">Saved</span>
            )}
            <Button
              onClick={saveBank}
              disabled={mutationBusy || bankRefreshing || entries === null || bankLoadError !== null || !entriesDirty} >
              {bankSavePending ? <PendingLabel onColor>Saving...</PendingLabel> : "Save changes"}
            </Button>
          </div>
        </div>

        {bankLoadError && (
          <DataErrorState
            headingLevel="h3"
            title="Work history did not load."
            body={bankLoadError}
            onRetry={retryBank}
          />
        )}

        {bankRefreshing && entries !== null && (
          <p role="status" className="mb-4 text-small text-muted">
            <PendingLabel>Refreshing work history...</PendingLabel>
          </p>
        )}

        {entries === null ? (
          bankLoadError ? null :
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
        className="mt-1.5 w-full rounded-full border border-control-border bg-surface px-3.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
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
        className="mt-1.5 w-full rounded-full border border-control-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
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
        className="mt-1.5 w-full rounded-inner border border-control-border bg-surface px-3.5 py-2.5 text-sm leading-6 text-ink outline-none focus:border-brand"
        placeholder={placeholder}
      />
    </div>
  );
}

/* The parse shape has evolved. The common profile facts are reviewable here, while structured work
   history stays in its purpose-built editor below. */
function ProfilePreview({
  profile,
  onProfileChange,
  otherMutationBusy,
  onParsedProfileSavingChange,
  runParsedProfileMutation,
  resumeSession,
}: {
  profile: Record<string, unknown>;
  onProfileChange: (profile: Record<string, unknown>) => void;
  otherMutationBusy: boolean;
  onParsedProfileSavingChange: (saving: boolean) => void;
  runParsedProfileMutation: (operation: () => Promise<void>) => Promise<"blocked" | "settled">;
  resumeSession: ResumeMutationController;
}) {
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
        resumeEmail={str("resume_email") ?? ""}
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
        otherMutationBusy={otherMutationBusy}
        onSavingChange={onParsedProfileSavingChange}
        runMutation={runParsedProfileMutation}
        resumeSession={resumeSession}
      />
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-muted hover:text-ink">
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
      <p className="text-xs text-muted">{label}</p>
      {/* `truncate` hid the end of every long value, which is how a wrong stored degree stayed
          invisible. Wrap instead: these cards are read to check the value is right. */}
      <p className="mt-0.5 break-words text-sm text-ink">{value}</p>
    </div>
  );
}

function ParsedProfileEditor({
  name,
  email,
  resumeEmail,
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
  otherMutationBusy,
  onSavingChange,
  runMutation,
  resumeSession,
}: {
  name: string;
  email: string;
  resumeEmail: string;
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
  otherMutationBusy: boolean;
  onSavingChange: (saving: boolean) => void;
  runMutation: (operation: () => Promise<void>) => Promise<"blocked" | "settled">;
  resumeSession: ResumeMutationController;
}) {
  const {
    parsedProfileDraft: draft,
    parsedProfileDraftRevisionRef: draftRevisionRef,
    parsedProfileEditing: editing,
    parsedProfileError: error,
    parsedProfileSaving: saving,
    setParsedProfileDraft: setDraft,
    setParsedProfileEditing: setEditing,
    setParsedProfileError: setError,
  } = resumeSession;
  const initialDraft = (): ResumeParsedProfileDraft => ({
    full_name: name,
    resume_email: resumeEmail,
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

  function changeDraft(patch: Partial<ResumeParsedProfileDraft>) {
    draftRevisionRef.current += 1;
    setDraft((current) => ({ ...current, ...patch }));
  }

  function startEditing() {
    draftRevisionRef.current += 1;
    setDraft(initialDraft());
    setError(null);
    setEditing(true);
  }

  async function save() {
    const editorRevision = draftRevisionRef.current;
    const submittedDraft = { ...draft };
    if (!submittedDraft.full_name.trim()) {
      setError("Name cannot be empty. Autofill has no fallback for it.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedDraft.resume_email.trim())) {
      setError("Add the personal email that should appear on your resume.");
      return;
    }
    if (school && !submittedDraft.school.trim()) {
      setError("School cannot be empty. You can replace a parsed school, but not erase it.");
      return;
    }
    const roles = parseEditableLines(submittedDraft.target_roles);
    if (!hasCompleteTargetRoleSet(roles, targetRoles)) {
      setError("Keep five target roles so Litos has a complete search set.");
      return;
    }
    const result = await runMutation(async () => {
      onSavingChange(true);
      setError(null);
      try {
        const rolesChanged = roles.length > 0 && targetRolesChanged(roles, targetRoles);
        const updated = await api<Record<string, unknown>>("/profile/parsed", {
          method: "PATCH",
          body: JSON.stringify({
            full_name: submittedDraft.full_name,
            resume_email: submittedDraft.resume_email,
            phone: submittedDraft.phone,
            ...(submittedDraft.school.trim() || school ? { school: submittedDraft.school } : {}),
            degree: submittedDraft.degree,
            grad_date: submittedDraft.grad_date,
            /* Sent ONLY when it changed, which makes this screen work against a backend that does not
               know the field yet. parsedProfilePatchSchema is .strict(), so an unknown key is a 400 on
               the whole save, not a partial one: shipping this page ahead of the matching backend
               would break every profile save rather than just the coursework part of one. Same shape
               as target_roles below, for the same reason. */
            ...(submittedDraft.coursework !== coursework ? { coursework: submittedDraft.coursework } : {}),
            objective: submittedDraft.objective,
            skills: parseEditableList(submittedDraft.skills),
            languages: parseEditableList(submittedDraft.languages),
            ...(rolesChanged ? { target_roles: roles } : {}),
          }),
        });
        if (draftRevisionRef.current !== editorRevision) return;
        // Targeting is stored separately from the parse and is authoritative. When this save did not
        // change roles, keep the titles already loaded from /profile/targeting instead of letting an
        // older parser guess in parsed_json flash back into the card until the next page load.
        onSaved({ ...updated, target_roles: rolesChanged ? roles : targetRoles });
        setEditing(false);
      } catch (reason) {
        if (draftRevisionRef.current !== editorRevision) return;
        setError(userFacingError(reason, "Could not save your profile changes."));
      } finally {
        onSavingChange(false);
      }
    });
    if (result === "blocked") setError("Wait for the current resume update to finish, then save again.");
  }

  if (!editing) {
    return (
      <div>
        <div className="flex justify-end">
          <button type="button" onClick={startEditing} disabled={otherMutationBusy} className="text-xs text-brand-ink underline underline-offset-2 disabled:text-muted disabled:no-underline">
            Edit parsed details
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {name && <KV label="Name" value={name} />}
          {resumeEmail && <KV label="Resume email" value={resumeEmail} />}
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
    <form onSubmit={(event) => { event.preventDefault(); void save(); }} aria-busy={saving} className="rounded-inner border border-border bg-surface-alt p-4">
      <div>
        <p className="text-sm font-medium text-ink">Review parsed details</p>
        <p className="mt-1 text-xs text-muted">Correct what the PDF reader got wrong. Your resume email is separate from the Litos address used inside application portals.</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" value={draft.full_name} onChange={(full_name) => changeDraft({ full_name })} placeholder="Your full name" />
        <Field label="Resume email" value={draft.resume_email} onChange={(resume_email) => changeDraft({ resume_email })} placeholder="you@school.edu" />
        <Field label="Phone" value={draft.phone} onChange={(phone) => changeDraft({ phone })} placeholder="Optional" />
      </div>
      {email && <p className="mt-2 text-xs text-muted">Litos login email: {email}</p>}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="School" value={draft.school} onChange={(school) => changeDraft({ school })} placeholder="University of Southern California" />
        <Field label="Degree" value={draft.degree} onChange={(degree) => changeDraft({ degree })} placeholder="Bachelor of Science in Computer Science" />
        <Field label="Graduation" value={draft.grad_date} onChange={(grad_date) => changeDraft({ grad_date })} placeholder="May 2028" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextAreaField label="Skills" value={draft.skills} onChange={(skills) => changeDraft({ skills })} rows={4} hint="Separate skills with commas or new lines." />
        <TextAreaField label="Target roles" value={draft.target_roles} onChange={(target_roles) => changeDraft({ target_roles })} rows={4} hint="Keep five roles, one per line. Any real job title is valid." />
      </div>
      <div className="mt-4">
        <TextAreaField
          label="Languages"
          value={draft.languages}
          onChange={(languages) => changeDraft({ languages })}
          rows={2}
          hint="Spoken languages your resume lists. Keep these out of Skills. To tell employers which ones you are fluent in, use Settings."
        />
      </div>
      <div className="mt-4">
        <TextAreaField
          label="Relevant coursework"
          value={draft.coursework}
          onChange={(coursework) => changeDraft({ coursework })}
          rows={2}
          hint="Course names, separated by commas. This prints on your generated resume."
        />
      </div>
      <div className="mt-4">
        <TextAreaField label="Objective or summary" value={draft.objective} onChange={(objective) => changeDraft({ objective })} rows={3} hint="Optional. Keep this true to your experience." />
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-warn">{userFacingError(error)}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={saving || otherMutationBusy || JSON.stringify(draft) === JSON.stringify(initialDraft())}>{saving ? "Saving..." : "Save changes"}</Button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving || otherMutationBusy} className="rounded-full border border-border px-4 py-2 text-xs text-ink">Cancel</button>
      </div>
    </form>
  );
}

function TextAreaField({ label, value, onChange, rows, hint }: { label: string; value: string; onChange: (value: string) => void; rows: number; hint: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="mt-1.5 w-full resize-y rounded-inner border border-control-border bg-surface px-3.5 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand" />
      <span className="mt-1 block text-[11px] text-muted">{hint}</span>
    </label>
  );
}

function ProfileChips({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => <span key={value} className="rounded-full bg-surface-alt px-2.5 py-0.5 font-mono text-[11px] text-muted">{value}</span>)}
      </div>
    </div>
  );
}
