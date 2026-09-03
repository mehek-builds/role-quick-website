"use client";

import { Button, ButtonLink } from "@/components/app/Button";
import { Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  api,
  ApiError,
  getPostingQuestions,
  getToken,
  isGuestSession,
  type ApplicationFillHandoff,
  type ApplicationQuestion,
  type ApplicationQuestionMetadataBlocker,
  type ApplicationProfile,
  type ApplicationReview,
  type AttachedDocument,
  type AuthoritativeSubmissionProjection,
  type CanonicalApplication,
  type CanonicalCoverLetterResponse,
  type CoverLetter,
  type GeneratedResume,
  type JobsPage,
  type MonitoredJob,
  type PacketAuditResponse,
  type ManualHandoffResponse,
  type ResumeSpec,
  type SubmissionRetrySafety,
  removeApplicationFromTracker,
} from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, ExtensionStoreLink, PendingLabel, ScrollableRow, ShimmerRows, TerminalActionBar, formatRelativeDate } from "@/components/app/ui";
import { CompanyLogo } from "@/components/app/CompanyLogo";
import { ThinkingOrb } from "thinking-orbs";
import { canonicalApplicationFromPacket, canRemoveFromTracker, canonicalEnvelopeLegacyHydrationId, canonicalEnvelopeWithMissingLegacyHydration, canonicalTrackerPacket, explicitTerms, sendableLinkedPacketFromCanonicalEnvelope, withRestoredLinkedPackets, linkedLegacyPacketFromCanonicalTrackerPacket, mergeCanonicalApplicationHistory, mergeDiscoveredQuestions, portalName, reviewablePackets as onlyReviewablePackets, reviewWithLists, screenForStatus, sectionHeading, selectedPacketForRequest, startsNewSection, statusLabel, stripMetadata, upsertCanonicalApplicationHistory } from "@/features/applications";
import { applicationFilterFromSearch, applicationFilterHeading, cleanJdCapture, ledgerRendersOnLanding, pipelineCounts, reviewCanBeSent, sentSince, startOfLocalDay, statusMatchesApplicationFilter, unansweredRequiredQuestionCount, type ApplicationFilter } from "@/features/applications";
import { nextPreferredReadyPacket, packetMatchesJob } from "@/features/applications";
import { auditAnswerWrite, reviewAnswersNeedSave, saveReviewAnswers, type ReviewAnswerSaveResponse } from "@/features/applications";
import { saveAttentionAcknowledgement, type AttentionAcknowledgementResponse } from "@/features/applications";
import { duplicateBadge, duplicatePostingMarks, duplicatePostingNote } from "@/features/applications";
import { isHttpsJobUrl, missingApplicationFields, type ApplicationDraftField } from "@/features/applications";
import { COVER_LETTER_WAIT_MS, HANDOFF_CLOCK_TICK_MS, coverLetterBlocks, coverLetterGate, documentsFromSpecMarks, handoffWindowExpired, nextCoverLetterValue, nextSubmissionState, publishSubmissionEnvelope, reconcilePacketEvidenceWithSubmission, submissionAfterPacketAudit, submissionCoverLetterField, submissionReviewPacketIdentity, submissionSnapshotIsOlder } from "@/features/applications";
import { MatchScore, MatchGaps } from "@/components/app/MatchScore";
import { auditRefusalCode, historicalPacketAuditStaleMessage, nextMatchScoreRequest, packetAuditReviewRecoveryCode } from "@/features/applications";
import { getBaseResume } from "@/lib/base-resume";
import { RequirementBreakdown } from "@/components/app/RequirementBreakdown";
import { ResumeHealth } from "@/components/app/ResumeHealth";
import { Board } from "@/components/app/Board";
import { SectionBoundary } from "@/components/app/SectionBoundary";
import { MotionPanel, runDashboardTransition } from "@/components/app/Motion";
/* contactName and contactLine, not a local read of `_contact`. They are the fourth and fifth
   readers of that record, and the two that already know its exact key names: the backend stores it
   verbatim from the resume request body, so "location" and "linkedin" resolve to nothing and fail
   silently after a .filter(Boolean). Sharing them is the reason this screen cannot drift from the
   packet pane the way it just did. */
import { ApplicationPacket, contactLine, contactName } from "@/components/app/ApplicationPacket";
import { ResumePaper } from "@/components/app/ApplicationPacket";
import { TranscriptModal } from "@/components/app/TranscriptModal";
import { AutopilotLockNote, NextMatchCard, useAutopilot, type NextMatch } from "@/components/app/Autopilot";
import { InterviewPrep } from "@/components/app/InterviewPrep";
import { fetchJdMatch, resumeSpecText } from "@/features/applications";
import { exactAttendedHandoffUrl } from "@/lib/attended-handoff";
import { armHandoffs, ensureCurrentExtensionSession, minimumAttendedHandoffExtensionVersion, startFreeFillThroughExtension } from "@/lib/extension-bridge";
import { applyBankVariant, type ApplyOutcome } from "@/features/applications";
import { RequirementProvider, RequirementText, MatchLegend } from "@/components/app/RequirementText";
import { buildRequirementIndex, EMPTY_REQUIREMENT_INDEX, exactPacketAuditClauses, exactPacketAuditRanges } from "@/features/applications";
import { educationDrift, educationDriftMessage, type EducationProfile } from "@/features/applications";
import { checklistRowControl, completedSubmissionGroups, directInputTaskPlan, directQuestionPromptFingerprint, directQuestionTaskFingerprint, displayQuestionLabel, documentAsksByKind, documentControls, documentStepsInPlan, humanInputItems, metadataRefreshOutranksStandingAttention, QUESTION_CHOICE_LIST_LIMIT, reviewedAnswersSaveLanding, type DirectQuestionTask, type DirectQuestionTaskIntent, type SubmissionChecklistAction, type SubmissionChecklistItem } from "@/features/applications";
import { prescriptBlocksProgress, prescriptEditableQuestions, prescriptMetadataBlockers, prescriptNeedsHer, prescriptSummary } from "@/features/applications";
import { answerWithExactOptionToggled, exactQuestionOption, exactSelectedQuestionOptions, optionalQuestionNeedsDecision, questionAcceptsMultipleOptions, questionOptionsAreComplete, questionReadsAsAnswered, questionReviewPresentation, requiredQuestionReviewRoute } from "@/features/applications";
import type { JdMatchResponse, JobMatch } from "@/features/applications";
import { userFacingError } from "@/lib/user-facing-error";
import { APPLICATION_DOCUMENT_ACCEPT_ATTRIBUTE, validateApplicationDocument } from "@/lib/document-size";
import { messageAsksForTheExtension } from "@/lib/extension-store-link";
import { track } from "@/lib/analytics";
import { replaceClosedComposerUrl } from "./composer-url";
import { applicationSelectionPath } from "./application-selection-url";
import { applicationMatchesQuery, applicationNextActionRank, applicationWorkflowRevision } from "@/features/applications";
import { ExactPacketPdf } from "@/components/app/ExactPacketPdf";
import { AuditedJobDescription, manualHandoffMatchesPacket, manualTrialPacketEvidenceIsFresh, PacketAuditBreakdown, packetAuditDisplayIsExact, packetAuditResponseMatchesApplication } from "@/components/app/PacketAuditEvidence";
import { acknowledgePacketAudit, acknowledgePacketEvidence, packetQuestionsSnapshot, reconcilePacketPdfVerification, reconcileUnacknowledgedPacketPoll, revalidateAcknowledgedPacketEvidence, type PacketEvidenceSession, type PacketPdfEvidenceVerification } from "@/features/applications";
import { useBilling } from "@/components/billing/BillingProvider";
import { isStructuredUpgradeDenial } from "@/features/billing";
import { completeOperationId, operationIdFor } from "@/lib/operation-id";
import { applicationPacketAuthorityState, confirmedProjectionForPacket, managedPrepareAuthorityEnvelopeFromUnknown, managedPrepareAuthorityMatchesPacket, quarantinedSubmissionAuthority, reviewClaimsSubmissionSent, reviewForSubmissionProjection, submissionAuthorityEnvelopeFromUnknown, submissionMutationResponseMatchesApplication, submissionProjectionIsConfirmed } from "@/features/applications";
import { useSidebarCollapse } from "@/app/dashboard/dashboard-shell";

type Screen = "review" | "questions" | "submitting" | "portal" | "submitted";
type ApplicationSort = "next" | "recent" | "company";
type CanonicalRequestScope = {
  applicationId: string;
  editorRevision: number;
  requestGeneration: number;
  channel: "cover-letter" | "tailoring";
};
type PacketCoverLetterRequestScope = {
  applicationId: string;
  editorRevision: number;
  requestGeneration: number;
};
type PrepareApplicationOptions = {
  allowServerAnswerRefresh?: boolean;
  restart?: boolean;
  failureScreen?: "questions" | "portal" | "review";
  source?: "metadata_refresh";
};

type DirectAnswerSaveResult = {
  saved: true;
  review: SubmissionResponse["review"];
  promptFingerprint?: string;
  mayAdvance: boolean;
  retryMessage?: string;
} | { saved: false; message: string; review?: SubmissionResponse["review"] };

type DirectAnswerPass = {
  key: string;
  promptFingerprints: ReadonlySet<string>;
};

type DirectAnswerFailure = {
  promptFingerprint: string;
  taskFingerprint: string;
  message: string;
};

type DirectAnswerDraft = {
  questionId: string;
  promptFingerprint: string;
  taskFingerprint: string;
  answer: string;
};

type DirectAnswerProgress = {
  key: string;
  answeredTasks: readonly DirectQuestionTask[];
  cursorPromptFingerprint: string | null;
  lastSavedPromptFingerprint: string | null;
  navigationToken: number;
  total: number;
};

const EMPTY_DIRECT_ANSWER_DRAFTS: ReadonlyMap<string, DirectAnswerDraft> = new Map();

function directAnswerNavigationTasks(
  review: Pick<ApplicationReview, "questions" | "question_metadata_blockers">,
  outstandingTasks: readonly DirectQuestionTask[],
  answeredTasks: readonly DirectQuestionTask[],
): DirectQuestionTask[] {
  const outstandingByPrompt = new Map(
    outstandingTasks.map((task) => [directQuestionPromptFingerprint(task), task]),
  );
  const answeredByPrompt = new Map(
    answeredTasks.map((task) => [directQuestionPromptFingerprint(task), task]),
  );
  return questionReviewPresentation(
    review.questions ?? [],
    review.question_metadata_blockers ?? [],
  ).editableQuestions.flatMap((question) => {
    const promptFingerprint = directQuestionPromptFingerprint({ question });
    const task = outstandingByPrompt.get(promptFingerprint) ?? answeredByPrompt.get(promptFingerprint);
    return task ? [{ ...task, question }] : [];
  });
}

function directAnswerPassKey(review: ApplicationReview): string {
  return review.questions_reviewed_at ?? review.submission_run_id ?? review.updated_at;
}

function directAnswerPassesAreCompatible(
  current: ApplicationReview,
  accepted: ApplicationReview,
): boolean {
  const currentQuestionPass = current.questions_reviewed_at?.trim() || null;
  const acceptedQuestionPass = accepted.questions_reviewed_at?.trim() || null;
  if (currentQuestionPass || acceptedQuestionPass) {
    return currentQuestionPass !== null && currentQuestionPass === acceptedQuestionPass;
  }
  const currentRunPass = current.submission_run_id?.trim() || null;
  const acceptedRunPass = accepted.submission_run_id?.trim() || null;
  if (currentRunPass || acceptedRunPass) {
    return currentRunPass !== null && currentRunPass === acceptedRunPass;
  }
  /* Older review payloads have no explicit question-pass identity. Their updated_at changes when
     this answer write lands, so a timestamp mismatch alone cannot prove that two responses belong
     to different employer reads. */
  return true;
}

function directAnswerPassRetryMessage(intent: DirectQuestionTaskIntent): string {
  return intent === "confirm"
    ? "The company form was checked again while your confirmation was saving. Your answer is still here. Confirm it again for the latest check."
    : "The company form was checked again while your answer was saving. Your answer is still here. Save it again for the latest check.";
}

function submissionPublicationGeneration(
  generations: ReadonlyMap<string, number>,
  applicationId: string,
): number {
  return generations.get(applicationId) ?? 0;
}

function advanceSubmissionPublicationGeneration(
  generations: Map<string, number>,
  applicationId: string,
): void {
  generations.set(applicationId, submissionPublicationGeneration(generations, applicationId) + 1);
}

/* These guards are deliberately pure. Both callers resume after a network await, so the screen
   and evidence captured when the request started are already historical. Read the synchronous
   refs at the write boundary and commit only while the poll still owns that piece of UI state. */
function submissionPollMayReplaceQuestions(currentScreen: Screen): boolean {
  return currentScreen === "portal" || currentScreen === "submitting";
}

function acknowledgedEvidenceRevalidationMayCommit(
  currentScreen: Screen,
  currentEvidence: PacketEvidenceSession | null,
  requestedEvidence: PacketEvidenceSession,
): boolean {
  return submissionPollMayReplaceQuestions(currentScreen) && currentEvidence === requestedEvidence;
}

function packetAuditRecoveryMayCommit(currentApplicationId: string | null, requestedApplicationId: string): boolean {
  return currentApplicationId === requestedApplicationId;
}

/* `partial` marks the snapshot selectPacket seeds from a board row, which carries `review` and
   nothing else. nextSubmissionState reads it so the first real server answer always replaces the
   seed. See features/applications/domain/submission-state.ts for what that fixes. */
/* `documents` is keyed by document kind and is TRI-STATE the way cover_letter_required is: absent
   means this envelope has never carried the measurement, and an unmeasured document must not block a
   send. An empty object is a real answer, "nothing is attached"; undefined is "nobody has looked".
   The `partial: true` seed below is exactly the second case, and so is a backend that predates the
   documents route. */
export type SubmissionResponse = {
  application_id: string;
  review: ApplicationReview;
  submission_authority?: unknown;
  submission_projection?: AuthoritativeSubmissionProjection;
  rejected_submission_projection?: unknown;
  submission_authority_quarantined?: true;
  retry_safety?: SubmissionRetrySafety | null;
  cover_letter?: CoverLetter | null;
  documents?: Record<string, AttachedDocument>;
  handoff_url?: string;
  configured?: boolean;
  partial?: boolean;
};

type SubmissionResponseDisplayContext = {
  packetId: string;
  canonicalApplicationId?: string;
  attemptId?: string;
};

function submissionResponseDisplayContext(
  packet: GeneratedResume | null | undefined,
  packetId: string,
): SubmissionResponseDisplayContext {
  const canonical = packet ? canonicalApplicationFromPacket(packet) : null;
  return {
    packetId,
    ...(canonical ? { canonicalApplicationId: canonical.id } : {}),
  };
}

function submissionResponseForDisplay(
  response: SubmissionResponse,
  expected: SubmissionResponseDisplayContext,
): SubmissionResponse {
  const authority = submissionAuthorityEnvelopeFromUnknown(response, {
    applicationId: response.application_id,
    packetId: expected.packetId,
    ...(expected.canonicalApplicationId
      ? { canonicalApplicationId: expected.canonicalApplicationId }
      : {}),
    ...(expected.attemptId ? { attemptId: expected.attemptId } : {}),
  });
  const parsedProjection = authority?.projection ?? null;
  const retrySafety = authority?.retrySafety ?? null;
  const confirmedProjection = confirmedProjectionForPacket(parsedProjection, {
    packetId: expected.packetId,
    ...(expected.canonicalApplicationId
      ? { canonicalApplicationId: expected.canonicalApplicationId }
      : {}),
    ...(expected.attemptId ? { attemptId: expected.attemptId } : {}),
    retrySafety,
  });
  const rejectedProjection = authority === null
    ? response.submission_authority ?? response.submission_projection
    : parsedProjection?.state === "confirmed" && confirmedProjection === null
      ? parsedProjection
      : undefined;
  const authorityQuarantined = confirmedProjection
    ? false
    : authority === null
      || response.submission_authority_quarantined === true
      || rejectedProjection !== undefined
      || reviewClaimsSubmissionSent(response.review);
  const projectionForReview: AuthoritativeSubmissionProjection = confirmedProjection
    ?? (parsedProjection?.state !== "confirmed" ? parsedProjection : null)
    ?? quarantinedSubmissionAuthority({
      applicationId: response.application_id,
      packetId: expected.packetId,
      ...(expected.canonicalApplicationId
        ? { canonicalApplicationId: expected.canonicalApplicationId }
        : {}),
      ...(expected.attemptId ? { attemptId: expected.attemptId } : {}),
    }).projection;
  return {
    ...response,
    review: reviewWithLists(reviewForSubmissionProjection(
      response.review,
      projectionForReview,
      expected,
    )),
    submission_projection: projectionForReview,
    retry_safety: retrySafety as SubmissionRetrySafety | null,
    ...(rejectedProjection === undefined
      ? {}
      : { rejected_submission_projection: rejectedProjection }),
    submission_authority_quarantined: authorityQuarantined ? true : undefined,
  };
}

type ResumeGenerationResponse = {
  resume_id: string;
  canonical_application_id?: string;
  artifact_id?: string;
  application?: GeneratedResume;
};
type CoverLetterResponse = {
  application_id?: string;
  packet_id?: string;
  cover_letter: CoverLetter;
  download_url: string;
};
type ApplicationFillResponse = {
  application_id: string;
  status: string;
  application_fill: true;
  automatic_submission_allowed: boolean;
  requires_final_submit: boolean;
  needs_user: unknown;
  selected_resume_artifact_id: string | null;
  handoff?: ApplicationFillHandoff;
  application?: CanonicalApplication;
};
type FillReceipt = ApplicationFillResponse & { company: string; role: string; portalUrl: string };

function sameCoverLetter(left: CoverLetter | undefined, right: CoverLetter): boolean {
  return left?.body === right.body
    && left.word_count === right.word_count
    && left.generated_at === right.generated_at
    && left.approved_at === right.approved_at
    && left.object_key === right.object_key
    && left.file_name === right.file_name
    && left.warnings.length === right.warnings.length
    && left.warnings.every((warning, index) => warning === right.warnings[index]);
}

function packetWithSubmission(packet: GeneratedResume, submission: SubmissionResponse): GeneratedResume {
  const displaySubmission = submissionResponseForDisplay(
    submission,
    submissionResponseDisplayContext(packet, packet.id),
  );
  const reviewUnchanged = packet.spec._review?.updated_at === displaySubmission.review.updated_at
    && submissionReviewPacketIdentity(packet.spec._review) === submissionReviewPacketIdentity(displaySubmission.review);
  const coverLetterField = submissionCoverLetterField(displaySubmission);
  const nextCoverLetter = nextCoverLetterValue(packet.spec._cover_letter, displaySubmission);
  const coverLetterUnchanged = nextCoverLetter === undefined
    ? packet.spec._cover_letter === undefined
    : sameCoverLetter(packet.spec._cover_letter, nextCoverLetter);
  const projectionUnchanged = JSON.stringify(packet.submission_projection)
    === JSON.stringify(displaySubmission.submission_projection);
  const authorityUnchanged = JSON.stringify(packet.submission_authority)
    === JSON.stringify(displaySubmission.submission_authority);
  const retrySafetyUnchanged = JSON.stringify(packet.retry_safety)
    === JSON.stringify(displaySubmission.retry_safety);
  const quarantineUnchanged = packet.submission_authority_quarantined
    === displaySubmission.submission_authority_quarantined;
  if (reviewUnchanged
    && coverLetterUnchanged
    && projectionUnchanged
    && authorityUnchanged
    && retrySafetyUnchanged
    && quarantineUnchanged) return packet;
  return {
    ...packet,
    submission_authority: displaySubmission.submission_authority,
    submission_projection: displaySubmission.submission_projection,
    retry_safety: displaySubmission.retry_safety,
    submission_authority_quarantined: displaySubmission.submission_authority_quarantined,
    cover_letter_download_url: coverLetterField.included && !coverLetterField.value
      ? undefined
      : packet.cover_letter_download_url,
    spec: {
      ...packet.spec,
      _review: displaySubmission.review,
      _cover_letter: nextCoverLetter,
    },
  };
}

/** A mutation response is causally newer even when a backend keeps review.updated_at unchanged. */
function packetWithDirectSubmission(packet: GeneratedResume, submission: SubmissionResponse): GeneratedResume {
  const displaySubmission = submissionResponseForDisplay(
    submission,
    submissionResponseDisplayContext(packet, packet.id),
  );
  const hydrated = packetWithSubmission(packet, displaySubmission);
  if (hydrated.spec._review === displaySubmission.review) return hydrated;
  return { ...hydrated, spec: { ...hydrated.spec, _review: displaySubmission.review } };
}

function packetForSubmissionDisplay(packet: GeneratedResume): GeneratedResume {
  const storedReview = packet.spec._review;
  if (!storedReview) return packet;
  const canonicalApplication = canonicalApplicationFromPacket(packet);
  const identity = canonicalApplication
    ? {
      canonicalApplicationId: canonicalApplication.id,
      packetId: canonicalApplication.legacy_generated_resume_id ?? null,
    }
    : { packetId: packet.id };
  const authority = submissionAuthorityEnvelopeFromUnknown(packet, {
    applicationId: packet.id,
    packetId: identity.packetId,
    ...(canonicalApplication
      ? { canonicalApplicationId: canonicalApplication.id }
      : {}),
  });
  const publicProjection: AuthoritativeSubmissionProjection = authority?.projection
    ?? quarantinedSubmissionAuthority({
      applicationId: packet.id,
      packetId: identity.packetId,
      ...(canonicalApplication
        ? { canonicalApplicationId: canonicalApplication.id }
        : {}),
    }).projection;
  const retrySafety = authority?.retrySafety ?? null;
  const authorityQuarantined = authority === null
    || packet.submission_authority_quarantined === true
    || (reviewClaimsSubmissionSent(storedReview)
      && !submissionProjectionIsConfirmed(publicProjection, identity));
  const review = reviewWithLists(reviewForSubmissionProjection(
    storedReview,
    publicProjection,
    identity,
  ));
  return {
    ...packet,
    submission_projection: publicProjection,
    retry_safety: retrySafety as SubmissionRetrySafety | null,
    submission_authority_quarantined: authorityQuarantined ? true : undefined,
    spec: { ...packet.spec, _review: review },
  };
}

function packetAuthorityForEmployerAction(
  packet: GeneratedResume,
  submission?: SubmissionResponse | null,
) {
  const exactPacket = packetForSubmissionDisplay(packet);
  const exactSubmission = submission
    ? submissionResponseForDisplay(
      submission,
      submissionResponseDisplayContext(exactPacket, exactPacket.id),
    )
    : null;
  const review = exactSubmission?.review ?? exactPacket.spec._review;
  return applicationPacketAuthorityState(
    exactSubmission?.submission_projection ?? exactPacket.submission_projection,
    { packetId: exactPacket.id },
    review,
    exactSubmission?.retry_safety ?? exactPacket.retry_safety,
    exactSubmission?.submission_authority_quarantined === true
      || exactPacket.submission_authority_quarantined === true,
  );
}

type ProfileIdentity = {
  full_name?: string;
  email?: string;
  resume_email?: string;
  school?: string;
  degree?: string;
  grad_date?: string;
  grad_year?: number;
  currently_enrolled?: boolean;
  coursework?: string[];
  school_location?: string;
};
type EducationProfileStatus = "loading" | "ready" | "failed";
type NewApplicationDraft = {
  company: string;
  role: string;
  portalUrl: string;
  jobDescription: string;
  /* Set only when the draft was opened from a posting on the jobs list. It is recorded on the
     application so that list can later mark this exact posting "Applied" instead of every posting
     sharing its company and title. Null for a hand-typed link, which points at no posting we
     watch, and the student can edit the company and role here anyway, so the id must not survive
     that and claim a row it no longer describes, which is why nothing below carries it over. */
  jobId: string | null;
  /** Existing Free Tracker row this paid artifact must attach to. Cleared if its identity changes. */
  canonicalApplicationId: string | null;
};

const EMPTY_APPLICATION_DRAFT: NewApplicationDraft = {
  company: "",
  role: "",
  portalUrl: "",
  jobDescription: "",
  jobId: null,
  canonicalApplicationId: null,
};

function applicationUpgradeFocusTarget(
  trigger: HTMLElement | null,
  preferredFallbackId: "application-ledger-heading" | "new-application-heading",
): HTMLElement | null {
  if (trigger?.isConnected) return trigger;
  for (const id of [preferredFallbackId, "application-ledger-heading", "new-application-heading", "applications-heading"]) {
    const candidate = document.getElementById(id);
    if (candidate instanceof HTMLElement && candidate.isConnected) return candidate;
  }
  return null;
}

const CHECKOUT_DRAFT_KEY = "litos_application_checkout_draft_v1";

function rememberCheckoutDraft(draft: NewApplicationDraft): void {
  window.sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
}

function readCheckoutDraft(): NewApplicationDraft | null {
  const raw = window.sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<NewApplicationDraft>;
    if (typeof value.company !== "string"
      || typeof value.role !== "string"
      || typeof value.portalUrl !== "string"
      || typeof value.jobDescription !== "string"
      || (value.jobId !== null && value.jobId !== undefined && typeof value.jobId !== "string")
      || (value.canonicalApplicationId !== null && value.canonicalApplicationId !== undefined && typeof value.canonicalApplicationId !== "string")) return null;
    return {
      company: value.company,
      role: value.role,
      portalUrl: value.portalUrl,
      jobDescription: value.jobDescription,
      jobId: value.jobId ?? null,
      canonicalApplicationId: value.canonicalApplicationId ?? null,
    };
  } catch {
    return null;
  }
}

function forgetCheckoutDraft(): void {
  window.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
}

function resumeGenerationActionKey(draft: NewApplicationDraft): string {
  if (draft.canonicalApplicationId) return `canonical:${draft.canonicalApplicationId}`;
  if (draft.jobId) return `job:${draft.jobId}`;
  return `manual:${draft.company.trim().toLowerCase()}\u0000${draft.role.trim().toLowerCase()}\u0000${draft.portalUrl.trim()}\u0000${draft.jobDescription.trim()}`;
}

/* A Suspense boundary over the useSearchParams read. DEFENSIVE, not required: this was first
   written down as "Next fails the build without it", and that was checked afterwards and is not
   true on the version this repo pins. Removing the wrapper with a wiped .next still builds, and
   this route is still prerendered.

   It stays because useSearchParams is the documented reason a route opts into client-side
   rendering, that behaviour has moved across Next majors, and the price is a fallback the page
   already showed while its own packets loaded. So the boundary is invisible here and it means a
   future upgrade cannot quietly turn the query read into a blank first paint. */
/**
 * The per-row Remove control.
 *
 * HIDDEN UNTIL HOVER OR FOCUS, and shown permanently while it is asking. The Tracker is a dense
 * list and a destructive-looking control on every row reads as a hazard, but it must still be
 * reachable by keyboard, which is why focus-within counts and why the button is never
 * `display:none` (a hidden button is not focusable, so a keyboard user could never reach it).
 *
 * IT ASKS FIRST. Not window.confirm, which is unstyled, blocks the thread and is suppressed in some
 * embedded contexts, and not a modal, which is far too much ceremony for one row. The row swaps in
 * a "Remove?" prompt with its own two buttons, which is reversible with one click and never steals
 * focus from the page.
 *
 * NOT RENDERED AT ALL for an application the employer already has. The server refuses those, and a
 * control that is always refused is worse than no control: offering it implies the student could
 * un-send something. `submission_state` and `tracker_state` are read from the canonical row, and
 * when there is no canonical row yet nothing is offered, because there is nothing to address the
 * request to.
 */
/**
 * The chip-strip Remove control, for the surface below `lg`.
 *
 * IT CANNOT COPY THE DESKTOP ONE, and the reason is the input device rather than the width. The row
 * control is hidden until hover, which on a touch screen means hidden forever: there is no hover
 * state to reveal it, so a hover-gated control on this strip would be unreachable by every user who
 * actually sees this strip. So it is always visible, as a small dismiss affordance in the chip's
 * corner.
 *
 * ALWAYS VISIBLE MEANS ALWAYS TAPPABLE, and this strip SCROLLS HORIZONTALLY, so a thumb dragging
 * the strip sideways passes over every one of these. That is what the confirm step is carrying here
 * - on the desktop row it guards against a misread, here it guards against a scroll that landed on
 * a target. A stray tap costs one more tap to dismiss and can never remove anything on its own.
 *
 * The confirm state COVERS THE CHIP rather than sitting inside it. A chip is at most 15rem wide and
 * already stacks role, company and status; adding two buttons inside would either overflow it or
 * force it to grow and shove the rest of the strip sideways under the user's finger.
 */
function TrackerChipRemove({ packet, pending, confirming, onAsk, onCancel, onConfirm }: {
  packet: GeneratedResume;
  pending: boolean;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!canRemoveFromTracker(canonicalApplicationFromPacket(packet))) return null;

  const subject = `${packet.job_context.role || "this application"} at ${packet.job_context.company || "this company"}`;
  if (confirming) {
    return (
      /* THE ROLE STAYS ON SCREEN. The overlay covers the chip, and a confirmation that hides what
         it is about is a worse prompt than none: this strip scrolls, the chips are small, and
         position is the only other cue to which application is being removed. Both buttons also
         carry the full subject as their accessible name, because "Remove" and "Cancel" alone
         announce nothing about what is being removed. */
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-inner bg-surface/95 px-2">
        <span className="max-w-full truncate text-[11px] text-muted">{packet.job_context.role || "This application"}</span>
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-label={`Confirm removing ${subject} from your tracker`}
            className="rounded-full px-2.5 py-1 text-[12px] font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
          >
            {pending ? "Removing" : "Remove"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label={`Keep ${subject} on your tracker`}
            className="rounded-full px-2.5 py-1 text-[12px] text-muted hover:bg-surface-alt disabled:opacity-60"
          >
            Cancel
          </button>
        </span>
      </span>
    );
  }
  return (
    /* THE TARGET IS 44px AND THE MARK IS 24px, deliberately not the same box.
     *
     * 24 satisfies WCAG 2.2 AA (2.5.8 Target Size Minimum) and misses the AAA and Apple-HIG figure
     * of 44, which is the one that matters to a thumb. Drawing a 44px circle on a chip that is only
     * about 173px wide would make the dismiss control compete with the role for the eye, so the
     * BUTTON is 44 and transparent and the circle inside it stays 24 and exactly where it was.
     *
     * THE OFFSETS ARE LOAD-BEARING, and the geometry is what keeps this from stealing taps. The
     * button is anchored `-right-1 -top-1` with its mark pinned to its own top-right corner, so the
     * visible circle lands on the identical pixels as before while the target grows INWARD, over
     * the chip's own top-right corner, rather than outward over its neighbours.
     *
     *   right: it overhangs 4px into an 8px `gap-2`, stopping 4px short of the next chip. A target
     *          centred on the mark instead would have needed 22px and eaten 14px of the neighbour,
     *          so tapping the next chip's left edge would open a remove prompt for the wrong one.
     *   top:   it overhangs 4px into the strip's own 10px `py-2.5`, so it neither clips nor gives
     *          the horizontally-scrolling strip a vertical scrollbar.
     *
     * The inward 40x40 does overlap where the role text truncates, and the confirm step is what
     * makes that trade acceptable: a mistap costs one tap to dismiss, while a target too small to
     * hit costs the ability to remove anything at all. That is the failure being fixed. */
    <button
      type="button"
      onClick={onAsk}
      aria-label={`Remove ${subject} from your tracker`}
      className="group/remove absolute -right-1 -top-1 flex h-11 w-11 items-start justify-end"
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-[13px] leading-none text-muted group-hover/remove:text-ink group-focus-visible/remove:outline group-focus-visible/remove:outline-2 group-focus-visible/remove:outline-offset-2 group-focus-visible/remove:outline-brand"
      >
        &times;
      </span>
    </button>
  );
}

function TrackerRowRemove({ packet, pending, confirming, onAsk, onCancel, onConfirm }: {
  packet: GeneratedResume;
  pending: boolean;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!canRemoveFromTracker(canonicalApplicationFromPacket(packet))) return null;

  if (confirming) {
    return (
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-surface px-2 py-1 shadow-sm">
        <span className="text-[11px] text-muted">Remove?</span>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
        >
          {pending ? "Removing" : "Yes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-full px-2 py-0.5 text-[11px] text-muted hover:bg-surface-alt disabled:opacity-60"
        >
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onAsk}
      aria-label={`Remove ${packet.job_context.role || "this application"} at ${packet.job_context.company || "this company"} from your tracker`}
      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] text-muted opacity-0 transition-opacity hover:bg-surface-alt hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
    >
      Remove
    </button>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<ShimmerRows rows={4} />}>
      <Applications />
    </Suspense>
  );
}

function requiresSensitiveQuestionReview(label: string, answer?: string | null): boolean {
  if (/\b(?:social security|ssn|driver'?s?\s*licen[sc]e)\b/i.test(label)) return true;
  if (!/\b(?:transgender|gender|sex|race|ethnic|hispanic|latino|veteran|military|disab|sexual orientation)\b/i.test(label)) return false;
  return !(answer ?? "").trim();
}

function Applications() {
  const { canUse, openUpgrade } = useBilling();
  const [packets, setPackets] = useState<GeneratedResume[] | null>(null);
  const [canonicalSelected, setCanonicalSelected] = useState<CanonicalApplication | null>(null);
  /* The canonical editor has its own identity because selectedIdRef deliberately names only the
     legacy packet workflow. A generated cover letter can resolve after the student edits its text,
     switches to another canonical application, or switches A -> B -> A. The id plus monotonically
     increasing draft revision distinguishes all three cases before any delayed response publishes. */
  const canonicalSelectedIdRef = useRef<string | null>(null);
  const canonicalCoverLetterEditorRevisionRef = useRef(0);
  const canonicalCoverLetterEditorDirtyRef = useRef(false);
  const canonicalCoverLetterHydrationApplicationRef = useRef<string | null>(null);
  const coverLetterRequestGenerationRef = useRef(0);
  const canonicalTailoringRequestGenerationRef = useRef(0);
  const [canonicalIdByPacketId, setCanonicalIdByPacketId] = useState<Record<string, string>>({});
  const resumeOperationIds = useRef(new Map<string, string>());
  const coverLetterOperationIds = useRef(new Map<string, string>());
  const [canonicalFillError, setCanonicalFillError] = useState<string | null>(null);
  /* A third errorSurface, not a reuse of canonicalFillError: that one is read only inside
     CanonicalApplicationDetail (line ~3689), which is not the screen the extension-recovery button
     lives on. Without this, fillApplication's "tracker" surface would set an error nothing on
     SubmissionScreen renders, so a blocked pop-up, a missing extension, or a failed /applications
     call would fail completely silently from her point of view - the button just does nothing. */
  const [submissionFillError, setSubmissionFillError] = useState<string | null>(null);
  const [canonicalCoverLetter, setCanonicalCoverLetter] = useState<CanonicalCoverLetterResponse | null>(null);
  const [canonicalCoverLetterBody, setCanonicalCoverLetterBody] = useState("");
  const [canonicalCoverLetterJd, setCanonicalCoverLetterJd] = useState("");
  const editCanonicalCoverLetterBody = useCallback((body: string) => {
    canonicalCoverLetterEditorRevisionRef.current += 1;
    canonicalCoverLetterEditorDirtyRef.current = true;
    setCanonicalCoverLetterBody(body);
  }, []);
  const editCanonicalCoverLetterJd = useCallback((jobDescription: string) => {
    canonicalCoverLetterEditorRevisionRef.current += 1;
    canonicalCoverLetterEditorDirtyRef.current = true;
    setCanonicalCoverLetterJd(jobDescription);
  }, []);
  const [canonicalCoverLetterEditorOpen, setCanonicalCoverLetterEditorOpen] = useState(false);
  const [canonicalCoverLetterLoading, setCanonicalCoverLetterLoading] = useState(false);
  const commitCanonicalSelection = useCallback((next: CanonicalApplication | null) => {
    const nextId = next?.id ?? null;
    if (canonicalSelectedIdRef.current !== nextId) {
      canonicalSelectedIdRef.current = nextId;
      canonicalCoverLetterEditorRevisionRef.current += 1;
      canonicalCoverLetterEditorDirtyRef.current = false;
      /* Selection and editor content commit atomically. Otherwise B renders A's textarea until
         B's cover-letter GET resolves, and Save can persist A's text under B in that window. */
      setCanonicalCoverLetter(null);
      setCanonicalCoverLetterBody("");
      setCanonicalCoverLetterJd("");
      setCanonicalCoverLetterEditorOpen(false);
      setCanonicalCoverLetterLoading(nextId !== null);
    }
    setCanonicalSelected(next);
  }, []);
  /* Keyed by canonical application id, the same shape as ApplicationPacket's STUB HYDRATION state,
     and for the same reason: canonicalSelected carries no key, so switching straight from one
     unmatched row to another must not show the previous row's hydration outcome while the new
     one's fetch is still in flight. See the effect below that sets this. */
  const [canonicalHydration, setCanonicalHydration] = useState<{ id: string; status: "loading" | "done" } | null>(null);
  const [currentMatches, setCurrentMatches] = useState<MonitoredJob[] | null>(null);
  /* The student's education block as GET /profile serves it today. Status is separate from the
     profile object because null is not safe: a missing comparison cannot approve a real send. */
  const [educationProfile, setEducationProfile] = useState<EducationProfile | null>(null);
  const [educationProfileStatus, setEducationProfileStatus] = useState<EducationProfileStatus>("loading");
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /* The packet being looked at in the read-only viewer, held as an ID and resolved against `packets`
     at render. Separate from selectedId on purpose, so opening the viewer cannot put the page onto
     the review flow for a packet the user only wanted to LOOK at.

     It stored the packet OBJECT until review. That was wrong in a way that defeated the feature:
     every update in this file replaces packets immutably (`setPackets((current) => current?.map(
     ... ? { ...item, spec: { ...item.spec, _review: result.review } } : item))`), so the array got a
     new object and the captured one went stale. The board and the autopilot countdown both stay
     mounted behind the viewer, so an autopilot send landing while it was open left the screen
     insisting "Built ..., not sent" about an application that had just gone out. Deriving means the
     viewer follows the same data as the page, and closes itself if the packet leaves the window. */
  const [revisitingId, setRevisitingId] = useState<string | null>(null);
  const locallyRevisitingIdRef = useRef<string | null>(null);
  const revisitingPacket = revisitingId ? (packets ?? []).find((item) => item.id === revisitingId) ?? null : null;
  /* Stable identity. The viewer's focus-trap effect keys on its onClose, and an inline arrow here
     gave it a new one on every render of this page: each parent commit tore the effect down and
     rebuilt it, which ran the cleanup's `previous?.focus?.()` and threw focus out of an open
     aria-modal dialog back onto the board behind it, then re-locked body scroll. A keyboard user
     reading the answers got yanked back to Close every time the autopilot ticked. */
  const openRevisit = useCallback((id: string) => {
    locallyRevisitingIdRef.current = id;
    setRevisitingId(id);
  }, []);
  const closeRevisit = useCallback(() => {
    locallyRevisitingIdRef.current = null;
    setRevisitingId(null);
  }, []);
  /* Which document ask the upload modal is open on, held as a KIND and resolved against the current
     submission at render, for the same reason revisitingId holds an id rather than a packet: the
     2.5s poll replaces `submission` wholesale, and a captured ask object would go stale under an
     open modal within one tick.

     The token is what makes a second press of the same row work. Without it, pressing "Add
     transcript" again after closing and reopening produces an identical state value, React bails out
     of the update, and the modal's key never changes, so a modal left on its "attached" state stays
     there and the second press looks dead. Same defect and same fix as focusQuestion above. */
  const [documentAsk, setDocumentAsk] = useState<{ kind: string; token: number } | null>(null);
  /* Stable identity, like closeRevisit: the modal's focus trap runs on [] deps and reads this
     through a ref, and an inline arrow here would rebuild the trap on every poll tick and throw
     focus out of an open dialog. */
  const closeDocumentAsk = useCallback(() => setDocumentAsk(null), []);
  const askForDocument = useCallback((kind: string) => {
    setDocumentAsk((current) => ({ kind, token: (current?.token ?? 0) + 1 }));
  }, []);
  // Mirrors selectedId for in-flight async work to compare against. State reads inside an awaited
  // callback are the value captured when the callback was created, which is exactly the stale value
  // a cross-packet race needs to go unnoticed.
  const selectedIdRef = useRef<string | null>(null);
  /* A packet id cannot identify the editor state. The applicant can edit packet A while A's save
     is in flight, or switch A -> B -> A before the response returns. In both cases the selected id
     is A again, but installing that response would erase newer work. Increment this synchronously
     for every selection and local resume mutation so an awaited save can prove it still owns the
     exact editor generation it sent. */
  const editorRevisionRef = useRef(0);
  /* Opening the exact audited PDF's editor is an explicit request to save this resume again, even
     when the applicant leaves its editable content unchanged. The editable copy deliberately has
     no `_contact`, so JSON equality cannot detect that the profile phone or location changed since
     this PDF was generated. Keep the intent packet-scoped and consume it only after PATCH returns
     the newly rendered canonical resume. */
  const resumeEditSaveApplicationRef = useRef<string | null>(null);
  /* The poll reads the submission it is about to overwrite. A ref, not the state value, so the
     poll callback does not have to re-subscribe on every submission update. */
  const submissionRef = useRef<SubmissionResponse | null>(null);
  /* `submissionRef` follows the selected application, so switching A -> B necessarily replaces
     it. Keep the latest full envelope for each application separately as well. This is the
     ordering source for a delayed answer response: an older response for A must not overwrite a
     newer A poll merely because B is selected, and returning to A must not reduce that full
     snapshot to the partial board seed. */
  const submissionSnapshotsRef = useRef<Map<string, SubmissionResponse>>(new Map());
  /* A response can keep the same updated_at even after an accepted answer mutation. A poll that
     started before that write must not restore its blank question snapshot afterward. */
  const submissionMutationGenerationRef = useRef(0);
  /* A refused answer can carry the review written by a concurrent run. Keep its publication
     ordered per application too: unlike updated_at, this generation advances when two different
     snapshots share a timestamp, and unlike the selection revision it notices a newer same-screen
     poll. A delayed 202 can therefore never replace the more recent application the user sees. */
  const submissionPublicationGenerationsRef = useRef<Map<string, number>>(new Map());
  const actionStartedFor = useRef<string | null>(null);
  const capturedSubmissionIds = useRef(new Set<string>());
  /* One browser proof for one immutable server audit. Application ID alone is not enough: a resume,
     answer, PDF, or JD mutation must make the proof unusable even when the row ID stays the same. */
  const [packetEvidence, setPacketEvidence] = useState<PacketEvidenceSession | null>(null);
  const packetEvidenceRef = useRef<PacketEvidenceSession | null>(null);
  /* One compatibility refresh per exact stored stale report. Polls can replace the packet object
     while recovery is in flight, so object identity cannot be the key. */
  const persistedPacketAuditRecoveryRef = useRef<string | null>(null);
  const [spec, setSpec] = useState<ResumeSpec | null>(null);
  const editResumeSpec = useCallback((next: ResumeSpec) => {
    editorRevisionRef.current += 1;
    setSpec(next);
  }, []);
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  /* Which question the answers screen should open on, set by the Your turn row that was pressed.
     Null for "Check the answers", which is a request to read the whole list. The token is what
     makes pressing the SAME row twice focus twice: without it the effect's dependency never
     changes on the second press and the second click looks dead, which is the defect this whole
     change exists to remove. */
  const [focusQuestion, setFocusQuestion] = useState<{ id: string; token: number } | null>(null);
  /* The questions she pressed CONFIRM on, per application, until a save spends them or Back
     abandons them. A ref rather than state because nothing renders from it - it exists so
     saveReviewedAnswers can flag exactly these questions on the request, which is the only way an
     unedited confirmation reaches the row (see ReviewAnswerSaveQuestion.confirmed).

     A MAP AND NOT ONE SLOT, because a slot made packet B's confirm erase packet A's. Confirm on A,
     switch, confirm on B, come back and save A: the slot held B, A posted no flag, and the CONFIRM
     ask re-rendered on A - the loop this whole change removes, reintroduced for anyone juggling two
     packets. Each application's presses live and die under its own key. */
  const confirmIntentsRef = useRef<Map<string, Set<string>>>(new Map());
  /* The one line at the top of the Apply questions screen, and the marker that the pre-script is
     what put us there. Empty on every other route into the answers editor, which keeps that screen
     exactly as it was for "Check the answers" and for a stalled run.

     It also decides what Save does. From a stalled run, Save means "send it again with these
     answers" and goes straight to prepareApplication, which is what that button has always done.
     From Apply it must not: she has not read the resume yet, and starting a submission because she
     answered a question would take a screen away from her rather than give her one. */
  const [prescriptNote, setPrescriptNote] = useState("");
  const [prescriptMetadata, setPrescriptMetadata] = useState<ApplicationQuestionMetadataBlocker[]>([]);
  const [prescriptLookaheadIssue, setPrescriptLookaheadIssue] = useState<{ jobId: string; message: string } | null>(null);
  const [prescriptRetrying, setPrescriptRetrying] = useState(false);
  const clearPrescriptState = useCallback(() => {
    setPrescriptNote("");
    setPrescriptMetadata([]);
    setPrescriptLookaheadIssue(null);
    setPrescriptRetrying(false);
  }, []);
  const [screen, setScreen] = useState<Screen>("review");
  /* The route the applicant chose, available synchronously to a poll that started on the prior
     screen. React state alone is one render behind the click: a submission fetch begun on portal
     can resolve after Review and fill moves to review, see the old portal closure, and route the
     applicant straight back to the same blocker card. Every screen write goes through
     moveToScreen, so this ref and the rendered state have one writer and cannot drift. */
  const screenRef = useRef<Screen>("review");
  /* WHICH action put us on the "submitting" screen, which the status alone cannot tell us.
     The progress screen says one of two things, and the difference is the whole point of it:
     preparing the form is "nothing is sent yet", and approving is "sending it now". It read that
     off `submission.review.status`, but during an approve the status is still
     `ready_for_final_approval` for the entire duration of the request, because the only thing that
     updates it is the response we are waiting for. So the screen spent the whole send promising
     that nothing was being sent, which is the one moment the reassurance must not be wrong. */
  const [submittingPhase, setSubmittingPhase] = useState<"preparing" | "sending">("preparing");
  /* True from the moment "Send it" is pressed until the approve request settles.
     This is the guard on a REAL application going to a REAL employer twice, and it exists because
     the 2.5s submission poll is running the whole time. During an approve the server's status is
     still `ready_for_final_approval` (that is the premise of this whole change), and
     screenForStatus maps that to "portal", so the first poll tick used to take the student off the
     sending screen and back to SubmissionScreen with a live "Send it" button, roughly 2.5 seconds
     into every send that lasts longer than that. Nothing guarded a second press.
     A ref rather than state on purpose: it has to be readable synchronously by the poll and by a
     second click that lands in the same tick, before any re-render. */
  /* The application currently being approved, not a bare boolean. Page-level flags meant that
     sending A greyed out "Send it" on B with no explanation, and the guard that drops a second
     press would have dropped a legitimate press on a different application. */
  const approveInFlight = useRef<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  /* When the student pressed "Send it", so the progress clock measures the SEND rather than the
     review. It was anchored to `review.updated_at`, which is stamped when preparation finished, so
     a student who spent six minutes reading the packet before approving saw "6m 00s elapsed" and
     the "start the application again" milestone the instant their send actually began. */
  const [approveStartedAt, setApproveStartedAt] = useState<string | null>(null);
  /* Same idea for "Fill the form": the selected packet may still carry the timestamp from an older
     ready state while the fresh submit-request is in flight. The server now clears stale run fields
     too, but the screen is entered before that response returns, so the UI needs its own local
     click-time anchor. */
  const [prepareStartedAt, setPrepareStartedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /* The Review-answers Save, per application rather than as a page-level flag, for the same reason
     approvingId is: saving on A must not grey out the button on B. A ref beside the state because a
     second click can land in the same tick, before any re-render, and two writes of the same answers
     race each other's optimistic row check for no gain. */
  const savingAnswersRef = useRef<Set<string>>(new Set());
  const [savingAnswerIds, setSavingAnswerIds] = useState<ReadonlySet<string>>(() => new Set());
  const [directAnswerPasses, setDirectAnswerPasses] = useState<ReadonlyMap<string, DirectAnswerPass>>(() => new Map());
  const [directAnswerProgresses, setDirectAnswerProgresses] = useState<ReadonlyMap<string, DirectAnswerProgress>>(() => new Map());
  const [directAnswerFailures, setDirectAnswerFailures] = useState<ReadonlyMap<string, DirectAnswerFailure>>(() => new Map());
  const [directAnswerDrafts, setDirectAnswerDrafts] = useState<ReadonlyMap<string, ReadonlyMap<string, DirectAnswerDraft>>>(() => new Map());
  const [directAnswerAnnouncement, setDirectAnswerAnnouncement] = useState<{ token: number; message: string } | null>(null);
  useEffect(() => {
    if (!directAnswerAnnouncement) return;
    const timer = window.setTimeout(() => setDirectAnswerAnnouncement(null), 1_200);
    return () => window.clearTimeout(timer);
  }, [directAnswerAnnouncement]);
  /* Ticks in flight on the Your turn panel, keyed application:row. The ref is the synchronous
     guard (a double click lands before any re-render, exactly the reason savingAnswersRef exists)
     and the state is its visible half, the same ref+state pairing savingAnswersId documents: the
     state disables the row's checkbox while its own write is out, so a slow round trip reads as
     busy instead of dead. Per row, not per application, because ticking two different rows back to
     back is the ordinary way the panel is used. Lazy ref init, so the Set is not rebuilt and
     discarded on every render of this component. */
  const attentionTickRef = useRef<Set<string> | null>(null);
  const [attentionTicking, setAttentionTicking] = useState<ReadonlySet<string>>(() => new Set());
  const [packetAuditBusy, setPacketAuditBusy] = useState(false);
  const packetAuditInFlight = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* THE POLL'S OWN BANNER, AND WHY IT CANNOT SHARE ONE WITH THE STUDENT'S ACTIONS.
   *
   * `refreshSubmission` used to end with a bare `setError(null)` on every successful tick, for a
   * good reason it stated out loud: one 502 during a multi-minute run otherwise pins "Could not
   * refresh portal status" over a run that has since succeeded. The trouble is that `error` is also
   * where every REFUSAL to an action the student just took lands, and the poll cannot tell the two
   * apart.
   *
   * That is the second half of the Cresta finding. The approve 409 was caught and displayed exactly
   * as written; the poll runs every 2.5s while the screen is "portal" or "submitting", and its next
   * successful tick wiped it. The server said "That took too long and timed out. Start the
   * application again.", the banner said it for under two and a half seconds, and the student
   * reasonably reported that clicking Send it did nothing at all.
   *
   * Two channels, so a self-healing transient can still clear itself without erasing an answer
   * nobody else is going to repeat. `error` wins the render when both are set: a refusal to
   * something she did outranks news about the connection. */
  const [pollError, setPollError] = useState<string | null>(null);
  /* The one poll failure that must OUTLIVE the tick that raised it, and the last silent member of
     the dead-button class ("a dead button with no console error is a swallowed 409 in the network
     tab", measured live 2026-08-19 and 2026-08-20). When the acknowledged packet revalidation is
     refused (see refreshSubmission), the server wrote a sentence for the applicant - the packet
     moved, a run claimed the row, the PDF aged out - and the catch used to throw it away while the
     evidence it guarded vanished, so the send gate closed and the controls changed shape with no
     words anywhere on screen.

     It rides the POLL'S channel, not `error`: nobody pressed anything, this is news about the
     packet's state. But it cannot ride it the ordinary way, because the refusal clears the very
     evidence whose revalidation raised it, so the NEXT tick has nothing left to revalidate,
     reports a clean poll, and the unconditional banner-clear at the end of the tick would wipe
     the sentence after one 2.5s round: the Cresta finding again, rebuilt one layer down. The ref
     keys the sentence to the application it is about; a clean revalidation, a fresh audit, or
     switching packets retires it. Only ApiError refusals land here - a dropped connection has no
     server sentence, and the outer poll catch already owns "We lost sight of the form". */
  const packetRevalidationRefusal = useRef<{ applicationId: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* Null means the localhost-only fixture gate has not resolved yet. Treating that as false let
     authenticated effects fire during the first render of a QA page, and a 401 redirected the
     fixture to /login before it could verify anything. */
  const [qaMode, setQaMode] = useState<boolean | null>(null);
  const [creating, setCreating] = useState<"fill" | "tailor" | null>(null);
  /* Remove-from-Tracker, held per row id rather than as a boolean so a second row cannot inherit
     the first row's confirm prompt when the list re-renders. */
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingApplicationId, setRemovingApplicationId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const managedPrepareRef = useRef<string | null>(null);
  const [extractingJd, setExtractingJd] = useState(false);
  const [showNewApplication, setShowNewApplication] = useState(false);
  const [newApplication, setNewApplication] = useState(EMPTY_APPLICATION_DRAFT);
  const [fillReceipt, setFillReceipt] = useState<FillReceipt | null>(null);
  /* ISSUE-040: the composer's own refusal, kept OUT of the page-level `error` on purpose.
     "Fill in all four boxes first." used to render in the banner above the composer, which on a
     723px viewport measured y = -281 while the button that raised it sat at y = 434: announced to a
     screen reader, invisible to everyone else, because the job description textarea alone is ~320px
     tall. It now renders beside the button and names the boxes it is about, so it is perceivable
     from where the action was taken without any scrolling or animation. One alert, not two.

     ISSUE-043 widened this from validation to EVERY message either composer button raises. The
     rule, drawn once so later call sites do not have to re-argue it:

       A message caused by pressing a button INSIDE the composer belongs beside that button.
       A message about the state of the PAGE belongs in the page banner.

     So the composer owns both of its buttons end to end: "Make my resume" (its two validation
     guards and the failure of /profile, /profile/application and /resume/generate) and "Read job"
     (its two URL guards and the failure of /jobs/extract). The banner keeps what the student did
     not ask for and cannot answer from the composer: the applications list failing to load, the
     preferences fetch failing, the autopilot sending on its own, and every control on the review
     screen, which is a different surface with its own geometry.

     Measured on production before the fix, with /resume/generate returning 500 on a filled form:
     the banner sat at y = -126 on a 1280x723 viewport and y = -195 on a 375x812 one while the
     button was on screen in both, and the failure ALSO moved scrollY (345 -> 413, 560 -> 628),
     pushing the banner further out of reach than the ISSUE-040 case it replaced.

     `fields` stays empty for anything the server did. A 500 is not the student mistyping, so
     marking the four boxes aria-invalid would be a lie about their input; an empty array renders
     the sentence and marks nothing, which `invalid()` in NewApplicationPanel gives for free.

     `at` is which of the composer's two buttons is being answered, and it exists because "inside
     the composer" was not close enough. The first cut of ISSUE-043 sent Read job's messages to the
     generate row, and the harness measured them at y = 979 on a 375x812 viewport with the Read job
     button at y = 554: off screen in the other direction, the same defect upside down. The two
     buttons are ~440px apart, so the composer needs two slots and not one. Exactly one is ever
     live, because `at` holds one value. */
  const [composerRefusal, setComposerRefusal] = useState<{ message: string; fields: ApplicationDraftField[]; at: ComposerSlot; needsExtension: boolean } | null>(null);
  /* One announcement, never two. The page banner and this alert are both live regions, so leaving a
     stale `error` up while raising a refusal makes a screen reader read the old problem and the new
     one. Everything that speaks for the composer goes through here and clears the other channel.

     KNOWN ASYMMETRY, accepted rather than overlooked: setError(null) is unconditional, so the
     composer always wins over the page. If the list failed to load and the banner reads "We could
     not load your applications. Reload the page.", the next composer press erases a fact that is
     still true. That is the opposite of the principle argued two comments up, applied in one
     direction only. It is accepted because every page-level error on this screen is reload advice
     the student can act on later, and the alternative is two live regions firing on a single press,
     which is the louder failure. If a page-level error ever appears here that is NOT reload advice,
     revisit this line rather than adding a second alert. */
  /* `needsExtension` is decided HERE, beside the message it is about, rather than by the note that
     renders it. The note's paragraph is pinned verbatim by two regression tests that also cap this
     file at exactly one read of the refusal's message text - a second read there to answer "does
     this refusal send her to the store?" would have broken that cap without changing a word she
     reads. Deciding it at the source keeps the cap intact and means every present and future
     refuseInComposer caller is covered without remembering to opt in. */
  const refuseInComposer = useCallback((at: ComposerSlot, message: string, fields: ApplicationDraftField[]) => {
    setError(null);
    setComposerRefusal({ message, fields, at, needsExtension: messageAsksForTheExtension(message) });
  }, []);
  /* What the server said when she pressed Send it, held against the packet it was said about.
   *
   * Keyed by application id for the same reason the approve handler re-checks `selectedIdRef`: the
   * packet switcher renders above this screen, so a refusal about Cresta must not be left sitting
   * under the Send button for Redwood. Render-time comparison rather than an effect, so switching
   * away is enough to retire it. */
  const [sendRefusal, setSendRefusal] = useState<{ applicationId: string; message: string; issues: string[] } | null>(null);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  /* A stale metadata screen needs a new employer-form read, but it must not silently carry edits
     the applicant has not saved. The ref closes the same-tick double-click gap; the id keeps the
     busy state attached to the packet that started it when the application switcher is used. */
  const metadataRefreshRef = useRef<string | null>(null);
  const [metadataRefreshId, setMetadataRefreshId] = useState<string | null>(null);
  const [metadataRefreshError, setMetadataRefreshError] = useState<{ applicationId: string; message: string } | null>(null);
  const refuseSend = useCallback((applicationId: string, message: string, issues: string[] = []) => {
    // One live region at a time, the rule refuseInComposer already sets on this screen.
    setError(null);
    setSendRefusal({ applicationId, message, issues });
  }, []);
  const [pendingJob, setPendingJob] = useState<MonitoredJob | null>(null);
  const resolvedJobParam = useRef<string | null>(null);
  const [submission, setSubmissionState] = useState<SubmissionResponse | null>(null);
  /* THE ONE WRITER, and it is a wrapper rather than the raw setter on purpose.
   *
   * Everything on the portal, questions and progress screens reads its review out of this state,
   * and lib/api.ts declares that review's `questions`, `skipped_reasons` and `edited_terms` as
   * required arrays. The wire does not: a packet that never reached a form has no discovered
   * questions to store, and /resume/history hands back exactly what was stored. Reported on
   * 2026-08-11 from a real account: every Tracker row reading NEEDS YOU threw on click and took the
   * whole page into app/dashboard/error.tsx, while the single SENT row opened fine, because
   * `submitted` is the one status that routes to SubmissionReceipt instead of to SubmissionScreen
   * and SubmissionReceipt reads no list. One sparse packet made every application on the page
   * unopenable.
   *
   * There are eight setSubmission call sites (seed on select, poll, approve, prepare, restart, the
   * QA branch, and two cover-letter writers) and more than a dozen readers. Guarding the readers
   * means guarding all of them forever; guarding the writer is one line that cannot be forgotten by
   * the next reader added. reviewWithLists returns the review UNCHANGED when it is already whole,
   * so a poll that confirms the current state still costs nothing.
   *
   * It defaults lists and nothing else. See features/applications/domain/application-review.ts for
   * why that is the only safe thing to default. */
  const setSubmission = useCallback((update: SetStateAction<SubmissionResponse | null>) => {
    setSubmissionState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      if (!next) return next;
      if (qaMode === true) {
        const review = reviewWithLists(next.review);
        return review === next.review ? next : { ...next, review };
      }
      return submissionResponseForDisplay(next, { packetId: next.application_id });
    });
  }, [qaMode]);
  const [coverLetterBody, setCoverLetterBody] = useState("");
  const packetCoverLetterEditorRevisionRef = useRef(0);
  const editPacketCoverLetterBody = useCallback((body: string) => {
    packetCoverLetterEditorRevisionRef.current += 1;
    setCoverLetterBody(body);
  }, []);
  const [coverLetterDownloadUrl, setCoverLetterDownloadUrl] = useState<string | null>(null);
  const [coverLetterBusy, setCoverLetterBusy] = useState(false);
  /* ?state= IS the filter. Not a seed for it, the thing itself.
     Home's Overview metrics link here with it, and it has to work on the path a student actually
     takes, which is a click.

     This was `useState(() => applicationFilterFromSearch(window.location.search))`, under a comment
     saying it was read once at mount. Both halves of that were the bug (ISSUE-042). Measured in a
     driven browser against a stubbed backend: clicking Home's "5 stopped for you" banner runs this
     component's initialiser while `window.location.pathname` is still `/dashboard` and its search
     is still empty, because the App Router renders the incoming route inside a transition BEFORE it
     commits the new URL. So the read resolved to "all". Being a first-mount-only read, nothing
     re-ran it when the URL did land a moment later. A hard load worked, because there the URL is
     already correct when the component first renders, which is exactly why pasting the link and
     reloading both looked fine while all four Home controls were dead.

     useSearchParams is the router's own view of the query, so it is correct during that transition
     and it UPDATES, which a first-mount read cannot.

     THE URL IS THE SINGLE SOURCE OF TRUTH, deliberately, rather than mirroring the param into local
     state. Mirroring needs a "last seen param" to tell an arriving ?state= apart from a value the
     student just chose, and getting that wrong in either direction is silent: too eager and the
     select is stomped back on every render, too lazy and the deep link stops working again. There
     is no second copy to disagree here. It also buys three things the mirrored version cannot: the
     filtered view is shareable, it survives a reload, and Back returns to it. */
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const applicationFilter = applicationFilterFromSearch(searchParams.toString());
  const requestedApplicationId = searchParams.get("application");
  const requestedApplicationIntent = searchParams.get("intent");
  const applicationRequestKey = JSON.stringify([requestedApplicationId, requestedApplicationIntent]);
  /* The actionable direct-link request that has actually loaded and selected. This deliberately
     trails requestedApplicationId during a query-only navigation, which is the short window where
     the prior packet's controls must disappear. It does not pin later ledger switching to the URL. */
  const [resolvedActionableRequestId, setResolvedActionableRequestId] = useState<string | null>(null);
  /* A ledger press selects from data already in memory, then gives the same identity to the URL.
     The history effect still refreshes that packet, but this ref tells it not to select the same
     row a second time and reset the screen after the student has already started working. */
  const locallyOpenedRequestRef = useRef<{ id: string; revision: string; routeCommitted: boolean } | null>(null);
  const applicationBootstrapGenerationRef = useRef(0);
  const initializedQaScenarioRef = useRef<string | null>(null);
  const applicationsMountedRef = useRef(true);
  const committedApplicationRequestKeyRef = useRef(applicationRequestKey);
  const pendingApplicationFocusRef = useRef(false);
  const pendingApplicationLandingFocusRef = useRef<{ rowId: string | null } | null>(null);
  const applicationTaskHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [openingApplicationId, setOpeningApplicationId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [applicationQuery, setApplicationQuery] = useState("");

  useLayoutEffect(() => {
    applicationsMountedRef.current = true;
    return () => {
      applicationsMountedRef.current = false;
    };
  }, []);

  function beginCanonicalRequest(applicationId: string, channel: CanonicalRequestScope["channel"]): CanonicalRequestScope {
    const generationRef = channel === "cover-letter"
      ? coverLetterRequestGenerationRef
      : canonicalTailoringRequestGenerationRef;
    return {
      applicationId,
      editorRevision: canonicalCoverLetterEditorRevisionRef.current,
      requestGeneration: ++generationRef.current,
      channel,
    };
  }

  function canonicalRequestOwnsLifecycle(scope: CanonicalRequestScope): boolean {
    const generation = scope.channel === "cover-letter"
      ? coverLetterRequestGenerationRef.current
      : canonicalTailoringRequestGenerationRef.current;
    return applicationsMountedRef.current && generation === scope.requestGeneration;
  }

  function canonicalRequestMayPublish(scope: CanonicalRequestScope): boolean {
    return canonicalRequestOwnsLifecycle(scope)
      && canonicalSelectedIdRef.current === scope.applicationId
      && canonicalCoverLetterEditorRevisionRef.current === scope.editorRevision;
  }

  function beginPacketCoverLetterRequest(applicationId: string): PacketCoverLetterRequestScope {
    return {
      applicationId,
      editorRevision: packetCoverLetterEditorRevisionRef.current,
      requestGeneration: ++coverLetterRequestGenerationRef.current,
    };
  }

  function packetCoverLetterRequestOwnsLifecycle(scope: PacketCoverLetterRequestScope): boolean {
    return applicationsMountedRef.current
      && coverLetterRequestGenerationRef.current === scope.requestGeneration;
  }

  function packetCoverLetterRequestMayPublish(scope: PacketCoverLetterRequestScope): boolean {
    return packetCoverLetterRequestOwnsLifecycle(scope)
      && selectedIdRef.current === scope.applicationId
      && packetCoverLetterEditorRevisionRef.current === scope.editorRevision;
  }
  /* Writes the choice back to the URL, so the select and the deep link move the same thing.
     Everything removes the parameter rather than writing state=all: a URL that says nothing is
     what a plain visit looks like, and this is also what closes the ledger section.
     scroll: false because this is a filter, not a navigation; the student is looking at the list
     they just filtered and must not be thrown to the top of the page. */
  const setApplicationFilter = useCallback((next: ApplicationFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("state");
    else params.set("state", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);
  const [applicationSort, setApplicationSort] = useState<ApplicationSort>("next");

  const closeNewApplication = useCallback(() => {
    setShowNewApplication(false);
    setPendingJob(null);
    // A refusal about a form that is no longer open would greet the next student to open it.
    setComposerRefusal(null);

    replaceClosedComposerUrl(
      window.location,
      (data, unused, url) => window.history.replaceState(data, unused, url),
    );
  }, []);

  /* Mirror `submission` into the ref the poll reads. An effect keeps it correct for every path;
     approveFinalSubmission ALSO assigns it synchronously, because the window this guard closes is
     between the approve resolving and this effect running, and a poll can land inside it. */
  useEffect(() => {
    submissionRef.current = submission;
    if (!submission || submission.partial) return;
    const remembered = submissionSnapshotsRef.current.get(submission.application_id);
    submissionSnapshotsRef.current.set(
      submission.application_id,
      nextSubmissionState(remembered, submission),
    );
  }, [submission]);

  useEffect(() => {
    packetEvidenceRef.current = packetEvidence;
  }, [packetEvidence]);

  const captureCompletedSubmission = useCallback((result: SubmissionResponse, source: string) => {
    const exact = submissionResponseForDisplay(result, { packetId: result.application_id });
    if (exact.submission_authority_quarantined === true
      || !confirmedProjectionForPacket(exact.submission_projection, {
        packetId: exact.application_id,
        retrySafety: exact.retry_safety ?? null,
      })
      || capturedSubmissionIds.current.has(exact.application_id)) return;
    capturedSubmissionIds.current.add(exact.application_id);
    track("application_submission_completed", { source });
  }, []);

  /* `scrollToTop: false` for the one caller that is navigating TO something rather than to a new
     screen: a Your turn row opens the answers editor on the question that was pressed, and the top
     of the page is not where that question is. Racing the two was tried and is not sound, because
     this scroll is scheduled in a requestAnimationFrame and rAF does not run at all in a hidden
     tab, so the winner differed between a real browser and an automated one. */
  const moveToScreen = useCallback((next: Screen, options: { scrollToTop?: boolean } = {}) => {
    // Publish the navigation before React commits it so an already-running poll cannot undo it.
    screenRef.current = next;
    runDashboardTransition(() => setScreen((current) => current === next ? current : next));
    if (options.scrollToTop !== false) window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  /* A stale packet refusal is a route transition, not a red failure banner. The server is still
     fail-closed: this takes a new audit, clears the old acknowledgement, and sends the applicant
     back to the exact packet review. It never acknowledges that audit and never retries the send.
     The machine code decides whether this path runs, so changing applicant-facing copy cannot turn
     an unrelated 409 into a packet mutation. */
  const recoverPacketAuditReview = useCallback(async (applicationId: string, reason: unknown): Promise<boolean> => {
    if (!packetAuditReviewRecoveryCode(reason) && !historicalPacketAuditStaleMessage(reason)) return false;
    /* A refusal for packet A can arrive after the switcher moved to B. Treat the coded refusal as
       handled, but do not clear B's evidence, route, questions, or banners. This guard must precede
       every write below, including the synchronous refs. */
    if (!packetAuditRecoveryMayCommit(selectedIdRef.current, applicationId)) return true;
    packetEvidenceRef.current = null;
    setPacketEvidence(null);
    packetRevalidationRefusal.current = null;
    setError(null);
    setPollError(null);
    setSendRefusal(null);
    moveToScreen("review");
    setNotice("Litos is refreshing the exact packet for review.");
    try {
      const audit = await api<PacketAuditResponse>(`/applications/${applicationId}/packet-audit`, { method: "POST" });
      if (!packetAuditRecoveryMayCommit(selectedIdRef.current, applicationId)) return true;
      const raw = await api<SubmissionResponse>(`/applications/${applicationId}/submission`);
      if (!packetAuditRecoveryMayCommit(selectedIdRef.current, applicationId)) return true;
      const server = submissionResponseForDisplay(raw, { packetId: applicationId });
      const canonical = publishSubmissionEnvelope(
        submissionRef,
        submissionAfterPacketAudit(server, submissionRef.current, audit),
        "direct",
      );
      const auditedQuestions = canonical.review.questions;
      const freshEvidence = spec
        ? {
          applicationId,
          response: audit,
          specJson: JSON.stringify(spec),
          questionsSnapshot: packetQuestionsSnapshot(auditedQuestions),
          pdfVerified: false,
          acknowledged: false,
          serverRevalidatedAt: null,
        }
        : null;
      packetEvidenceRef.current = freshEvidence;
      setPacketEvidence(freshEvidence);
      setQuestions(auditedQuestions);
      setSubmission(canonical);
      setPackets((current) => current?.map((packet) => {
        if (packet.id !== applicationId) return packet;
        return { ...packetWithDirectSubmission(packet, canonical), download_url: audit.pdf.download_url };
      }) ?? current);
      setNotice("The current exact packet is ready. Review its PDF, then continue.");
    } catch {
      if (selectedIdRef.current !== applicationId) return true;
      /* The recovery itself can lose another optimistic race. Keep the gate closed and leave one
         neutral route to run a fresh audit, without pinning the sentence the user cannot act on. */
      packetEvidenceRef.current = null;
      setPacketEvidence(null);
      setNotice("This application is paused for a fresh exact-packet review.");
    }
    return true;
  }, [moveToScreen, setSubmission, spec]);

  // Lifted out of MatchScore so the gap list and BOTH panes' highlighting read one /jd-match
  // result. The JD pane used to highlight against resumeTerms, every content word anywhere in the
  // resume, which lit up "backed", "services" and "deployed" in the same blue as "PostgreSQL" and
  // so told the student nothing.
  const [matchResult, setMatchResult] = useState<JdMatchResponse | null>(null);
  // What the last accept actually did, so the student is told and can undo it. Accepting used to
  // mutate the resume with no feedback at all, and could silently no-op or silently delete.
  const [lastApply, setLastApply] = useState<{ outcome: ApplyOutcome; previous: ResumeSpec } | null>(null);

  /**
   * Put one of the student's own stored bullets onto the tailored resume.
   *
   * All the judgement lives in the applications domain, which is pure and tested. This only records
   * what happened so the UI can report it and offer an undo.
   */
  const acceptBankVariant = useCallback((org: string, variant: string) => {
    editorRevisionRef.current += 1;
    setSpec((current) => {
      if (!current) return current;
      const { spec: next, outcome } = applyBankVariant(current, { org, variant });
      setLastApply({ outcome, previous: current });
      return next;
    });
  }, []);

  const undoLastApply = useCallback(() => {
    editorRevisionRef.current += 1;
    setLastApply((last) => {
      if (last) setSpec(last.previous);
      return null;
    });
  }, []);

  const selectPacket = useCallback((incoming: GeneratedResume) => {
    clearPrescriptState();
    /* A READY envelope is the named exception to the refusal below, not a hole in it.
     *
     * The guard's own comment says "an explicit packet action first restores the linked packet's
     * legacy route id", and clicking a row the Tracker has labelled READY is that explicit action.
     * sendableLinkedPacketFromCanonicalEnvelope performs the restore and returns null for every other
     * shape, so a tracker-only row, an unready row, or a row on a portal the SERVER did not mark
     * supported still takes the attended path.
     *
     * It gates on reviewCanBeSent - the same predicate the Ready filter uses - so the send this
     * permits is exactly what the label promises. Before this, the Tracker showed READY rows whose
    * only reachable action was the attended handoff, which is a label promising something the screen
     * could not do. */
    const sendable = sendableLinkedPacketFromCanonicalEnvelope(incoming);
    const packetCandidate = sendable ?? incoming;
    const packet = qaMode === true ? packetCandidate : packetForSubmissionDisplay(packetCandidate);
    const canonical = sendable ? null : canonicalApplicationFromPacket(packet);
    /* Reopening the row already on screen must not erase its pending explicit save: the current
       row is still reachable through the application switcher and openApplication calls this
       function again. A genuinely different packet, or leaving for canonical detail, abandons the
       editor session. */
    if (canonical || selectedIdRef.current !== packet.id) resumeEditSaveApplicationRef.current = null;
    if (canonical) {
      // Canonical Tracker envelopes must never be sent to the legacy review, audit, or submission
      // endpoints. Their own detail keeps the real portal handoff and retry control available. An
      // explicit packet action first restores the linked packet's legacy route id.
      selectedIdRef.current = null;
      editorRevisionRef.current += 1;
      packetCoverLetterEditorRevisionRef.current += 1;
      runDashboardTransition(() => {
        setSelectedId(null);
        commitCanonicalSelection(canonical);
        setCanonicalFillError(null);
        setSubmissionFillError(null);
        setSpec(null);
        setQuestions([]);
        setSubmission(null);
        setPacketEvidence(null);
        setMatchResult(null);
        setError(null);
        setPollError(null);
        setSendRefusal(null);
        setNotice(null);
      });
      return;
    }
    // Updated synchronously, before any state commit, so an in-flight poll comparing against it
    // sees the new selection immediately rather than one render later.
    selectedIdRef.current = packet.id;
    editorRevisionRef.current += 1;
    packetCoverLetterEditorRevisionRef.current += 1;
    const rememberedSubmission = submissionSnapshotsRef.current.get(packet.id) ?? null;
    const selectedReview = rememberedSubmission?.review ?? packet.spec._review;
    const status = selectedReview?.status;
    const historicalPacketAuditStale = historicalPacketAuditStaleMessage(selectedReview);
    /* Entering a packet starts its story over, and that includes a standing revalidation refusal:
       the sentence described evidence this entry no longer holds, and left in the ref it would
       re-pin itself onto the banner at the next poll tick. */
    packetRevalidationRefusal.current = null;
    /* A ready packet still has one mandatory stop before the employer send: the posting, exact
       resume, evidence colours and gap list. Routing it straight to the portal screen is how the
       Cresta packet reached Send it without that audit. The packet and this route commit in the
       same transition, so the new packet never renders inside the previous packet's screen. */
    runDashboardTransition(() => {
      commitCanonicalSelection(null);
      setCanonicalFillError(null);
      setSubmissionFillError(null);
      setSelectedId(packet.id);
      // Highlighting is per (resume, posting). Carrying the previous packet's result over marks the
      // new JD against a resume and a posting that are no longer on screen.
      setMatchResult(null);
      setPacketEvidence(null);
      setSpec(stripMetadata(packet.spec));
      setQuestions(selectedReview?.questions ?? []);
      setCoverLetterBody(packet.spec._cover_letter?.body ?? "");
      setCoverLetterDownloadUrl(packet.cover_letter_download_url ?? null);
      /* A different packet, so any "sending" flag belongs to the one we are leaving. Without
         this, switching to a packet whose stored status is `filling` captioned it "You told Litos
         to send this" for an application the student never authorised. */
      setPrepareStartedAt(null);
      setApproveStartedAt(null);
      setSubmittingPhase("preparing");
      /* Seeded from the board row so the portal screen has something to draw before the first
         poll answers, and marked `partial` because that is exactly what it is. The cover letter
         and document marks come from that same stored packet. Absent document marks stay absent:
         an empty object would claim the application had been measured and could block a send on
         an ask this seed cannot confirm. */
      setSubmission(rememberedSubmission ?? (status
        ? {
          application_id: packet.id,
          review: selectedReview!,
          submission_authority: packet.submission_authority,
          submission_projection: packet.submission_projection,
          submission_authority_quarantined: packet.submission_authority_quarantined,
          retry_safety: qaMode === true ? { kind: "no_evidence" } : packet.retry_safety ?? null,
          cover_letter: packet.spec._cover_letter ?? null,
          documents: documentsFromSpecMarks(packet.spec._documents),
          partial: true,
        }
        : null));
      setError(null);
      setPollError(null);
      setSendRefusal(null);
      setNotice(null);
      moveToScreen(historicalPacketAuditStale || status === "ready_for_final_approval" ? "review" : screenForStatus(status, "review"));
    });
  }, [clearPrescriptState, commitCanonicalSelection, moveToScreen, qaMode, setSubmission]);

  /* User navigation writes local state and route state as one action. The local write makes the
     switch feel immediate; the URL makes reload, sharing, and browser history reopen the same
     application instead of whichever packet happened to be selected before it. */
  const openApplication = useCallback((packet: GeneratedResume, options: { history?: "push" | "replace" } = {}) => {
    const nextPath = applicationSelectionPath(window.location, packet.id);
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const routeAlreadyCommitted = nextPath === currentPath;
    /* Re-selecting the current row can happen while its authoritative history request is still in
       flight. A same-URL push starts no replacement bootstrap, so keep that request valid and mark
       the local route settled. Real route changes still invalidate the request they replace. */
    if (!routeAlreadyCommitted) applicationBootstrapGenerationRef.current += 1;
    locallyOpenedRequestRef.current = {
      id: packet.id,
      revision: applicationWorkflowRevision(packet),
      routeCommitted: routeAlreadyCommitted,
    };
    pendingApplicationFocusRef.current = true;
    resolvedJobParam.current = null;
    runDashboardTransition(() => {
      setPendingJob(null);
      setOpeningApplicationId(packet.id);
      setSwitcherOpen(false);
      setShowNewApplication(false);
      setComposerRefusal(null);
      setResolvedActionableRequestId(packet.id);
      selectPacket(packet);
      if (routeAlreadyCommitted) return;
      /* Next patches native history writes into its own transition. Keeping that write inside the
         same dashboard transition prevents the router restore from retiring the local selection
         before its keyed task panel commits. */
      if (options.history === "replace") window.history.replaceState(null, "", nextPath);
      else window.history.pushState(null, "", nextPath);
    });
  }, [selectPacket]);

  const resetApplicationWorkflow = useCallback((options: { afterReset?: () => void; animate?: boolean } = {}) => {
    pendingApplicationFocusRef.current = false;
    locallyRevisitingIdRef.current = null;
    selectedIdRef.current = null;
    resumeEditSaveApplicationRef.current = null;
    editorRevisionRef.current += 1;
    packetCoverLetterEditorRevisionRef.current += 1;
    const commitReset = () => {
      setPendingJob(null);
      setOpeningApplicationId(null);
      setSwitcherOpen(false);
      setResolvedActionableRequestId(null);
      setSelectedId(null);
      commitCanonicalSelection(null);
      setRevisitingId(null);
      setCanonicalFillError(null);
      setSubmissionFillError(null);
      setMatchResult(null);
      setPacketEvidence(null);
      setSpec(null);
      setQuestions([]);
      setSubmission(null);
      setSendRefusal(null);
      setNotice(null);
      options.afterReset?.();
    };
    /* Browser history reconciliation runs in a layout effect because stale application controls
       must disappear before paint. An explicit Close may animate, but deferring the layout-effect
       reset to a transition lane would violate that before-paint guarantee. */
    if (options.animate === false) commitReset();
    else runDashboardTransition(commitReset);
  }, [commitCanonicalSelection, setSubmission]);

  const closeApplication = useCallback(() => {
    const selectedPacketId = selectedIdRef.current;
    pendingApplicationLandingFocusRef.current = {
      rowId: canonicalSelected?.id
        ?? (selectedPacketId ? canonicalIdByPacketId[selectedPacketId] ?? selectedPacketId : openingApplicationId),
    };
    applicationBootstrapGenerationRef.current += 1;
    locallyOpenedRequestRef.current = null;
    resolvedJobParam.current = null;
    resetApplicationWorkflow();
    window.history.pushState(null, "", applicationSelectionPath(window.location, null));
  }, [canonicalIdByPacketId, canonicalSelected?.id, openingApplicationId, resetApplicationWorkflow]);

  /* Route changes commit in a layout phase before the passive bootstrap effect for the new URL can
     cancel its predecessor. Invalidate that predecessor here for every request-key change, even
     when neither route has selected enough state for the reconciliation effect below to reset.
     This closes both direct-link A to B races and Back-to-ledger races before either can paint. */
  useLayoutEffect(() => {
    if (committedApplicationRequestKeyRef.current === applicationRequestKey) return;
    committedApplicationRequestKeyRef.current = applicationRequestKey;
    locallyRevisitingIdRef.current = null;
    applicationBootstrapGenerationRef.current += 1;
  }, [applicationRequestKey]);

  /* Back and Forward change the route without calling the row or close handlers. When the route
     stops naming an application, retire the local workflow immediately instead of waiting for the
     history fetch to finish. A just-clicked row is the one exception: its local selection lands a
     frame before router.push updates useSearchParams, and the ref keeps that intentional handoff
     from being mistaken for Back. */
  useLayoutEffect(() => {
    if (qaMode === true) return;
    const localOpen = locallyOpenedRequestRef.current;
    /* Native history writes update the browser address before Next publishes useSearchParams.
       That narrow gap is the only reason an uncommitted local selection may survive a router
       mismatch. If Back has already moved the browser to another application, the local token is
       stale even when React has not yet committed the intermediate route. */
    const browserApplicationId = new URLSearchParams(window.location.search).get("application");
    if (requestedApplicationId !== null) {
      const canonicalMatchesRequest = canonicalSelected === null
        || canonicalSelected.id === requestedApplicationId
        || canonicalSelected.legacy_generated_resume_id === requestedApplicationId;
      const pendingLocalCanonical = Boolean(
        canonicalSelected
        && localOpen
        && !localOpen.routeCommitted
        && browserApplicationId === localOpen.id
        && (localOpen.id === canonicalSelected.id || localOpen.id === canonicalSelected.legacy_generated_resume_id),
      );
      /* A canonical-only detail has no selectedId for selectedPacketForRequest to gate. Clear the
         prior detail before paint when browser history names a different application, or its Fill
         and Tailor controls survive under the new URL while that request loads or after it fails. */
      if (!canonicalMatchesRequest && !pendingLocalCanonical) {
        /* This reset cancels the optimistic selection whether its route flag settled or not. The
           authoritative bootstrap must therefore select the requested application again instead
           of mistaking a discarded local transition for committed UI. */
        if (localOpen) locallyOpenedRequestRef.current = null;
        applicationBootstrapGenerationRef.current += 1;
        resetApplicationWorkflow({
          afterReset: () => setOpeningApplicationId(requestedApplicationId),
          animate: false,
        });
        return;
      }
      if (localOpen?.id === requestedApplicationId) localOpen.routeCommitted = true;
      else if (localOpen?.routeCommitted) locallyOpenedRequestRef.current = null;
      return;
    }
    if (localOpen && !localOpen.routeCommitted) return;
    if (localOpen) locallyOpenedRequestRef.current = null;
    const localRevisitOnly = revisitingId !== null
      && locallyRevisitingIdRef.current === revisitingId
      && selectedIdRef.current === null
      && openingApplicationId === null
      && canonicalSelected === null
      && resolvedActionableRequestId === null;
    if (localRevisitOnly) return;
    if (
      selectedIdRef.current === null
      && openingApplicationId === null
      && canonicalSelected === null
      && revisitingId === null
      && resolvedActionableRequestId === null
    ) return;
    applicationBootstrapGenerationRef.current += 1;
    resetApplicationWorkflow({ animate: false });
  }, [canonicalSelected, openingApplicationId, qaMode, requestedApplicationId, resetApplicationWorkflow, resolvedActionableRequestId, revisitingId]);

  /* The acknowledged branch of the poll's evidence upkeep, out of refreshSubmission for the same
     reason its comments are: tests/submission-terminal-state.test.mjs bounds the fetch-to-route
     span so it holds code. Every await in here is guarded by the same requestedId discipline as
     the caller. On success or a clean invalidation the standing refusal retires; on an HTTP
     refusal the server's sentence is recorded for the end-of-tick banner write, because the
     evidence being cleared right here is exactly what stops a later tick from re-raising it. */
  const revalidateAcknowledgedEvidence = useCallback(async (requestedId: string, currentEvidence: PacketEvidenceSession) => {
    try {
      const currentAudit = await api<PacketAuditResponse>(`/applications/${requestedId}/packet-audit`, { method: "POST" });
      const refreshed = revalidateAcknowledgedPacketEvidence(currentEvidence, requestedId, currentAudit, Date.now());
      /* Review and fill clears this exact evidence before navigating. A revalidation that began
         before that click must not install its answer after the click, even though the selected
         application id still matches. Identity covers a newer audit on the same application, and
         screenRef covers deliberate navigation away from the poll-owned screens. */
      if (
        selectedIdRef.current !== requestedId
        || !acknowledgedEvidenceRevalidationMayCommit(screenRef.current, packetEvidenceRef.current, currentEvidence)
      ) return { kind: "aborted" as const };
      /* The poll owns one commit after both of its reads finish. Returning the audit keeps the
         question set, packet evidence and submission envelope on the same server snapshot instead
         of committing evidence here and then letting the caller install its older GET payload. */
      return { kind: "current" as const, audit: currentAudit, evidence: refreshed };
    } catch (reason) {
      if (
        selectedIdRef.current !== requestedId
        || !acknowledgedEvidenceRevalidationMayCommit(screenRef.current, packetEvidenceRef.current, currentEvidence)
      ) return { kind: "aborted" as const };
      if (await recoverPacketAuditReview(requestedId, reason)) return { kind: "aborted" as const };
      packetEvidenceRef.current = null;
      setPacketEvidence(null);
      /* A server sentence, not a transient: see packetRevalidationRefusal. Two bounds, both
         load-bearing. 409 only, because api() throws ApiError for EVERY non-ok status and the
         authored packet sentences all ride 409 (applications.ts); a 502 during a deploy blip must
         stay a transient, not become a standing banner no later tick can retire, which is the
         Cresta pin rebuilt in the other direction. And the same requestedId discipline as the
         success arm, because a refusal landing after she left the application would write the OLD
         application's sentence into the ref just after handleSelect cleared it, and the ref would
         pin that sentence over whatever she is looking at now. */
      if (reason instanceof ApiError && reason.status === 409 && selectedIdRef.current === requestedId) {
        packetRevalidationRefusal.current = { applicationId: requestedId, message: reason.message };
      }
      return { kind: "refused" as const };
    }
  }, [recoverPacketAuditReview]);

  /* The answer is put through reviewWithLists on arrival, not only on its way into state through
     setSubmission. Two lines in here read `result.review.questions` directly rather than through
     state, so a backend that answered without the key would throw inside this promise instead of
     during a render, and the poll's catch would report it as "We lost sight of the form."
     The comment stays out here rather than beside the line: tests/submission-terminal-state.test.mjs
     bounds the distance from the fetch to the route below, deliberately, so that span holds code. */
  const refreshSubmission = useCallback(async () => {
    if (!selectedId || qaMode) return;
    const requestedId = selectedId;
    const requestedSelectionRevision = editorRevisionRef.current;
    const requestedMutationGeneration = submissionMutationGenerationRef.current;
    const raw = await api<SubmissionResponse>(`/applications/${requestedId}/submission`);
    let result = submissionResponseForDisplay(raw, { packetId: requestedId });
    if (result.application_id !== requestedId) return;

    /* Selection owns only the visible screen. The full response still belongs to the application
       it names, so retain it before a switch can end visual publication. Otherwise a newer A read
       discarded after switching to B leaves an older delayed A mutation response with nothing to
       compare against. The mutation generation still rejects a read that began before an already
       accepted write. */
    if (submissionMutationGenerationRef.current !== requestedMutationGeneration) return;
    const rememberedBeforeRead = submissionSnapshotsRef.current.get(requestedId);
    const rememberedAfterRead = nextSubmissionState(rememberedBeforeRead, result);
    if (rememberedAfterRead !== rememberedBeforeRead) {
      submissionSnapshotsRef.current.set(requestedId, rememberedAfterRead);
      advanceSubmissionPublicationGeneration(submissionPublicationGenerationsRef.current, requestedId);
    }

    // A poll for packet A can land after the user has switched to packet B: the fetch closes over
    // the id it asked for, but the poll effect's cleanup cannot reach inside an in-flight request.
    // Without this guard A's review would be installed while B is selected, so the portal preview,
    // filled fields and blockers on screen belong to A while the Submit button approves B. That is
    // an application sent to the wrong employer, so the response is discarded unless it is still
    // the packet the user is looking at. The ref, not the closure, is the current truth.
    if (
      selectedIdRef.current !== requestedId
      || editorRevisionRef.current !== requestedSelectionRevision
      || submissionMutationGenerationRef.current !== requestedMutationGeneration
    ) return;

    /* Never go backwards off a finished send. A poll issued BEFORE the approve returned can land
       after it, carrying the pre-send `ready_for_final_approval`; installing it would replace the
       receipt with a live "Send it" for an application that has already gone. The id guard above
       cannot see this, because it is the right packet, just an older answer. */
    if (
      submissionRef.current?.application_id === result.application_id
      && submissionRef.current?.review.status === "submitted"
      && result.review.status !== "submitted"
    ) return;

    captureCompletedSubmission(result, "poll");
    const currentEvidence = packetEvidenceRef.current;
    /* Exact packet evidence is a PRE-SEND gate. Once the run has stopped for a person, failed, or
       reached a receipt, asking the packet-audit route to revalidate it is both meaningless and
       contradictory: the route correctly answers that this application can no longer be audited,
       while the successful audit notice stays green beside it. Measured on the live Quandela
       human-verification stop on 2026-08-21. Retire the evidence and both of its banners when the
       run leaves the states in which that audit can still guard an employer send. */
    const packetAuditStillGuardsSend = result.review.status === "ready_for_final_approval"
      || result.review.status === "filling"
      || result.review.status === "submitting"
      || result.review.status === "submission_claimed";
    /* Keep the mutating audit revalidation on the settled review screen. While submit-request is
       filling the form, this poll still needs to GET status, but a concurrent POST /packet-audit
       can rewrite the packet bindings the active runner is working from. */
    if (screenRef.current === "portal"
      && currentEvidence?.applicationId === requestedId
      && currentEvidence.acknowledged
      && packetAuditStillGuardsSend) {
      const revalidation = await revalidateAcknowledgedEvidence(requestedId, currentEvidence);
      if (revalidation.kind === "aborted") return;
      if (revalidation.kind === "current") {
        /* POST /packet-audit is the later, mutating read. It normalizes and persists the exact
           questions its audit hashes, so its payload outranks the GET that started this poll. On a
           rolling deploy where questions is absent, retain the already acknowledged client set and
           never restore the older GET list. */
        const base = submissionSnapshotIsOlder(submissionRef.current, result)
          ? submissionRef.current!
          : result;
        result = submissionAfterPacketAudit(base, submissionRef.current, revalidation.audit);
        if (
          selectedIdRef.current !== requestedId
          || !acknowledgedEvidenceRevalidationMayCommit(screenRef.current, packetEvidenceRef.current, currentEvidence)
        ) return;
        packetEvidenceRef.current = revalidation.evidence;
        setPacketEvidence(revalidation.evidence);
        packetRevalidationRefusal.current = null;
      }
    } else {
      setPacketEvidence((current) => reconcileUnacknowledgedPacketPoll(current, requestedId, result.review.packet_audit));
      if (!packetAuditStillGuardsSend) {
        packetRevalidationRefusal.current = null;
        setPollError(null);
        setNotice(null);
      }
    }
    /* The GET began before the audit await. A run response or a newer poll may have installed a
       later server revision while this one was waiting. Never roll status, questions or packet
       state backward from that provably older snapshot. */
    if (
      selectedIdRef.current !== requestedId
      || submissionMutationGenerationRef.current !== requestedMutationGeneration
      || editorRevisionRef.current !== requestedSelectionRevision
      || submissionSnapshotIsOlder(submissionRef.current, result)
    ) return;
    const rememberedBeforePoll = submissionSnapshotsRef.current.get(requestedId);
    result = nextSubmissionState(rememberedBeforePoll, result);
    submissionSnapshotsRef.current.set(requestedId, result);
    const submissionBeforePoll = submissionRef.current;
    result = publishSubmissionEnvelope(submissionRef, result, "poll");
    if (result !== submissionBeforePoll) {
      advanceSubmissionPublicationGeneration(submissionPublicationGenerationsRef.current, requestedId);
    }
    const incomingCoverLetter = submissionCoverLetterField(result);
    if (incomingCoverLetter.included) {
      setCoverLetterBody(incomingCoverLetter.value?.body ?? "");
      if (!incomingCoverLetter.value) setCoverLetterDownloadUrl(null);
    }
    /* NOT a bare `review.updated_at` comparison: that versions the review alone, and this response
       also carries cover_letter, handoff_url and configured. See submission-state.ts. */
    setSubmission((current) => nextSubmissionState(current, result));
    /* A response is authoritative while the poll still owns portal/submitting, including deletion.
       The request may have started there and resolved after the applicant reached Questions, so
       check the synchronous route at the state-write boundary. Keeping the current array on any
       other screen preserves unsaved typing. Merging an empty server list is not an alternative:
       it kept every stale local row and made a fixed Recruitee question impossible to retire. */
    setQuestions((current) => submissionPollMayReplaceQuestions(screenRef.current)
      ? result.review.questions
      : current);
    setPackets((current) => {
      if (!current) return current;
      const packet = current.find((item) => item.id === requestedId);
      if (!packet) return current;
      const nextPacket = packetWithSubmission(packet, result);
      return packet === nextPacket
        ? current
        : current.map((item) => item.id === requestedId ? nextPacket : item);
    });
    // A poll that succeeds clears a stale banner from an earlier transient failure. Without this a
    // single 502 during a multi-minute run left "Could not refresh portal status" pinned above a
    // run that had since succeeded. It clears the POLL's banner and only that one: this line used
    // to be setError(null), which also erased the server's answer to a Send the student had just
    // pressed, within 2.5 seconds of it appearing.
    //
    // Unless a refused packet revalidation is standing for THIS application, in which case the
    // server's sentence IS the banner, across ticks: see packetRevalidationRefusal.
    if (packetRevalidationRefusal.current?.applicationId === requestedId) {
      setPollError(packetRevalidationRefusal.current.message);
    } else {
      setPollError(null);
    }
    /* While the student's own send is in flight the poll is usually reporting the status from
       BEFORE the approve, and acting on that walks them backwards onto a live "Send it".
       TERMINAL states are the exception, and the exception is load-bearing: `api()` has no
       AbortController and no timeout, so a stalled approve request never rejects and the flag stays
       set for as long as the socket hangs. Suppressing everything would then reproduce the
       never-resolving spinner this branch is named for, reached through a hung connection instead
       of a missing route, with the poll already holding the answer. Only the backwards moves are
       dropped. */
    const terminal = result.review.status === "submitted" || result.review.status === "failed";
    if (approveInFlight.current !== null && !terminal) return;
    /* The fetch may have started before Review and fill left the portal. Keep its canonical data
       updates above, but do not let its old needs_attention status reverse the applicant's newer
       navigation. A receipt remains authoritative even if it arrives after she changed screens. */
    const pollMayRoute = screenRef.current === "submitting"
      || screenRef.current === "portal"
      || result.review.status === "submitted";
    if (!pollMayRoute) return;
    moveToScreen(screenForStatus(result.review.status, "submitting"));
  }, [captureCompletedSubmission, moveToScreen, qaMode, revalidateAcknowledgedEvidence, selectedId, setSubmission]);

  /* The applicant's own escape hatch when the cover letter has not arrived. The 2.5s poll already
     asks for it, so this exists for the case the poll cannot recover from on its own: a hung or
     failed fetch. It reports failure instead of swallowing it, which is the whole point. */
  const [coverLetterReloading, setCoverLetterReloading] = useState(false);
  const reloadCoverLetter = useCallback(async () => {
    setCoverLetterReloading(true);
    try {
      await refreshSubmission();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not fetch the cover letter. Check your connection, then try again.");
    } finally {
      setCoverLetterReloading(false);
    }
  }, [refreshSubmission]);

  /* `packets` and `submission` hold two copies of the same cover letter, and generate/save/delete
     wrote only the first. So writing a cover letter on the review screen left the portal screen
     still blocked on the letter that had just been written. Every writer goes through here. */
  const applyCoverLetterToSubmission = useCallback((applicationId: string, coverLetter: CoverLetter | null) => {
    setSubmission((current) => current && current.application_id === applicationId ? { ...current, cover_letter: coverLetter } : current);
  }, [setSubmission]);

  /* The same problem the cover letter has, for documents: `packets` and `submission` each hold a
     copy of what an application carries, and the send gate reads the second one. Written here rather
     than left to the poll because the poll only runs on the submitting and portal screens, and
     because two and a half seconds of a Send button still greyed out after a successful upload reads
     as a failed upload.

     `documents` is set to a real object even when the attachment is cleared, so an application that
     has been measured never falls back to the never-measured state and silently loses its gate. */
  const applyDocumentToSubmission = useCallback((applicationId: string, kind: string, attachment: AttachedDocument | null) => {
    setSubmission((current) => {
      if (!current || current.application_id !== applicationId) return current;
      const documents = { ...(current.documents ?? {}) };
      if (attachment) documents[kind] = attachment;
      else delete documents[kind];
      return { ...current, documents };
    });
    setPackets((current) => current?.map((packet) => {
      if (packet.id !== applicationId) return packet;
      const marks = { ...(packet.spec._documents ?? {}) };
      /* Named field by field rather than spread minus `kind`. The spec's record is the one the
         server also writes `object_key` into, and a spread is how a field nobody meant to copy ends
         up in client state and then in something this app renders. */
      if (attachment) {
        marks[kind] = {
          document_id: attachment.document_id,
          file_name: attachment.file_name,
          attached_at: attachment.attached_at,
          ordered_at: attachment.ordered_at,
          employer_label: attachment.employer_label,
          official_requested: attachment.official_requested,
        };
      } else delete marks[kind];
      return { ...packet, spec: { ...packet.spec, _documents: marks } };
    }) ?? current);
  }, [setSubmission]);

  useEffect(() => {
    if (!selectedId || qaMode || !["submitting", "portal"].includes(screen)) return;
    let cancelled = false;
    let timer: number | undefined;
    let inFlight = false;

    // A hidden tab skipped the fetch outright and then waited a further 10s before even
    // reconsidering, so a run that finished while the user was on another tab left the dashboard
    // frozen on "Preparing" long after the portal had come back with blockers. Backgrounding should
    // slow the poll, never withhold the terminal state: catch up the moment the tab is visible.
    const tick = async () => {
      if (cancelled || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        await refreshSubmission();
      } catch (reason) {
        if (!cancelled) setPollError(reason instanceof Error ? reason.message : "We lost sight of the form. Reload the page to check.");
      } finally {
        inFlight = false;
      }
    };

    const poll = async () => {
      await tick();
      if (!cancelled) timer = window.setTimeout(poll, document.visibilityState === "visible" ? 2500 : 10_000);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    timer = window.setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [qaMode, refreshSubmission, screen, selectedId]);

  useEffect(() => {
    const bootstrapGeneration = ++applicationBootstrapGenerationRef.current;
    const bootstrapIsStale = () => bootstrapGeneration !== applicationBootstrapGenerationRef.current;
    const qaScenario = new URLSearchParams(window.location.search).get("qa");
    const localQa = window.location.hostname === "localhost" && qaScenario !== null;
    if (localQa) {
      /* Selecting a fixture packet adds an application id to the same URL. Next reflects that
         native history write through useSearchParams, so this shared bootstrap effect runs again.
         Keep the selected packet instead of reinstalling the original scenario on every row click. */
      if (initializedQaScenarioRef.current === qaScenario) return;
      initializedQaScenarioRef.current = qaScenario;
      queueMicrotask(async () => {
        if (bootstrapIsStale()) return;
        if (qaScenario === "error") {
          setQaMode(true);
          setEducationProfileStatus("failed");
          setError("We could not load your applications.");
          return;
        }
        if (qaScenario === "empty") {
          setQaMode(true);
          setEducationProfileStatus("ready");
          setPackets([]);
          return;
        }
        const { QA_PACKET, QA_SCENARIOS } = await import("./qa-data");
        if (bootstrapIsStale()) return;
        const scenario = qaScenario === "1" ? "acme" : qaScenario === "no-questions" ? "stripe" : qaScenario;
        const packet = QA_SCENARIOS[scenario ?? "acme"] ?? QA_PACKET;
        runDashboardTransition(() => {
          setQaMode(true);
          setEducationProfileStatus("ready");
          setPackets(Object.values(QA_SCENARIOS));
          selectPacket(packet);
        });
      });
      return;
    }
    initializedQaScenarioRef.current = null;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && !bootstrapIsStale()) setQaMode(false);
    });
    /* The ordinary history response is deliberately capped at fifty full packet specs. A direct
       link may point to an older packet, so name that one packet explicitly instead of widening
       every Tracker load and restoring the transfer problem that required the cap. */
    const historyPath = requestedApplicationId
      ? `/resume/history?application=${encodeURIComponent(requestedApplicationId)}`
      : "/resume/history";
    Promise.allSettled([
      api<{ resumes: GeneratedResume[] }>(historyPath),
      /* Kept in lockstep with the Home loader's identical literal, and set to the server's own
         maximum for this parameter, which is the same 200 GET /applications/board bounds itself at -
         so this page's ledger, its board and Home all describe ONE inventory. Anything higher is a
         400 that lands here as an empty canonical list and drops every canonical-only application
         off this page. See the loader's comment. */
      api<{ applications: CanonicalApplication[] }>("/applications?limit=200"),
    ])
      .then(async ([historyResult, canonicalResult]) => {
        if (cancelled || bootstrapIsStale()) return;
        // During a rolling deploy, keep legacy history usable before the canonical list route is
        // present. The inverse matters for a direct canonical link: that id has no generated
        // resume, so an older history route may reject it even though the canonical ledger owns it.
        const canonical = canonicalResult.status === "fulfilled"
          ? canonicalResult.value.applications
          : [];
        setCanonicalIdByPacketId(Object.fromEntries(canonical
          .filter((application): application is CanonicalApplication & { legacy_generated_resume_id: string } => Boolean(application.legacy_generated_resume_id))
          .map((application) => [application.legacy_generated_resume_id, application.id])));
        const requestedCanonicalApplication = requestedApplicationId
          ? canonical.find((application) =>
            application.id === requestedApplicationId
            || application.legacy_generated_resume_id === requestedApplicationId) ?? null
          : null;
        const requestedCanonical = requestedCanonicalApplication !== null;
        if (historyResult.status === "rejected" && !requestedCanonical) throw historyResult.reason;
        let legacy = historyResult.status === "fulfilled" ? historyResult.value.resumes : [];
        const linkedPacketId = requestedCanonicalApplication?.legacy_generated_resume_id ?? null;
        if (linkedPacketId && !legacy.some((packet) => packet.id === linkedPacketId)) {
          const linkedHistory = await api<{ resumes: GeneratedResume[] }>(`/resume/history?application=${encodeURIComponent(linkedPacketId)}`);
          if (cancelled || bootstrapIsStale()) return;
          legacy = [...linkedHistory.resumes, ...legacy.filter((packet) => !linkedHistory.resumes.some((linked) => linked.id === packet.id))];
        }
        const merged = mergeCanonicalApplicationHistory(legacy, canonical);
        const reviewable = onlyReviewablePackets(merged);
        const requestedPacketId = requestedCanonicalApplication?.id ?? requestedApplicationId;
        const requested = reviewable.find((packet) => packet.id === requestedPacketId);
        /* Publish the ledger and the route-selected task as one visual state. Otherwise the packet
           list can reveal the landing ledger for a frame before a direct link selects its task. */
        runDashboardTransition(() => {
          setPackets(merged);
          if (requestedCanonicalApplication && requestedApplicationIntent === "detail") {
            selectedIdRef.current = null;
            resumeEditSaveApplicationRef.current = null;
            editorRevisionRef.current += 1;
            packetCoverLetterEditorRevisionRef.current += 1;
            setSelectedId(null);
            setRevisitingId(null);
            setResolvedActionableRequestId(null);
            commitCanonicalSelection(requestedCanonicalApplication);
            return;
          }
          if (requested && requestedApplicationIntent === "detail") {
            const canonicalApplication = canonicalApplicationFromPacket(requested);
            if (canonicalApplication) {
              setRevisitingId(null);
              setResolvedActionableRequestId(null);
              selectPacket(requested);
              return;
            }
            /* Detail is deliberately read-only. It opens the packet viewer without selecting the
               actionable workflow, so viewing a role can never prepare or approve an application. */
            setResolvedActionableRequestId(null);
            setRevisitingId(requested.id);
          } else if (requested && (requestedApplicationIntent === null || requestedApplicationIntent === "apply")) {
            /* `intent=apply` is the explicit continuation from Jobs. Bare application links keep
               their historical actionable behavior, while both paths still enter through
               selectPacket and therefore retain the exact-packet audit gate. */
            setRevisitingId(null);
            /* Echo back the id the URL actually asked for, not `requested.id`. A Jobs-page link built
               from a legacy packet id resolves through a canonical row minted with its OWN id
               (Databricks: legacy f9a270b7 -> canonical 2d5e38f6), and selectedPacketForRequest's race
               guard compares this value against `requestedApplicationId` verbatim. Storing the
               canonical id there made every such deep link fail that comparison permanently, not just
               during the in-flight window the guard exists for: "the saved list does not contain a
               packet with this id" fired even though the packet was found and selected. */
            const localOpen = locallyOpenedRequestRef.current;
            const alreadySelectedLocally = localOpen?.id === requestedApplicationId;
            if (alreadySelectedLocally) locallyOpenedRequestRef.current = null;
            setResolvedActionableRequestId(requestedApplicationId);
            setOpeningApplicationId(null);
            /* A local click renders immediately, then this request returns the authoritative packet.
               Reusing the local workflow is safe only when those server-owned bytes are identical.
               If another tab advanced or submitted the application, the fresh selection replaces
               every action, answer, document, and screen state before the user can continue. */
            if (!alreadySelectedLocally || localOpen.revision !== applicationWorkflowRevision(requested)) {
              selectPacket(requested);
            }
          } else {
            setResolvedActionableRequestId(null);
            setOpeningApplicationId(null);
            if (requestedApplicationIntent !== "detail") setRevisitingId(null);
          }
        });
      })
      .catch((reason) => {
        if (cancelled || bootstrapIsStale()) return;
        setOpeningApplicationId(null);
        setError(reason instanceof Error ? reason.message : "We could not load your applications. Reload the page.");
      });
    /* The education block as it stands NOW, to check the frozen packet against. Failure is not the
       same as agreement: sending stays blocked until the comparison succeeds. */
    queueMicrotask(() => {
      if (!cancelled && !bootstrapIsStale()) setEducationProfileStatus("loading");
    });
    api<EducationProfile>("/profile")
      .then((result) => {
        if (cancelled || bootstrapIsStale()) return;
        setEducationProfile(result);
        setEducationProfileStatus("ready");
      })
      .catch(() => {
        if (cancelled || bootstrapIsStale()) return;
        setEducationProfile(null);
        setEducationProfileStatus("failed");
      });
    api<JobsPage>("/jobs?offset=0")
      .then((result) => {
        if (cancelled || bootstrapIsStale()) return;
        setCurrentMatches(result.jobs);
        setPreferenceError(null);
      })
      .catch(() => {
        if (cancelled || bootstrapIsStale()) return;
        setCurrentMatches([]);
        setPreferenceError("We could not check your current job preferences. Automatic sending is paused.");
      });
    return () => {
      cancelled = true;
    };
  }, [commitCanonicalSelection, requestedApplicationId, requestedApplicationIntent, selectPacket]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;
    const restored = params.get("checkout_action") === "tailor" ? readCheckoutDraft() : null;
    queueMicrotask(() => {
      if (restored) setNewApplication(restored);
      setShowNewApplication(true);
    });
  }, []);

  /* `?job=` NAMES A POSTING, and this is where a link that means something else gets sorted out.
   *
   * The parameter is written by the Jobs page's Apply control, so its value is a monitored job id
   * and /jobs/<id> answers it. A link that has been sitting in a tab, a bookmark or a message can
   * carry a PACKET id in the same slot, which that endpoint answers with a 404, and the 404's
   * message went straight to the page-level banner. Reproduced 2026-08-11 on a real account:
   * /dashboard/applications?job=<generated_resume_id> printed a red "Error: Job not found" across
   * the top of a Tracker that was, in the same frame, listing that exact application. Both
   * sentences were on screen and only one of them was true, and the one a student would act on was
   * the wrong one, because the visible red alert outranks a row further down the page.
   *
   * So the id is checked against the applications this page already has BEFORE the postings
   * endpoint is asked. A hit is not an error, it is a deep link to that packet, and it is treated
   * as the `?application=` it meant: the packet opens and the parameter comes out of the URL, so a
   * reload does not ask about it again. That leaves the error banner for the one case where it is
   * honest, an id that is neither a posting nor an application, and even there the message says
   * what is still true rather than quoting the backend at the student.
   *
   * `packets` is a dependency because the answer depends on them, and the poll rewrites that array
   * every 2.5 seconds. The ref is what stops a second lookup: it records the id this effect has
   * already acted on, and the request checks it again on the way back rather than being cancelled,
   * so a double-invoked effect in development still lands its result exactly once. */
  useEffect(() => {
    if (qaMode !== false || packets === null) return;
    const jobId = new URLSearchParams(window.location.search).get("job");
    if (!jobId || resolvedJobParam.current === jobId) return;
    resolvedJobParam.current = jobId;

    const packet = packets.find((item) => item.id === jobId);
    if (packet) {
      /* queueMicrotask for the same reason the pendingJob effect below uses it: selectPacket writes
         six pieces of state, and doing that synchronously inside an effect cascades the render. */
      queueMicrotask(() => {
        openApplication(packet, { history: "replace" });
      });
      return;
    }

    api<{ job: MonitoredJob }>(`/jobs/${jobId}`)
      .then(({ job }) => {
        if (resolvedJobParam.current !== jobId) return;
        setPendingJob(job);
      })
      .catch(() => {
        if (resolvedJobParam.current !== jobId) return;
        setError("We could not open that job link. Everything you have already built is listed below.");
      });
  }, [openApplication, packets, qaMode]);

  useEffect(() => {
    if (!pendingJob || packets === null) return;
    const existing = onlyReviewablePackets(packets).find((packet) => packetMatchesJob(packet, pendingJob));
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const intent = params.get("intent");
      const checkoutAction = params.get("checkout_action");
      if (existing && intent !== "fill") {
        openApplication(existing, { history: "replace" });
        setShowNewApplication(false);
        setNotice("Your resume is ready. Compare it with the job below.");
      } else {
        const draft = {
          company: pendingJob.company_name,
          role: pendingJob.title,
          portalUrl: pendingJob.apply_url,
          jobDescription: pendingJob.description,
          jobId: pendingJob.id,
          canonicalApplicationId: null,
        };
        setNewApplication(draft);
        setShowNewApplication(true);
        if (checkoutAction === "tailor") {
          setNotice("Your job is ready. Choose Tailor resume when you want Litos to start.");
          setPendingJob(null);
          return;
        }
        if (intent === "tailor") {
          const actionKey = `${pendingJob.id}:tailor`;
          if (actionStartedFor.current !== actionKey) {
            actionStartedFor.current = actionKey;
            void createApplication(draft);
          }
        } else {
          setNotice("Job details are ready. Choose Prepare in Litos to use your main resume without opening another tab.");
        }
      }
      setPendingJob(null);
    });
    // createApplication is redeclared every render and is not a dependency worth chasing: the
    // effect is keyed on pendingJob, which is cleared above, so it runs once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openApplication, packets, pendingJob]);

  /* Fail closed during query-only navigation. The router can publish application=B while the
     history request for B is still resolving and selectedId still names A. No actionable control
     for A may survive that mismatch, especially its final employer send. */
  /* The lookup list carries a restored copy of every envelope's linked packet, so the legacy id
     selectPacket selects resolves to the packet the restore built. See withRestoredLinkedPackets:
     on canonical rows minted with their own id (Belvedere, Mercari) the envelope is filed under the
     canonical id and the bare list refused the legacy id with "will not open". */
  const selected = selectedPacketForRequest(
    withRestoredLinkedPackets(packets ?? []),
    selectedId,
    requestedApplicationId,
    requestedApplicationIntent,
    resolvedActionableRequestId,
  );
  const storedReview = selected?.spec._review;
  const selectedSubmission = selected && submission?.application_id === selected.id ? submission : null;
  const selectedDirectAnswerPass = selected && selectedSubmission
    ? directAnswerPasses.get(selected.id)
    : undefined;
  const selectedAnsweredPromptFingerprints = selectedDirectAnswerPass
    && selectedSubmission
    && selectedDirectAnswerPass.key === directAnswerPassKey(selectedSubmission.review)
    ? selectedDirectAnswerPass.promptFingerprints
    : new Set<string>();
  const selectedDirectAnswerDrafts = selected
    ? directAnswerDrafts.get(selected.id) ?? EMPTY_DIRECT_ANSWER_DRAFTS
    : EMPTY_DIRECT_ANSWER_DRAFTS;
  const selectedDirectAnswerFailure = selected ? directAnswerFailures.get(selected.id) ?? null : null;
  const selectedDirectAnswerProgress = selected ? directAnswerProgresses.get(selected.id) ?? null : null;
  /* The submission endpoint is the authority for the live workflow state. The packet list can
     still carry the state from before a fill, especially after a blocker is repaired while the
     filled browser session remains reviewable. Reading status from that older packet made a
     ready_for_final_approval form look like needs_attention: the exact-packet button then called
     submit-request instead of returning to the filled preview, and the server correctly refused
     to discard the existing form without an explicit restart. Keep the packet copy only as the
     loading fallback; once the owned submission arrives, every review action uses its state. */
  const review = selectedSubmission
    ? reviewWithLists(selectedSubmission.review)
    : storedReview
      ? reviewWithLists(storedReview)
      : undefined;
  const actionableQuestionIds = useMemo(() => {
    if (!selected || !selectedSubmission) return [];
    return humanInputItems(selectedSubmission.review, {
      company: selected.job_context.company,
      role: selected.job_context.role,
      documents: selectedSubmission.documents,
    })
      .filter((item) => item.settled !== true && item.questionId)
      .map((item) => item.questionId!);
  }, [selected, selectedSubmission]);
  const reviewablePackets = useMemo(() => onlyReviewablePackets(packets ?? []), [packets]);
  const canonicalEnvelopePacket = useMemo(() => (canonicalSelected
    ? (packets ?? []).find((packet) => canonicalApplicationFromPacket(packet)?.id === canonicalSelected.id) ?? null
    : null), [canonicalSelected, packets]);
  /* MEMOISED BECAUSE A useEffect BELOW DEPENDS ON IT, and one of the two branches mints a new object.
   *
   * linkedLegacyPacketFromCanonicalTrackerPacket ends in `{ ...restored, id: legacyId }`, so it
   * returns a fresh identity on every call even when the underlying packet is unchanged. Computed
   * bare, this const therefore changed identity on every render, the cover-letter effect on
   * canonicalGeneratedPacket refired, its .then called setCanonicalCoverLetter with a new object,
   * that re-rendered, and the cycle repeated at the speed of the network.
   *
   * Measured in production on 2026-08-17: GET /applications/<id>/cover-letter about once a second
   * from one open dashboard tab - 16,567 requests in 45 minutes, every one a 200, each with its own
   * CORS preflight. It exhausted the account's general rate limit, which is a shared budget, so
   * unrelated reads elsewhere started answering 429 while nothing appeared wrong on screen.
   *
   * The `.find` branch was always identity-stable (it returns an element of `packets`), which is why
   * this only bit applications whose canonical tracker packet carries a linked legacy packet id. */
  const canonicalGeneratedPacket = useMemo(() => linkedLegacyPacketFromCanonicalTrackerPacket(canonicalEnvelopePacket)
    ?? (canonicalSelected?.legacy_generated_resume_id
      ? (packets ?? []).find((packet) => packet.id === canonicalSelected.legacy_generated_resume_id) ?? null
      : null), [canonicalEnvelopePacket, canonicalSelected, packets]);
  /* THE SAME CHECK selectPacket ITSELF USES, computed here so the detail screen can OFFER the
   * managed send flow rather than being routed into it automatically.
   *
   * Recomputes off `canonicalEnvelopePacket`, which is reactive to `packets` - so once the routing
   * hydration effect below folds a sendable packet back into `packets`, this flips non-null on its
   * own, no separate "hydration found something" flag required. Non-null exactly when
   * CanonicalApplicationDetail should show its "Continue to send" action instead of the
   * extension-only copy. */
  const canonicalReadyToSend = useMemo(
    () => sendableLinkedPacketFromCanonicalEnvelope(canonicalEnvelopePacket),
    [canonicalEnvelopePacket],
  );
  /* WHAT "READY" IS NOT. canonicalReadyToSend answers "is there a sendable packet on a portal Litos
     can submit through", which the detail card was rendering as "Litos can send this application
     for you" over a button reading "Continue to send". Measured 2026-08-29: that button landed on
     unanswered required employer questions. Both facts were true and the card stated only the one
     that flattered it. This is the other one, and it is a count so the card can say what is
     missing rather than merely that something is. */
  const canonicalRequiredQuestionsRemaining = useMemo(() => {
    const review = canonicalReadyToSend?.spec._review;
    if (!review) return 0;
    return unansweredRequiredQuestionCount(review.questions ?? [], review.question_metadata_blockers ?? []);
  }, [canonicalReadyToSend]);
  /* Old deployments stored PACKET_AUDIT_STALE as an attention item. Opening one of those rows is
     itself enough to begin the safe compatibility path: clear any old browser proof, request a
     fresh audit, and remain on review with acknowledgement false. No click is replayed and no send
     endpoint is called. reviewWithLists already removed the obsolete sentence for this render. */
  useEffect(() => {
    if (!selected || !storedReview || !historicalPacketAuditStaleMessage(storedReview)) return;
    const token = `${selected.id}:${storedReview.updated_at}:${storedReview.attention_reason ?? ""}`;
    if (persistedPacketAuditRecoveryRef.current === token) return;
    persistedPacketAuditRecoveryRef.current = token;
    void recoverPacketAuditReview(selected.id, storedReview);
  }, [recoverPacketAuditReview, selected, storedReview]);
  useEffect(() => {
    const applicationId = canonicalSelected?.id;
    const editorRevision = canonicalCoverLetterEditorRevisionRef.current;
    let cancelled = false;
    const requestOwnsSurface = () => !cancelled && canonicalSelectedIdRef.current === (applicationId ?? null);
    const requestMayPublish = () => requestOwnsSurface()
      && canonicalCoverLetterEditorRevisionRef.current === editorRevision
      && !canonicalCoverLetterEditorDirtyRef.current;
    if (canonicalCoverLetterHydrationApplicationRef.current !== (applicationId ?? null)) {
      canonicalCoverLetterHydrationApplicationRef.current = applicationId ?? null;
      queueMicrotask(() => {
        if (requestMayPublish()) setCanonicalCoverLetterJd("");
      });
    }
    if (!applicationId || qaMode !== false) {
      queueMicrotask(() => {
        if (!requestMayPublish()) return;
        setCanonicalCoverLetter(null);
        setCanonicalCoverLetterBody("");
        setCanonicalCoverLetterEditorOpen(false);
        setCanonicalCoverLetterLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
    queueMicrotask(() => {
      if (requestOwnsSurface()) setCanonicalCoverLetterLoading(true);
    });
    void api<CanonicalCoverLetterResponse>(`/applications/${applicationId}/cover-letter`, { cache: "no-store" })
      .then((result) => {
        if (!requestMayPublish()) return;
        setCanonicalCoverLetter(result);
        setCanonicalCoverLetterBody(result.cover_letter.body ?? "");
      })
      .catch((reason) => {
        if (!requestMayPublish()) return;
        if (reason instanceof ApiError && reason.status === 404) {
          setCanonicalCoverLetter(null);
          setCanonicalCoverLetterBody(canonicalGeneratedPacket?.spec._cover_letter?.body ?? "");
          return;
        }
        setCanonicalFillError(reason instanceof Error ? reason.message : "Cover letter could not load.");
      })
      .finally(() => {
        if (requestOwnsSurface()) setCanonicalCoverLetterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canonicalGeneratedPacket, canonicalSelected?.id, qaMode]);
  /* ROUTING HYDRATION, not content hydration.
   *
   * canonicalEnvelopePacket is whatever this page load's merge attached to the selected canonical
   * row - the real linked packet when the merge found one, or the `portal_supported: false`
   * placeholder canonicalTrackerPacket writes when it found nothing. The Tracker click that reached
   * this row already refused to route it into the managed send screens on exactly that placeholder
   * (see selectPacket's sendableLinkedPacketFromCanonicalEnvelope check), which is correct for a
   * genuinely unsupported or tracker-only row and wrong for a row whose real linked packet simply
   * was not in the page this account's merge saw - the same shape of gap PR #383 fixed for packet
   * CONTENT, here for the decision of which screen to show at all.
   *
   * canonicalEnvelopeLegacyHydrationId names the one packet worth fetching to find out, and returns
   * null once a fetch has already attached the right one - or already confirmed there was nothing
   * to attach - which is what stops this from re-firing after it applies its own result below. */
  useEffect(() => {
    const application = canonicalSelected;
    const hydrationId = canonicalEnvelopeLegacyHydrationId(canonicalEnvelopePacket);
    if (!application || !hydrationId || qaMode !== false) {
      // queueMicrotask, not a direct call: react-hooks/set-state-in-effect flags setState called
      // synchronously in an effect body, and the cover-letter effect just above this one already
      // established the pattern for exactly this kind of early "nothing to do here" reset.
      queueMicrotask(() => setCanonicalHydration(null));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setCanonicalHydration({ id: application.id, status: "loading" }));
    api<{ resumes: GeneratedResume[] }>(`/resume/history?application=${encodeURIComponent(hydrationId)}`)
      .then((result) => {
        if (cancelled) return;
        const full = result.resumes.find((resume) => resume.id === hydrationId) ?? null;
        if (!full) {
          // Nothing at that id. Genuinely rare - it means the canonical row names a packet the
          // legacy history no longer has - but it must not be retried on every render, so the
          // outcome is stamped onto the row as SETTLED, not just answered locally. Without this,
          // an unrelated setPackets elsewhere on the page (canonicalTrackerPacket rebuilds every
          // row's object identity) recomputes canonicalEnvelopeLegacyHydrationId back to this same
          // id and refetches it, flipping checkingSendPath back on mid-way through something else.
          setPackets((current) => (current ?? []).map((item) =>
            canonicalApplicationFromPacket(item)?.id === application.id
              ? canonicalEnvelopeWithMissingLegacyHydration(item, hydrationId)
              : item));
          setCanonicalHydration({ id: application.id, status: "done" });
          return;
        }
        /* Rebuilt from the EXACT packet this row names, bypassing canonicalMatchStrength entirely:
           an id fetched by explicit legacy_generated_resume_id needs no fuzzy matching to trust. */
        const hydratedEnvelope = canonicalTrackerPacket(application, full);
        setPackets((current) => (current ?? []).map((item) =>
          canonicalApplicationFromPacket(item)?.id === application.id ? hydratedEnvelope : item));
        setCanonicalHydration({ id: application.id, status: "done" });
        /* NOT A selectPacket CALL HERE, ON PURPOSE.
         *
         * This effect runs from a background fetch with no user gesture behind it - it can resolve
         * a few hundred milliseconds to several seconds after the row was opened, while the student
         * is mid-read of CanonicalApplicationDetail (or an automated driver is mid-way through many
         * Tracker rows). Calling selectPacket from here used to swap the whole screen out for the
         * review flow and force window.scrollTo({ top: 0 }) - moveToScreen does that unconditionally
         * unless told not to - with no gesture attached, which is exactly the "status changes must
         * not move focus/screen unexpectedly" case ACCESSIBILITY.md rules out.
         *
         * Folding the hydrated packet into `packets` above is enough: canonicalEnvelopePacket reads
         * off `packets` reactively, so canonicalReadyToSend (computed with this SAME
         * sendableLinkedPacketFromCanonicalEnvelope check, right below canonicalGeneratedPacket)
         * flips non-null on its own, and CanonicalApplicationDetail swaps its copy and shows a
         * "Continue to send" action the student presses themselves. That press is a real click, so
         * it reaches selectPacket exactly the way every other caller already does. */
      })
      .catch(() => {
        if (!cancelled) setCanonicalHydration({ id: application.id, status: "done" });
      });
    return () => {
      cancelled = true;
    };
  }, [canonicalEnvelopePacket, canonicalSelected, qaMode]);
  /* Computed over EVERY reviewable packet, not over visiblePackets, and that is the whole point.
     A filter of "Needs you" hides the sent Akuna application and leaves the eleven that cannot be
     sent looking like eleven live opportunities. The mark has to know about the row the filter
     just removed. */
  const duplicateMarks = useMemo(() => duplicatePostingMarks(reviewablePackets), [reviewablePackets]);
  /* Memoised for the reason every derivation over this list is: the page holds a 200-row inventory
     and re-renders on a 2.5s poll and on every keystroke in the ledger search box. Computed inline
     in the Board's props it walked all 200 packets and minted a new object on each of those. */
  const boardInventory = useMemo(
    () => ({ total: reviewablePackets.length, sent: pipelineCounts(reviewablePackets).sent }),
    [reviewablePackets],
  );
  const deferredApplicationQuery = useDeferredValue(applicationQuery);
  const visiblePackets = useMemo(() => {
    const filtered = reviewablePackets.filter((packet) =>
      statusMatchesApplicationFilter(packet.spec._review, applicationFilter)
      && applicationMatchesQuery(packet, deferredApplicationQuery)
      /* The "Needs you" queue is meant to be live opportunities to act on, and a row that repeats a
         posting already in the Tracker is not one: an "Already applied" sibling makes the backend
         refuse this send (409 DUPLICATE_APPLICATION), and a plain "Duplicate" is a redundant copy of
         the one standing row for that posting (duplicatePostingMarks now keeps the actionable packet
         as that standing row). Both are dropped from this filter only; Everything still lists and
         badges every packet, so nothing is lost and R-066's write-once packets never disappear. */
      && !(applicationFilter === "action" && duplicateBadge(duplicateMarks.get(packet.id)) !== null));
    return [...filtered].sort((a, b) => {
      if (applicationSort === "company") {
        return (a.job_context.company ?? "").localeCompare(b.job_context.company ?? "");
      }
      if (applicationSort === "next") {
        const priority = applicationNextActionRank(a.spec._review) - applicationNextActionRank(b.spec._review);
        if (priority !== 0) return priority;
      }
      return packetTimestamp(b).localeCompare(packetTimestamp(a));
    });
  }, [applicationFilter, applicationSort, deferredApplicationQuery, reviewablePackets, duplicateMarks]);
  const legacyCount = (packets?.length ?? 0) - reviewablePackets.length;

  /* ---- sending without being asked ----
     The setting itself lives on the server and is shared with Account; this page reads it, shows
     what it is doing while it is on, and gives the student the seconds in which to stop it. */
  const autopilot = useAutopilot(qaMode === false);

  /* Packets the autopilot has already proved it cannot send on its own, this session.
   *
   * THE LOOP USED TO JAM ON THE FIRST ONE. NextMatchCard fires a match exactly once (`fired`), so a
   * refused send left the card counting nothing, the pill reading "Sending" forever, and this memo
   * still choosing the same packet - which meant one un-sendable row stopped every other ready
   * application on the account from being attempted at all. Measured 2026-08-19 on a Five Rings
   * packet answering packet_stale: "0 applied today", and nothing else was ever tried.
   *
   * Held in state rather than derived, because the reason is not on the packet: the server decides
   * it at send time, and the row still looks perfectly ready. Cleared on reload by design - the
   * usual repair is the student opening the row, and reloading after that should let it queue
   * again rather than staying hidden on a stale local decision. */
  const [unsendable, setUnsendable] = useState<ReadonlySet<string>>(() => new Set());
  const autopilotCandidates = useMemo(
    () => reviewablePackets.filter((packet) =>
      !unsendable.has(packet.id)
      /* A badged duplicate would be refused at send (409 DUPLICATE_APPLICATION) or is a redundant
         repeat of the standing row, so the autopilot must never elect one as the next match: the
         old loop jammed on exactly this class of un-sendable row. */
      && duplicateBadge(duplicateMarks.get(packet.id)) === null),
    [reviewablePackets, unsendable, duplicateMarks],
  );

  const nextPacket = useMemo(
    () => qaMode
      ? autopilotCandidates
          .filter((packet) => reviewCanBeSent(packet.spec._review))
          .sort((a, b) => packetTimestamp(b).localeCompare(packetTimestamp(a)))[0] ?? null
      : nextPreferredReadyPacket(autopilotCandidates, currentMatches ?? []),
    [autopilotCandidates, currentMatches, qaMode],
  );

  /* The BASE resume, once, from the same source use-job-match-scores.ts reads. The next-best-match
     row prints a bare percentage beside a company and a role with no document on screen, so it has
     to be the number every other job card carries; scoring the tailored packet here is what made
     one psiquantum posting read 33 on Home and 42% on this row in the same session (ISSUE-038). */
  const [baseResumeText, setBaseResumeText] = useState<string | null>(null);
  useEffect(() => {
    if (qaMode !== false) return;
    let cancelled = false;
    void getBaseResume()
      .then((stored) => !cancelled && stored?.spec && setBaseResumeText(resumeSpecText(stored.spec)))
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [qaMode]);

  /* Keyed by the packet it was measured against. A bare number would survive the card changing
     underneath it and print one job's score on another job's row. */
  const [nextScore, setNextScore] = useState<{ id: string; match: JobMatch | null } | null>(null);
  useEffect(() => {
    if (qaMode !== false || selectedId) return;
    const request = nextMatchScoreRequest(nextPacket, baseResumeText);
    if (!nextPacket || !request) return;
    let cancelled = false;
    /* The SAME question Home and Jobs answer about this posting: how much of what it asks for is on
       the student's base resume. See nextMatchScoreRequest for why the packet is not the subject
       here and why the frozen jd_text yields to the live posting row. */
    void fetchJdMatch(request.jdText, request.resumeText, request.jobContext)
      .then((result) => {
        if (cancelled) return;
        setNextScore({
          id: nextPacket.id,
          // Never a zero we did not measure: unscorable resolves to no number at all.
          match: result.scorable && result.score !== null
            ? { score: result.score, band: result.band?.label ?? null, matched: result.matched.length, total: result.term_count }
            : null,
        });
      })
      // No number rather than a wrong one.
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [baseResumeText, nextPacket, qaMode, selectedId]);

  const nextMatch: NextMatch | null = nextPacket
    ? {
        id: nextPacket.id,
        company: nextPacket.job_context.company ?? "Company",
        role: nextPacket.job_context.role ?? "Role",
        match: nextScore?.id === nextPacket.id ? nextScore.match : null,
      }
    : null;

  /* Counts what was actually sent since midnight, from the submitted_at the server stamped. A
     count of "applications touched today" would climb every time a resume was regenerated, which
     is the number every rival inflates.

     The window and the filter both live in pipeline-counts.ts now, so the day figure and the
     all-time one are read off the same inventory by the same rule. Inlined here, "applied today"
     was the sixth of the six disagreeing figures on 2026-08-29 simply because nothing tied it to
     the other five. */
  const appliedToday = useMemo(() => (
    packets === null ? null : sentSince(reviewablePackets, startOfLocalDay(new Date()))
  ), [packets, reviewablePackets]);

  /* What the countdown reaching zero does. It is the same POST the review screen's own send makes,
     so an unattended send goes through the identical server path, quota and refusal rules as one
     the student clicked. The backend still stops and asks when an answer is missing. */
  const sendWithoutAsking = useCallback(
    async (id: string) => {
      const packet = (packets ?? []).find((item) => item.id === id);
      if (!packet || qaMode) return;
      if (educationProfileStatus !== "ready") {
        setError("We did not send this one on its own. Litos has to check this resume against your current profile first.");
        return;
      }
      /* THE ONE PLACE A PACKET GOES OUT WITH NOTHING RE-CHECKED. Sending from the review screen
         runs saveResume first, and PATCH /applications/:id/resume re-validates the spec's
         education against the current profile server-side, so a drifted packet is refused there
         already (with an opaque message, which the banner below fixes). This path posts
         submit-request on its own, and the backend then uploads the PDF blob rendered at build
         time. So an unattended send is the only way a resume stating a graduation year the
         student has since corrected reaches an employer with no human and no check in between.
         Refusing keeps the packet; it just has to be opened. */
      const drift = educationDriftMessage(educationDrift(packet.spec, educationProfile));
      if (drift) {
        setError(`We did not send this one on its own. ${drift}`);
        return;
      }
      if (packetAuthorityForEmployerAction(packet).state !== "safe_not_sent") {
        setUnsendable((current) => new Set(current).add(id));
        setError("We did not send this one on its own. Its exact prior submission evidence needs review first.");
        return;
      }
      try {
        track("application_submission_requested", { source: "autopilot" });
        const raw = await api<SubmissionResponse>(`/applications/${id}/submit-request`, {
          method: "POST",
          body: JSON.stringify({ questions: packet.spec._review?.questions ?? [] }),
        });
        const result = submissionResponseForDisplay(raw, { packetId: id });
        captureCompletedSubmission(result, "autopilot");
        setPackets((current) => current?.map((item) => (item.id === id ? { ...item, spec: { ...item.spec, _review: result.review } } : item)) ?? current);
      } catch (reason) {
        /* PARK THE ROW BEFORE THE BANNER, or the loop stops here.
         *
         * A packet audit refusal is not transient and the autopilot cannot clear it: the recovery is
         * a fresh audit and a NEW acknowledgement, and that acknowledgement is the applicant's own
         * act. The backend says so at /applications/:id/packet-audit/acknowledge - it "must never be
         * preceded by a machine-written one" - so an unattended re-acknowledge would forge her
         * review of a PDF she never saw, on the one path that reaches an employer with nobody in
         * between. The honest move is to stop trying this row and try the next one.
         *
         * Keyed on `code`, not on the message: the sentence is copy and will be reworded, and the
         * previous version of this branch is the reason a raw `packet_stale` was on screen at all. */
        const code = auditRefusalCode(reason);
        if (code) {
          setUnsendable((current) => new Set(current).add(id));
          return;
        }
        /* Stays in the page banner, deliberately, and is NOT a composer refusal. Nobody pressed a
           composer button: this is the countdown on NextMatchCard reaching zero, or that card's own
           Send. Routing it into the composer would put an answer about the autopilot next to a
           button that did not ask, in a panel that is usually closed when this fires. */
        setError(reason instanceof Error ? reason.message : "Could not send that application on its own. It is still here for you.");
      }
    },
    [captureCompletedSubmission, educationProfile, educationProfileStatus, packets, qaMode],
  );
  // The review surface is meant to be read without scrolling, so while it is open the page chrome
  // above it shrinks to what is still useful: the title stays for orientation, the tagline and the
  // legacy-resumes banner go, because together they cost roughly 120px of the one screen the JD and
  // the resume are supposed to share.
  const reviewOpen = Boolean(selected && spec && review) && screen === "review";
  /* The rail folds itself down the moment this side-by-side view is what's on screen: the JD pane
     and the resume pane are the whole reason the review surface above gave up its own vertical
     space, and a 272px rail was the same trade horizontally. No rising-edge tracking needed: this
     effect's dependency array already only re-runs on a reviewOpen value change, and requestCollapse
     only ever collapses, so a student's own click back open during an already-open review is never
     clobbered by a render where reviewOpen hasn't changed. */
  const { requestCollapse } = useSidebarCollapse();
  useEffect(() => {
    if (reviewOpen) requestCollapse();
  }, [reviewOpen, requestCollapse]);
  const applicationTaskOpen = Boolean(openingApplicationId || canonicalSelected || selectedId);
  const applicationTaskPacket = selected
    ?? reviewablePackets.find((packet) => packet.id === openingApplicationId || packet.id === selectedId)
    ?? canonicalEnvelopePacket;
  const applicationTaskRole = applicationTaskPacket?.job_context.role ?? canonicalSelected?.role ?? "Application";
  const applicationTaskCompany = applicationTaskPacket?.job_context.company ?? canonicalSelected?.company ?? "Company";
  const applicationTaskReview = selectedSubmission?.review
    ?? applicationTaskPacket?.spec._review;
  const applicationTaskStatus = applicationTaskReview
    ? statusLabel(false, applicationTaskReview.status)
    : canonicalSelected?.review_state.replaceAll("_", " ") ?? "Opening";
  const selectedApplicationRowId = canonicalSelected?.id
    ?? (selected ? canonicalIdByPacketId[selected.id] ?? selected.id : openingApplicationId);

  /**
   * Take the row off the Tracker.
   *
   * OPTIMISTIC, and safe to be: the server refuses anything already sent, so the only rows that
   * reach a success here are ones that never went to an employer. On a refusal the row is put back
   * and the server's own reason is shown, because "this was already sent" is the answer the student
   * needs, not a generic failure.
   */
  const removeFromTracker = useCallback(async (packet: GeneratedResume) => {
    const applicationId = canonicalApplicationFromPacket(packet)?.id;
    if (!applicationId) {
      setRemoveError("Litos cannot remove this row yet. Reload the page and try again.");
      return;
    }
    setRemovingApplicationId(packet.id);
    setRemoveError(null);
    try {
      await removeApplicationFromTracker(applicationId);
      /* Drop it locally rather than refetching the whole ledger: the row is gone from the server's
         list too, so a refetch would only cost a round trip to learn the same thing. */
      setPackets((current) => current?.filter((row) => row.id !== packet.id) ?? current);
      setConfirmRemoveId(null);
      if (packet.id === selectedApplicationRowId) closeApplication();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setRemoveError(message || "Litos could not remove this application. Try again.");
      setConfirmRemoveId(null);
    } finally {
      setRemovingApplicationId(null);
    }
  }, [closeApplication, selectedApplicationRowId]);

  /* Only the task surface moves. The packet viewer and document dialog stay outside this keyed
     boundary, so a poll-driven screen change cannot remount an open modal or disturb its focus.
     A stable transition name lets React pair the old and new snapshots, while the key changes only
     when the application or its actual task screen changes. */
  const applicationTaskPanelKey = canonicalSelected
    ? `canonical-${canonicalSelected.id}`
    : selected && spec && review
      ? `packet-${selected.id}-${screen}`
      : selectedId
        ? `unavailable-${selectedId}`
        : packets === null
          ? "loading"
          : "ledger";
  useEffect(() => {
    if (!applicationTaskOpen || !pendingApplicationFocusRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      applicationTaskHeadingRef.current?.focus({ preventScroll: true });
      pendingApplicationFocusRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [applicationTaskOpen, applicationTaskPanelKey, switcherOpen]);
  useEffect(() => {
    const pending = pendingApplicationLandingFocusRef.current;
    if (applicationTaskOpen || !pending) return;
    const frame = window.requestAnimationFrame(() => {
      const row = [...document.querySelectorAll<HTMLButtonElement>("[data-application-row-id]")]
        .find((button) => button.dataset.applicationRowId === pending.rowId && button.getClientRects().length > 0);
      const ledgerHeading = document.getElementById("application-ledger-heading");
      const target = row ?? (ledgerHeading instanceof HTMLElement ? ledgerHeading : null);
      target?.focus({ preventScroll: true });
      pendingApplicationLandingFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [applicationTaskOpen, visiblePackets]);
  const educationDriftBanner = useMemo(
    () => (spec ? educationDriftMessage(educationDrift(spec, educationProfile)) : null),
    [educationProfile, spec],
  );
  const deferredSpec = useDeferredValue(spec);
  const editedTerms = useMemo(() => explicitTerms(review?.edited_terms ?? []), [review?.edited_terms]);
  const requirementIndex = useMemo(
    () => (matchResult ? buildRequirementIndex(matchResult.matched, matchResult.missing) : EMPTY_REQUIREMENT_INDEX),
    [matchResult],
  );
  const packetDraftChanged = Boolean(selected && spec && JSON.stringify(spec) !== JSON.stringify(stripMetadata(selected.spec)));
  const currentQuestionsSnapshot = useMemo(() => packetQuestionsSnapshot(questions), [questions]);
  const questionEditsUnsaved = Boolean(
    selectedSubmission
    && selectedSubmission.application_id === selected?.id
    && currentQuestionsSnapshot !== packetQuestionsSnapshot(selectedSubmission.review.questions),
  );
  /* A COMPLETED MEASUREMENT SUPERSEDES THE PRE-SCAN, and the field's tri-state says which one
     this is. The backend writes `question_metadata_blockers` onto the review ONLY when a run's
     discovery metadata measurement is complete, so `undefined` means no run has measured the form
     yet and the pre-scan's client-side blockers are the best knowledge there is. A present list,
     empty included, is the run's own reading of the same form and outranks the pre-scan it
     re-measured. Unioning the two forever deadlocked a live Breezy packet on 2026-09-01: the
     pre-scan had recorded one field's choices unreadable, a later fill run read the whole form and
     reported no blockers, and the client still gated every screen on the stale pre-scan entry.
     "Waiting for a complete form read" then pointed at a read that had already happened, and the
     only control that could clear prescriptMetadata was hidden behind the packet review that the
     same stale blocker kept voiding. */
  const measuredQuestionMetadataBlockers = selectedSubmission?.review.question_metadata_blockers;
  const activeQuestionMetadataBlockers = measuredQuestionMetadataBlockers !== undefined
    ? measuredQuestionMetadataBlockers
    : prescriptMetadata;
  /* The lookahead issue is the pre-scan's own progress verdict, so it is superseded on exactly the
     same tri-state: once a run has measured the form, a pre-scan that could not finish reading it
     is history, not a gate. */
  const activePrescriptLookaheadIssue = measuredQuestionMetadataBlockers !== undefined
    ? null
    : prescriptLookaheadIssue;
  const canRefreshRequiredMetadataFromReview = requiredQuestionReviewRoute(
    questions,
    activeQuestionMetadataBlockers,
  ).kind === "metadata_refresh";
  const activePacketEvidence = selected && packetEvidence?.applicationId === selected.id ? packetEvidence : null;
  const exactPacketPdfReady = Boolean(activePacketEvidence?.pdfVerified);
  const packetAuditBindingReady = Boolean(
    selected
    && activePacketEvidence
    && packetAuditResponseMatchesApplication(selected.id, activePacketEvidence.response),
  );
  const auditedDisplayReady = Boolean(
    review
    && activePacketEvidence
    && packetAuditDisplayIsExact(review.jd_text, activePacketEvidence.response.packet_audit),
  );
  const packetEvidenceReady = Boolean(
    selected
    && spec
    && activePacketEvidence
    && exactPacketPdfReady
    && packetAuditBindingReady
    && auditedDisplayReady
    && deferredSpec === spec
    && !packetDraftChanged
    && activePacketEvidence.specJson === JSON.stringify(spec)
    && activePacketEvidence.questionsSnapshot === currentQuestionsSnapshot,
  );
  const packetEvidenceNeedsFreshAudit = Boolean(
    activePacketEvidence
    && deferredSpec === spec
    && (packetDraftChanged
      || !packetAuditBindingReady
      || !auditedDisplayReady
      || activePacketEvidence.specJson !== JSON.stringify(spec)
      || activePacketEvidence.questionsSnapshot !== currentQuestionsSnapshot),
  );
  const packetEvidenceReviewed = Boolean(packetEvidenceReady && activePacketEvidence?.acknowledged);
  const manualTrialEvidence = selected
    && activePacketEvidence
    && manualTrialPacketEvidenceIsFresh(selected.id, activePacketEvidence)
    ? activePacketEvidence
    : null;
  /* THE AUDIT BRANCH MUST NOT REPORT A ZERO IT NEVER MEASURED. `clauses.filter(verdict ===
     "missing").length` is 0 both when the audit found no gaps and when it could not score a single
     clause, and those two render identically as "(0)" - a green-lit all-clear sitting directly above
     the submit control. Observed 2026-08-26 on the Flow Traders packet: the audit returned ONE
     clause, verdict "unscoreable", so the key read "asked for, not on your resume (0)" while
     /jd-match had six missing terms for that same posting (economics, excel, mathematics,
     researchers, statistics, technology) and the job description on screen literally read
     "Proficiency in Excel". A clause is evidence about coverage only if it was actually scored, so
     count the scored ones first and fall through to null - "not checked" - when there are none. */
  const auditedClauses = activePacketEvidence && auditedDisplayReady
    ? activePacketEvidence.response.packet_audit.clauses
    : null;
  const auditedScoredClauses = auditedClauses?.filter(
    (clause) => clause.verdict === "covered" || clause.verdict === "missing",
  ) ?? null;
  const authoritativeMissingCount = auditedScoredClauses
    ? (auditedScoredClauses.length > 0
      ? auditedScoredClauses.filter((clause) => clause.verdict === "missing").length
      : null)
    : !activePacketEvidence && matchResult?.scorable ? matchResult.missing.length : null;
  const authoritativeEditedCount = activePacketEvidence && auditedDisplayReady
    ? activePacketEvidence.response.packet_audit.clauses
      .flatMap((clause) => clause.highlight_terms)
      .filter((term) => term.tone === "edited").length
    : !activePacketEvidence ? editedTerms.size : 0;
  /* THE KEY IS A PROMISE ABOUT MARKS THAT ARE ON THE PAGE, so it may not outlive them. It used to
     render unconditionally, which meant that in exact-packet mode - where the job description paints
     only the audit's validated highlight terms and the resume pane is a rasterised PDF that cannot
     carry a mark at all - it described a two-colour system over two panes containing no colour
     whatsoever. Observed 2026-08-26 on the Flow Traders packet: zero <mark> elements anywhere on the
     page, both swatches still displayed. Gate it on the marks each branch will actually produce -
     the audit's validated ranges in packet mode, the requirement index in draft mode - and say so
     plainly when there are none, because a legend for absent colour reads as "you missed something".
     Note this is deliberately NOT gated on `authoritativeMissingCount`: an all-covered posting has a
     live blue code and a truthful "(0)", and must keep its legend. */
  /* An unscoreable clause now carries a colour of its own, so it counts as a live colour code: a
     posting where every clause went unchecked has nothing blue or amber on it but is emphatically
     something the student needs to read. */
  const auditedUnscoreableCount = activePacketEvidence && auditedDisplayReady && review
    ? (exactPacketAuditClauses(review.jd_text, activePacketEvidence.response.packet_audit) ?? [])
      .filter((clause) => clause.verdict === "unscoreable").length
    : 0;
  const requirementColourCodeIsLive = activePacketEvidence
    ? Boolean(
      auditedDisplayReady
      && review
      && ((exactPacketAuditRanges(review.jd_text, activePacketEvidence.response.packet_audit)?.length ?? 0) > 0
        || auditedUnscoreableCount > 0),
    )
    : requirementIndex.tone.size > 0;
  /* The draft (unaudited) surfaces render and score a cleaned capture: the stored jd_text on an
     apply-page capture carries the employer's FORM (field labels, "SUBMIT YOUR APPLICATION",
     "Loading"), which read as a broken scrape under the Job description heading and put junk terms
     like "loading" into the match. The audited path keeps the raw text: its clause ranges are
     offsets into the exact stored capture. */
  const draftJd = useMemo(() => cleanJdCapture(review?.jd_text), [review?.jd_text]);
  const packetEvidenceBlocker = !review?.jd_text?.trim()
    ? "The saved job description is missing, so Litos cannot prove what this resume was written against."
    : packetDraftChanged || deferredSpec !== spec
      ? "Save and re-audit the latest resume edits before continuing."
      : !activePacketEvidence
        ? "Litos must audit the exact saved PDF and requirement evidence before continuing."
        : !packetAuditBindingReady
          ? "The packet audit does not match this application and exact PDF. Audit it again."
          : activePacketEvidence.specJson !== JSON.stringify(spec)
            ? "The resume changed after the packet audit. Audit this packet again."
            : !auditedDisplayReady
              ? "The saved requirement evidence does not match this job description."
              : !exactPacketPdfReady
                ? "The exact audited PDF must finish loading before continuing."
                : activePacketEvidence.questionsSnapshot !== currentQuestionsSnapshot
                  ? "The answers changed after the packet audit. Audit this packet again."
                  : null;
  const reviewPrimaryBusy = saving || coverLetterBusy || packetAuditBusy;
  const reviewPrimaryDisabled = reviewPrimaryBusy
    || !review?.jd_text.trim()
    || Boolean(activePacketEvidence && !packetEvidenceReady && !packetEvidenceNeedsFreshAudit);
  const reviewPrimaryLabel = !activePacketEvidence
    ? review?.status === "ready_for_final_approval"
      ? "Review and send"
      : "Review and fill"
    : packetEvidenceNeedsFreshAudit
      ? "Audit again"
      : !exactPacketPdfReady
        ? "Loading exact PDF"
        : !packetEvidenceReady
          ? "Checking saved packet"
      : review?.status === "ready_for_final_approval"
        ? "Review filled form"
        : "Approve packet and fill form";
  const reviewPrimaryAction = packetEvidenceReady
    ? canRefreshRequiredMetadataFromReview
      ? () => void continueFromVerifiedPacket({
        allowServerAnswerRefresh: true,
        failureScreen: "questions",
        source: "metadata_refresh",
      })
      : () => void continueFromVerifiedPacket()
    : packetEvidenceNeedsFreshAudit ? auditPacketAgain : continueFromResume;

  const recordPacketPdfVerification = useCallback((verified: PacketPdfEvidenceVerification | null) => {
    setPacketEvidence((current) => reconcilePacketPdfVerification(current, verified));
  }, []);

  /* Every edit the student makes to the draft goes through here so the posting id cannot outlive
     the posting it describes. Retyping the company or the role means this is no longer the job
     that was opened from the list, and an id kept across that edit would mark THAT row "Applied"
     on the strength of an application to something else: the same false positive the id exists to
     remove, just arrived at from the other direction. Changing the link or the description is not
     a change of identity, so those leave it alone. */
  function applyDraftEdit(next: NewApplicationDraft) {
    // The refusal described the form as it was. Typing is the student answering it.
    setComposerRefusal(null);
    setNewApplication((current) => {
      const identityChanged = next.company !== current.company
        || next.role !== current.role
        || next.portalUrl !== current.portalUrl;
      return identityChanged ? { ...next, jobId: null, canonicalApplicationId: null } : next;
    });
  }

  /* "Read job" is the composer's other button, and every one of these three answers is about the
     Job URL box six pixels away. They went to the page banner until ISSUE-043; the first two are
     the same class of validation ISSUE-040 moved for "Make my resume" and were simply missed. */
  async function fetchJobDescription() {
    const portalUrl = newApplication.portalUrl.trim();
    if (!portalUrl) {
      refuseInComposer("url", "Add the job link first, then get the description.", ["portalUrl"]);
      return;
    }
    try {
      if (new URL(portalUrl).protocol !== "https:") throw new Error("Job URL must use HTTPS");
    } catch {
      refuseInComposer("url", "Enter a complete job URL beginning with https://.", ["portalUrl"]);
      return;
    }
    setExtractingJd(true);
    setComposerRefusal(null);
    setError(null);
    setNotice(null);
    try {
      const extracted = await api<{ jd_text: string; page_title?: string; company?: string; role?: string }>("/jobs/extract", {
        method: "POST",
        body: JSON.stringify({ job_url: portalUrl }),
      });
      /* The posting's identity rides with its text when the monitor holds the posting. Only a blank
         box is filled: a company or role the student already typed is hers, and a read that came
         back with neither leaves both boxes exactly as they were. Measured 2026-09-02 on a Crelate
         link: the description arrived, both boxes stayed empty, and "Tailor resume first" stayed
         disabled until she typed the company and role back in by hand. */
      const fillBlank = (current: string, found: string | undefined) => (current.trim() ? current : (found ?? "").trim());
      setNewApplication((current) => ({
        ...current,
        jobDescription: extracted.jd_text,
        company: fillBlank(current.company, extracted.company),
        role: fillBlank(current.role, extracted.role),
      }));
      setNotice("Pulled the job description from that URL. Skim it before generating - some boards need a manual paste instead.");
    } catch (err) {
      // A 502 here is expected for some client-rendered boards (see backend jobExtract.ts) - the
      // manual textarea right below stays the fallback, this just saves the copy/paste when it works.
      /* No fields marked: a board that will not give up its text is not the student's URL being
         wrong, and border-danger on the box they typed correctly reads as an accusation. */
      refuseInComposer("url", err instanceof ApiError ? err.message : "We could not read that page. Paste the job description below instead.", []);
    } finally {
      setExtractingJd(false);
    }
  }

  async function tailorCanonicalApplication(
    application: CanonicalApplication,
    upgradeTrigger: HTMLElement | null,
  ) {
    const requestScope = beginCanonicalRequest(application.id, "tailoring");
    const draft: NewApplicationDraft = {
      company: application.company,
      role: application.role,
      portalUrl: application.portal_url ?? "",
      jobDescription: "",
      jobId: application.job_id ?? null,
      canonicalApplicationId: application.id,
    };
    // Check access before loading or extracting the posting. A locked action should open the
    // shared continuation modal immediately, with unlimited Free filling still available.
    if (canUse("ai_resume_tailoring") !== true) {
      await createApplication(draft, upgradeTrigger, requestScope);
      return;
    }
    setCreating("tailor");
    setCanonicalFillError(null);
    setNotice(null);
    try {
      const jobDescription = application.job_id
        ? (await api<{ job: MonitoredJob }>(`/jobs/${encodeURIComponent(application.job_id)}`)).job.description
        : (await api<{ jd_text: string }>("/jobs/extract", {
          method: "POST",
          body: JSON.stringify({ job_url: application.portal_url }),
        })).jd_text;
      if (!canonicalRequestMayPublish(requestScope)) return;
      if (jobDescription.trim().length < 20) throw new Error("The saved job description is incomplete.");
      await createApplication({ ...draft, jobDescription }, upgradeTrigger, requestScope);
    } catch (reason) {
      if (!canonicalRequestMayPublish(requestScope)) return;
      setNewApplication(draft);
      setShowNewApplication(true);
      commitCanonicalSelection(null);
      refuseInComposer(
        "action",
        reason instanceof Error
          ? `${reason.message} Paste the exact job description below, then choose Tailor resume.`
          : "Litos could not read this posting. Paste the exact job description below, then choose Tailor resume.",
        ["jobDescription"],
      );
    } finally {
      if (canonicalRequestOwnsLifecycle(requestScope)) setCreating(null);
    }
  }

  /* Takes the draft explicitly for Tracker retries and manual fallbacks. The panel's own button
     passes nothing and reads the current composer state. Every real call still starts from a
     visible click, because reserving the employer tab later in a route effect is popup-blocked. */
  /* ASK HER THE EXTRA QUESTIONS HERE, at Apply, instead of discovering them mid-run.
   *
   * Until now the first anyone heard of a question Litos cannot answer was after the packet was
   * built, a browser was open, and the run had stopped: she then had to find the stalled
   * application and come back to it. Litos owns the board, so the posting's form can be read
   * before any of that, and the handful of questions that genuinely need her can be put in front
   * of her while she is still looking at the job.
   *
   * A failed or incomplete read keeps this packet on the questions screen. An empty result is safe
   * only when the server explicitly says the employer form was read completely.
   *
   * The answers land in the SAME `questions` state that "Check the answers" edits, and from Apply
   * they travel out through the same POST /applications/:id/submit-request. An answer typed on a
   * run that has ALREADY stopped has no such request ahead of it, so it is written where it is
   * typed, through PUT /applications/:id/review/answers. Two screens, one state, and the route each
   * one saves through is the difference between them. See saveReviewedAnswers.
   */
  /* Save on the APPLY questions screen, and only that screen. Keeps the answers and hands her back
   * the resume.
   *
   * The answers stay in `questions`, which is the same state continueFromResume passes to
   * prepareApplication, so they ride into the packet on the next step with nothing re-entered and
   * no second request. "Filled in immediately" means the packet is built with her answers already
   * in it, not that it is sent the moment she types one.
   *
   * THIS IS A LOCAL SAVE AND THAT IS ONLY TRUE HERE. The submit-request she is two screens away
   * from is what carries these answers to the server, so nothing is lost by not writing now, and
   * starting a submission because she answered a question would take a screen away from her.
   *
   * The OTHER screen this component serves has no such request coming. A packet at needs_attention
   * is a run that already stopped; there is nothing further along the path to carry an answer, so a
   * local-only save there is not a save at all. It had this handler anyway, and every answer typed
   * on a stalled run was discarded with the tab. See saveReviewedAnswers. */
  function saveApplyAnswers() {
    if (prescriptLookaheadIssue
      || requiredQuestionReviewRoute(questions, prescriptMetadata).kind !== "continue"
      // Editable questions only: a metadata-blocked control owes the refresh run a read, not her a decision.
      || questionReviewPresentation(questions, prescriptMetadata).editableQuestions.some(optionalQuestionNeedsDecision)) return;
    setPrescriptNote("");
    setFocusQuestion(null);
    moveToScreen("review");
    setNotice("Saved. Check the resume, then send it and Litos will put these answers on the form.");
  }

  async function askPrescriptQuestions(jobId: string) {
    const applicationId = selectedIdRef.current;
    setPrescriptRetrying(true);
    try {
      const prescript = await getPostingQuestions(jobId);
      if (selectedIdRef.current !== applicationId) return;
      const asked = prescriptEditableQuestions(prescript);
      const blockers = prescriptMetadataBlockers(prescript);
      const progressBlocked = prescriptBlocksProgress(prescript);
      setQuestions((current) => mergeDiscoveredQuestions(current, asked));
      setPrescriptMetadata(blockers);
      setPrescriptLookaheadIssue(progressBlocked
        ? {
          jobId,
          message: blockers.length > 0 || prescript.discovery_status === "metadata_incomplete"
            ? "Litos found an employer field whose exact wording or choices are incomplete. Read the company form again before continuing."
            : "Litos could not finish reading the company form. Try the form read again before continuing.",
        }
        : null);
      setPrescriptNote(prescriptSummary(prescript));
      setFocusQuestion(null);
      if (prescriptNeedsHer(prescript)) {
        moveToScreen("questions");
      } else if (screenRef.current === "questions") {
        moveToScreen("review");
        setNotice("The employer form is fully read. Check the resume before continuing.");
      }
    } catch {
      if (selectedIdRef.current !== applicationId) return;
      setPrescriptLookaheadIssue({
        jobId,
        message: "Litos could not verify the employer questions. Try reading the company form again before continuing.",
      });
      setFocusQuestion(null);
      moveToScreen("questions");
    } finally {
      if (selectedIdRef.current === applicationId) setPrescriptRetrying(false);
    }
  }

  async function fillApplication(
    draft: NewApplicationDraft = newApplication,
    errorSurface: "composer" | "tracker" | "submission" = "composer",
  ) {
    if (draft.jobId) {
      await prepareMonitoredApplication(draft, errorSurface);
      return;
    }
    const company = draft.company.trim();
    const role = draft.role.trim();
    const portalUrl = draft.portalUrl.trim();
    const reportFailure = (message: string, fields: ApplicationDraftField[] = []) => {
      if (errorSurface === "tracker") {
        setCanonicalFillError(message);
        setSubmissionFillError(null);
        setError(null);
      } else if (errorSurface === "submission") {
        setSubmissionFillError(message);
        setCanonicalFillError(null);
        setError(null);
      } else {
        refuseInComposer("action", message, fields);
      }
    };
    const missing = ([
      ["company", company],
      ["role", role],
      ["portalUrl", portalUrl],
    ] as const).filter(([, value]) => !value).map(([field]) => field as ApplicationDraftField);
    if (missing.length > 0) {
      reportFailure("Add the company, role, and job URL first.", missing);
      return;
    }
    if (!isHttpsJobUrl(portalUrl)) {
      reportFailure("Enter a complete job URL beginning with https://.", ["portalUrl"]);
      return;
    }
    setComposerRefusal(null);
    setCanonicalFillError(null);
    setSubmissionFillError(null);
    setCreating("fill");
    setError(null);
    setNotice(null);
    let companyTab: Window | null = null;
    try {
      if (qaMode) {
        setFillReceipt({
          application_id: `qa-fill-${Date.now()}`,
          status: "ready_for_review",
          application_fill: true,
          automatic_submission_allowed: false,
          requires_final_submit: true,
          needs_user: [],
          selected_resume_artifact_id: null,
          company,
          role,
          portalUrl,
        });
      } else {
        // Reserve a browser-created tab synchronously while this still belongs to the click. The
        // exact employer URL is not loaded until the extension has adopted this account and
        // explicitly acknowledged the canonical fill-only binding.
        companyTab = window.open("about:blank", "_blank");
        if (!companyTab) {
          reportFailure("Chrome blocked the company tab. Allow pop-ups for Litos, then try again.");
          return;
        }
        try {
          companyTab.opener = null;
          companyTab.document.body.textContent = "Litos is checking the extension and preparing this application.";
        } catch {
          companyTab.close();
          companyTab = null;
          reportFailure("Litos could not prepare a safe company tab. Nothing was opened.");
          return;
        }

        const extension = await ensureCurrentExtensionSession({ token: getToken(), guest: isGuestSession() });
        if (!extension.installed || !extension.signedIn || extension.otherAccount || extension.updateRequired) {
          throw new Error(extension.updateRequired
            ? "Update the Litos extension from the Chrome Web Store, then try again."
            : extension.otherAccount
              ? "The Litos extension is signed in to another account. Sign out there, then try again."
              : "Install the Litos extension and sign in to this account before filling the company form.");
        }
        const created = await api<{ application: CanonicalApplication; created: boolean }>("/applications", {
          method: "POST",
          body: JSON.stringify({
            ...(draft.jobId ? { job_id: draft.jobId } : {}),
            company,
            role,
            portal_url: portalUrl,
            source: "dashboard",
            source_surface: "dashboard",
          }),
        });
        setPackets((current) => current
          ? upsertCanonicalApplicationHistory(current, created.application)
          : current);
        const filled = await api<ApplicationFillResponse>(`/applications/${encodeURIComponent(created.application.id)}/fill`, { method: "POST" });
        const trackedApplication = filled.application ?? created.application;
        setPackets((current) => current
          ? upsertCanonicalApplicationHistory(current, trackedApplication)
          : current);
        setCanonicalSelected((current) => current?.id === trackedApplication.id ? trackedApplication : current);

        const handoff = filled.handoff;
        const expectedPortal = created.application.portal_url;
        const expectedFillDataUrl = `/applications/${created.application.id}/fill-data`;
        if (
          !handoff
          || handoff.mode !== "extension_portal_fill"
          || handoff.extension_required !== true
          || handoff.application_id !== created.application.id
          || handoff.portal_url !== expectedPortal
          || handoff.fill_data_url !== expectedFillDataUrl
        ) {
          throw new Error("Litos could not verify the exact fill handoff. Nothing was opened.");
        }
        await startFreeFillThroughExtension({
          applicationId: handoff.application_id,
          portalUrl: handoff.portal_url,
        });
        if (companyTab.closed) throw new Error("The company tab closed before Litos could open the form. Try again.");
        companyTab.location.replace(handoff.portal_url);
        setFillReceipt({ ...filled, company, role, portalUrl: handoff.portal_url });
        track("application_fill_handoff_armed", {
          source: draft.jobId ? "monitored_job" : "manual",
          automatic_submission: false,
        });
      }
      if (errorSurface === "composer") {
        setNewApplication(EMPTY_APPLICATION_DRAFT);
        forgetCheckoutDraft();
        setShowNewApplication(false);
        replaceClosedComposerUrl(window.location, (data, unused, url) => window.history.replaceState(data, unused, url));
      }
    } catch (reason) {
      companyTab?.close();
      reportFailure(reason instanceof Error ? reason.message : "Litos could not prepare this form. Your job details are still here.");
    } finally {
      setCreating(null);
    }
  }

  async function prepareMonitoredApplication(
    draft: NewApplicationDraft,
    errorSurface: "composer" | "tracker" | "submission" = "composer",
  ) {
    const jobId = draft.jobId;
    if (!jobId || managedPrepareRef.current === jobId) return;
    const reportFailure = (message: string) => {
      if (errorSurface === "tracker") {
        setCanonicalFillError(message);
        setSubmissionFillError(null);
        setError(null);
      } else if (errorSurface === "submission") {
        setSubmissionFillError(message);
        setCanonicalFillError(null);
        setError(null);
      } else {
        refuseInComposer("action", message, []);
      }
    };
    managedPrepareRef.current = jobId;
    setCreating("fill");
    setComposerRefusal(null);
    setCanonicalFillError(null);
    setSubmissionFillError(null);
    setError(null);
    setNotice("Litos is preparing this application with your main resume. Nothing has been sent.");
    try {
      const rawPrepared = await api<unknown>("/applications/managed-prepare", {
        method: "POST",
        body: JSON.stringify({ job_id: jobId, resume_source: "main_resume" }),
      });
      const prepared = managedPrepareAuthorityEnvelopeFromUnknown(rawPrepared);
      if (!prepared
        || (draft.canonicalApplicationId && prepared.application_id !== draft.canonicalApplicationId)) {
        throw new Error("Litos could not verify that the prepared packet belongs to this application. Nothing was opened or sent.");
      }
      if (managedPrepareRef.current !== jobId) return;
      const [history, canonical] = await Promise.all([
        api<{ resumes: GeneratedResume[] }>(`/resume/history?application=${encodeURIComponent(prepared.packet_id)}`),
        api<{ applications: CanonicalApplication[] }>("/applications?limit=200"),
      ]);
      if (managedPrepareRef.current !== jobId) return;
      const preparedCanonical = canonical.applications.find((application) => application.id === prepared.application_id);
      const storedPacket = history.resumes.find((packet) => packet.id === prepared.packet_id);
      if (!managedPrepareAuthorityMatchesPacket(
        prepared,
        draft.canonicalApplicationId,
        preparedCanonical,
        storedPacket,
      )) {
        throw new Error("Litos could not verify that the prepared packet belongs to this application. Nothing was opened or sent.");
      }
      const exactReview = reviewWithLists(prepared.review);
      const legacy = history.resumes.map((packet) => packet.id === prepared.packet_id
        ? { ...packet, spec: { ...packet.spec, _review: exactReview } }
        : packet);
      const merged = mergeCanonicalApplicationHistory(legacy, canonical.applications);
      const preparedPacket = withRestoredLinkedPackets(merged).find((packet) => packet.id === prepared.packet_id);
      if (!preparedPacket) {
        throw new Error("Litos prepared the application but could not reopen its exact packet. Reload Applications to continue.");
      }
      setCanonicalIdByPacketId(Object.fromEntries(canonical.applications
        .filter((application): application is CanonicalApplication & { legacy_generated_resume_id: string } => Boolean(application.legacy_generated_resume_id))
        .map((application) => [application.legacy_generated_resume_id, application.id])));
      setPackets(merged);
      openApplication(preparedPacket, { history: "replace" });
      if (prepared.state !== "preparing") moveToScreen("review");
      setNewApplication(EMPTY_APPLICATION_DRAFT);
      forgetCheckoutDraft();
      setShowNewApplication(false);
      setNotice(prepared.state === "preparing"
        ? "Litos is reading and filling the employer form with your main resume. Nothing has been sent."
        : prepared.reused
          ? "Your existing prepared application is open for review. Nothing has been sent."
          : "Prepared in Litos with your main resume. Review the exact packet before continuing.");
      track("application_fill_prepared", {
        source: "monitored_job",
        state: prepared.state,
        reused: prepared.reused,
      });
    } catch (reason) {
      reportFailure(reason instanceof Error
        ? reason.message
        : "Litos could not prepare this application. Your job details are still here.");
    } finally {
      if (managedPrepareRef.current === jobId) managedPrepareRef.current = null;
      setCreating(null);
    }
  }

  async function createApplication(
    draft: NewApplicationDraft = newApplication,
    upgradeTrigger: HTMLElement | null = null,
    inheritedCanonicalRequestScope: CanonicalRequestScope | null = null,
  ) {
    const requestIsCurrent = () => applicationsMountedRef.current;
    const canonicalRequestScope = draft.canonicalApplicationId
      ? inheritedCanonicalRequestScope ?? beginCanonicalRequest(draft.canonicalApplicationId, "tailoring")
      : null;
    const requestMayPublish = () => canonicalRequestScope
      ? canonicalRequestMayPublish(canonicalRequestScope)
      : requestIsCurrent();
    const requestOwnsLifecycle = () => canonicalRequestScope
      ? canonicalRequestOwnsLifecycle(canonicalRequestScope)
      : requestIsCurrent();
    const canonicalReturnRoute = draft.canonicalApplicationId
      ? `/dashboard/applications?application=${encodeURIComponent(draft.canonicalApplicationId)}&intent=detail&checkout_action=tailor`
      : "/dashboard/applications?new=1&checkout_action=tailor";
    const openTailoringUpgrade = (source: "proactive" | "server_denial") => {
      const trigger = applicationUpgradeFocusTarget(
        upgradeTrigger,
        draft.canonicalApplicationId ? "application-ledger-heading" : "new-application-heading",
      );
      openUpgrade({
        feature: "ai_resume_tailoring",
        placement: draft.canonicalApplicationId ? "canonical_application_detail" : "application_composer",
        trigger: source === "server_denial" ? "server_entitlement_denial" : "tailor_resume",
        manualLabel: "Fill with my main resume",
        applicationId: draft.canonicalApplicationId ?? undefined,
        returnRoute: canonicalReturnRoute,
        onBeforeCheckout: () => rememberCheckoutDraft(draft),
        onManual: () => void fillApplication(draft, draft.canonicalApplicationId ? "tracker" : "composer"),
      }, source === "server_denial"
        ? { source: "server_denial", trigger }
        : { trigger });
    };
    if (canUse("ai_resume_tailoring") !== true) {
      if (requestMayPublish()) openTailoringUpgrade("proactive");
      return;
    }
    const company = draft.company.trim();
    const role = draft.role.trim();
    const portalUrl = draft.portalUrl.trim();
    const jobDescription = draft.jobDescription.trim();
    const reportGenerationFailure = (message: string, fields: ApplicationDraftField[] = []) => {
      if (!requestMayPublish()) return;
      if (draft.canonicalApplicationId && canonicalSelected?.id === draft.canonicalApplicationId) {
        setCanonicalFillError(message);
      } else {
        refuseInComposer("action", message, fields);
      }
    };
    /* Both refusals go to composerRefusal, never to setError: they are answers to a button inside
       the composer and have to appear next to it. See the state declaration for the measurement. */
    const missing = missingApplicationFields({ company, role, portalUrl, jobDescription });
    if (missing.length > 0) {
      reportGenerationFailure("Fill in all four boxes first.", missing);
      return;
    }
    if (!isHttpsJobUrl(portalUrl)) {
      reportGenerationFailure("Enter a complete job URL beginning with https://.", ["portalUrl"]);
      return;
    }
    setComposerRefusal(null);
    setCanonicalFillError(null);
    const operationKey = resumeGenerationActionKey(draft);
    const operationId = operationIdFor(resumeOperationIds.current, operationKey);

    setCreating("tailor");
    setError(null);
    setNotice(null);
    try {
      const [identity, applicationProfile] = await Promise.all([
        api<ProfileIdentity>("/profile"),
        api<ApplicationProfile>("/profile/application"),
      ]);
      if (!requestMayPublish()) return;
      const fullName = identity.full_name?.trim();
      if (!fullName) throw new Error("Your main resume is missing your name. Replace it on the Resume page first.");
      const resumeEmail = identity.resume_email?.trim();
      if (!resumeEmail) throw new Error("Add the personal email that should appear on your resume before generating this application.");

      const generated = await api<ResumeGenerationResponse>("/resume/generate", {
        method: "POST",
        body: JSON.stringify({
          operation_id: operationId,
          initiation: "explicit_click",
          company,
          role,
          jd_text: jobDescription,
          profile_education: {
            school: identity.school,
            degree: identity.degree,
            grad_date: identity.grad_date,
            grad_year: identity.grad_year,
            currently_enrolled: identity.currently_enrolled,
            coursework: identity.coursework,
            school_location: identity.school_location,
          },
          /* Omitted rather than sent as null when this did not come from a posting: the backend
             field is optional, and only a present id gets written into the stored job_context. */
          ...(draft.jobId ? { job_id: draft.jobId } : {}),
          ...(draft.canonicalApplicationId ? { application_id: draft.canonicalApplicationId } : {}),
          application: {
            ats_name: portalName(portalUrl),
            portal_url: portalUrl,
          },
          contact: {
            full_name: fullName,
            email: resumeEmail,
            phone: applicationProfile.phone || undefined,
            linkedin_url: applicationProfile.linkedin_url || undefined,
            github_url: applicationProfile.github_url || undefined,
            portfolio_url: applicationProfile.portfolio_url || undefined,
          },
        }),
      });
      if (!requestIsCurrent()) return;

      const created = generated.application;
      if (created?.spec._review) {
        const canonicalId = generated.canonical_application_id;
        if (draft.canonicalApplicationId && canonicalId !== draft.canonicalApplicationId) {
          throw new Error("Litos could not attach the tailored resume to this Tracker application. Reload and try again.");
        }
        completeOperationId(resumeOperationIds.current, operationKey);
        const previousPacketId = canonicalId && canonicalSelected?.id === canonicalId
          ? canonicalSelected.legacy_generated_resume_id ?? null
          : null;
        if (canonicalId) {
          setCanonicalIdByPacketId((current) => {
            const next = { ...current, [created.id]: canonicalId };
            if (previousPacketId && previousPacketId !== created.id) delete next[previousPacketId];
            return next;
          });
        }
        const keepCanonicalDetail = Boolean(canonicalId && canonicalSelected?.id === canonicalId);
        const updatedCanonical = keepCanonicalDetail && canonicalId && canonicalSelected
          ? {
            ...canonicalSelected,
            legacy_generated_resume_id: created.id,
            selected_resume_artifact_id: generated.artifact_id ?? canonicalSelected.selected_resume_artifact_id,
            updated_at: new Date().toISOString(),
          }
          : null;
        setPackets((current) => {
          const withCreated = [created, ...(current ?? []).filter((packet) =>
            packet.id !== created.id
            && packet.id !== previousPacketId
            && (!canonicalId || canonicalApplicationFromPacket(packet)?.id !== canonicalId))];
          return updatedCanonical
            ? upsertCanonicalApplicationHistory(withCreated, updatedCanonical)
            : withCreated;
        });
        /* The generated packet is durable and may safely join the ledger after the user leaves A.
           Everything below this line is task-surface state and still belongs to the original
           selection and editor revision. */
        if (!requestMayPublish()) return;
        if (updatedCanonical) {
          commitCanonicalSelection(updatedCanonical);
        } else {
          openApplication(created, { history: "replace" });
        }
        setNewApplication(EMPTY_APPLICATION_DRAFT);
        forgetCheckoutDraft();
        setShowNewApplication(false);
        track("application_generation_completed", { source: draft.jobId ? "monitored_job" : "manual" });
        setNotice(keepCanonicalDetail
          ? "Tailored resume ready. You can write the cover letter without creating another Tracker row."
          : "Your resume is ready. We will check whether this employer wants a cover letter.");
        if (draft.jobId && !keepCanonicalDetail) {
          await askPrescriptQuestions(draft.jobId);
          if (!requestMayPublish()) return;
        }
        return;
      }

      if (draft.canonicalApplicationId) {
        throw new Error("The tailored resume was created, but Litos could not reopen its exact Tracker packet. Reload before trying again.");
      }

      // Compatibility path while an older backend deployment is still serving traffic.
      await api(`/applications/${generated.resume_id}/review`, {
        method: "PUT",
        body: JSON.stringify({
          ats_name: portalName(portalUrl),
          portal_url: portalUrl,
          questions: [],
          skipped_reasons: [],
        }),
      });
      if (!requestMayPublish()) return;

      const history = await api<{ resumes: GeneratedResume[] }>("/resume/history");
      if (!requestMayPublish()) return;
      const fallbackCreated = history.resumes.find((packet) => packet.id === generated.resume_id);
      setPackets(history.resumes);
      if (!fallbackCreated?.spec._review) throw new Error("Your resume was made, but we could not open it. Reload the page.");
      completeOperationId(resumeOperationIds.current, operationKey);
      openApplication(fallbackCreated, { history: "replace" });
      setNewApplication(EMPTY_APPLICATION_DRAFT);
      forgetCheckoutDraft();
      setShowNewApplication(false);
      track("application_generation_completed", { source: draft.jobId ? "monitored_job" : "manual" });
      setNotice("Your resume is ready. We will check whether this employer wants a cover letter.");
    } catch (reason) {
      if (!requestMayPublish()) return;
      if (isStructuredUpgradeDenial(reason, "ai_resume_tailoring")) {
        openTailoringUpgrade("server_denial");
        return;
      }
      /* ISSUE-043. This is the press of "Make my resume" failing, so it is answered beside "Make my
         resume". Empty fields on purpose: a 500 from /resume/generate, or a missing name on the
         main resume, says nothing about the four boxes, and marking them would send the student
         back to retype input that was already fine. */
      reportGenerationFailure(reason instanceof Error ? reason.message : "We could not build this application. Check the job description and try again.", []);
    } finally {
      if (requestOwnsLifecycle()) setCreating(null);
    }
  }

  async function generateCoverLetter(
    applicationId = selected?.id,
    options: {
      canonicalApplicationId?: string;
      errorSurface?: "page" | "canonical";
      jdText?: string;
      onManual?: () => void;
      upgradeTrigger?: HTMLElement | null;
    } = {},
  ) {
    if (!applicationId) return;
    const requestIsCurrent = () => applicationsMountedRef.current;
    const targetApplicationId = options.canonicalApplicationId
      ?? canonicalIdByPacketId[applicationId]
      ?? applicationId;
    const canonicalRequestScope = options.canonicalApplicationId
      ? beginCanonicalRequest(targetApplicationId, "cover-letter")
      : null;
    const packetRequestScope = options.canonicalApplicationId
      ? null
      : beginPacketCoverLetterRequest(applicationId);
    const requestMayPublish = () => canonicalRequestScope
      ? canonicalRequestMayPublish(canonicalRequestScope)
      : packetRequestScope
        ? packetCoverLetterRequestMayPublish(packetRequestScope)
        : requestIsCurrent();
    const requestOwnsLifecycle = () => canonicalRequestScope
      ? canonicalRequestOwnsLifecycle(canonicalRequestScope)
      : packetRequestScope
        ? packetCoverLetterRequestOwnsLifecycle(packetRequestScope)
        : requestIsCurrent();
    const returnRoute = options.canonicalApplicationId
      ? `/dashboard/applications?application=${encodeURIComponent(targetApplicationId)}&intent=detail&checkout_action=cover-letter`
      : `/dashboard/applications?application=${encodeURIComponent(applicationId)}&intent=apply&checkout_action=cover-letter`;
    const reportCoverLetterFailure = (message: string) => {
      if (options.errorSurface === "canonical") setCanonicalFillError(message);
      else setError(message);
    };
    const openCoverLetterUpgrade = (source: "proactive" | "server_denial") => {
      const trigger = applicationUpgradeFocusTarget(options.upgradeTrigger ?? null, "application-ledger-heading");
      openUpgrade({
        feature: "ai_cover_letter_generation",
        placement: options.canonicalApplicationId ? "canonical_application_detail" : "application_cover_letter",
        trigger: source === "server_denial" ? "server_entitlement_denial" : "generate_cover_letter",
        manualLabel: "Write it myself",
        applicationId: targetApplicationId,
        returnRoute,
        onManual: options.onManual,
      }, source === "server_denial"
        ? { source: "server_denial", trigger }
        : { trigger });
    };
    if (canUse("ai_cover_letter_generation") !== true) {
      openCoverLetterUpgrade("proactive");
      return;
    }
    setCoverLetterBusy(true);
    setError(null);
    setCanonicalFillError(null);
    try {
      if (qaMode) {
        const body = `I am excited to apply for the ${selected?.job_context.role ?? "role"} position at ${selected?.job_context.company ?? "your company"}. My experience building production software and working across product requirements aligns closely with this opportunity.\n\nI would bring a practical, evidence-led approach to the team, with attention to reliable implementation, clear communication, and measurable outcomes. I am especially interested in applying these strengths to the priorities described in this role.\n\nThank you for considering my application. I would welcome the opportunity to discuss how my background can support the team.`;
        if (!requestMayPublish()) return;
        setCoverLetterBody(body);
        return;
      }
      const operationKey = `cover-letter:${targetApplicationId}:${options.jdText?.trim() ?? "saved-packet"}`;
      const operationId = operationIdFor(coverLetterOperationIds.current, operationKey);
      const result = await api<CoverLetterResponse>(`/applications/${targetApplicationId}/cover-letter`, {
        method: "POST",
        body: JSON.stringify({
          operation_id: operationId,
          ...(options.jdText?.trim() ? { jd_text: options.jdText.trim() } : {}),
        }),
      });
      if (!requestIsCurrent()) return;
      if (!requestMayPublish()) {
        completeOperationId(coverLetterOperationIds.current, operationKey);
        return;
      }
      if (options.canonicalApplicationId
        && (result.application_id !== targetApplicationId
          || (result.packet_id && canonicalGeneratedPacket && result.packet_id !== canonicalGeneratedPacket.id))) {
        throw new Error("Litos wrote the cover letter for a different Tracker packet. Reload before trying again.");
      }
      const packetId = result.packet_id ?? applicationId;
      completeOperationId(coverLetterOperationIds.current, operationKey);
      setPackets((current) => current?.map((packet) =>
        packet.id === packetId || packet.id === targetApplicationId
          ? { ...packet, cover_letter_download_url: result.download_url, spec: { ...packet.spec, _cover_letter: result.cover_letter } }
          : packet) ?? current);
      applyCoverLetterToSubmission(applicationId, result.cover_letter);
      if (options.canonicalApplicationId) {
        canonicalCoverLetterEditorDirtyRef.current = false;
        setCanonicalCoverLetter(result as CanonicalCoverLetterResponse);
        setCanonicalCoverLetterBody(result.cover_letter.body);
        setCanonicalCoverLetterEditorOpen(true);
      }
      if (selectedIdRef.current === applicationId) {
        setCoverLetterBody(result.cover_letter.body);
        setCoverLetterDownloadUrl(result.download_url);
      }
      setNotice("Cover letter written and checked against the work you told us about.");
    } catch (reason) {
      if (!requestMayPublish()) return;
      if (isStructuredUpgradeDenial(reason, "ai_cover_letter_generation")) {
        openCoverLetterUpgrade("server_denial");
        return;
      }
      reportCoverLetterFailure(reason instanceof Error ? reason.message : "Could not generate the tailored cover letter.");
    } finally {
      if (requestOwnsLifecycle()) setCoverLetterBusy(false);
    }
  }

  async function saveCanonicalCoverLetter(): Promise<void> {
    const applicationId = canonicalSelected?.id;
    if (!applicationId || !canonicalCoverLetterBody.trim()) return;
    const requestScope = beginCanonicalRequest(applicationId, "cover-letter");
    const submittedBody = canonicalCoverLetterBody;
    setCoverLetterBusy(true);
    setCanonicalFillError(null);
    try {
      const result = await api<CanonicalCoverLetterResponse>(`/applications/${applicationId}/cover-letter`, {
        method: "PATCH",
        body: JSON.stringify({ body: submittedBody }),
      });
      if (!canonicalRequestMayPublish(requestScope)) return;
      canonicalCoverLetterEditorDirtyRef.current = false;
      setCanonicalCoverLetter(result);
      setCanonicalCoverLetterBody(result.cover_letter.body ?? "");
      setNotice("Cover letter saved to this Tracker application.");
    } catch (reason) {
      if (!canonicalRequestMayPublish(requestScope)) return;
      setCanonicalFillError(reason instanceof Error ? reason.message : "We could not save this cover letter.");
    } finally {
      if (canonicalRequestOwnsLifecycle(requestScope)) setCoverLetterBusy(false);
    }
  }

  async function uploadCanonicalCoverLetter(file: File): Promise<void> {
    const applicationId = canonicalSelected?.id;
    if (!applicationId) return;
    /* The shared gate (document-size.ts): refused with a sentence before any bytes move, because
       past the cap the platform rejects the body as an unreadable 413. */
    /* Not the shared PDF-export hint: this surface also takes .txt, where "reduce file size"
       advice does not exist. A cover letter this large is text to trim. */
    const problem = validateApplicationDocument(file, {
      accept: "pdf-or-txt",
      typeMessage: "Upload the cover letter as a PDF or plain-text (.txt) file.",
      oversizeHint: "Trim the letter or export a smaller file and try again.",
    });
    if (problem) {
      setCanonicalFillError(problem);
      return;
    }
    const requestScope = beginCanonicalRequest(applicationId, "cover-letter");
    setCoverLetterBusy(true);
    setCanonicalFillError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<CanonicalCoverLetterResponse>(`/applications/${applicationId}/cover-letter/upload`, {
        method: "POST",
        body: form,
      });
      if (!canonicalRequestMayPublish(requestScope)) return;
      canonicalCoverLetterEditorDirtyRef.current = false;
      setCanonicalCoverLetter(result);
      setCanonicalCoverLetterBody(result.cover_letter.body ?? "");
      setCanonicalCoverLetterEditorOpen(true);
      setNotice("Cover letter uploaded to this Tracker application.");
    } catch (reason) {
      if (!canonicalRequestMayPublish(requestScope)) return;
      setCanonicalFillError(reason instanceof Error ? reason.message : "We could not upload this cover letter.");
    } finally {
      if (canonicalRequestOwnsLifecycle(requestScope)) setCoverLetterBusy(false);
    }
  }

  async function deleteCanonicalCoverLetter(): Promise<void> {
    const applicationId = canonicalSelected?.id;
    if (!applicationId || !canonicalCoverLetter) return;
    const requestScope = beginCanonicalRequest(applicationId, "cover-letter");
    setCoverLetterBusy(true);
    setCanonicalFillError(null);
    try {
      await api(`/applications/${applicationId}/cover-letter`, { method: "DELETE" });
      if (!canonicalRequestMayPublish(requestScope)) return;
      canonicalCoverLetterEditorDirtyRef.current = false;
      setCanonicalCoverLetter(null);
      setCanonicalCoverLetterBody("");
      setNotice("Cover letter removed from this application.");
    } catch (reason) {
      if (!canonicalRequestMayPublish(requestScope)) return;
      setCanonicalFillError(reason instanceof Error ? reason.message : "We could not remove this cover letter.");
    } finally {
      if (canonicalRequestOwnsLifecycle(requestScope)) setCoverLetterBusy(false);
    }
  }

  async function saveCoverLetter(): Promise<boolean> {
    if (!selected) return false;
    const applicationId = selected.id;
    if (selectedIdRef.current !== applicationId) return false;
    const requestScope = beginPacketCoverLetterRequest(applicationId);
    const submittedBody = coverLetterBody;
    setCoverLetterBusy(true);
    setError(null);
    try {
      if (!qaMode) {
        if (!submittedBody.trim()) {
          if (selected.spec._cover_letter) {
            await api(`/applications/${applicationId}/cover-letter`, { method: "DELETE" });
            if (!packetCoverLetterRequestMayPublish(requestScope)) return false;
            setPackets((current) => current?.map((packet) => packet.id === applicationId
              ? { ...packet, cover_letter_download_url: undefined, spec: { ...packet.spec, _cover_letter: undefined } }
              : packet) ?? current);
            applyCoverLetterToSubmission(applicationId, null);
            setCoverLetterDownloadUrl(null);
            setNotice("Cover letter removed from this application.");
          }
          return true;
        }
        const result = await api<CoverLetterResponse>(`/applications/${applicationId}/cover-letter`, { method: "PATCH", body: JSON.stringify({ body: submittedBody }) });
        if (!packetCoverLetterRequestMayPublish(requestScope)) return false;
        setPackets((current) => current?.map((packet) => packet.id === applicationId ? { ...packet, cover_letter_download_url: result.download_url, spec: { ...packet.spec, _cover_letter: result.cover_letter } } : packet) ?? current);
        applyCoverLetterToSubmission(applicationId, result.cover_letter);
        setCoverLetterBody(result.cover_letter.body);
        setCoverLetterDownloadUrl(result.download_url);
      }
      if (!packetCoverLetterRequestMayPublish(requestScope)) return false;
      setNotice("Cover letter saved. Every line checks out against your real work.");
      return true;
    } catch (reason) {
      if (!packetCoverLetterRequestMayPublish(requestScope)) return false;
      setError(reason instanceof Error ? reason.message : "We could not save your cover letter. Try again.");
      return false;
    } finally {
      if (packetCoverLetterRequestOwnsLifecycle(requestScope)) setCoverLetterBusy(false);
    }
  }

  function patchEntry(index: number, patch: Partial<ResumeSpec["experience"][number]>) {
    editorRevisionRef.current += 1;
    setSpec((current) =>
      current
        ? { ...current, experience: current.experience.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) }
        : current,
    );
  }

  async function saveResume(): Promise<{ spec: ResumeSpec; review: ApplicationReview } | null> {
    if (!selected || !spec) return null;
    const applicationId = selected.id;
    const editorRevision = editorRevisionRef.current;
    setSaving(true);
    setError(null);
    try {
      if (!qaMode) {
        const updated = await api<{ spec: GeneratedResume["spec"]; download_url: string }>(
          `/applications/${applicationId}/resume`,
          { method: "PATCH", body: JSON.stringify({ spec }) },
        );
        setPackets((current) =>
          current?.map((packet) =>
            packet.id === applicationId ? { ...packet, spec: updated.spec, download_url: updated.download_url } : packet,
          ) ?? current,
        );
        /* The server response is the saved resume, including any canonical pruning or ordering it
           applied before regenerating the PDF. Auditing the request copy after installing the
           response into `packets` makes the dashboard compare two different JSON shapes and report
           its own save as an unsaved edit. Adopt the canonical editable shape only while this is
           still the selected application. A late save for packet A may update A in the list, but
           it must never replace the editor after the applicant has switched to packet B. */
        const savedSpec = stripMetadata(updated.spec);
        const savedReview = updated.spec._review ? reviewWithLists(updated.spec._review) : null;
        if (!savedReview) throw new Error("The saved resume response is missing its canonical application review.");
        if (selectedIdRef.current !== applicationId || editorRevisionRef.current !== editorRevision) return null;
        setSpec(savedSpec);
        if (resumeEditSaveApplicationRef.current === applicationId) resumeEditSaveApplicationRef.current = null;
        setNotice("Resume saved and rechecked.");
        return { spec: savedSpec, review: savedReview };
      }
      if (!selected.spec._review) return null;
      if (resumeEditSaveApplicationRef.current === applicationId) resumeEditSaveApplicationRef.current = null;
      setNotice("Resume saved and rechecked.");
      return { spec, review: reviewWithLists(selected.spec._review) };
    } catch (reason) {
      if (selectedIdRef.current === applicationId) {
        setError(reason instanceof Error ? reason.message : "We could not save your resume. Try again.");
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  /* A live employer read can discover required questions after the applicant has already opened
     packet review. Every route that notices those blanks must lead to the answer controls, not
     leave a red sentence above a packet whose only primary action repeats the same refusal. A
     stopped managed run uses the server-backed question editor so Save persists the answers. A
     pre-fill packet keeps the answers locally until its submit request, as before. */
  function routeMissingRequiredAnswers(candidateQuestions: ApplicationQuestion[] = questions): boolean {
    if (activePrescriptLookaheadIssue) {
      setError(null);
      setQuestions(candidateQuestions);
      setFocusQuestion(null);
      moveToScreen("questions");
      return true;
    }
    const nextRoute = requiredQuestionReviewRoute(
      candidateQuestions,
      activeQuestionMetadataBlockers,
    );
    const firstMissingId = nextRoute.kind === "answer" ? nextRoute.questionId : null;
    /* A metadata-blocked question cannot be decided by the applicant: the presentation refuses to
       render it as editable ("Litos did not guess or fill this field"), so demanding an
       answer-or-skip decision on it routed her to a screen holding no control that could satisfy
       the demand. Measured live on the Breezy packet f04623c3 (2026-09-01): one checkbox's exact
       options were unreadable, and this exact line bounced every audit attempt back to the
       questions screen, which re-sent her here, forever. Only questions she can actually edit owe
       a decision; the blocked one belongs to the metadata-refresh run. */
    const decisionEligibleQuestions = questionReviewPresentation(
      candidateQuestions,
      activeQuestionMetadataBlockers,
    ).editableQuestions;
    const optionalDecisionId = decisionEligibleQuestions.find(optionalQuestionNeedsDecision)?.id ?? null;
    const requiredMetadataMissing = nextRoute.kind === "metadata_refresh";
    if (!firstMissingId && !optionalDecisionId && !requiredMetadataMissing) return false;
    setError(null);
    setPrescriptNote("");
    if (selectedSubmission?.review.status === "needs_attention") {
      if (firstMissingId) reviewPortalQuestions(firstMissingId ?? undefined, "answer");
      else reviewPortalQuestions(optionalDecisionId ?? undefined, "answer");
      return true;
    }
    setQuestions(candidateQuestions);
    const focusQuestionId = firstMissingId ?? optionalDecisionId;
    setFocusQuestion(focusQuestionId ? { id: focusQuestionId, token: Date.now() } : null);
    moveToScreen("questions", { scrollToTop: !firstMissingId });
    return true;
  }

  async function continueFromResume() {
    if (coverLetterBusy) {
      setError("Wait for the cover letter check to finish before preparing the application.");
      return;
    }
    if (!selected || !spec || !review) return;
    const applicationId = selected.id;
    /* Workflow status does not say whether the editor is dirty. A ready packet can be edited, and
       auditing that edit without saving would ask the server to audit its older PDF forever. A
       passive fresh packet with no edits needs no no-op PATCH. Explicitly opening Edit resume is
       different: contact metadata is absent from the editable copy, so the backend must regenerate
       the PDF even when the editable JSON is unchanged. */
    const resumeSaveRequired = packetDraftChanged || resumeEditSaveApplicationRef.current === applicationId;
    const savedResume = resumeSaveRequired ? await saveResume() : { spec, review };
    if (!savedResume || selectedIdRef.current !== applicationId) return;
    const auditedSpec = savedResume.spec;
    const canonicalReview = savedResume.review;
    const alreadyFilled = canonicalReview.status === "ready_for_final_approval";
    if (!alreadyFilled && !qaMode && !(await saveCoverLetter())) return;
    if (selectedIdRef.current !== applicationId) return;
    const nextQuestionRoute = requiredQuestionReviewRoute(
      questions,
      activeQuestionMetadataBlockers,
    );
    if (nextQuestionRoute.kind !== "metadata_refresh" && routeMissingRequiredAnswers(questions)) return;
    if (qaMode) {
      setError("Packet auditing is unavailable in fixture mode.");
      return;
    }
    setPacketAuditBusy(true);
    setError(null);
    try {
      let savedReview = canonicalReview;
      /* THE ANSWERS GO DOWN BEFORE THE AUDIT IS TAKEN, AND WHICH ROUTE CARRIES THEM IS A DECISION.
         PR #319 added needs_attention to the list below so a stalled packet would stop auditing
         answers it had never stored. That is right, and it is kept: what changes is that the stalled
         packet writes through the route that leaves its status and its attention_reason alone. See
         auditAnswerWrite. */
      const answerWrite = auditAnswerWrite(canonicalReview.status);
      if (answerWrite === "review_edit") {
        const portalUrl = canonicalReview.portal_url?.trim();
        const atsName = canonicalReview.ats_name?.trim() || portalName(portalUrl ?? "");
        if (!portalUrl || !atsName) throw new Error("The saved employer form identity is incomplete. Reload this packet before auditing it.");
        const raw = await api<SubmissionResponse>(`/applications/${applicationId}/review`, {
          method: "PUT",
          body: JSON.stringify({
            ats_name: atsName,
            portal_url: portalUrl,
            questions,
            skipped_reasons: canonicalReview.skipped_reasons,
          }),
        });
        const saved = submissionResponseForDisplay(raw, { packetId: applicationId });
        savedReview = saved.review;
        if (selectedIdRef.current !== applicationId) return;
        setSubmission((current) => current?.application_id === applicationId ? { ...current, review: saved.review } : current);
        setPackets((current) => current?.map((packet) => packet.id === applicationId
          ? { ...packet, spec: { ...packet.spec, _review: saved.review } }
          : packet) ?? current);
      } else if (answerWrite === "answers_only" && reviewAnswersNeedSave(canonicalReview.questions, questions)) {
        /* The same helper the Save button uses, so there is one definition of this request and one
           reading of the 202 that means a run wrote to the packet under it.

           An unchanged list is deliberately not a write. A stopped row may carry send evidence,
           in which case the server correctly refuses answer MUTATIONS. Posting its own byte-for-byte
           answer list back anyway turned the read-only exact-packet audit into that forbidden
           mutation and hid the real next-state gate behind REVIEW_ANSWERS_NOT_EDITABLE. The helper
           compares only fields this route accepts, so display metadata cannot skip a real save.

           A REFUSAL IS RAISED, NOT SWALLOWED. This route refuses a stopped run whose row says
           something may already be at the employer, and the applicant needs the reason rather than
           an audit taken over answers that were never stored. Thrown into the catch below, which is
           where every other failure on this path already reports itself: it clears the stale packet
           evidence and prints the server's own sentence. */
        const result = await saveReviewAnswers<ApplicationReview>({
          applicationId,
          questions,
          send: (path, init) => api<ReviewAnswerSaveResponse<ApplicationReview>>(path, init),
        });
        if (!result.saved) throw new Error(result.message);
        if (selectedIdRef.current !== applicationId) return;
        savedReview = result.review;
        setSubmission((current) => current?.application_id === applicationId ? { ...current, review: result.review } : current);
        setPackets((current) => current?.map((packet) => packet.id === applicationId
          ? { ...packet, spec: { ...packet.spec, _review: result.review } }
          : packet) ?? current);
      }
      const response = await api<PacketAuditResponse>(`/applications/${applicationId}/packet-audit`, { method: "POST" });
      if (selectedIdRef.current !== applicationId) return;
      /* THE AUDIT REFRESHES THE QUESTIONS SERVER-SIDE, AND THIS IS WHERE THAT COMES HOME.
         response.questions is what the audit above actually hashed - not necessarily the local
         `questions` this request was built from. Without adopting it here, "Approve packet and fill form"
         goes on to submit the STALE local copy: the merge on the other end sees a difference from
         what was just audited, on a question that has nothing proving she supplied it, and
         refreshKnownQuestionAnswers blanks or restores it differently than this audit did. Two
         computations of "the same" unedited packet then disagree, and the acknowledgement this
         audit is about to produce is spent by a submit-request that never should have diverged from
         it. See the backend route for the full account.

         FALLS BACK TO THE LOCAL COPY WHEN THE FIELD IS ABSENT, deliberately: this dashboard and
         student-outreach-backend deploy independently on merge to main, with no guarantee either
         lands first. A response from a backend still on the pre-fix build has no `questions` key,
         and adopting `undefined` here would set every question-reading render in this component up
         to throw on the very next paint - not just for this packet, for the whole screen. Falling
         back reproduces the pre-fix (stale-resubmit) behaviour for that one request rather than
         crashing the dashboard; the fix simply does not take effect until both sides are live. */
      const auditedQuestions = Array.isArray(response.questions) ? response.questions : questions;
      setQuestions(auditedQuestions);
      const auditedReview = { ...savedReview, packet_audit: response.packet_audit, questions: auditedQuestions };
      setPackets((current) => current?.map((packet) => packet.id === applicationId
        ? { ...packet, download_url: response.pdf.download_url, spec: { ...packet.spec, _review: auditedReview } }
        : packet) ?? current);
      setSubmission((current) => current?.application_id === applicationId ? { ...current, review: auditedReview } : current);
      setPacketEvidence({
        applicationId,
        response,
        specJson: JSON.stringify(auditedSpec),
        questionsSnapshot: packetQuestionsSnapshot(auditedQuestions),
        pdfVerified: false,
        acknowledged: false,
        serverRevalidatedAt: null,
      });
      /* A fresh audit is the recovery the revalidation refusal was asking for, so the refusal and
         the poll banner carrying it retire here. The banner would otherwise sit red above the
         green sentence below, describing evidence that no longer exists. */
      if (packetRevalidationRefusal.current?.applicationId === applicationId) {
        packetRevalidationRefusal.current = null;
        setPollError(null);
      }
      setNotice("The exact saved packet passed the server audit. Read the requirement evidence while the PDF loads.");
    } catch (reason) {
      if (selectedIdRef.current !== applicationId) return;
      setPacketEvidence(null);
      if (!(await recoverPacketAuditReview(applicationId, reason))) {
        setError(reason instanceof Error ? reason.message : "Litos could not audit this exact packet.");
      }
    } finally {
      setPacketAuditBusy(false);
    }
  }

  async function continueFromVerifiedPacket(options: PrepareApplicationOptions = {}) {
    if (!packetEvidenceReady || !activePacketEvidence) {
      const message = packetEvidenceBlocker ?? "Audit and load the exact packet before continuing.";
      if (options.failureScreen === "questions" && selected) {
        setError(null);
        setMetadataRefreshError({ applicationId: selected.id, message });
      } else setError(message);
      return;
    }
    /* Questions can arrive from the live form after the audit that put this packet on screen. Do
       not spend the approval on a packet that cannot proceed, and do not make the applicant press
       the same button again to discover where those answers live. */
    if (!options.allowServerAnswerRefresh && routeMissingRequiredAnswers(questions)) return;
    const applicationId = activePacketEvidence.applicationId;
    if (packetAuditInFlight.current === applicationId) return;
    packetAuditInFlight.current = applicationId;
    setPacketAuditBusy(true);
    setError(null);
    try {
      await acknowledgePacketAudit({
        applicationId,
        response: activePacketEvidence.response,
        refusalMessage: "Litos did not confirm this exact packet review.",
      });
      if (selectedIdRef.current !== applicationId) return;
      const acknowledgedEvidence = acknowledgePacketEvidence(packetEvidenceRef.current, activePacketEvidence);
      if (!acknowledgedEvidence) throw new Error("The resume, audit, PDF, or answers changed while Litos recorded the review. Check the exact packet again.");
      /* The poll reads this ref before React runs effects. Writing it first closes the window where
         a response fetched before this ACK could take the unacknowledged branch and erase the exact
         proof that was just accepted. The state write follows so the UI renders the same snapshot. */
      packetEvidenceRef.current = acknowledgedEvidence;
      setPacketEvidence(acknowledgedEvidence);
      if (review?.status === "ready_for_final_approval") {
        moveToScreen("portal");
        return;
      }
      await prepareApplication(questions, options);
    } catch (reason) {
      if (!(await recoverPacketAuditReview(applicationId, reason))) {
        const message = reason instanceof Error ? reason.message : "Litos could not record this exact packet review.";
        if (options.failureScreen === "questions") {
          setError(null);
          setMetadataRefreshError({ applicationId, message });
          moveToScreen("questions");
        } else setError(message);
      }
    } finally {
      if (packetAuditInFlight.current === applicationId) packetAuditInFlight.current = null;
      setPacketAuditBusy(false);
    }
  }

  function reviewPacketAgain() {
    if (!selectedSubmission) return;
    /* A stopped run can change the stored questions after the last exact-packet audit. Keeping that
       old evidence mounted makes packetEvidenceReady false, and reviewPrimaryDisabled then disables
       the very button whose instruction says to audit again. The server list is authoritative here
       too: this handler is available only on the portal screen, where there are no unsaved answer
       edits, and an empty list is the backend saying the former blocker was not a question. Clear
       both evidence copies synchronously before returning to review so the next press starts a
       fresh audit of the current packet. */
    setQuestions(selectedSubmission.review.questions);
    packetEvidenceRef.current = null;
    setPacketEvidence(null);
    moveToScreen("review");
  }

  async function auditPacketAgain() {
    packetEvidenceRef.current = null;
    setPacketEvidence(null);
    await continueFromResume();
  }

  async function prepareApplication(
    finalQuestions = questions,
    /* `restart` is PR #375's flag and rides this function rather than a fourth caller of
       submit-request. There were two call sites of that route and there is a rule about it: a
       second send path is how a gate gets routed around. What a restart needs that a first
       preparation does not is one boolean in the body, so it is one boolean here. */
    options: PrepareApplicationOptions = {},
  ) {
    if (!selected) return;
    const applicationId = selected.id;
    if (!options.allowServerAnswerRefresh && routeMissingRequiredAnswers(finalQuestions)) return;
    if (!qaMode && packetAuthorityForEmployerAction(selected, submission).state !== "safe_not_sent") {
      setError("Litos cannot start another employer attempt until the exact prior submission evidence is verified.");
      moveToScreen("review");
      return;
    }
    setPrepareStartedAt(new Date().toISOString());
    setSubmittingPhase("preparing");
    moveToScreen("submitting");
    setError(null);
    setSendRefusal(null);
    track("application_submission_requested", {
      source: qaMode ? "qa" : options.source ?? (options.restart ? "restart" : "review"),
    });
    try {
      if (!qaMode) {
        const raw = await api<SubmissionResponse>(`/applications/${applicationId}/submit-request`, {
          method: "POST",
          body: JSON.stringify({ questions: finalQuestions, ...(options.restart ? { restart: true } : {}) }),
        });
        const result = submissionResponseForDisplay(raw, { packetId: applicationId });
        captureCompletedSubmission(result, options.restart ? "restart" : "review");
        if (selectedIdRef.current !== applicationId) {
          setPackets((current) => current?.map((packet) => packet.id === applicationId ? packetWithDirectSubmission(packet, result) : packet) ?? current);
          return;
        }
        const published = publishSubmissionEnvelope(submissionRef, result, "direct");
        setPackets((current) => current?.map((packet) => packet.id === applicationId ? packetWithDirectSubmission(packet, published) : packet) ?? current);
        const nextEvidence = reconcilePacketEvidenceWithSubmission(
          packetEvidenceRef.current,
          applicationId,
          published.review.questions,
          published.review.packet_audit,
        );
        packetEvidenceRef.current = nextEvidence;
        setPacketEvidence(nextEvidence);
        setQuestions(published.review.questions);
        const incomingCoverLetter = submissionCoverLetterField(published);
        if (incomingCoverLetter.included) {
          setCoverLetterBody(incomingCoverLetter.value?.body ?? "");
          if (!incomingCoverLetter.value) setCoverLetterDownloadUrl(null);
        }
        setSubmission(published);
        // This response is the END of the run, not an acknowledgement of its start, and it is
        // routinely terminal ("failed", "needs_attention", "ready_for_final_approval"). It used to
        // be installed into state and then ignored for routing, which left the progress screen
        // spinning over a run that was already over.
        moveToScreen(screenForStatus(published.review.status, "submitting"));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 650));
        const now = new Date().toISOString();
        setSubmission({ application_id: selected.id, review: { ...review!, status: "submitted", submission_authorized_at: now, submitted_at: now, filled_fields: ["name", "email", "resume", "cover letter"], receipt: { confirmation_text: "Thank you. Your controlled test application was received.", final_url: "/qa/portal-submission/success", screenshot_url: "/qa/portal-receipt.svg", captured_at: now, reference_id: "LITOS-QA-2027" } } });
        moveToScreen("submitted");
        return;
      }
    } catch (reason) {
      if (await recoverPacketAuditReview(applicationId, reason)) return;
      /* A restart is pressed FROM the portal screen and is about the packet on it, so its refusal
         goes back there and lands beside the control, not on the review screen behind a banner. */
      moveToScreen(options.failureScreen ?? (options.restart ? "portal" : "review"));
      const message = reason instanceof Error ? reason.message : "We could not open the company's application page.";
      const issues = reason instanceof ApiError ? reason.issues : [];
      if (options.restart) refuseSend(applicationId, message, issues);
      else if (options.failureScreen === "questions") {
        setError(null);
        setMetadataRefreshError({ applicationId, message });
      } else setError(message);
    }
  }

  async function completeHandoff(outcome: "cleared" | "submitted" = "cleared") {
    if (!selected || !submission) return;
    if (submission.application_id !== selected.id) return;
    const requestedId = selected.id;
    setError(null);
    try {
      const rawResult = qaMode
        ? outcome === "submitted"
          ? {
            ...submission,
            review: {
              ...submission.review,
              status: "submitted" as const,
              submitted_at: new Date().toISOString(),
              attention_reason: undefined,
              receipt: {
                confirmation_text: "Submitted by the applicant in the live company page",
                final_url: submission.review.portal_url ?? "/qa/portal-submission/success",
                captured_at: new Date().toISOString(),
                source: "attended_handoff" as const,
              },
            },
          }
          : { ...submission, review: { ...submission.review, status: "ready_for_final_approval" as const, attention_reason: undefined } }
        : await api<SubmissionResponse>(`/applications/${requestedId}/submission/handoff-complete`, {
          method: "POST",
          body: JSON.stringify({ outcome }),
        });
      const result = qaMode
        ? rawResult
        : submissionResponseForDisplay(rawResult, { packetId: requestedId });
      if (selectedIdRef.current !== requestedId) {
        setPackets((current) => current?.map((packet) => packet.id === requestedId ? packetWithDirectSubmission(packet, result) : packet) ?? current);
        return;
      }
      const published = publishSubmissionEnvelope(submissionRef, result, "direct");
      const nextEvidence = reconcilePacketEvidenceWithSubmission(
        packetEvidenceRef.current,
        requestedId,
        published.review.questions,
        published.review.packet_audit,
      );
      packetEvidenceRef.current = nextEvidence;
      setPacketEvidence(nextEvidence);
      setQuestions(published.review.questions);
      setPackets((current) => current?.map((packet) => packet.id === requestedId ? packetWithDirectSubmission(packet, published) : packet) ?? current);
      setSubmission(published);
      moveToScreen(published.review.status === "submitted" ? "submitted" : "portal");
    } catch (reason) {
      if (!(await recoverPacketAuditReview(requestedId, reason))) {
        setError(reason instanceof Error ? reason.message : "We could not tell whether it went through.");
      }
    }
  }

  /* THE EXIT FROM A SEND THAT CAN NEVER GO GREEN.
   *
   * Two states reach it and both were permanent. She presses "I've ordered it", which records the
   * acknowledgement and deliberately attaches nothing, because Litos cannot make a registrar mail a
   * sealed transcript; or the run measures this form and finds no control it can put the file in.
   * Either way the eighth gate term stays true forever, "Send it" is grey for the life of the packet,
   * and the modal that put her there has already told her "This application then finishes with you
   * rather than with Litos" - about a screen that had nothing on it that could finish anything.
   *
   * Deliberately the SAME words as the control on a stalled handoff two branches below, because it
   * is the same sentence about the same act. The server writes the same record for it too: submitted,
   * with a receipt whose source names an attended handoff and whose text names her as the witness. It
   * refuses outright for an application Litos could still finish itself, so this is not a way past a
   * send gate that is doing its job.
   */
  async function recordSelfSubmitted() {
    if (!selected || !submission) return;
    if (submission.application_id !== selected.id) return;
    const requestedId = selected.id;
    setError(null);
    try {
      const rawResult = qaMode
        ? {
          ...submission,
          review: {
            ...submission.review,
            status: "submitted" as const,
            submitted_at: new Date().toISOString(),
            attention_reason: undefined,
            receipt: {
              confirmation_text: "Confirmed by you: this employer asked for a document Litos could not attach, so you sent this application yourself.",
              final_url: submission.review.portal_url ?? "/qa/portal-submission/success",
              captured_at: new Date().toISOString(),
              source: "attended_handoff" as const,
            },
          },
        }
        : await api<SubmissionResponse>(`/applications/${requestedId}/submission/self-submitted`, { method: "POST" });
      const result = qaMode
        ? rawResult
        : submissionResponseForDisplay(rawResult, { packetId: requestedId });
      if (selectedIdRef.current !== requestedId) {
        setPackets((current) => current?.map((packet) => packet.id === requestedId ? packetWithDirectSubmission(packet, result) : packet) ?? current);
        return;
      }
      const published = publishSubmissionEnvelope(submissionRef, result, "direct");
      const nextEvidence = reconcilePacketEvidenceWithSubmission(
        packetEvidenceRef.current,
        requestedId,
        published.review.questions,
        published.review.packet_audit,
      );
      packetEvidenceRef.current = nextEvidence;
      setPacketEvidence(nextEvidence);
      setQuestions(published.review.questions);
      setPackets((current) => current?.map((packet) => packet.id === requestedId ? packetWithDirectSubmission(packet, published) : packet) ?? current);
      setSubmission(published);
      moveToScreen(published.review.status === "submitted" ? "submitted" : "portal");
    } catch (reason) {
      if (!(await recoverPacketAuditReview(requestedId, reason))) {
        setError(reason instanceof Error ? reason.message : "We could not record that you sent this one yourself.");
      }
    }
  }

  /* The one place an answer can be seen, edited and saved. "Check the answers" has always come
     here; the Your turn rows now come here too, carrying WHICH question was pressed so the student
     lands on it rather than at the top of a list of twelve. Save from here writes through
     PUT /applications/:id/review/answers, which persists the answers and leaves the packet's status
     alone. See saveReviewedAnswers. */
  function reviewPortalQuestions(focusQuestionId?: string, intent?: SubmissionChecklistAction) {
    if (!selected || !submission || submission.application_id !== selected.id) return;
    // Reading the whole list, or answering a stalled run: not the Apply-time pre-script, so its
    // summary line goes away rather than describing the wrong screen.
    setPrescriptNote("");
    const merged = mergeDiscoveredQuestions(questions, submission.review.questions);
    setQuestions(merged);
    /* THE CONFIRM PRESS IS THE CONFIRMATION, and this is the only place it exists. The Save that
       follows posts back the same bytes whether she confirmed one question or none, so the request
       has to carry which questions she explicitly confirmed - see the `confirmed` flag on
       ReviewAnswerSaveQuestion, and the DV Trading loop it closes. Recorded per application so a
       press on one packet can never claim an answer on another; spent by saveReviewedAnswers on a
       landed save, dropped by Back on an abandoned one. Only for a question the editor is actually
       about to show - a press whose question is not on the merged list opens nothing she can read,
       so it must not linger as an intent either. */
    /* "review" records the intent exactly as "confirm" does: both are a press on ONE question's own
       row control, which is the per-question deliberateness bar this ref exists to hold. An essay row
       wears "Review" rather than "Confirm", and without this the read-it-and-save path minted nothing
       for an unchanged drafted answer - the same never-settling loop the direct flow had (see
       directlyConfirmed in saveReviewedAnswers). Bulk opens still record nothing: no intent, no id. */
    if ((intent === "confirm" || intent === "review") && focusQuestionId && merged.some((question) => question.id === focusQuestionId)) {
      const ids = confirmIntentsRef.current.get(selected.id) ?? new Set<string>();
      ids.add(focusQuestionId);
      confirmIntentsRef.current.set(selected.id, ids);
    }
    setFocusQuestion(
      focusQuestionId && merged.some((question) => question.id === focusQuestionId)
        ? { id: focusQuestionId, token: Date.now() }
        : null,
    );
    moveToScreen("questions", { scrollToTop: !focusQuestionId });
  }

  /* A Your turn row drew the employer's own options and she pressed one. This is a ROUTE, not a
     write: it opens the same editor the Answer pill opens, focused on the same question, with her
     pick already selected, and the editor's Save is still the only thing that persists an answer.
     The functional update runs after reviewPortalQuestions has queued the merged list, so it maps
     over that list rather than the stale state this closure captured. */
  function chooseBlockerOption(questionId: string, option: string) {
    if (!selected || !submission || submission.application_id !== selected.id) return;
    reviewPortalQuestions(questionId, "answer");
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, answer: option } : question));
  }

  /* One tick on a Your turn attention row, PERSISTED, which is the whole repair: the panel's
     checkbox used to be an <input> with no handler, no state and no request - ticked, it recorded
     nothing, and the next poll cleared it (measured on the Easy Dynamics rippling packet,
     2026-08-20). The write goes through saveAttentionAcknowledgement, the domain module that owns
     the route, the body and the 202 reading, exactly as the answers save owns its own; the row
     re-renders settled from the RESPONSE's review, so a box that shows ticked is a box whose tick
     is on the row. Display-only by design: the send gate keeps reading the run's measurements, and
     this is the applicant's own record of what she handled on the company page herself. */
  async function toggleAttentionAcknowledgement(item: SubmissionChecklistItem, acknowledged: boolean) {
    if (!selected || !submission || submission.application_id !== selected.id) return;
    const applicationId = selected.id;
    /* The QA fixtures render real needs_attention panels for applications that do not exist, so a
       tick there must not reach the backend: it would be a write against a fixture UUID and a 404
       painted across a demo screen. The local merge gives the demo the same behaviour. */
    if (qaMode) {
      setSubmission((current) => {
        if (current?.application_id !== applicationId) return current;
        const ticks = { ...(current.review.attention_acknowledgements ?? {}) };
        if (acknowledged) ticks[item.id] = { label: item.label, acknowledged_at: new Date().toISOString() };
        else delete ticks[item.id];
        return { ...current, review: { ...current.review, attention_acknowledgements: Object.keys(ticks).length > 0 ? ticks : undefined } };
      });
      return;
    }
    const tickKey = `${applicationId}:${item.id}`;
    const inFlight = (attentionTickRef.current ??= new Set());
    if (inFlight.has(tickKey)) return;
    inFlight.add(tickKey);
    setAttentionTicking((current) => new Set(current).add(item.id));
    setError(null);
    try {
      const result = await saveAttentionAcknowledgement<SubmissionResponse["review"]>({
        applicationId,
        itemId: item.id,
        label: item.label,
        acknowledged,
        send: (path, init) => api<AttentionAcknowledgementResponse<SubmissionResponse["review"]>>(path, init),
      });
      if (selectedIdRef.current !== applicationId) return;
      /* On the raced 202 the result still carries the review the winning run stored, and that is
         what the panel must show: the sentence she ticked may no longer exist. Installed exactly
         like a landed tick, with the message beside it. */
      if (!result.saved) setError(result.message);
      const storedReview = result.review;
      if (!storedReview) return;
      setSubmission((current) => current?.application_id === applicationId ? { ...current, review: storedReview } : current);
      setPackets((current) => current?.map((packet) => packet.id === applicationId
        ? { ...packet, spec: { ...packet.spec, _review: storedReview } }
        : packet) ?? current);
    } finally {
      inFlight.delete(tickKey);
      setAttentionTicking((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  /* Save on the REVIEW-ANSWERS screen, which is reached from a run that stopped and needs a real
   * write. See features/applications/domain/review-answer-save.ts for the route and why it is
   * neither of the two that already existed.
   *
   * The banner is the RESPONSE's, and a refusal leaves her on this screen with everything she typed
   * still in the boxes: the answers exist only here until the server says otherwise, so navigating
   * away from a failed save would destroy them a second time. */
  async function saveReviewedAnswers(direct?: {
    questionId: string;
    answer: string;
    answerState?: ApplicationQuestion["answer_state"];
    intent: DirectQuestionTaskIntent;
    promptFingerprint: string;
    taskFingerprint: string;
    task: DirectQuestionTask;
  }): Promise<DirectAnswerSaveResult> {
    if (!selected || !submission || submission.application_id !== selected.id) {
      return { saved: false, message: "This application is no longer open." };
    }
    const applicationId = selected.id;
    const selectionRevision = editorRevisionRef.current;
    const rememberDirectFailure = (message: string) => {
      if (!direct || !applicationsMountedRef.current) return;
      setDirectAnswerFailures((current) => {
        const next = new Map(current);
        next.set(applicationId, {
          promptFingerprint: direct.promptFingerprint,
          taskFingerprint: direct.taskFingerprint,
          message,
        });
        return next;
      });
    };
    if (savingAnswersRef.current.has(applicationId)) {
      return { saved: false, message: "Litos is already saving an answer for this application." };
    }
    const activeSubmission = submissionSnapshotsRef.current.get(applicationId)
      ?? (submissionRef.current?.application_id === applicationId ? submissionRef.current : submission);
    const requestedPublicationGeneration = submissionPublicationGeneration(
      submissionPublicationGenerationsRef.current,
      applicationId,
    );
    const activeDirectTaskPlan = direct
      ? directInputTaskPlan(activeSubmission.review, {
        company: selected.job_context.company,
        role: selected.job_context.role,
        documents: activeSubmission.documents,
      })
      : null;
    const activeDirectPassKey = direct ? directAnswerPassKey(activeSubmission.review) : null;
    const activeDirectPass = direct ? directAnswerPasses.get(applicationId) : null;
    const activeDirectProgress = direct ? directAnswerProgresses.get(applicationId) : null;
    const activeAnsweredTasks = direct
      && activeDirectPassKey
      && activeDirectProgress?.key === activeDirectPassKey
      ? activeDirectProgress.answeredTasks
      : [];
    const safeDirectTask = direct
      ? directAnswerNavigationTasks(
        activeSubmission.review,
        activeDirectTaskPlan?.questionTasks ?? [],
        activeAnsweredTasks,
      ).find((task) => (
        task.question.id === direct.questionId
        && directQuestionPromptFingerprint(task) === direct.promptFingerprint
      )) ?? null
      : null;
    const safeDirectPromptFingerprint = safeDirectTask
      ? directQuestionPromptFingerprint(safeDirectTask)
      : null;
    const directIsSkip = direct?.answerState === "skipped";
    if (direct && (
      !safeDirectTask
      || safeDirectTask.intent !== direct.intent
      || safeDirectPromptFingerprint !== direct.promptFingerprint
      || directQuestionTaskFingerprint(safeDirectTask) !== direct.taskFingerprint
      || (directIsSkip && (safeDirectTask.question.required || Boolean(direct.answer.trim())))
      || (!directIsSkip && !direct.answer.trim())
      || (!directIsSkip && safeDirectTask.question.options?.length
        && (questionAcceptsMultipleOptions(safeDirectTask.question)
          ? exactSelectedQuestionOptions(direct.answer, safeDirectTask.question.options) === null
          /* The fill path's own equivalence, not byte equality. A stored answer the backend
             accepted and keeps can differ from the offered label by edge whitespace or case
             (the Mytos degree classification), and refusing it here forced a re-pick that
             changed the answer bytes for nothing. An answer naming no option still refuses. */
          : exactQuestionOption(direct.answer, safeDirectTask.question.options) === null))
    )) {
      const message = "The employer's question changed while you were answering. Your answer is still here. Review the current field and try again.";
      rememberDirectFailure(message);
      return { saved: false, message };
    }
    const answerDraftQuestions = direct
      ? activeSubmission.review.questions.map((question) => (
        question.id === direct.questionId
          ? { ...question, answer: direct.answer, answer_state: direct.answerState }
          : question
      ))
      : questions;
    if (direct && !answerDraftQuestions.some((question) => question.id === direct.questionId)) {
      const message = "Litos could not match this answer to the employer's question. Review the packet and try again.";
      rememberDirectFailure(message);
      return { saved: false, message };
    }
    const completedDirectPromptFingerprints = new Set(
      activeDirectPassKey && activeDirectPass?.key === activeDirectPassKey
        ? activeDirectPass.promptFingerprints
        : [],
    );
    const activeDirectQuestionTotal = direct && activeDirectTaskPlan
      ? Math.max(
        activeDirectProgress?.key === activeDirectPassKey ? activeDirectProgress.total : 0,
        completedDirectPromptFingerprints.size + activeDirectTaskPlan.questionTasks.filter((task) => (
          !completedDirectPromptFingerprints.has(directQuestionPromptFingerprint(task))
        )).length,
      )
      : 0;
    savingAnswersRef.current.add(applicationId);
    setSavingAnswerIds((current) => new Set(current).add(applicationId));
    if (direct) {
      setDirectAnswerFailures((current) => {
        if (!current.has(applicationId)) return current;
        const next = new Map(current);
        next.delete(applicationId);
        return next;
      });
    }
    setError(null);
    setNotice(null);
    try {
      /* The CONFIRM presses recorded for THIS application, flagged onto exactly those questions and
         no others. A question she confirmed and then emptied is not flagged: a confirmation of a
         blank claims nothing, and the server would mint nothing for it anyway. */
      const confirmedIds = confirmIntentsRef.current.get(applicationId) ?? null;
      const result = await saveReviewAnswers<SubmissionResponse["review"]>({
        applicationId,
        questions: answerDraftQuestions.map((question) => {
          /* "review" mints exactly as "confirm" does, because a direct-task save IS the per-question
             deliberate act the flag exists to capture: she was shown this one question on its own
             screen and pressed its own save. Without this, an essay whose drafted answer is already
             right could never settle - the save posts unchanged bytes with no flag, the server minted
             no claim, discovery re-flagged the essay, and the same ask came back on every Approve
             pass, indefinitely (measured live on the DGA Organizing Resume Bank packet, 2026-08-26,
             three full cycles - the DV Trading loop through the review-intent door). The
             802-laundering stays shut out: `direct` is single-question by construction, so no bulk
             save can reach this branch. */
          /* "answer" mints too, for the same reason "review" was added beside "confirm": all three
             are ONE question shown on its own screen with its own save press, which is the
             per-question deliberateness bar this flag exists to hold. Leaving "answer" out left the
             last hole in it. Measured live on the Akuna Python SWE packet, 2026-08-27: the
             sponsorship disclaimer arrived pre-filled "Yes", the direct card asked for it anyway,
             and pressing Yes posted UNCHANGED bytes with no flag. The server minted nothing, so
             answer_source stayed absent; eb8cf2d reads an absent answer_source as a machine answer
             and counts the row unacknowledged; questionsMatch therefore stayed false, which is the
             one condition under which the employer-delivery re-hash may NOT stand down - so the
             packet parked on "the application questions, how Litos reaches this employer" and the
             loop could never converge, because re-pressing Yes is unchanged every time. Six other
             answers on that same packet, all of which CHANGED a value, minted applicant_review
             correctly - which is exactly the shape of the hole.
             The 802-laundering stays shut out unchanged: `direct` is single-question by
             construction, so no bulk save can reach this branch whatever its intent. */
          const directlyConfirmed = Boolean(direct)
            && question.id === direct?.questionId
            && question.answer.trim();
          const previouslyConfirmed = confirmedIds?.has(question.id) && question.answer.trim();
          return directlyConfirmed || previouslyConfirmed
            ? { ...question, confirmed: true }
            : question;
        }),
        /* `saved` is the 202's own word for "a run wrote to this packet and your answers did not
           land". api() resolves on any res.ok and hands back the body with the status gone, so this
           key is the only thing that survives the transport to distinguish it from a 200. */
        send: (path, init) => api<ReviewAnswerSaveResponse<SubmissionResponse["review"]>>(path, init),
      });
      /* Spent BEFORE the switch guard below, because by this point the server has already accepted
         the write and minted the claim - tapping another packet during the round-trip must not leave
         a spent intent behind to silently re-assert a confirmation on the NEXT save of answers she
         may have since edited. A refused or raced save keeps the intents, exactly as it keeps her
         typing: nothing was minted, so nothing was spent. */
      if (result.saved) confirmIntentsRef.current.delete(applicationId);
      if (!result.saved) {
        if (direct) rememberDirectFailure(result.message);
        const refusalStillOwnsApplication = applicationsMountedRef.current
          && selectedIdRef.current === applicationId
          && editorRevisionRef.current === selectionRevision
          && submissionPublicationGeneration(
            submissionPublicationGenerationsRef.current,
            applicationId,
          ) === requestedPublicationGeneration;
        if (result.review && refusalStillOwnsApplication) {
          submissionMutationGenerationRef.current += 1;
          const latestSubmission = submissionSnapshotsRef.current.get(applicationId)
            ?? (submissionRef.current?.application_id === applicationId ? submissionRef.current : activeSubmission);
          const refreshed: SubmissionResponse = { ...latestSubmission, application_id: applicationId, review: result.review };
          const reconciled = nextSubmissionState(latestSubmission, refreshed);
          submissionSnapshotsRef.current.set(applicationId, reconciled);
          setPackets((current) => current?.map((packet) => packet.id === applicationId ? packetWithDirectSubmission(packet, reconciled) : packet) ?? current);
          const submissionBeforeRefusal = submissionRef.current;
          const published = publishSubmissionEnvelope(submissionRef, reconciled, "direct");
          if (published !== submissionBeforeRefusal) {
            advanceSubmissionPublicationGeneration(submissionPublicationGenerationsRef.current, applicationId);
          }
          setSubmission(published);
          /* A refused save that carries a review is a run having written to the packet under this
             request. The typing stays hers, but standing exact-packet evidence must be re-measured
             against what that run stored: the same reconciliation as the accepted path, so evidence
             survives only a byte-identical packet and the winning run's edit voids it. */
          const evidenceAfterRefusal = reconcilePacketEvidenceWithSubmission(
            packetEvidenceRef.current,
            applicationId,
            published.review.questions ?? [],
            published.review.packet_audit,
          );
          packetEvidenceRef.current = evidenceAfterRefusal;
          setPacketEvidence(evidenceAfterRefusal);
        }
        if (!direct) setError(result.message);
        return { saved: false, message: result.message, ...(result.review ? { review: result.review } : {}) };
      }
      submissionMutationGenerationRef.current += 1;
      const latestSubmission = submissionSnapshotsRef.current.get(applicationId)
        ?? (submissionRef.current?.application_id === applicationId ? submissionRef.current : activeSubmission);
      const acceptedCandidate: SubmissionResponse = { ...latestSubmission, application_id: applicationId, review: result.review };
      const acceptedPublicationChanged = direct && submissionPublicationGeneration(
        submissionPublicationGenerationsRef.current,
        applicationId,
      ) !== requestedPublicationGeneration;
      const acceptedResponseIsOlder = direct && submissionSnapshotIsOlder(latestSubmission, acceptedCandidate);
      const latestDirectTaskPlan = direct
        ? directInputTaskPlan(latestSubmission.review, {
          company: selected.job_context.company,
          role: selected.job_context.role,
          documents: latestSubmission.documents,
        })
        : null;
      const latestDirectTask = direct
        ? directAnswerNavigationTasks(
          latestSubmission.review,
          latestDirectTaskPlan?.questionTasks ?? [],
          activeAnsweredTasks,
        ).find((task) => task.question.id === direct.questionId) ?? null
        : null;
      const latestStillHasSubmittedTask = direct && latestDirectTask
        ? directQuestionPromptFingerprint(latestDirectTask) === direct.promptFingerprint
          && directQuestionTaskFingerprint(latestDirectTask) === direct.taskFingerprint
        : false;
      const latestSnapshotMatchesAcceptedPass = !direct || directAnswerPassesAreCompatible(
        latestSubmission.review,
        acceptedCandidate.review,
      );
      /* The PUT can commit before its response reaches this tab. Under a slow connection, the 2.5s
         submission poll can therefore publish the committed answer first. That newer publication
         owns the canonical envelope, but it must not erase the local fact that this exact prompt was
         the answer just accepted: reversible question navigation depends on that history.

         Match every immutable boundary before treating the poll as confirmation. Application id
         keeps packets separate, question id prevents an adjacent field from satisfying the check,
         the prompt fingerprint proves the employer wording and control are unchanged, and the exact
         answer plus compatible review-pass identity prove the poll observed this write rather than
         an identical answer measured by a newer employer-form run. */
      const latestSubmittedAnswerQuestion = direct
        && latestSubmission.application_id === applicationId
        ? questionReviewPresentation(
          latestSubmission.review.questions ?? [],
          latestSubmission.review.question_metadata_blockers ?? [],
        ).editableQuestions.find((question) => (
          question.id === direct.questionId
          && directQuestionPromptFingerprint({ question }) === direct.promptFingerprint
          && question.answer === direct.answer
          && question.answer_state === direct.answerState
        )) ?? null
        : null;
      const latestSnapshotHasSubmittedAnswer = latestSnapshotMatchesAcceptedPass
        && latestSubmittedAnswerQuestion !== null;
      /* A changed publication with the same timestamp cannot be ordered by the clock. The direct
         response wins only while the latest snapshot still carries the exact task the applicant
         answered in the same question pass. If the latest snapshot already holds that answer in a
         newer pass, changed the prompt, or removed it, retain the latest application instead of
         restoring the older response body. */
      const acceptedResponseOwnsSnapshot = !direct
        || !acceptedPublicationChanged
        || (latestSnapshotMatchesAcceptedPass && !acceptedResponseIsOlder && (
          latestSubmission.review.updated_at !== acceptedCandidate.review.updated_at
          || latestStillHasSubmittedTask
        ));
      const acceptedAnswerOwnsProgress = acceptedResponseOwnsSnapshot || latestSnapshotHasSubmittedAnswer;
      const saved = acceptedResponseOwnsSnapshot
        ? acceptedPublicationChanged
          ? nextSubmissionState(latestSubmission, acceptedCandidate)
          : acceptedCandidate
        : latestSubmission;
      if (acceptedResponseOwnsSnapshot) {
        if (saved !== latestSubmission) {
          advanceSubmissionPublicationGeneration(submissionPublicationGenerationsRef.current, applicationId);
        }
        submissionSnapshotsRef.current.set(applicationId, saved);
        setPackets((current) => current?.map((packet) => packet.id === applicationId ? packetWithDirectSubmission(packet, saved) : packet) ?? current);
      }
      if (direct && safeDirectTask && safeDirectPromptFingerprint && acceptedAnswerOwnsProgress) {
        completedDirectPromptFingerprints.add(safeDirectPromptFingerprint);
        const savedDirectTaskPlan = directInputTaskPlan(saved.review, {
          company: selected.job_context.company,
          role: selected.job_context.role,
          documents: saved.documents,
        });
        const remainingDirectQuestions = savedDirectTaskPlan.questionTasks.filter((task) => (
          !completedDirectPromptFingerprints.has(directQuestionPromptFingerprint(task))
        ));
        const answeredQuestion = saved.review.questions.find((question) => (
          question.id === direct.questionId
          && directQuestionPromptFingerprint({ question }) === safeDirectPromptFingerprint
        )) ?? { ...safeDirectTask.question, answer: direct.answer, answer_state: direct.answerState };
        const answeredTask = { ...safeDirectTask, question: answeredQuestion };
        const answeredTasks = activeAnsweredTasks.some((task) => (
          directQuestionPromptFingerprint(task) === safeDirectPromptFingerprint
        ))
          ? activeAnsweredTasks.map((task) => (
            directQuestionPromptFingerprint(task) === safeDirectPromptFingerprint ? answeredTask : task
          ))
          : [...activeAnsweredTasks, answeredTask];
        const savedDirectNavigationTasks = directAnswerNavigationTasks(
          saved.review,
          savedDirectTaskPlan.questionTasks,
          answeredTasks,
        );
        const savedDirectQuestionIndex = savedDirectNavigationTasks.findIndex((task) => (
          directQuestionPromptFingerprint(task) === safeDirectPromptFingerprint
        ));
        const nextSavedDirectQuestion = savedDirectQuestionIndex >= 0
          ? savedDirectNavigationTasks[savedDirectQuestionIndex + 1] ?? null
          : remainingDirectQuestions[0] ?? null;
        const savedPassKey = directAnswerPassKey(saved.review);
        setDirectAnswerPasses((current) => {
          const next = new Map(current);
          next.set(applicationId, {
            key: savedPassKey,
            promptFingerprints: new Set(completedDirectPromptFingerprints),
          });
          return next;
        });
        setDirectAnswerProgresses((current) => {
          const next = new Map(current);
          next.set(applicationId, {
            key: savedPassKey,
            answeredTasks,
            cursorPromptFingerprint: nextSavedDirectQuestion
              ? directQuestionPromptFingerprint(nextSavedDirectQuestion)
              : safeDirectPromptFingerprint,
            lastSavedPromptFingerprint: safeDirectPromptFingerprint,
            navigationToken: (activeDirectProgress?.key === activeDirectPassKey
              ? activeDirectProgress.navigationToken
              : 0) + 1,
            total: Math.max(
              activeDirectQuestionTotal,
              completedDirectPromptFingerprints.size + remainingDirectQuestions.length,
            ),
          });
          return next;
        });
        setDirectAnswerDrafts((current) => {
          const applicationDrafts = current.get(applicationId);
          if (!applicationDrafts) return current;
          if (!applicationDrafts.has(safeDirectPromptFingerprint)
            && ![...applicationDrafts.values()].some((draft) => draft.questionId === direct.questionId)) return current;
          const next = new Map(current);
          const nextApplicationDrafts = new Map(applicationDrafts);
          for (const [promptFingerprint, draft] of nextApplicationDrafts) {
            if (promptFingerprint === safeDirectPromptFingerprint || draft.questionId === direct.questionId) {
              nextApplicationDrafts.delete(promptFingerprint);
            }
          }
          if (nextApplicationDrafts.size > 0) next.set(applicationId, nextApplicationDrafts);
          else next.delete(applicationId);
          return next;
        });
        setDirectAnswerFailures((current) => {
          if (!current.has(applicationId)) return current;
          const next = new Map(current);
          next.delete(applicationId);
          return next;
        });
      }
      // A direct response can safely reconcile after A to B to A. An intervening publication is
      // compared by actual review recency, so an older hydration cannot defeat the accepted answer
      // and a genuinely newer snapshot still wins. The selected id keeps A from navigating B.
      if (
        !acceptedAnswerOwnsProgress
        || !applicationsMountedRef.current
        || selectedIdRef.current !== applicationId
      ) return {
        saved: true,
        review: result.review,
        mayAdvance: false,
        ...(safeDirectPromptFingerprint ? { promptFingerprint: safeDirectPromptFingerprint } : {}),
        ...(direct && !latestSnapshotMatchesAcceptedPass
          ? { retryMessage: directAnswerPassRetryMessage(direct.intent) }
          : {}),
      };
      const publishSavedAnswer = () => {
        const submissionBeforeAnswer = submissionRef.current;
        const published = publishSubmissionEnvelope(submissionRef, saved, "direct");
        if (published !== submissionBeforeAnswer) {
          advanceSubmissionPublicationGeneration(submissionPublicationGenerationsRef.current, applicationId);
        }
        /* THE AUDIT SURVIVES A SAVE EXACTLY AS LONG AS THE PACKET IT AUDITED DOES. This used to be
           an unconditional wipe (the direct branch here, the answers screen's own press for the bulk
           one), which was the final leg of the Mytos loop (application 55de7c9e, 2026-08-28): the
           applicant's acknowledged exact-packet audit was destroyed by the very save that changed
           nothing, metadataRefreshOutranksStandingAttention lost its acknowledged-audit arm, the
           stale attention sentence re-occluded the launch panel, and the flow cycled answers screen
           to attention screen with the managed re-read never on screen. The reconciliation is the
           same decision prepareApplication, completeHandoff and recordSelfSubmitted already apply
           to their own server envelopes: evidence stands only while the response's questions still
           byte-match the audited snapshot and the packet audit identity is unchanged, so a save
           that edited any answer still voids it, and nothing is ever acknowledged on her behalf. */
        const nextEvidence = reconcilePacketEvidenceWithSubmission(
          packetEvidenceRef.current,
          applicationId,
          published.review.questions,
          published.review.packet_audit,
        );
        packetEvidenceRef.current = nextEvidence;
        setPacketEvidence(nextEvidence);
        if (direct) {
          setDirectAnswerAnnouncement({ token: Date.now(), message: "Saved to this application." });
        }
        setSubmission(published);
        setQuestions(mergeDiscoveredQuestions(answerDraftQuestions, published.review.questions));
        setFocusQuestion(null);
        /* The direct flow saves from the attention screen and stays inside its own navigator, so it
           keeps the bare status route. The answers screen's Save routes through the domain landing:
           a still-blank required answer keeps the answers screen instead of bouncing into the
           one-question flow, and a launch-ready packet (metadata_refresh route, acknowledged audit
           preserved above) lands on the attention screen where the panel provably leads. */
        moveToScreen(direct
          ? screenForStatus(published.review.status, "portal")
          : reviewedAnswersSaveLanding(published.review, Boolean(nextEvidence?.acknowledged), {
            company: selected.job_context.company,
            role: selected.job_context.role,
            documents: published.documents,
          }).screen);
        if (!direct) setNotice(result.notice);
      };
      if (direct) runDashboardTransition(publishSavedAnswer);
      else publishSavedAnswer();
      return {
        saved: true,
        review: saved.review,
        mayAdvance: true,
        ...(safeDirectPromptFingerprint ? { promptFingerprint: safeDirectPromptFingerprint } : {}),
      };
    } finally {
      savingAnswersRef.current.delete(applicationId);
      setSavingAnswerIds((current) => {
        const next = new Set(current);
        next.delete(applicationId);
        return next;
      });
    }
  }

  /* Hand the employer's emailed code to the backend and let it finish the send.
   *
   * The guard is a ref, not state, for the same reason approveInFlight is: a second Enter or a
   * second click can land in the same tick, before any re-render, and the thing on the other end of
   * this request is a real application to a real employer.
   *
   * A repeat of the SAME code is not actually dangerous - the endpoint fingerprints it and answers
   * from the stored attempt without making a run - but a repeat that arrives while the first is
   * still going would start a second run before the first has written anything for the fingerprint
   * to match. So both ends hold the line. */
  const securityCodeInFlight = useRef<string | null>(null);
  const [securityCodeId, setSecurityCodeId] = useState<string | null>(null);
  const [securityCodeError, setSecurityCodeError] = useState<string | null>(null);

  async function submitSecurityCode(code: string) {
    if (!selected || !submission || submission.application_id !== selected.id) return;
    if (securityCodeInFlight.current === selected.id) return;
    const requestedId = selected.id;
    securityCodeInFlight.current = requestedId;
    setSecurityCodeId(requestedId);
    setSecurityCodeError(null);
    try {
      const rawResult = await api<unknown>(
        `/applications/${requestedId}/security-code`,
        { method: "POST", body: JSON.stringify({ code }) },
      );
      if (!submissionMutationResponseMatchesApplication(rawResult, requestedId)) {
        throw new Error("Litos could not verify the employer's response for this application. Nothing was shown as sent.");
      }
      const result = submissionResponseForDisplay(
        rawResult as SubmissionResponse & { already_attempted?: boolean; outcome?: string },
        { packetId: requestedId },
      ) as SubmissionResponse & { already_attempted?: boolean; outcome?: string };
      const confirmed = confirmedProjectionForPacket(result.submission_projection, {
        packetId: requestedId,
        retrySafety: result.retry_safety ?? null,
      });
      if (result.application_id !== requestedId
        || result.submission_authority_quarantined === true
        || !confirmed) {
        throw new Error("Litos could not confirm that the employer received this application. Nothing was shown as sent.");
      }
      // The packet on screen after a multi-minute run need not be the one this started on: the
      // switcher renders above this screen, so tapping another row mid-run is a single tap. Same
      // guard, same reason, as approveFinalSubmission.
      if (selectedIdRef.current !== requestedId) return;
      submissionRef.current = result;
      setSubmission(result);
      if (result.already_attempted && result.outcome !== "accepted") {
        setSecurityCodeError("Litos already tried that exact code and the employer did not accept it. Use the newest email.");
      }
      moveToScreen(screenForStatus(result.review.status, "portal"));
    } catch (reason) {
      if (selectedIdRef.current !== requestedId) return;
      if (await recoverPacketAuditReview(requestedId, reason)) return;
      setSecurityCodeError(reason instanceof Error ? reason.message : "Could not send the security code.");
    } finally {
      securityCodeInFlight.current = null;
      setSecurityCodeId(null);
    }
  }

  /* Answer the one question that unlocks a re-run of an application that stopped without saying
   * whether it reached the employer. `found` is her own look, never a guess: `true` records this as
   * sent (the same terminal state a confirmed send reaches, with the source named so the receipt
   * never claims Litos verified it), `false` releases the claim so submit-request's disposition gate
   * can start a fresh run instead of refusing forever. Ref-guarded for the same reason
   * submitSecurityCode is: a real employer sits on the other end, and a repeat while the first
   * answer is still in flight must not fire a second request. */
  const unverifiedSubmissionInFlight = useRef<string | null>(null);
  const [unverifiedSubmissionId, setUnverifiedSubmissionId] = useState<string | null>(null);
  const [unverifiedSubmissionError, setUnverifiedSubmissionError] = useState<string | null>(null);

  async function submitUnverifiedOutcome(found: boolean) {
    if (!selected || !submission || submission.application_id !== selected.id) return;
    if (unverifiedSubmissionInFlight.current === selected.id) return;
    const requestedId = selected.id;
    unverifiedSubmissionInFlight.current = requestedId;
    setUnverifiedSubmissionId(requestedId);
    setUnverifiedSubmissionError(null);
    try {
      const now = new Date().toISOString();
      const rawResult = qaMode
        ? found
          ? {
            ...submission,
            review: {
              ...submission.review,
              status: "submitted" as const,
              submitted_at: submission.review.unverified_submission?.at ?? now,
              submission_error: undefined,
              attention_reason: undefined,
              attention_categories: undefined,
              unverified_submission: { ...submission.review.unverified_submission!, resolution: "sent" as const, resolved_at: now },
              receipt: {
                confirmation_text: "Confirmed by you: you found this application in the employer’s portal after Litos pressed Send and lost the answer.",
                final_url: submission.review.unverified_submission?.portal_url ?? submission.review.portal_url ?? "/qa/portal-submission/success",
                captured_at: now,
                source: "attended_handoff" as const,
              },
            },
          }
          : {
            ...submission,
            review: {
              ...submission.review,
              status: "needs_attention" as const,
              submission_claimed_at: undefined,
              unverified_submission: { ...submission.review.unverified_submission!, resolution: "not_sent" as const, resolved_at: now },
              attention_reason: "You checked and the employer does not have this one, so nothing was sent. Litos can send it again whenever you are ready.",
              attention_categories: ["unverified_submission" as const],
            },
          }
        : await api<SubmissionResponse>(`/applications/${requestedId}/submission/unverified`, {
          method: "POST",
          body: JSON.stringify({ found }),
        });
      const result = qaMode
        ? rawResult
        : submissionResponseForDisplay(rawResult, { packetId: requestedId });
      if (selectedIdRef.current !== requestedId) return;
      submissionRef.current = result;
      setSubmission(result);
      setPackets((current) => current?.map((packet) => packet.id === requestedId ? packetWithSubmission(packet, result) : packet) ?? current);
      moveToScreen(screenForStatus(result.review.status, "portal"));
    } catch (reason) {
      if (selectedIdRef.current !== requestedId) return;
      setUnverifiedSubmissionError(reason instanceof Error ? reason.message : "Could not record what you found.");
    } finally {
      unverifiedSubmissionInFlight.current = null;
      setUnverifiedSubmissionId(null);
    }
  }

  async function retryPreparation() {
    if (!selected || !submission || submission.application_id !== selected.id) return;
    const currentQuestions = mergeDiscoveredQuestions(questions, submission.review.questions);
    setQuestions(currentQuestions);
    await prepareApplication(currentQuestions, { allowServerAnswerRefresh: true });
  }

  async function approveFinalSubmission() {
    if (!selected || !submission) return;
    if (submission.application_id !== selected.id) return;
    if (qaMode === false && educationProfileStatus !== "ready") {
      setError("Litos has to check this resume against your current profile before sending.");
      moveToScreen("portal");
      return;
    }
    const drift = educationDriftMessage(educationDrift(selected.spec, educationProfile));
    if (drift) {
      setError(drift);
      moveToScreen("review");
      return;
    }
    // Second press of "Send it" for THIS application while the first is still going.
    if (approveInFlight.current === selected.id) return;
    const requestedId = selected.id;
    approveInFlight.current = requestedId;
    setApprovingId(requestedId);
    setApproveStartedAt(new Date().toISOString());
    setError(null);
    setSendRefusal(null);
    setSubmittingPhase("sending");
    moveToScreen("submitting");
    try {
      if (qaMode) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        const now = new Date().toISOString();
        const result = { ...submission, review: { ...submission.review, status: "submitted" as const, submitted_at: now, receipt: { confirmation_text: "Thank you. Your controlled test application was received.", final_url: "/qa/portal-submission/success", screenshot_url: "/qa/portal-receipt.svg", captured_at: now, reference_id: "LITOS-QA-2027" } } };
        setSubmission(result);
        moveToScreen("submitted");
      } else {
        const raw = await api<SubmissionResponse>(`/applications/${selected.id}/submission/approve`, { method: "POST" });
        const result = submissionResponseForDisplay(raw, { packetId: requestedId });
        captureCompletedSubmission(result, "final_approval");
        /* The packet the student is LOOKING at, which after a multi-minute send need not be the one
           they approved: the packet switcher renders above every screen including this one, so
           tapping another row mid-send is a single tap. refreshSubmission has guarded exactly this
           since the wrong-employer finding; this path did not, and installing A's result while B is
           selected renders A's confirmation text and reference id under B's role and company. The
           send still completed and the poll will pick it up when they return to it. */
        if (selectedIdRef.current !== requestedId) return;
        submissionRef.current = result;
        setSubmission(result);
        /* This response is the END of the send, not an acknowledgement that it started, exactly as
           in prepareApplication above, and it was installed into state and then never routed off.
           The QA branch four lines up has always called moveToScreen; the real one never did.
           BE PRECISE ABOUT WHAT THAT COSTS, because the obvious overstatement is wrong: the
           submission poll below also routes off the status, so a FOREGROUNDED tab recovers within
           its 2.5s tick and the student sees the receipt. The poll is the only thing that was
           saving this, and it is deliberately suppressed while `document.visibilityState` is not
           "visible". So the screen that never resolves is the backgrounded one, which is the
           ordinary case here: a portal run takes minutes and the whole point of the copy is that
           you can go and do something else. Routing off the response we already hold costs nothing
           and does not depend on the tab being watched.
           The fallback is "portal", the screen this was entered from, so an unrecognised status
           returns to a screen with controls on it rather than parking on the spinner again. */
        moveToScreen(screenForStatus(result.review.status, "portal"));
      }
    } catch (reason) {
      /* Back to the screen this came from, and back to "preparing": leaving the phase on "sending"
         would caption the NEXT run of the progress screen as a send that is not happening. */
      setSubmittingPhase("preparing");
      if (await recoverPacketAuditReview(requestedId, reason)) return;
      moveToScreen("portal");
      /* WHERE A REFUSED SEND IS SAID, and it is beside the button rather than at the top of the
         page. The same argument ISSUE-043 settled for the composer: this screen is long, the Send
         it button sits below a resume preview and an answers table, and a banner rendered above all
         of that is measured off screen from the control that raised it. A 409 named after the
         button that caused it is the only version she can act on.

         `issues` is carried separately from the sentence because the 422 on this route,
         FINAL_APPROVAL_VERIFICATION_FAILED, sends a list of named blockers and every one of them is
         a specific thing to go and fix. apiErrorMessage folds up to five of them into the message
         string; holding the array lets them be rendered as the list they are. */
      refuseSend(
        requestedId,
        reason instanceof Error ? reason.message : "Could not approve the final portal submission.",
        reason instanceof ApiError ? reason.issues : [],
      );
    } finally {
      approveInFlight.current = null;
      setApprovingId(null);
    }
  }

  /* THE WAY OUT THE SERVER'S OWN SENTENCE PROMISES.
   *
   * "That took too long and timed out. Start the application again." had nothing behind it on this
   * screen: no control started an application again, and R-066 makes packets write-once with no
   * delete, so there was no second route either. PR #375 added `restart: true` on
   * POST /applications/:id/submit-request for exactly this, and its own 409 names the flag.
   *
   * The questions go with it, unchanged, because that is the body this route takes and dropping
   * them would restart the run against an empty answer set. */
  async function restartPreparedRun() {
    if (!selected || !submission || restartingId) return;
    if (submission.application_id !== selected.id) return;
    setRestartingId(selected.id);
    try {
      /* The stored questions, not the local `questions` state: this is pressed from the portal
         screen, where the editor may never have been opened for this packet.

         `allowServerAnswerRefresh` because the local blank-required check in front of this route is
         a closed loop for a restart. Only a fill run discovers and answers a form's questions, so
         refusing to start one because a discovered question is blank means it can never be filled.
         The server keeps its own send gates, which see what the run found rather than this. */
      await prepareApplication(submission.review.questions, { allowServerAnswerRefresh: true, restart: true });
    } finally {
      setRestartingId(null);
    }
  }

  /* The escape from a stale question inventory. A stopped run may know that a closed employer
     control exists without having its exact options, and opening the editor used to trap the user
     there: Save cannot manufacture the options, while the ordinary review action routed straight
     back to the same editor. This reuses the ONE submit-request path so Litos can read the live form
     again. Only the last server-saved answers go with it. Local edits must be saved or discarded
     first, which prevents a button labelled as a read from transmitting an unsaved answer. */
  async function refreshEmployerQuestionMetadata() {
    if (!selected || !selectedSubmission) return;
    const applicationId = selected.id;
    if (selectedSubmission.application_id !== applicationId) return;
    if (metadataRefreshRef.current === applicationId) return;
    if (packetQuestionsSnapshot(questions) !== packetQuestionsSnapshot(selectedSubmission.review.questions)) {
      setError("Save or discard your answer edits before reading the employer fields again.");
      return;
    }
    if (!packetEvidenceReady || !activePacketEvidence) {
      setMetadataRefreshError(null);
      reviewPacketAgain();
      setNotice("Review the exact packet first, then Litos can read and fill the employer form again.");
      return;
    }
    metadataRefreshRef.current = applicationId;
    setMetadataRefreshId(applicationId);
    setMetadataRefreshError(null);
    setError(null);
    try {
      await continueFromVerifiedPacket({
        allowServerAnswerRefresh: true,
        failureScreen: "questions",
        source: "metadata_refresh",
      });
    } finally {
      if (metadataRefreshRef.current === applicationId) metadataRefreshRef.current = null;
      setMetadataRefreshId((current) => current === applicationId ? null : current);
    }
  }

  const visiblePageError = historicalPacketAuditStaleMessage(error) ? null : error;
  const visiblePollError = historicalPacketAuditStaleMessage(pollError) ? null : pollError;

  if (visiblePageError && packets === null) {
    return (
      <EmptyState
        visual="error"
        headingLevel="h1"
        title="Applications did not load."
        body="Your applications are still saved. Try loading this view again."
      >
        <Button type="button" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className={applicationTaskOpen ? "space-y-4" : "space-y-6"}>
      <p key={directAnswerAnnouncement?.token ?? "direct-answer-idle"} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {directAnswerAnnouncement?.message ?? ""}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="applications-heading" tabIndex={-1} className="text-section font-normal leading-[1.15] tracking-[-0.02em] text-ink outline-none">Applications</h1>
          {/* Every selected screen needs a way back to the mobile list. Desktop keeps the compact
              switcher beside the detail, so this control would only repeat it there. */}
          {applicationTaskOpen && (
            <button
              type="button"
              onClick={closeApplication}
              className="mt-1 inline-flex min-h-11 items-center rounded-full px-3 text-sm text-muted transition-colors hover:bg-surface-alt hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              ← All applications
            </button>
          )}
        </div>
        {/* The selected packet's status already prints on its own row and inside the review
            surface; a third copy in the page header was noise. */}
        {/* The "Send without asking" switch used to sit here. It now lives on the Jobs header,
            beside the list the sending draws from. This page still READS the same server field,
            because the lock note and the cancel window below are that setting's consequence, and
            the consequence stays where the applications are. */}
        {!applicationTaskOpen && (showNewApplication || packets === null || reviewablePackets.length > 0) && (
          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="button"
              variant={showNewApplication ? "quiet" : "primary"}
              onClick={showNewApplication ? closeNewApplication : () => setShowNewApplication(true)}
            >
              {showNewApplication ? "Close" : "Fill application"}
            </Button>
          </div>
        )}
      </div>

      {/* No autopilot.error row here any more. That error is only ever set by the toggle's own
          save, and the toggle is on Jobs now, so a copy on this page could never fire. */}
      {!applicationTaskOpen && canUse("automatic_submission") !== false && <AutopilotLockNote enabled={autopilot.enabled} eligibility={autopilot.eligibility} />}
      {!applicationTaskOpen && preferenceError && <ErrorNote message={preferenceError} />}
      {!applicationTaskOpen && packets !== null && reviewablePackets.length > 0 && (
        <NextMatchCard
          match={nextMatch}
          /* The only thing this card is still waiting on. Packets are loaded by the time it mounts
             (the guard above requires it), so the preferences fetch is what decides whether a null
             match means "not yet" or "none". It settles to [] even when it fails, so this cannot
             stay true forever the way `match === null` could. */
          searching={currentMatches === null}
          autopilot={Boolean(autopilot.enabled)}
          appliedToday={appliedToday}
          waiting={(() => {
            /* The DOMAIN's own action membership over reviewablePackets, the rows the ledger
               draws from, so this count equals what the ?state=action link opens (before any
               search text typed there). Measured live 2026-08-28: 88 here, "88 of 100" on that
               view. Home's tile can still read lower when the bootstrap's embedded
               resume_history window is shorter than the tracker's; that is the loader's problem
               (see load-dashboard.ts), not a different membership. */
            const count = reviewablePackets.filter((packet) => (
              packet.spec._review != null && statusMatchesApplicationFilter(packet.spec._review, "action")
              // Same membership the ?state=action view now renders: repeats and already-applied rows
              // are dropped, so this tile counts live opportunities rather than un-sendable copies.
              && duplicateBadge(duplicateMarks.get(packet.id)) === null
            )).length;
            return count > 0 ? { count, href: "/dashboard/applications?state=action" } : null;
          })()}
          onSend={(id) => void sendWithoutAsking(id)}
          onOpen={(id) => {
            const packet = (packets ?? []).find((item) => item.id === id);
            if (packet) openApplication(packet);
          }}
        />
      )}

      {/* KNOWN, NOT IN SCOPE, and recorded here because it is the mechanism behind a number in the
          ISSUE-043 measurements. This banner renders IMMEDIATELY ABOVE the composer, so a
          page-level error arriving while the composer is open pushes the whole composer down by
          this element's height. That is why the baseline scroll position moved 586 -> 674 and
          420 -> 488 when the generate request failed: the banner appeared here and shoved
          everything below it, carrying the banner itself further from the button.

          ISSUE-043 means the refusal now travels WITH the button, so the message can no longer be
          pushed away from the control that raised it. The button itself can still jump under the
          student's cursor when a genuine page-level error lands mid-press. Not a regression, and
          not something a placement fix can reach: it needs this banner reserved or moved, which is
          a layout change to the whole screen. */}
      {/* One banner, two sources, and `error` wins. A refusal to something the student pressed
          outranks news about the connection, and the poll can no longer overwrite either. */}
      {(visiblePageError ?? visiblePollError) && <ErrorNote message={visiblePageError ?? visiblePollError!} />}
      {/* Derived from the SPEC BEING EDITED, not from the stored packet, so it clears the moment
          the student fixes the education line rather than sitting there until she saves. */}
      {reviewOpen && educationDriftBanner && (
        <p role="alert" className="rounded-inner bg-danger-soft px-4 py-3 text-sm text-danger">{educationDriftBanner}</p>
      )}
      {notice && <p role="status" className="rounded-inner bg-positive-soft px-4 py-3 text-sm text-positive">{notice}</p>}
      {fillReceipt && <ApplicationFillReceipt receipt={fillReceipt} onClose={() => setFillReceipt(null)} />}
      {showNewApplication && (
        <NewApplicationPanel
          value={newApplication}
          onChange={applyDraftEdit}
          /* React click handlers receive the click event. Passing createApplication directly made
             that event replace the optional draft argument, so the first .trim() crashed in
             production instead of generating the application. */
          onFill={() => void fillApplication()}
          onTailor={(upgradeTrigger) => void createApplication(newApplication, upgradeTrigger)}
          creating={creating}
          onFetchJobDescription={fetchJobDescription}
          extractingJd={extractingJd}
          refusal={composerRefusal}
        />
      )}
      {legacyCount > 0 && !applicationTaskOpen && (
        <p className="border-y border-border py-3 text-sm text-muted">
          {legacyCount} saved resume{legacyCount === 1 ? "" : "s"} · Add a job URL to turn one into a reviewable application.
        </p>
      )}

      {/* The landing ledger is for browsing. Once an application is open, its compact identity row
          stays in the same place and the full ledger moves behind Switch applications, keeping the
          packet or blocker task above the fold without taking away fast cross-application access. */}
      {packets !== null && (applicationTaskOpen ? reviewablePackets.length > 0 : ledgerRendersOnLanding(applicationFilter, reviewablePackets.length)) && (
        <section aria-labelledby="application-ledger-heading" className="border-y border-border">
          {applicationTaskOpen ? (
            <div className="flex min-h-14 items-center justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <h2 ref={applicationTaskHeadingRef} tabIndex={-1} id="application-ledger-heading" className="line-clamp-2 text-sm font-medium leading-5 text-ink outline-none">{applicationTaskRole}</h2>
                <p className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted">
                  <span className="truncate">{applicationTaskCompany}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0 font-mono text-label uppercase tracking-[0.06em]">{applicationTaskStatus}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSwitcherOpen((current) => !current)}
                aria-expanded={switcherOpen}
                aria-controls={switcherOpen ? "application-switcher-list" : undefined}
                aria-label={switcherOpen ? "Done" : "Switch applications"}
                className="min-h-11 shrink-0 rounded-control border border-control-border px-4 text-small font-medium text-ink transition-colors hover:border-ink"
              >
                {switcherOpen ? "Done" : (
                  <>
                    <span aria-hidden="true" className="sm:hidden">Switch</span>
                    <span aria-hidden="true" className="hidden sm:inline">Switch applications</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-3">
              <h2 id="application-ledger-heading" tabIndex={-1} className="text-sm font-medium text-ink outline-none">{applicationFilterHeading(applicationFilter)}</h2>
              <span data-testid="application-ledger-count" className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted">{visiblePackets.length === reviewablePackets.length
                ? `${reviewablePackets.length}`
                : `${visiblePackets.length} of ${reviewablePackets.length}`}</span>
              {duplicatePostingNote(duplicateMarks) && (
                <span className="basis-full text-xs text-muted">{duplicatePostingNote(duplicateMarks)}</span>
              )}
            </div>
          )}

          {(!applicationTaskOpen || switcherOpen) && <div id="application-switcher-list">
            <div className="flex flex-col gap-2 border-t border-border py-3 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="application-search">Search applications</label>
              <input
                id="application-search"
                type="search"
                value={applicationQuery}
                onChange={(event) => setApplicationQuery(event.target.value)}
                placeholder="Search role, company, or job board"
                className="min-h-11 min-w-0 flex-1 rounded-inner border border-control-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
              />
              <div className="flex gap-2">
              <label className="sr-only" htmlFor="application-filter">Filter applications</label>
              <select id="application-filter" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value as ApplicationFilter)} className="min-h-11 rounded-full border border-control-border bg-surface px-3 text-xs text-ink">
                <option value="all">Everything</option>
                <option value="action">Needs you</option>
                <option value="ready">Ready</option>
                <option value="submitted">Sent</option>
              </select>
              <label className="sr-only" htmlFor="application-sort">Sort applications</label>
              <select id="application-sort" value={applicationSort} onChange={(event) => setApplicationSort(event.target.value as ApplicationSort)} className="min-h-11 rounded-full border border-control-border bg-surface px-3 text-xs text-ink">
                <option value="next">Next action</option>
                <option value="recent">Recent first</option>
                <option value="company">Company A-Z</option>
              </select>
              </div>
            </div>

          {/* The phone-width inventory. It clipped at the viewport edge with no cue that it moved:
              the platforms this runs on hide the scrollbar until a scroll is already under way, so
              the only signal that more existed appeared to someone who had already guessed. See
              ScrollableRow, which measures rather than decorating. */}
          <ScrollableRow label="Your applications" className="-mx-4 border-t border-border px-4 py-2.5 sm:-mx-6 sm:px-6 lg:hidden">
            {visiblePackets.length === 0 ? (
              <div className="flex items-center justify-between gap-3 py-2">
                <p className="text-sm text-muted">No applications match this view.</p>
                <Button
                  type="button"
                  onClick={() => {
                    setApplicationQuery("");
                    setApplicationFilter("all");
                  }}
                  variant="secondary"
                >
                  Show all applications
                </Button>
              </div>
            ) : (
              <div className="flex min-w-max gap-2">
                {visiblePackets.map((packet) => (
                  /* Wrapped for the same reason as the desktop row: a button inside a button is
                     invalid markup and the inner one is dropped. `shrink-0` moves UP to the wrapper
                     because the wrapper is now the flex item - left on the chip alone, the strip
                     would compress the chips instead of overflowing, and this strip exists to
                     overflow and scroll. */
                  <div key={packet.id} className="relative shrink-0">
                  <button
                    type="button"
                    data-application-row-id={packet.id}
                    onClick={() => openApplication(packet)}
                    aria-pressed={packet.id === selectedApplicationRowId}
                    /* min-w-[9rem] BOUNDS THE REMOVE TARGET, and is not decoration. The dismiss
                       control reaches a FIXED 40px inward from the chip's right edge, while this
                       chip is sized by its content and `max-w` is a ceiling with no floor. A short
                       role ("PM") would size a chip near 100px, where that fixed reach is most of
                       it and tapping the right-hand side stops opening the application. A floor of
                       144px keeps the target under a third of any chip. It also makes the strip
                       read as a row of cards rather than of ragged offcuts. */
                    className={`flex min-h-11 min-w-[9rem] max-w-[15rem] shrink-0 flex-col justify-center rounded-inner border px-3 py-2 text-left ${packet.id === selectedApplicationRowId ? "border-brand bg-brand-soft" : "border-border"}`}
                  >
                    <span className={`truncate text-[13px] font-medium ${packet.id === selectedApplicationRowId ? "text-brand-ink" : "text-ink"}`}>{packet.job_context.role || "Role"}</span>
                    {/* Same pairing as the desktop row, so a company is recognised by the same mark
                        at both widths rather than by logo on one and by name on the other. */}
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      <CompanyLogo
                        size="sm"
                        company={packet.job_context.company || "Company"}
                        boardUrl={canonicalApplicationFromPacket(packet)?.portal_url ?? packet.spec._review?.portal_url}
                      />
                      <span className="truncate text-[11px] text-muted">{packet.job_context.company || "Company"}</span>
                    </span>
                    {packet.spec._review && (
                      <span className="mt-1 truncate font-mono text-label uppercase tracking-[0.05em] text-muted">
                        {statusLabel(false, packet.spec._review.status)}
                      </span>
                    )}
                    {duplicateBadge(duplicateMarks.get(packet.id)) && (
                      <span className="mt-1 truncate text-label uppercase tracking-[0.05em] text-muted">
                        {duplicateBadge(duplicateMarks.get(packet.id))!.label}
                      </span>
                    )}
                  </button>
                  <TrackerChipRemove
                    packet={packet}
                    pending={removingApplicationId === packet.id}
                    confirming={confirmRemoveId === packet.id}
                    onAsk={() => { setRemoveError(null); setConfirmRemoveId(packet.id); }}
                    onCancel={() => setConfirmRemoveId(null)}
                    onConfirm={() => removeFromTracker(packet)}
                  />
                  </div>
                ))}
              </div>
            )}
          </ScrollableRow>

          <div className="hidden max-h-[280px] overflow-y-auto border-t border-border lg:block">
            {visiblePackets.length === 0 ? (
              <div className="flex items-center justify-between gap-4 py-3">
                <p className="text-sm text-muted">No applications match this view.</p>
                <Button
                  type="button"
                  onClick={() => {
                    setApplicationQuery("");
                    setApplicationFilter("all");
                  }}
                  variant="secondary"
                >
                  Show all applications
                </Button>
              </div>
            ) : (
              <>
                {/* THE HEADER AND EVERY ROW ARE SEPARATE GRID CONTAINERS, so `auto` tracks were
                    sized from each one's OWN content: a row reading "Aug 21, 2026" had wider auto
                    columns than one reading "today", and a row carrying a second DUPLICATE chip
                    wider still, so the fr columns absorbed a different remainder each time and the
                    Company column landed somewhere different on almost every line. Measured on the
                    live Tracker 2026-08-29: five distinct x-positions across fourteen rows (893,
                    837, 870, 815, 788).
                    Fixed tracks are what make separate grids agree. 5rem clears the widest date
                    (70px) and 15rem the widest status cell (231px, "Needs you" beside "Already
                    applied"), both measured on the same account. The transparent left border
                    matches the toned one on each row so the header sits on the same 2px offset. */}
                <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_15rem] items-center gap-3 border-b border-l-2 border-l-transparent border-border px-2 py-2 text-[11px] text-muted sm:grid">
                  <span>Role</span>
                  <span>Company</span>
                  <span>Last updated</span>
                  <span>Status</span>
                </div>
                <div className="divide-y divide-border">
                  {visiblePackets.map((packet) => (
                    /* The row button is left exactly as it was and WRAPPED rather than reorganised.
                       Remove has to sit outside it: a button inside a button is invalid markup, and
                       the browser's own recovery for it drops the inner control, so the obvious
                       version of this silently does not work. The wrapper is `relative` and the
                       control is absolutely placed over the row's right edge. */
                    <div key={packet.id} className="group relative">
                    <button type="button" data-application-row-id={packet.id} onClick={() => openApplication(packet)} aria-pressed={packet.id === selectedApplicationRowId} className={`grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-l-2 px-2 text-left transition-colors sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_15rem] ${rowEdgeTone(packet.spec._review?.status)} ${packet.id === selectedApplicationRowId ? "bg-brand-soft/55" : "hover:bg-surface-alt"}`}>
                      <span className="truncate text-sm font-medium text-ink">{packet.job_context.role || "Role"}</span>
                      {/* The logo travels WITH the name rather than taking a column of its own, so
                          the name still starts on the Company track and the pair reads as one
                          identity. min-w-0 on the flex row is what lets the name truncate instead
                          of pushing the date out of its track. */}
                      <span className="hidden min-w-0 items-center gap-2 sm:flex">
                        <CompanyLogo
                          size="sm"
                          company={packet.job_context.company || "Company"}
                          /* The employer's ATS apply URL. parseBoardUrl keeps only the host and the
                             first path segment, so an apply link resolves to that employer's board
                             and the route reads identity off the page we already poll. */
                          boardUrl={canonicalApplicationFromPacket(packet)?.portal_url ?? packet.spec._review?.portal_url}
                        />
                        <span className="truncate text-xs text-muted">{packet.job_context.company || "Company"}</span>
                      </span>
                      <time className="hidden text-xs tabular-nums text-muted sm:block">{formatRelativeDate(packetTimestamp(packet))}</time>
                      <span className="flex items-center gap-1.5">
                        {packet.spec._review && <Chip label={statusLabel(false, packet.spec._review.status)} kind={chipKind(packet.spec._review.status)} />}
                        {(() => {
                          const badge = duplicateBadge(duplicateMarks.get(packet.id));
                          return badge ? <Chip label={badge.label} kind={badge.kind} /> : null;
                        })()}
                      </span>
                    </button>
                    <TrackerRowRemove
                      packet={packet}
                      pending={removingApplicationId === packet.id}
                      confirming={confirmRemoveId === packet.id}
                      onAsk={() => { setRemoveError(null); setConfirmRemoveId(packet.id); }}
                      onCancel={() => setConfirmRemoveId(null)}
                      onConfirm={() => removeFromTracker(packet)}
                    />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* OUTSIDE BOTH LISTS, because there are two of them and only one is on screen at a time.
              This lived inside the `lg:block` table, so a refusal on the chip strip - the only
              surface below lg - produced no message at all: the row simply stayed and nothing said
              why. It is one message for one shared piece of state, so it belongs where both
              surfaces can show it. */}
          {removeError && (
            <p role="status" className="px-2 pt-2 text-xs text-danger">{removeError}</p>
          )}
          </div>}
        </section>
      )}

      <MotionPanel
        key={applicationTaskPanelKey}
        name="dashboard-applications-task"
        id="application-task-panel"
        className={applicationTaskOpen ? "space-y-4" : "space-y-6"}
      >
      {packets === null ? (
        <ShimmerRows rows={4} />
      ) : canonicalSelected ? (
        <CanonicalApplicationDetail
          application={canonicalSelected}
          checkingSendPath={canonicalHydration?.id === canonicalSelected.id && canonicalHydration.status === "loading"}
          readyToSend={canonicalReadyToSend !== null}
          requiredQuestionsRemaining={canonicalRequiredQuestionsRemaining}
          onContinueToSend={() => {
            if (!canonicalReadyToSend) return;
            /* Use the same synchronous transition as an ordinary ledger row click. It records the
               local open revision before background refreshes can race it, seeds the packet review
               state, and writes the canonical application URL in one operation. This also handles
               the production case where hydration found the sendable packet after the browser had
               already reached that exact application=...&intent=apply URL, making router.replace a
               no-op. */
            openApplication(canonicalReadyToSend, { history: "replace" });
          }}
          fillBusy={creating === "fill"}
          tailorBusy={creating === "tailor"}
          coverLetterBusy={coverLetterBusy}
          coverLetterLoading={canonicalCoverLetterLoading}
          hasTailoredResume={canonicalGeneratedPacket !== null}
          /* The value onOpenPacket actually needs, not the one that merely proves a resume exists.
             onOpenPacket is `canonicalEnvelopePacket && openRevisit(...)`, so this is the same
             expression its own guard tests. */
          packetReady={canonicalEnvelopePacket !== null}
          coverLetter={canonicalCoverLetter}
          coverLetterBody={canonicalCoverLetterBody}
          coverLetterJd={canonicalCoverLetterJd}
          coverLetterEditorOpen={canonicalCoverLetterEditorOpen}
          coverLetterDownloadUrl={canonicalCoverLetter?.download_url ?? canonicalGeneratedPacket?.cover_letter_download_url ?? null}
          error={canonicalFillError}
          onFill={() => void fillApplication({
            company: canonicalSelected.company,
            role: canonicalSelected.role,
            portalUrl: canonicalSelected.portal_url ?? "",
            jobDescription: "",
            jobId: canonicalSelected.job_id ?? null,
            canonicalApplicationId: canonicalSelected.id,
          }, "tracker")}
          onTailor={(upgradeTrigger) => void tailorCanonicalApplication(canonicalSelected, upgradeTrigger)}
          onOpenCoverLetterEditor={() => {
            setCanonicalCoverLetterEditorOpen(true);
            setCanonicalCoverLetterBody((current) => current || canonicalGeneratedPacket?.spec._cover_letter?.body || "");
          }}
          onGenerateCoverLetter={(upgradeTrigger) => {
            void generateCoverLetter(canonicalGeneratedPacket?.id ?? canonicalSelected.id, {
              canonicalApplicationId: canonicalSelected.id,
              errorSurface: "canonical",
              jdText: canonicalCoverLetterJd,
              onManual: () => setCanonicalCoverLetterEditorOpen(true),
              upgradeTrigger,
            });
          }}
          onCoverLetterBodyChange={editCanonicalCoverLetterBody}
          onCoverLetterJdChange={editCanonicalCoverLetterJd}
          onSaveCoverLetter={() => void saveCanonicalCoverLetter()}
          onUploadCoverLetter={(file) => void uploadCanonicalCoverLetter(file)}
          onDeleteCoverLetter={() => void deleteCanonicalCoverLetter()}
          onOpenPacket={() => canonicalEnvelopePacket && openRevisit(canonicalEnvelopePacket.id)}
        />
      ) : reviewablePackets.length === 0 ? (
        showNewApplication ? null : (
          <EmptyState visual="applications" title={legacyCount > 0 ? `${legacyCount} resumes saved` : "No applications yet"} body={legacyCount > 0 ? "Add a job URL to fill the form or prepare a tailored packet." : "Add a job URL. Filling is unlimited, and tailoring is available with Litos+."}>
            <Button type="button" onClick={() => setShowNewApplication(true)}>Fill application</Button>
          </EmptyState>
        )
      ) : selectedId && (!selected || !spec || !review) ? (
        /* A ROW WAS CLICKED AND THE PACKET WILL NOT OPEN, so say which piece is missing.
         *
         * This branch used to fall into the Board below, which is indistinguishable from having
         * clicked nothing: the row highlights, no panel appears, and no error is logged. That cost a
         * whole session on the owner account - the Tracker listed applications marked READY whose
         * rows appeared inert, and the reason could not be told apart from a dead click handler.
         *
         * Three things must all be present for the review screen to mount, and each goes missing for
         * a different reason worth telling apart:
         *   selected - the packet id is set but no packet in `packets` carries it, so the row and the
         *              loaded history disagree about the id.
         *   spec     - /resume/history returned this row without a full spec. It caps full specs, so
         *              an older row arrives as a stub and there is nothing to review.
         *   review   - the packet has no _review, so it was never prepared and has no send flow.
         *
         * Deliberately keyed on `selectedId` rather than `selected`: the whole point is to catch the
         * case where an id was chosen and the lookup failed, which is exactly when `selected` is null. */
        <>
          {/* No SectionBoundary here on purpose. Those five bands are pinned by
            tests/section-boundary-placement.test.mjs and each one exists to contain a panel that maps
            a backend collection. This panel maps nothing and renders static copy off three booleans,
            so it has nothing to throw and adding a sixth band would only loosen that pin. */}
          <Card>
            <div className="p-6">
              <p className="font-mono text-label uppercase tracking-[0.08em] text-muted">This application will not open</p>
              <p className="mt-2 text-small leading-6 text-ink">
                Litos selected it but cannot show its review screen, so nothing has been sent. Nothing about the
                application changed by clicking it.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-small text-muted">
                {!selected && <li>The saved list does not contain a packet with this id, so the row and the loaded history disagree.</li>}
                {selected && !spec && <li>This row loaded without its full resume spec, which happens on older applications. Reload the page to fetch it.</li>}
                {selected && spec && !review && <li>This application has no prepared packet, so there is no review or send step for it yet.</li>}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={closeApplication}>Back to all applications</Button>
              </div>
            </div>
          </Card>
        </>
      ) : !selected || !spec || !review ? (
        /* A board, not a list. Reviewers of Huntr and Teal both describe the Kanban as the thing
           that replaced their spreadsheet, and what retains is that the data accumulates and stays
           theirs. The flat list this replaces showed only role and company, with no way to record
           what had actually happened with any of them. */
        /* The board is the whole of this branch, so containing it here does not save a sibling on
           this screen. It saves the SHELL: the sidebar, the mobile tab bar and the page title stay
           mounted, so a student whose board fails still has Home, Jobs and Emails one tap away
           rather than the route boundary's full-page recovery screen. */
        <SectionBoundary band="tracker-board" title="Your applications">
        <Board
          /* THE SENTENCE UNDER THIS BOARD IS ABOUT THE LIST ABOVE IT. Without this the board
             counted its own /applications/board fetch, and the ledger header directly above read a
             different total off the merged canonical inventory: 100 and 200 on one screen,
             2026-08-29. `total` is deliberately reviewablePackets.length, the exact expression the
             header renders, so agreement is structural rather than coincidental. */
          inventory={boardInventory}
          openableIds={new Set((packets ?? []).map((item) => item.id))}
          onOpen={(id) => {
            const packet = (packets ?? []).find((item) => item.id === id);
            if (packet) openApplication(packet);
          }}
          /* Revisit does NOT call selectPacket. Selecting drives the review flow and moves the
             whole page onto a screen for that packet; looking at what was already sent should
             leave the board exactly where it was, so this opens over the top and closes back to
             the same scroll position. */
          onRevisit={openRevisit}
          /* The ids the viewer can actually open, which is NOT the same set as openableIds.
             `_review` is optional on the spec, and the mark used to render for every packet in
             history while the handler quietly did nothing for the ones without a review: a fully
             styled, focusable, labelled button that was inert on click and on Enter. A control
             that cannot act should be absent, not dead. */
          revisitableIds={new Set((packets ?? [])
            .filter((item) => !canonicalApplicationFromPacket(item) && item.spec._review)
            .map((item) => item.id))}
        />
        </SectionBoundary>
      ) : screen === "questions" ? (
        <QuestionsScreen
          key={selected.id}
          applicationRole={selected.job_context.role ?? "Application"}
          applicationCompany={selected.job_context.company ?? "Company"}
          questions={questions}
          metadataBlockers={activeQuestionMetadataBlockers}
          actionableQuestionIds={actionableQuestionIds}
          onChange={setQuestions}
          onBack={() => {
            /* Back abandons the confirm presses that led here. Left standing, a CONFIRM pressed and
               then walked away from would ride the next save she makes from this packet, hours
               later, over answers a run may have rewritten in between - claiming a confirmation of
               bytes the press never saw. Pressing CONFIRM again is one tap; un-claiming a minted
               claim is not possible at all, so the intent errs toward dropping. */
            if (selected) confirmIntentsRef.current.delete(selected.id);
            moveToScreen(selectedSubmission?.review.status === "needs_attention" ? "portal" : "review");
          }}
          /* TWO SCREENS, TWO SAVES, and collapsing them is the defect. From Apply the answers ride
             into the packet on the submit-request she is about to press, so keeping them locally IS
             keeping them, and the prior exact-packet audit is voided here: those local answers are
             no longer the answers the audit was taken over. From a stopped run the save is a server
             write, and its evidence decision moves with it: saveReviewedAnswers reconciles the
             standing audit against the answers the server actually stored, so an edited answer
             still voids it while a byte-identical save no longer destroys the acknowledged audit
             the metadata-refresh launch needs (the Mytos loop, application 55de7c9e). Until the
             response lands, packetEvidenceReady already fails closed on the local edit. */
          onSubmit={() => {
            if (selectedSubmission?.review.status === "needs_attention") {
              void saveReviewedAnswers();
            } else {
              setPacketEvidence(null);
              saveApplyAnswers();
            }
          }}
          saving={selected ? savingAnswerIds.has(selected.id) : false}
          onRefreshMetadata={() => {
            if (activePrescriptLookaheadIssue) void askPrescriptQuestions(activePrescriptLookaheadIssue.jobId);
            else void refreshEmployerQuestionMetadata();
          }}
          refreshingMetadata={activePrescriptLookaheadIssue ? prescriptRetrying : metadataRefreshId === selected?.id}
          metadataRefreshDisabled={activePrescriptLookaheadIssue ? false : questionEditsUnsaved}
          metadataRefreshNeedsPacketReview={activePrescriptLookaheadIssue ? false : !packetEvidenceReady}
          metadataRefreshError={metadataRefreshError?.applicationId === selected?.id ? metadataRefreshError.message : null}
          lookaheadError={activePrescriptLookaheadIssue?.message ?? null}
          blockContinuation={Boolean(activePrescriptLookaheadIssue)}
          reviewDiscovered={selectedSubmission?.review.status === "needs_attention"}
          focusQuestion={focusQuestion}
          prescriptNote={prescriptNote}
        />
      ) : screen === "submitting" ? (
        <PortalProgress
          key={selectedSubmission?.application_id}
          status={selectedSubmission?.review.status}
          startedAt={submittingPhase === "sending" ? approveStartedAt ?? selectedSubmission?.review.updated_at : prepareStartedAt ?? selectedSubmission?.review.updated_at}
          sending={submittingPhase === "sending"}
          submission={selectedSubmission}
        />
      ) : screen === "portal" && selectedSubmission ? (
        <SubmissionScreen
          key={selectedSubmission.application_id}
          packet={selected}
          submission={selectedSubmission}
          packetEvidenceReviewed={packetEvidenceReviewed}
          manualTrialPacket={manualTrialEvidence?.response ?? null}
          approving={approvingId === selected.id}
          securityCodeSubmitting={securityCodeId === selected.id}
          securityCodeError={securityCodeError}
          onSubmitSecurityCode={submitSecurityCode}
          unverifiedSubmissionSubmitting={unverifiedSubmissionId === selected.id}
          unverifiedSubmissionError={unverifiedSubmissionError}
          onSubmitUnverifiedOutcome={submitUnverifiedOutcome}
          educationProfile={educationProfile}
          educationProfileStatus={qaMode === true ? "ready" : educationProfileStatus}
          onCheckResume={() => moveToScreen("review")}
          onReloadCoverLetter={() => void reloadCoverLetter()}
          onWriteCoverLetter={() => moveToScreen("review")}
          coverLetterReloading={coverLetterReloading}
          onHandoffComplete={completeHandoff}
          onApprove={approveFinalSubmission}
          sendRefusal={sendRefusal?.applicationId === selected.id ? sendRefusal : null}
          onRestart={() => void restartPreparedRun()}
          restarting={restartingId === selected.id}
          onRetry={retryPreparation}
          onReviewPacket={reviewPacketAgain}
          onReviewQuestions={() => reviewPortalQuestions()}
          onOpenQuestion={(questionId, intent) => reviewPortalQuestions(questionId, intent)}
          onChooseOption={chooseBlockerOption}
          onSaveQuestion={(questionId, answer, intent, promptFingerprint, taskFingerprint, task) => saveReviewedAnswers({ questionId, answer, intent, promptFingerprint, taskFingerprint, task })}
          onSkipQuestion={(questionId, intent, promptFingerprint, taskFingerprint, task) => saveReviewedAnswers({ questionId, answer: "", answerState: "skipped", intent, promptFingerprint, taskFingerprint, task })}
          savingAnswer={savingAnswerIds.has(selected.id)}
          answeredQuestionFingerprints={selectedAnsweredPromptFingerprints}
          directAnswerProgress={selectedDirectAnswerProgress}
          directAnswerDrafts={selectedDirectAnswerDrafts}
          directAnswerFailure={selectedDirectAnswerFailure}
          onDirectAnswerDraftChange={(questionId, promptFingerprint, taskFingerprint, answer) => {
            setDirectAnswerDrafts((current) => {
              const next = new Map(current);
              const applicationDrafts = new Map(current.get(selected.id) ?? EMPTY_DIRECT_ANSWER_DRAFTS);
              applicationDrafts.set(promptFingerprint, { questionId, promptFingerprint, taskFingerprint, answer });
              next.set(selected.id, applicationDrafts);
              return next;
            });
          }}
          onClearDirectAnswerDraft={(promptFingerprint) => {
            setDirectAnswerDrafts((current) => {
              const applicationDrafts = current.get(selected.id);
              if (!applicationDrafts?.has(promptFingerprint)) return current;
              const next = new Map(current);
              const nextApplicationDrafts = new Map(applicationDrafts);
              nextApplicationDrafts.delete(promptFingerprint);
              if (nextApplicationDrafts.size > 0) next.set(selected.id, nextApplicationDrafts);
              else next.delete(selected.id);
              return next;
            });
          }}
          onNavigateDirectQuestion={(promptFingerprint) => {
            runDashboardTransition(() => {
              setDirectAnswerProgresses((current) => {
                const expectedKey = directAnswerPassKey(selectedSubmission.review);
                const storedProgress = current.get(selected.id);
                /* The screen derives a fresh pass before this map has necessarily been populated.
                   The old handler treated that valid first visit as stale and silently ignored
                   Next. Seed the same pass the screen is already showing, so a visible control
                   always has a state transition behind it. */
                const progress = storedProgress?.key === expectedKey
                  ? storedProgress
                  : {
                    key: expectedKey,
                    answeredTasks: [],
                    cursorPromptFingerprint: null,
                    lastSavedPromptFingerprint: null,
                    navigationToken: 0,
                    total: directInputTaskPlan(selectedSubmission.review, {
                      company: selected.job_context.company,
                      role: selected.job_context.role,
                      documents: selectedSubmission.documents,
                    }).questionTasks.length,
                  };
                const next = new Map(current);
                next.set(selected.id, {
                  ...progress,
                  cursorPromptFingerprint: promptFingerprint,
                  navigationToken: progress.navigationToken + 1,
                });
                return next;
              });
            });
          }}
          onClearDirectAnswerFailure={(promptFingerprint) => {
            setDirectAnswerFailures((current) => {
              if (current.get(selected.id)?.promptFingerprint !== promptFingerprint) return current;
              const next = new Map(current);
              next.delete(selected.id);
              return next;
            });
          }}
          onRefreshQuestionMetadata={() => void refreshEmployerQuestionMetadata()}
          questionMetadataRefreshing={metadataRefreshId === selected.id}
          questionMetadataRefreshDisabled={questionEditsUnsaved}
          questionMetadataNeedsPacketReview={!packetEvidenceReady}
          questionMetadataRefreshError={metadataRefreshError?.applicationId === selected.id ? metadataRefreshError.message : null}
          onQuestionsFinished={() => {
            setNotice("Your answers are saved. Review the updated packet before Litos fills the company form again.");
            moveToScreen("review");
          }}
          onToggleAcknowledged={(item, acknowledged) => void toggleAttentionAcknowledgement(item, acknowledged)}
          attentionTicking={attentionTicking}
          onAddDocument={askForDocument}
          onSelfSubmitted={() => void recordSelfSubmitted()}
          onPacketAuditRefusal={(reason) => recoverPacketAuditReview(selected.id, reason)}
          onOpenWithExtension={() => void fillApplication({
            company: selected.job_context.company ?? "",
            role: selected.job_context.role ?? "",
            portalUrl: selectedSubmission.review.portal_url ?? "",
            jobDescription: "",
            jobId: selected.job_context.job_id ?? null,
            canonicalApplicationId: canonicalIdByPacketId[selected.id] ?? null,
          }, "submission")}
          extensionFillBusy={creating === "fill"}
          extensionFillError={submissionFillError}
        />
      ) : screen === "submitted" ? (
        <SubmissionReceipt review={selectedSubmission?.review ?? review} role={selected.job_context.role ?? "Role"} company={selected.job_context.company ?? "Company"} />
      ) : (
        <>
          {/* The review surface is built to be read WITHOUT SCROLLING. It used to stack a JD pane, a
              resume pane, a gaps card, a cover-letter card and a legend down the page, so the two
              things a student is actually comparing were never both fully on screen, and the
              whitespace beside a short JD pushed everything else further down.
              Now: one compact header carrying the score and the legend, then two columns that each
              scroll INSIDE themselves against a shared height. The page holds still; the panes
              move. The gap list sits under the JD, which is where the dead space was. */}
          <RequirementProvider index={requirementIndex}>
            <div className="rounded-card border border-border bg-surface-alt px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {selected.job_context.role} · {selected.job_context.company}
                  </p>
                  <p className="text-[11px] text-muted">
                    {review.ats_name ?? "the company's application page"} · resume built {formatRelativeDate(selected.created_at)}
                  </p>
                </div>
                {/* Was <ScoreRing score={extractScore(selected.spec)} /> under the caption "match".
                    That read spec._quality.atsCoverage, which counts every non-stopword in the
                    posting and therefore sat at 12-17% for a strong resume. */}
                <div className="flex shrink-0 items-center gap-3">
                  {activePacketEvidence
                    ? <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-positive">Exact packet checked</p>
                    : <MatchScore
                      jdText={draftJd.text}
                      spec={deferredSpec ?? spec}
                      jobContext={selected.job_context}
                      onResult={setMatchResult}
                      disabled={qaMode !== false}
                    />}
                </div>
              </div>
              <div className="mt-3 border-t border-border pt-2.5">
                {requirementColourCodeIsLive
                  ? <MatchLegend
                    missingCount={authoritativeMissingCount}
                    editedCount={authoritativeEditedCount}
                    unscoreableCount={auditedUnscoreableCount}
                    mode={activePacketEvidence ? "packet" : "draft"}
                  />
                  : <p className="text-[11px] text-muted">
                    Litos could not mark this posting&apos;s requirements on either side, so there is no colour code to read here.
                  </p>}
                {/* "Point at any highlighted term to see it light up on both
                    sides." came off 2026-07-28: instructions for a hover. */}
              </div>
            </div>

            {/* min-h-0 on the children is what actually lets them scroll inside a grid row. */}
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <section className="flex min-h-0 flex-col rounded-card border border-border bg-surface">
                <p className="border-b border-border px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  Job description
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 xl:max-h-[calc(100vh-15.5rem)]">
                  <div className="prose-copy whitespace-pre-line text-sm leading-6 text-ink">
                    {activePacketEvidence
                      ? <AuditedJobDescription jdText={review.jd_text} audit={activePacketEvidence.response.packet_audit} />
                      : <RequirementText text={draftJd.text} />}
                  </div>
                  {!activePacketEvidence && draftJd.removedLines.length > 0 && (
                    /* Never hide text silently: the capture's form chrome is cleaned out of the
                       pane above, and this is the way to read exactly what was stored. */
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[11px] text-muted underline underline-offset-2">
                        {draftJd.removedLines.length} form line{draftJd.removedLines.length === 1 ? "" : "s"} from the page capture hidden. Show the raw capture
                      </summary>
                      <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted">{review.jd_text}</p>
                    </details>
                  )}
                  {/* Every requirement the posting states, met or not, with the student's own
                      bullet as the reason. Collapsed behind a click because it costs a model call
                      the first time: opening it is the student asking. Sits directly under the
                      posting so a row can be read against the sentence it came from. */}
                  <div className="mt-5 border-t border-border pt-4">
                    {activePacketEvidence
                      ? <PacketAuditBreakdown jdText={review.jd_text} audit={activePacketEvidence.response.packet_audit} />
                      : <RequirementBreakdown
                        jdText={draftJd.text}
                        spec={deferredSpec ?? spec}
                        jobContext={selected.job_context}
                        disabled={qaMode !== false}
                      />}
                  </div>
                  {/* Preparation for later, under the posting it comes from. Collapsed by default:
                      expanding it is the student saying they are at that stage. */}
                  <div className="mt-5 border-t border-border pt-4">
                    <InterviewPrep jdText={draftJd.text} spec={deferredSpec ?? spec} jobContext={selected.job_context} />
                  </div>
                  {!activePacketEvidence && matchResult && matchResult.missing.length > 0 && (
                    <div className="mt-5 border-t border-border pt-4">
                      <MatchGaps
                        missing={matchResult.missing}
                        resumeText={resumeSpecText(deferredSpec ?? spec)}
                        onUseVariant={({ org, variant }) => acceptBankVariant(org, variant)}
                        lastApply={lastApply}
                        onUndo={undoLastApply}
                      />
                    </div>
                  )}
                </div>
              </section>

              <section className="flex min-h-0 flex-col rounded-card border border-border bg-surface">
                <p className="border-b border-border px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  Your resume for this job
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 xl:max-h-[calc(100vh-15.5rem)]">
                  {/* `selected.spec` for the name and contact, NOT the `spec` beside them, and the
                      difference is the entire bug this fixes. `spec` is the editable copy, and it
                      is built by `setSpec(stripMetadata(packet.spec))`: stripMetadata drops
                      `_contact` deliberately, so the name is not merely absent from that object,
                      it is removed on the way in. Reading the applicant off it is impossible, which
                      is why the header silently became whatever sorted first.
                      `selected` is the raw packet and still has it. */}
                  {activePacketEvidence ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3 px-2">
                        <p className="text-xs leading-5 text-muted">This is the exact PDF bound to the server audit.</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            resumeEditSaveApplicationRef.current = selected.id;
                            packetEvidenceRef.current = null;
                            setPacketEvidence(null);
                          }}
                        >
                          Edit resume
                        </Button>
                      </div>
                      <ExactPacketPdf
                        auditDigest={activePacketEvidence.response.packet_audit.audit_digest}
                        binding={{
                          sha256: activePacketEvidence.response.pdf.sha256,
                          size_bytes: activePacketEvidence.response.pdf.size_bytes,
                        }}
                        downloadUrl={activePacketEvidence.response.pdf.download_url}
                        onVerified={recordPacketPdfVerification}
                      />
                    </div>
                  ) : (
                    <ResumeEditor
                      spec={spec}
                      name={contactName(selected.spec)}
                      contact={contactLine(selected.spec)}
                      editedTerms={editedTerms}
                      onChange={editResumeSpec}
                      onPatchEntry={patchEntry}
                    />
                  )}
                  {/* Under the resume, inside the same scroll area: the checks describe the page
                      directly above them, so they belong to it rather than to the screen. */}
                  {!activePacketEvidence && <div className="mx-auto mt-5 max-w-[640px] border-t border-border pt-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                      Resume checks
                    </p>
                    <div className="mt-3">
                      {/* The first of the three occurrences was here: an undefined `findings` from
                          /resume/health crashed this whole review screen, taking the JD, the resume,
                          the match score and the gap list with it, for a panel that is four lines of
                          advice in the corner. It is the clearest case in the audit for scoping a
                          boundary to a panel. */}
                      <SectionBoundary band="resume-health" title="Resume checks">
                        <ResumeHealth spec={deferredSpec ?? spec} disabled={qaMode !== false} />
                      </SectionBoundary>
                    </div>
                  </div>}
                </div>
              </section>
            </div>
          </RequirementProvider>

          {review.cover_letter_supported === true ? <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-ink">Cover letter</h2>
                <p className="mt-1 text-sm text-muted">Written from your resume.</p>
              </div>
              <div className="flex gap-2">
                {coverLetterDownloadUrl && <a href={coverLetterDownloadUrl} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">View PDF</a>}
                <Button type="button" onClick={(event) => void generateCoverLetter(undefined, { upgradeTrigger: event.currentTarget })} disabled={coverLetterBusy} variant="secondary" className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{coverLetterBody ? "Regenerate" : "Generate"}</Button>
                <Button type="button" onClick={saveCoverLetter} disabled={coverLetterBusy || (!coverLetterBody.trim() && !selected.spec._cover_letter)} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{coverLetterBusy ? "Checking..." : coverLetterBody.trim() ? "Save cover letter" : "Remove cover letter"}</Button>
              </div>
            </div>
            <textarea aria-label="Tailored cover letter" value={coverLetterBody} onChange={(event) => editPacketCoverLetterBody(event.target.value)} rows={12} placeholder="Generate a cover letter tailored to this job description" className="mt-5 w-full rounded-inner border border-control-border bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none focus:border-brand" />
            {(selected.spec._cover_letter?.warnings?.length ?? 0) > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-warn">
                {selected.spec._cover_letter!.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </Card> : <Card className="p-6">
            {/* Was an eyebrow, a headline and a two-sentence body: three tiers
                of type for one idea the headline already carried. */}
            <h2 className="text-lg font-medium text-ink">{review.cover_letter_supported === false ? "This company does not take a cover letter." : "Litos will check the company's form first."}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {review.cover_letter_supported === false
                ? "This application will continue without one."
                : "If the form has a cover-letter attachment, Litos writes one and attaches it, even when it is marked optional."}
            </p>
          </Card>}

          {/* The Blue/Green legend was REMOVED 2026-07-28. This screen carried
              two legends for one colour code: MatchLegend above the panes and
              this one below them. Not merely similar, identical Tailwind
              classes, with different words for the same two colours.
              MatchLegend wins: it names all three tones rather than two, and
              it says what the colour MEANS rather than what it IS. Two names
              for one colour is worse than no name. Guarded by R-046 in
              tests/review-highlighting.test.mjs. */}
          {/* The send control is gated on portal_supported, not just on saving state.
              Packets on company-owned careers pages used to sit here behind a live "Fill the form"
              button that could only ever fail: the run started, drove a browser for minutes, and
              came back with "This portal is not supported yet". Nine of one account's ten failures
              were that. The tailored resume is still worth having, so this says what Litos cannot
              do and hands the applicant the page instead of hiding the job. */}
          {/* The two sentences are NOT the same kind of sentence, which is why only one of them is
              allowed to disappear on a phone.
              The supported line describes what the button next to it already says: on a 375px
              screen it wraps to two rows and the bar, which is now sticky, was eating ~150px of an
              812px viewport to restate "Fill the form" in a longer form. It comes back at sm.
              The unsupported line is the opposite: it is the only thing that explains why the
              button says "Open the company page" instead, and dropping it would leave a student
              with a control that looks like a mistake. It is shown at every width. */}
          {/* justify-end below sm is not a style preference. `hidden` is display:none, so the caption
              is not a flex item there at all, and justify-between with ONE item resolves to
              flex-start: the primary action slid to the left edge on a phone while the same bar on
              the questions screen sat right. Same bar, three alignments, depending on branch. */}
          <TerminalActionBar className="justify-end sm:justify-between lg:!sticky lg:!bottom-[var(--dashboard-action-sticky-offset,2.5rem)] lg:!shadow-raised">
            {review.portal_supported === false
              ? <p className="text-sm text-ink">Litos cannot fill in this company’s page. Your resume is ready, so apply on their site.</p>
              : <p className="hidden text-sm text-ink sm:block">Litos fills the form with your saved answers and this resume.</p>}
            <div className="flex gap-2">
              {(activePacketEvidence?.response.pdf.download_url ?? selected.download_url) && (activePacketEvidence?.response.pdf.download_url ?? selected.download_url) !== "#" && <a href={activePacketEvidence?.response.pdf.download_url ?? selected.download_url} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View exact PDF</a>}
              {review.portal_supported === false
                ? review.portal_url && <a href={review.portal_url} target="_blank" rel="noreferrer" className="rounded-full bg-action px-5 py-2.5 text-sm font-medium text-action-ink hover:bg-brand-ink">Open the company page</a>
                    : <Button onClick={reviewPrimaryAction} disabled={reviewPrimaryDisabled} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                  {reviewPrimaryBusy
                    ? <PendingLabel state="solving" onColor>Making...</PendingLabel>
                    : reviewPrimaryLabel}
                </Button>}
            </div>
          </TerminalActionBar>
          {review.portal_supported !== false && packetEvidenceBlocker && (
            <p role={matchResult && !matchResult.scorable ? "alert" : "status"} className={`text-sm leading-6 ${matchResult && !matchResult.scorable ? "text-danger" : "text-muted"}`}>
              {packetEvidenceBlocker}
            </p>
          )}
        </>
      )}
      </MotionPanel>

      {/* Rendered last and positioned fixed, so it lies over whichever screen the page is already
          on and closing it returns the user to exactly that, untouched.

          Resolved from `packets` every render rather than from a captured object, so what the
          viewer shows is what the page knows. If the packet leaves the 50-row window, this falls
          to null and the viewer closes rather than showing a record nothing can corroborate. */}
      {revisitingPacket?.spec._review && (
        <ApplicationPacket
          packet={revisitingPacket}
          review={revisitingPacket.spec._review}
          onClose={closeRevisit}
        />
      )}

      {/* OUTSIDE the screen ternary above, and that is not a tidiness preference.
          The 2.5s poll calls moveToScreen on every tick, so a modal rendered inside a branch of that
          ternary unmounts the moment a run's status moves, mid-upload, with the file half sent and
          no message. Out here it lies over whichever screen the page is on and survives every
          transition the poll can cause.

          Resolved from `submission` every render rather than from an object captured when the row
          was pressed, for the reason the packet viewer above is resolved from `packets`: the poll
          replaces this state wholesale, so a captured ask goes stale inside one tick.

          Keyed on the kind AND a token. Without the token, pressing the same row a second time
          produces an identical state value, React bails out of the update, and a modal left on its
          attached state stays there: the second press looks dead. */}
      {documentAsk && selectedSubmission && selected && (
        <TranscriptModal
          key={`${documentAsk.kind}-${documentAsk.token}`}
          applicationId={selectedSubmission.application_id}
          kind={documentAsk.kind}
          /* Folded to one ask per kind by the same function the control row uses, so the modal cannot
             open on a different label from the button that opened it. A raw `find` takes the first
             ask for the kind and drops the official flag off any later one, which on a form carrying
             both "Unofficial transcript (PDF)" and "Official transcript" is the door to "I have
             ordered it" quietly missing. */
          ask={documentAsksByKind(selectedSubmission.review.required_documents).find((entry) => entry.kind === documentAsk.kind) ?? null}
          attachment={selectedSubmission.documents?.[documentAsk.kind] ?? null}
          company={selected.job_context.company || "This company"}
          role={selected.job_context.role || ""}
          onAttachmentChange={(kind, attachment) => applyDocumentToSubmission(selectedSubmission.application_id, kind, attachment)}
          onReviewApplication={() => {
            setDocumentAsk(null);
            moveToScreen("portal");
          }}
          onClose={closeDocumentAsk}
        />
      )}
    </div>
  );
}

function CanonicalApplicationDetail({
  application,
  checkingSendPath,
  readyToSend,
  requiredQuestionsRemaining,
  onContinueToSend,
  fillBusy,
  tailorBusy,
  coverLetterBusy,
  coverLetterLoading,
  hasTailoredResume,
  packetReady,
  coverLetter,
  coverLetterBody,
  coverLetterJd,
  coverLetterEditorOpen,
  coverLetterDownloadUrl,
  error,
  onFill,
  onTailor,
  onOpenCoverLetterEditor,
  onGenerateCoverLetter,
  onCoverLetterBodyChange,
  onCoverLetterJdChange,
  onSaveCoverLetter,
  onUploadCoverLetter,
  onDeleteCoverLetter,
  onOpenPacket,
}: {
  application: CanonicalApplication;
  /** True only for the narrow window where this row's real send eligibility is still unknown: it
      names a linked legacy packet the page's merge did not attach, and a fetch is in flight to find
      out whether that packet is genuinely portal_supported. See canonicalEnvelopeLegacyHydrationId.
      A row with nothing to hydrate - a genuine free-fill row, or one already correctly linked -
      is never in this state, so the ordinary copy below is what most rows still show. */
  checkingSendPath: boolean;
  /** True once hydration (or the page's own merge) has confirmed a linked packet that is genuinely
      sendable through Litos's managed screens. This never navigates anything by itself - the effect
      that discovers it only folds the packet into state - it just tells this screen to offer
      `onContinueToSend` instead of the extension-only copy. The student's own click is what reaches
      selectPacket, exactly like every Tracker row click already does. */
  readyToSend: boolean;
  /** Required employer questions still standing between this packet and a send. See
   *  unansweredRequiredQuestionCount: `readyToSend` alone was being read as "nothing is waiting on
   *  you", which is a different and, on 2026-08-29, false claim. */
  requiredQuestionsRemaining: number;
  /** Explicit, user-pressed handoff to the managed review and send screen. Never called except from
      a click in this component. */
  onContinueToSend: () => void;
  fillBusy: boolean;
  tailorBusy: boolean;
  coverLetterBusy: boolean;
  coverLetterLoading: boolean;
  hasTailoredResume: boolean;
  /** Whether the packet this card's "Open tailored packet" control would open is actually loaded.
   *  See the control itself for the 2026-08-29 measurement: it was rendered live off a DIFFERENT
   *  value from the one its handler needed, so for the ~10s the page took to fetch the linked
   *  packet the button was fully styled, focusable, and did nothing at all on click. */
  packetReady: boolean;
  coverLetter: CanonicalCoverLetterResponse | null;
  coverLetterBody: string;
  coverLetterJd: string;
  coverLetterEditorOpen: boolean;
  coverLetterDownloadUrl: string | null;
  error: string | null;
  onFill: () => void;
  onTailor: (upgradeTrigger: HTMLButtonElement) => void;
  onOpenCoverLetterEditor: () => void;
  onGenerateCoverLetter: (upgradeTrigger: HTMLButtonElement) => void;
  onCoverLetterBodyChange: (body: string) => void;
  onCoverLetterJdChange: (body: string) => void;
  onSaveCoverLetter: () => void;
  onUploadCoverLetter: (file: File) => void;
  onDeleteCoverLetter: () => void;
  onOpenPacket: () => void;
}) {
  const submitted = application.submission_state === "submitted";
  const updatedAt = application.updated_at ?? application.created_at;
  /* THE CARD'S ONE STATE, decided once and read by the chip, the copy and the button alike.
     Sendable means a packet exists on a portal Litos can submit through AND nothing required is
     still waiting on the applicant. Splitting those two apart is how this card came to show a
     "Needs you" chip over the sentence "Litos can send this application for you" over a button
     called "Continue to send" that landed on unanswered required questions. */
  const questionsRemaining = Math.max(0, requiredQuestionsRemaining);
  const answersOutstanding = readyToSend && questionsRemaining > 0;
  const sendable = readyToSend && questionsRemaining === 0;
  const questionsPhrase = questionsRemaining === 1 ? "1 required question" : `${questionsRemaining} required questions`;
  return (
    <Card className="overflow-hidden">
      {/* THE THREE-COLOUR BAR CAME OFF THIS CARD, 2026-08-29. It is the pillar motif (teal / brand /
          coral) and it is decorative everywhere it appears, but a segmented horizontal bar pinned to
          the top of the one card whose entire job is reporting how far an application has got reads
          as a progress meter, and it had no labels, no legend and no relationship to state. It
          stays on ApplicationFillReceipt below, which reports a completed handoff rather than a
          position in a pipeline, so nothing there invites the same reading. */}
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-label uppercase tracking-[0.08em] text-teal-ink">Free application fill</p>
            <h2 className="mt-2 text-heading font-[450] text-ink">{application.role}</h2>
            <p className="mt-1 text-small text-muted">{application.company}{updatedAt ? ` · Updated ${formatRelativeDate(updatedAt)}` : ""}</p>
          </div>
          {/* Three states, not two. "Needs you" over "Litos can send this for you" was the
              contradiction; a packet that genuinely needs nothing now says so. */}
          <Chip
            label={submitted ? "Sent" : sendable ? "Ready" : "Needs you"}
            kind={submitted ? "sent" : sendable ? "ready" : "warn"}
          />
        </div>
        <div className="mt-5 rounded-inner border border-border bg-surface-alt p-4" role={checkingSendPath ? "status" : undefined}>
          <p className="text-small font-medium text-ink">
            {submitted
              ? "This application is recorded as sent."
              : checkingSendPath
                ? "Checking whether Litos can send this one for you..."
                : answersOutstanding
                  ? `${questionsPhrase} before Litos can send this.`
                  : sendable
                    ? "Litos can send this application for you."
                    : "Continue on the employer's form."}
          </p>
          <p className="mt-1 text-small leading-6 text-muted">
            {submitted
              ? "Tracker keeps this canonical record even when no tailored resume packet was generated."
              : checkingSendPath
                /* This row names a tailored packet the Tracker has not loaded yet. Once it loads,
                   if it turns out to be on a portal Litos can submit through, the button below
                   changes to "Continue to send" - the student still presses it themselves; nothing
                   here jumps them to another screen on its own. */
                ? "Litos is loading this application's tailored packet to see whether it can send it for you directly."
                : answersOutstanding
                  ? "The tailored packet is ready and the portal is one Litos can submit through. The employer still asks for answers only you can give, so Litos stops here rather than sending an incomplete form. Answering them is the last step before it can go."
                  : sendable
                    ? "This application's tailored packet is ready on a portal Litos can submit through. Continue to Litos's managed review and send screen to finish it - no extension, no separate tab."
                    : "Litos will verify the extension account, bind this exact application, and open the employer page. Click Fill in the extension card, review every field, then press the employer's submit control yourself."}
          </p>
        </div>
        <div className="mt-4 rounded-inner border border-brand/30 bg-brand-soft/35 p-4">
          <p className="font-mono text-label uppercase tracking-[0.08em] text-brand-ink">Application packet</p>
          <p className="mt-2 text-small leading-6 text-muted">
            {hasTailoredResume
              ? "The tailored resume is attached to this same Tracker application. Add a cover letter here or open the full packet to review it."
              : "Write or upload a cover letter now, or use Litos+ to create one from your saved facts. A tailored resume is optional."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" disabled={tailorBusy || fillBusy || coverLetterBusy} onClick={(event) => onTailor(event.currentTarget)}>
              {tailorBusy ? "Tailoring..." : "Tailor resume"}
            </Button>
            <Button type="button" variant="secondary" disabled={tailorBusy || coverLetterBusy || coverLetterLoading} onClick={onOpenCoverLetterEditor}>
              {coverLetterLoading ? "Loading..." : "Write cover letter"}
            </Button>
            {/* A CONTROL THAT CANNOT ACT MUST NOT LOOK LIKE ONE THAT CAN. This rendered on
                `hasTailoredResume` while its handler needed `canonicalEnvelopePacket`, and those are
                not the same value: for the roughly ten seconds the page spent fetching the linked
                packet, the button was styled, focusable, labelled and inert. Measured 2026-08-29,
                and it is the third time this exact signature has been reported this month.
                Now it says what it is doing and refuses the press until the press would work. The
                modal it opens has its own loading state for the resume itself. */}
            {hasTailoredResume && (checkingSendPath || packetReady) && (
              <Button
                type="button"
                variant="quiet"
                disabled={!packetReady}
                aria-busy={!packetReady}
                onClick={onOpenPacket}
              >
                {packetReady ? "Open tailored packet" : "Loading packet..."}
              </Button>
            )}
            {coverLetterDownloadUrl && <ButtonLink href={coverLetterDownloadUrl} variant="quiet">Download cover letter</ButtonLink>}
          </div>
          {coverLetterEditorOpen && (
            <div className="mt-5 border-t border-border pt-5">
              <label htmlFor="canonical-cover-letter" className="text-small font-medium text-ink">Cover letter</label>
              <textarea
                id="canonical-cover-letter"
                rows={12}
                value={coverLetterBody}
                onChange={(event) => onCoverLetterBodyChange(event.target.value)}
                placeholder="Write your cover letter here. Saving manual text is always free."
                className="rq-field mt-2 w-full rounded-inner px-4 py-3 text-small leading-7 text-ink"
              />
              {!hasTailoredResume && (
                <label className="mt-4 block text-small font-medium text-ink">
                  Job description for Litos+
                  <textarea
                    rows={7}
                    value={coverLetterJd}
                    onChange={(event) => onCoverLetterJdChange(event.target.value)}
                    placeholder="Paste the job description only if you want Litos+ to draft from it. Manual writing and upload do not need this."
                    className="rq-field mt-2 w-full rounded-inner px-4 py-3 text-small leading-7 text-ink"
                  />
                </label>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" disabled={coverLetterBusy || coverLetterLoading || !coverLetterBody.trim()} onClick={onSaveCoverLetter}>
                  {coverLetterBusy ? "Saving..." : "Save cover letter"}
                </Button>
                <Button type="button" variant="secondary" disabled={coverLetterBusy || coverLetterLoading || (!hasTailoredResume && !coverLetterJd.trim())} onClick={(event) => onGenerateCoverLetter(event.currentTarget)}>
                  Draft with Litos+
                </Button>
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-control-border px-5 text-small font-medium text-ink hover:border-ink">
                  Upload PDF or text
                  <input
                    type="file"
                    accept={APPLICATION_DOCUMENT_ACCEPT_ATTRIBUTE["pdf-or-txt"]}
                    className="sr-only"
                    disabled={coverLetterBusy || coverLetterLoading}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) onUploadCoverLetter(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {coverLetter && (
                  <Button type="button" variant="quiet" disabled={coverLetterBusy || coverLetterLoading} onClick={onDeleteCoverLetter}>
                    Remove cover letter
                  </Button>
                )}
              </div>
              <p className="mt-3 text-label text-muted">Manual writing and uploads do not use a Litos+ generation. You choose what stays attached to this application.</p>
            </div>
          )}
        </div>
        {error && <div className="mt-4"><ErrorNote message={error} /></div>}
        <div className="mt-5 flex flex-wrap gap-3">
          {/* readyToSend gets its OWN button rather than reusing onFill, and the extension button is
              held back while it is true: pressing "Open and fill application" starts the extension
              handoff, and a row Litos can send directly should be routed to the managed screens
              instead, not offered a second, worse path to the same application. checkingSendPath
              holds both back for the same reason one half-second earlier - the eligibility check
              itself is still in flight, so neither action is safe to offer yet. */}
          {/* THE BUTTON NAMES WHERE IT GOES. Both arms reach the same managed screens through the
              same handler - the destination was never wrong, the promise was. "Continue to send" is
              reserved for a packet that is actually sendable; when the employer is still asking for
              something, the button says how many and lands exactly there. */}
          {!submitted && !checkingSendPath && readyToSend && (
            <Button type="button" onClick={onContinueToSend}>
              {answersOutstanding
                ? questionsRemaining === 1 ? "Answer 1 question" : `Answer ${questionsRemaining} questions`
                : "Continue to send"}
            </Button>
          )}
          {!submitted && !checkingSendPath && !readyToSend && application.portal_url && (
            <Button type="button" disabled={fillBusy || tailorBusy} onClick={onFill}>
              {fillBusy ? "Checking extension..." : "Open and fill application"}
            </Button>
          )}
          {!submitted && !checkingSendPath && !readyToSend && !application.portal_url && <p className="text-small text-muted">This record has no employer form URL. Add the job again with its exact HTTPS application link.</p>}
          <ButtonLink href="/dashboard/settings#application-details" variant="quiet">Review saved details</ButtonLink>
        </div>
      </div>
    </Card>
  );
}

function ApplicationFillReceipt({ receipt, onClose }: { receipt: FillReceipt; onClose: () => void }) {
  return (
    <Card className="overflow-hidden border-teal/45" role="status">
      <div className="grid h-1 grid-cols-3" aria-hidden="true"><span className="bg-teal" /><span className="bg-brand" /><span className="bg-coral" /></div>
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-label uppercase tracking-[0.08em] text-teal-ink">Extension handoff</p>
            <h2 className="mt-2 text-heading font-[450] text-ink">The employer form is ready to fill.</h2>
            <p className="mt-1 text-small text-muted">{receipt.role} at {receipt.company}</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 px-3 text-small text-muted hover:text-ink">Dismiss</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ReceiptFact label="Extension" value="Handoff armed" tone="teal" />
          <ReceiptFact label="Fill action" value="Click Fill in the Litos card" tone="brand" />
          <ReceiptFact label="Final control" value="You review and submit" tone="coral" />
        </div>
        <p className="mt-5 text-small text-muted">Chrome opened the exact employer form. Click Fill in the Litos extension card there. Tracker updates only after the extension reports what it actually filled. Litos stops on unknown, sensitive, or human-verification fields, and nothing is submitted from this handoff.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/dashboard/settings#application-details" variant="quiet">Review saved details</ButtonLink>
        </div>
      </div>
    </Card>
  );
}

function ReceiptFact({ label, value, tone }: { label: string; value: string; tone: "teal" | "brand" | "coral" }) {
  const color = tone === "teal" ? "text-teal-ink" : tone === "coral" ? "text-coral-ink" : "text-brand-ink";
  return <div className="rounded-inner border border-border p-4"><p className={`font-mono text-label uppercase tracking-[0.08em] ${color}`}>{label}</p><p className="mt-2 text-small font-medium text-ink">{value}</p></div>;
}

function packetTimestamp(packet: GeneratedResume): string {
  return packet.spec._review?.updated_at ?? packet.created_at ?? "";
}

function NewApplicationPanel({
  value,
  onChange,
  onFill,
  onTailor,
  creating,
  onFetchJobDescription,
  extractingJd,
  refusal,
}: {
  value: NewApplicationDraft;
  onChange: (value: NewApplicationDraft) => void;
  onFill: () => void;
  onTailor: (upgradeTrigger: HTMLButtonElement) => void;
  creating: "fill" | "tailor" | null;
  onFetchJobDescription: () => void;
  extractingJd: boolean;
  /** Why the last press of a composer button did nothing, which boxes it was about, and which of
      the two buttons is being answered. */
  refusal: { message: string; fields: ApplicationDraftField[]; at: ComposerSlot; needsExtension: boolean } | null;
}) {
  const patch = (next: Partial<NewApplicationDraft>) => onChange({ ...value, ...next });
  const invalid = (field: ApplicationDraftField) => refusal?.fields.includes(field) ?? false;
  const jobDescriptionInvalid = invalid("jobDescription");
  const [jobDescriptionOpen, setJobDescriptionOpen] = useState(() => Boolean(value.jobDescription.trim()) || jobDescriptionInvalid);
  const fillReady = Boolean(value.company.trim())
    && Boolean(value.role.trim())
    && isHttpsJobUrl(value.portalUrl.trim());
  const managedPrepare = Boolean(value.jobId);
  const tailorReady = fillReady && Boolean(value.jobDescription.trim());
  const readinessId = "new-application-readiness";

  return (
    <Card className="p-6">
      <div className="max-w-2xl">
        <p className="text-xs text-muted">New application</p>
        <h2 id="new-application-heading" tabIndex={-1} className="mt-2 text-xl font-medium text-ink outline-none">Fill an application.</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Factual filling is unlimited. Add the job description only when you want a tailored resume too.</p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ApplicationField label="Company" value={value.company} onChange={(company) => patch({ company })} placeholder="Google" invalid={invalid("company")} />
        <ApplicationField label="Role" value={value.role} onChange={(role) => patch({ role })} placeholder="Software Engineer" invalid={invalid("role")} />
      </div>
      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <ApplicationField label="Job URL" value={value.portalUrl} onChange={(portalUrl) => patch({ portalUrl })} placeholder="https://company.com/jobs/..." type="url" invalid={invalid("portalUrl")} />
        </div>
        <Button
          type="button"
          onClick={onFetchJobDescription}
          disabled={extractingJd || !value.portalUrl.trim()} variant="secondary" className="mb-0.5 whitespace-nowrap">
          {extractingJd ? <PendingLabel state="composing">Reading...</PendingLabel> : "Read job"}
        </Button>
      </div>
      {/* Read job's own slot. Measured: the two composer buttons are ~440px apart, so the generate
          row is not "beside" this one. With the message down there it sat at y = 979 on a 375x812
          viewport while this button was at y = 554. */}
      <ComposerRefusalNote refusal={refusal} at="url" />
      <div className="mt-4 rounded-inner border border-border bg-surface-alt px-4 py-3">
        <button
          type="button"
          aria-expanded={jobDescriptionOpen}
          aria-controls="new-application-tailoring-details"
          onClick={() => setJobDescriptionOpen((open) => !open)}
          className="flex min-h-11 w-full items-center justify-between gap-4 text-left text-small font-medium text-ink"
        >
          <span>Add a job description to tailor first</span>
          <span aria-hidden="true" className="font-mono text-label text-muted">{jobDescriptionOpen ? "Hide" : "Add"}</span>
        </button>
        {jobDescriptionOpen && (
          <div id="new-application-tailoring-details" className="pt-2">
            <label className="block text-xs font-medium text-muted" htmlFor="new-application-jd">Job description</label>
            <textarea id="new-application-jd" value={value.jobDescription} onChange={(event) => patch({ jobDescription: event.target.value })} rows={6} placeholder="Paste the complete job description." aria-invalid={jobDescriptionInvalid || undefined} className={`mt-1.5 min-h-36 w-full rounded-inner border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand ${jobDescriptionInvalid ? "border-danger" : "border-control-border"}`} />
          </div>
        )}
      </div>
      {/* Beside the button that raised it, not in the page banner far above it. The button and this
          line are in the same flex row, so a student who can reach the button can read the refusal
          without scrolling: no scrollIntoView, no requestAnimationFrame, nothing that stops running
          in a background tab. role="alert" is here and nowhere else for this message, so a screen
          reader still hears it exactly once. */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <ComposerRefusalNote refusal={refusal} at="action" />
        <p id={readinessId} className="mr-auto max-w-xl text-small leading-6 text-muted">
          {managedPrepare
            ? "Prepare with your main resume inside Litos. You will review the exact packet here before anything can be sent."
            : "Company, role, and a complete HTTPS job URL unlock the extension fallback. A job description also unlocks tailoring."}
        </p>
        <Button type="button" variant="secondary" aria-describedby={readinessId} onClick={(event) => onTailor(event.currentTarget)} disabled={creating !== null || !tailorReady} className="border-brand text-brand-ink">
          {creating === "tailor" ? <PendingLabel state="composing">Tailoring</PendingLabel> : "Tailor resume first"}
        </Button>
        <Button type="button" aria-describedby={readinessId} onClick={onFill} disabled={creating !== null || !fillReady}>
          {creating === "fill"
            ? <PendingLabel state="composing" onColor>{managedPrepare ? "Preparing in Litos" : "Preparing form"}</PendingLabel>
            : managedPrepare ? "Prepare in Litos" : "Open and fill employer form"}
        </Button>
      </div>
    </Card>
  );
}

/** Which composer button a refusal is answering. The composer has exactly two, far enough apart
    that a message beside one is off screen from the other. */
type ComposerSlot = "url" | "action";

/* The refusal is written ONCE and mounted in whichever slot matches, rather than duplicated into
   both places behind two conditions. Two copies would be two live regions the day someone changes
   one condition and not the other, and a screen reader would read the same refusal twice. `at`
   holds a single value, so at most one of these ever renders anything. */
function ComposerRefusalNote({
  refusal,
  at,
}: {
  refusal: { message: string; fields: ApplicationDraftField[]; at: ComposerSlot; needsExtension: boolean } | null;
  at: ComposerSlot;
}) {
  if (!refusal || refusal.at !== at) return null;
  /* Gated on the refusal existing, never on it naming a field: a server failure names none, and
     that is exactly the case ISSUE-043 was about. */
  /* The link is a SIBLING of the alert, never a child of it, and the flag it reads was computed
     where the refusal was built. Both of those are deliberate: this paragraph's exact shape is
     pinned by two regression tests (composer-refusal-placement, composer-error-placement) that also
     cap this file at exactly one read of the refusal's message text - invariants bought with a real
     incident where a mirrored copy announced the same refusal twice. Reading that text again here
     to decide the link would have broken the cap while changing nothing a user hears, so the
     decision rides on the refusal object instead. */
  return (
    <>
      <p className={at === "action" ? "mr-auto text-sm text-danger" : "mt-1.5 text-sm text-danger"} role="alert">{refusal.message}</p>
      {refusal.needsExtension && <ExtensionStoreLink />}
    </>
  );
}


function ApplicationField({ label, value, onChange, placeholder, type = "text", invalid = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; invalid?: boolean }) {
  const id = `new-application-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div>
      <label className="block text-xs font-medium text-muted" htmlFor={id}>{label}</label>
      {/* aria-invalid rather than a second message per field: the one alert beside the button says
          what is wrong, and this says which boxes it meant, in both channels at once. Omitted (not
          set to "false") when valid, so nothing is announced about a field that is fine. */}
      <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-invalid={invalid || undefined} className={`mt-1.5 w-full rounded-full border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand ${invalid ? "border-danger" : "border-control-border"}`} />
    </div>
  );
}

/* THE HEADER IS THE APPLICANT, NOT THE SCHOOL, and `name` is a prop for a reason.
 *
 * This opened with `spec.school` in the name slot, centred and heaviest on the page, with the
 * degree beneath it: the student read their university where their own name belongs, on the screen
 * they check before sending. It is the third surface to ship that exact bug, and the cause is the
 * same every time. `ResumeSpec` has no name field. The applicant lives on `_contact.full_name`, and
 * `stripMetadata` drops `_contact` on purpose, so the editable spec this component receives cannot
 * carry a name even in principle. A component typed `spec: ResumeSpec` is therefore STRUCTURALLY
 * unable to render a header, and whatever field happens to sort first floats into the empty slot.
 *
 * So the name and the contact line arrive as their own props, off the raw packet, the same way
 * ResumePaper takes them. That is the whole fix: a renderer that needs the applicant has to be
 * given the applicant. tests/packet-resume-header.test.mjs now holds every resume surface to it.
 *
 * `name` is NOT editable here and that is deliberate. `onChange` carries a ResumeSpec, which has
 * nowhere to put a name; a field that looked editable and silently discarded the edit would be
 * worse than a printed line. The name is changed where it is stored, on the profile. */
function ResumeEditor({ spec, name, contact, editedTerms, onChange, onPatchEntry }: { spec: ResumeSpec; name: string; contact: string; editedTerms: ReadonlySet<string>; onChange: (spec: ResumeSpec) => void; onPatchEntry: (index: number, patch: Partial<ResumeSpec["experience"][number]>) => void }) {
  return (
    <div className="mx-auto max-w-[640px] rounded-inner border border-border bg-white px-5 py-5 font-serif text-[11.5px] leading-[1.35] text-black shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_-12px_rgba(0,0,0,0.18)] sm:px-8">
      {/* Name, rule, contact line: the order drawHeader() draws them in, and the order the packet
          pane shows. On a packet generated before `_contact` existed there is no name, and then
          education simply leads under its own heading rather than a blank line appearing. */}
      {name && <p className="text-center text-[15px] font-semibold leading-tight">{name}</p>}
      {contact && (
        <>
          <div className="mt-1 h-px w-full bg-neutral-300" />
          <p className="mt-1 text-center text-[9.5px] leading-tight text-neutral-600">{contact}</p>
        </>
      )}

      {/* EDUCATION as a real section, because it is one. Without the heading the school sat at the
          top of the page looking like a header, which is exactly how it came to occupy the name
          slot: nothing marked it as belonging to a section. drawEducation() emits this heading. */}
      <p className="mb-1.5 mt-4 border-b border-ink pb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]">Education</p>
      {/* EDUCATION IS HIGHLIGHTED, because the scorer already credits it and this pane could not
          show where. Measured over the 85 production packets on 2026-08-09: 111 of 313 blue marks
          (35.5%) had no blue anywhere in the resume pane, and 83 of those came from fields the pane
          rendered through EditableLine, which has no highlighting, or did not render at all.
          `degree` alone accounted for 65 - the term `computer science`, credited from "Bachelor of
          Science in Computer Science" and marked nowhere.

          Blue means "asked for by this job, AND on your resume". An unanchored blue is the page
          contradicting its own legend: the student is told the requirement is met and given nothing
          to point at. The credit is right, so the fix is the anchor, not the credit. */}
      <EditableHighlight value={spec.school} terms={editedTerms} onChange={(school) => onChange({ ...spec, school })} className="font-semibold" />
      {/* STILL two fields, never one string round-tripped through a " · " separator. The separator
          form was lossy in both directions: a degree legitimately containing " · " split wrong, and
          any third separator silently discarded the tail. R-047 was a mangled degree that could not
          be corrected, so a control that can mangle it again works against the fix.

          The drawn dot between them is gone with the centring. It existed to join two fields into
          one centred sub-heading under the school when the school was acting as the page header;
          now that education is a section, drawEducation()'s own shape applies: degree on the left,
          date pushed right. That is also the shape every experience entry below already uses, so
          the eye reads dates from one column down the whole page instead of two.

          Dropping the dot took the items-center/lg:items-baseline note with it. That was about the
          dot alone: it was the one thing in the row that was not a field, so it needed aligning
          against two 44px touch boxes. With no drawn glyph left, the fields align as fields. */}
      {/* Width comes from these wrappers, never from the textarea itself: an auto-width textarea
          falls back to its ~20-column default, which squeezed a long joint degree into a narrow
          stacked column. The degree takes the remaining space and the date gets just what it
          needs. */}
      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-muted">
        <span className="min-w-0 flex-1">
          <EditableHighlight value={spec.degree} terms={editedTerms} onChange={(degree) => onChange({ ...spec, degree })} className="italic" />
        </span>
        <span className="w-[5.5rem] shrink-0">
          <EditableLine value={spec.grad_date} onChange={(grad_date) => onChange({ ...spec, grad_date })} className="text-right" />
        </span>
      </div>
      {/* COURSEWORK, which the resume PRINTS and this pane did not render at all. drawEducation()
          in the backend's engine/resumeRender.ts writes "Relevant coursework: ..." between the
          degree and the experience, and resumeSpecText scores it, so 13 more blue marks were
          credited from a line the student could not see on the screen that exists for checking the
          document before sending it. Rendered under the same label the PDF uses, so the two
          documents read the same way. */}
      {spec.coursework ? (
        <p className="mt-0.5 text-xs text-muted">
          <span className="italic">Relevant coursework: </span>
          <EditableHighlight value={spec.coursework} terms={editedTerms} onChange={(coursework) => onChange({ ...spec, coursework })} />
        </p>
      ) : null}

      {/* The section heading used to render inside this map, so four jobs printed "EXPERIENCE" four
          times down the page. A resume has one Experience section containing four roles. Print the
          heading only where the section actually changes. */}
      {spec.experience.map((entry, index) => {
        const heading = sectionHeading(entry.type);
        const startsSection = startsNewSection(spec.experience.map((item) => item.type), index);
        return (
          <section key={`${entry.org}-${index}`} className={startsSection ? "mt-4" : "mt-3"}>
            {startsSection && (
              <p className="mb-1.5 border-b border-ink pb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]">{heading}</p>
            )}
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 flex-1">
                {/* Same reason as the education line above: the scorer reads `org` and `title`, so
                    the pane has to be able to mark them. Five Rings' packet 0c6e832a is the case -
                    the requirement `software developers` was one of only two the scorer matched,
                    worth about half the packet's score, and it is on the resume as a job TITLE. */}
                <EditableHighlight value={entry.org} terms={editedTerms} onChange={(org) => onPatchEntry(index, { org })} className="font-semibold" />
              </span>
              {/* Wide enough for the longest real range ("September 2025 - Present") so the date
                  does not wrap, and fixed so it cannot squeeze the org name beside it. */}
              <span className="w-[9.8rem] shrink-0">
                <EditableLine value={entry.date_range} onChange={(date_range) => onPatchEntry(index, { date_range })} className="text-right text-xs text-muted" />
              </span>
            </div>
            <EditableHighlight value={entry.title} terms={editedTerms} onChange={(title) => onPatchEntry(index, { title })} className="text-xs italic text-muted" />
            <ul className="mt-1 space-y-0.5">
              {entry.bullets.map((bullet, bulletIndex) => (
                <li key={bulletIndex} className="grid grid-cols-[12px_1fr] gap-1.5"><span>•</span><EditableHighlight value={bullet} terms={editedTerms} onChange={(value) => onPatchEntry(index, { bullets: entry.bullets.map((item, i) => (i === bulletIndex ? value : item)) })} /></li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="mt-4">
        <p className="mb-1.5 border-b border-ink pb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]">Skills</p>
        <EditableHighlight value={spec.skills.join(" • ")} terms={editedTerms} onChange={(value) => onChange({ ...spec, skills: value.split("•").map((item) => item.trim()).filter(Boolean) })} />
      </section>
    </div>
  );
}

// This was a single-line <input>, which cannot wrap, so any value wider than the column was simply
// cut off: the education headline stopped at "Marshall School of B" and date ranges at
// "September 2025 - Presen". The user could not read their own resume, let alone check it. A
// one-row textarea that grows to its content wraps instead of truncating and keeps the field
// editable in place. It is always full-width: sizing belongs to the caller's wrapper, because an
// auto-width textarea silently falls back to its ~20-column default and squeezes long values into
// a narrow stacked column.
function EditableLine({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const composing = useRef(false);

  const resize = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    /* The touch floor below lg is suspended for the duration of the measurement. scrollHeight on a
       textarea reports the padding box when the box is taller than its text, so with min-h-11 in
       force `height: auto` still resolves to 44px and the number written back is 44px rather than
       the height of the words. That bakes a breakpoint-specific figure into an inline height, and
       an inline height outranks min-height, so the field then stays 44px on the desktop layout with
       no way back down short of a re-measure. Measuring with the floor off keeps this value the
       content height at every width, which is what makes crossing lg need no re-measure at all. */
    node.style.minHeight = "0";
    node.style.height = `${node.scrollHeight}px`;
    node.style.minHeight = "";
  }, []);

  // useLayoutEffect, not useEffect: measuring after paint made every field flash at one-row height
  // before growing on first render.
  useLayoutEffect(resize, [resize, value]);

  // Re-measure on anything that changes the wrap point rather than only on value change. The
  // element carries overflow-hidden and a JS-set pixel height, so a stale height silently CLIPS
  // with no scrollbar and no ellipsis, which is worse than the truncation this replaced. Crossing
  // the xl:grid-cols-2 breakpoint, zooming, and a late-loading webfont all move the wrap point
  // without touching the value. The school headline is the sharpest case: it is text-sm sm:text-lg,
  // so its CONTENT height changes at 640px (20px to 28px) even though the stored inline height is
  // otherwise breakpoint-independent. Nothing but this observer catches that.
  //
  // This observer was reported dead twice, on 2026-08-03, by agents who forced the parent width and
  // saw zero re-measure. It is not dead, and nothing here needs changing. Both reports were taken
  // in a tab where document.visibilityState was "hidden", which suspends the whole rendering
  // lifecycle: in that state requestAnimationFrame never runs and ResizeObserver delivers nothing,
  // not even the initial observation a freshly constructed observer is owed. A control observer
  // built in the same tab, on the same two elements, fired zero times, which is the tell that the
  // harness and not the code was the subject of the measurement.
  //
  // Measured again the same day in headless Chromium with rendering actually running, against this
  // exact code: forcing the parent 446px -> 120px -> 446px moved the school headline 28 -> 168 ->
  // 28px, 375 -> 1280 finished at 28px (equal to a fresh load at 1280), and 1280 -> 375 finished at
  // a 20px content height inside the 44px touch floor, with scrollHeight == clientHeight, i.e. no
  // clipping in either direction. If this is ever re-reported, check document.visibilityState in
  // the measuring tab before touching this effect.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => resize());
    observer.observe(node);
    if (node.parentElement) observer.observe(node.parentElement);
    void document.fonts?.ready.then(resize).catch(() => {});
    return () => observer.disconnect();
  }, [resize]);

  // These fields were structurally single-line under <input>: an org, a title, a date range and the
  // school headline cannot contain a newline, and the element guaranteed it. A textarea removes
  // that guarantee, and the value flows straight into the resume spec, the rendered PDF and the
  // portal autofill payload, where a newline in a date or org field is a broken line at best and a
  // mis-parsed ATS field at worst. Wrapping is a presentation need; multi-line content is not.
  const commit = (raw: string) => onChange(raw.replace(/\s*[\r\n]+\s*/g, " "));

  return (
    <textarea
      ref={ref}
      aria-label="Editable resume text"
      rows={1}
      value={value}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
      }}
      // Intermediate IME states (Japanese, Chinese, Korean, dead-key accents) must reach the DOM
      // untouched: rewriting the value mid-composition drops pre-edit characters and jumps the
      // caret. Commit the cleaned value once the composition ends.
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        commit(event.currentTarget.value);
      }}
      onChange={(event) => {
        if (composing.current) onChange(event.target.value);
        else commit(event.target.value);
      }}
      // Touch sizing below lg only. These fields render at 12-13px with a 16-20px line box, so on a
      // phone the tap target for "Product Engineer" was 16px tall: under the 44px comfort figure,
      // and under the 24px WCAG 2.5.8 AA floor as well, on the primary editing affordance of the
      // product's core screen. Above lg the floor lifts entirely, because the editor is deliberately
      // compact there so it reads as a document rather than as a form.
      //
      // min-height ONLY, deliberately: nothing here may change what `resize` measures. That function
      // writes an inline pixel height, and an inline height outranks min-height, so a floor built
      // out of padding would be baked into the measured value and would then have to be measured
      // away again on the way back up. The first attempt did exactly that and left all nine fields
      // stuck at 44px on the desktop layout after dragging a window past lg. Because min-height is
      // the only thing that varies by breakpoint, the inline height stays the content height at
      // every width, and crossing lg needs no re-measure at all: the floor simply stops applying and
      // the box drops straight back to it.
      //
      // content-center is what puts the words in the middle of that taller box instead of along its
      // top edge. It is alignment, not sizing, so unlike padding it is invisible to scrollHeight and
      // cannot get baked into the measurement. A browser without align-content on block containers
      // just leaves the text at the top, which is untidy but fully usable, so this degrades rather
      // than breaks.
      className={`w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none focus:ring-1 focus:ring-brand/30 min-h-11 content-center lg:min-h-0 lg:content-normal ${className}`}
    />
  );
}

/* `className` carries the caller's typography onto the resting state, which is what lets the
   education fields use this instead of EditableLine without losing the semibold school name or the
   italic degree. It is deliberately NOT applied to the editing textarea: that control is a form
   field wherever it appears and should look like one. */
function EditableHighlight({ value, terms, onChange, className = "" }: { value: string; terms: ReadonlySet<string>; onChange: (value: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <textarea autoFocus aria-label="Edit optimized resume text" value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => setEditing(false)} rows={Math.max(2, Math.ceil(value.length / 75))} className="w-full resize-none rounded-inner border border-control-border bg-white px-2 py-1 outline-none focus:border-brand" />
  ) : (
    <button type="button" onClick={() => setEditing(true)} className={`min-h-6 text-left leading-[1.35] hover:bg-brand-soft/50 focus:outline-none focus:ring-2 focus:ring-brand/30 ${className}`}>
      {/* hideMissing: an amber "asked for and NOT on your resume" mark cannot honestly appear on
          the resume. If the word were here the scorer would have counted it as covered. */}
      <RequirementText text={value} editedTerms={terms} hideMissing />
    </button>
  );
}

function QuestionsScreen({ applicationRole, applicationCompany, questions, metadataBlockers = [], actionableQuestionIds = [], onChange, onBack, onSubmit, onRefreshMetadata, saving = false, refreshingMetadata = false, metadataRefreshDisabled = false, metadataRefreshNeedsPacketReview = false, metadataRefreshError = null, lookaheadError = null, blockContinuation = false, reviewDiscovered = false, focusQuestion = null, prescriptNote = "" }: {
  applicationRole: string;
  applicationCompany: string;
  questions: ApplicationQuestion[];
  metadataBlockers?: ApplicationQuestionMetadataBlocker[];
  actionableQuestionIds?: string[];
  onChange: (questions: ApplicationQuestion[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  onRefreshMetadata: () => void;
  saving?: boolean;
  refreshingMetadata?: boolean;
  metadataRefreshDisabled?: boolean;
  metadataRefreshNeedsPacketReview?: boolean;
  metadataRefreshError?: string | null;
  lookaheadError?: string | null;
  blockContinuation?: boolean;
  reviewDiscovered?: boolean;
  focusQuestion?: { id: string; token: number } | null;
  prescriptNote?: string;
}) {
  const [showAllAnswers, setShowAllAnswers] = useState(false);
  const screenHeadingRef = useRef<HTMLHeadingElement>(null);
  const presentation = questionReviewPresentation(questions, metadataBlockers);
  const editableQuestions = presentation.editableQuestions;
  const effectiveMetadataBlockers = presentation.metadataBlockers;
  const metadataBlocked = effectiveMetadataBlockers.length > 0;
  const missingQuestions = editableQuestions.filter((question) => question.required && !question.answer.trim());
  const optionalDecisionMissing = editableQuestions.some(optionalQuestionNeedsDecision);
  const focusQuestionId = focusQuestion?.id ?? null;
  const focusToken = focusQuestion?.token ?? 0;
  const actionableIds = new Set(actionableQuestionIds);
  if (focusQuestionId) actionableIds.add(focusQuestionId);
  const actionableQuestions = editableQuestions.filter((question) => actionableIds.has(question.id));
  const focusedReview = reviewDiscovered && actionableQuestions.length > 0 && !showAllAnswers;
  const visibleQuestions = reviewDiscovered
    ? (focusedReview ? actionableQuestions : editableQuestions)
    : editableQuestions;
  const continuationBlocked = blockContinuation
    || metadataBlocked
    || missingQuestions.length > 0
    || optionalDecisionMissing;
  const updateQuestionAnswer = (questionId: string, answer: string) => {
    onChange(questions.map((item) => item.id === questionId
      ? { ...item, answer, answer_state: undefined }
      : item));
  };
  const skipOptionalQuestion = (questionId: string) => {
    onChange(questions.map((item) => item.id === questionId && !item.required
      ? { ...item, answer: "", answer_state: "skipped" as const }
      : item));
  };
  /* Arriving from a Your turn row means the student pressed ONE thing, so the caret belongs in that
     answer. Without this the screen opens at the top of a list of every question the form asked and
     the row she pressed can be several screens down, which is close enough to nothing happening.

     A focused question is handled in the effect body because the caller suppresses the page-level
     scroll for exactly that route. A whole-screen review lands on its heading in the next task,
     after browser scroll anchoring has finished replacing the prior tall screen. Neither path uses
     requestAnimationFrame, which does not fire in a hidden tab. */
  useEffect(() => {
    if (!focusQuestionId) {
      const timer = window.setTimeout(() => {
        const heading = screenHeadingRef.current;
        if (heading) {
          /* Focus can move the viewport in browser and assistive-technology combinations that do
             not honor preventScroll consistently. Put focus first, then establish the visible
             landing position so the sticky mobile shell cannot cover the screen title. */
          heading.focus({ preventScroll: true });
          const documentTop = heading.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top: Math.max(0, documentTop - 128), behavior: "auto" });
        }
      }, 150);
      return () => window.clearTimeout(timer);
    }
    const field = document.getElementById(`question-${focusQuestionId}`);
    // A short closed list renders as a radio group, which is a container rather than a form
    // control, so the branch below would refuse it. Scroll to it and put focus on the chosen
    // option, or the first one when nothing is picked yet.
    if (field instanceof HTMLElement && field.dataset.choiceList !== undefined) {
      field.scrollIntoView({ block: "center", behavior: "auto" });
      const choice = field.querySelector<HTMLInputElement>("input:checked") ?? field.querySelector<HTMLInputElement>("input");
      choice?.focus();
      return;
    }
    // A pre-script question with a closed option list renders as a select, so the caret placement
    // below cannot apply to it. Scroll and focus still do, which is the part that matters.
    if (!(field instanceof HTMLTextAreaElement) && !(field instanceof HTMLSelectElement)) return;
    field.scrollIntoView({ block: "center", behavior: "auto" });
    field.focus();
    if (field instanceof HTMLTextAreaElement) field.setSelectionRange(field.value.length, field.value.length);
  }, [focusQuestionId, focusToken]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">Back</button>
      <div>
        <p className="text-small text-muted">{applicationRole} · {applicationCompany}</p>
        <h2 ref={screenHeadingRef} tabIndex={-1} className="mt-2 scroll-mt-20 text-heading font-medium tracking-tight text-ink outline-none">
          {reviewDiscovered && actionableQuestions.length > 0
            ? `${actionableQuestions.length} ${actionableQuestions.length === 1 ? "answer needs" : "answers need"} you.`
            : reviewDiscovered ? "Review answers" : "Answer these"}
        </h2>
        {reviewDiscovered && (
          <p className="mt-1 text-sm leading-6 text-muted">
            Nothing here has gone to the employer. Check what needs you, then save to continue the application.
          </p>
        )}
        {/* The Apply-time line, which says what Litos already handled as well as what is left. A
            screen that only counts what is still owed reads as a bill. */}
        {!reviewDiscovered && prescriptNote && (
          <p className="mt-1 text-sm leading-6 text-muted">{prescriptNote}</p>
        )}
        {reviewDiscovered && actionableQuestions.length > 0 && actionableQuestions.length < editableQuestions.length && (
          <button
            type="button"
            onClick={() => setShowAllAnswers((current) => !current)}
            className="mt-3 min-h-11 text-sm font-medium text-brand-ink hover:text-ink"
          >
            {showAllAnswers ? `Focus on ${actionableQuestions.length} that need you` : `Review all ${editableQuestions.length} saved answers`}
          </button>
        )}
      </div>
      {lookaheadError && (
        <Card className="border-warn/30 bg-warn-soft p-5">
          <p className="text-label text-warn">Employer form read incomplete</p>
          <p role="alert" className="mt-2 text-small leading-6 text-ink">{lookaheadError}</p>
          <Button className="mt-4" onClick={onRefreshMetadata} disabled={refreshingMetadata} aria-busy={refreshingMetadata}>
            {refreshingMetadata ? "Reading the company form..." : "Read the company form again"}
          </Button>
        </Card>
      )}
      {effectiveMetadataBlockers.length > 0 && (
        <section aria-labelledby="question-metadata-heading" className="space-y-3">
          <div>
            <p className="text-label text-warn">Needs a fresh read</p>
            <h3 id="question-metadata-heading" className="mt-2 text-heading font-medium tracking-tight text-ink">
              {effectiveMetadataBlockers.length} employer {effectiveMetadataBlockers.length === 1 ? "field" : "fields"} stayed untouched.
            </h3>
            <p className="mt-1 text-small leading-6 text-muted">
              Litos must read the employer&apos;s exact wording and choices before presenting an answer.
            </p>
            {!lookaheadError && <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                onClick={onRefreshMetadata}
                disabled={refreshingMetadata || metadataRefreshDisabled}
                aria-busy={refreshingMetadata}
                aria-describedby="question-metadata-refresh-help"
              >
                {metadataRefreshNeedsPacketReview
                  ? "Review packet first"
                  : refreshingMetadata ? "Reviewing and filling..." : "Review and fill again"}
              </Button>
              <p id="question-metadata-refresh-help" className="text-small leading-6 text-muted">
                {metadataRefreshDisabled
                  ? "Save or go Back to discard your edits before refreshing."
                  : metadataRefreshNeedsPacketReview
                    ? "Litos needs your exact packet review before it can fill the employer form."
                  : "Litos opens the employer form, reads its current fields, and fills only your saved answers. Unsaved edits on this page are not used."}
              </p>
            </div>}
            {metadataRefreshError && (
              <p role="alert" className="mt-3 text-small leading-6 text-danger">{metadataRefreshError}</p>
            )}
          </div>
          {effectiveMetadataBlockers.map((blocker, index) => (
            <Card key={`${blocker.kind}:${blocker.control_id ?? blocker.portal_selector ?? blocker.question ?? index}`} className="p-6">
              <p className="text-sm font-medium leading-6 text-ink">
                {blocker.question ? displayQuestionLabel(blocker.question) : "Employer question not readable"}
              </p>
              <p className="mt-1 text-label text-warn">
                {blocker.kind === "unsupported_multi_value"
                  ? "Exact choices need a fresh read"
                  : blocker.kind === "missing_exact_options"
                    ? "Exact choices not read"
                    : "Exact question not read"}
              </p>
              <p className="mt-3 text-small leading-6 text-muted">
                {blocker.kind === "unsupported_multi_value"
                  ? "This field accepts more than one selection. Litos will read its complete current choice list before asking you to choose here."
                  : blocker.kind === "missing_exact_options"
                    ? "The employer's current options were not readable, so Litos did not guess or fill this field."
                    : "The employer's question was not readable, so Litos did not guess or fill this field."}
              </p>
            </Card>
          ))}
        </section>
      )}
      {visibleQuestions.map((question) => (
        <Card key={question.id} className="p-6">
          {/* An employer's question can be a whole consent paragraph. At that length bold stops
              being emphasis and becomes a wall, so a long label keeps the size and drops the
              weight, with the line height of body text. The full text always renders: what she is
              agreeing to is the one thing this screen must not truncate. */}
          <label htmlFor={`question-${question.id}`} className={`block text-sm text-ink ${question.question.trim().length > 140 ? "font-normal leading-6" : "font-medium"}`}>{displayQuestionLabel(question.question)}</label>
          {/* THE BADGE IS A CLAIM ABOUT THE CONTROL BELOW IT, so it reads the answer the same way
              that control does. Emptiness alone was the third place in this screen to test it,
              after the waiting count and the continue route, and it was the one left saying
              "Answered" over a closed question the card had painted blank: an off-list value is
              not empty. MEASURED live on the Hudson River Trading Greenhouse packet (4a79eec1,
              2026-09-03): a required "What is your gender?" offering Woman, Man, Non-binary and a
              decline carried the profile spelling "Female", every radio rendered unchecked, and
              the badge still read ANSWERED directly above a veteran question whose "No" WAS
              painted. The two badges said the same word about two different states, so the one
              question on that screen actually waiting for her looked done. */}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className={`font-mono text-[11px] uppercase tracking-[0.08em] ${question.required && !questionReadsAsAnswered(question) ? "text-warn" : "text-muted"}`}>
              {question.required
                ? questionReadsAsAnswered(question) ? "Answered" : "Required"
                : question.answer_state === "skipped"
                  ? "Skipped"
                  : questionReadsAsAnswered(question) ? "Optional, answered" : "Optional, answer or skip"}
            </p>
            {!question.required && (
              question.answer_state === "skipped" ? (
                <button type="button" onClick={() => updateQuestionAnswer(question.id, "")} className="min-h-9 text-xs font-medium text-brand-ink underline underline-offset-2">
                  Answer instead
                </button>
              ) : (
                <button type="button" onClick={() => skipOptionalQuestion(question.id)} className="min-h-9 text-xs font-medium text-muted underline underline-offset-2 hover:text-ink">
                  Skip
                </button>
              )
            )}
          </div>
          {/* Why this one is hers. Written by the backend so that the Apply screen and a stalled
              run's attention reason cannot describe the same refusal in two different voices. */}
          {question.explanation && (
            <p className="mt-1 text-xs leading-5 text-muted">{question.explanation}</p>
          )}
          {question.answer_draft?.trim() && !question.answer.trim() && question.answer_state !== "skipped" && (
            <p className="mt-3 rounded-inner border border-warn/20 bg-warn-soft px-3 py-2 text-xs leading-5 text-warn">
              Your previous answer did not match the employer&apos;s current choices: {question.answer_draft}. Choose again below.
            </p>
          )}
          {!question.required && question.answer_state === "skipped" ? (
            <p className="mt-4 rounded-inner border border-border bg-surface-alt px-4 py-3 text-sm leading-6 text-muted">
              This optional question will be left blank. Choose Answer instead if you want to include a response.
            </p>
          ) : question.options && question.options.length > 0 ? (
            /* The employer's own list, so a fixed choice is a choice rather than a box she has to
               guess the wording for. Sixteen DRW self-ratings and Point72's office list are all
               this shape, and a free-text answer to any of them is an answer the form rejects.
               Nothing is pre-picked on either shape.

               Two renderings, split on length. A short list reads at a glance as radio rows, which
               matters most when the options are whole sentences: Optiver's acknowledgement offers
               only "I consent to the above.", and a native select clips that to one cropped line
               behind a click. A long list stays a select, because forty radio rows is a worse box
               than the closed one. */
            questionAcceptsMultipleOptions(question) ? (
              <fieldset id={`question-${question.id}`} aria-label={displayQuestionLabel(question.question)} data-choice-list className="mt-4 space-y-2">
                {question.options.map((option) => (
                  <label key={option} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-inner border bg-surface px-4 py-3 text-sm leading-6 text-ink ${exactSelectedQuestionOptions(question.answer, question.options)?.includes(option) ? "border-brand" : "border-control-border hover:border-ink"}`}>
                    <input
                      type="checkbox"
                      name={`question-choice-${question.id}`}
                      value={option}
                      checked={exactSelectedQuestionOptions(question.answer, question.options)?.includes(option) === true}
                      onChange={(event) => {
                        const answer = answerWithExactOptionToggled(question.answer, question.options, option, event.target.checked);
                        if (answer === null) return;
                        updateQuestionAnswer(question.id, answer);
                      }}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-control-border text-brand-ink focus:ring-brand/30"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </fieldset>
            ) : question.options.length <= QUESTION_CHOICE_LIST_LIMIT ? (
              <div id={`question-${question.id}`} role="radiogroup" aria-label={displayQuestionLabel(question.question)} data-choice-list className="mt-4 space-y-2">
                {/* Checked under the fill path's own equivalence (exactQuestionOption), not byte
                    equality. The backend stores and keeps an answer that can differ from the
                    offered label by edge whitespace or case; rendering that stored choice
                    unchecked told the applicant she had not answered and made her re-pick, which
                    changed the answer bytes and voided her acknowledged exact-packet audit. */}
                {question.options.map((option) => (
                  <label key={option} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-inner border bg-surface px-4 py-3 text-sm leading-6 text-ink ${exactQuestionOption(question.answer, question.options) === option ? "border-brand" : "border-control-border hover:border-ink"}`}>
                    <input
                      type="radio"
                      name={`question-choice-${question.id}`}
                      value={option}
                      checked={exactQuestionOption(question.answer, question.options) === option}
                      onChange={() => updateQuestionAnswer(question.id, option)}
                      className="mt-1 h-4 w-4 shrink-0 border-control-border text-brand-ink focus:ring-brand/30"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : (
              <select
                id={`question-${question.id}`}
                /* THE STORED ANSWER MUST RENDER AS THE CHOICE IT NAMES. The backend accepts and
                   keeps a closed single-choice answer under trimmed case-insensitive equivalence
                   (its own fill match), so the stored bytes can differ from the offered label by
                   edge whitespace or case. Binding those bytes raw meant a <select> whose value
                   matched no <option>: measured live on the Mytos Lever packet (application
                   55de7c9e, 2026-08-28), the degree-classification select held the stored,
                   repeatedly re-saved answer "GPA 3.5-3.8" and still opened on "Choose an answer"
                   every visit. Re-picking the same value counted as an edit and voided the
                   acknowledged exact-packet audit; saving untouched read as a blank required
                   answer. Either way the launch was unreachable.

                   exactQuestionOption returns the OFFERED label when the stored answer names one,
                   and null otherwise, so an off-list answer still falls back to the placeholder
                   rather than landing on option one (the Five Rings rule). Display only: the
                   underlying answer bytes are untouched until she actually picks, so an untouched
                   Save still posts the exact stored bytes and the audit survives it. */
                value={exactQuestionOption(question.answer, question.options) ?? ""}
                onChange={(event) => updateQuestionAnswer(question.id, event.target.value)}
                className="mt-4 w-full rounded-inner border border-control-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand"
              >
                <option value="">Choose an answer</option>
                {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            )
          ) : (
            <textarea id={`question-${question.id}`} value={question.answer} onChange={(event) => updateQuestionAnswer(question.id, event.target.value)} rows={3} className="mt-4 w-full rounded-inner border border-control-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand" />
          )}
          {/* Said once, on the row it is true of, rather than as a promise at the top of a screen
              she cannot check. A declaration about her carries to the next posting; an answer about
              this one never does, and neither claim belongs anywhere but next to its question. */}
          {question.remembered && (
            <p className="mt-2 text-xs leading-5 text-muted">You answered this before. Change it if it is out of date.</p>
          )}
        </Card>
      ))}
      {/* Same trap as the review screen, one screen later: N six-row textareas and then the button
          that ends the screen, so at 744px the action is off the bottom of a document whose every
          other element eats the keyboard. Same treatment. */}
      {/* The label says which of the two saves this is while it is happening. From the review
          screen this is a request to the server, and a button that reads "Save" throughout a write
          it does not acknowledge is how the old handler got away with saving nothing. */}
      <TerminalActionBar className="justify-end">
        <Button variant={continuationBlocked ? "secondary" : "primary"} onClick={onSubmit} disabled={saving || refreshingMetadata || continuationBlocked}>
          {saving
            ? "Saving..."
            : blockContinuation || metadataBlocked
              ? "Waiting for a complete form read"
              : missingQuestions.length > 0
                ? "Answer required questions"
                : optionalDecisionMissing
                  ? "Answer or skip optional questions"
              : "Save and continue"}
        </Button>
      </TerminalActionBar>
    </div>
  );
}

/**
 * The one control that can finish an application the employer is holding behind an emailed code.
 *
 * A REAL FORM, A REAL INPUT AND A REAL BUTTON, and that sentence is here because this app has
 * shipped the opposite: buttons rendered as <span> elements with nothing to bind to, which is how 79
 * prepared resumes produced 0 sent applications. This is a <form> with an onSubmit, so Enter in the
 * field works as well as the button, the field is a labelled <input> the browser can autofill from a
 * one-time-code SMS or mail, and the button is a <button type="submit">. features/applications
 * carries a test that asserts all of that against this file's source.
 *
 * NOTHING SURVIVES OUTSIDE THE MANAGED SESSION, and the copy says so. The attended-handoff path in
 * this same product promises "Everything else is filled in" and then opens a completely empty
 * employer form, because the filled page lived in a browser that no longer exists. The finishing run
 * here does not depend on any surviving page: it fills the form again from the same packet and sends
 * it with the code in place. The applicant is told that, rather than left to discover it.
 */
function SecurityCodeCard({ review, submitting, error, onSubmitCode }: {
  review: ApplicationReview;
  submitting: boolean;
  error: string | null;
  onSubmitCode: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const digits = review.security_code?.digits ?? 0;
  const sentTo = review.security_code?.sent_to;
  const lastRejected = review.security_code?.attempts?.some((attempt) => attempt.outcome === "rejected") === true;
  // Trimmed of the spacing a code picks up on its way out of an email, and measured only when the
  // page told us a length. A field that claims "8 characters" about a control that never said so
  // would refuse a valid code.
  const cleaned = code.replace(/[\s-]/g, "");
  const ready = cleaned.length > 0 && (digits === 0 ? cleaned.length >= 4 : cleaned.length === digits);
  return (
    <div className="mt-4 rounded-inner border border-border bg-surface-alt p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Waiting on the security code</p>
      <p className="mt-2 text-sm leading-6 text-ink">
        {sentTo
          ? <>Litos sent this application and {review.ats_name === "greenhouse" ? "the employer" : "the employer"} emailed a{digits > 0 ? ` ${digits}-character` : ""} security code to <span className="font-medium">{sentTo}</span>. It is not filed until that code goes in.</>
          : <>Litos sent this application and the employer emailed a{digits > 0 ? ` ${digits}-character` : ""} security code before it will file it. Check the inbox you applied with.</>}
      </p>
      {lastRejected && (
        <p role="alert" className="mt-2 text-xs leading-5 text-warn">
          The last code Litos tried was not accepted. Use the newest email.
        </p>
      )}
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || submitting) return;
          onSubmitCode(cleaned);
        }}
      >
        <div>
          <label htmlFor="security-code" className="block text-xs font-medium text-muted">Security code</label>
          <input
            id="security-code"
            name="security-code"
            type="text"
            inputMode="text"
            // The browser's own name for this, so a code that arrives by mail or SMS can be filled
            // in one tap instead of copied across apps.
            autoComplete="one-time-code"
            // Never lower-cased or upper-cased. Greenhouse's own example code is TPHJrFMJ, which is
            // mixed case on purpose, and normalising it destroys a valid code.
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            {...(digits > 0 ? { maxLength: digits * 2 } : {})}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={submitting}
            className="mt-1 w-48 rounded-inner border border-control-border bg-surface px-3 py-2 font-mono text-sm tracking-[0.2em] text-ink disabled:opacity-50"
            placeholder={digits > 0 ? "".padEnd(digits, "x") : "code"}
          />
        </div>
        <Button
          type="submit"
          disabled={!ready || submitting}
        >
          {submitting ? "Finishing" : "Finish sending"}
        </Button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs leading-5 text-danger">{error}</p>}
      <p className="mt-3 text-xs leading-5 text-muted">
        Litos fills the company form again from this packet and sends it with the code in place, so
        nothing needs to still be open in a browser anywhere.
      </p>
    </div>
  );
}

/**
 * The one question that unlocks a run that stopped without saying whether it reached the employer.
 *
 * This is not a blocker Litos can resolve by rerunning anything: `attention_reason` already says
 * what happened and where to look (unverifiedSubmissionReason on the backend), so it is rendered
 * verbatim rather than paraphrased here, the same way BlockerList would if this state had not
 * bypassed it. What is new is the pair of controls, because the answer can only be hers. Answering
 * "found" records this as sent - the same terminal state a normal send reaches, with the source
 * named so the receipt never claims Litos verified it. Answering "not found" releases the claim, so
 * the ordinary Try again/Review and fill controls become live again the next time this screen
 * renders, instead of refusing forever.
 *
 * Takes the already-sanitized `safeAttentionReason` rather than the raw `review`, on purpose: every
 * other reader of `attention_reason` on this screen goes through `userFacingError` first (it exists
 * to catch stack traces, provider internals, and secret-shaped strings before they reach the
 * screen), and `unverified_submission.cause` includes `provider_error` - exactly the case a raw
 * exception message could land in this field. Taking the sanitized string as the prop, instead of
 * the whole review, makes reading the unsanitized field a type error rather than a habit to remember.
 */
function UnverifiedSubmissionCard({ attentionReason, submitting, error, onSubmitOutcome }: {
  attentionReason: string | undefined;
  submitting: boolean;
  error: string | null;
  onSubmitOutcome: (found: boolean) => void;
}) {
  return (
    <div className="mt-4 rounded-inner border border-border bg-surface-alt p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Waiting on you to look</p>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink">
        {attentionReason
          ?? "Litos pressed Send and could not confirm what came back. Check the filled-form proof shown in this dashboard, then choose what it shows."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => onSubmitOutcome(true)} disabled={submitting} variant="secondary">
          {submitting ? "Recording..." : "I found it there"}
        </Button>
        <Button onClick={() => onSubmitOutcome(false)} disabled={submitting}>
          {submitting ? "Recording..." : "It is not there"}
        </Button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs leading-5 text-danger">{error}</p>}
    </div>
  );
}

export function DirectApplicationQuestion({ task, position, total, saving, saved, focusToken, hasPrevious, hasNext, preservedDraft, externalFailure, onDraftChange, onClearDraft, onClearFailure, onPrevious, onNext, onReviewApplication, onSave, onSkip }: {
  task: DirectQuestionTask;
  position: number;
  total: number;
  saving: boolean;
  saved: boolean;
  focusToken: number;
  hasPrevious: boolean;
  hasNext: boolean;
  preservedDraft: DirectAnswerDraft | null;
  externalFailure: DirectAnswerFailure | null;
  onDraftChange: (questionId: string, promptFingerprint: string, taskFingerprint: string, answer: string) => void;
  onClearDraft: (promptFingerprint: string) => void;
  onClearFailure: (promptFingerprint: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onReviewApplication: () => void;
  onSave: (questionId: string, answer: string, intent: DirectQuestionTaskIntent, promptFingerprint: string, taskFingerprint: string, task: DirectQuestionTask) => Promise<DirectAnswerSaveResult>;
  onSkip: (questionId: string, intent: DirectQuestionTaskIntent, promptFingerprint: string, taskFingerprint: string, task: DirectQuestionTask) => Promise<DirectAnswerSaveResult>;
}) {
  const [promptFingerprint] = useState(() => directQuestionPromptFingerprint(task));
  const [taskFingerprint] = useState(() => directQuestionTaskFingerprint(task));
  const [answer, setAnswer] = useState(
    preservedDraft?.promptFingerprint === promptFingerprint
      ? preservedDraft.answer
      : task.question.answer ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [choiceTouched, setChoiceTouched] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const busy = saving || submitting || navigating;
  const savedAnswer = task.question.answer ?? "";
  const answerDirty = answer !== savedAnswer;
  /* THIS QUESTION IS ON SCREEN FOR THE ONE UNDER IT, and its own answer already stands.
     Navigating past it must not write: a save here would post the same bytes back, and posting an
     answer refreshes the employer question pass, which resets the pass key the navigator counts
     against - so the very count this parent was re-admitted to hold still would move again. Editing
     it is still a real edit and still saves; only the untouched pass-through is silent. See
     dependent-questions.ts. */
  const contextOnly = task.context === true && !answerDirty;
  /* THESE WORDS ARE LITOS'S UNTIL SHE SAYS OTHERWISE.
     The backend writes answer_source 'litos_draft' on a paragraph it composed from her resume and
     this job description, and its send gate counts one as an unanswered required question, so an
     application cannot go out on a draft she never read. This screen's job is the other half: show
     the draft in the SAME box as every other answer, and say plainly who wrote it. Read off the
     SAVED answer rather than the live one, so the line does not vanish the moment she starts typing
     over it: she is still looking at a box Litos filled. */
  const litosDrafted = task.question.answer_source === "litos_draft" && Boolean(savedAnswer.trim());
  const requiredBlank = task.question.required && !answer.trim();
  const optionalDecisionBlank = !task.question.required
    && task.question.answer_state !== "skipped"
    && !answer.trim();
  const exactOptions = task.question.options ?? [];
  const acceptsMultipleOptions = questionAcceptsMultipleOptions(task.question);
  const selectedExactOptions = acceptsMultipleOptions
    ? exactSelectedQuestionOptions(answer, exactOptions)
    : null;
  /* The employer's own label for the single choice the answer names, under the fill path's trimmed
     case-insensitive equivalence, or null when it names none. Byte equality here is the measured
     Mytos defect: the stored, server-accepted "GPA 3.5-3.8" read as no choice at all, so the
     select opened on the placeholder and the save was refused until she re-picked her own answer,
     which changed its bytes and voided the acknowledged exact-packet audit. */
  const selectedExactOption = !acceptsMultipleOptions && exactOptions.length > 0
    ? exactQuestionOption(answer, exactOptions)
    : null;
  const choiceMissing = exactOptions.length > 0 && (acceptsMultipleOptions
    ? selectedExactOptions === null
    : selectedExactOption === null);
  const choiceErrorVisible = choiceMissing && (choiceTouched || Boolean(answer.trim()));
  const answerBlocked = requiredBlank || choiceMissing || optionalDecisionBlank;
  const headingId = `direct-application-question-${encodeURIComponent(task.question.id)}`;
  const progressId = `${headingId}-progress`;
  const helperId = `${headingId}-helper`;
  const errorId = `${headingId}-error`;
  const visibleError = saveError
    ?? (externalFailure?.promptFingerprint === promptFingerprint ? externalFailure.message : null)
    ?? (choiceErrorVisible
      ? acceptsMultipleOptions
        ? "Choose only the employer's current options before saving."
        : "Choose one of the employer's current options before saving."
      : null);
  const answerDescribedBy = `${progressId} ${helperId}${visibleError ? ` ${errorId}` : ""}`;

  useEffect(() => {
    if (focusToken <= 0) return;
    const timer = window.setTimeout(() => {
      const heading = headingRef.current;
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "nearest", behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusToken, headingId]);

  async function submitAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((saved || contextOnly) && !answerDirty && hasNext) {
      navigate(onNext);
      return;
    }
    /* The last step of the pass, reached on an untouched context parent: there is nothing to save
       and nowhere further to go, so hand her the packet rather than posting a no-op. */
    if (contextOnly && !hasNext) {
      onReviewApplication();
      return;
    }
    if (busy || answerBlocked) return;
    setSubmitting(true);
    setSaveError(null);
    onClearFailure(promptFingerprint);
    onDraftChange(task.question.id, promptFingerprint, taskFingerprint, answer);
    const result = await onSave(task.question.id, answer, task.intent, promptFingerprint, taskFingerprint, task);
    setSubmitting(false);
    if (!result.saved) {
      setSaveError(result.message);
    } else if (!result.mayAdvance && result.retryMessage) {
      setSaveError(result.retryMessage);
    }
  }

  async function skipOptionalAnswer() {
    if (busy || task.question.required) return;
    setSubmitting(true);
    setSaveError(null);
    onClearFailure(promptFingerprint);
    onClearDraft(promptFingerprint);
    const result = await onSkip(task.question.id, task.intent, promptFingerprint, taskFingerprint, task);
    setSubmitting(false);
    if (!result.saved) {
      setSaveError(result.message);
    } else if (!result.mayAdvance && result.retryMessage) {
      setSaveError(result.retryMessage);
    }
  }

  /* A third arm on the same ternary, not a second control: the press does exactly what Save always
     did, and the server mints the same applicant_review claim from it. Only the word changes,
     because "Save answer" describes what she does to her own words and says nothing about the ones
     already in front of her. An EDITED draft goes back to Save, because by then they are hers. */
  const actionLabel = contextOnly
    ? hasNext ? "Next question" : "Review application"
    : task.intent === "confirm"
      ? hasNext ? "Confirm and next" : "Confirm answer"
      : litosDrafted && !answerDirty
        ? hasNext ? "Approve and next" : "Approve answer"
        : saved ? hasNext ? "Save changes and next" : "Save changes" : hasNext ? "Save and next" : "Save answer";

  function updateAnswer(next: string) {
    if (busy) return;
    setAnswer(next);
    setSaveError(null);
    onClearFailure(promptFingerprint);
    if (next === savedAnswer) onClearDraft(promptFingerprint);
    else onDraftChange(task.question.id, promptFingerprint, taskFingerprint, next);
  }

  function navigate(navigateToQuestion: () => void) {
    if (busy) return;
    if (answerDirty) onDraftChange(task.question.id, promptFingerprint, taskFingerprint, answer);
    else onClearDraft(promptFingerprint);
    setNavigating(true);
    navigateToQuestion();
  }

  return (
    <MotionPanel key={task.id} name="dashboard-application-answer">
      <section aria-labelledby={headingId} className="py-1">
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-label font-medium uppercase tracking-[0.08em] text-muted">
            Application answer
          </p>
          <p id={progressId} className="shrink-0 font-mono text-label tabular-nums text-muted">
            {position} of {total}
          </p>
        </div>
        {saved && !answerDirty && (
          <p className="mt-2 text-small text-teal-ink">Saved to this application.</p>
        )}
        <h2 ref={headingRef} id={headingId} tabIndex={-1} className={`mt-4 text-ink ${task.question.question.trim().length > 140 ? "text-body leading-7" : "text-heading font-medium leading-tight"}`}>
          {displayQuestionLabel(task.question.question)}
        </h2>
        <p id={helperId} className="mt-2 text-small leading-6 text-muted">
          {/* A parent says why it is on screen at all. Without this it reads as a question being
              asked twice, which is what re-admitting it looks like from the outside. */}
          {task.context === true
            ? "Your answer to this is saved. It is shown because the next question refers back to it."
            : task.question.required
              ? "Required. Litos saves this answer to this application before showing the next one."
              : "Optional. Answer it or skip it. Litos saves this answer to this application before showing the next one."}
        </p>
        {litosDrafted && (
          /* Deliberately the same quiet surface as the other two notices on this screen, and
             deliberately not a warning: a drafted answer is the product working, not a fault. */
          <p className="mt-3 rounded-inner border border-control-border bg-surface-alt px-3 py-2 text-small leading-6 text-muted">
            Litos wrote this answer from your resume and this job. Approve it as it is, or change
            anything you want first. Nothing is sent until you do.
          </p>
        )}
        {task.question.explanation && (
          <p className="mt-2 text-small leading-6 text-muted">{task.question.explanation}</p>
        )}
        {task.question.answer_draft?.trim() && !answer.trim() && (
          <p className="mt-3 rounded-inner border border-control-border bg-surface-alt px-3 py-2 text-small leading-6 text-muted">
            Your previous answer did not match the employer&apos;s current choices: {task.question.answer_draft}. Choose again below.
          </p>
        )}

        {task.question.options && task.question.options.length > 0
          && !questionOptionsAreComplete(task.question) && (
          /* THE MENU BELOW IS NOT THE WHOLE MENU.
             options_complete false means discovery saw more employer choices than it could retain
             exactly. Rendering the partial list with no mark is the worst of the three options: she
             picks Amsterdam from three, never learning the employer offered nine, and a wrong answer
             she chose deliberately looks exactly like a right one. The list still shows, because the
             choices that WERE read exactly are real and usually contain her answer. It just stops
             claiming to be complete. */
          <p className="mt-3 rounded-inner border border-control-border bg-surface-alt px-3 py-2 text-small leading-6 text-muted">
            Litos could not read this employer&apos;s full list of choices, so the options below may
            be only part of it. Pick one if your answer is there. If it is not, leave this and Litos
            will not guess on your behalf.
          </p>
        )}

        <form onSubmit={submitAnswer} aria-busy={busy} className="mt-6 pb-40 lg:pb-0">
          {task.question.options && task.question.options.length > 0 ? (
            acceptsMultipleOptions ? (
              <fieldset aria-labelledby={headingId} aria-describedby={answerDescribedBy} aria-invalid={visibleError ? true : undefined} className="space-y-2">
                {task.question.options.map((option) => (
                  <label key={option} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-inner border px-4 py-3 text-small leading-6 text-ink transition-colors ${selectedExactOptions?.includes(option) ? "border-brand bg-brand-soft" : "border-control-border bg-surface hover:border-ink"} ${busy ? "cursor-not-allowed opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      name={`direct-question-choice-${task.question.id}`}
                      value={option}
                      checked={selectedExactOptions?.includes(option) === true}
                      disabled={busy}
                      aria-disabled={busy}
                      onChange={(event) => {
                        const next = answerWithExactOptionToggled(answer, exactOptions, option, event.target.checked);
                        if (next !== null) updateAnswer(next);
                      }}
                      onBlur={() => setChoiceTouched(true)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-control-border text-brand-ink focus:ring-brand/30"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </fieldset>
            ) : task.question.options.length <= QUESTION_CHOICE_LIST_LIMIT ? (
              <fieldset aria-labelledby={headingId} aria-describedby={answerDescribedBy} aria-invalid={visibleError ? true : undefined} className="space-y-2">
                {task.question.options.map((option) => (
                  <label key={option} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-inner border px-4 py-3 text-small leading-6 text-ink transition-colors ${selectedExactOption === option ? "border-brand bg-brand-soft" : "border-control-border bg-surface hover:border-ink"} ${busy ? "cursor-not-allowed opacity-60" : ""}`}>
                    <input
                      type="radio"
                      name={`direct-question-choice-${task.question.id}`}
                      value={option}
                      checked={selectedExactOption === option}
                      disabled={busy}
                      aria-disabled={busy}
                      required={task.question.required}
                      onChange={() => updateAnswer(option)}
                      className="mt-1 h-4 w-4 shrink-0 border-control-border text-brand-ink focus:ring-brand/30"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <select
                /* AN ANSWER THAT IS NOT ON THE EMPLOYER'S LIST MUST READ AS UNANSWERED, never as
                   the first option. A <select> whose value matches no <option> does not stay
                   blank: the browser lands on the first selectable entry and reports THAT as its
                   value, so the control silently impersonates an answer nobody chose.

                   MEASURED live, 2026-08-27, Five Rings. The stored answer was "Job board", which
                   is on no employer list; the control showed "Coffee Chat" - the first option - and
                   `select.value` read "Coffee Chat" too, so a single Save would have told an
                   employer she had a coffee chat that never happened. Every referral list starts
                   with a claim of that shape, because they are ordered warmest-first, which is why
                   this is not a cosmetic default.

                   Falling back to "" shows the disabled placeholder instead, and the required
                   attribute then does its job: the question cannot be saved until she picks.

                   MEMBERSHIP IS THE FILL PATH'S OWN EQUIVALENCE, trim plus case fold, not byte
                   equality. The converse defect to Five Rings was measured live on the Mytos
                   Lever packet (application 55de7c9e, 2026-08-28): the stored, server-accepted
                   answer "GPA 3.5-3.8" names one of the nine offered options to every backend
                   reader, but byte-strict membership refused it, so the select opened on the
                   placeholder and the save stayed blocked until she re-picked her own saved
                   answer - and that re-pick changed the answer bytes, which voided the
                   acknowledged exact-packet audit. selectedExactOption is the OFFERED label the
                   answer names (null for off-list, so the Five Rings fallback is unchanged), and
                   it is display-only: the answer bytes she saved stay untouched until she
                   actually picks something. */
                value={selectedExactOption ?? ""}
                disabled={busy}
                aria-disabled={busy}
                required={task.question.required}
                aria-labelledby={headingId}
                aria-describedby={answerDescribedBy}
                aria-invalid={visibleError ? true : undefined}
                onChange={(event) => updateAnswer(event.target.value)}
                onBlur={() => setChoiceTouched(true)}
                className={`min-h-11 w-full rounded-inner border border-control-border bg-surface px-4 py-3 text-small leading-6 text-ink outline-none focus:border-brand ${busy ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <option value="" disabled>Choose an answer</option>
                {task.question.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            )
          ) : (
            <textarea
              value={answer}
              readOnly={busy}
              aria-disabled={busy}
              required={task.question.required}
              rows={4}
              aria-labelledby={headingId}
              aria-describedby={answerDescribedBy}
              aria-invalid={visibleError ? true : undefined}
              onChange={(event) => updateAnswer(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") event.currentTarget.form?.requestSubmit();
              }}
              className={`min-h-28 w-full resize-y rounded-inner border border-control-border bg-surface px-4 py-3 text-body leading-6 text-ink outline-none placeholder:text-muted focus:border-brand ${busy ? "cursor-not-allowed opacity-60" : ""}`}
              placeholder="Type your answer"
            />
          )}
          {visibleError && (
            <p id={errorId} role="alert" className="mt-3 text-small leading-6 text-danger">
              {visibleError}
            </p>
          )}
          <TerminalActionBar className="!fixed inset-x-4 !bottom-[calc(var(--dashboard-bottom-bar)+0.75rem)] !z-40 mt-6 justify-end sm:inset-x-6 lg:!static lg:!inset-auto lg:!bottom-auto lg:!z-20 lg:shadow-none">
            <div className={`grid w-full gap-2 ${hasPrevious ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1"} sm:flex sm:items-center sm:w-auto`}>
              {hasPrevious && (
                <Button
                  type="button"
                  variant="secondary"
                  aria-label="Previous question"
                  disabled={busy}
                  onClick={() => navigate(onPrevious)}
                >
                  Previous
                </Button>
              )}
              {saved && !answerDirty ? (
                <Button
                  type="button"
                  block
                  className="sm:w-auto"
                  aria-label={hasNext ? "Next question" : "Review application"}
                  disabled={busy}
                  onClick={() => hasNext ? navigate(onNext) : onReviewApplication()}
                >
                  {navigating ? <PendingLabel onColor>Opening next question</PendingLabel> : hasNext ? "Next question" : "Review application"}
                </Button>
              ) : (
                <div className={`grid gap-2 ${task.question.required ? "grid-cols-1" : "grid-cols-2"}`}>
                  {!task.question.required && (
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => void skipOptionalAnswer()}>
                      {saving || submitting ? "Saving..." : "Skip"}
                    </Button>
                  )}
                  <Button type="submit" block className="sm:w-auto" disabled={busy || answerBlocked}>
                    {saving || submitting ? <PendingLabel onColor>Saving...</PendingLabel> : actionLabel}
                  </Button>
                </div>
              )}
            </div>
            <p className="basis-full text-label leading-5 text-muted">Nothing goes to the employer until you review the completed application.</p>
          </TerminalActionBar>
        </form>
      </section>
    </MotionPanel>
  );
}

function SubmissionScreen({ packet, submission, packetEvidenceReviewed, manualTrialPacket, approving, securityCodeSubmitting, securityCodeError, onSubmitSecurityCode, unverifiedSubmissionSubmitting, unverifiedSubmissionError, onSubmitUnverifiedOutcome, educationProfile, educationProfileStatus, onCheckResume, onReloadCoverLetter, onWriteCoverLetter, coverLetterReloading, onHandoffComplete, onApprove, sendRefusal, onRestart, restarting, onRetry, onReviewPacket, onReviewQuestions, onOpenQuestion, onChooseOption, onSaveQuestion, onSkipQuestion, savingAnswer, answeredQuestionFingerprints, directAnswerProgress, directAnswerDrafts, directAnswerFailure, onDirectAnswerDraftChange, onClearDirectAnswerDraft, onNavigateDirectQuestion, onClearDirectAnswerFailure, onRefreshQuestionMetadata, questionMetadataRefreshing, questionMetadataRefreshDisabled, questionMetadataNeedsPacketReview, questionMetadataRefreshError, onQuestionsFinished, onAddDocument, onToggleAcknowledged, attentionTicking, onSelfSubmitted, onPacketAuditRefusal, onOpenWithExtension, extensionFillBusy, extensionFillError }: { packet: GeneratedResume; submission: SubmissionResponse; packetEvidenceReviewed: boolean; manualTrialPacket: PacketAuditResponse | null; approving: boolean; securityCodeSubmitting: boolean; securityCodeError: string | null; onSubmitSecurityCode: (code: string) => void; unverifiedSubmissionSubmitting: boolean; unverifiedSubmissionError: string | null; onSubmitUnverifiedOutcome: (found: boolean) => void; educationProfile: EducationProfile | null; educationProfileStatus: EducationProfileStatus; onCheckResume: () => void; onReloadCoverLetter: () => void; onWriteCoverLetter: () => void; coverLetterReloading: boolean; onHandoffComplete: (outcome?: "cleared" | "submitted") => void; onApprove: () => void; sendRefusal: { message: string; issues: string[] } | null; onRestart: () => void; restarting: boolean; onRetry: () => void; onReviewPacket: () => void; onReviewQuestions: () => void; onOpenQuestion: (questionId: string, intent?: SubmissionChecklistAction) => void; onChooseOption: (questionId: string, option: string) => void; onSaveQuestion: (questionId: string, answer: string, intent: DirectQuestionTaskIntent, promptFingerprint: string, taskFingerprint: string, task: DirectQuestionTask) => Promise<DirectAnswerSaveResult>; onSkipQuestion: (questionId: string, intent: DirectQuestionTaskIntent, promptFingerprint: string, taskFingerprint: string, task: DirectQuestionTask) => Promise<DirectAnswerSaveResult>; savingAnswer: boolean; answeredQuestionFingerprints: ReadonlySet<string>; directAnswerProgress: DirectAnswerProgress | null; directAnswerDrafts: ReadonlyMap<string, DirectAnswerDraft>; directAnswerFailure: DirectAnswerFailure | null; onDirectAnswerDraftChange: (questionId: string, promptFingerprint: string, taskFingerprint: string, answer: string) => void; onClearDirectAnswerDraft: (promptFingerprint: string) => void; onNavigateDirectQuestion: (promptFingerprint: string) => void; onClearDirectAnswerFailure: (promptFingerprint: string) => void; onRefreshQuestionMetadata: () => void; questionMetadataRefreshing: boolean; questionMetadataRefreshDisabled: boolean; questionMetadataNeedsPacketReview: boolean; questionMetadataRefreshError: string | null; onQuestionsFinished: () => void; onAddDocument: (kind: string) => void; onToggleAcknowledged: (item: SubmissionChecklistItem, acknowledged: boolean) => void; attentionTicking: ReadonlySet<string>; onSelfSubmitted: () => void; onPacketAuditRefusal: (reason: unknown) => Promise<boolean>; onOpenWithExtension: () => void; extensionFillBusy: boolean; extensionFillError: string | null }) {
  const { review } = submission;
  const awaitingSecurityCode = review.status === "awaiting_security_code";
  const needsAttention = review.status === "needs_attention";
  const failedPacketAuditStale = review.status === "failed" && historicalPacketAuditStaleMessage(review);
  /* A run may have reached the employer and stopped before it could say so. Gated on the resolution
     being absent, not just the field's presence: once she has answered, the record stays on the
     review as history (the same reason `stall` is closed with `resolved_at` rather than deleted),
     and a resolved one must not reopen this card on every later visit. */
  const awaitingUnverifiedSubmission = needsAttention && Boolean(review.unverified_submission) && !review.unverified_submission?.resolution;
  /* Every control below that can replay, resolve, or open a live/exact form for this application is
     gated HERE, at the one place they all read from, rather than at each button individually. That
     is not a style preference: the four buttons this feature explicitly gated (Review and fill, Try
     again, I cleared the check, I submitted it myself) missed the others that share the same
     `needsAttention` flag - Check the answers, Finish in this dashboard, the live iframe, Open in
     new tab, and Open exact company form all read `hasQuestionsToReview` / `handoffUrl` /
     `attendedHandoffUrl` and would have rendered right alongside the yes/no card, letting her
     interact with (or submit through) the exact form the card exists to ask about first. Gating the
     three shared values instead of the many places that read them makes the exclusion automatic for
     every future control built on them, the same way `awaiting_security_code` gets it for free by
     being its own status. */
  const hasQuestionsToReview = needsAttention && !awaitingUnverifiedSubmission && review.questions.length > 0;
  const handoffUrl = needsAttention && !awaitingUnverifiedSubmission ? submission.handoff_url : undefined;
  /* Prefers the stalled run's own recorded location over the packet's general portal_url: they can
     differ (posting migrations, a portal_url repaired after the fact), and while an unverified send
     is open, "the exact page this stopped on" is the only one that answers her question. */
  const portalUrl = (awaitingUnverifiedSubmission ? review.unverified_submission?.portal_url : undefined)?.trim()
    ?? review.portal_url?.trim();
  /* `portal_supported: true` is the server's answer that this packet belongs to a family Litos can
     fill itself. A managed run may still stop without a surviving browser session, but that does
     not turn the employer page into the recovery path: Review and fill starts a fresh managed run
     from the exact packet and the saved answers. Keep every generic Open page escape off this
     screen in that case, or an autonomous board advertises the manual workflow at the first retry. */
  const staysInsideLitos = review.portal_supported === true;
  /* Gated the same way every other post-resolution control is (see the comment above
     awaitingUnverifiedSubmission): only once she has answered "it is not there" does a recovery
     control belong on screen at all. Narrower than that gate alone, though - `challenge_on_screen`
     is a fact about THIS specific stop, not about needs_attention in general, so an ordinary timeout
     or provider error still offers only Try again. A CAPTCHA wall is not always deterministic (a
     retry can draw an easier challenge, or none), so this sits ALONGSIDE Try again rather than
     replacing it: the extension path is the guaranteed way to finish it now, not the only way. */
  const captchaBlockedLastAttempt = needsAttention && !awaitingUnverifiedSubmission
    && review.unverified_submission?.challenge_on_screen === true;
  const attendedHandoffUrl = awaitingUnverifiedSubmission ? null : exactAttendedHandoffUrl(review);
  const canFinishInDashboard = Boolean(handoffUrl) && !attendedHandoffUrl;
  /* An external-recovery control (Finish in this dashboard / Open exact company form / Open in
     new tab) is on the action row, and each of those defaults to the primary variant. While one
     is present, the review controls demote so the row keeps exactly one filled button. */
  const rowExternalPrimary = canFinishInDashboard || Boolean(attendedHandoffUrl);
  const [attendedHandoffState, setAttendedHandoffState] = useState<"idle" | "preparing" | "failed">("idle");
  const [attendedHandoffError, setAttendedHandoffError] = useState<string | null>(null);

  async function openAttendedHandoff() {
    if (!attendedHandoffUrl || attendedHandoffState === "preparing") return;
    const companyTab = window.open("about:blank", "_blank");
    if (!companyTab) {
      setAttendedHandoffState("failed");
      setAttendedHandoffError("Chrome blocked the company tab. Allow pop-ups for Litos, then try again.");
      return;
    }
    try {
      companyTab.opener = null;
      companyTab.document.body.textContent = "Litos is verifying the exact saved application.";
    } catch {
      companyTab.close();
      setAttendedHandoffState("failed");
      setAttendedHandoffError("Litos could not prepare a safe company tab. Nothing was opened.");
      return;
    }

    setAttendedHandoffState("preparing");
    setAttendedHandoffError(null);
    const extension = await ensureCurrentExtensionSession(
      { token: getToken(), guest: isGuestSession() },
      minimumAttendedHandoffExtensionVersion(review.ats_name),
    );
    if (!extension.installed || !extension.signedIn || extension.otherAccount) {
      companyTab.close();
      setAttendedHandoffState("failed");
      setAttendedHandoffError(extension.updateRequired
        ? "Update the Litos extension from the Chrome Web Store, then try again. This saved application needs the current version."
        : extension.otherAccount
          ? "The Litos extension is signed in to another account. Sign out there, then try again."
          : "Install the current Litos extension and sign in to this account before opening the company form.");
      return;
    }
    const armed = await armHandoffs([{ id: submission.application_id, portalUrl: attendedHandoffUrl }]);
    if (!armed) {
      companyTab.close();
      setAttendedHandoffState("failed");
      setAttendedHandoffError("Litos could not bind this exact saved application to Chrome. Nothing was opened.");
      return;
    }
    try {
      companyTab.location.replace(attendedHandoffUrl);
      setAttendedHandoffState("idle");
    } catch {
      companyTab.close();
      setAttendedHandoffState("failed");
      setAttendedHandoffError("Chrome could not open the exact saved company form. Nothing was submitted.");
    }
  }

  async function openManualAttendedHandoff() {
    if (!attendedHandoffUrl || !manualTrialPacket || attendedHandoffState === "preparing") return;
    const companyTab = window.open("about:blank", "_blank");
    if (!companyTab) {
      setAttendedHandoffState("failed");
      setAttendedHandoffError("Chrome blocked the company tab. Allow pop-ups for Litos, then try again.");
      return;
    }
    try {
      companyTab.opener = null;
      companyTab.document.body.textContent = "Litos is rechecking the exact packet and routing email.";
    } catch {
      companyTab.close();
      setAttendedHandoffState("failed");
      setAttendedHandoffError("Litos could not prepare a safe company tab. Nothing was opened.");
      return;
    }
    setAttendedHandoffState("preparing");
    setAttendedHandoffError(null);
    try {
      const current = await api<ManualHandoffResponse>(`/applications/${submission.application_id}/submission/manual-handoff`, { method: "POST" });
      const handoff = current.manual_handoff;
      if (!manualHandoffMatchesPacket(current, attendedHandoffUrl, manualTrialPacket)) {
        throw new Error("The saved packet, routing email, or company form changed. Review the exact packet again before opening the company form.");
      }
      companyTab.location.replace(handoff.url);
      setAttendedHandoffState("idle");
    } catch (reason) {
      companyTab.close();
      if (await onPacketAuditRefusal(reason)) return;
      setAttendedHandoffState("failed");
      setAttendedHandoffError(reason instanceof Error ? reason.message : "Litos could not revalidate this exact packet. Nothing was opened.");
    }
  }
  /* A wait that ends. "Loading cover letter." used to be the ONLY thing this screen said about a
     cover letter that never arrived, and it said it forever, beside a Send button that was greyed
     out and gave no reason. The wait is now bounded: after COVER_LETTER_WAIT_MS, which is six
     rounds of the 2.5s poll, the screen stops calling it progress and says what is actually true,
     that the cover letter is not here, with the two things that fix it.

     State holds the packet the wait has RUN OUT FOR, not a bare boolean, so nothing has to be reset
     synchronously inside the effect: a different packet, or a cover letter that has since arrived,
     simply fails the comparison at render time. */
  const [coverLetterWaitedFor, setCoverLetterWaitedFor] = useState<string | null>(null);
  /* Only a cover letter the EMPLOYER requires is worth waiting for. A form that merely offers the
     control is not a reason to run a countdown and then colour the screen amber. */
  const coverLetterMissing = review.cover_letter_supported === true
    && review.cover_letter_required === true
    && !submission.cover_letter;
  const waitedApplicationId = submission.application_id;
  useEffect(() => {
    if (!coverLetterMissing) return;
    const timer = window.setTimeout(() => setCoverLetterWaitedFor(waitedApplicationId), COVER_LETTER_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [coverLetterMissing, waitedApplicationId]);
  const coverLetterWaited = coverLetterMissing && coverLetterWaitedFor === waitedApplicationId;
  const coverLetterState = coverLetterGate({ supported: review.cover_letter_supported, required: review.cover_letter_required, coverLetter: submission.cover_letter, waited: coverLetterWaited });
  const coverLetterPending = coverLetterBlocks(coverLetterState);
  // Same eligibility rule as routeMissingRequiredAnswers: a metadata-blocked question owes the
  // metadata-refresh run a read, not the applicant a decision.
  const optionalAnswerDecisionMissing = questionReviewPresentation(
    review.questions,
    review.question_metadata_blockers ?? [],
  ).editableQuestions.some(optionalQuestionNeedsDecision);
  /* THE LAST GATE BEFORE THE EMPLOYER, and emptiness alone was not enough of one. A required closed
     control carrying a value none of its options offer is not empty, so it read as answered and
     Send rendered enabled over an application the portal cannot take. `questionReadsAsAnswered` is
     the same membership the question card binds its controls with, and the same one its badge
     prints, so this gate and that badge cannot disagree about a single question. */
  const requiredAnswerMissing = review.questions.some((question) => question.required
    && !questionReadsAsAnswered(question))
    || optionalAnswerDecisionMissing;
  const safeAttentionReason = review.attention_reason
    ? userFacingError(review.attention_reason, "Litos could not finish the company’s form. Try again in a minute.")
    : undefined;
  const attentionReview = { ...review, attention_reason: safeAttentionReason };
  const directTaskPlan = directInputTaskPlan(attentionReview, {
    company: packet.job_context.company,
    role: packet.job_context.role,
    documents: submission.documents,
  });
  const directProgressKey = directAnswerPassKey(review);
  const directProgress = directAnswerProgress?.key === directProgressKey
    ? directAnswerProgress
    : {
      key: directProgressKey,
      answeredTasks: [],
      cursorPromptFingerprint: null,
      lastSavedPromptFingerprint: null,
      navigationToken: 0,
      total: directTaskPlan.questionTasks.length,
    };
  const remainingDirectQuestions = directTaskPlan.questionTasks.filter((task) => (
    !answeredQuestionFingerprints.has(directQuestionPromptFingerprint(task))
  ));
  const directQuestionTasks = directAnswerNavigationTasks(
    review,
    remainingDirectQuestions,
    directProgress.answeredTasks,
  );
  const directQuestionFingerprints = new Set(
    directQuestionTasks.map((task) => directQuestionPromptFingerprint(task)),
  );
  const standingNonQuestionTask = directTaskPlan.nonQuestionTasks[0]?.item ?? null;
  /* The document steps this screen must keep even when the unverified-submission mode has taken
     everything else away. Computed here beside the plan, not inside the branch, so it reads off the
     same plan every other row on this screen does. See documentStepsInPlan for the measurement. */
  const unverifiedDocumentSteps = documentStepsInPlan(directTaskPlan);
  /* THE OCCLUSION THIS SCREEN SHIPPED WITH: the branch below leads with the first standing
     non-question attention task, and the metadata-refresh panel, the ONLY control on this screen
     that starts the managed re-read, renders only when no such task stands. Measured live on the
     Mytos Lever packet, 2026-08-28 (application 55de7c9e): a stale withheld-press sentence about an
     answer that had since been re-answered stood in front of the panel indefinitely, so every save
     landed back on this screen with the launch hidden behind the very report it would replace.
     metadataRefreshOutranksStandingAttention is the fail-closed domain decision for when the panel
     may lead instead: acknowledged passing audit, metadata_refresh route, unknown-only attention,
     no stall, no open unverified submission, no document or captcha row. Nothing stored changes,
     nothing is acknowledged for her, and the run only starts on her own press of the panel's
     button. */
  const currentNonQuestionTask = standingNonQuestionTask !== null
    && metadataRefreshOutranksStandingAttention(attentionReview, packetEvidenceReviewed, {
      company: packet.job_context.company,
      role: packet.job_context.role,
      documents: submission.documents,
    })
    ? null
    : standingNonQuestionTask;
  const currentMetadataBlocker = directTaskPlan.metadataBlockers[0] ?? null;
  const defaultDirectPromptFingerprint = remainingDirectQuestions[0]
    ? directQuestionPromptFingerprint(remainingDirectQuestions[0])
    : directQuestionTasks.at(-1)
      ? directQuestionPromptFingerprint(directQuestionTasks.at(-1)!)
      : null;
  const requestedDirectPromptFingerprint = directProgress.cursorPromptFingerprint
    && directQuestionFingerprints.has(directProgress.cursorPromptFingerprint)
    ? directProgress.cursorPromptFingerprint
    : defaultDirectPromptFingerprint;
  const currentDirectQuestionIndex = directQuestionTasks.findIndex((task) => (
    directQuestionPromptFingerprint(task) === requestedDirectPromptFingerprint
  ));
  /* Follow-up work never silently replaces the question navigator. The final accepted question is
     still the applicant's place in this flow, including its Previous control; Review application is
     the explicit transition to the existing packet and follow-up path. */
  const currentDirectQuestion = directQuestionTasks[currentDirectQuestionIndex] ?? null;
  const currentDirectPromptFingerprint = currentDirectQuestion
    ? directQuestionPromptFingerprint(currentDirectQuestion)
    : null;
  const currentDirectAnswerDraft = currentDirectPromptFingerprint
    ? directAnswerDrafts.get(currentDirectPromptFingerprint) ?? null
    : null;
  const directRecoveryDraft = [...directAnswerDrafts.values()].find((draft) => (
    !directQuestionFingerprints.has(draft.promptFingerprint)
  )) ?? null;
  const directRecoveryNeeded = directRecoveryDraft !== null;
  const directAnswerActive = needsAttention && !awaitingUnverifiedSubmission && currentDirectQuestion !== null;
  const directQuestionTotal = Math.max(
    directProgress.total,
    directQuestionTasks.length,
  );
  const directQuestionPosition = currentDirectQuestionIndex >= 0 ? currentDirectQuestionIndex + 1 : 1;
  const currentDirectQuestionSaved = currentDirectPromptFingerprint !== null
    && answeredQuestionFingerprints.has(currentDirectPromptFingerprint);

  async function saveCurrentDirectQuestion(questionId: string, answer: string, intent: DirectQuestionTaskIntent, promptFingerprint: string, taskFingerprint: string, task: DirectQuestionTask): Promise<DirectAnswerSaveResult> {
    const result = await onSaveQuestion(questionId, answer, intent, promptFingerprint, taskFingerprint, task);
    if (!result.saved) return result;
    if (!result.mayAdvance) return result;
    if (!result.promptFingerprint) {
      return { saved: false as const, message: "Litos saved the answer but could not match the next employer field. Review the updated application packet." };
    }
    return result;
  }
  async function skipCurrentDirectQuestion(questionId: string, intent: DirectQuestionTaskIntent, promptFingerprint: string, taskFingerprint: string, task: DirectQuestionTask): Promise<DirectAnswerSaveResult> {
    const result = await onSkipQuestion(questionId, intent, promptFingerprint, taskFingerprint, task);
    if (!result.saved) return result;
    if (!result.mayAdvance) return result;
    if (!result.promptFingerprint) {
      return { saved: false as const, message: "Litos saved the answer but could not match the next employer field. Review the updated application packet." };
    }
    return result;
  }
  const completedItems = completedSubmissionGroups(review);
  /* What this application already carries, as far as the snapshot on screen knows.
   *
   * ABSENT IS THE ORDINARY STATE OF THIS FIELD, which is the whole reason the gate below does not
   * read it as an answer. `documents` rides on GET /applications/:id/submission and on nothing else:
   * the board seed selectPacket builds carries it only when the row already stored a mark, and every
   * other envelope this page installs (submit-request, submission/approve, handoff-complete,
   * security-code) omits the key entirely. So its absence says "this envelope did not carry it", not
   * "a run looked and found nothing". */
  const documentMarks = submission.documents;
  /* EVERY ask and EVERY stored file, one control each, resolved per kind by documentControls.
   *
   * This was a `find` for the first outstanding ask plus a whole-screen `!outstandingDocumentAsk`
   * guard on the reopen control, which made one kind's state decide another kind's control: with a
   * transcript attached and a second kind still outstanding, the attached transcript's control
   * vanished. On ready_for_final_approval there is no Your turn panel, so that control row is the
   * only place this screen can reopen the modal, and "Remove this file" lives inside it. A file
   * Litos is storing lost its way out because a different file had not arrived yet, while /privacy
   * publishes "we keep it until you remove it".
   *
   * See features/applications/domain/submission-checklist.ts for why `attached` is read off the
   * marks rather than the asks. */
  const {
    outstanding: outstandingDocumentAsks,
    ordered: orderedDocumentAsks,
    undeliverable: undeliverableDocumentAsks,
    attached: attachedDocumentKinds,
  } = documentControls(review.required_documents, documentMarks, review);
  /* THE MEASUREMENT THE BACKEND SHIPPED AND THIS SCREEN READ NOWHERE.
   *
   * `transcript_supported` is written on both prepare paths and rides on every submission envelope,
   * and until it reached documentControls the only reader of it was its own type declaration. An
   * employer's form asked for a transcript, the run found no control it could put one in, the
   * student uploaded a file, the ask cleared, and the send went out reporting the document handled.
   * The file had attached to nothing.
   *
   * These asks therefore go on blocking after a file is stored, which is the one place this term
   * departs from the outstanding one. A settled row means Litos is holding her file; it has never
   * meant the employer received it, and letting the row suppress the employer's own blocker is
   * exactly the substitution that made the send dishonest. Tri-state throughout: `undefined` is
   * every packet prepared before the measurement existed and blocks nothing. */
  const documentsLitosCannotDeliver = orderedDocumentAsks.length > 0 || undeliverableDocumentAsks.length > 0;
  /* THE EIGHTH TERM, CLOSED UNTIL AN ATTACHMENT OPENS IT.
   *
   * It read `documentMarks !== undefined && outstandingDocumentAsks.length > 0`, which handed the
   * ABSENCE of the marks map the power to open the gate. That absence is routine, not exceptional:
   * see the comment on documentMarks above. Re-entering an application with a measured, outstanding,
   * unattached ask therefore left "Send it" green for the 2.5 seconds until the first poll landed,
   * and a student who pressed inside that window sent an application the employer's own form had
   * already recorded as missing a required file. The seeding that closed the old blind window in one
   * direction opened this one in the other.
   *
   * THE TRI-STATE IS `required_documents`, not the marks, exactly as it is `cover_letter_required`
   * for the letter and for the same reason. Undefined means no run has measured this form and
   * nothing here can block; an empty list means a run measured it and the employer asked for
   * nothing; only a present, non-empty ask blocks. An unmeasured form is therefore never caught by
   * this term, so no backend that declines to write the field can strand a send. What CLEARS a
   * measured ask is a mark with `attached_at` and nothing else: `ordered_at` deliberately does not,
   * because Litos cannot make a registrar mail a sealed copy, and a missing marks map does not,
   * because "the envelope did not say" is not "she has attached it".
   *
   * IT SHIPS WITH ITS OWN EXIT, which is what stops a closed default becoming a trap: every
   * outstanding ask draws its own Add control in the row beside Send it, and its own sentence below.
   * A measured ask that stays outstanding is an application the employer's form will refuse, so the
   * grey button is the honest one. */
  const transcriptPending = outstandingDocumentAsks.length > 0 || documentsLitosCannotDeliver;
  const educationDriftWarning = educationDriftMessage(educationDrift(packet.spec, educationProfile));
  const educationProfilePending = educationProfileStatus !== "ready";
  const sensitiveQuestionPresent = review.questions.some((question) => requiresSensitiveQuestionReview(question.question, question.answer));
  const [previewState, setPreviewState] = useState<{ url: string; loaded: boolean; failed: boolean } | null>(null);
  /* Bumps the screenshot URL past the browser's cached failure, so Try loading it again is a real
     retry rather than an instant replay of the same error. */
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const previewUrl = review.preview_screenshot_url ?? "";
  const previewLoaded = Boolean(previewUrl) && previewState?.url === previewUrl && previewState.loaded;
  const previewFailed = Boolean(previewUrl) && previewState?.url === previewUrl && previewState.failed;
  const previewReady = Boolean(previewUrl) && previewLoaded && !previewFailed;
  /* A deadline passing raises no event, so this term needs a clock of its own rather than borrowing
     the submission poll's re-render. Seeded from the first render and stepped on a self-rescheduling
     timeout; the repo bans setInterval. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      setNowMs(Date.now());
      timer = window.setTimeout(tick, HANDOFF_CLOCK_TICK_MS);
    };
    timer = window.setTimeout(tick, HANDOFF_CLOCK_TICK_MS);
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, []);
  const handoffExpired = handoffWindowExpired(review, nowMs);
  /* `transcriptPending` is appended AFTER `restarting` rather than inserted anywhere inside. Two
     suites read this expression as a literal, one of them requiring `|| handoffExpired ||` with a
     term on each side, and both exist because a gate term silently dropped from here is a button
     offering a send the server refuses. Appending is the one edit that cannot reorder a pinned
     neighbour.

     `!packetEvidenceReviewed` arrived on main from the exact-packet-audit branch the day before
     this one, prepended at the head for the same reason in reverse. Both terms survive the merge:
     they block on unrelated facts, neither implies the other, and a resolution that kept one end of
     this line and dropped the other would have re-opened a real employer send. That is what the
     whole-expression pin in tests/application-submission-gate.test.mjs is for. */
  const finalApprovalBlocked = !packetEvidenceReviewed || educationProfilePending || Boolean(educationDriftWarning) || coverLetterPending || requiredAnswerMissing || sensitiveQuestionPresent || !previewReady || handoffExpired || approving || restarting || transcriptPending;
  function approveVerifiedPreview() {
    if (finalApprovalBlocked) return;
    onApprove();
  }
  /* The unverified-send choice is consequential and depends on this exact proof. Its evidence is
     first in DOM order so mobile, tablet, keyboard, and screen-reader users inspect it before the
     yes/no controls. Desktop keeps the familiar action-left, evidence-right composition. */
  const filledFormEvidence = (
    <Card className={`overflow-hidden ${awaitingUnverifiedSubmission ? "lg:order-2" : ""}`}>
      <div id="live-company-page" className="border-b border-border px-5 py-4"><p className="text-sm font-medium text-ink">{canFinishInDashboard ? "Finish the company page here" : "What the form looked like after we filled it in"}</p></div>
      {canFinishInDashboard && handoffUrl ? (
        <iframe
          src={handoffUrl}
          title="Live company application page"
          className="h-[72vh] min-h-[560px] w-full bg-white"
          allow="clipboard-read; clipboard-write"
        />
      ) : review.preview_screenshot_url ? (
        previewFailed ? (
          <div className="p-10 text-center">
            <p className="text-sm text-warn">The preview of the filled form did not load.</p>
            {/* If it keeps failing, the screenshot itself is gone and only a fresh fill
                regenerates it, so the recovery path stays stated. */}
            <p className="mt-1 text-xs text-muted">If it will not load, fill the form again to take a new picture.</p>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => {
                setPreviewAttempt((attempt) => attempt + 1);
                setPreviewState(null);
              }}
            >
              Try loading it again
            </Button>
          </div>
        ) : (
          <img
            /* Remounting is the retry: the key change forces a fresh request without touching the
               URL, which may be signature-protected and must be replayed byte-identical. */
            key={`${previewUrl}:${previewAttempt}`}
            src={review.preview_screenshot_url}
            alt="The company's application page after Litos filled it in"
            className="h-auto w-full"
            onLoad={() => setPreviewState({ url: previewUrl, loaded: true, failed: false })}
            onError={() => setPreviewState({ url: previewUrl, loaded: false, failed: true })}
          />
        )
      ) : <div className="p-10 text-center text-sm text-muted">
          {/* THIS CARD ONLY RENDERS ONCE THE RUN HAS STOPPED (the live view owns the filling
              states), so a missing picture here is one that was never saved, not one still being
              taken. Measured 2026-09-01 on Zeus, DSI Innovations, Jump Trading and TixTrack: every
              stopped run showed "still taking the picture" under a Stopped card, forever. */}
          {/* awaiting_security_code reaches this card too and is not a stopped attempt: the form is
              with the employer and the next step is the emailed code, never Try again. */}
          {review.status === "ready_for_final_approval" || review.status === "awaiting_security_code"
            ? "Litos did not save a picture of the filled form this time."
            : "This attempt stopped before Litos took a picture of the form. Try again and it will take one."}
        </div>}
    </Card>
  );
  return (
    <div className={`mx-auto grid gap-5 ${needsAttention && !awaitingUnverifiedSubmission ? "max-w-3xl" : "max-w-5xl lg:grid-cols-[1fr_1.15fr]"}`}>
      {awaitingUnverifiedSubmission && filledFormEvidence}
      <Card className={`${needsAttention && !awaitingUnverifiedSubmission ? "p-4 sm:p-6" : "p-7"} ${awaitingUnverifiedSubmission ? "lg:order-1" : ""}`}>
        {directRecoveryNeeded && (
          <div role="alert" className="mb-5 rounded-inner border border-border bg-surface-alt p-4">
            <p className="text-small font-medium text-ink">This employer field changed before your answer was saved.</p>
            <p className="mt-2 text-small leading-6 text-danger">
              {directAnswerFailure?.message ?? "Review the current application state before using this answer."}
            </p>
            <div className="mt-3 rounded-inner border border-border bg-surface px-3 py-3">
              <p className="font-mono text-label uppercase tracking-[0.08em] text-muted">Unsaved answer</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-small leading-6 text-ink">
                {directRecoveryDraft?.answer || "No answer was entered."}
              </p>
            </div>
          </div>
        )}
        {directAnswerActive ? (
          <DirectApplicationQuestion
            key={directQuestionTaskFingerprint(currentDirectQuestion)}
            task={currentDirectQuestion}
            position={directQuestionPosition}
            total={Math.max(1, directQuestionTotal)}
            saving={savingAnswer}
            saved={currentDirectQuestionSaved}
            focusToken={directProgress.navigationToken}
            hasPrevious={currentDirectQuestionIndex > 0}
            hasNext={currentDirectQuestionIndex >= 0 && currentDirectQuestionIndex < directQuestionTasks.length - 1}
            preservedDraft={currentDirectAnswerDraft}
            externalFailure={directAnswerFailure?.promptFingerprint === currentDirectPromptFingerprint ? directAnswerFailure : null}
            onDraftChange={onDirectAnswerDraftChange}
            onClearDraft={onClearDirectAnswerDraft}
            onClearFailure={onClearDirectAnswerFailure}
            onPrevious={() => {
              const previous = directQuestionTasks[currentDirectQuestionIndex - 1];
              if (previous) onNavigateDirectQuestion(directQuestionPromptFingerprint(previous));
            }}
            onNext={() => {
              const next = directQuestionTasks[currentDirectQuestionIndex + 1];
              if (next) onNavigateDirectQuestion(directQuestionPromptFingerprint(next));
            }}
            onReviewApplication={onQuestionsFinished}
            onSave={saveCurrentDirectQuestion}
            onSkip={skipCurrentDirectQuestion}
          />
        ) : (
          <>
            {directProgress.lastSavedPromptFingerprint && needsAttention && !awaitingUnverifiedSubmission && (
              <p className="font-mono text-label font-medium uppercase tracking-[0.08em] text-teal-ink">
                Answer saved to this application
              </p>
            )}
            <h2 className={`${directProgress.lastSavedPromptFingerprint && needsAttention && !awaitingUnverifiedSubmission ? "mt-3" : ""} text-heading font-medium text-ink`}>
              {awaitingSecurityCode
                ? "One code away"
                : awaitingUnverifiedSubmission
                  ? "Waiting on you to look"
                  : needsAttention
                    ? currentNonQuestionTask
                      ? "One thing to finish"
                      : directTaskPlan.metadataBlockers.length > 0
                      ? "One field needs a fresh read"
                      : "One thing to finish"
                    : review.status === "failed" ? "Stopped" : "Review"}
            </h2>
            {needsAttention && !awaitingUnverifiedSubmission && (
              <p className="mt-2 max-w-2xl text-body text-muted">
                {!currentNonQuestionTask && directTaskPlan.metadataBlockers.length > 0
                  ? "Litos needs the employer's exact wording or choices before it can ask you for a safe answer."
                  : "Complete this step to keep the application moving."}
              </p>
            )}
            {awaitingUnverifiedSubmission ? null : needsAttention ? (
              currentNonQuestionTask ? (
                <BlockerList items={[currentNonQuestionTask]} portalUrl={staysInsideLitos || attendedHandoffUrl ? undefined : handoffUrl ?? portalUrl} onRestartInLitos={onReviewPacket} onOpenQuestion={onOpenQuestion} onChooseOption={onChooseOption} onAddDocument={onAddDocument} onToggleAcknowledged={onToggleAcknowledged} tickingIds={attentionTicking} />
              ) : directTaskPlan.metadataBlockers.length > 0 ? (
                <div className="mt-6 border-t border-border pt-6">
                  <p className="text-small font-medium text-ink">
                    {directTaskPlan.metadataBlockers[0]?.question
                      ? displayQuestionLabel(directTaskPlan.metadataBlockers[0].question)
                      : "Employer question not readable"}
                  </p>
                  {currentMetadataBlocker?.kind === "unsupported_multi_value" ? (
                    <>
                      <p className="mt-2 text-small leading-6 text-muted">
                        This employer accepts more than one selection. Litos will not reduce it to one answer.
                      </p>
                      <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                        {canFinishInDashboard ? (
                          <ButtonLink href="#live-company-page" block className="sm:w-auto">
                            Answer in this dashboard
                          </ButtonLink>
                        ) : attendedHandoffUrl ? (
                          <Button onClick={() => void openAttendedHandoff()} disabled={attendedHandoffState === "preparing"} block className="sm:w-auto">
                            {attendedHandoffState === "preparing" ? "Checking extension..." : "Open exact company form"}
                          </Button>
                        ) : !staysInsideLitos && (handoffUrl ?? portalUrl) ? (
                          <ButtonLink href={(handoffUrl ?? portalUrl)!} target="_blank" rel="noreferrer" block className="sm:w-auto">
                            Answer on company page
                          </ButtonLink>
                        ) : (
                          <Button onClick={onReviewPacket} block className="sm:w-auto">Review application</Button>
                        )}
                        <p className="text-label leading-5 text-muted">Your other answers stay saved in Litos.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-small leading-6 text-muted">
                        Litos will reread the current company form and only show an answer control when it knows what the employer accepts.
                      </p>
                      <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                        <Button
                          onClick={onRefreshQuestionMetadata}
                          disabled={questionMetadataRefreshing || questionMetadataRefreshDisabled}
                          aria-busy={questionMetadataRefreshing}
                          block
                          className="sm:w-auto"
                        >
                          {questionMetadataNeedsPacketReview
                            ? "Review packet first"
                            : questionMetadataRefreshing
                              ? <PendingLabel onColor>Reading company form...</PendingLabel>
                              : "Review and fill again"}
                        </Button>
                        <p className="text-label leading-5 text-muted">
                          Litos never turns an unread employer field into a guessed text box.
                        </p>
                      </div>
                    </>
                  )}
                  {questionMetadataRefreshError && (
                    <p role="alert" className="mt-3 text-small leading-6 text-danger">{questionMetadataRefreshError}</p>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-small leading-6 text-muted">Review the application packet before Litos fills the company form again.</p>
              )
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted">
                {review.status === "failed"
                  ? failedPacketAuditStale
                    ? "The exact company form changed. Review the current packet before Litos tries again."
                    : userFacingError(review.submission_error, "Try again in a minute.")
                  : awaitingSecurityCode
                    ? "This one is with the employer already. It needs the code they emailed before it counts as filed."
                    : "Check the preview, then send."}
              </p>
            )}
          </>
        )}
        {!directAnswerActive && <>
        {awaitingSecurityCode && (
          <SecurityCodeCard
            review={review}
            submitting={securityCodeSubmitting}
            error={securityCodeError}
            onSubmitCode={onSubmitSecurityCode}
          />
        )}
        {awaitingUnverifiedSubmission && (
          <UnverifiedSubmissionCard
            attentionReason={safeAttentionReason}
            submitting={unverifiedSubmissionSubmitting}
            error={unverifiedSubmissionError}
            onSubmitOutcome={onSubmitUnverifiedOutcome}
          />
        )}
        {/* THE ONE STEP THAT SURVIVES THE UNVERIFIED-SUBMISSION MODE.
         *
         * Measured on 2026-09-03 across two packets of one account, both needs_attention, both
         * carrying the same measured `required_documents: [transcript]` and `transcript_supported`.
         * The Databricks packet drew "Databricks needs your transcript" with a REQUIRED badge and a
         * working Add transcript control. The Verkada packet was in this mode, and every branch
         * above keyed on `!awaitingUnverifiedSubmission` - the panel at the top of this card, the
         * completed-checks list, Open packet review, Try again, the handoff controls, and the Add
         * pills beside Send - so the whole screen collapsed to the two raw attention sentences and
         * a yes/no. The screen stated a requirement and offered nothing that could meet it.
         *
         * SUPPRESSING THE REST IS STILL RIGHT. Litos may already have reached this employer, so
         * Try again and Review and fill wait for her answer rather than risk a second application.
         * A document row is the one outstanding row whose control sends nothing at all: it writes
         * `spec._documents` and the file goes nowhere until a send she presses. See
         * isDocumentChecklistItem for the distinction, held in one place so this list and the
         * metadata-refresh decision cannot drift apart.
         *
         * It is also work she owes WHICHEVER WAY SHE ANSWERS. "It is not there" releases the claim
         * and the next run needs the file; "I found it there" ends the application and takes the row
         * with it. So there is no answer that makes this step go away unasked, and no reading of the
         * two buttons that resolves it.
         *
         * Rendered through the SAME BlockerList the ordinary panel uses, off the same plan, so this
         * is one more caller of the step mechanism rather than a second surface with its own copy.
         * `portalUrl` is deliberately omitted: an open-page link belongs to the suppressed controls,
         * and a document row does not use one. */}
        {awaitingUnverifiedSubmission && unverifiedDocumentSteps.length > 0 && (
          <BlockerList
            items={unverifiedDocumentSteps}
            onAddDocument={onAddDocument}
            onToggleAcknowledged={onToggleAcknowledged}
            tickingIds={attentionTicking}
          />
        )}
        {review.status === "ready_for_final_approval" && educationDriftWarning && (
          <div role="alert" className="mt-4 rounded-inner bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">
            <p>{educationDriftWarning}</p>
            <Button onClick={onCheckResume} size="sm" className="mt-3">Check resume</Button>
          </div>
        )}
        {review.status === "ready_for_final_approval" && educationProfilePending && (
          <p role="alert" className="mt-4 rounded-inner bg-warn-soft px-4 py-3 text-sm leading-6 text-warn">
            {educationProfileStatus === "loading"
              ? "Litos is checking this resume against your current profile before it can be sent."
              : "Litos could not check this resume against your current profile. Reload, then review it again before sending."}
          </p>
        )}
        {review.status === "ready_for_final_approval" && !packetEvidenceReviewed && (
          <div role="alert" className="mt-4 rounded-inner bg-warn-soft px-4 py-3 text-sm leading-6 text-warn">
            <p>Review the exact resume beside the job description and its evidence colours before sending.</p>
            <Button onClick={onCheckResume} size="sm" className="mt-3">Check packet</Button>
          </div>
        )}
        {completedItems.length > 0 && (
          needsAttention && !awaitingUnverifiedSubmission ? (
            <details className="group mt-4 border-t border-border pt-4">
              <summary className="-mx-2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-inner px-2 text-small text-ink [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center text-positive">
                    <svg viewBox="0 0 16 16" className="h-4 w-4">
                      <path d="M4 8.5l2.5 2.5L12 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="font-medium">{completedItems.length} {completedItems.length === 1 ? "check" : "checks"} already complete</span>
                </span>
                <span className="shrink-0 font-mono text-label uppercase tracking-[0.08em] text-muted group-open:hidden">Show</span>
                <span className="hidden shrink-0 font-mono text-label uppercase tracking-[0.08em] text-muted group-open:inline">Hide</span>
              </summary>
              <ul className="mt-2 grid gap-2 border-l border-border pl-8 sm:grid-cols-2">
                {completedItems.slice(0, 12).map((item) => <ChecklistRow key={item.id} item={item} checked />)}
              </ul>
            </details>
          ) : (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-positive">Done</p>
                <p className="font-mono text-[11px] text-positive">Complete</p>
              </div>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {completedItems.slice(0, 12).map((item) => <ChecklistRow key={item.id} item={item} checked />)}
              </ul>
            </div>
          )
        )}
        {submission.cover_letter && review.cover_letter_supported !== false && (
          <div className="mt-6 rounded-inner border border-border bg-surface-alt p-4">
            <p className="text-xs font-medium text-muted">Cover letter</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink">{submission.cover_letter.body}</p>
            {submission.cover_letter.warnings.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-warn">
                {submission.cover_letter.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </div>
        )}
        {/* Says what is true and blocks nothing. The employer's form offers a cover letter and does
            not ask for one, so the application is complete without it and the send stays live. */}
        {coverLetterState === "optional" && (
          <p className="mt-6 text-sm leading-6 text-muted">This company accepts a cover letter and does not require one. Litos will send this without a cover letter. You can write one from the packet if you want it attached.</p>
        )}
        {coverLetterState === "loading" && <p className="mt-6 text-sm text-muted">Loading cover letter.</p>}
        {coverLetterState === "unavailable" && (
          <div role="alert" className="mt-6 rounded-inner bg-warn-soft px-4 py-3 text-sm leading-6 text-warn">
            <p>This company takes a cover letter and Litos does not have one to show you, so it cannot send this yet. Fetch it again, or write it yourself and come back.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={onReloadCoverLetter} disabled={coverLetterReloading} size="sm">{coverLetterReloading ? "Fetching..." : "Fetch it again"}</Button>
              <Button onClick={onWriteCoverLetter} variant="secondary" size="sm">Write it yourself</Button>
            </div>
          </div>
        )}
        {review.status === "ready_for_final_approval" && (
          <div className="mt-6 rounded-inner border border-border bg-surface-alt p-4">
            <p className="text-xs font-medium text-muted">Resume</p>
            <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-inner border border-border bg-white p-2">
              <ResumePaper spec={stripMetadata(packet.spec)} name={contactName(packet.spec)} contact={contactLine(packet.spec)} />
            </div>
            {packet.download_url && packet.download_url !== "#" && (
              <a href={packet.download_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-medium text-brand-ink underline-offset-2 hover:underline">
                Open exact PDF
              </a>
            )}
          </div>
        )}
        {review.status === "ready_for_final_approval" && review.questions.length > 0 && (
          <div className="mt-6 rounded-inner border border-border bg-surface-alt p-4">
            <p className="text-xs font-medium text-muted">Answers</p>
            {/* ph-no-capture: same reasoning as the equivalent list in ApplicationPacket.tsx -
                answers here can carry EEO self-identification, visa status, and other free-text
                personal answers (Mehek, 2026-08-27). */}
            <div className="ph-no-capture mt-3 divide-y divide-border overflow-hidden rounded-inner border border-border bg-surface">
              {review.questions.map((question) => (
                <div key={question.id} className="px-3 py-3">
                  <p className="text-xs font-medium leading-5 text-ink">{displayQuestionLabel(question.question)}</p>
                  <p className={`mt-1 whitespace-pre-line text-xs leading-5 ${question.required && !(question.answer ?? "").trim() ? "text-warn" : "text-muted"}`}>
                    {(question.answer ?? "").trim() || (question.required ? "Left blank, and this one is required" : "Left blank")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {review.verification?.status === "completed" && (
          <div className="mt-4 rounded-inner border border-border bg-surface-alt px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-teal-ink">Code found</p>
          </div>
        )}
        {review.verification?.status === "handoff" && (
          <div className="mt-4 rounded-inner border border-border bg-surface px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">The code needs you</p>
            <p className="mt-1 text-xs text-muted">
              Litos was not sure it finished this step. Finish it in the browser panel here when it is available, or open the company page.
            </p>
          </div>
        )}
        {attendedHandoffUrl && (
          <div className="mt-4 rounded-inner border border-border bg-surface-alt px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Continue in Chrome</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Litos will verify this account, bind the exact saved packet to the company&rsquo;s one-click form, and refill it before you review and submit.
            </p>
            {manualTrialPacket && (
              <div className="mt-3 rounded-inner border border-border bg-surface px-3 py-3 text-xs leading-5 text-muted">
                <p className="font-medium text-ink">Manual dashboard trial</p>
                <p className="mt-1">Use this exact frozen resume and the separate Litos routing email if the published extension is still waiting for store approval. The PDF keeps your personal resume email.</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <a href={manualTrialPacket.pdf.download_url} target="_blank" rel="noreferrer" className="font-medium text-brand-ink underline-offset-2 hover:underline">
                    Open exact PDF
                  </a>
                  <span className="text-[11px] text-ink">
                    Resume email: <span className="font-mono">{manualTrialPacket.packet_audit.identities.resume_email}</span>
                  </span>
                  <span className="text-[11px] text-ink">
                    Portal routing email: <span className="font-mono">{manualTrialPacket.packet_audit.identities.applicant_email}</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        {needsAttention && !awaitingUnverifiedSubmission && !canFinishInDashboard && !attendedHandoffUrl && (
          <div className="mt-4 rounded-inner border border-border bg-surface-alt px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{staysInsideLitos ? "Restart inside Litos" : "No live browser to reopen"}</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {staysInsideLitos
                ? "Litos can run this company form again from your saved resume and answers. Open packet review to check them and start the fill again. You do not need the company site."
                : "This stop came from a managed run or a pre-fill gate, so Litos only has the filled preview and the blocker list here. Open the company page once, finish the check, then mark it done."}
            </p>
          </div>
        )}
        <div className="mt-7 flex flex-wrap gap-2">
          {canFinishInDashboard && <ButtonLink href="#live-company-page">Finish in this dashboard</ButtonLink>}
          {attendedHandoffUrl && (
            <>
              <Button onClick={() => void openAttendedHandoff()} disabled={attendedHandoffState === "preparing"}>
                {attendedHandoffState === "preparing" ? "Checking extension..." : "Open exact company form"}
              </Button>
              {manualTrialPacket && (
                <Button onClick={() => void openManualAttendedHandoff()} disabled={attendedHandoffState === "preparing"} variant="secondary">
                  {attendedHandoffState === "preparing" ? "Rechecking packet..." : "Open manually"}
                </Button>
              )}
            </>
          )}
          {needsAttention && !staysInsideLitos && handoffUrl && !attendedHandoffUrl && <ButtonLink href={handoffUrl} target="_blank" rel="noreferrer" variant={canFinishInDashboard ? "secondary" : "primary"}>Open in new tab</ButtonLink>}
          {needsAttention && !staysInsideLitos && !handoffUrl && !attendedHandoffUrl && portalUrl && <ButtonLink href={portalUrl} target="_blank" rel="noreferrer" variant="secondary">Open company page</ButtonLink>}
          {/* ONE primary in this row, counted across every control the row can render. The
              external-recovery controls above (Finish in this dashboard, Open exact company form,
              Open in new tab) default to primary, so whenever one of them is present the two
              review controls both demote; otherwise the primary is the control the current task
              resolves through. */}
          {hasQuestionsToReview && <Button onClick={onReviewQuestions} variant={rowExternalPrimary || (needsAttention && currentNonQuestionTask) ? "secondary" : "primary"}>Check the answers</Button>}
          {/* The audited re-run. "Try again" replays submit-request against the LAST acknowledged
              packet, and any saved answer since then changes packet_version, so on exactly the rows
              this screen exists for it answers 409 packet_stale forever. The review screen owns the
              fresh audit, the exact-PDF gate and the acknowledged send, and needs_attention rows had
              no route to it: measured on Belvedere 2026-08-18, where every exit from this screen was
              a stale retry. */}
          {/* None of these four replay or resolve anything while the claim is still on the row for
              an unverified send - submit-request would just answer the same 409 again - so they wait
              for UnverifiedSubmissionCard's yes/no to release it first. */}
          {needsAttention && !awaitingUnverifiedSubmission && <Button onClick={onReviewPacket} variant={!rowExternalPrimary && (!hasQuestionsToReview || currentNonQuestionTask) ? "primary" : "secondary"}>Open packet review</Button>}
          {needsAttention && !awaitingUnverifiedSubmission && <Button onClick={onRetry} variant="secondary">Try again</Button>}
          {/* The synced-fill recovery: the extension reads the SAME reviewed answers this managed
              run already produced (handoff-packet.ts on the extension side), so nothing here
              regenerates or re-syncs anything - it opens the employer's page with those answers
              ready to place, and she solves whatever check stopped the managed run herself.

              disabled and errored through their own props rather than reusing canonicalFillError:
              that state is only read inside CanonicalApplicationDetail, a screen this button does
              not live on, so a failure here (blocked pop-up, extension not installed, a failed
              /applications call) would otherwise fail with no visible feedback at all. */}
          {captchaBlockedLastAttempt && (
            <Button onClick={onOpenWithExtension} variant="secondary" disabled={extensionFillBusy}>
              {extensionFillBusy ? "Checking extension..." : "Open and fill with extension"}
            </Button>
          )}
          {needsAttention && !awaitingUnverifiedSubmission && submission.handoff_url && <Button onClick={() => onHandoffComplete("cleared")} variant="secondary">I cleared the check</Button>}
          {needsAttention && !awaitingUnverifiedSubmission && submission.handoff_url && <Button onClick={() => onHandoffComplete("submitted")} variant="secondary">I submitted it myself</Button>}
          {review.status === "failed" && (failedPacketAuditStale
            ? <Button onClick={onReviewPacket}>Open packet review</Button>
            : <Button onClick={onRetry}>Try again</Button>)}
          {review.status === "ready_for_final_approval" && educationDriftWarning && <Button onClick={onCheckResume} variant="secondary">Check resume</Button>}
          {/* A REAL <button>, from the shared component, and that is not a stylistic preference on
              this screen. Seventy-nine prepared resumes and zero sent applications came out of pills
              rendered as <span> with nothing bound to them: a control that looks pressable and has
              no handler fails silently and looks exactly like a working one. `Button` renders
              `<button type="button">` and takes onClick and disabled directly, so there is no shape
              here that can go dead. */}
          {review.status === "ready_for_final_approval" && handoffExpired && (
            <Button onClick={onRestart} disabled={restarting} variant="secondary">{restarting ? "Starting it again..." : "Start it again"}</Button>
          )}
          {/* The way out of the eighth reason, one control per outstanding ask. On this status there
              is no Your turn panel, so without these the greyed Send would name a blocker with
              nothing on screen that resolves it, which is the shape of every defect this screen has
              been fixed for. Mapped rather than picking the first ask: two outstanding kinds are two
              separate pieces of work and a single button can only ever open one of them. */}
          {review.status === "ready_for_final_approval" && outstandingDocumentAsks.map((ask) => (
            <Button key={ask.kind} onClick={() => onAddDocument(ask.kind)} variant="secondary">Add {ask.kind}</Button>
          ))}
          {/* An ask she has answered with "I have ordered it" keeps a control, because plenty of
              employers write "official" and take the downloaded PDF, and the modal's own second door
              is the one this opens. It is worded differently from the row above so the two buttons
              are not the same offer twice: that one is the file this form is waiting for, this one is
              the copy she may not need to give. */}
          {review.status === "ready_for_final_approval" && orderedDocumentAsks.map((ask) => (
            <Button key={ask.kind} onClick={() => onAddDocument(ask.kind)} variant="secondary">Add an unofficial {ask.kind}</Button>
          ))}
          {/* And the way BACK to a file that is already attached, which this row had no control for
              at all. Nothing here is blocked any more, so it is quiet rather than secondary: it
              exists so the modal's "Remove this file" is still reachable a week later, not to
              suggest there is something left to do.

              Independent of every other kind, which it was not: gated on no ask being outstanding
              ANYWHERE, an attached transcript lost this control the moment a second kind was asked
              for, and a file the product cannot delete makes /privacy's promise false. */}
          {review.status === "ready_for_final_approval" && attachedDocumentKinds.map((kind) => (
            <Button key={kind} onClick={() => onAddDocument(kind)} variant="quiet">Your {kind}</Button>
          ))}
          {/* THE CONTROL THAT FINISHES AN APPLICATION LITOS CANNOT.
              A registrar's sealed copy and a form with no upload control are the two things no
              button on this screen can produce, and both leave the send gate shut for good. The
              modal already told her "This application then finishes with you rather than with
              Litos"; before this there was nothing here that finished it, so the packet sat at
              ready_for_final_approval behind a grey Send button forever.
              The same words as the control on a stalled handoff above, because it is the same act
              and the server writes the same record for it. */}
          {review.status === "ready_for_final_approval" && documentsLitosCannotDeliver && (
            <Button onClick={onSelfSubmitted} variant="secondary">I submitted it myself</Button>
          )}
          {review.status === "ready_for_final_approval" && <Button onClick={approveVerifiedPreview} disabled={finalApprovalBlocked}>Send application</Button>}
        </div>
        {attendedHandoffState === "preparing" && (
          <p role="status" aria-live="polite" className="mt-3 text-xs leading-5 text-muted">
            Verifying the current Litos extension and saved application.
          </p>
        )}
        {attendedHandoffError && (
          <p role="alert" className="mt-3 text-xs leading-5 text-danger">{attendedHandoffError}</p>
        )}
        {extensionFillError && (
          <p role="alert" className="mt-3 text-xs leading-5 text-danger">{extensionFillError}</p>
        )}
        {/* Sibling of the alert rather than a child, for the same reason as ComposerRefusalNote:
            the paragraph above is pinned verbatim by captcha-extension-recovery. */}
        {messageAsksForTheExtension(extensionFillError) && <ExtensionStoreLink className="mt-2 inline-block text-xs" />}
        {/* The server's own answer to the last press, beside the button that made it. Never routed
            through the page banner: the poll clears that one, and this screen is long enough that a
            message at the top of it is off screen from the control it is about. */}
        {sendRefusal && (
          <div role="alert" className="mt-3 rounded-inner bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">
            <p>{sendRefusal.message}</p>
            {sendRefusal.issues.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                {sendRefusal.issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            )}
          </div>
        )}
        {review.status === "ready_for_final_approval" && educationDriftWarning && (
          <p className="mt-3 text-xs leading-5 text-warn">
            Save the resume first.
          </p>
        )}
        {review.status === "ready_for_final_approval" && educationProfilePending && (
          <p className="mt-3 text-xs leading-5 text-warn">
            Checking profile.
          </p>
        )}
        {review.status === "ready_for_final_approval" && !previewReady && (
          <p className="mt-3 text-xs leading-5 text-warn">
            Loading preview.
          </p>
        )}
        {/* The seventh reason, and the first one that the SERVER was already enforcing while this
            screen offered the action anyway. Says the same thing the 409 says, and says it before
            the press rather than after it. The control that resolves it is in the row above. */}
        {review.status === "ready_for_final_approval" && handoffExpired && (
          <p className="mt-3 text-xs leading-5 text-warn">
            Too much time has passed for Litos to finish this filled form, so it cannot be sent as it stands. Start it again and Litos will fill the company&rsquo;s page fresh.
          </p>
        )}
        {/* The cover letter was the ONE blocking term with no line here, so the greyed-out Send
            named every reason it was blocked except the one that was actually blocking it. */}
        {review.status === "ready_for_final_approval" && coverLetterState === "loading" && (
          <p className="mt-3 text-xs leading-5 text-warn">
            Loading cover letter.
          </p>
        )}
        {review.status === "ready_for_final_approval" && coverLetterState === "unavailable" && (
          <p className="mt-3 text-xs leading-5 text-warn">
            No cover letter to show you.
          </p>
        )}
        {review.status === "ready_for_final_approval" && requiredAnswerMissing && (
          <p className="mt-3 text-xs leading-5 text-warn">
            {optionalAnswerDecisionMissing ? "Answer or skip every optional question before sending." : "Required answer missing."}
          </p>
        )}
        {review.status === "ready_for_final_approval" && sensitiveQuestionPresent && (
          <p className="mt-3 text-xs leading-5 text-warn">
            A sensitive demographic, identity, or legal question is present. Leave it for the applicant before sending.
          </p>
        )}
        {/* The eighth reason, named the way the other seven are. Says which document and where the
            control is, because a blocker the student cannot act on is a wall.

            It used to say "the row above", meaning a Your turn row. There is never one: BlockerList
            renders only on needs_attention and this paragraph renders only on
            ready_for_final_approval, so the two cannot be on screen together and the sentence sent
            her looking for something that was not there. It names the button that IS on this screen,
            by the words printed on it and by what it sits next to.

            One sentence per outstanding ask, because each names its own button and there is one
            button per ask. A single sentence naming the first kind would be a screen with two Add
            controls on it explaining only one of them. */}
        {review.status === "ready_for_final_approval" && transcriptPending && outstandingDocumentAsks.map((ask) => (
          <p key={ask.kind} className="mt-3 text-xs leading-5 text-warn">
            This company asks for a {ask.kind} and Litos has none attached, so their form would refuse this. Press Add {ask.kind}, next to Send application, to attach one.
          </p>
        ))}
        {/* The eighth reason in its second shape: the ask is acknowledged and still unresolved.
            Nothing Litos can do moves this one, so the sentence names the two things that can and
            names them by the buttons beside it, rather than repeating a demand she has answered. */}
        {review.status === "ready_for_final_approval" && orderedDocumentAsks.map((ask) => (
          <p key={ask.kind} className="mt-3 text-xs leading-5 text-warn">
            You said you have ordered your official {ask.kind}. Litos cannot send a sealed copy from your registrar, so it cannot finish this one. Attach an unofficial copy if this company takes one, or send it on their page and press I submitted it myself.
          </p>
        ))}
        {/* THE MEASUREMENT SAID SO, AND THE SCREEN SAYS IT.
            The run looked at this form for somewhere to put the file and found nothing it could
            fill. Before this the student was told to press Add, she uploaded, the row cleared, and
            Send went green over an application whose document had attached to nothing. This
            sentence renders whether or not a file is stored, because a stored file is not a
            delivered one and the row that confirms the storage must not answer for the employer. */}
        {review.status === "ready_for_final_approval" && undeliverableDocumentAsks.map((ask) => (
          <p key={ask.kind} className="mt-3 text-xs leading-5 text-warn">
            This company asks for a {ask.kind} and their form has no upload Litos can fill, so a file added here would not reach them and Litos cannot finish this one. Add it on their page yourself, then press I submitted it myself.
          </p>
        ))}
        <p className="mt-5 text-xs leading-5 text-muted">Litos will never pretend to be you. It will not get past the puzzle that checks you are human, a code on your phone, a login, or anything you have to swear to. It only says an application is sent once the company confirms it.</p>
        </>}
      </Card>
      {!awaitingUnverifiedSubmission && !directAnswerActive && filledFormEvidence}
    </div>
  );
}

function SubmissionReceipt({ review, role, company }: { review: ApplicationReview; role: string; company: string }) {
  const receipt = review.receipt;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <CenteredState title="Sent" body={`${role} at ${company}`} />
      {receipt && <Card className="overflow-hidden">
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <div><p className="font-mono text-[11px] uppercase tracking-[0.08em] text-positive">Proof it was sent</p><p className="mt-2 text-sm leading-6 text-ink">{receipt.confirmation_text}</p></div>
          <dl className="space-y-3 text-sm"><div><dt className="text-xs text-muted">Captured</dt><dd className="text-ink">{new Date(receipt.captured_at).toLocaleString()}</dd></div>{receipt.reference_id && <div><dt className="text-xs text-muted">Reference</dt><dd className="font-mono text-ink">{receipt.reference_id}</dd></div>}<div><dt className="text-xs text-muted">Where it was sent</dt><dd><a href={receipt.final_url} target="_blank" rel="noreferrer" className="break-all text-brand-ink underline">Open confirmation</a></dd></div></dl>
        </div>
        {receipt.screenshot_url && <img src={receipt.screenshot_url} alt="The company's confirmation that the application arrived" className="h-auto w-full border-t border-border" />}
      </Card>}
    </div>
  );
}

function CenteredState({ title, body, loading = false }: { title: string; body?: string; loading?: boolean }) {
  return <Card className="mx-auto max-w-2xl p-12 text-center">{loading ? <div className="mx-auto flex h-16 w-16 items-center justify-center"><ThinkingOrb state="searching" size={64} /></div> : <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-positive-soft text-positive"><svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true"><path d="M4 8.5l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}<h2 className="mt-5 text-xl font-medium text-ink">{title}</h2>{body && <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{body}</p>}</Card>;
}

const CHECKLIST_ACTION_CLASS = "inline-flex min-h-11 w-fit items-center rounded-control border border-control-border bg-surface px-4 text-small font-medium text-ink transition-colors hover:border-ink hover:bg-surface-alt";
/* The same control on a row that is not asking for anything. Outlined rather than filled, because
   DESIGN.md's colour law is that weight says what a control IS and not how hard to press it, and a
   filled pill on a confirmation row puts the loudest thing on the panel next to the one item that
   needs nothing doing. Same 44px floor, same target, quieter voice. */
const CHECKLIST_SETTLED_ACTION_CLASS = "inline-flex min-h-11 w-fit items-center rounded-control border border-control-border bg-surface-alt px-4 text-small font-medium text-muted transition-colors hover:border-ink hover:text-ink";

/* The action pill was a <span>. Not a disabled button, not a button with a missing handler: a span
   with button styling, sitting under a row that says an application is
   waiting on this exact thing. Pressing REVIEW or CONFIRM fired no request, threw nothing, and
   changed nothing, because there was nothing there to fire. Reproduced on the Anduril packet on
   2026-08-08, and it is why an account with 79 prepared resumes has sent none: the panel names the
   work, and the only control it offers is decoration.

   Every pill now comes from checklistRowControl, which returns a real <a href> or a real <button>
   bound to onOpenQuestion, or NOTHING when there is no target to act on. There is no branch left
   that draws the word without the element. Each control also carries its own accessible name, so a
   screen reader hears "Confirm your answer to: will you require sponsorship ..." rather than the
   bare "button" read_page found on the live page. */
function ChecklistRow({ item, checked, portalUrl, onRestartInLitos, onOpenQuestion, onChooseOption, onAddDocument, onToggleAcknowledged, tickingIds }: { item: SubmissionChecklistItem; checked: boolean; portalUrl?: string; onRestartInLitos?: () => void; onOpenQuestion?: (questionId: string, intent?: SubmissionChecklistAction) => void; onChooseOption?: (questionId: string, option: string) => void; onAddDocument?: (kind: string) => void; onToggleAcknowledged?: (item: SubmissionChecklistItem, acknowledged: boolean) => void; tickingIds?: ReadonlySet<string> }) {
  const control = checked ? null : checklistRowControl(item, { portalUrl });
  /* THE CHECKBOX IS LIVE ONLY WHERE A TICK CAN BE STORED, which is the acknowledgeable rows - the
     attention blockers whose "done" only she can know - on a screen that passed a handler. Ticking
     writes through POST /applications/:id/review/attention-acks and the row re-renders settled from
     the stored review; unticking is the same box on the settled row, taking the tick back. Every
     other outstanding row used to draw this same checkbox DEAD: no handler, no state, no request,
     ticked and then cleared by the next poll (measured on the Easy Dynamics rippling packet,
     2026-08-20 - the same scenery class as the styled-span pills above). Those rows now get a plain
     marker instead, because their "done" is the server's to say - a question row completes through
     its own control, a document row through documentControls - and a box that can be ticked into
     recording nothing must be absent rather than dead.

     A plain function, checked FIRST in the branch chain below: an acknowledged row is also settled,
     so a chain that consulted `done` before the tick would swallow her tick into the static
     checkmark and take the way back with it. One branch, one input, no ordering to get wrong. */
  const toggleTick = !checked && item.acknowledgeable === true ? onToggleAcknowledged : undefined;
  const ticking = tickingIds?.has(item.id) === true;
  /* The employer's own options, drawn on the row that names the unanswered question, so what the
     control accepts is visible where the work is named. Picking one opens the answers editor with
     that option already selected; the editor's Save is still the only write, so a stray press here
     sends nothing. Radio INPUTS deliberately, not buttons: tests/your-turn-actions.test.mjs pins the
     FIRST <button> in this component to onOpenQuestion, and these must not take that pin. */
  const choices = !checked && item.settled !== true && onChooseOption && item.questionId && item.options && item.options.length > 0
    ? { questionId: item.questionId, options: item.options, choose: onChooseOption }
    : null;
  /* Two different things, kept apart deliberately.
     `checked` means "this row came out of the Done column", and it is the only thing that suppresses
     the control, which is safe because nothing in completedSubmissionGroups carries an action word in
     the first place. `settled` means "this row states something already handled" and it must KEEP
     its control: on the attached-transcript row that control is the only way back to Remove.
     `done` is what the tick and the colour read, so a settled row looks like a confirmation instead
     of shouting in amber beside the work that is genuinely outstanding. */
  const done = checked || item.settled === true;
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-4 text-small leading-5 text-muted sm:grid-cols-[18px_minmax(0,1fr)_auto]">
      {toggleTick ? (
        /* One input for both directions. `checked` comes from the STORED item, never from local
           state, so the box shows what is actually on the row - the exact opposite of the dead
           checkbox, whose tick lived only until the next render. Disabled while its own write is in
           flight, so a slow round trip reads as busy instead of dead. The wrapping label widens the
           hit target to ACCESSIBILITY.md's 24px floor without moving the 18px column (negative
           margins give the layout back what the target takes); accent-* is how every other native
           checkbox in this repo is tinted, and focus-visible comes from the shared global outline
           rather than a re-invented ring. */
        <label className="-mx-[5px] -mb-[5px] -mt-[3px] flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={item.acknowledged === true}
            disabled={ticking}
            onChange={() => toggleTick(item, item.acknowledged !== true)}
            aria-label={item.acknowledged === true
              ? `Untick ${item.label}. You marked this handled yourself.`
              : `Mark ${item.label} done. This records that you handled it on the company page yourself.`}
            className="h-[14px] w-[14px] accent-teal-ink disabled:opacity-50"
          />
        </label>
      ) : done ? (
        <span aria-hidden className="mt-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-[3px] border border-teal/40 bg-teal-soft text-teal-ink">
          <svg viewBox="0 0 16 16" className="h-3 w-3">
            <path d="M4 8.5l2.5 2.5L12 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : (
        /* Not a checkbox. This row's "done" is measured by the product, so the honest marker is a
           status dot. The row's own control is the way to act on it. */
        <span aria-hidden className="ml-1 mt-1.5 h-2 w-2 rounded-full bg-brand" />
      )}
      <span className="block min-w-0 sm:col-start-2">
        <span className="block min-w-0 break-words">
          <span className="text-ink">{item.label}</span>
          {/* The state word rides beside the label rather than inside the sentence, so the row still
              reads as a sentence about the employer and the pill stays scannable down a column. */}
          {!done && item.badge && <span className="ml-2 align-middle"><Chip label={item.badge} kind="ready" /></span>}
        </span>
        {item.detail && <span className="block text-small text-muted">{item.detail}</span>}
        {choices && (
          <span role="radiogroup" aria-label={`Choose an answer to: ${item.label}`} className="mt-2 block space-y-1.5">
            {choices.options.map((option) => (
              <label key={option} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-inner border border-control-border bg-surface px-4 py-2 text-small leading-5 text-ink hover:border-ink">
                <input
                  type="radio"
                  name={`blocker-choice-${choices.questionId}`}
                  value={option}
                  checked={false}
                  onChange={() => choices.choose(choices.questionId, option)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 border-control-border text-brand-ink focus:ring-brand/30"
                />
                <span>{option}</span>
              </label>
            ))}
            {/* Said here because the press does not save: it opens the editor with the pick made,
                and the Save there is the write. A row that looked saved and was not is the exact
                lie the review screen's own Save button copy exists to prevent. */}
            <span className="block text-label text-muted">Pick one to open it in the editor, then save.</span>
          </span>
        )}
      </span>
      {control && (
        <span className="col-start-2 mt-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:justify-self-end sm:self-center">
          {control?.element === "link" && (
            /* The same done switch the button branches carry, needed here since acknowledged rows
               made open-page the first link that can appear settled: a filled pill inside the quiet
               settled strip would be the loudest thing on the panel beside the one row that needs
               nothing doing. */
            <a href={control.href} target="_blank" rel="noreferrer" aria-label={control.name} className={done ? CHECKLIST_SETTLED_ACTION_CLASS : CHECKLIST_ACTION_CLASS}>
              {control.label}
            </a>
          )}
          {control?.element === "button" && onOpenQuestion && (
            <button type="button" aria-label={control.name} onClick={() => onOpenQuestion(control.questionId, control.intent)} className={done ? CHECKLIST_SETTLED_ACTION_CLASS : CHECKLIST_ACTION_CLASS}>
              {control.label}
            </button>
          )}
          {control?.element === "restart" && onRestartInLitos && (
            <button type="button" aria-label={control.name} onClick={onRestartInLitos} className={done ? CHECKLIST_SETTLED_ACTION_CLASS : CHECKLIST_ACTION_CLASS}>
              {control.label}
            </button>
          )}
          {/* AFTER the question branch, deliberately. tests/your-turn-actions.test.mjs pins the FIRST
              <button> in this component as the one bound to onOpenQuestion, because that is the pill
              that shipped as a styled <span> with nothing behind it. Adding a second interactive
              branch above it would move the pin onto a control the test is not about, and the
              regression it guards would be free to come back unnoticed. */}
          {control?.element === "attach" && onAddDocument && (
            <button type="button" aria-label={control.name} onClick={() => onAddDocument(control.kind)} className={done ? CHECKLIST_SETTLED_ACTION_CLASS : CHECKLIST_ACTION_CLASS}>
              {control.label}
            </button>
          )}
        </span>
      )}
    </li>
  );
}

function BlockerList({ items, portalUrl, onRestartInLitos, onOpenQuestion, onChooseOption, onAddDocument, onToggleAcknowledged, tickingIds }: { items: readonly SubmissionChecklistItem[]; portalUrl?: string; onRestartInLitos?: () => void; onOpenQuestion?: (questionId: string, intent?: SubmissionChecklistAction) => void; onChooseOption?: (questionId: string, option: string) => void; onAddDocument?: (kind: string) => void; onToggleAcknowledged?: (item: SubmissionChecklistItem, acknowledged: boolean) => void; tickingIds?: ReadonlySet<string> }) {
  /* Split before anything is drawn, because these are two different sentences and only one of them
     is a demand. An outstanding row is work the employer is still waiting on. A settled row states
     that something is already handled and keeps a control only so she can change it, which is why
     the attached transcript is here at all: "Remove this file" lives one press behind that control
     and there is nowhere else in the product to reach it.

     Drawn together, a confirmation would sit inside an amber panel headed "Your turn" and be counted
     in "N to check", and an application with nothing outstanding would go on looking blocked. The
     count reads the outstanding rows only, for the same reason. */
  const outstanding = items.filter((item) => !item.settled);
  const settled = items.filter((item) => item.settled);
  return (
    <>
      {outstanding.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-muted">Open the company page.</p>
      ) : (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-label font-medium uppercase tracking-[0.08em] text-muted">{outstanding.length === 1 ? "Your next step" : "Your next steps"}</p>
            <p aria-live="polite" className="font-mono text-label text-muted">{outstanding.length} remaining</p>
          </div>
          <ul className="mt-2 divide-y divide-border border-y border-border [&>li]:py-2 md:[&>li]:py-4">
          {outstanding.map((item) => (
            <ChecklistRow key={item.id} item={item} checked={false} portalUrl={portalUrl} onRestartInLitos={onRestartInLitos} onOpenQuestion={onOpenQuestion} onChooseOption={onChooseOption} onAddDocument={onAddDocument} onToggleAcknowledged={onToggleAcknowledged} tickingIds={tickingIds} />
          ))}
          </ul>
        </div>
      )}
      {settled.length > 0 && (
        <div className="mt-4 rounded-inner border border-border bg-surface-alt px-4 py-4">
          <ul className="space-y-2">
          {settled.map((item) => (
            /* onToggleAcknowledged rides into the settled box too: an acknowledged row's checkbox
               is how the tick is taken back, and a settled box without it would strand her ticks
               exactly the way the pre-repair rows stranded "Remove this file". */
            <ChecklistRow key={item.id} item={item} checked={false} portalUrl={portalUrl} onRestartInLitos={onRestartInLitos} onOpenQuestion={onOpenQuestion} onAddDocument={onAddDocument} onToggleAcknowledged={onToggleAcknowledged} tickingIds={tickingIds} />
          ))}
          </ul>
        </div>
      )}
    </>
  );
}

// A real portal run took over two minutes against Greenhouse with no elapsed time, no detail and no
// timeout, which is indistinguishable from a hung run: the operator's only move was a manual reload,
// and a user's would be to re-trigger a run that was working fine.
const PORTAL_SLOW_AFTER_S = 45;
// Past this the client genuinely cannot claim the run is healthy, only that the last poll returned a
// non-terminal status. Saying "still running" identically at 45 seconds and at 45 minutes just moves
// the original defect past the first threshold.
const PORTAL_STUCK_AFTER_S = 300;

function PortalProgress({ status, startedAt, sending = false, submission }: { status?: ApplicationReview["status"]; startedAt?: string;
  /** True when this screen was entered by pressing "Send it". See submittingPhase. */
  sending?: boolean;
  submission?: SubmissionResponse | null }) {
  // Anchored to the server's timestamp, not to mount. A reload or a return via ?application=<id>
  // during a live run remounts this component, and a mount-anchored clock would restart at 0s and
  // report "3s elapsed" for a run four minutes old, defeating the one thing the clock is for.
  // Parsing stays pure and returns null when there is no usable timestamp; the effect below picks
  // the mount-time fallback, because reading the clock during render is both impure
  // (react-hooks/purity) and a server/client hydration mismatch.
  const startedMs = useMemo(() => {
    const parsed = startedAt ? Date.parse(startedAt) : NaN;
    return Number.isNaN(parsed) ? null : parsed;
  }, [startedAt]);

  // Starts at 0 rather than reading the clock in the initializer: a useState initializer must be
  // pure (react-hooks/purity), and Date.now() there also differs between the server render and the
  // client hydration. The effect corrects it to the true elapsed time on the first tick, which runs
  // immediately rather than after a second's delay.
  const [elapsed, setElapsed] = useState(0);
  // Mirrors `elapsed` without being a render dependency, so the stage-history effect below can
  // stamp a step with "how long in" it arrived without re-running on every clock tick.
  const elapsedRef = useRef(0);

  useEffect(() => {
    // Deliberately a self-rescheduling timeout rather than an interval. The repo bans setInterval in
    // this file (tests/application-submission-gate.test.mjs) so portal polling can never stack
    // overlapping requests, and a display clock is not worth carving an exception into that rule.
    let timer: number | undefined;
    let cancelled = false;
    const anchor = startedMs ?? Date.now();
    const tick = () => {
      if (cancelled) return;
      const next = Math.max(0, Math.floor((Date.now() - anchor) / 1000));
      elapsedRef.current = next;
      setElapsed(next);
      timer = window.setTimeout(tick, 1000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [startedMs]);

  // The old copy asserted "Nothing is submitted during this preparation step" on every status,
  // including the genuinely-submitting one. That reassurance was false at exactly the moment it
  // mattered most, so each stage now states only what is true of that stage.
  //
  // `sending` is first and is not redundant with the status test. During an approve the status on
  // hand is still `ready_for_final_approval` for the whole request, because the response that
  // changes it is the thing being awaited, so the status alone put the "nothing is sent yet" line
  // on screen for the entire duration of the send. What the caller pressed is known immediately;
  // the status only catches up afterwards. Unlike the routing problem above, this one does NOT
  // depend on the tab being hidden: the poll cannot fix it either, because the status genuinely is
  // still ready_for_final_approval until the send returns.
  const submitting = sending || status === "submitting" || status === "submission_claimed";
  const title = submitting ? "Sending" : "Filling form";
  const body = submitting
    ? "Waiting for confirmation."
    : "Not sent yet.";
  const liveViewUrl = submission?.handoff_url;
  const progressPreviewUrl = submission?.review.progress_screenshot_url;
  const progressStage = submitting
    ? "Waiting for the company confirmation"
    : submission?.review.progress_stage ?? "Opening the company form";
  const previewModeLabel = liveViewUrl ? "Live" : progressPreviewUrl ? "Updating" : "Starting";

  // The run's own history of stages, built client-side because the backend hands over one current
  // string at a time (`progress_stage`), not a log.
  const [stageHistory, setStageHistory] = useState<{ stage: string; atS: number }[]>([]);
  const lastStageRef = useRef<string | null>(null);
  useEffect(() => {
    if (progressStage === lastStageRef.current) return;
    lastStageRef.current = progressStage;
    setStageHistory((prev) => [...prev, { stage: progressStage, atS: elapsedRef.current }]);
  }, [progressStage]);

  // The toggle itself is always present, collapsed by default, and gated on nothing but whether
  // there is a second stage to show yet: a run one stage into its history already has something
  // worth disclosing, and there is no reason to make a student wait out a clock to see it.
  const priorStages = stageHistory.slice(0, -1);
  const showHistoryToggle = priorStages.length > 0;
  const [historyOpen, setHistoryOpen] = useState(false);

  const milestone =
    elapsed >= PORTAL_STUCK_AFTER_S
      ? "Still working."
      : elapsed >= PORTAL_SLOW_AFTER_S
        ? "Still working."
        : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[0.72fr_1.28fr]">
      <Card className="h-fit p-7">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-brand-ink">Live application status</p>
        <h2 className="mt-3 text-heading font-medium text-ink">{title}</h2>
        <div className="mt-5 rounded-inner border border-brand/20 bg-brand-soft/35 px-4 py-4">
          <div className="flex items-start gap-3">
            <ThinkingOrb state="working" size={20} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p role="status" aria-live="polite" className="text-sm font-medium leading-6 text-ink">{progressStage}</p>
                {showHistoryToggle && (
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((open) => !open)}
                    aria-expanded={historyOpen}
                    aria-label={historyOpen ? "Hide earlier steps" : "Show earlier steps"}
                    className="-m-1 shrink-0 rounded-full p-1 text-brand-ink transition-colors hover:bg-brand/10"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    >
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{body}</p>
            </div>
          </div>
          {showHistoryToggle && historyOpen && (
            <ul className="mt-3 space-y-2 border-t border-brand/20 pt-3">
              {priorStages.map((entry) => (
                <li key={`${entry.atS}-${entry.stage}`} className="flex items-baseline justify-between gap-3 text-xs leading-5 text-muted">
                  <span className="min-w-0 truncate">{entry.stage}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{formatElapsed(entry.atS)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-4 font-mono text-[11px] text-muted" aria-hidden>{formatElapsed(elapsed)} elapsed</p>
        {milestone && <p className="mt-2 text-xs text-muted">{milestone}</p>}
        <p className="mt-5 text-xs leading-5 text-muted">This view refreshes as Litos moves through the company form.</p>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <p className="text-sm font-medium text-ink">Company form</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-positive">{previewModeLabel}</p>
        </div>
        {liveViewUrl ? (
          <iframe
            src={liveViewUrl}
            title="Live company application form while Litos fills it"
            className="h-[72vh] min-h-[560px] w-full bg-white"
            allow="clipboard-read; clipboard-write"
          />
        ) : progressPreviewUrl ? (
          <img
            src={progressPreviewUrl}
            alt="Latest view of the company application form while Litos fills it"
            className="h-auto w-full"
          />
        ) : (
          <div className="grid min-h-[560px] place-items-center bg-surface-alt p-10 text-center">
            <div>
              <p className="text-sm font-medium text-ink">Opening the company form</p>
              <p className="mt-2 text-xs leading-5 text-muted">The first form view will appear here as soon as the page is ready.</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

// "Needs attention" and "Stopped safely" were painted in the same ready/success treatment as
// "Ready for review", so the label was the only signal anything was wrong.
//
// THE TONE FOLLOWS THE WORD ON THE CHIP, which is the vocabulary a student actually learns.
// statusLabel collapses nine backend statuses into four words on purpose (application-review.ts),
// and this used to key off the raw status instead, which broke that in both directions: "Needs you"
// rendered RED for needs_attention and AMBER for ready_for_final_approval - two colours for one
// word - while every "Getting ready" packet took the blue your-turn tone for work that was not the
// student's turn at all. On the live Tracker that meant 187 of 200 rows in danger red, so the whole
// screen read as failure on an account where nothing had failed. ui.tsx states the five looks
// plainly: amber means it stopped, red means it FAILED. Only a failure is red now.
function chipKind(status: ApplicationReview["status"]): "sent" | "ready" | "warn" | "bounced" | "draft" {
  const label = statusLabel(false, status);
  if (label === "Sent") return "sent";
  if (label === "Ready") return "ready";
  if (label === "Getting ready") return "draft";
  return status === "failed" ? "bounced" : "warn";
}

/* The same four states as a hairline down the left edge of a ledger row, so the list is scannable
   by state without reading a single chip. The board beside it already tones its cards this way
   (Board.tsx STAGE_TONE); this is that idea at row scale.
   It states WHAT a row is, never how fast to deal with it - a "Needs you" edge is the same weight
   as a "Sent" one. Transparent for "Getting ready", because a row Litos is working on is asking
   nothing and an edge on every row is a stripe pattern rather than a signal. */
function rowEdgeTone(status: ApplicationReview["status"] | undefined): string {
  if (status === undefined) return "border-l-transparent";
  const kind = chipKind(status);
  if (kind === "sent") return "border-l-positive/45";
  if (kind === "ready") return "border-l-brand/50";
  if (kind === "bounced") return "border-l-danger/45";
  if (kind === "warn") return "border-l-warn/45";
  return "border-l-transparent";
}

function applicationCardClasses(packet: GeneratedResume, selected: boolean): string {
  const status = packet.spec._review?.status;
  const semantic = status === "submitted"
    ? "border border-positive/20 bg-positive-soft text-positive"
    : status === "needs_attention" || status === "failed"
      ? "border border-danger/20 bg-danger-soft text-danger"
      : "border border-border bg-surface text-ink hover:border-brand/35 hover:bg-brand-soft/35";
  return selected ? `${semantic} ring-2 ring-brand ring-offset-2` : semantic;
}
