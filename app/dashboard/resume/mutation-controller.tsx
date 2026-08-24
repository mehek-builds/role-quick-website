"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ExperienceEntry } from "@/lib/api";
import { createExclusiveMutationCoordinator, createLatestRequestCoordinator } from "@/lib/latest-request";

export type ResumeMutation = "upload" | "save" | "parsed-profile";
export type ResumeResource = "profile" | "bank" | "targeting";
export type ResumeParsedProfile = Record<string, unknown>;
export type ResumeResourcePending = Partial<Record<ResumeResource, boolean>>;
export type ResumeParsedProfileDraft = {
  full_name: string;
  resume_email: string;
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
type MutationResult = "blocked" | "settled";

export type ResumeMutationController = {
  activeMutation: ResumeMutation | null;
  isActive: () => boolean;
  run: (mutation: ResumeMutation, operation: () => Promise<void>) => Promise<MutationResult>;
  profile: ResumeParsedProfile | null | "missing";
  setProfile: Dispatch<SetStateAction<ResumeParsedProfile | null | "missing">>;
  profileRevisionRef: MutableRefObject<number>;
  profileLoadError: string | null;
  setProfileLoadError: Dispatch<SetStateAction<string | null>>;
  bankLoadError: string | null;
  setBankLoadError: Dispatch<SetStateAction<string | null>>;
  targetingRefreshError: string | null;
  setTargetingRefreshError: Dispatch<SetStateAction<string | null>>;
  pendingResources: ResumeResourcePending;
  setPendingResources: Dispatch<SetStateAction<ResumeResourcePending>>;
  resourceRequests: ReturnType<typeof createLatestRequestCoordinator<ResumeResource>>;
  uploading: boolean;
  setUploading: Dispatch<SetStateAction<boolean>>;
  selectedFile: File | null;
  setSelectedFile: Dispatch<SetStateAction<File | null>>;
  uploadedProfileRef: MutableRefObject<ResumeParsedProfile | null>;
  saving: boolean;
  setSaving: Dispatch<SetStateAction<boolean>>;
  parsedProfileSaving: boolean;
  setParsedProfileSaving: Dispatch<SetStateAction<boolean>>;
  parsedProfileEditing: boolean;
  setParsedProfileEditing: Dispatch<SetStateAction<boolean>>;
  parsedProfileDraft: ResumeParsedProfileDraft;
  setParsedProfileDraft: Dispatch<SetStateAction<ResumeParsedProfileDraft>>;
  parsedProfileDraftRevisionRef: MutableRefObject<number>;
  parsedProfileError: string | null;
  setParsedProfileError: Dispatch<SetStateAction<string | null>>;
  entries: ExperienceEntry[] | null;
  setEntries: Dispatch<SetStateAction<ExperienceEntry[] | null>>;
  entriesRevisionRef: MutableRefObject<number>;
  savedEntriesJson: string;
  setSavedEntriesJson: Dispatch<SetStateAction<string>>;
  savedAt: number | null;
  setSavedAt: Dispatch<SetStateAction<number | null>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
};

const ResumeMutationContext = createContext<ResumeMutationController | null>(null);

function useOwnedResumeMutationController(): ResumeMutationController {
  const [coordinator] = useState(() => createExclusiveMutationCoordinator<ResumeMutation>());
  const [resourceRequests] = useState(() => createLatestRequestCoordinator<ResumeResource>());
  const [activeMutation, setActiveMutation] = useState<ResumeMutation | null>(null);
  const [profile, setProfile] = useState<ResumeParsedProfile | null | "missing">(null);
  const profileRevisionRef = useRef(0);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [bankLoadError, setBankLoadError] = useState<string | null>(null);
  const [targetingRefreshError, setTargetingRefreshError] = useState<string | null>(null);
  const [pendingResources, setPendingResources] = useState<ResumeResourcePending>({});
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const uploadedProfileRef = useRef<ResumeParsedProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [parsedProfileSaving, setParsedProfileSaving] = useState(false);
  const [parsedProfileEditing, setParsedProfileEditing] = useState(false);
  const [parsedProfileDraft, setParsedProfileDraft] = useState<ResumeParsedProfileDraft>({
    full_name: "",
    resume_email: "",
    phone: "",
    school: "",
    degree: "",
    grad_date: "",
    coursework: "",
    objective: "",
    skills: "",
    languages: "",
    target_roles: "",
  });
  const parsedProfileDraftRevisionRef = useRef(0);
  const [parsedProfileError, setParsedProfileError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ExperienceEntry[] | null>(null);
  const entriesRevisionRef = useRef(0);
  const [savedEntriesJson, setSavedEntriesJson] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isActive = useCallback(() => coordinator.isActive(), [coordinator]);

  const run = useCallback(async (
    mutation: ResumeMutation,
    operation: () => Promise<void>,
  ): Promise<MutationResult> => {
    if (coordinator.isActive()) return "blocked";
    setActiveMutation(mutation);
    try {
      return await coordinator.run(mutation, operation);
    } finally {
      if (!coordinator.isActive()) setActiveMutation(null);
    }
  }, [coordinator]);

  return useMemo(() => ({
    activeMutation,
    bankLoadError,
    entries,
    entriesRevisionRef,
    error,
    isActive,
    parsedProfileDraft,
    parsedProfileDraftRevisionRef,
    parsedProfileEditing,
    parsedProfileError,
    parsedProfileSaving,
    pendingResources,
    profile,
    profileLoadError,
    profileRevisionRef,
    resourceRequests,
    run,
    savedAt,
    savedEntriesJson,
    saving,
    selectedFile,
    setBankLoadError,
    setEntries,
    setError,
    setParsedProfileDraft,
    setParsedProfileEditing,
    setParsedProfileError,
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
  }), [
    activeMutation,
    bankLoadError,
    entries,
    error,
    isActive,
    parsedProfileDraft,
    parsedProfileEditing,
    parsedProfileError,
    parsedProfileSaving,
    pendingResources,
    profile,
    profileLoadError,
    resourceRequests,
    run,
    savedAt,
    savedEntriesJson,
    saving,
    selectedFile,
    targetingRefreshError,
    uploading,
  ]);
}

/**
 * Keeps Resume ownership above dashboard route children. A Documents tab or the whole route can
 * unmount while the synchronous lock, drafts, uploads, saved snapshots, errors, and announced
 * pending state remain live.
 */
export function ResumeMutationProvider({ children }: { children: React.ReactNode }) {
  const controller = useOwnedResumeMutationController();
  return (
    <ResumeMutationContext.Provider value={controller}>
      {children}
    </ResumeMutationContext.Provider>
  );
}

/** Every Resume workspace is rendered under DashboardShell's durable owner. */
export function useResumeMutationController(): ResumeMutationController {
  const controller = useContext(ResumeMutationContext);
  if (!controller) throw new Error("useResumeMutationController must be used within ResumeMutationProvider");
  return controller;
}
