"use client";

/* 06 REVIEW AND SEND: the only irreversible screen in the flow.
 *
 * Everything before this was recoverable. A resume can be replaced, roles can be changed, a match
 * can be reshuffled, an answer can be edited. This one puts a real application into a real
 * employer's system under the student's name, and it cannot be undone by anything Litos can do
 * afterwards.
 *
 * So the screen is built around that fact rather than around the conversion:
 *
 *   - no countdown, no pre-tick, no auto-send. The opt-in auto-submit feature ships with a
 *     15-second cancelable countdown and has no business in a first-run flow, where the student
 *     has never seen this product send anything;
 *   - the consequence is stated in plain words directly above the button, not in a tooltip;
 *   - the education drift guard runs before the send, reusing the dashboard's own functions, so a
 *     packet whose school or graduation date no longer agrees with the profile is refused rather
 *     than posted;
 *   - "Save it and send later" is a real, complete outcome. The packet stays in the tracker and
 *     nothing built so far is lost by declining.
 */

import { useState } from "react";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { api, type MonitoredJob, type PostingPrescriptFilledAnswer, type ResumeSpec } from "@/lib/api";
import { educationDrift, educationDriftMessage, type EducationProfile } from "@/features/applications";
import { track } from "@/lib/analytics";
import type { OnboardingReviewAnswerPayload } from "@/lib/onboarding-build";
import { PrimaryButton, Receipt, StartShell } from "./ui";
import { ResumePaper, type ContactHeader } from "./ResumePaper";

type SubmitOutcome = { sent: boolean };

export function ReviewStep({
  posting,
  applicationId,
  resumeSpec,
  resumeContact,
  educationProfile,
  answers,
  submissionQuestions,
  answerEvidenceComplete,
  fieldsAnswered,
  onEditResume,
  onEditAnswers,
  onBeforeSend,
  onSent,
  onSaveForLater,
}: {
  posting: MonitoredJob;
  /** The canonical application POST /resume/generate created for this posting. Without one there
   *  is nothing to submit against, so the screen offers only the save path. */
  applicationId: string | null;
  resumeSpec: ResumeSpec | null;
  resumeContact: ContactHeader;
  educationProfile: EducationProfile | null;
  /** Every exact value Litos will reuse, including saved details and answers confirmed here. */
  answers: readonly PostingPrescriptFilledAnswer[];
  /** The exact packet snapshot, including cleared optional fields and human provenance. */
  submissionQuestions: readonly OnboardingReviewAnswerPayload[];
  /** False during a rolling backend deploy or a failed handoff, so Send remains unavailable. */
  answerEvidenceComplete: boolean;
  /** How many of the employer's fields are filled in total. */
  fieldsAnswered: number;
  onEditResume: () => void;
  onEditAnswers: () => void;
  onBeforeSend: () => Promise<void>;
  onSent: (outcome: SubmitOutcome) => void;
  onSaveForLater: () => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<"send" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = pendingAction !== null;

  async function send() {
    if (!applicationId) {
      setError("This packet is not linked to an application yet, so there is nothing to send.");
      return;
    }
    if (!resumeSpec) {
      setError("The tailored resume preview is unavailable, so Litos will not send this packet.");
      return;
    }
    if (!answerEvidenceComplete) {
      setError("The exact saved values for this form are unavailable, so Litos will not send this packet.");
      return;
    }
    /* Refusing keeps the packet. The dashboard applies the same guard before its own send, and it
       exists because a resume printing a school or graduation date the profile no longer agrees
       with is a false statement to an employer, not a cosmetic mismatch. */
    const drift = educationDriftMessage(educationDrift(
      { school: resumeSpec.school ?? "", degree: resumeSpec.degree ?? "", grad_date: resumeSpec.grad_date ?? "" },
      educationProfile,
    ));
    if (drift) {
      setError(`We did not send this one. ${drift}`);
      return;
    }
    setPendingAction("send");
    setError(null);
    try {
      track("onboarding_application_sent", { company: posting.company_name });
      /* Save the exact reviewed snapshot before attempting the irreversible action. If submission
         is refused by a later guard, the packet in Tracker still contains what the applicant saw. */
      await onBeforeSend();
      await api(`/applications/${applicationId}/submit-request`, {
        method: "POST",
        /* The list shown above is the list authorized below. Sending an empty array made edits on
           the onboarding question screen disappear before the submission runner ever saw them. */
        body: JSON.stringify({
          questions: submissionQuestions,
        }),
      });
      onSent({ sent: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send that application. It is still here for you.");
      setPendingAction(null);
    }
  }

  async function saveForLater() {
    setPendingAction("save");
    setError(null);
    try {
      track("onboarding_application_saved_for_later", {});
      await onSaveForLater();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save that application. It is still here for you.");
      setPendingAction(null);
    }
  }

  return (
    <StartShell step="review" title="Review before sending." wide>
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <section className="overflow-hidden rounded-inner border border-border">
        <header className="border-b border-border bg-surface-alt px-3.5 py-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Going to</span>
        </header>
        <div className="flex flex-col gap-1.5 p-3.5">
          <p className="text-[15px] leading-snug text-ink">{posting.title}</p>
          <p className="font-mono text-[11px] leading-relaxed text-muted">
            {[posting.company_name, posting.location].filter(Boolean).join(" · ")}
            <br />
            {posting.ats_name}
          </p>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)] lg:items-start">
        <section aria-labelledby="review-resume-heading" className="min-w-0 rounded-inner border border-border bg-surface p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="review-resume-heading" className="text-sm font-medium text-ink">Resume attached</h2>
            <button
              type="button"
              onClick={onEditResume}
              className="min-h-11 text-sm text-muted underline underline-offset-4 hover:text-ink"
            >
              Change source resume
            </button>
          </div>
          <p id="review-resume-help" className="mb-3 text-xs leading-5 text-muted sm:hidden">
            Scroll sideways inside the preview to inspect the full page.
          </p>
          {resumeSpec ? (
            <div
              tabIndex={0}
              aria-labelledby="review-resume-heading"
              aria-describedby="review-resume-help"
              className="overflow-x-auto rounded-inner bg-surface-alt p-2 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:p-3"
            >
              <div className="w-[500px] sm:w-full">
                <ResumePaper
                  spec={resumeSpec}
                  contact={resumeContact}
                  label={`Tailored resume for ${posting.company_name}`}
                />
              </div>
            </div>
          ) : (
            <ErrorNote message="The tailored resume preview is unavailable. Save this packet for later or change the source resume before sending." />
          )}
        </section>

        <div className="min-w-0 space-y-5">
          <section aria-labelledby="review-answers-heading" className="overflow-hidden rounded-inner border border-border bg-surface">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-alt px-3.5 py-2">
              <h2 id="review-answers-heading" className="text-sm font-medium text-ink">Answers that will be used</h2>
              {answers.length > 0 && (
                <button
                  type="button"
                  onClick={onEditAnswers}
                  className="min-h-11 text-sm text-muted underline underline-offset-4 hover:text-ink"
                >
                  Change answers
                </button>
              )}
            </header>
            <div className="ph-no-capture p-3.5">
              {!answerEvidenceComplete ? (
                <ErrorNote message="Litos found saved details for this form, but this handoff could not load their exact values. It will not send until you can inspect them. Save the packet and try again from Tracker." />
              ) : answers.length > 0 ? (
                <dl className="space-y-4">
                  {answers.map((item, index) => (
                    <div key={`${item.question}:${index}`}>
                      <dt className="text-xs leading-5 text-muted">{item.question}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{item.answer}</dd>
                      <dd className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                        {item.source === "applicant_review" ? "You confirmed" : "From your saved details"}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm leading-6 text-muted">This posting needs no extra values beyond the resume.</p>
              )}
            </div>
          </section>

          <Receipt
            rows={[
              { t: String(fieldsAnswered).padStart(2, "0"), k: "Employer fields detected", v: "Checked" },
              { t: String(answers.length).padStart(2, "0"), k: "Values shown above", v: answerEvidenceComplete ? "Ready for review" : "Incomplete" },
              { t: "00", k: "Anything Litos guessed", v: "None" },
            ]}
          />
        </div>
      </div>

      {!applicationId && (
        <div className="mt-5">
          <ErrorNote message="This packet is not linked to an application yet, so Litos will not send it. Save it for later and try again from Tracker." />
        </div>
      )}

      <p id="review-send-consequence" className="mt-5 font-mono text-[11px] leading-6 text-warn">
        This sends a real application to {posting.company_name}. It cannot be unsent.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <PrimaryButton
          onClick={() => void send()}
          disabled={busy || !applicationId || !resumeSpec || !answerEvidenceComplete}
          aria-describedby="review-send-consequence"
          className="w-full sm:w-auto"
        >
          {pendingAction === "send" ? <PendingLabel onColor>Sending...</PendingLabel> : "Send my application"}
        </PrimaryButton>
        {/* A real outcome, not a deferral dressed as one: the packet is complete and auditable in
            the tracker, and the student can send it from there whenever they want. */}
        <button
          type="button"
          onClick={() => void saveForLater()}
          disabled={busy}
          className="min-h-11 w-full text-sm text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50 sm:w-auto"
        >
          {pendingAction === "save" ? <PendingLabel>Saving...</PendingLabel> : "Save it and send later"}
        </button>
      </div>
    </StartShell>
  );
}
