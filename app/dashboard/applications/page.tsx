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
  type ApplicationProfile,
  type ApplicationReview,
  type AttachedDocument,
  type CanonicalApplication,
  type CanonicalCoverLetterResponse,
  type CoverLetter,
  type GeneratedResume,
  type JobsPage,
  type MonitoredJob,
  type PacketAuditResponse,
  type ManualHandoffResponse,
  type ResumeSpec,
} from "@/lib/api";
import { Card, Chip, EmptyState, ErrorNote, PendingLabel, ShimmerRows, TerminalActionBar, formatRelativeDate } from "@/components/app/ui";
import { ThinkingOrb } from "thinking-orbs";
import { canonicalApplicationFromPacket, explicitTerms, sendableLinkedPacketFromCanonicalEnvelope, withRestoredLinkedPackets, linkedLegacyPacketFromCanonicalTrackerPacket, mergeCanonicalApplicationHistory, mergeDiscoveredQuestions, portalName, reviewablePackets as onlyReviewablePackets, reviewWithLists, screenForStatus, sectionHeading, selectedPacketForRequest, startsNewSection, statusLabel, stripMetadata, upsertCanonicalApplicationHistory } from "@/features/applications";
import { applicationFilterFromSearch, applicationFilterHeading, ledgerRendersOnLanding, reviewCanBeSent, statusMatchesApplicationFilter, type ApplicationFilter } from "@/features/applications";
import { nextPreferredReadyPacket, packetMatchesJob } from "@/features/applications";
import { auditAnswerWrite, saveReviewAnswers, type ReviewAnswerSaveResponse } from "@/features/applications";
import { duplicateBadge, duplicatePostingMarks, duplicatePostingNote } from "@/features/applications";
import { isHttpsJobUrl, missingApplicationFields, type ApplicationDraftField } from "@/features/applications";
import { COVER_LETTER_WAIT_MS, HANDOFF_CLOCK_TICK_MS, coverLetterBlocks, coverLetterGate, documentsFromSpecMarks, handoffWindowExpired, nextCoverLetterValue, nextSubmissionState, submissionCoverLetterField } from "@/features/applications";
import { MatchScore, MatchGaps } from "@/components/app/MatchScore";
import { nextMatchScoreRequest } from "@/features/applications";
import { getBaseResume } from "@/lib/base-resume";
import { RequirementBreakdown } from "@/components/app/RequirementBreakdown";
import { ResumeHealth } from "@/components/app/ResumeHealth";
import { Board } from "@/components/app/Board";
import { SectionBoundary } from "@/components/app/SectionBoundary";
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
import { buildRequirementIndex, EMPTY_REQUIREMENT_INDEX } from "@/features/applications";
import { educationDrift, educationDriftMessage, type EducationProfile } from "@/features/applications";
import { checklistRowControl, completedSubmissionGroups, displayQuestionLabel, documentAsksByKind, documentControls, humanInputItems, type SubmissionChecklistAction, type SubmissionChecklistItem } from "@/features/applications";
import { prescriptEditableQuestions, prescriptNeedsHer, prescriptSummary } from "@/features/applications";
import type { JdMatchResponse, JobMatch } from "@/features/applications";
import { userFacingError } from "@/lib/user-facing-error";
import { track } from "@/lib/analytics";
import { replaceClosedComposerUrl } from "./composer-url";
import { ExactPacketPdf } from "@/components/app/ExactPacketPdf";
import { AuditedJobDescription, manualHandoffMatchesPacket, manualTrialPacketEvidenceIsFresh, PacketAuditBreakdown, packetAuditDisplayIsExact, packetAuditResponseMatchesApplication } from "@/components/app/PacketAuditEvidence";
import { acknowledgePacketEvidence, packetAuditAcknowledgementAccepted, packetQuestionsSnapshot, reconcilePacketPdfVerification, reconcileUnacknowledgedPacketPoll, revalidateAcknowledgedPacketEvidence, type PacketEvidenceSession, type PacketPdfEvidenceVerification } from "@/features/applications";
import { useBilling } from "@/components/billing/BillingProvider";
import { isStructuredUpgradeDenial } from "@/features/billing";
import { completeOperationId, operationIdFor } from "@/lib/operation-id";

type Screen = "review" | "questions" | "submitting" | "portal" | "submitted";
type ApplicationSort = "recent" | "company";
/* `partial` marks the snapshot selectPacket seeds from a board row, which carries `review` and
   nothing else. nextSubmissionState reads it so the first real server answer always replaces the
   seed. See features/applications/domain/submission-state.ts for what that fixes. */
/* `documents` is keyed by document kind and is TRI-STATE the way cover_letter_required is: absent
   means this envelope has never carried the measurement, and an unmeasured document must not block a
   send. An empty object is a real answer, "nothing is attached"; undefined is "nobody has looked".
   The `partial: true` seed below is exactly the second case, and so is a backend that predates the
   documents route. */
type SubmissionResponse = { application_id: string; review: ApplicationReview; cover_letter?: CoverLetter | null; documents?: Record<string, AttachedDocument>; handoff_url?: string; configured?: boolean; partial?: boolean };

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
  const reviewUnchanged = packet.spec._review?.updated_at === submission.review.updated_at;
  const coverLetterField = submissionCoverLetterField(submission);
  const nextCoverLetter = nextCoverLetterValue(packet.spec._cover_letter, submission);
  const coverLetterUnchanged = nextCoverLetter === undefined
    ? packet.spec._cover_letter === undefined
    : sameCoverLetter(packet.spec._cover_letter, nextCoverLetter);
  if (reviewUnchanged && coverLetterUnchanged) return packet;
  return {
    ...packet,
    cover_letter_download_url: coverLetterField.included && !coverLetterField.value
      ? undefined
      : packet.cover_letter_download_url,
    spec: {
      ...packet.spec,
      _review: submission.review,
      _cover_letter: nextCoverLetter,
    },
  };
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
  const [canonicalIdByPacketId, setCanonicalIdByPacketId] = useState<Record<string, string>>({});
  const resumeOperationIds = useRef(new Map<string, string>());
  const coverLetterOperationIds = useRef(new Map<string, string>());
  const [canonicalFillError, setCanonicalFillError] = useState<string | null>(null);
  const [canonicalCoverLetter, setCanonicalCoverLetter] = useState<CanonicalCoverLetterResponse | null>(null);
  const [canonicalCoverLetterBody, setCanonicalCoverLetterBody] = useState("");
  const [canonicalCoverLetterJd, setCanonicalCoverLetterJd] = useState("");
  const [canonicalCoverLetterEditorOpen, setCanonicalCoverLetterEditorOpen] = useState(false);
  const [canonicalCoverLetterLoading, setCanonicalCoverLetterLoading] = useState(false);
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
  const revisitingPacket = revisitingId ? (packets ?? []).find((item) => item.id === revisitingId) ?? null : null;
  /* Stable identity. The viewer's focus-trap effect keys on its onClose, and an inline arrow here
     gave it a new one on every render of this page: each parent commit tore the effect down and
     rebuilt it, which ran the cleanup's `previous?.focus?.()` and threw focus out of an open
     aria-modal dialog back onto the board behind it, then re-locked body scroll. A keyboard user
     reading the answers got yanked back to Close every time the autopilot ticked. */
  const closeRevisit = useCallback(() => setRevisitingId(null), []);
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
  /* The poll reads the submission it is about to overwrite. A ref, not the state value, so the
     poll callback does not have to re-subscribe on every submission update. */
  const submissionRef = useRef<SubmissionResponse | null>(null);
  const actionStartedFor = useRef<string | null>(null);
  const capturedSubmissionIds = useRef(new Set<string>());
  /* One browser proof for one immutable server audit. Application ID alone is not enough: a resume,
     answer, PDF, or JD mutation must make the proof unusable even when the row ID stays the same. */
  const [packetEvidence, setPacketEvidence] = useState<PacketEvidenceSession | null>(null);
  const packetEvidenceRef = useRef<PacketEvidenceSession | null>(null);
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
  const [screen, setScreen] = useState<Screen>("review");
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
  const savingAnswersRef = useRef<string | null>(null);
  const [savingAnswersId, setSavingAnswersId] = useState<string | null>(null);
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
  const [notice, setNotice] = useState<string | null>(null);
  /* Null means the localhost-only fixture gate has not resolved yet. Treating that as false let
     authenticated effects fire during the first render of a QA page, and a 401 redirected the
     fixture to /login before it could verify anything. */
  const [qaMode, setQaMode] = useState<boolean | null>(null);
  const [creating, setCreating] = useState<"fill" | "tailor" | null>(null);
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
  const [composerRefusal, setComposerRefusal] = useState<{ message: string; fields: ApplicationDraftField[]; at: ComposerSlot } | null>(null);
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
  const refuseInComposer = useCallback((at: ComposerSlot, message: string, fields: ApplicationDraftField[]) => {
    setError(null);
    setComposerRefusal({ message, fields, at });
  }, []);
  /* What the server said when she pressed Send it, held against the packet it was said about.
   *
   * Keyed by application id for the same reason the approve handler re-checks `selectedIdRef`: the
   * packet switcher renders above this screen, so a refusal about Cresta must not be left sitting
   * under the Send button for Redwood. Render-time comparison rather than an effect, so switching
   * away is enough to retire it. */
  const [sendRefusal, setSendRefusal] = useState<{ applicationId: string; message: string; issues: string[] } | null>(null);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const refuseSend = useCallback((applicationId: string, message: string, issues: string[] = []) => {
    // One live region at a time, the rule refuseInComposer already sets on this screen.
    setError(null);
    setSendRefusal({ applicationId, message, issues });
  }, []);
  const [pendingJob, setPendingJob] = useState<MonitoredJob | null>(null);
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
      const review = reviewWithLists(next.review);
      return review === next.review ? next : { ...next, review };
    });
  }, []);
  const [coverLetterBody, setCoverLetterBody] = useState("");
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
  /* The actionable direct-link request that has actually loaded and selected. This deliberately
     trails requestedApplicationId during a query-only navigation, which is the short window where
     the prior packet's controls must disappear. It does not pin later ledger switching to the URL. */
  const [resolvedActionableRequestId, setResolvedActionableRequestId] = useState<string | null>(null);
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
  const [applicationSort, setApplicationSort] = useState<ApplicationSort>("recent");

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
  }, [submission]);

  useEffect(() => {
    packetEvidenceRef.current = packetEvidence;
  }, [packetEvidence]);

  const captureCompletedSubmission = useCallback((result: SubmissionResponse, source: string) => {
    if (result.review.status !== "submitted" || capturedSubmissionIds.current.has(result.application_id)) return;
    capturedSubmissionIds.current.add(result.application_id);
    track("application_submission_completed", { source });
  }, []);

  /* `scrollToTop: false` for the one caller that is navigating TO something rather than to a new
     screen: a Your turn row opens the answers editor on the question that was pressed, and the top
     of the page is not where that question is. Racing the two was tried and is not sound, because
     this scroll is scheduled in a requestAnimationFrame and rAF does not run at all in a hidden
     tab, so the winner differed between a real browser and an automated one. */
  const moveToScreen = useCallback((next: Screen, options: { scrollToTop?: boolean } = {}) => {
    setScreen((current) => {
      if (current === next) return current;
      if (options.scrollToTop !== false) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      return next;
    });
  }, []);

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
    const packet = sendable ?? incoming;
    const canonical = sendable ? null : canonicalApplicationFromPacket(packet);
    if (canonical) {
      // Canonical Tracker envelopes must never be sent to the legacy review, audit, or submission
      // endpoints. Their own detail keeps the real portal handoff and retry control available. An
      // explicit packet action first restores the linked packet's legacy route id.
      selectedIdRef.current = null;
      editorRevisionRef.current += 1;
      setSelectedId(null);
      setCanonicalSelected(canonical);
      setCanonicalFillError(null);
      setSpec(null);
      setQuestions([]);
      setSubmission(null);
      setPacketEvidence(null);
      setMatchResult(null);
      setError(null);
      setPollError(null);
      setSendRefusal(null);
      setNotice(null);
      return;
    }
    setCanonicalSelected(null);
    setCanonicalFillError(null);
    // Updated synchronously, before any state commit, so an in-flight poll comparing against it
    // sees the new selection immediately rather than one render later.
    selectedIdRef.current = packet.id;
    editorRevisionRef.current += 1;
    setSelectedId(packet.id);
    // Highlighting is per (resume, posting). Carrying the previous packet's result over marks the
    // new JD against a resume and a posting that are no longer on screen.
    setMatchResult(null);
    setPacketEvidence(null);
    setSpec(stripMetadata(packet.spec));
    setQuestions(packet.spec._review?.questions ?? []);
    setCoverLetterBody(packet.spec._cover_letter?.body ?? "");
    setCoverLetterDownloadUrl(packet.cover_letter_download_url ?? null);
    const status = packet.spec._review?.status;
    /* A different packet, so any "sending" flag belongs to the one we are leaving. Without this,
       switching to a packet whose stored status is `filling` captioned it "You told Litos to send
       this" for an application the student never authorised. */
    setPrepareStartedAt(null);
    setApproveStartedAt(null);
    setSubmittingPhase("preparing");
    /* A ready packet still has one mandatory stop before the employer send: the posting, exact
       resume, evidence colours and gap list. Routing it straight to the portal screen is how the
       Cresta packet reached Send it without that audit. */
    moveToScreen(status === "ready_for_final_approval" ? "review" : screenForStatus(status, "review"));
    /* Seeded from the board row so the portal screen has something to draw before the first poll
       answers, and marked `partial` because that is exactly what it is. The cover letter is carried
       across too: /resume/history already sends `spec._cover_letter` on every row, and leaving it
       out was half of why the send stayed disabled.

       The document marks are carried for the same reason and off the same row. The first poll is
       2.5 seconds behind this seed, and without them re-entering an application whose transcript is
       already stored drew no manage control for that whole window: an attached file looked
       unattached, and the one route to "Remove this file" was missing from the screen while
       /privacy promises removal. `spec._documents` is not a guess about the envelope, it is the
       same stored record the server reads to build it.

       Absent stays absent. documentsFromSpecMarks returns undefined for a packet with no marks,
       which is the honest answer and the one the send gate needs: an empty object would claim this
       application had been measured and block a send on an ask the seed cannot confirm. */
    setSubmission(status
      ? { application_id: packet.id, review: packet.spec._review!, cover_letter: packet.spec._cover_letter ?? null, documents: documentsFromSpecMarks(packet.spec._documents), partial: true }
      : null);
    setError(null);
    setPollError(null);
    setSendRefusal(null);
    setNotice(null);
  }, [moveToScreen]);

  /* The answer is put through reviewWithLists on arrival, not only on its way into state through
     setSubmission. Two lines in here read `result.review.questions` directly rather than through
     state, so a backend that answered without the key would throw inside this promise instead of
     during a render, and the poll's catch would report it as "We lost sight of the form."
     The comment stays out here rather than beside the line: tests/submission-terminal-state.test.mjs
     bounds the distance from the fetch to the route below, deliberately, so that span holds code. */
  const refreshSubmission = useCallback(async () => {
    if (!selectedId || qaMode) return;
    const requestedId = selectedId;
    const raw = await api<SubmissionResponse>(`/applications/${requestedId}/submission`);
    const result: SubmissionResponse = { ...raw, review: reviewWithLists(raw.review) };

    // A poll for packet A can land after the user has switched to packet B: the fetch closes over
    // the id it asked for, but the poll effect's cleanup cannot reach inside an in-flight request.
    // Without this guard A's review would be installed while B is selected, so the portal preview,
    // filled fields and blockers on screen belong to A while the Submit button approves B. That is
    // an application sent to the wrong employer, so the response is discarded unless it is still
    // the packet the user is looking at. The ref, not the closure, is the current truth.
    if (selectedIdRef.current !== requestedId) return;

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
    if (currentEvidence?.applicationId === requestedId && currentEvidence.acknowledged) {
      try {
        const currentAudit = await api<PacketAuditResponse>(`/applications/${requestedId}/packet-audit`, { method: "POST" });
        const refreshed = revalidateAcknowledgedPacketEvidence(currentEvidence, requestedId, currentAudit, Date.now());
        if (selectedIdRef.current !== requestedId || !refreshed) {
          packetEvidenceRef.current = null;
          setPacketEvidence(null);
        } else {
          packetEvidenceRef.current = refreshed;
          setPacketEvidence(refreshed);
        }
      } catch {
        packetEvidenceRef.current = null;
        setPacketEvidence(null);
      }
    } else {
      setPacketEvidence((current) => reconcileUnacknowledgedPacketPoll(current, requestedId, result.review.packet_audit));
    }
    const incomingCoverLetter = submissionCoverLetterField(result);
    if (incomingCoverLetter.included) {
      setCoverLetterBody(incomingCoverLetter.value?.body ?? "");
      if (!incomingCoverLetter.value) setCoverLetterDownloadUrl(null);
    }
    /* NOT a bare `review.updated_at` comparison: that versions the review alone, and this response
       also carries cover_letter, handoff_url and configured. See submission-state.ts. */
    setSubmission((current) => nextSubmissionState(current, result));
    setQuestions((current) => mergeDiscoveredQuestions(current, result.review.questions));
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
    setPollError(null);
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
    moveToScreen(screenForStatus(result.review.status, "submitting"));
  }, [captureCompletedSubmission, moveToScreen, qaMode, selectedId]);

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
  }, []);

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
  }, []);

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
    const qaScenario = new URLSearchParams(window.location.search).get("qa");
    const localQa = window.location.hostname === "localhost" && qaScenario !== null;
    if (localQa) {
      queueMicrotask(async () => {
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
        const scenario = qaScenario === "1" ? "acme" : qaScenario === "no-questions" ? "stripe" : qaScenario;
        const packet = QA_SCENARIOS[scenario ?? "acme"] ?? QA_PACKET;
        setQaMode(true);
        setEducationProfileStatus("ready");
        setPackets(Object.values(QA_SCENARIOS));
        selectPacket(packet);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setQaMode(false);
    });
    /* The ordinary history response is deliberately capped at fifty full packet specs. A direct
       link may point to an older packet, so name that one packet explicitly instead of widening
       every Tracker load and restoring the transfer problem that required the cap. */
    const historyPath = requestedApplicationId
      ? `/resume/history?application=${encodeURIComponent(requestedApplicationId)}`
      : "/resume/history";
    Promise.allSettled([
      api<{ resumes: GeneratedResume[] }>(historyPath),
      api<{ applications: CanonicalApplication[] }>("/applications?limit=100"),
    ])
      .then(async ([historyResult, canonicalResult]) => {
        if (cancelled) return;
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
          if (cancelled) return;
          legacy = [...linkedHistory.resumes, ...legacy.filter((packet) => !linkedHistory.resumes.some((linked) => linked.id === packet.id))];
        }
        const merged = mergeCanonicalApplicationHistory(legacy, canonical);
        const reviewable = onlyReviewablePackets(merged);
        setPackets(merged);
        const requestedPacketId = requestedCanonicalApplication?.id ?? requestedApplicationId;
        const requested = reviewable.find((packet) => packet.id === requestedPacketId);
        if (requestedCanonicalApplication && requestedApplicationIntent === "detail") {
          setRevisitingId(null);
          setResolvedActionableRequestId(null);
          setCanonicalSelected(requestedCanonicalApplication);
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
          setResolvedActionableRequestId(requested.id);
          selectPacket(requested);
        } else {
          setResolvedActionableRequestId(null);
          if (requestedApplicationIntent !== "detail") setRevisitingId(null);
        }
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "We could not load your applications. Reload the page."));
    /* The education block as it stands NOW, to check the frozen packet against. Failure is not the
       same as agreement: sending stays blocked until the comparison succeeds. */
    queueMicrotask(() => {
      if (!cancelled) setEducationProfileStatus("loading");
    });
    api<EducationProfile>("/profile")
      .then((result) => {
        if (cancelled) return;
        setEducationProfile(result);
        setEducationProfileStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setEducationProfile(null);
        setEducationProfileStatus("failed");
      });
    api<JobsPage>("/jobs?offset=0")
      .then((result) => {
        if (cancelled) return;
        setCurrentMatches(result.jobs);
        setPreferenceError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentMatches([]);
        setPreferenceError("We could not check your current job preferences. Automatic sending is paused.");
      });
    return () => {
      cancelled = true;
    };
  }, [requestedApplicationId, requestedApplicationIntent, selectPacket]);

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
  const resolvedJobParam = useRef<string | null>(null);
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
        selectPacket(packet);
        /* The same helper the composer's Close uses, so there is one definition of what this URL
           looks like with the parameter gone. */
        replaceClosedComposerUrl(
          window.location,
          (data, unused, url) => window.history.replaceState(data, unused, url),
        );
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
  }, [packets, qaMode, selectPacket]);

  useEffect(() => {
    if (!pendingJob || packets === null) return;
    const existing = onlyReviewablePackets(packets).find((packet) => packetMatchesJob(packet, pendingJob));
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const intent = params.get("intent");
      const checkoutAction = params.get("checkout_action");
      if (existing && intent !== "fill") {
        selectPacket(existing);
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
          // A route effect no longer has the browser click activation that opened this page. The
          // employer tab must be reserved by the visible Fill application button below, or Chrome
          // will block it before the extension can arm the canonical record.
          setNotice("Job details are ready. Choose Fill application to verify the extension and open the employer form.");
        }
      }
      setPendingJob(null);
    });
    // createApplication is redeclared every render and is not a dependency worth chasing: the
    // effect is keyed on pendingJob, which is cleared above, so it runs once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packets, pendingJob, selectPacket]);

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
  const review = selected?.spec._review;
  const selectedSubmission = selected && submission?.application_id === selected.id ? submission : null;
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
  useEffect(() => {
    const applicationId = canonicalSelected?.id;
    queueMicrotask(() => setCanonicalCoverLetterJd(""));
    if (!applicationId || qaMode !== false) {
      queueMicrotask(() => {
        setCanonicalCoverLetter(null);
        setCanonicalCoverLetterBody("");
        setCanonicalCoverLetterEditorOpen(false);
        setCanonicalCoverLetterLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setCanonicalCoverLetterLoading(true));
    void api<CanonicalCoverLetterResponse>(`/applications/${applicationId}/cover-letter`, { cache: "no-store" })
      .then((result) => {
        if (cancelled) return;
        setCanonicalCoverLetter(result);
        setCanonicalCoverLetterBody(result.cover_letter.body ?? "");
      })
      .catch((reason) => {
        if (cancelled) return;
        if (reason instanceof ApiError && reason.status === 404) {
          setCanonicalCoverLetter(null);
          setCanonicalCoverLetterBody(canonicalGeneratedPacket?.spec._cover_letter?.body ?? "");
          return;
        }
        setCanonicalFillError(reason instanceof Error ? reason.message : "Cover letter could not load.");
      })
      .finally(() => {
        if (!cancelled) setCanonicalCoverLetterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canonicalGeneratedPacket, canonicalSelected?.id, qaMode]);
  /* Computed over EVERY reviewable packet, not over visiblePackets, and that is the whole point.
     A filter of "Needs you" hides the sent Akuna application and leaves the eleven that cannot be
     sent looking like eleven live opportunities. The mark has to know about the row the filter
     just removed. */
  const duplicateMarks = useMemo(() => duplicatePostingMarks(reviewablePackets), [reviewablePackets]);
  const visiblePackets = useMemo(() => {
    const filtered = reviewablePackets.filter((packet) =>
      statusMatchesApplicationFilter(packet.spec._review, applicationFilter));
    return [...filtered].sort((a, b) => applicationSort === "company"
      ? (a.job_context.company ?? "").localeCompare(b.job_context.company ?? "")
      : packetTimestamp(b).localeCompare(packetTimestamp(a)));
  }, [applicationFilter, applicationSort, reviewablePackets]);
  const legacyCount = (packets?.length ?? 0) - reviewablePackets.length;

  /* ---- sending without being asked ----
     The setting itself lives on the server and is shared with Account; this page reads it, shows
     what it is doing while it is on, and gives the student the seconds in which to stop it. */
  const autopilot = useAutopilot(qaMode === false);

  const nextPacket = useMemo(
    () => qaMode
      ? reviewablePackets
          .filter((packet) => reviewCanBeSent(packet.spec._review))
          .sort((a, b) => packetTimestamp(b).localeCompare(packetTimestamp(a)))[0] ?? null
      : nextPreferredReadyPacket(reviewablePackets, currentMatches ?? []),
    [currentMatches, qaMode, reviewablePackets],
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
     is the number every rival inflates. */
  const appliedToday = useMemo(() => {
    if (packets === null) return null;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return reviewablePackets.filter((packet) => {
      const at = packet.spec._review?.submitted_at;
      return at ? new Date(at).getTime() >= midnight.getTime() : false;
    }).length;
  }, [packets, reviewablePackets]);

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
      try {
        track("application_submission_requested", { source: "autopilot" });
        const result = await api<SubmissionResponse>(`/applications/${id}/submit-request`, {
          method: "POST",
          body: JSON.stringify({ questions: packet.spec._review?.questions ?? [] }),
        });
        captureCompletedSubmission(result, "autopilot");
        setPackets((current) => current?.map((item) => (item.id === id ? { ...item, spec: { ...item.spec, _review: result.review } } : item)) ?? current);
      } catch (reason) {
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
  const packetEvidenceReviewed = Boolean(packetEvidenceReady && activePacketEvidence?.acknowledged);
  const manualTrialEvidence = selected
    && activePacketEvidence
    && manualTrialPacketEvidenceIsFresh(selected.id, activePacketEvidence)
    ? activePacketEvidence
    : null;
  const authoritativeMissingCount = activePacketEvidence && auditedDisplayReady
    ? activePacketEvidence.response.packet_audit.clauses.filter((clause) => clause.verdict === "missing").length
    : !activePacketEvidence && matchResult?.scorable ? matchResult.missing.length : null;
  const authoritativeEditedCount = activePacketEvidence && auditedDisplayReady
    ? activePacketEvidence.response.packet_audit.clauses
      .flatMap((clause) => clause.highlight_terms)
      .filter((term) => term.tone === "edited").length
    : !activePacketEvidence ? editedTerms.size : 0;
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
    || Boolean(activePacketEvidence && !packetEvidenceReady);
  const reviewPrimaryLabel = !activePacketEvidence
    ? review?.status === "ready_for_final_approval"
      ? "Review and send"
      : "Review and fill"
    : !packetEvidenceReady
      ? "Loading exact PDF"
      : review?.status === "ready_for_final_approval"
        ? "Review filled form"
        : "Fill company form";

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
      const extracted = await api<{ jd_text: string; page_title?: string }>("/jobs/extract", {
        method: "POST",
        body: JSON.stringify({ job_url: portalUrl }),
      });
      setNewApplication((current) => ({ ...current, jobDescription: extracted.jd_text }));
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

  async function tailorCanonicalApplication(application: CanonicalApplication) {
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
      await createApplication(draft);
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
      if (jobDescription.trim().length < 20) throw new Error("The saved job description is incomplete.");
      await createApplication({ ...draft, jobDescription });
    } catch (reason) {
      setNewApplication(draft);
      setShowNewApplication(true);
      setCanonicalSelected(null);
      refuseInComposer(
        "action",
        reason instanceof Error
          ? `${reason.message} Paste the exact job description below, then choose Tailor resume.`
          : "Litos could not read this posting. Paste the exact job description below, then choose Tailor resume.",
        ["jobDescription"],
      );
    } finally {
      setCreating(null);
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
   * Nothing here blocks. The pre-script is fetched after the packet exists, so a scan that is slow,
   * refused, or not deployed costs her nothing: getPostingQuestions swallows every failure and this
   * falls through to the review screen, which is exactly today's behaviour.
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
    setPrescriptNote("");
    setFocusQuestion(null);
    moveToScreen("review");
    setNotice("Saved. Check the resume, then send it and Litos will put these answers on the form.");
  }

  async function askPrescriptQuestions(jobId: string) {
    const prescript = await getPostingQuestions(jobId);
    if (!prescriptNeedsHer(prescript)) return;
    const asked = prescriptEditableQuestions(prescript);
    setQuestions((current) => mergeDiscoveredQuestions(current, asked));
    setPrescriptNote(prescriptSummary(prescript));
    setFocusQuestion(null);
    moveToScreen("questions");
  }

  async function fillApplication(
    draft: NewApplicationDraft = newApplication,
    errorSurface: "composer" | "tracker" = "composer",
  ) {
    const company = draft.company.trim();
    const role = draft.role.trim();
    const portalUrl = draft.portalUrl.trim();
    const reportFailure = (message: string, fields: ApplicationDraftField[] = []) => {
      if (errorSurface === "tracker") {
        setCanonicalFillError(message);
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

  async function createApplication(draft: NewApplicationDraft = newApplication) {
    const canonicalReturnRoute = draft.canonicalApplicationId
      ? `/dashboard/applications?application=${encodeURIComponent(draft.canonicalApplicationId)}&intent=detail&checkout_action=tailor`
      : "/dashboard/applications?new=1&checkout_action=tailor";
    const openTailoringUpgrade = (source: "proactive" | "server_denial") => openUpgrade({
      feature: "ai_resume_tailoring",
      placement: draft.canonicalApplicationId ? "canonical_application_detail" : "application_composer",
      trigger: source === "server_denial" ? "server_entitlement_denial" : "tailor_resume",
      manualLabel: "Fill with my main resume",
      applicationId: draft.canonicalApplicationId ?? undefined,
      returnRoute: canonicalReturnRoute,
      onBeforeCheckout: () => rememberCheckoutDraft(draft),
      onManual: () => void fillApplication(draft, draft.canonicalApplicationId ? "tracker" : "composer"),
    }, source === "server_denial" ? { source: "server_denial" } : undefined);
    if (canUse("ai_resume_tailoring") !== true) {
      openTailoringUpgrade("proactive");
      return;
    }
    const company = draft.company.trim();
    const role = draft.role.trim();
    const portalUrl = draft.portalUrl.trim();
    const jobDescription = draft.jobDescription.trim();
    const reportGenerationFailure = (message: string, fields: ApplicationDraftField[] = []) => {
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
        if (updatedCanonical) {
          setCanonicalSelected(updatedCanonical);
        } else {
          selectPacket(created);
        }
        setNewApplication(EMPTY_APPLICATION_DRAFT);
        forgetCheckoutDraft();
        setShowNewApplication(false);
        track("application_generation_completed", { source: draft.jobId ? "monitored_job" : "manual" });
        setNotice(keepCanonicalDetail
          ? "Tailored resume ready. You can write the cover letter without creating another Tracker row."
          : "Your resume is ready. We will check whether this employer wants a cover letter.");
        if (draft.jobId && !keepCanonicalDetail) await askPrescriptQuestions(draft.jobId);
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

      const history = await api<{ resumes: GeneratedResume[] }>("/resume/history");
      const fallbackCreated = history.resumes.find((packet) => packet.id === generated.resume_id);
      setPackets(history.resumes);
      if (!fallbackCreated?.spec._review) throw new Error("Your resume was made, but we could not open it. Reload the page.");
      completeOperationId(resumeOperationIds.current, operationKey);
      selectPacket(fallbackCreated);
      setNewApplication(EMPTY_APPLICATION_DRAFT);
      forgetCheckoutDraft();
      setShowNewApplication(false);
      track("application_generation_completed", { source: draft.jobId ? "monitored_job" : "manual" });
      setNotice("Your resume is ready. We will check whether this employer wants a cover letter.");
    } catch (reason) {
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
      setCreating(null);
    }
  }

  async function generateCoverLetter(
    applicationId = selected?.id,
    options: {
      canonicalApplicationId?: string;
      errorSurface?: "page" | "canonical";
      jdText?: string;
      onManual?: () => void;
    } = {},
  ) {
    if (!applicationId) return;
    const targetApplicationId = options.canonicalApplicationId
      ?? canonicalIdByPacketId[applicationId]
      ?? applicationId;
    const returnRoute = options.canonicalApplicationId
      ? `/dashboard/applications?application=${encodeURIComponent(targetApplicationId)}&intent=detail&checkout_action=cover-letter`
      : `/dashboard/applications?application=${encodeURIComponent(applicationId)}&intent=apply&checkout_action=cover-letter`;
    const reportCoverLetterFailure = (message: string) => {
      if (options.errorSurface === "canonical") setCanonicalFillError(message);
      else setError(message);
    };
    const openCoverLetterUpgrade = (source: "proactive" | "server_denial") => openUpgrade({
      feature: "ai_cover_letter_generation",
      placement: options.canonicalApplicationId ? "canonical_application_detail" : "application_cover_letter",
      trigger: source === "server_denial" ? "server_entitlement_denial" : "generate_cover_letter",
      manualLabel: "Write it myself",
      applicationId: targetApplicationId,
      returnRoute,
      onManual: options.onManual,
    }, source === "server_denial" ? { source: "server_denial" } : undefined);
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
      if (isStructuredUpgradeDenial(reason, "ai_cover_letter_generation")) {
        openCoverLetterUpgrade("server_denial");
        return;
      }
      reportCoverLetterFailure(reason instanceof Error ? reason.message : "Could not generate the tailored cover letter.");
    } finally {
      setCoverLetterBusy(false);
    }
  }

  async function saveCanonicalCoverLetter(): Promise<void> {
    const applicationId = canonicalSelected?.id;
    if (!applicationId || !canonicalCoverLetterBody.trim()) return;
    setCoverLetterBusy(true);
    setCanonicalFillError(null);
    try {
      const result = await api<CanonicalCoverLetterResponse>(`/applications/${applicationId}/cover-letter`, {
        method: "PATCH",
        body: JSON.stringify({ body: canonicalCoverLetterBody }),
      });
      setCanonicalCoverLetter(result);
      setCanonicalCoverLetterBody(result.cover_letter.body ?? "");
      setNotice("Cover letter saved to this Tracker application.");
    } catch (reason) {
      setCanonicalFillError(reason instanceof Error ? reason.message : "We could not save this cover letter.");
    } finally {
      setCoverLetterBusy(false);
    }
  }

  async function uploadCanonicalCoverLetter(file: File): Promise<void> {
    const applicationId = canonicalSelected?.id;
    if (!applicationId) return;
    setCoverLetterBusy(true);
    setCanonicalFillError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<CanonicalCoverLetterResponse>(`/applications/${applicationId}/cover-letter/upload`, {
        method: "POST",
        body: form,
      });
      setCanonicalCoverLetter(result);
      setCanonicalCoverLetterBody(result.cover_letter.body ?? "");
      setCanonicalCoverLetterEditorOpen(true);
      setNotice("Cover letter uploaded to this Tracker application.");
    } catch (reason) {
      setCanonicalFillError(reason instanceof Error ? reason.message : "We could not upload this cover letter.");
    } finally {
      setCoverLetterBusy(false);
    }
  }

  async function deleteCanonicalCoverLetter(): Promise<void> {
    const applicationId = canonicalSelected?.id;
    if (!applicationId || !canonicalCoverLetter) return;
    setCoverLetterBusy(true);
    setCanonicalFillError(null);
    try {
      await api(`/applications/${applicationId}/cover-letter`, { method: "DELETE" });
      setCanonicalCoverLetter(null);
      setCanonicalCoverLetterBody("");
      setNotice("Cover letter removed from this application.");
    } catch (reason) {
      setCanonicalFillError(reason instanceof Error ? reason.message : "We could not remove this cover letter.");
    } finally {
      setCoverLetterBusy(false);
    }
  }

  async function saveCoverLetter(): Promise<boolean> {
    if (!selected) return false;
    const applicationId = selected.id;
    setCoverLetterBusy(true);
    setError(null);
    try {
      if (!qaMode) {
        if (!coverLetterBody.trim()) {
          if (selected.spec._cover_letter) {
            await api(`/applications/${applicationId}/cover-letter`, { method: "DELETE" });
            setPackets((current) => current?.map((packet) => packet.id === applicationId
              ? { ...packet, cover_letter_download_url: undefined, spec: { ...packet.spec, _cover_letter: undefined } }
              : packet) ?? current);
            applyCoverLetterToSubmission(applicationId, null);
            if (selectedIdRef.current === applicationId) setCoverLetterDownloadUrl(null);
            if (selectedIdRef.current === applicationId) {
              setNotice("Cover letter removed from this application.");
            }
          }
          return true;
        }
        const result = await api<CoverLetterResponse>(`/applications/${applicationId}/cover-letter`, { method: "PATCH", body: JSON.stringify({ body: coverLetterBody }) });
        setPackets((current) => current?.map((packet) => packet.id === applicationId ? { ...packet, cover_letter_download_url: result.download_url, spec: { ...packet.spec, _cover_letter: result.cover_letter } } : packet) ?? current);
        applyCoverLetterToSubmission(applicationId, result.cover_letter);
        if (selectedIdRef.current === applicationId) {
          setCoverLetterBody(result.cover_letter.body);
          setCoverLetterDownloadUrl(result.download_url);
        }
      }
      if (selectedIdRef.current === applicationId) {
        setNotice("Cover letter saved. Every line checks out against your real work.");
      }
      return true;
    } catch (reason) {
      if (selectedIdRef.current === applicationId) {
        setError(reason instanceof Error ? reason.message : "We could not save your cover letter. Try again.");
      }
      return false;
    } finally {
      setCoverLetterBusy(false);
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
        setNotice("Resume saved and rechecked.");
        return { spec: savedSpec, review: savedReview };
      }
      if (!selected.spec._review) return null;
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

  async function continueFromResume() {
    if (coverLetterBusy) {
      setError("Wait for the cover letter check to finish before preparing the application.");
      return;
    }
    if (!selected || !spec || !review) return;
    const applicationId = selected.id;
    /* Workflow status does not say whether the editor is dirty. A ready packet can be edited, and
       auditing that edit without saving would ask the server to audit its older PDF forever. A
       fresh packet with no edits needs no no-op PATCH. The exact local-vs-saved comparison is the
       only fact that decides whether a new PDF must be generated. */
    const savedResume = packetDraftChanged ? await saveResume() : { spec, review };
    if (!savedResume || selectedIdRef.current !== applicationId) return;
    const auditedSpec = savedResume.spec;
    const canonicalReview = savedResume.review;
    const alreadyFilled = canonicalReview.status === "ready_for_final_approval";
    if (!alreadyFilled && !qaMode && !(await saveCoverLetter())) return;
    if (selectedIdRef.current !== applicationId) return;
    const missingRequiredAnswers = questions.filter((question) => question.required && !question.answer.trim());
    if (missingRequiredAnswers.length > 0) {
      moveToScreen("questions");
      return;
    }
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
        const saved = await api<SubmissionResponse>(`/applications/${applicationId}/review`, {
          method: "PUT",
          body: JSON.stringify({
            ats_name: atsName,
            portal_url: portalUrl,
            questions,
            skipped_reasons: canonicalReview.skipped_reasons,
          }),
        });
        savedReview = saved.review;
        if (selectedIdRef.current !== applicationId) return;
        setSubmission((current) => current?.application_id === applicationId ? { ...current, review: saved.review } : current);
        setPackets((current) => current?.map((packet) => packet.id === applicationId
          ? { ...packet, spec: { ...packet.spec, _review: saved.review } }
          : packet) ?? current);
      } else if (answerWrite === "answers_only") {
        /* The same helper the Save button uses, so there is one definition of this request and one
           reading of the 202 that means a run wrote to the packet under it.

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
      const auditedReview = { ...savedReview, packet_audit: response.packet_audit };
      setPackets((current) => current?.map((packet) => packet.id === applicationId
        ? { ...packet, download_url: response.pdf.download_url, spec: { ...packet.spec, _review: auditedReview } }
        : packet) ?? current);
      setSubmission((current) => current?.application_id === applicationId ? { ...current, review: auditedReview } : current);
      setPacketEvidence({
        applicationId,
        response,
        specJson: JSON.stringify(auditedSpec),
        questionsSnapshot: currentQuestionsSnapshot,
        pdfVerified: false,
        acknowledged: false,
        serverRevalidatedAt: null,
      });
      setNotice("The exact saved packet passed the server audit. Read the requirement evidence while the PDF loads.");
    } catch (reason) {
      if (selectedIdRef.current !== applicationId) return;
      setPacketEvidence(null);
      setError(reason instanceof Error ? reason.message : "Litos could not audit this exact packet.");
    } finally {
      setPacketAuditBusy(false);
    }
  }

  async function continueFromVerifiedPacket() {
    if (!packetEvidenceReady || !activePacketEvidence) {
      setError(packetEvidenceBlocker ?? "Audit and load the exact packet before continuing.");
      return;
    }
    const applicationId = activePacketEvidence.applicationId;
    if (packetAuditInFlight.current === applicationId) return;
    packetAuditInFlight.current = applicationId;
    const audit = activePacketEvidence.response.packet_audit;
    const pdf = activePacketEvidence.response.pdf;
    setPacketAuditBusy(true);
    setError(null);
    try {
      const result = await api<unknown>(`/applications/${applicationId}/packet-audit/acknowledge`, {
        method: "POST",
        body: JSON.stringify({
          audit_digest: audit.audit_digest,
          packet_version: audit.packet_version,
          pdf_sha256: pdf.sha256,
          size_bytes: pdf.size_bytes,
        }),
      });
      if (!packetAuditAcknowledgementAccepted(result)) throw new Error("Litos did not confirm this exact packet review.");
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
      await prepareApplication(questions);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Litos could not record this exact packet review.");
    } finally {
      if (packetAuditInFlight.current === applicationId) packetAuditInFlight.current = null;
      setPacketAuditBusy(false);
    }
  }

  async function prepareApplication(
    finalQuestions = questions,
    /* `restart` is PR #375's flag and rides this function rather than a fourth caller of
       submit-request. There were two call sites of that route and there is a rule about it: a
       second send path is how a gate gets routed around. What a restart needs that a first
       preparation does not is one boolean in the body, so it is one boolean here. */
    options: { allowServerAnswerRefresh?: boolean; restart?: boolean } = {},
  ) {
    if (!selected) return;
    const applicationId = selected.id;
    if (!options.allowServerAnswerRefresh && finalQuestions.some((question) => question.required && !question.answer.trim())) {
      setError("Some answers are missing. Add them first.");
      return;
    }
    setPrepareStartedAt(new Date().toISOString());
    setSubmittingPhase("preparing");
    moveToScreen("submitting");
    setError(null);
    setSendRefusal(null);
    track("application_submission_requested", { source: qaMode ? "qa" : options.restart ? "restart" : "review" });
    try {
      if (!qaMode) {
        const result = await api<SubmissionResponse>(`/applications/${applicationId}/submit-request`, {
          method: "POST",
          body: JSON.stringify({ questions: finalQuestions, ...(options.restart ? { restart: true } : {}) }),
        });
        captureCompletedSubmission(result, options.restart ? "restart" : "review");
        setPackets((current) => current?.map((packet) => packet.id === applicationId ? packetWithSubmission(packet, result) : packet) ?? current);
        if (selectedIdRef.current !== applicationId) return;
        const incomingCoverLetter = submissionCoverLetterField(result);
        if (incomingCoverLetter.included) {
          setCoverLetterBody(incomingCoverLetter.value?.body ?? "");
          if (!incomingCoverLetter.value) setCoverLetterDownloadUrl(null);
        }
        setSubmission(result);
        // This response is the END of the run, not an acknowledgement of its start, and it is
        // routinely terminal ("failed", "needs_attention", "ready_for_final_approval"). It used to
        // be installed into state and then ignored for routing, which left the progress screen
        // spinning over a run that was already over.
        moveToScreen(screenForStatus(result.review.status, "submitting"));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 650));
        const now = new Date().toISOString();
        setSubmission({ application_id: selected.id, review: { ...review!, status: "submitted", submission_authorized_at: now, submitted_at: now, filled_fields: ["name", "email", "resume", "cover letter"], receipt: { confirmation_text: "Thank you. Your controlled test application was received.", final_url: "/qa/portal-submission/success", screenshot_url: "/qa/portal-receipt.svg", captured_at: now, reference_id: "LITOS-QA-2027" } } });
        moveToScreen("submitted");
        return;
      }
    } catch (reason) {
      /* A restart is pressed FROM the portal screen and is about the packet on it, so its refusal
         goes back there and lands beside the control, not on the review screen behind a banner. */
      moveToScreen(options.restart ? "portal" : "review");
      const message = reason instanceof Error ? reason.message : "We could not open the company's application page.";
      const issues = reason instanceof ApiError ? reason.issues : [];
      if (options.restart) refuseSend(applicationId, message, issues);
      else setError(message);
    }
  }

  async function completeHandoff(outcome: "cleared" | "submitted" = "cleared") {
    if (!selected || !submission) return;
    if (submission.application_id !== selected.id) return;
    setError(null);
    try {
      const result = qaMode
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
        : await api<SubmissionResponse>(`/applications/${selected.id}/submission/handoff-complete`, {
          method: "POST",
          body: JSON.stringify({ outcome }),
        });
      setSubmission(result);
      moveToScreen(result.review.status === "submitted" ? "submitted" : "portal");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not tell whether it went through.");
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
    setError(null);
    try {
      const result = qaMode
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
        : await api<SubmissionResponse>(`/applications/${selected.id}/submission/self-submitted`, { method: "POST" });
      setSubmission(result);
      moveToScreen(result.review.status === "submitted" ? "submitted" : "portal");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not record that you sent this one yourself.");
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
    if (intent === "confirm" && focusQuestionId && merged.some((question) => question.id === focusQuestionId)) {
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

  /* Save on the REVIEW-ANSWERS screen, which is reached from a run that stopped and needs a real
   * write. See features/applications/domain/review-answer-save.ts for the route and why it is
   * neither of the two that already existed.
   *
   * The banner is the RESPONSE's, and a refusal leaves her on this screen with everything she typed
   * still in the boxes: the answers exist only here until the server says otherwise, so navigating
   * away from a failed save would destroy them a second time. */
  async function saveReviewedAnswers() {
    if (!selected || !submission || submission.application_id !== selected.id) return;
    const applicationId = selected.id;
    if (savingAnswersRef.current === applicationId) return;
    savingAnswersRef.current = applicationId;
    setSavingAnswersId(applicationId);
    setError(null);
    setNotice(null);
    try {
      /* The CONFIRM presses recorded for THIS application, flagged onto exactly those questions and
         no others. A question she confirmed and then emptied is not flagged: a confirmation of a
         blank claims nothing, and the server would mint nothing for it anyway. */
      const confirmedIds = confirmIntentsRef.current.get(applicationId) ?? null;
      const result = await saveReviewAnswers<SubmissionResponse["review"]>({
        applicationId,
        questions: confirmedIds
          ? questions.map((question) => confirmedIds.has(question.id) && question.answer.trim()
            ? { ...question, confirmed: true }
            : question)
          : questions,
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
      // The switcher renders above this screen, so tapping another row mid-save is a single tap.
      // Same guard, same reason, as approveFinalSubmission.
      if (selectedIdRef.current !== applicationId) return;
      if (!result.saved) {
        setError(result.message);
        return;
      }
      const saved: SubmissionResponse = { ...submission, application_id: applicationId, review: result.review };
      submissionRef.current = saved;
      setSubmission(saved);
      setPackets((current) => current?.map((packet) => packet.id === applicationId ? packetWithSubmission(packet, saved) : packet) ?? current);
      setQuestions(mergeDiscoveredQuestions(questions, result.review.questions));
      setFocusQuestion(null);
      moveToScreen(screenForStatus(result.review.status, "portal"));
      setNotice(result.notice);
    } finally {
      if (savingAnswersRef.current === applicationId) savingAnswersRef.current = null;
      setSavingAnswersId((current) => current === applicationId ? null : current);
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
      const result = await api<SubmissionResponse & { already_attempted?: boolean; outcome?: string }>(
        `/applications/${requestedId}/security-code`,
        { method: "POST", body: JSON.stringify({ code }) },
      );
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
      setSecurityCodeError(reason instanceof Error ? reason.message : "Could not send the security code.");
    } finally {
      securityCodeInFlight.current = null;
      setSecurityCodeId(null);
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
        const result = await api<SubmissionResponse>(`/applications/${selected.id}/submission/approve`, { method: "POST" });
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

  if (error && packets === null) {
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
    <div className={reviewOpen ? "space-y-4" : "space-y-6"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={`font-normal leading-[1.15] tracking-[-0.02em] text-ink ${reviewOpen ? "text-heading" : "text-section"}`}>Applications</h1>
          {/* Every selected screen needs a way back to the mobile list. Desktop keeps the compact
              switcher beside the detail, so this control would only repeat it there. */}
          {selected && spec && review && (
            <button
              type="button"
              onClick={() => {
                selectedIdRef.current = null;
                setSelectedId(null);
                setMatchResult(null);
              }}
              className="mt-1 text-sm text-muted transition-colors hover:text-ink"
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
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            variant={showNewApplication ? "quiet" : "primary"}
            onClick={showNewApplication ? closeNewApplication : () => setShowNewApplication(true)}
          >
            {showNewApplication ? "Close" : "Fill application"}
          </Button>
        </div>
      </div>

      {/* No autopilot.error row here any more. That error is only ever set by the toggle's own
          save, and the toggle is on Jobs now, so a copy on this page could never fire. */}
      {!selected && canUse("automatic_submission") !== false && <AutopilotLockNote enabled={autopilot.enabled} eligibility={autopilot.eligibility} />}
      {!selected && preferenceError && <ErrorNote message={preferenceError} />}
      {!selected && packets !== null && reviewablePackets.length > 0 && (
        <NextMatchCard
          match={nextMatch}
          /* The only thing this card is still waiting on. Packets are loaded by the time it mounts
             (the guard above requires it), so the preferences fetch is what decides whether a null
             match means "not yet" or "none". It settles to [] even when it fails, so this cannot
             stay true forever the way `match === null` could. */
          searching={currentMatches === null}
          autopilot={Boolean(autopilot.enabled)}
          appliedToday={appliedToday}
          onSend={(id) => void sendWithoutAsking(id)}
          onOpen={(id) => {
            const packet = (packets ?? []).find((item) => item.id === id);
            if (packet) selectPacket(packet);
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
      {(error ?? pollError) && <ErrorNote message={error ?? pollError!} />}
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
          onTailor={() => void createApplication()}
          creating={creating}
          onFetchJobDescription={fetchJobDescription}
          extractingJd={extractingJd}
          refusal={composerRefusal}
        />
      )}
      {legacyCount > 0 && !reviewOpen && (
        <p className="border-y border-border py-3 text-sm text-muted">
          {legacyCount} saved resume{legacyCount === 1 ? "" : "s"} · Add a job URL to turn one into a reviewable application.
        </p>
      )}

      {/* Two reasons this section exists, and it has to render for both.

          With a packet open it is the switcher: the only in-context way to move to another
          application. With nothing open and a filter on, it is the answer to the deep link Home
          just followed. Gating the whole thing on `selected` made every ?state= arrival inert,
          because the filter it had just set had no rows to apply to and no visible control to
          change: Home's banner promised the applications that had stopped for the student and
          delivered the same board as the plain URL.

          It stays hidden on an unfiltered board view, where it would only restate the board below
          it. Setting the select back to Everything is what closes it, which is also how the
          filter is cleared. */}
      {packets !== null && (selected ? reviewablePackets.length > 1 : ledgerRendersOnLanding(applicationFilter, reviewablePackets.length)) && (
        /* Keep the switcher above every screen branch. Historical marker for the invariant:
           packet.job_context.role} · {packet.job_context.company} */
        /* Every control in here used to sit behind `hidden lg:block`. Filter and sort being
           desktop-only was a deliberate trade; the switcher going with them was not, and it is the
           only in-context way to move between applications, so a phone user's sole escape from an
           open packet was the "All applications" link. Litos's traffic is TikTok and Instagram, so
           most real sessions were the ones missing it. */
        <section aria-labelledby="application-ledger-heading" className="border-y border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
              {/* Visible whenever this is the landing view for a filter, so the student reads what
                  they are looking at in words. Beside an open packet it goes back to being the
                  switcher's label: the heading there would compete with the packet's own. */}
              <h2 id="application-ledger-heading" className={selected || canonicalSelected ? "sr-only" : "text-sm font-medium text-ink"}>
                {selected || canonicalSelected ? "Your applications" : applicationFilterHeading(applicationFilter)}
              </h2>
              <span data-testid="application-ledger-count" className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted">{visiblePackets.length} of {reviewablePackets.length}</span>
              {duplicatePostingNote(duplicateMarks) && (
                <span className="basis-full text-xs text-muted">{duplicatePostingNote(duplicateMarks)}</span>
              )}
            </div>
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
                <option value="recent">Recent first</option>
                <option value="company">Company A-Z</option>
              </select>
            </div>
          </div>
          {/* Below lg the ledger becomes a horizontally scrolling strip of chips rather than a
              table. Four columns of role, company, date and status do not survive 375px, and a
              vertical list of 50 rows between the page header and the review surface would bury
              the thing the student actually opened. The strip is the shape this codebase already
              uses for the same problem: the Board's stage picker and the Account tab strip. The
              negative margin lets it bleed to both edges of the phone screen, so the last chip is
              visibly cut rather than looking like the end of the list. */}
          <div className="-mx-4 overflow-x-auto border-t border-border px-4 py-2.5 sm:-mx-6 sm:px-6 lg:hidden">
            {visiblePackets.length === 0 ? (
              <>
                <p className="py-2 text-sm text-muted">No applications in this view.</p>
                <Button
                  type="button"
                  onClick={() => setApplicationFilter("all")}
                  variant="secondary"
                >
                  Show all applications
                </Button>
              </>
            ) : (
              <div className="flex min-w-max gap-2">
                {visiblePackets.map((packet) => (
                  <button
                    key={packet.id}
                    type="button"
                    onClick={() => selectPacket(packet)}
                    aria-pressed={packet.id === selected?.id || packet.id === canonicalSelected?.id}
                    className={`flex min-h-11 max-w-[15rem] shrink-0 flex-col justify-center rounded-inner border px-3 py-2 text-left ${packet.id === selected?.id || packet.id === canonicalSelected?.id ? "border-brand bg-brand-soft" : "border-border"}`}
                  >
                    <span className={`truncate text-[13px] font-medium ${packet.id === selected?.id || packet.id === canonicalSelected?.id ? "text-brand-ink" : "text-ink"}`}>{packet.job_context.role || "Role"}</span>
                    <span className="truncate text-[11px] text-muted">{packet.job_context.company || "Company"}</span>
                    {duplicateBadge(duplicateMarks.get(packet.id)) && (
                      <span className="mt-1 truncate text-[10px] uppercase tracking-[0.05em] text-muted">
                        {duplicateBadge(duplicateMarks.get(packet.id))!.label}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Whole rows: max-h-72 cut the fifth row in half, which reads as a broken layout
              rather than as "there is more below". */}
          <div className="hidden max-h-[280px] overflow-y-auto border-t border-border lg:block">
            {visiblePackets.length === 0 ? (
              <div className="flex items-center justify-between gap-4 py-3">
                <p className="text-sm text-muted">No applications in this view.</p>
                <Button
                  type="button"
                  onClick={() => setApplicationFilter("all")}
                  variant="secondary"
                >
                  Show all applications
                </Button>
              </div>
            ) : (
              <>
                {/* An unlabelled column of company names and bare dates left "Jul 21, 2026"
                    meaning nothing. Say what each column is. */}
                <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border px-2 py-2 text-[11px] text-muted sm:grid">
                  <span>Role</span>
                  <span>Company</span>
                  <span>Last updated</span>
                  <span>Status</span>
                </div>
                {/* Each row declares type="button" rather than leaving it to the default. A bare
                    button is a SUBMIT button, and the whole value of a ledger row is that pressing
                    it changes what this page is showing rather than navigating. The chip strip
                    above already declares it; this one, the desktop row and the one students on a
                    laptop actually press, was the only control on the screen still relying on there
                    being no form element anywhere above it. */}
                <div className="divide-y divide-border">
                  {visiblePackets.map((packet) => (
                    <button key={packet.id} type="button" onClick={() => selectPacket(packet)} aria-pressed={packet.id === selected?.id || packet.id === canonicalSelected?.id} className={`grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 text-left transition-colors sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] ${packet.id === selected?.id || packet.id === canonicalSelected?.id ? "bg-brand-soft/55" : "hover:bg-surface-alt"}`}>
                      <span className="truncate text-sm font-medium text-ink">{packet.job_context.role || "Role"}</span>
                      <span className="hidden truncate text-xs text-muted sm:block">{packet.job_context.company || "Company"}</span>
                      <time className="hidden text-xs text-muted sm:block">{formatRelativeDate(packetTimestamp(packet))}</time>
                      {/* A column where every cell reads the same carries no information and costs
                          a fifth of the row. It only renders when the rows actually differ. */}
                      {/* Two chips, not one, and the order is deliberate: the status is what the
                          row IS and the duplicate mark is what it costs. "Already applied" is the
                          one that changes what she can do, because the backend refuses that send
                          with a 409 rather than sending a second application the employer counts
                          against her. */}
                      <span className="flex items-center gap-1.5">
                        {packet.spec._review && <Chip label={statusLabel(false, packet.spec._review.status)} kind={chipKind(packet.spec._review.status)} />}
                        {(() => {
                          const badge = duplicateBadge(duplicateMarks.get(packet.id));
                          return badge ? <Chip label={badge.label} kind={badge.kind} /> : null;
                        })()}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {packets === null ? (
        <ShimmerRows rows={4} />
      ) : canonicalSelected ? (
        <CanonicalApplicationDetail
          application={canonicalSelected}
          fillBusy={creating === "fill"}
          tailorBusy={creating === "tailor"}
          coverLetterBusy={coverLetterBusy}
          coverLetterLoading={canonicalCoverLetterLoading}
          hasTailoredResume={canonicalGeneratedPacket !== null}
          coverLetter={canonicalCoverLetter}
          coverLetterBody={canonicalCoverLetterBody}
          coverLetterJd={canonicalCoverLetterJd}
          coverLetterEditorOpen={canonicalCoverLetterEditorOpen}
          coverLetterDownloadUrl={canonicalCoverLetter?.download_url ?? canonicalGeneratedPacket?.cover_letter_download_url ?? null}
          error={canonicalFillError}
          onBack={() => {
            setCanonicalSelected(null);
            setCanonicalFillError(null);
          }}
          onFill={() => void fillApplication({
            company: canonicalSelected.company,
            role: canonicalSelected.role,
            portalUrl: canonicalSelected.portal_url ?? "",
            jobDescription: "",
            jobId: canonicalSelected.job_id ?? null,
            canonicalApplicationId: canonicalSelected.id,
          }, "tracker")}
          onTailor={() => void tailorCanonicalApplication(canonicalSelected)}
          onOpenCoverLetterEditor={() => {
            setCanonicalCoverLetterEditorOpen(true);
            setCanonicalCoverLetterBody((current) => current || canonicalGeneratedPacket?.spec._cover_letter?.body || "");
          }}
          onGenerateCoverLetter={() => {
            void generateCoverLetter(canonicalGeneratedPacket?.id ?? canonicalSelected.id, {
              canonicalApplicationId: canonicalSelected.id,
              errorSurface: "canonical",
              jdText: canonicalCoverLetterJd,
              onManual: () => setCanonicalCoverLetterEditorOpen(true),
            });
          }}
          onCoverLetterBodyChange={setCanonicalCoverLetterBody}
          onCoverLetterJdChange={setCanonicalCoverLetterJd}
          onSaveCoverLetter={() => void saveCanonicalCoverLetter()}
          onUploadCoverLetter={(file) => void uploadCanonicalCoverLetter(file)}
          onDeleteCoverLetter={() => void deleteCanonicalCoverLetter()}
          onOpenPacket={() => canonicalEnvelopePacket && setRevisitingId(canonicalEnvelopePacket.id)}
        />
      ) : reviewablePackets.length === 0 ? (
        <EmptyState visual="applications" title={legacyCount > 0 ? `${legacyCount} resumes saved` : "No applications yet"} body={legacyCount > 0 ? "Add a job URL to fill the form or prepare a tailored packet." : "Add a job URL. Filling is unlimited, and tailoring is available with Litos+."}>
          <Button type="button" onClick={() => setShowNewApplication(true)}>Fill application</Button>
        </EmptyState>
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
                <Button variant="secondary" onClick={() => { selectedIdRef.current = null; setSelectedId(null); }}>Back to all applications</Button>
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
          openableIds={new Set((packets ?? []).map((item) => item.id))}
          onOpen={(id) => {
            const packet = (packets ?? []).find((item) => item.id === id);
            if (packet) selectPacket(packet);
          }}
          /* Revisit does NOT call selectPacket. Selecting drives the review flow and moves the
             whole page onto a screen for that packet; looking at what was already sent should
             leave the board exactly where it was, so this opens over the top and closes back to
             the same scroll position. */
          onRevisit={setRevisitingId}
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
          questions={questions}
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
             keeping them. From a stopped run there is no such request coming, so the same handler
             kept nothing. Either way the prior exact-packet audit is void, because the answers it
             was taken over are no longer the answers on the packet. */
          onSubmit={() => {
            setPacketEvidence(null);
            if (selectedSubmission?.review.status === "needs_attention") void saveReviewedAnswers();
            else saveApplyAnswers();
          }}
          saving={savingAnswersId === selected?.id}
          reviewDiscovered={selectedSubmission?.review.status === "needs_attention"}
          focusQuestion={focusQuestion}
          prescriptNote={prescriptNote}
        />
      ) : screen === "submitting" ? (
        <PortalProgress
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
          onReviewPacket={() => moveToScreen("review")}
          onReviewQuestions={() => reviewPortalQuestions()}
          onOpenQuestion={(questionId, intent) => reviewPortalQuestions(questionId, intent)}
          onAddDocument={askForDocument}
          onSelfSubmitted={() => void recordSelfSubmitted()}
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
                      jdText={review.jd_text}
                      spec={deferredSpec ?? spec}
                      jobContext={selected.job_context}
                      onResult={setMatchResult}
                      disabled={qaMode !== false}
                    />}
                  {/* On desktop the review itself scrolls inside two fixed-height panes. Keeping
                      the primary action after those panes put it below the viewport before the
                      student had taken any action. The same exact-packet gate is available here
                      immediately, while narrower screens retain the sticky terminal bar. */}
                  <div className="hidden items-center gap-2 lg:flex">
                    {review.portal_supported === false && (
                      <p className="max-w-xs text-right text-xs leading-5 text-muted">
                        Litos cannot fill in this company’s page. Your resume is ready, so apply on their site.
                      </p>
                    )}
                    {(activePacketEvidence?.response.pdf.download_url ?? selected.download_url) && (activePacketEvidence?.response.pdf.download_url ?? selected.download_url) !== "#" && (
                      <a href={activePacketEvidence?.response.pdf.download_url ?? selected.download_url} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View PDF</a>
                    )}
                    {review.portal_supported === false
                      ? review.portal_url && <a href={review.portal_url} target="_blank" rel="noreferrer" className="rounded-full bg-action px-5 py-2.5 text-sm font-medium text-action-ink hover:bg-brand-ink">Open the company page</a>
                      : <Button
                        onClick={packetEvidenceReady ? continueFromVerifiedPacket : continueFromResume}
                        disabled={reviewPrimaryDisabled}
                        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        {reviewPrimaryBusy ? <PendingLabel state="solving" onColor>Making...</PendingLabel> : reviewPrimaryLabel}
                      </Button>}
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-border pt-2.5">
                <MatchLegend missingCount={authoritativeMissingCount} editedCount={authoritativeEditedCount} />
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
                      : <RequirementText text={review.jd_text} />}
                  </div>
                  {/* Every requirement the posting states, met or not, with the student's own
                      bullet as the reason. Collapsed behind a click because it costs a model call
                      the first time: opening it is the student asking. Sits directly under the
                      posting so a row can be read against the sentence it came from. */}
                  <div className="mt-5 border-t border-border pt-4">
                    {activePacketEvidence
                      ? <PacketAuditBreakdown jdText={review.jd_text} audit={activePacketEvidence.response.packet_audit} />
                      : <RequirementBreakdown
                        jdText={review.jd_text}
                        spec={deferredSpec ?? spec}
                        jobContext={selected.job_context}
                        disabled={qaMode !== false}
                      />}
                  </div>
                  {/* Preparation for later, under the posting it comes from. Collapsed by default:
                      expanding it is the student saying they are at that stage. */}
                  <div className="mt-5 border-t border-border pt-4">
                    <InterviewPrep jdText={review.jd_text} spec={deferredSpec ?? spec} jobContext={selected.job_context} />
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
                        <Button type="button" size="sm" variant="secondary" onClick={() => setPacketEvidence(null)}>Edit resume</Button>
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
                <Button type="button" onClick={() => void generateCoverLetter()} disabled={coverLetterBusy} variant="secondary" className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{coverLetterBody ? "Regenerate" : "Generate"}</Button>
                <Button type="button" onClick={saveCoverLetter} disabled={coverLetterBusy || (!coverLetterBody.trim() && !selected.spec._cover_letter)} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{coverLetterBusy ? "Checking..." : coverLetterBody.trim() ? "Save cover letter" : "Remove cover letter"}</Button>
              </div>
            </div>
            <textarea aria-label="Tailored cover letter" value={coverLetterBody} onChange={(event) => setCoverLetterBody(event.target.value)} rows={12} placeholder="Generate a cover letter tailored to this job description" className="mt-5 w-full rounded-inner border border-control-border bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none focus:border-brand" />
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
          <TerminalActionBar className="justify-end sm:justify-between lg:hidden">
            {review.portal_supported === false
              ? <p className="text-sm text-ink">Litos cannot fill in this company’s page. Your resume is ready, so apply on their site.</p>
              : <p className="hidden text-sm text-ink sm:block">Litos fills the form with your saved answers and this resume.</p>}
            <div className="flex gap-2">
              {(activePacketEvidence?.response.pdf.download_url ?? selected.download_url) && (activePacketEvidence?.response.pdf.download_url ?? selected.download_url) !== "#" && <a href={activePacketEvidence?.response.pdf.download_url ?? selected.download_url} className="rounded-full border border-border px-4 py-2.5 text-sm font-medium text-ink">View PDF</a>}
              {review.portal_supported === false
                ? review.portal_url && <a href={review.portal_url} target="_blank" rel="noreferrer" className="rounded-full bg-action px-5 py-2.5 text-sm font-medium text-action-ink hover:bg-brand-ink">Open the company page</a>
                : <Button onClick={packetEvidenceReady ? continueFromVerifiedPacket : continueFromResume} disabled={reviewPrimaryDisabled} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
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
  fillBusy,
  tailorBusy,
  coverLetterBusy,
  coverLetterLoading,
  hasTailoredResume,
  coverLetter,
  coverLetterBody,
  coverLetterJd,
  coverLetterEditorOpen,
  coverLetterDownloadUrl,
  error,
  onBack,
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
  fillBusy: boolean;
  tailorBusy: boolean;
  coverLetterBusy: boolean;
  coverLetterLoading: boolean;
  hasTailoredResume: boolean;
  coverLetter: CanonicalCoverLetterResponse | null;
  coverLetterBody: string;
  coverLetterJd: string;
  coverLetterEditorOpen: boolean;
  coverLetterDownloadUrl: string | null;
  error: string | null;
  onBack: () => void;
  onFill: () => void;
  onTailor: () => void;
  onOpenCoverLetterEditor: () => void;
  onGenerateCoverLetter: () => void;
  onCoverLetterBodyChange: (body: string) => void;
  onCoverLetterJdChange: (body: string) => void;
  onSaveCoverLetter: () => void;
  onUploadCoverLetter: (file: File) => void;
  onDeleteCoverLetter: () => void;
  onOpenPacket: () => void;
}) {
  const submitted = application.submission_state === "submitted";
  const updatedAt = application.updated_at ?? application.created_at;
  return (
    <Card className="overflow-hidden">
      <div className="grid h-1 grid-cols-3" aria-hidden="true"><span className="bg-teal" /><span className="bg-brand" /><span className="bg-coral" /></div>
      <div className="p-6">
        <button type="button" onClick={onBack} className="min-h-11 text-small text-muted hover:text-ink">← All applications</button>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-label uppercase tracking-[0.08em] text-teal-ink">Free application fill</p>
            <h2 className="mt-2 text-heading font-[450] text-ink">{application.role}</h2>
            <p className="mt-1 text-small text-muted">{application.company}{updatedAt ? ` · Updated ${formatRelativeDate(updatedAt)}` : ""}</p>
          </div>
          <Chip label={submitted ? "Sent" : "Needs you"} kind={submitted ? "sent" : "warn"} />
        </div>
        <div className="mt-5 rounded-inner border border-border bg-surface-alt p-4">
          <p className="text-small font-medium text-ink">{submitted ? "This application is recorded as sent." : "Continue on the employer's form."}</p>
          <p className="mt-1 text-small leading-6 text-muted">
            {submitted
              ? "Tracker keeps this canonical record even when no tailored resume packet was generated."
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
            <Button type="button" variant="secondary" disabled={tailorBusy || fillBusy || coverLetterBusy} onClick={onTailor}>
              {tailorBusy ? "Tailoring..." : "Tailor resume"}
            </Button>
            <Button type="button" variant="secondary" disabled={tailorBusy || coverLetterBusy || coverLetterLoading} onClick={onOpenCoverLetterEditor}>
              {coverLetterLoading ? "Loading..." : "Write cover letter"}
            </Button>
            {hasTailoredResume && <Button type="button" variant="quiet" onClick={onOpenPacket}>Open tailored packet</Button>}
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
                <Button type="button" disabled={coverLetterBusy || !coverLetterBody.trim()} onClick={onSaveCoverLetter}>
                  {coverLetterBusy ? "Saving..." : "Save cover letter"}
                </Button>
                <Button type="button" variant="secondary" disabled={coverLetterBusy || (!hasTailoredResume && !coverLetterJd.trim())} onClick={onGenerateCoverLetter}>
                  Draft with Litos+
                </Button>
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-control-border px-5 text-small font-medium text-ink hover:border-ink">
                  Upload PDF or text
                  <input
                    type="file"
                    accept="application/pdf,text/plain,.pdf,.txt"
                    className="sr-only"
                    disabled={coverLetterBusy}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) onUploadCoverLetter(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {coverLetter && (
                  <Button type="button" variant="quiet" disabled={coverLetterBusy} onClick={onDeleteCoverLetter}>
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
          {!submitted && application.portal_url && (
            <Button type="button" disabled={fillBusy || tailorBusy} onClick={onFill}>
              {fillBusy ? "Checking extension..." : "Open and fill application"}
            </Button>
          )}
          {!submitted && !application.portal_url && <p className="text-small text-muted">This record has no employer form URL. Add the job again with its exact HTTPS application link.</p>}
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
  onTailor: () => void;
  creating: "fill" | "tailor" | null;
  onFetchJobDescription: () => void;
  extractingJd: boolean;
  /** Why the last press of a composer button did nothing, which boxes it was about, and which of
      the two buttons is being answered. */
  refusal: { message: string; fields: ApplicationDraftField[]; at: ComposerSlot } | null;
}) {
  const patch = (next: Partial<NewApplicationDraft>) => onChange({ ...value, ...next });
  const invalid = (field: ApplicationDraftField) => refusal?.fields.includes(field) ?? false;
  return (
    <Card className="p-6">
      <div className="max-w-2xl">
        <p className="text-xs text-muted">New application</p>
        <h2 className="mt-2 text-xl font-medium text-ink">Fill an application.</h2>
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
      <label className="mt-4 block text-xs font-medium text-muted" htmlFor="new-application-jd">Job description</label>
      <textarea id="new-application-jd" value={value.jobDescription} onChange={(event) => patch({ jobDescription: event.target.value })} rows={12} placeholder="Optional for filling. Paste the complete job description to tailor a resume." aria-invalid={invalid("jobDescription") || undefined} className={`mt-1.5 w-full rounded-inner border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand ${invalid("jobDescription") ? "border-danger" : "border-control-border"}`} />
      {/* Beside the button that raised it, not in the page banner far above it. The button and this
          line are in the same flex row, so a student who can reach the button can read the refusal
          without scrolling: no scrollIntoView, no requestAnimationFrame, nothing that stops running
          in a background tab. role="alert" is here and nowhere else for this message, so a screen
          reader still hears it exactly once. */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <ComposerRefusalNote refusal={refusal} at="action" />
        <Button type="button" variant="secondary" onClick={onTailor} disabled={creating !== null} className="border-brand text-brand-ink">
          {creating === "tailor" ? <PendingLabel state="composing">Tailoring</PendingLabel> : "Tailor resume"}
        </Button>
        <Button type="button" onClick={onFill} disabled={creating !== null}>
          {creating === "fill" ? <PendingLabel state="composing" onColor>Preparing form</PendingLabel> : "Fill application"}
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
  refusal: { message: string; fields: ApplicationDraftField[]; at: ComposerSlot } | null;
  at: ComposerSlot;
}) {
  if (!refusal || refusal.at !== at) return null;
  /* Gated on the refusal existing, never on it naming a field: a server failure names none, and
     that is exactly the case ISSUE-043 was about. */
  return <p className={at === "action" ? "mr-auto text-sm text-danger" : "mt-1.5 text-sm text-danger"} role="alert">{refusal.message}</p>;
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
    <button type="button" onClick={() => setEditing(true)} className={`text-left leading-[1.35] hover:bg-brand-soft/50 focus:outline-none focus:ring-2 focus:ring-brand/30 ${className}`}>
      {/* hideMissing: an amber "asked for and NOT on your resume" mark cannot honestly appear on
          the resume. If the word were here the scorer would have counted it as covered. */}
      <RequirementText text={value} editedTerms={terms} hideMissing />
    </button>
  );
}

function QuestionsScreen({ questions, onChange, onBack, onSubmit, saving = false, reviewDiscovered = false, focusQuestion = null, prescriptNote = "" }: { questions: ApplicationQuestion[]; onChange: (questions: ApplicationQuestion[]) => void; onBack: () => void; onSubmit: () => void; saving?: boolean; reviewDiscovered?: boolean; focusQuestion?: { id: string; token: number } | null; prescriptNote?: string }) {
  const missingQuestions = questions.filter((question) => question.required && !question.answer.trim());
  const visibleQuestions = reviewDiscovered ? questions : missingQuestions;
  const focusQuestionId = focusQuestion?.id ?? null;
  const focusToken = focusQuestion?.token ?? 0;
  /* Arriving from a Your turn row means the student pressed ONE thing, so the caret belongs in that
     answer. Without this the screen opens at the top of a list of every question the form asked and
     the row she pressed can be several screens down, which is close enough to nothing happening.

     Done in the effect body rather than in a requestAnimationFrame: the element exists as soon as
     this runs, and rAF does not fire in a hidden tab, which made the behaviour differ between a
     real browser and a driven one. The caller suppresses moveToScreen's scroll to the top of the
     page for exactly this navigation, so there is nothing left to race. */
  useEffect(() => {
    if (!focusQuestionId) return;
    const field = document.getElementById(`question-${focusQuestionId}`);
    // A pre-script question with a closed option list renders as a select, so the caret placement
    // below cannot apply to it. Scroll and focus still do, which is the part that matters.
    if (!(field instanceof HTMLTextAreaElement) && !(field instanceof HTMLSelectElement)) return;
    field.scrollIntoView({ block: "center", behavior: "auto" });
    field.focus();
    if (field instanceof HTMLTextAreaElement) field.setSelectionRange(field.value.length, field.value.length);
  }, [focusQuestionId, focusToken]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={onBack} className="text-sm text-muted hover:text-ink">Back</button>
      <div>
        <h2 className="text-heading font-medium tracking-tight text-ink">{reviewDiscovered ? "Review answers" : "Answer these"}</h2>
        {reviewDiscovered && (
          <p className="mt-1 text-sm leading-6 text-muted">
            Nothing here has gone to the employer. Change anything that is wrong, then save to put these answers on the company&apos;s form.
          </p>
        )}
        {/* The Apply-time line, which says what Litos already handled as well as what is left. A
            screen that only counts what is still owed reads as a bill. */}
        {!reviewDiscovered && prescriptNote && (
          <p className="mt-1 text-sm leading-6 text-muted">{prescriptNote}</p>
        )}
      </div>
      {visibleQuestions.map((question) => (
        <Card key={question.id} className="p-6">
          <label htmlFor={`question-${question.id}`} className="text-sm font-medium text-ink">{displayQuestionLabel(question.question)}</label>
          <p className={`mt-1 font-mono text-[11px] uppercase tracking-[0.08em] ${question.required && !question.answer.trim() ? "text-warn" : "text-muted"}`}>{question.required && !question.answer.trim() ? "Required" : "Review"}</p>
          {/* Why this one is hers. Written by the backend so that the Apply screen and a stalled
              run's attention reason cannot describe the same refusal in two different voices. */}
          {question.explanation && (
            <p className="mt-1 text-xs leading-5 text-muted">{question.explanation}</p>
          )}
          {question.options && question.options.length > 0 ? (
            /* The employer's own list, so a fixed choice is a choice rather than a box she has to
               guess the wording for. Sixteen DRW self-ratings and Point72's office list are all
               this shape, and a free-text answer to any of them is an answer the form rejects.
               The first entry is blank on purpose: nothing here is pre-picked. */
            <select
              id={`question-${question.id}`}
              value={question.answer}
              onChange={(event) => onChange(questions.map((item) => item.id === question.id ? { ...item, answer: event.target.value } : item))}
              className="mt-4 w-full rounded-inner border border-control-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand"
            >
              <option value="">Choose an answer</option>
              {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <textarea id={`question-${question.id}`} value={question.answer} onChange={(event) => onChange(questions.map((item) => item.id === question.id ? { ...item, answer: event.target.value } : item))} rows={6} className="mt-4 w-full rounded-inner border border-control-border bg-surface px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-brand" />
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
        <Button onClick={onSubmit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
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

function SubmissionScreen({ packet, submission, packetEvidenceReviewed, manualTrialPacket, approving, securityCodeSubmitting, securityCodeError, onSubmitSecurityCode, educationProfile, educationProfileStatus, onCheckResume, onReloadCoverLetter, onWriteCoverLetter, coverLetterReloading, onHandoffComplete, onApprove, sendRefusal, onRestart, restarting, onRetry, onReviewPacket, onReviewQuestions, onOpenQuestion, onAddDocument, onSelfSubmitted }: { packet: GeneratedResume; submission: SubmissionResponse; packetEvidenceReviewed: boolean; manualTrialPacket: PacketAuditResponse | null; approving: boolean; securityCodeSubmitting: boolean; securityCodeError: string | null; onSubmitSecurityCode: (code: string) => void; educationProfile: EducationProfile | null; educationProfileStatus: EducationProfileStatus; onCheckResume: () => void; onReloadCoverLetter: () => void; onWriteCoverLetter: () => void; coverLetterReloading: boolean; onHandoffComplete: (outcome?: "cleared" | "submitted") => void; onApprove: () => void; sendRefusal: { message: string; issues: string[] } | null; onRestart: () => void; restarting: boolean; onRetry: () => void; onReviewPacket: () => void; onReviewQuestions: () => void; onOpenQuestion: (questionId: string, intent?: SubmissionChecklistAction) => void; onAddDocument: (kind: string) => void; onSelfSubmitted: () => void }) {
  const { review } = submission;
  const awaitingSecurityCode = review.status === "awaiting_security_code";
  const needsAttention = review.status === "needs_attention";
  const hasQuestionsToReview = needsAttention && review.questions.length > 0;
  const handoffUrl = needsAttention ? submission.handoff_url : undefined;
  const portalUrl = review.portal_url?.trim();
  const attendedHandoffUrl = exactAttendedHandoffUrl(review);
  const canFinishInDashboard = Boolean(handoffUrl) && !attendedHandoffUrl;
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
  const requiredAnswerMissing = review.questions.some((question) => question.required && !(question.answer ?? "").trim());
  const safeAttentionReason = review.attention_reason
    ? userFacingError(review.attention_reason, "Litos could not finish the company’s form. Try again in a minute.")
    : undefined;
  const attentionReview = { ...review, attention_reason: safeAttentionReason };
  const needsInputItems = humanInputItems(attentionReview, {
    company: packet.job_context.company,
    role: packet.job_context.role,
    documents: submission.documents,
  });
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
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_1.15fr]">
      <Card className="p-7">
        <h2 className="text-heading font-medium text-ink">{awaitingSecurityCode ? "One code away" : needsAttention ? "Needs your input" : review.status === "failed" ? "Stopped" : "Review"}</h2>
        {/* The backend joins blockers with newlines, but they were rendered into a single <p>, where
            HTML collapses the breaks. Four separate blockers arrived as one run-on sentence, which
            is how "CAPTCHA requires your attention ... is required required field is required ..."
            reached the screen. Each blocker is its own item, because each is its own task. */}
        {needsAttention ? (
          <BlockerList items={needsInputItems} portalUrl={attendedHandoffUrl ? undefined : handoffUrl ?? portalUrl} onOpenQuestion={onOpenQuestion} onAddDocument={onAddDocument} />
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted">
            {review.status === "failed"
              ? userFacingError(review.submission_error, "Try again in a minute.")
              /* NOT "Check the preview, then send." This application has already been sent once, and
                 offering a send is what the three measured packets of 2026-08-08 did wrong. */
              : awaitingSecurityCode
                ? "This one is with the employer already. It needs the code they emailed before it counts as filed."
                : "Check the preview, then send."}
          </p>
        )}
        {awaitingSecurityCode && (
          <SecurityCodeCard
            review={review}
            submitting={securityCodeSubmitting}
            error={securityCodeError}
            onSubmitCode={onSubmitSecurityCode}
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
          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-positive">Done</p>
              <p className="font-mono text-[11px] text-positive">Complete</p>
            </div>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {completedItems.slice(0, 12).map((item) => <ChecklistRow key={item.id} item={item} checked />)}
            </ul>
          </div>
        )}
        {submission.cover_letter && (
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
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-inner border border-border bg-surface">
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
        {needsAttention && !canFinishInDashboard && !attendedHandoffUrl && (
          <div className="mt-4 rounded-inner border border-border bg-surface-alt px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">No live browser to reopen</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              This stop came from a managed Stratus run or a pre-fill gate, so Litos only has the filled preview and the blocker list here. The fastest path is to open the company page once, finish the check, then mark it done.
            </p>
          </div>
        )}
        <div className="mt-7 flex flex-wrap gap-2">
          {canFinishInDashboard && <a href="#live-company-page" className="rounded-full bg-action px-5 py-2.5 text-sm font-medium text-action-ink hover:bg-brand-ink">Finish in this dashboard</a>}
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
          {needsAttention && handoffUrl && !attendedHandoffUrl && <ButtonLink href={handoffUrl} target="_blank" rel="noreferrer" variant={canFinishInDashboard ? "secondary" : "primary"}>Open in new tab</ButtonLink>}
          {needsAttention && !handoffUrl && !attendedHandoffUrl && portalUrl && <ButtonLink href={portalUrl} target="_blank" rel="noreferrer" variant="secondary">Open company page</ButtonLink>}
          {hasQuestionsToReview && <Button onClick={onReviewQuestions} >Check the answers</Button>}
          {/* The audited re-run. "Try again" replays submit-request against the LAST acknowledged
              packet, and any saved answer since then changes packet_version, so on exactly the rows
              this screen exists for it answers 409 packet_stale forever. The review screen owns the
              fresh audit, the exact-PDF gate and the acknowledged send, and needs_attention rows had
              no route to it: measured on Belvedere 2026-08-18, where every exit from this screen was
              a stale retry. */}
          {needsAttention && <Button onClick={onReviewPacket}>Review and fill</Button>}
          {needsAttention && <Button onClick={onRetry} variant="secondary">Try again</Button>}
          {needsAttention && submission.handoff_url && <Button onClick={() => onHandoffComplete("cleared")} variant="secondary">I cleared the check</Button>}
          {needsAttention && submission.handoff_url && <Button onClick={() => onHandoffComplete("submitted")} variant="secondary">I submitted it myself</Button>}
          {review.status === "failed" && <Button onClick={onRetry} >Try again</Button>}
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
            Required answer missing.
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
      </Card>
      <Card className="overflow-hidden">
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
            <div className="p-10 text-center text-sm text-warn">Litos could not load the filled form preview. Try filling the form again before sending.</div>
          ) : (
            <img
              src={review.preview_screenshot_url}
              alt="The company's application page after Litos filled it in"
              className="h-auto w-full"
              onLoad={() => setPreviewState({ url: previewUrl, loaded: true, failed: false })}
              onError={() => setPreviewState({ url: previewUrl, loaded: false, failed: true })}
            />
          )
        ) : <div className="p-10 text-center text-sm text-muted">Litos is still taking the picture.</div>}
      </Card>
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

const CHECKLIST_ACTION_CLASS = "mt-1 flex min-h-11 w-fit items-center rounded-full bg-action px-3.5 font-mono text-[10px] uppercase tracking-[0.08em] text-action-ink transition-colors hover:bg-brand-ink";
/* The same control on a row that is not asking for anything. Outlined rather than filled, because
   DESIGN.md's colour law is that weight says what a control IS and not how hard to press it, and a
   filled pill on a confirmation row puts the loudest thing on the panel next to the one item that
   needs nothing doing. Same 44px floor, same target, quieter voice. */
const CHECKLIST_SETTLED_ACTION_CLASS = "mt-1 flex min-h-11 w-fit items-center rounded-full border border-control-border bg-surface px-3.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted transition-colors hover:border-ink hover:text-ink";

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
function ChecklistRow({ item, checked, portalUrl, onOpenQuestion, onAddDocument }: { item: SubmissionChecklistItem; checked: boolean; portalUrl?: string; onOpenQuestion?: (questionId: string, intent?: SubmissionChecklistAction) => void; onAddDocument?: (kind: string) => void }) {
  const control = checked ? null : checklistRowControl(item, { portalUrl });
  /* Two different things, kept apart deliberately.
     `checked` means "this row came out of the Done column", and it is the only thing that suppresses
     the control, which is safe because nothing in completedSubmissionGroups carries an action word in
     the first place. `settled` means "this row states something already handled" and it must KEEP
     its control: on the attached-transcript row that control is the only way back to Remove.
     `done` is what the tick and the colour read, so a settled row looks like a confirmation instead
     of shouting in amber beside the work that is genuinely outstanding. */
  const done = checked || item.settled === true;
  return (
    <li className="grid grid-cols-[18px_1fr] gap-2 text-sm leading-5 text-muted">
      {done ? (
        <span aria-hidden className="mt-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-[3px] border border-teal/40 bg-teal-soft text-teal-ink">
          <svg viewBox="0 0 16 16" className="h-3 w-3">
            <path d="M4 8.5l2.5 2.5L12 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : (
        <input type="checkbox" aria-label={`Mark ${item.label} done`} className="mt-0.5 h-[14px] w-[14px] rounded-[3px] border-warn/60 bg-surface text-warn focus:ring-warn/30" />
      )}
      <span>
        <span className={done ? "text-ink" : "text-warn"}>{item.label}</span>
        {/* The state word rides beside the label rather than inside the sentence, so the row still
            reads as a sentence about the employer and the pill stays scannable down a column. */}
        {!done && item.badge && <span className="ml-2 align-middle"><Chip label={item.badge} kind="warn" /></span>}
        {item.detail && <span className="block text-xs text-muted">{item.detail}</span>}
        {control?.element === "link" && (
          <a href={control.href} target="_blank" rel="noreferrer" aria-label={control.name} className={CHECKLIST_ACTION_CLASS}>
            {control.label}
          </a>
        )}
        {control?.element === "button" && onOpenQuestion && (
          <button type="button" aria-label={control.name} onClick={() => onOpenQuestion(control.questionId, control.intent)} className={done ? CHECKLIST_SETTLED_ACTION_CLASS : CHECKLIST_ACTION_CLASS}>
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
    </li>
  );
}

function BlockerList({ items, portalUrl, onOpenQuestion, onAddDocument }: { items: readonly SubmissionChecklistItem[]; portalUrl?: string; onOpenQuestion?: (questionId: string, intent?: SubmissionChecklistAction) => void; onAddDocument?: (kind: string) => void }) {
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
        <div className="mt-4 rounded-inner border border-warn/45 bg-warn-soft px-4 py-3 shadow-rest">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-warn">Your turn</p>
            <p className="font-mono text-[11px] text-warn">{outstanding.length} to check</p>
          </div>
          <ul className="mt-2 space-y-2">
          {outstanding.map((item) => (
            <ChecklistRow key={item.id} item={item} checked={false} portalUrl={portalUrl} onOpenQuestion={onOpenQuestion} onAddDocument={onAddDocument} />
          ))}
          </ul>
        </div>
      )}
      {settled.length > 0 && (
        <div className="mt-3 rounded-inner border border-border bg-surface-alt px-4 py-3">
          <ul className="space-y-2">
          {settled.map((item) => (
            <ChecklistRow key={item.id} item={item} checked={false} portalUrl={portalUrl} onOpenQuestion={onOpenQuestion} onAddDocument={onAddDocument} />
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

  useEffect(() => {
    // Deliberately a self-rescheduling timeout rather than an interval. The repo bans setInterval in
    // this file (tests/application-submission-gate.test.mjs) so portal polling can never stack
    // overlapping requests, and a display clock is not worth carving an exception into that rule.
    let timer: number | undefined;
    let cancelled = false;
    const anchor = startedMs ?? Date.now();
    const tick = () => {
      if (cancelled) return;
      setElapsed(Math.max(0, Math.floor((Date.now() - anchor) / 1000)));
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
        <div className="mt-5 flex items-start gap-3 rounded-inner border border-brand/20 bg-brand-soft/35 px-4 py-4">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-brand" aria-hidden />
          <div>
            <p role="status" aria-live="polite" className="text-sm font-medium leading-6 text-ink">{progressStage}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{body}</p>
          </div>
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
function chipKind(status: ApplicationReview["status"]): "sent" | "ready" | "warn" | "bounced" {
  if (status === "submitted") return "sent";
  if (status === "needs_attention" || status === "failed") return "bounced";
  if (status === "ready_for_final_approval") return "warn";
  return "ready";
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
