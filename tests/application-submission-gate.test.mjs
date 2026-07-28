import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("saved answers honor standing consent while retaining a manual fallback", async () => {
  const dashboard = await readFile(
    new URL("../app/dashboard/applications/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(dashboard, /await prepareApplication\(questions\)/);
  assert.match(dashboard, /missingRequiredAnswers\.length > 0/);
  // Same promise, plainer words: the questions screen only ever asks for genuine blanks.
  // 2026-07-28: "Only the answers..." became "A few answers...". Matching the fragment rather
  // than the whole sentence, because the guarantee is the subject, not the adverb.
  assert.match(dashboard, /answers we could not work out/);
  assert.match(dashboard, /Everything we already knew is filled in\. This page only shows the blanks/);
  // The button was "Prepare application" and the bar under it ran to nineteen words about
  // "automation permission". Both were rewritten in the 2026-07-26 UX pass; the gate they
  // describe is unchanged, so the assertions follow the new wording.
  assert.match(dashboard, /"Fill the form"/);
  assert.match(dashboard, /Litos fills the form with your saved answers and this resume/);
  // The unauthorized-auto-submit state, in the words it now uses. Was "Automatic submission is
  // off or was revoked. Review the captured form, then approve..." until ee07b12.
  assert.match(dashboard, /You asked to check every application first/);
  assert.match(dashboard, /submission_authorized_at/);
  // Assert the GATE, not the button label. The invariant is that approving is reachable only from
  // ready_for_final_approval and retrying only from failed; both labels have already been reworded
  // once ("Submit application" -> "Send it", "Retry preparation" -> "Try again") and broke this
  // test rather than the product. Bounded spans, so a match cannot span half the file.
  assert.match(dashboard, /review\.status === "ready_for_final_approval"[\s\S]{0,600}onClick=\{onApprove\}/);
  assert.match(dashboard, /review\.status === "failed"[\s\S]{0,200}onClick=\{onRetry\}/);
  assert.match(dashboard, /\/submit-request/);
  assert.match(dashboard, /\/submission\/approve/);
  assert.match(dashboard, /I finished it myself/);
  // The refusal list, in plain words since the terminology pass: it will not impersonate you, and
  // it will not get past a CAPTCHA, an MFA code, a login, or a legal declaration. This is the
  // safety promise the site makes publicly, so it must stay on the screen that performs the act.
  assert.match(dashboard, /Litos will never pretend to be you/);
  assert.match(dashboard, /will not get past the puzzle that checks you are human, a code on your phone, a login/);
  assert.doesNotMatch(dashboard, /Review the answers that need your voice/);
  assert.doesNotMatch(dashboard, /Continue to \$\{questions\.length\} question/);
});

test("overview keeps three application states and reviews matches in a right-side drawer", async () => {
  const overview = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  // Still three states; the labels moved onto the four-word vocabulary.
  assert.match(overview, /label="Ready"/);
  assert.match(overview, /label="Needs you"/);
  assert.match(overview, /label="Sent"/);
  // Each one is a filter link rather than a bare number.
  assert.match(overview, /href="\/dashboard\/applications\?state=action"/);
  assert.doesNotMatch(overview, /label="Prepared"/);
  assert.doesNotMatch(overview, /Recent activity/);
  assert.doesNotMatch(overview, /Daily resume preparation/);
  assert.match(overview, /MONTHLY_PRO_APPLICATION_LIMIT = 1_000/);
  assert.match(overview, /return me\.usage\.resumes\.limit/);
  assert.match(overview, /role="dialog"/);
  assert.match(overview, /Job description/);
  assert.match(overview, /Tailored resume/);
  // The drawer's send control. Label reworded 2026-07-27 ("Submit application" -> "Send it");
  // what matters is that the drawer can send and that sending is gated, asserted just below.
  assert.match(overview, /"Send it"/);
  assert.match(overview, /const canSubmit = Boolean\(packet && review && missingAnswers\.length === 0/);
  assert.match(overview, /\/submit-request/);
  assert.match(overview, /\/submission`/);
  assert.match(overview, /window\.setTimeout\(tick, 2_500\)/);
  assert.match(overview, /reviewTriggerRef\.current\?\.focus\(\)/);
  assert.match(overview, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(overview, /onKeyDown=\{containFocus\}/);
  assert.match(overview, /prepared \? "Review" : "Try again"/);
  assert.match(overview, /activeReviewJobIdRef\.current === submittedJobId/);
  assert.match(styles, /dashboard-drawer-in/);
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
  assert.match(settings, /saveAutomation\(\{ automatic_verification_enabled: event\.target\.checked \}\)/);
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
  assert.match(dashboard, /Cover letter included with final submission/);
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
  assert.match(portal, /type Board = "greenhouse" \| "lever" \| "ashby" \| "smartrecruiters"/);
  assert.match(portal, /name="job_application\[resume\]"/);
  assert.match(portal, /name="job_application\[first_name\]"/);
  assert.match(portal, /name="job_application\[last_name\]"/);
  assert.match(portal, /name="urls\[LinkedIn\]"/);
  assert.match(portal, /name="_systemfield_name"/);
  assert.match(portal, /id="confirm-email-input"/);
  // was "No employer received this application" before the plain-language pass
  assert.match(portal, /No employer got this application/);
});
