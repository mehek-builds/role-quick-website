import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* Comments stripped before any "is it gone?" assertion, the same way R-046 does it in
   tests/review-highlighting.test.mjs and the header guard does it in
   tests/packet-resume-header.test.mjs.

   The note left where the review drawer used to be necessarily names what it deleted:
   submit-request, submission/approve, the poll. A bare grep counts that explanation as the code
   still being there, and this failed exactly that way the moment the note was written. Deleting
   the explanation to satisfy a grep would be the wrong repair. */
function shippedCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

test("saved answers honor standing consent while retaining a manual fallback", async () => {
  const dashboard = await readFile(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /await prepareApplication\(questions\)/);
  assert.match(dashboard, /missingRequiredAnswers\.length > 0/);
  assert.match(dashboard, /reviewDiscovered \? "Review answers" : "Answer these"/);
  // The button was "Prepare application" and the bar under it ran to nineteen words about
  // "automation permission". Both were rewritten in the 2026-07-26 UX pass; the gate they
  // describe is unchanged, so the assertions follow the new wording.
  assert.match(dashboard, /"Fill the form"/);
  assert.match(dashboard, /Litos fills the form with your saved answers and this resume/);
  assert.match(dashboard, /Check the preview, then send/);
  assert.match(dashboard, /submission_authorized_at/);
  // Assert the GATE, not the button label. The invariant is that approving is reachable only from
  // ready_for_final_approval and retrying only from failed; both labels have already been reworded
  // once ("Submit application" -> "Send it", "Retry preparation" -> "Try again") and broke this
  // test rather than the product. Bounded spans, so a match cannot span half the file.
  assert.match(dashboard, /review\.status === "ready_for_final_approval"[\s\S]{0,600}onClick=\{approveVerifiedPreview\}/);
  assert.match(dashboard, /review\.status === "failed"[\s\S]{0,200}onClick=\{onRetry\}/);
  assert.match(dashboard, /const previewReady = Boolean\(previewUrl\) && previewLoaded && !previewFailed/);
  assert.match(dashboard, /disabled=\{finalApprovalBlocked\}/);
  assert.match(dashboard, /const requiredAnswerMissing = review\.questions\.some/);
  assert.match(dashboard, /const sensitiveQuestionPresent = review\.questions\.some/);
  assert.match(dashboard, /requiresSensitiveQuestionReview\(question\.question, question\.answer\)/);
  assert.match(dashboard, /return !\(answer \?\? ""\)\.trim\(\)/);
  assert.match(dashboard, /Loading preview\./);
  assert.match(dashboard, /Required answer missing\./);
  assert.match(dashboard, /A sensitive demographic, identity, or legal question is present/);
  assert.match(dashboard, />Resume<\/p>/);
  assert.match(dashboard, />Answers<\/p>/);
  assert.match(dashboard, /<ResumePaper spec=\{stripMetadata\(packet\.spec\)\} name=\{contactName\(packet\.spec\)\} contact=\{contactLine\(packet\.spec\)\} \/>/);
  assert.match(dashboard, /onError=\{\(\) => setPreviewState\(\{ url: previewUrl, loaded: false, failed: true \}\)\}/);
  // A CAPTCHA handoff is only a live control when the backend gives the dashboard a live browser
  // URL. Managed Stratus preview stops carry only screenshot evidence, so those must not render
  // a button-shaped promise that opens nowhere.
  assert.match(dashboard, /const handoffUrl = needsAttention \? submission\.handoff_url : undefined/);
  assert.match(dashboard, /const canFinishInDashboard = Boolean\(handoffUrl\) && !attendedHandoffUrl/);
  assert.match(dashboard, /<iframe[\s\S]{0,300}src=\{handoffUrl\}[\s\S]{0,300}Live company application page/);
  assert.match(dashboard, /No live browser to reopen/);
  assert.match(dashboard, /Open company page/);
  assert.match(dashboard, /const attendedHandoffUrl = exactAttendedHandoffUrl\(review\)/);
  assert.match(dashboard, /ensureCurrentExtensionSession\([\s\S]{0,160}minimumAttendedHandoffExtensionVersion\(review\.ats_name\)/);
  assert.match(dashboard, /await armHandoffs\(\[\{ id: submission\.application_id, portalUrl: attendedHandoffUrl \}\]\)/);
  assert.match(dashboard, /!handoffUrl && !attendedHandoffUrl && portalUrl/);
  assert.match(dashboard, /Open exact company form/);
  assert.match(dashboard, /Manual dashboard trial/);
  assert.match(dashboard, /Use this exact frozen resume and the separate Litos routing email/);
  assert.match(dashboard, /Portal routing email:/);
  assert.match(dashboard, /manualTrialPacket\.packet_audit\.identities\.applicant_email/);
  assert.doesNotMatch(dashboard, /Portal routing email:[\s\S]{0,120}review\.applicant_email\?\.address/);
  assert.match(dashboard, /openManualAttendedHandoff\(\)[\s\S]{0,1800}\/submission\/manual-handoff/);
  assert.match(dashboard, /manualHandoffMatchesPacket\(current, attendedHandoffUrl, manualTrialPacket\)/);
  assert.match(dashboard, /companyTab\.location\.replace\(handoff\.url\)/);
  const manualHandoff = dashboard.slice(
    dashboard.indexOf("async function openManualAttendedHandoff()"),
    dashboard.indexOf("/* A wait that ends.", dashboard.indexOf("async function openManualAttendedHandoff()")),
  );
  assert.doesNotMatch(manualHandoff, /companyTab\.location\.replace\(attendedHandoffUrl\)/);
  assert.match(dashboard, /\/submit-request/);
  assert.match(dashboard, /\/submission\/approve/);
  assert.match(dashboard, /I cleared the check/);
  assert.match(dashboard, /I submitted it myself/);
  assert.match(dashboard, /JSON\.stringify\(\{ outcome \}\)/);
  assert.match(dashboard, /source: "attended_handoff"/);
  assert.match(dashboard, /Open the company page/);
  assert.match(dashboard, /Litos will never pretend to be you/);
  assert.match(dashboard, /will not get past the puzzle that checks you are human, a code on your phone, a login/);
  assert.doesNotMatch(dashboard, /Review the answers that need your voice/);
  assert.doesNotMatch(dashboard, /Continue to \$\{questions\.length\} question/);
});

/* PR #319's TEST, KEPT AS ITS INTENT AND NOT AS ITS LINE.
 *
 * #319 was right that continuing a stalled application audited a packet whose reviewed answers had
 * never been stored, and it is still right. What it could not check from here is which route did the
 * storing: it added "needs_attention" to the list gating PUT /applications/:id/review, and
 * applyApplicationReviewEdit writes 'questions_ready' over the status unconditionally, so auditing a
 * blocked packet relabelled it READY while it was still blocked. Measured on a real row in the
 * backend suite, src/routes/reviewAnswerSave.test.ts, 'the edit route is not refused on an unclaimed
 * stopped run, and relabels it'.
 *
 * So the intent is asserted here and the route with it, and the original pin on the literal array is
 * gone: what the two branches DO is executable and is tested for real against the real functions in
 * features/applications/domain/review-answer-save.test.mts. This is the half that only the
 * component's source can answer, which is whether continueFromResume asks at all. */
test("a stalled application persists reviewed answers before its exact packet audit", async () => {
  const dashboard = shippedCode(await readFile(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  ));
  const audit = dashboard.slice(dashboard.indexOf("async function continueFromResume()"));
  assert.ok(audit.includes("packet-audit"), "continueFromResume is gone from the dashboard");

  // #319's intent: the answers are written before the audit is taken, for a stalled packet too.
  assert.match(audit, /auditAnswerWrite\(canonicalReview\.status\)/);
  assert.match(audit, /answerWrite === "answers_only"[\s\S]{0,900}saveReviewAnswers</);

  /* And the constraint it missed. The status list that reaches PUT /review must not name the
     stalled packet, in any order, or the audit relabels what it audits. */
  const reviewEdit = /\[((?:\s*"[a-z_]+",?)+)\]\.includes\(canonicalReview\.status\)/.exec(audit);
  assert.equal(reviewEdit, null, "the audit-time route decision belongs to auditAnswerWrite, which has a test");
  assert.doesNotMatch(
    audit,
    /"needs_attention"[\s\S]{0,700}api<SubmissionResponse>\(`\/applications\/\$\{applicationId\}\/review`/,
    "a stalled packet must not be persisted through the route that writes over its status",
  );
});

test("Tracker arms only the exact attended URL returned by the backend contract", async () => {
  const [dashboard, handoff] = await Promise.all([
    readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/attended-handoff.ts", import.meta.url), "utf8"),
  ]);
  assert.match(handoff, /review\.ats_name === "jobvite"[\s\S]{0,300}JOBVITE_ATTENDED_GATE_REASON/);
  assert.match(handoff, /review\.ats_name === "icims"[\s\S]{0,400}ICIMS_ATTENDED_GATE_REASON[\s\S]{0,200}ICIMS_SECURITY_CODE_GATE_REASON/);
  assert.match(handoff, /return \/\^\\\/jobs\\\/\\d\+\\\/[\s\S]{0,100}\\\/login\$\/i\.test\(url\.pathname\)/);
  assert.doesNotMatch(handoff, /atsName === "icims"[\s\S]{0,400}\\\/apply\$/);
  assert.match(dashboard, /const attendedHandoffUrl = exactAttendedHandoffUrl\(review\)/);
  assert.match(dashboard, /await armHandoffs\(\[\{ id: submission\.application_id, portalUrl: attendedHandoffUrl \}\]\)/);
  assert.match(dashboard, /companyTab\.location\.replace\(attendedHandoffUrl\)/);
  assert.doesNotMatch(dashboard, /armHandoffs\(\[\{ id: submission\.application_id, portalUrl: portalUrl/);
});

test("overview keeps three application states and sends matches to the review screen", async () => {
  const overview = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

  // Still three states; the labels moved onto the four-word vocabulary.
  assert.match(overview, /label: "Ready"/);
  assert.match(overview, /label: "Needs you"/);
  assert.match(overview, /label: "Sent"/);
  // Each one is a filter link rather than a bare number.
  assert.match(overview, /href: "\/dashboard\/applications\?state=action"/);
  assert.doesNotMatch(overview, /label: "Prepared"/);
  assert.doesNotMatch(overview, /Recent activity/);
  assert.doesNotMatch(overview, /Daily resume preparation/);
  assert.match(overview, /MONTHLY_PRO_APPLICATION_LIMIT = 1_000/);
  assert.match(overview, /return me\.usage\.resumes\.limit/);
  /* THE REVIEW DRAWER IS GONE, and most of what this test used to assert went with it: role=dialog,
     the two panes, "Send it", canSubmit, /submit-request, the 2.5s poll, the focus trap and the
     focus restore. None of those are deleted behaviours. They are the review screen's behaviours,
     asserted below against the file that owns them, and the drawer was a second implementation of
     them that had already drifted twice: it rendered the applicant's resume under the posting's job
     title, and it showed a MatchScore ring with none of the requirement highlighting that explains
     the number.

     Review is a link now. That is the whole contract on this page. */
  assert.match(overview, /reviewHref=\{reviewHrefFor\(job\)\}/);
  assert.match(overview, /<Link href=\{reviewHref\}[\s\S]*?Review\s*<\/Link>/);
  assert.match(overview, /\/dashboard\/applications\?application=\$\{packet\.id\}/);
  assert.match(overview, /\{status === "failed" \? "Try again" : "Prepare"\}/);

  /* Home is a launcher, not an approval surface. The card may prepare a packet, but a ready packet
     must open Tracker so the student sees the exact resume, answers, PDF and filled preview before
     the route that can submit is ever called. */
  const shipped = shippedCode(overview);
  assert.doesNotMatch(shipped, /role="dialog"/);
  assert.doesNotMatch(shipped, /"Send it"/);
  assert.doesNotMatch(shipped, /function ReviewDrawer/);
  // Word-bounded: `ApplicationReview` is a live type name and ends in the same seven letters.
  assert.doesNotMatch(shipped, /\bonReview\b/);
  assert.doesNotMatch(shipped, /\/submission\/approve/);
  assert.doesNotMatch(shipped, /\/submit-request/);
  assert.doesNotMatch(shipped, /async function submitApplication/);
  assert.match(overview, /\{status === "failed" \? "Try again" : "Prepare"\}/);
  assert.match(overview, /<PendingLabel>Getting ready<\/PendingLabel>/);
  // Home is a three-card window over a variable daily set. Submitting the first three must reveal
  // later matches, not complete the day while a fourth match is still waiting.
  assert.match(overview, /const todayJobs = rankedJobs;/);
  /* The window moved into features/applications as visibleMatches, where it is tested by finishing
     matches and checking what refills rather than by matching on this file's text. Home must window
     the day's full set (todayJobs), never a pre-cut slice of it. */
  assert.match(overview, /visibleMatches\(todayJobs, \{ dismissed, submitted: submittedToday \}\)/);
  assert.doesNotMatch(overview, /rankedJobs\.slice\(0, 3\)/);
});

/* The other half of the deletion, and the point of it: Home must not review a packet.
   Each of these is a thing the drawer did. Any one of them reappearing here is the beginning of a
   second review screen, which is how the first one drifted. */
test("Home does not review a packet", async () => {
  const overview = shippedCode(
    await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
  );

  assert.doesNotMatch(overview, /role="dialog"/, "reviewing happens on /dashboard/applications");
  assert.doesNotMatch(overview, /submit-request/, "Home starts no submission");
  assert.doesNotMatch(overview, /submission\/approve/, "Home approves no submission");
  assert.doesNotMatch(overview, /"Send it"/, "the send control belongs to the review screen");
  assert.doesNotMatch(overview, /<ResumePaper/, "Home renders no resume");
  assert.doesNotMatch(overview, /<MatchScore/, "Home scores no packet against a posting");
  assert.doesNotMatch(overview, /containFocus/, "no modal here, so no focus trap to maintain");
});

/* Everything above was asserted against the drawer until it was deleted. It is asserted here now,
   against the screen that actually performs a submission, so the coverage moved rather than
   thinned. */
test("the review screen gates and performs the submission", async () => {
  const [review, evidenceSession] = await Promise.all([
    readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/applications/domain/packet-evidence-session.ts", import.meta.url), "utf8"),
  ]);

  // A required question with no answer stops the send, on the screen that can also collect it.
  assert.match(review, /questions\.filter\(\(question\) => question\.required && !question\.answer\.trim\(\)\)/);
  assert.match(review, /allowServerAnswerRefresh\?: boolean/);
  assert.match(review, /!options\.allowServerAnswerRefresh && finalQuestions\.some/);
  assert.match(review, /prepareApplication\(currentQuestions, \{ allowServerAnswerRefresh: true \}\)/);
  // Both endpoints: the first request, and the approval of a run already waiting on the student.
  assert.match(review, /\/submit-request/);
  assert.match(review, /\/submission\/approve/);
  assert.match(review, /const previewReady = Boolean\(previewUrl\) && previewLoaded && !previewFailed/);
  assert.match(review, /const sensitiveQuestionPresent = review\.questions\.some/);
  /* `handoffExpired` joined the list on 2026-08-09, after the Cresta 409; `!packetEvidenceReviewed`
     on 2026-08-10 with the exact packet audit; and `transcriptPending` on 2026-08-11 when employers'
     forms started asking for a file Litos had to be holding. Pinned as the whole expression rather
     than a substring, on purpose: this is the one gate in front of a real employer submission, and a
     term silently dropped from it is a button that offers a send the server refuses. Two terms
     arrived on this line from two branches within a day of each other, one at each end of it, which
     is exactly the collision an anchored whole-expression pin is here to make loud.
     See tests/expired-handoff-send.regression-1.test.mjs. */
  assert.match(review, /const finalApprovalBlocked = !packetEvidenceReviewed \|\| educationProfilePending \|\| Boolean\(educationDriftWarning\) \|\| coverLetterPending \|\| requiredAnswerMissing \|\| sensitiveQuestionPresent \|\| !previewReady \|\| handoffExpired \|\| approving \|\| restarting \|\| transcriptPending/);
  /* CLOSED UNTIL AN ATTACHMENT OPENS IT, and never opened by a field that is merely absent.
   *
   * This read `documentMarks !== undefined && outstandingDocumentAsks.length > 0`, which let the
   * ABSENCE of the marks map enable the send. `documents` rides on GET /:id/submission alone, so it
   * is absent on the board seed for any packet whose row stored no mark and on every other envelope
   * this page installs. Re-entering an application with a measured, outstanding, unattached ask left
   * Send it green until the first poll landed 2.5s later, which is long enough to press.
   *
   * The tri-state is `required_documents`, the same discipline cover_letter_required is held to:
   * undefined means no run has measured this form and nothing here blocks, and only a present,
   * non-empty ask blocks. Only `attached_at` clears it, because "I have ordered it" cannot make a
   * sealed transcript appear on the employer's form. */
  /* THE SECOND HALF OF THE TERM, added 2026-08-11 with `transcript_supported`.
   *
   * An outstanding ask is not the only way this employer's form refuses. The run also measures
   * whether the form has a control Litos could put the file in, and that measurement shipped on the
   * wire and was read by nothing: the student uploaded, the ask cleared because a mark existed, and
   * Send went green over an application whose document had attached to nothing. So a kind the run
   * measured false goes on blocking after a file is stored, because a stored file is not a delivered
   * one and a settled row must not answer for the employer's own blocker. */
  assert.match(review, /const transcriptPending = outstandingDocumentAsks\.length > 0 \|\| documentsLitosCannotDeliver;/);
  assert.doesNotMatch(
    review,
    /transcriptPending = documentMarks !== undefined/,
    "an absent measurement is not evidence that she has attached anything",
  );
  /* The asks and the stored files are resolved per kind, by a domain function, and not by a `find`
     plus a whole-screen guard. That shape made one kind's state decide another kind's control: see
     features/applications/domain/submission-checklist.test.mts, which holds the behaviour. */
  assert.match(review, /documentControls\(review\.required_documents, documentMarks, review\)/);
  assert.match(review, /onClick=\{approveVerifiedPreview\}/);
  assert.match(review, /disabled=\{finalApprovalBlocked\}/);
  // A ready packet cannot jump directly from the Tracker row to Send it. It must render the exact
  // PDF, posting and requirement evidence first, and that per-packet proof becomes a term in the
  // final employer-send gate rather than a decorative warning.
  assert.match(review, /status === "ready_for_final_approval" \? "review" : screenForStatus\(status, "review"\)/);
  assert.match(review, /const packetEvidenceReady = Boolean\([\s\S]{0,600}exactPacketPdfReady[\s\S]{0,600}auditedDisplayReady[\s\S]{0,600}activePacketEvidence\.specJson === JSON\.stringify\(spec\)[\s\S]{0,300}activePacketEvidence\.questionsSnapshot === currentQuestionsSnapshot/);
  assert.match(review, /reconcilePacketPdfVerification\(current, verified\)/);
  assert.match(evidenceSession, /verified\.auditDigest === expected\.packet_audit\.audit_digest/);
  assert.match(evidenceSession, /verified\.sha256 === expected\.pdf\.sha256/);
  assert.match(evidenceSession, /verified\.sizeBytes === expected\.pdf\.size_bytes/);
  assert.match(review, /reconcileUnacknowledgedPacketPoll\(current, requestedId, result\.review\.packet_audit\)/);
  assert.match(evidenceSession, /packetAuditIdentityMatches\(current\.response\.packet_audit, polledAudit\)/);
  assert.match(review, /review\?\.status === "ready_for_final_approval"[\s\S]{0,120}moveToScreen\("portal"\)/);
  assert.match(review, /<ExactPacketPdf[\s\S]{0,500}onVerified=\{recordPacketPdfVerification\}/);
  assert.match(review, /`\/applications\/\$\{applicationId\}\/packet-audit\/acknowledge`/);
  assert.match(review, /audit_digest: audit\.audit_digest/);
  assert.match(review, /packet_version: audit\.packet_version/);
  assert.match(review, /pdf_sha256: pdf\.sha256/);
  assert.match(review, /size_bytes: pdf\.size_bytes/);
  assert.match(review, /Review the exact resume beside the job description and its evidence colours before sending/);
  assert.match(review, /Check resume/);
  assert.match(review, />Resume<\/p>/);
  assert.match(review, />Answers<\/p>/);
  assert.match(review, /<ResumePaper spec=\{stripMetadata\(packet\.spec\)\} name=\{contactName\(packet\.spec\)\} contact=\{contactLine\(packet\.spec\)\} \/>/);
  assert.match(review, /onError=\{\(\) => setPreviewState\(\{ url: previewUrl, loaded: false, failed: true \}\)\}/);
  // The poll that moves a run through its statuses, which the drawer duplicated on a 2.5s timer.
  assert.match(review, /window\.setTimeout\(poll,/);
});

/* Removed 2026-07-27: this guarded that every paid surface quoted the same
   1,000-resume allowance. Pricing has been taken off the site entirely while
   the plan is reworked, components/PricingCards.tsx is deleted, and no
   surface states a price. There is nothing left to keep consistent. Restore
   this test alongside whatever the new pricing turns out to be. */

test("automation settings send field-specific updates so stale clients cannot restore another permission", async () => {
  const settings = await readFile(new URL("../app/dashboard/settings/page.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../lib/api.ts", import.meta.url), "utf8");
  assert.match(settings, /saveAutomation\(\{ automatic_submission_enabled: event\.target\.checked \}\)/);
  assert.match(settings, /changeAutomaticVerification\(event\.target\.checked\)/);
  assert.match(settings, /verificationEnableDecision\(emailConnections\)/);
  assert.match(settings, /\(connected \? disconnectProvider\(provider\) : connectProvider\(provider, verificationConnectionPrompt\)\)/);
  assert.match(settings, /Inbox access/);
  assert.match(settings, /getApplicationEmailStatus\(\)\.catch\(\(\) => null\)/);
  assert.match(settings, /if \(callbackProvider && callbackStatus\)/);
  assert.match(settings, /Use a Litos application email/);
  assert.match(settings, /Employer mail forwards to your account email/);
  assert.match(settings, /Use my connected inbox as a fallback/);
  assert.match(settings, /Codes sent to its packet-specific address do not require access to Gmail or Outlook/);
  assert.match(api, /getApplicationEmailStatus\(\)/);
  assert.doesNotMatch(settings, /Email connections<\/p>/);
  assert.match(settings, /shouldEnableVerificationAfterCallback/);
  assert.match(settings, /setAutomationSettings\(\{ automatic_verification_enabled: true \}\)/);
  assert.match(settings, /getApplicationEmailStatus\(\)\.catch\(\(\) => null\)/);
  assert.match(settings, /setAutomaticVerification\(refreshedOnboarding\.automatic_verification_enabled\)/);
  assert.match(settings, /The Litos application inbox remains active/);
  assert.match(settings, /callbackAvailability === "litos_inbox"/);
  assert.match(settings, /callbackAvailability === "personal_inbox"/);
  assert.doesNotMatch(settings, /connection was not completed\. Email verification is still off/);
  assert.doesNotMatch(settings, /aliasAvailable \? " Email verification/);
  assert.doesNotMatch(settings, /verificationEnableDecision\(emailConnections, applicationEmail/);
  assert.match(api, /setAutomationSettings\(settings: Partial<AutomationSettings>\)/);
});

test("a failed onboarding permission save keeps the consent controls available for retry", async () => {
  const start = await readFile(new URL("../app/start/page.tsx", import.meta.url), "utf8");
  const steps = await readFile(new URL("../components/start/steps.tsx", import.meta.url), "utf8");
  assert.match(start, /if \(error && !state\)/);
  assert.match(start, /case "done":[\s\S]*error &&[\s\S]*<DoneStep/);
  assert.match(start, /await completeOnboarding\(settings\)/);
  assert.match(steps, /\.finally\(\(\) => setBusy\(false\)\)/);
});

test("privacy disclosure covers both standing submission and verification-code access", async () => {
  const privacy = await readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8");
  // The plain-language pass retired "standing automatic-submission permission"
  // (commit 3b7e4b1) and this assertion was not moved with it, so the suite has
  // been red on a disclosure that is actually still there, in plainer words.
  // Pinned to the substance, not the jargon: the setting, and the cancel window.
  assert.match(privacy, /send without asking you each\s+time/);
  assert.match(privacy, /15-second countdown, and one click cancels it/);
  assert.match(privacy, /Gmail or\s+Outlook you connected/);
  // was /separate,[\s\S]*optional permissions/ before the plain-language pass
  assert.match(privacy, /separate choices\.\s+You can turn either one off/);
});

test("cover letters wait for a detected attachment field, including optional fields", async () => {
  const dashboard = await readFile(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /\/cover-letter/);
  assert.match(dashboard, /Tailored cover letter/);
  assert.match(dashboard, /saveCoverLetter/);
  assert.match(dashboard, /coverLetterDownloadUrl/);
  assert.match(dashboard, /review\.cover_letter_supported === true/);
  // Reworded 2026-07-28 ("even when the field is marked optional" -> "even when it is marked
  // optional") when the card lost its eyebrow and its first sentence. The promise is the
  // invariant, not the phrasing: an optional attachment field still gets a letter.
  assert.match(dashboard, /even when it is marked optional/);
  const creation = dashboard.slice(dashboard.indexOf("async function createApplication"), dashboard.indexOf("async function generateCoverLetter"));
  assert.doesNotMatch(creation, /\/cover-letter/);
  assert.doesNotMatch(creation, /generateCoverLetter/);
  assert.match(dashboard, /method: "DELETE"/);
  assert.match(dashboard, /saving \|\| coverLetterBusy/);
  assert.match(dashboard, /_cover_letter!\.warnings/);
  assert.match(dashboard, /coverLetterPending/);
  assert.match(dashboard, />Cover letter<\/p>/);
});

test("application creation uses the single-response packet and polling cannot overlap", async () => {
  const dashboard = await readFile(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /application:\s*\{\s*ats_name:/);
  assert.match(dashboard, /const created = generated\.application;[\s\S]*created\?\.spec\._review/);
  assert.match(dashboard, /window\.setTimeout\(poll/);
  assert.match(dashboard, /document\.visibilityState/);
  assert.doesNotMatch(dashboard, /setInterval\(/);
});

test("the controlled portal mirrors every supported adapter without an employer destination", async () => {
  const page = await readFile(new URL("../app/qa/portal-submission/page.tsx", import.meta.url), "utf8");
  const casePage = await readFile(new URL("../app/qa/portal-submission/[board]/[case]/page.tsx", import.meta.url), "utf8");
  const portal = await readFile(new URL("../app/qa/portal-submission/portal-form.tsx", import.meta.url), "utf8");
  assert.match(page, /return <PortalForm board=\{board\} caseId=\{caseId\} \/>/);
  assert.doesNotMatch(page, /useSearchParams|Suspense/);
  assert.match(casePage, /return <PortalForm board=\{board\} caseId=\{caseId\} \/>/);
  /* The board union moved OUT of portal-form.tsx into boards.ts on 2026-07-28,
     so that the two route files and the form could not disagree about which
     board a URL means. This assertion followed it. Reading the shared module is
     also the stronger check: it is now the single place a new adapter has to be
     registered, so a board added to the harness without being added here would
     still be caught. */
  const boards = await readFile(new URL("../app/qa/portal-submission/boards.ts", import.meta.url), "utf8");
  for (const adapter of ["greenhouse", "lever", "ashby", "smartrecruiters"]) {
    assert.match(boards, new RegExp(`"${adapter}"`), `boards.ts is missing ${adapter}`);
  }
  assert.match(portal, /BoardName/, "portal-form must use the shared board type");
  assert.match(portal, /name="job_application\[resume\]"/);
  assert.match(portal, /name="job_application\[first_name\]"/);
  assert.match(portal, /name="job_application\[last_name\]"/);
  assert.match(portal, /name="urls\[LinkedIn\]"/);
  assert.match(portal, /name="_systemfield_name"/);
  assert.match(portal, /id="confirm-email-input"/);
  // was "No employer received this application" before the plain-language pass
  assert.match(portal, /No employer got this application/);
});
