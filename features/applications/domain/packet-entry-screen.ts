import type { ApplicationReview } from "@/lib/api";
import { screenForStatus, type ReviewScreen } from "./application-review.ts";
import { unansweredRequiredQuestionCount } from "./question-review-presentation.ts";

/** Answer correction precedes the send audit. A held attempt remains observation-only. */
export function packetEntryScreen(review: ApplicationReview | undefined): ReviewScreen | "questions" {
  if (!review) return "review";
  const unresolved = Boolean(review.unverified_submission && !review.unverified_submission.resolution);
  const held = Boolean(review.submission_claimed_at || review.submission_claim_id || review.receipt || review.submitted_at);
  if (unresolved || held) return review.status === "ready_for_final_approval" ? "portal" : screenForStatus(review.status, "portal");
  if (["resume_ready", "questions_ready", "ready_to_submit", "ready_for_final_approval"].includes(review.status)
    && unansweredRequiredQuestionCount(review.questions ?? [], review.question_metadata_blockers ?? []) > 0) {
    return "questions";
  }
  return review.status === "ready_for_final_approval" ? "review" : screenForStatus(review.status, "review");
}
