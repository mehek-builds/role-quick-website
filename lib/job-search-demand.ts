export type ZeroResultSearchSurface = "public_board" | "dashboard";

export type ZeroResultSearchInput = {
  targetRole: string;
  location?: string;
  remoteOnly?: boolean;
  sponsorOnly?: boolean;
  surface: ZeroResultSearchSurface;
  totalResults: number;
};

export type ZeroResultSearchProperties = {
  target_role: string;
  location: string;
  remote_only: boolean;
  sponsor_only: boolean;
  surface: ZeroResultSearchSurface;
  result_count: 0;
};

export type ZeroResultTrackerRuntime = {
  capture: (properties: Record<string, string | number | boolean>) => void;
  getSessionStorage: () => Pick<Storage, "getItem" | "setItem">;
  seen: Set<string>;
};

const MAX_TERM_LENGTH = 80;
const EMAIL_LIKE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const URL_LIKE = /\b(?:(?:https?:\/\/|www\.)\S+|[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,}(?:\/\S*)?)\b/i;
const PHONE_LIKE = /\d(?:[\s().+-]*\d){7}/;
const DEDUPE_PREFIX = "litos:zero-result-job-search:";

/**
 * Keep reporting useful without turning a free-text search box into a path for accidental PII.
 * Role and location terms are normalized for aggregation. Anything resembling an email, URL or
 * phone number is dropped instead of being sent to analytics.
 */
export function normalizeJobSearchTerm(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
  if (!normalized || EMAIL_LIKE.test(normalized) || URL_LIKE.test(normalized) || PHONE_LIKE.test(normalized)) {
    return null;
  }
  return normalized.slice(0, MAX_TERM_LENGTH);
}

export function zeroResultSearchProperties(
  input: ZeroResultSearchInput,
): ZeroResultSearchProperties | null {
  if (input.totalResults !== 0) return null;
  const targetRole = normalizeJobSearchTerm(input.targetRole);
  if (!targetRole) return null;
  const suppliedLocation = input.location?.trim();
  const location = normalizeJobSearchTerm(input.location);
  if (suppliedLocation && !location) return null;
  return {
    target_role: targetRole,
    location: location ?? "any",
    remote_only: input.remoteOnly === true,
    sponsor_only: input.sponsorOnly === true,
    surface: input.surface,
    result_count: 0,
  };
}

export function trackZeroResultJobSearchWithRuntime(
  input: ZeroResultSearchInput,
  runtime: ZeroResultTrackerRuntime,
): boolean {
  const properties = zeroResultSearchProperties(input);
  if (!properties) return false;
  const key = `${DEDUPE_PREFIX}${JSON.stringify(properties)}`;
  if (runtime.seen.has(key)) return false;
  try {
    const storage = runtime.getSessionStorage();
    if (storage.getItem(key)) return false;
    storage.setItem(key, "1");
  } catch {
    /* Storage can be unavailable in hardened browsers. Analytics still remains best-effort. */
  }
  runtime.seen.add(key);
  runtime.capture(properties);
  return true;
}
