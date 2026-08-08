/**
 * Public API for application review, tailoring, and pipeline behavior.
 *
 * Presentation code imports from this file so internal layers can move without
 * forcing route and component changes.
 */
export * from "./domain/application-filter";
export * from "./domain/application-review";
export * from "./domain/apply-variant";
export * from "./domain/board-stages";
export * from "./domain/duplicate-postings";
export * from "./domain/education-drift";
export * from "./domain/match-model";
export * from "./domain/prescript";
export {
  AUTO_SUBMIT_PREPARED_LIMIT,
  HOME_MATCH_WINDOW,
  MIN_JD_CHARS,
  canGenerateFrom,
  countPreparedJobs,
  isHttpsJobUrl,
  jobSubmittedOnDay,
  missingApplicationFields,
  nextPreferredReadyPacket,
  packetMatchesJob,
  rankJobs,
  resumeGenerationBody,
  visibleMatches,
  type ApplicationDraft,
  type ApplicationDraftField,
  type ProfileIdentity,
  type RankedJob,
} from "./domain/daily-matches";
export * from "./domain/requirement-terms";
export * from "./domain/submission-checklist";
export * from "./domain/submission-state";
export * from "./infrastructure/applications-api";
export { PartialPayloadError } from "./infrastructure/response-shape";
export {
  SCORE_BATCH,
  useJobMatchScores,
  type JobMatch,
  type JobMatchState,
} from "./application/use-job-match-scores";
