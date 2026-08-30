export type ResumeUploadStateInput = {
  full_name?: string | null;
  bank_total?: number | null;
  bank_seeded?: number | null;
  parse_method?: "model" | "local_fallback";
};

export function resumeUploadState(parsed: ResumeUploadStateInput, options: { knownReady?: boolean } = {}) {
  const evidenceCount = parsed.bank_total ?? parsed.bank_seeded ?? 0;
  const ready = options.knownReady === true || (Boolean(parsed.full_name?.trim()) && evidenceCount > 0);
  return {
    ready,
    showFallbackWarning: ready && parsed.parse_method === "local_fallback",
  };
}
