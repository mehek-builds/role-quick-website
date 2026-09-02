"use client";

/* 06 REVIEW AND SEND: the only irreversible screen in the flow.
 *
 * Everything before this was recoverable. A resume can be replaced, roles can be changed, a match
 * can be reshuffled, an answer can be edited. This one puts a real application into a real
 * employer's system under the student's name, and it cannot be undone by anything Litos can do
 * afterwards.
 *
 * IT SHOWS THE EVIDENCE IT ASKS ABOUT, AND IT IS THE ONLY SCREEN THAT DOES (Mehek, 2026-09-01).
 * The first version was a bare recap: two labelled boxes naming the posting and asserting a resume
 * was attached, one screen after the build had shown both in full. Asking "happy with this?" while
 * hiding the this made the flow ask the same question twice, the second time with less to look at.
 * Drawing the real panes here fixed the second half of that and left the first: the build screen
 * drew the same two panes before the questions, so the student met the document twice and the
 * warning only landed on the repeat. The build screen no longer draws it. The posting and the one
 * page appear exactly once in the flow, here, at the full width of the column, on the screen that
 * states the consequence and carries the button. A student says yes to a document they are seeing,
 * once, at the moment it matters.
 *
 * WHAT SHE IS SEEING IS THE EXACT PDF, AND THAT IS WHAT MAKES THE SEND POSSIBLE AT ALL.
 *
 * This screen used to draw a re-render of the resume spec and then POST /submit-request. That
 * route gates on currentAcknowledgedPacketAudit, which needs two records this flow never wrote: a
 * packet audit (POST /applications/:id/packet-audit) and the applicant's acknowledgement of that
 * exact audit (POST /applications/:id/packet-audit/acknowledge). With neither on the row the
 * backend answered 409 PACKET_AUDIT_REQUIRED, "Audit this exact packet before submitting.", on
 * every press, for every account, with no control anywhere on the screen that could clear it. The
 * onboarding send was a dead end from the day it shipped, and its only exit was "Save it and send
 * later". Measured on Mehek's own account against a live Notion posting, 2026-09-03.
 *
 * So the audit runs when this screen opens, and the acknowledgement is written by her press. The
 * order is the whole point: the backend states that an acknowledgement "must never be preceded by a
 * machine-written one", because it is her review of a document that reaches an employer with nobody
 * in between. Auditing on arrival is a read; acknowledging is the act, and it happens once, when
 * she presses Send.
 *
 * That is also why the Attached pane draws the audited PDF rather than the spec re-render it used
 * to draw. The acknowledgement binds the PDF's sha256 and byte length. A re-render is faithful but
 * it is not those bytes, and approving bytes she was never shown is the exact thing the dashboard's
 * own send gate spends ExactPacketPdf preventing. Same component, same proof, same standard: until
 * the real file downloads, hashes clean, parses and paints ink, the button stays shut.
 *
 * The rest is built around irreversibility rather than conversion:
 *
 *   - no countdown, no pre-tick, no auto-send. The opt-in auto-submit feature ships with a
 *     15-second cancelable countdown and has no business in a first-run flow, where the student
 *     has never seen this product send anything;
 *   - the consequence is stated in plain words directly above the button, not in a tooltip;
 *   - the education drift guard runs before the send, reusing the dashboard's own functions, so a
 *     packet whose school or graduation date no longer agrees with the profile is refused rather
 *     than posted;
 *   - "Save it and send later" is a real, complete outcome. The packet stays in the tracker and
 *     nothing built so far is lost by declining. It is available through every failure below,
 *     which is what keeps a refused audit from being a dead end a second time.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { api, type MonitoredJob, type PacketAuditResponse, type ResumeSpec } from "@/lib/api";
import {
  acknowledgePacketEvidence,
  buildRequirementIndex,
  EMPTY_REQUIREMENT_INDEX,
  educationDrift,
  educationDriftMessage,
  packetAuditAcknowledgementAccepted,
  packetAuditResponseMatchesApplication,
  packetAuditReviewRecoveryRequired,
  packetQuestionsSnapshot,
  reconcilePacketPdfVerification,
  type EducationProfile,
  type JdMatchResponse,
  type PacketEvidenceSession,
  type PacketPdfEvidenceVerification,
} from "@/features/applications";
import { ExactPacketPdf } from "@/components/app/ExactPacketPdf";
import { MatchLegend, RequirementProvider, RequirementText } from "@/components/app/RequirementText";
import { track } from "@/lib/analytics";
import { PrimaryButton, Receipt, StartShell, usePreferredLocations } from "./ui";
import { narrowPostingLocation } from "@/lib/posting-location";

/* The posting's words with their requirement marks and legend, drawn once, here, on the only screen in the flow
   that shows the posting. Callers wrap it in a RequirementProvider. */
function MarkedPostingBody({ description, jdMatch }: { description: string; jdMatch: JdMatchResponse | null }) {
  return (
    <>
      {jdMatch?.scorable && (
        <div className="mt-1">
          <MatchLegend missingCount={jdMatch.missing.length} />
        </div>
      )}
      <p className="mt-1 whitespace-pre-line text-[12.5px] leading-6 text-ink">
        <RequirementText text={description} />
      </p>
    </>
  );
}

type SubmitOutcome = { sent: boolean };

/** Why the packet cannot be shown, and whether pressing again could change that. */
type AuditBlock = { message: string; retryable: boolean };

/* WHAT A FAILED AUDIT IS ALLOWED TO SAY, AND WHETHER IT OFFERS A RETRY.
 *
 * The server's own sentence is used wherever it has one, because it names the thing to fix. What is
 * decided here is only whether "check it again" is honest. A 409 on a packet that has moved past
 * auditing (it is already claimed, submitting, or submitted) will answer the same way forever, and a
 * button that cannot change the answer reads as a broken button rather than as a stop. */
function auditBlockFor(reason: unknown): AuditBlock {
  const status = typeof reason === "object" && reason !== null
    ? (reason as { status?: unknown }).status
    : undefined;
  const message = reason instanceof Error
    ? reason.message
    : "Litos could not check the exact packet it is about to send.";
  return { message, retryable: status !== 409 };
}

export function ReviewStep({
  posting,
  applicationId,
  resumeSpec,
  jdMatch,
  educationProfile,
  answersSaved,
  fieldsAnswered,
  onSent,
  onSaveForLater,
}: {
  posting: MonitoredJob;
  /** The generated_resumes row POST /resume/generate created for this posting; the id space
   *  /applications/:id/submit-request resolves. Without one there is nothing to submit against,
   *  so the screen offers only the save path. */
  applicationId: string | null;
  /** Read for the education drift guard below. The document itself is drawn from the audited PDF,
   *  not from this, so that what is approved is what the employer receives. */
  resumeSpec: ResumeSpec | null;
  /** The requirement match the build screen already fetched, reused so both screens colour the
   *  panes identically. Null renders both panes unmarked, never an error. */
  jdMatch: JdMatchResponse | null;
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
  /* The audited packet for this sitting, and the PDF proof that accumulates onto it. Null while the
     audit is in flight, and null again after a refusal that needs a fresh one. */
  const [evidence, setEvidence] = useState<PacketEvidenceSession | null>(null);
  const [auditBlock, setAuditBlock] = useState<AuditBlock | null>(null);
  /* Bumped to ask for another audit. Nothing else re-runs the effect below, so a retry is always an
     explicit act rather than a render-order accident. */
  const [auditAttempt, setAuditAttempt] = useState(0);
  /* The offices this student asked for, out of the ones the employer listed. Narrowed the same way
     as the two screens before it: the place the packet is going should not change wording on the
     screen that sends it. */
  const preferredLocations = usePreferredLocations();

  /* A STRING, NOT THE SPEC OBJECT, so this cannot become the effect's own reason to re-run. The spec
     arrives as one stable object for the sitting, but keying an audit request on an object identity
     is a loop waiting for the first caller that rebuilds it per render. */
  const specJson = useMemo(() => JSON.stringify(resumeSpec ?? null), [resumeSpec]);

  /* EVERY setState BELOW IS INSIDE A `.then` OR A `.catch`, which is the idiom the rest of /start
     uses (MatchStep, FocusStep) and what react-hooks/set-state-in-effect actually asks for. Clearing
     the previous audit is therefore the RETRY HANDLER's job, not this body's, and a response that
     outlives its own effect is dropped by `active`. What guards the remaining window - an
     applicationId that changes while an audit is in flight - is the `session` derivation below,
     which refuses evidence that does not name the application currently on screen. */
  useEffect(() => {
    if (!applicationId) return;
    let active = true;
    void api<PacketAuditResponse>(`/applications/${applicationId}/packet-audit`, { method: "POST" })
      .then((response) => {
        if (!active) return;
        /* The dashboard's own validator, and it is not a formality: it walks the audit's bindings,
           identities and PDF binding before anything renders or is hashed against them. An audit
           that does not describe THIS application must never become the thing she approves. */
        if (!packetAuditResponseMatchesApplication(applicationId, response)) {
          setAuditBlock({
            message: "Litos could not confirm this packet belongs to this application. Check it again.",
            retryable: true,
          });
          return;
        }
        setEvidence({
          applicationId,
          response,
          specJson,
          /* THE QUESTIONS THE AUDIT ACTUALLY HASHED, which is also what the send below submits.
             The field is optional on the wire because this site and the backend deploy
             independently; an absent one snapshots the empty list, which is exactly what this
             screen has always submitted and no worse than it. */
          questionsSnapshot: packetQuestionsSnapshot(response.questions ?? []),
          pdfVerified: false,
          acknowledged: false,
          serverRevalidatedAt: null,
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setAuditBlock(auditBlockFor(reason));
      });
    return () => { active = false; };
  }, [applicationId, auditAttempt, specJson]);

  /* Only a real verification result or a real revocation moves this. reconcilePacketPdfVerification
     drops the acknowledgement along with the proof when the bytes stop matching, so a packet that
     changes underneath her cannot keep an approval she gave to the old one. */
  const onPdfVerified = useCallback((verified: PacketPdfEvidenceVerification | null) => {
    setEvidence((current) => reconcilePacketPdfVerification(current, verified));
  }, []);

  /* An event handler, so the reset that starts a fresh audit is a real user act rather than a
     synchronous write from inside the effect it triggers. */
  function auditAgain() {
    setEvidence(null);
    setAuditBlock(null);
    setAuditAttempt((current) => current + 1);
  }

  /* Evidence is only evidence about the application currently on screen. */
  const session = evidence && evidence.applicationId === applicationId ? evidence : null;
  const packetReady = Boolean(session?.pdfVerified);
  /* STOPPED, as opposed to still working. The two look identical from the button's side and must
     not read identically: a spinner over a pane that has already given up is the screen telling the
     student to wait for something that is not coming. */
  const stopped = !applicationId || (Boolean(auditBlock) && !session);

  async function send() {
    if (!applicationId) {
      setError("This packet is not linked to an application yet, so there is nothing to send.");
      return;
    }
    if (!session?.pdfVerified) {
      setError("Litos is still checking the exact packet. The button opens as soon as the real PDF is on screen.");
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
    const audit = session.response.packet_audit;
    const pdf = session.response.pdf;
    try {
      /* HER REVIEW, WRITTEN BY HER PRESS. Nothing above this line acknowledges anything, and
         nothing below it re-derives what she approved: the four values are read off the audit whose
         PDF is on screen and verified. */
      const acknowledgement = await api<unknown>(`/applications/${applicationId}/packet-audit/acknowledge`, {
        method: "POST",
        body: JSON.stringify({
          audit_digest: audit.audit_digest,
          packet_version: audit.packet_version,
          pdf_sha256: pdf.sha256,
          size_bytes: pdf.size_bytes,
        }),
      });
      if (!packetAuditAcknowledgementAccepted(acknowledgement)) {
        throw new Error("Litos did not record your review of this exact packet.");
      }
      const acknowledged = acknowledgePacketEvidence(session, session);
      if (!acknowledged) {
        throw new Error("This packet changed while Litos was recording your review. Check it again before sending.");
      }
      setEvidence(acknowledged);
      /* THE AUDITED QUESTIONS, NOT AN EMPTY LIST. This screen used to submit `[]`, and an empty body
         is not "no opinion" to the merge on the other end: every stored question loses its
         provenance, refreshKnownQuestionAnswers then blanks the ones nothing proves she supplied,
         and the packet the send gate hashes is no longer the packet she just acknowledged. Two
         requests, seconds apart, disagreeing about an unedited packet, which is the deadlock the
         backend route documents at length. Submitting exactly what the audit hashed is what keeps
         the acknowledgement and the send about one packet. */
      await api(`/applications/${applicationId}/submit-request`, {
        method: "POST",
        body: JSON.stringify({ questions: session.response.questions ?? [] }),
      });
      /* AFTER the request it names. Fired before it, this counted a send for every refusal above,
         and the refusals were the entire population of this event until today. */
      track("onboarding_application_sent", { company: posting.company_name });
      onSent({ sent: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send that application. It is still here for you.");
      setBusy(false);
      /* A refusal whose recovery IS a fresh audit opens one, rather than leaving her holding a
         reason with no control that acts on it. The reason stays on screen above the new audit. */
      if (packetAuditReviewRecoveryRequired(reason)) auditAgain();
    }
  }

  const requirementIndex = jdMatch
    ? buildRequirementIndex(jdMatch.matched, jdMatch.missing)
    : EMPTY_REQUIREMENT_INDEX;

  return (
    <StartShell step="review" title="Happy with this? Then send it." wide>
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {/* The same two panes the build screen drew, under one provider so a term keeps its colour
          and its hover link across both. What is being approved stays on screen while it is being
          approved. */}
      <RequirementProvider index={requirementIndex}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section className="overflow-hidden rounded-inner border border-border">
            <header className="border-b border-border bg-surface-alt px-3.5 py-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Going to</span>
            </header>
            {/* Sized by the sheet beside it, not by a pixel clamp: same aspect as a page, so the
                two panes end level at every column width and the description scrolls inside it. */}
            <div className="flex aspect-[612/792] flex-col gap-2 overflow-y-auto p-3.5">
              <p className="text-[15px] leading-snug text-ink">{posting.title}</p>
              <p className="font-mono text-[11px] leading-relaxed text-muted">
                {[posting.company_name, narrowPostingLocation(posting.location, preferredLocations)].filter(Boolean).join(" · ")}
                <br />
                {posting.ats_name}
              </p>
              {posting.description && (
                <MarkedPostingBody description={posting.description} jdMatch={jdMatch} />
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-inner border border-border">
            <header className="flex min-h-[38px] items-center justify-between gap-3 border-b border-border bg-surface-alt px-3.5 py-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Attached</span>
              {/* Says what has actually been proved. A green "Resume" over an unverified pane was
                  the screen asserting the one thing the send gate had not established yet. */}
              {packetReady && <span className="font-mono text-[11px] text-positive">Resume</span>}
            </header>
            {/* THE PAGE IS THE POINT ON THIS SCREEN, and it is the real file. ExactPacketPdf
                downloads it, hashes it against the audit's own binding, parses it and counts
                painted pixels before it reports a verification, and every one of those steps runs
                on a deadline that fails loudly instead of hanging. See its own header for the
                production stall that shape exists for. */}
            <div className="flex min-h-[170px] flex-col gap-3 p-3.5">
              {session ? (
                <ExactPacketPdf
                  auditDigest={session.response.packet_audit.audit_digest}
                  binding={{ sha256: session.response.pdf.sha256, size_bytes: session.response.pdf.size_bytes }}
                  downloadUrl={session.response.pdf.download_url}
                  onVerified={onPdfVerified}
                />
              ) : auditBlock ? (
                <div role="alert" className="space-y-3 rounded-inner bg-danger-soft px-4 py-3 text-sm text-danger">
                  <p>{auditBlock.message}</p>
                  <p className="text-xs">Nothing has been sent. You can save this one and send it from your tracker.</p>
                  {auditBlock.retryable && (
                    <button
                      type="button"
                      onClick={auditAgain}
                      className="text-sm underline underline-offset-4"
                    >
                      Check this packet again
                    </button>
                  )}
                </div>
              ) : applicationId ? (
                <p role="status" className="rounded-inner bg-panel-soft px-4 py-3 text-sm text-muted">
                  Litos is checking the exact packet it is about to send.
                </p>
              ) : (
                /* No packet row, so there is nothing to audit and nothing to send. Said here rather
                   than left for the press to discover, because the button below is now disabled and
                   a disabled control with no stated reason is the dead end this screen just left. */
                <p className="text-[13px] leading-6 text-muted">
                  This packet is not linked to an application yet, so there is nothing to send.
                  Save it and Litos will finish linking it in your tracker.
                </p>
              )}
            </div>
          </section>
        </div>
      </RequirementProvider>

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
        <PrimaryButton onClick={() => void send()} disabled={busy || !packetReady}>
          {busy
            ? <PendingLabel onColor>Sending...</PendingLabel>
            : packetReady || stopped
              ? "Send my application"
              : <PendingLabel onColor>Checking this exact packet...</PendingLabel>}
        </PrimaryButton>
        {/* A real outcome, not a deferral dressed as one: the packet is complete and auditable in
            the tracker, and the student can send it from there whenever they want. Never disabled
            by the audit, so no failure above can leave this screen without an exit. */}
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
