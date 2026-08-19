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
import { api, type MonitoredJob } from "@/lib/api";
import { educationDrift, educationDriftMessage, type EducationProfile } from "@/features/applications";
import { track } from "@/lib/analytics";
import { PrimaryButton, Receipt, StartShell } from "./ui";

type SubmitOutcome = { sent: boolean };

export function ReviewStep({
  posting,
  applicationId,
  resumeSpec,
  educationProfile,
  answersSaved,
  fieldsAnswered,
  onSent,
  onSaveForLater,
}: {
  posting: MonitoredJob;
  /** The canonical application POST /resume/generate created for this posting. Without one there
   *  is nothing to submit against, so the screen offers only the save path. */
  applicationId: string | null;
  resumeSpec: { school?: string; degree?: string; grad_date?: string } | null;
  educationProfile: EducationProfile | null;
  /** How many answers the student gave on the questions screen. */
  answersSaved: number;
  /** How many of the employer's fields are filled in total. */
  fieldsAnswered: number;
  onSent: (outcome: SubmitOutcome) => void;
  onSaveForLater: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!applicationId) {
      setError("This packet is not linked to an application yet, so there is nothing to send.");
      return;
    }
    /* Refusing keeps the packet. The dashboard applies the same guard before its own send, and it
       exists because a resume printing a school or graduation date the profile no longer agrees
       with is a false statement to an employer, not a cosmetic mismatch. */
    if (resumeSpec) {
      const drift = educationDriftMessage(educationDrift(
        { school: resumeSpec.school ?? "", degree: resumeSpec.degree ?? "", grad_date: resumeSpec.grad_date ?? "" },
        educationProfile,
      ));
      if (drift) {
        setError(`We did not send this one. ${drift}`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      track("onboarding_application_sent", { company: posting.company_name });
      await api(`/applications/${applicationId}/submit-request`, {
        method: "POST",
        body: JSON.stringify({ questions: [] }),
      });
      onSent({ sent: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send that application. It is still here for you.");
      setBusy(false);
    }
  }

  return (
    <StartShell step="review" title="Happy with this? Then send it.">
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <section className="overflow-hidden rounded-inner border border-border">
          <header className="border-b border-border bg-surface-alt px-3.5 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Attached</span>
          </header>
          <div className="p-3.5">
            <p className="text-[13px] leading-6 text-muted">
              Your one page, written for this posting from your own resume.
            </p>
          </div>
        </section>
      </div>

      <div className="mt-5">
        <Receipt
          rows={[
            { t: String(fieldsAnswered).padStart(2, "0"), k: "Form fields answered", v: "All" },
            { t: String(answersSaved).padStart(2, "0"), k: "Answers you gave just now", v: "Saved to your profile" },
            { t: "01", k: "Resume attached", v: "Tailored to this posting" },
            /* The trust argument of the whole flow, and it is only printable because the questions
               screen collected what Litos could not answer instead of filling it optimistically.
               If this row could ever read anything else, the screen before it is wrong. */
            { t: "00", k: "Anything Litos guessed", v: "None" },
          ]}
        />
      </div>

      <p className="mt-5 font-mono text-[11px] leading-6 text-warn">
        This sends a real application to {posting.company_name}. It cannot be unsent.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <PrimaryButton onClick={() => void send()} disabled={busy}>
          {busy ? <PendingLabel onColor>Sending...</PendingLabel> : "Send my application"}
        </PrimaryButton>
        {/* A real outcome, not a deferral dressed as one: the packet is complete and auditable in
            the tracker, and the student can send it from there whenever they want. */}
        <button
          type="button"
          onClick={() => { track("onboarding_application_saved_for_later", {}); onSaveForLater(); }}
          disabled={busy}
          className="text-sm text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
        >
          Save it and send later
        </button>
      </div>
    </StartShell>
  );
}
