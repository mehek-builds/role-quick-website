/**
 * Public API for application review, tailoring, and pipeline behavior.
 *
 * Presentation code imports from this file so internal layers can move without
 * forcing route and component changes.
 */
export * from "./domain/application-filter";
export * from "./domain/application-queue";
export * from "./domain/application-review";
export * from "./domain/apply-variant";
export * from "./domain/audit-refusal";
export * from "./domain/board-stages";
export * from "./domain/canonical-tracker";
export * from "./domain/dependent-questions";
export * from "./domain/duplicate-postings";
export * from "./domain/education-drift";
export * from "./domain/jd-display";
export * from "./domain/match-model";
export * from "./domain/packet-audit-acknowledgement";
export * from "./domain/packet-audit-display";
export * from "./domain/tracker-removal";
export * from "./domain/packet-evidence-session";
export * from "./domain/pipeline-counts";
export * from "./domain/packet-pdf-verification";
export * from "./domain/prescript";
export * from "./domain/question-review-presentation";
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
  type ResumeGenerationInitiation,
} from "./domain/daily-matches";
export * from "./domain/requirement-terms";
export * from "./domain/scraped-text";
export * from "./domain/review-answer-save";
export * from "./domain/attention-acknowledgement";
export * from "./domain/submission-checklist";
export * from "./domain/submission-authority-envelope";
export * from "./domain/submission-projection";
export * from "./domain/application-packet-authority";
export * from "./domain/board-submission-authority";
export * from "./domain/submission-state";
export * from "./infrastructure/applications-api";
export * from "./infrastructure/packet-audit-acknowledge";
export { PartialPayloadError } from "./infrastructure/response-shape";
export {
  SCORE_BATCH,
  useJobMatchScores,
  type JobMatch,
  type JobMatchState,
} from "./application/use-job-match-scores";
