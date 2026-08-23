export type ApplicationQueueReview = Readonly<{
  status?: string | null;
  ats_name?: string | null;
  portal_name?: string | null;
  portal_url?: string | null;
}>;

export type ApplicationQueueItem = Readonly<{
  job_context?: Readonly<{
    role?: string | null;
    company?: string | null;
  }> | null;
  spec?: Readonly<{
    _review?: ApplicationQueueReview | null;
  }> | null;
}>;

export type ApplicationNextActionRank = 0 | 1 | 2 | 3;

export type ApplicationWorkflowRevisionSource = Readonly<{
  id: string;
  resume_object_key?: string | null;
  spec?: unknown;
}>;

const NEEDS_USER_STATUSES = [
  "needs_attention",
  "ready_for_final_approval",
  "awaiting_security_code",
  "failed",
] as const;

const READY_STATUSES = [
  "resume_ready",
  "questions_ready",
  "ready_to_submit",
] as const;

const WORKING_STATUSES = [
  "submit_requested",
  "preparing",
  "filling",
  "submitting",
  "submission_claimed",
] as const;

function normalizeQueueSearchValue(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match every query token across the human identity fields and the machine-owned portal fields.
 * Tokens may land in different fields, so "engineer greenhouse" still finds the right packet.
 */
export function applicationMatchesQuery(
  application: ApplicationQueueItem,
  query: string,
): boolean {
  const normalizedQuery = normalizeQueueSearchValue(query);
  if (!normalizedQuery) return true;

  const review = application.spec?._review;
  const searchable = [
    application.job_context?.role,
    application.job_context?.company,
    review?.ats_name,
    review?.portal_name,
    review?.portal_url,
  ]
    .filter((value): value is string => typeof value === "string")
    .map(normalizeQueueSearchValue)
    .join(" ");

  return normalizedQuery.split(" ").every((token) => searchable.includes(token));
}

/**
 * Rank an application by the next useful action in the student's queue.
 *
 * Equal statuses intentionally return the same number. A stable sort therefore preserves the
 * ledger's existing timestamp order inside each priority group.
 */
export function applicationNextActionRank(
  review: Pick<ApplicationQueueReview, "status"> | null | undefined,
): ApplicationNextActionRank {
  const status = review?.status ?? "";
  if ((NEEDS_USER_STATUSES as readonly string[]).includes(status)) return 0;
  if ((READY_STATUSES as readonly string[]).includes(status)) return 1;
  if ((WORKING_STATUSES as readonly string[]).includes(status)) return 2;
  return 3;
}

/**
 * Capture the server-owned application state that selection installs into the workspace.
 *
 * Download links are deliberately absent because their signed tokens may rotate without changing
 * the application. The packet spec and object key are the actual review, answer, document, and
 * resume state. If either changes while a local row-open is refreshing history, the fresh packet
 * must be selected rather than leaving stale actions on screen.
 */
export function applicationWorkflowRevision(
  application: ApplicationWorkflowRevisionSource,
): string {
  return JSON.stringify({
    id: application.id,
    resumeObjectKey: application.resume_object_key ?? null,
    spec: application.spec ?? null,
  });
}
