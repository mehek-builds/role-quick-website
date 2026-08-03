/**
 * Public API for application review, tailoring, and pipeline behavior.
 *
 * Presentation code imports from this file so internal layers can move without
 * forcing route and component changes.
 */
export * from "./domain/application-review";
export * from "./domain/apply-variant";
export * from "./domain/board-stages";
export * from "./domain/match-model";
export {
  AUTO_SUBMIT_PREPARED_LIMIT,
  HOME_MATCH_WINDOW,
  MIN_JD_CHARS,
  canGenerateFrom,
  countPreparedJobs,
  jobSubmittedOnDay,
  nextPreferredReadyPacket,
  packetMatchesJob,
  rankJobs,
  resumeGenerationBody,
  visibleMatches,
  type ProfileIdentity,
  type RankedJob,
} from "./domain/daily-matches";
export * from "./domain/requirement-terms";
export * from "./infrastructure/applications-api";
