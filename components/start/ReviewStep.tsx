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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorNote, PendingLabel } from "@/components/app/ui";
import { Button } from "@/components/app/Button";
import { ApiError, api, type MonitoredJob, type PacketAuditResponse, type ResumeSpec } from "@/lib/api";
import {
  acknowledgePacketAudit,
  acknowledgePacketEvidence,
  buildRequirementIndex,
  EMPTY_REQUIREMENT_INDEX,
  educationDrift,
  educationDriftMessage,
  packetAuditPassedCleanly,
  packetAuditRefusalIsRetryable,
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

/** submitBodySchema's own limit on the server. Past it the send is a 400 with no code to recover on. */
const MAX_SUBMITTED_QUESTIONS = 100;

/* WHAT A FAILED AUDIT IS ALLOWED TO SAY.
 *
 * The retry half of the question is packetAuditRefusalIsRetryable's, in the domain module beside the
 * other refusal-code rules, because it is a pure classification with two ways to be wrong and both
 * of them ship as a broken screen.
 *
 * What is decided here is the sentence. The server's own is used wherever it is written for the
 * applicant, because it names the thing to fix. PACKET_AUDIT_FAILED is the exception: that branch
 * replies with whatever buildPacket threw, and an internal exception string is not something to put
 * in front of a student on her first application. */
function auditBlockFor(reason: unknown): AuditBlock {
  const retryable = packetAuditRefusalIsRetryable(reason);
  const data = reason instanceof ApiError ? reason.data : null;
  const code = data && typeof data === "object" && typeof (data as { code?: unknown }).code === "string"
    ? (data as { code: string }).code
    : null;
  if (code === "PACKET_AUDIT_FAILED") {
    return { message: "Litos could not put this packet together to check it. Nothing has been sent.", retryable };
  }
  return {
    message: reason instanceof Error ? reason.message : "Litos could not check the exact packet it is about to send.",
    retryable,
  };
}

/* WHY AN ABSENT QUESTION LIST IS A STOP AND NOT AN EMPTY ONE.
 *
 * `questions` is optional on the wire because this site and the backend deploy independently, and
 * the obvious fallback is `?? []`. It is the wrong one HERE. The dashboard can fall back to the list
 * it already holds; /start holds none, so `[]` would post the empty body this screen used to post -
 * the merge strips every stored answer's provenance, refreshKnownQuestionAnswers blanks the ones
 * nothing proves she supplied, questionsSha256 moves, and the send gate answers PACKET_AUDIT_STALE
 * against the acknowledgement written seconds earlier. The recovery path then re-audits into the
 * same absent field and the same refusal, so the old dead end would come back wearing a retry.
 *
 * The cap is the other half. submitBodySchema takes at most 100 questions and answers a bare 400
 * past that, with no code for packetAuditReviewRecoveryRequired to act on - and it would land AFTER
 * the acknowledgement. Both stop before anything is acknowledged, and both leave the save path. */
function auditedQuestionsIssue(response: PacketAuditResponse): string | null {
  if (!Array.isArray(response.questions)) {
    return "Litos could not read this employer's questions back from the packet, so it will not send it. "
      + "Save it and send it from your tracker.";
  }
  if (response.questions.length > MAX_SUBMITTED_QUESTIONS) {
    return `This employer asks ${response.questions.length} questions, more than Litos can send in one go. `
      + "Save it and send it from your tracker.";
  }
  return null;
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
  /** The requirement match the build screen already fetched, reused so the posting reads the same
   *  on both screens. It colours the POSTING pane only: the pane beside it is the audited PDF, which
   *  is a picture of a file and carries no marks. Null renders the posting unmarked, never an error. */
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
  /* THE REF IS THE AUTHORITY AND THE STATE IS ITS PICTURE, which is the shape the dashboard already
     uses (packetEvidenceRef). It exists for one moment: the acknowledge round trip. React state read
     before an `await` is a photograph of the past, so a check written against it after the await
     compares the past to itself and always passes. The one thing that check has to catch - the PDF
     viewer withdrawing its proof while the acknowledgement is in flight - is exactly what only the
     live value can see. */
  const evidenceRef = useRef<PacketEvidenceSession | null>(null);
  const [auditBlock, setAuditBlock] = useState<AuditBlock | null>(null);
  /* A LOCK, NOT A FLAG. `busy` is state and does not exist until React re-renders, so two presses in
     one frame both read it false. This is the request that reaches an employer. */
  const sendInFlight = useRef(false);
  /* Bumped to ask for another audit. Nothing else re-runs the effect below, so a retry is always an
     explicit act rather than a render-order accident. */
  const [auditAttempt, setAuditAttempt] = useState(0);
  /* The offices this student asked for, out of the ones the employer listed. Narrowed the same way
     as the two screens before it: the place the packet is going should not change wording on the
     screen that sends it. */
  const preferredLocations = usePreferredLocations();

  /* A STRING, NOT THE SPEC OBJECT, so this cannot become the effect's own reason to re-run. The spec
     arrives as one stable object for the sitting, but keying an audit request on an object identity
     is a loop waiting for the first caller that rebuilds it per render. It is also what the
     readiness check below compares against, so a spec that moves cannot leave a verified packet
     from the old one still sendable. */
  const specJson = useMemo(() => JSON.stringify(resumeSpec ?? null), [resumeSpec]);

  /** Ref first, then state, so nothing can read the old value between the two writes. */
  const writeEvidence = useCallback((next: PacketEvidenceSession | null) => {
    evidenceRef.current = next;
    setEvidence(next);
  }, []);

  /* EVERY setState BELOW IS INSIDE A `.then` OR A `.catch`, which is the idiom the rest of /start
     uses (MatchStep, FocusStep) and what react-hooks/set-state-in-effect actually asks for. Clearing
     the previous audit is therefore the RETRY HANDLER's job, not this body's, and a response that
     outlives its own effect is dropped by `active`. What guards the remaining window - an
     applicationId that changes while an audit is in flight - is the `session` derivation below,
     which refuses evidence that does not name the application currently on screen. */
  useEffect(() => {
    if (!applicationId) return;
    let active = true;
    /* Warmed alongside the audit rather than after it. ExactPacketPdf's own `await import` becomes a
       module-cache hit, so the viewer chunk and its worker stop being a serial tail behind the audit,
       the download and the hash on the one screen where a first-run student is watching all four. */
    void import("pdfjs-dist").catch(() => {});
    void api<PacketAuditResponse>(`/applications/${applicationId}/packet-audit`, { method: "POST" })
      .then((response) => {
        if (!active) return;
        /* The dashboard's own two validators, and neither is a formality. The first walks the
           audit's bindings, identities and PDF binding; the second reads the audit's verdict on
           itself, because `status: "passed"` is a TypeScript claim and nothing on the wire enforces
           it. An audit that is degraded, incomplete or carrying rejections is not something to put
           in front of her for approval, and the send gate would refuse it anyway. */
        if (!packetAuditResponseMatchesApplication(applicationId, response)
          || !packetAuditPassedCleanly(response.packet_audit)) {
          setAuditBlock({
            message: "Litos could not confirm this packet is complete and belongs to this application. Check it again.",
            retryable: true,
          });
          return;
        }
        const questionsIssue = auditedQuestionsIssue(response);
        if (questionsIssue) {
          setAuditBlock({ message: questionsIssue, retryable: false });
          return;
        }
        writeEvidence({
          applicationId,
          response,
          specJson,
          /* The questions the audit actually hashed, which is also what the send below submits.
             auditedQuestionsIssue has already refused an absent list, so this is never a stand-in
             for one Litos could not read. */
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
  }, [applicationId, auditAttempt, specJson, writeEvidence]);

  /* Only a real verification result or a real revocation moves this. reconcilePacketPdfVerification
     drops the acknowledgement along with the proof when the bytes stop matching, so a packet that
     changes underneath her cannot keep an approval she gave to the old one. */
  const onPdfVerified = useCallback((verified: PacketPdfEvidenceVerification | null) => {
    const next = reconcilePacketPdfVerification(evidenceRef.current, verified);
    /* A REFUSAL RETIRES WHEN THE THING IT WAS ABOUT IS PROVED AGAIN. Without this the sentence that
       sent her to re-check the packet sits red at the top of a screen whose pane now reads "Exact
       audited PDF loaded" in green and whose button has re-opened - three controls describing two
       different packets. Only the transition counts: an error raised with nothing re-proved after it,
       education drift being the one that matters, stays where it is. */
    const becameProvable = Boolean(next?.pdfVerified) && !evidenceRef.current?.pdfVerified;
    writeEvidence(next);
    if (becameProvable) setError(null);
  }, [writeEvidence]);

  /* An event handler, so the reset that starts a fresh audit is a real user act rather than a
     synchronous write from inside the effect it triggers. */
  function auditAgain() {
    writeEvidence(null);
    setAuditBlock(null);
    setAuditAttempt((current) => current + 1);
  }

  /* Evidence is only evidence about the application, and the spec, currently on screen. The spec
     half matters because the audit effect deliberately does not blank the old evidence when its deps
     change: without this comparison a spec that moved mid-sitting would leave the previous packet
     verified and sendable for the whole round trip of the new audit. */
  const session = evidence && evidence.applicationId === applicationId ? evidence : null;
  const packetReady = Boolean(session?.pdfVerified && session.specJson === specJson);
  /* THE ONLY STATE THIS BUTTON NARRATES IS ITS OWN. It spins while the audit request is in flight,
     which is the one wait this component owns and can see the end of. From the moment an audit lands,
     the pane is the narrator - loading, parsing, verified, or failed with a reason and a retry - and
     the button goes back to its plain label. The first version spun until `pdfVerified`, which put an
     animated "Checking this exact packet..." under a pane that had already given up, and that is the
     exact failure its own comment said must not happen: telling a student to wait for something that
     is not coming. */
  const auditing = Boolean(applicationId) && !session && !auditBlock;

  async function send() {
    /* Checked and set synchronously, before the first await and before any state write. */
    if (sendInFlight.current) return;
    if (!applicationId) {
      setError("This packet is not linked to an application yet, so there is nothing to send.");
      return;
    }
    if (!packetReady || !session) {
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
    sendInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      /* HER REVIEW, WRITTEN BY HER PRESS. Nothing above this line acknowledges anything, and
         nothing below it re-derives what she approved: the four values the helper posts are read off
         the audit response whose PDF is on screen and verified. */
      await acknowledgePacketAudit({
        applicationId,
        response: session.response,
        refusalMessage: "Litos did not record your review of this exact packet.",
      });
      /* THE LIVE EVIDENCE AGAINST THE ONE SHE PRESSED ON, which is the only pairing that catches
         anything. The first version passed the same snapshot twice, so every comparison inside -
         application, spec, questions, audit identity - compared a value to itself and the guard whose
         message says "this packet changed" could not fire. What it has to catch is narrow and real:
         ExactPacketPdf calls onVerified(null) whenever its bytes stop being provable, and
         reconcilePacketPdfVerification drops the approval with the proof. If that lands while this
         request is in flight, `evidenceRef.current` says so and the send stops here. */
      const acknowledged = acknowledgePacketEvidence(evidenceRef.current, session);
      if (!acknowledged) {
        throw new Error("This packet changed while Litos was recording your review. Check it again before sending.");
      }
      writeEvidence(acknowledged);
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
      /* RELEASED ONLY HERE. On the way out through onSent this screen is finished and the lock stays
         shut, so nothing that renders between the resolved send and the next step can issue a second
         one. A refusal is the only case where pressing again is a thing she is allowed to do. */
      sendInFlight.current = false;
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

      {/* The same two panes the build screen drew. The provider serves the POSTING pane: the pane
          beside it is a raster of the audited PDF, so requirement marks live on the employer's words
          and the resume is met as the document rather than as marked-up text. What is being approved
          stays on screen while it is being approved. */}
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
            <div className="flex flex-col gap-3 p-3.5">
              {session ? (
                /* SIZED LIKE THE PANE BESIDE IT, not like the dashboard drawer this viewer was
                   written for. Its own 620px floor beats a `70vh` cap in CSS, which on a 1366x768
                   laptop puts the sheet alone taller than the usable viewport and the irreversible
                   button off screen. A page's own ratio is the honest box for a page. */
                <ExactPacketPdf
                  auditDigest={session.response.packet_audit.audit_digest}
                  binding={{ sha256: session.response.pdf.sha256, size_bytes: session.response.pdf.size_bytes }}
                  downloadUrl={session.response.pdf.download_url}
                  onVerified={onPdfVerified}
                  pagesClassName="max-h-[70vh] space-y-4 overflow-y-auto rounded-inner bg-panel-soft p-1 sm:aspect-[612/792] sm:max-h-none"
                />
              ) : auditBlock ? (
                <div role="alert" className="min-h-[170px] space-y-3 rounded-inner bg-danger-soft px-4 py-3 text-sm text-danger">
                  <p>{auditBlock.message}</p>
                  <p className="text-xs">Nothing has been sent. You can save this one and send it from your tracker.</p>
                  {/* The shared primitive, and the same control ExactPacketPdf uses one branch over
                      for the same job. A bare underlined span here was a 20px tap target in a red
                      that the design canon reserves for status, two rules broken to save one import. */}
                  {auditBlock.retryable && (
                    <Button type="button" size="sm" variant="secondary" onClick={auditAgain}>
                      Check this packet again
                    </Button>
                  )}
                </div>
              ) : applicationId ? (
                <p role="status" className="min-h-[170px] rounded-inner bg-panel-soft px-4 py-3 text-sm text-muted">
                  Litos is checking the exact packet it is about to send.
                </p>
              ) : (
                /* No packet row, so there is nothing to audit and nothing to send. Said here rather
                   than left for the press to discover, because the button below is now disabled and
                   a disabled control with no stated reason is the dead end this screen just left. */
                <p className="min-h-[170px] text-[13px] leading-6 text-muted">
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
            : auditing
              ? <PendingLabel onColor>Checking this exact packet...</PendingLabel>
              : "Send my application"}
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
