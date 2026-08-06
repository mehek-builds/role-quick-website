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
  assert.match(dashboard, /\/submit-request/);
  assert.match(dashboard, /\/submission\/approve/);
  assert.match(dashboard, /I cleared the check/);
  assert.match(dashboard, /I submitted it myself/);
  assert.match(dashboard, /JSON\.stringify\(\{ outcome \}\)/);
  assert.match(dashboard, /source: "attended_handoff"/);
  assert.match(dashboard, /Open the company page/);
  assert.doesNotMatch(dashboard, /Review the answers that need your voice/);
  assert.doesNotMatch(dashboard, /Continue to \$\{questions\.length\} question/);
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
  const review = await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

  // A required question with no answer stops the send, on the screen that can also collect it.
  assert.match(review, /questions\.filter\(\(question\) => question\.required && !question\.answer\.trim\(\)\)/);
  // Both endpoints: the first request, and the approval of a run already waiting on the student.
  assert.match(review, /\/submit-request/);
  assert.match(review, /\/submission\/approve/);
  assert.match(review, /const previewReady = Boolean\(previewUrl\) && previewLoaded && !previewFailed/);
  assert.match(review, /const finalApprovalBlocked = educationProfilePending \|\| Boolean\(educationDriftWarning\) \|\| coverLetterPending \|\| requiredAnswerMissing \|\| !previewReady \|\| approving/);
  assert.match(review, /onClick=\{approveVerifiedPreview\}/);
  assert.match(review, /disabled=\{finalApprovalBlocked\}/);
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
  assert.match(settings, /\(connected \? disconnectProvider\(provider\) : connectProvider\(provider, true\)\)/);
  assert.match(settings, /Inbox access/);
  assert.match(settings, /getApplicationEmailStatus\(\)\.catch\(\(\) => null\)/);
  assert.match(settings, /Use a Litos application email/);
  assert.match(settings, /Employer mail forwards to your account email/);
  assert.match(api, /getApplicationEmailStatus\(\)/);
  assert.doesNotMatch(settings, /Email connections<\/p>/);
  assert.match(settings, /shouldEnableVerificationAfterCallback/);
  assert.match(settings, /setAutomationSettings\(\{ automatic_verification_enabled: true \}\)/);
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
