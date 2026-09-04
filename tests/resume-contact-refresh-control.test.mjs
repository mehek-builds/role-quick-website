/* A STALE RESUME HEADER CAN BE REFRESHED FROM THE PACKET SCREEN.
 *
 * MEASURED live on trylitos.com 2026-09-04: every packet built before the applicant moved (Pony.ai
 * fdcf4ccb, Belvedere Trading c4413bff/6fda0404/4de84885, Transparent Hiring 6f8524ca, among others)
 * still attaches its exact resume PDF with the header printed at generation time - "Dubai, Dubai |
 * mehekman@usc.edu | +971 567417451" - while the applicant's profile and the managed form's own
 * live fill both read her current Los Angeles address and +1 phone number. volley-backend PR #945
 * (branch fix/a-packet-header-follows-the-profile) adds `resume_contact_stale` to
 * GET /applications/:id/submission and `POST /applications/:id/resume/contact-refresh` to fix it
 * without spending a monthly build or forking a Tracker row. This file pins the client wiring: that
 * both screens decide whether to show the notice through the ONE shared helper rather than two
 * independently-written checks, that the button posts the documented route through the app's
 * ordinary `api()` helper, that a refusal renders through `userFacingError`, and that a successful
 * response is installed through the same nextSubmissionState/publishSubmissionEnvelope reducer every
 * other direct mutation on this screen uses.
 *
 * SOURCE ASSERTIONS, deliberately, in the style of tests/frozen-answer-has-a-route.test.mjs: the
 * behaviour lives inside a large client component with no render harness in this repo, so what can
 * be pinned without one is that the right functions are called, in the right order, with the right
 * strings.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PAGE = new URL("../app/dashboard/applications/page.tsx", import.meta.url);
const DOMAIN = new URL("../features/applications/domain/resume-contact-stale.ts", import.meta.url);
const INDEX = new URL("../features/applications/index.ts", import.meta.url);

/* Comments stripped before every assertion, the same way frozen-answer-has-a-route.test.mjs and
   application-submission-gate.test.mjs do it: this fix necessarily explains itself in prose that
   names the very identifiers being asserted on, and a bare grep would count the explanation as the
   code. */
function shippedCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/* GUARD-ORDERING HELPERS, the same shape tests/application-direct-answer-flow.test.mjs already pins
 * guard ordering with: a plain substring search that fails loudly when the needle is gone (rather
 * than a regex whose failure mode is "silently matches zero times"), and an explicit index order
 * check so a guard that survives but moves AFTER the write it was supposed to gate still fails. */
function requiredIndex(source, needle, label = needle, fromIndex = 0) {
  const index = source.indexOf(needle, fromIndex);
  assert.ok(index >= 0, `${label} is missing`);
  return index;
}

function assertOrdered(indices, message) {
  assert.ok(indices.every((index) => index >= 0), `${message}: every source marker must exist`);
  for (let index = 1; index < indices.length; index += 1) {
    assert.ok(indices[index] > indices[index - 1], message);
  }
}

let pageSource;
let domainSource;
let handlerBody;

test.before(async () => {
  pageSource = shippedCode(await readFile(PAGE, "utf8"));
  domainSource = shippedCode(await readFile(DOMAIN, "utf8"));
  // The handler's own source, bounded at the NEXT top-level function declaration rather than at a
  // fixed character offset, so this file does not need updating every time a comment inside or
  // beside refreshResumeContact grows or shrinks.
  const start = pageSource.indexOf("async function refreshResumeContact");
  assert.ok(start > 0, "refreshResumeContact must exist");
  const next = pageSource.slice(start + 1).search(/\n {2}(?:async )?function [A-Za-z]/);
  handlerBody = next === -1 ? pageSource.slice(start) : pageSource.slice(start, start + 1 + next);
});

test("the domain module is wired into the public feature index", async () => {
  const index = shippedCode(await readFile(INDEX, "utf8"));
  assert.match(index, /export \* from "\.\/domain\/resume-contact-stale"/,
    "resumeContactStaleNotice must reach the dashboard through the same public API every other domain module uses");
});

test("the decision is a pure helper, not a direct read of resume_contact_stale", () => {
  assert.match(domainSource, /export function resumeContactStaleNotice\(/,
    "the one function both screens must call");
  assert.match(domainSource, /export function resumeContactStaleIdentity\(/,
    "nextSubmissionState needs its own comparison term for this field - see submission-state.ts");
  // Absent, malformed and half-a-pair must all read the same way: null, never a throw.
  assert.match(domainSource, /if \(!staleness \|\| typeof staleness !== "object" \|\| Array\.isArray\(staleness\)\) return null;/);
  assert.match(domainSource, /if \(!stored \|\| !current\) return null;/);
});

test("the page imports the shared decision instead of re-deriving it from the wire shape", () => {
  assert.match(pageSource, /import \{[^}]*resumeContactStaleNotice[^}]*\} from "@\/features\/applications"/);
});

/* THE TWO SCREENS, ONE DECISION. The packet review screen (View exact PDF / Review and fill / Edit
 * resume) computes it off `selectedSubmission`; the Review-and-send screen's own checklist
 * (SubmissionScreen) computes it off its own `submission` prop. Two calls are expected and correct -
 * each screen owns its own data - but both call the SAME function, which is the property this test
 * exists to hold: a screen that instead read `resume_contact_stale` off its own submission object by
 * hand is exactly how the two screens end up disagreeing about what counts as stale. */
test("both the packet screen and the send screen's checklist decide through resumeContactStaleNotice", () => {
  const calls = pageSource.match(/resumeContactStaleNotice\(/g) ?? [];
  // One import-site mention plus at least two call sites (packet screen, SubmissionScreen).
  assert.ok(calls.length >= 2, `expected at least 2 calls to resumeContactStaleNotice, found ${calls.length}`);
  assert.match(pageSource, /const resumeContactStale = resumeContactStaleNotice\(selectedSubmission\);/,
    "the packet review screen's own decision, off the packet currently selected");
  assert.match(pageSource, /const resumeContactStale = resumeContactStaleNotice\(submission\);/,
    "SubmissionScreen's own decision, off the submission prop it already receives - no extra data prop needed");
});

test("the notice renders on both screens through one shared component", () => {
  const renders = pageSource.match(/<ResumeContactStaleNotice/g) ?? [];
  assert.equal(renders.length, 2,
    "exactly one render in the packet review screen and one inside SubmissionScreen's checklist - a"
    + " third copy, or a screen that inlines its own markup instead, is how the two notices drift apart");
  assert.match(pageSource, /function ResumeContactStaleNotice\(/,
    "a single component definition backs both render sites");
});

test("the notice names the problem and shows both headers in plain text", () => {
  assert.match(pageSource, /This resume&apos;s contact details are out of date\./);
  assert.match(pageSource, /resumeContactLine\(notice\.stored\)/);
  assert.match(pageSource, /resumeContactLine\(notice\.current\)/);
  // The shared formatter, not a second hand-rolled reader of _contact's key names - see the import
  // comment on ApplicationPacket/contactLine in this file for why that already went wrong once.
  assert.match(pageSource, /import \{ resumeContactLine \} from "@\/lib\/resumeContact"/);
});

test("the button names the action and disables while the request is in flight", () => {
  assert.match(pageSource, /Update the contact details on this resume/);
  assert.match(
    pageSource,
    /<Button type="button" onClick=\{onRefresh\} disabled=\{busy \|\| disabled \|\| Boolean\(unavailableReason\)\} size="sm"/,
    "the shared component's own button must disable on its `busy` prop, its `disabled` prop (another"
    + " in-flight mutation on the same screen), and whenever `unavailableReason` says this"
    + " application's own status would 409 - dropping any one of the three re-opens a press the"
    + " server was always going to refuse or a race with a sibling control",
  );
  // Both call sites must feed a real busy signal, not a constant.
  assert.match(pageSource, /busy=\{resumeContactRefreshId === selected\.id\}/,
    "the packet review screen's busy flag, scoped to the selected packet");
  assert.match(pageSource, /busy=\{resumeContactRefreshBusy\}/,
    "SubmissionScreen's busy flag, passed down as a prop rather than re-derived");
});

/* FINDING 2, FIRST HALF: the packet review screen's own notice was gated on nothing but
 * resumeContactStaleNotice, so its button was clickable on a submission_claimed, submitting or
 * submitted packet exactly as readily as on a resume_ready one, and the backend's 409 arrived with
 * no hint beforehand why. resumeContactRefreshBlockedReason mirrors the backend's own
 * reviewAnswerSaveDisposition gate - see its doc comment in resume-contact-stale.ts - and this
 * screen is the one that had no other control to explain a refusal, so it gets the reason text; the
 * checklist screen below gets mutual exclusion instead (bullet two of the same finding). */
test("the packet review screen's notice explains a status the backend would refuse before the press", () => {
  assert.match(domainSource, /export function resumeContactRefreshBlockedReason\(/,
    "ported from the backend's reviewAnswerSaveDisposition rather than discovered only by a 409");
  assert.match(
    pageSource,
    /unavailableReason=\{review \? resumeContactRefreshBlockedReason\(review\) : null\}/,
    "the packet review screen's own call site, off the same `review` its other status checks read",
  );
});

/* ROUND 2, FIRST HALF. Before this, the checklist screen's own ResumeContactStaleNotice render (the
 * one this notice was ADDED for - it renders only at ready_for_final_approval) passed no
 * `unavailableReason` at all, so its button stayed pressable and undisabled whether or not the
 * backend's own resumeContactRefreshDisposition would 409 it - the same gap the packet review
 * screen's own unavailableReason (test above) was written to close, left open on its sibling. Now
 * that ready_for_final_approval is sometimes open and sometimes refused (a claim, or employer-may-hold
 * evidence), an unwired button here would silently 409 on exactly the packets this round exists to
 * unblock, with no reason shown first. */
test("the checklist screen's notice explains a status the backend would refuse before the press too", () => {
  assert.match(
    pageSource,
    /unavailableReason=\{resumeContactRefreshBlockedReason\(review\)\}/,
    "SubmissionScreen's own call site, off the same `review` it destructures from its `submission` prop",
  );
});

/* FINDING 2, SECOND HALF: mutual exclusion between the checklist screen's own in-flight review
 * mutations. Before this, the contact-refresh button sat beside Start it again / Fill the form
 * again (both `disabled={restarting}` only) and Send (`disabled={finalApprovalBlocked}`, which read
 * `approving` and `restarting` but had never heard of a contact refresh), so any two of the four
 * could be pressed together and race the same packet. */
test("the checklist screen's four review mutations are pairwise mutually exclusive", () => {
  assert.match(
    pageSource,
    /disabled=\{restarting \|\| approving\}/,
    "the refresh button must disable while a restart OR an approval is in flight",
  );
  const startAgainAndFillAgain = pageSource.match(/disabled=\{restarting \|\| resumeContactRefreshBusy\}/g) ?? [];
  assert.equal(
    startAgainAndFillAgain.length,
    2,
    "both Start it again and Fill the form again must disable while a contact refresh is in flight -"
    + ` found ${startAgainAndFillAgain.length} matching button(s)`,
  );
  assert.match(
    pageSource,
    /const finalApprovalBlocked = [^;]*\|\| transcriptPending \|\| resumeContactRefreshBusy;/,
    "Send must disable while a contact refresh is in flight too, appended at the end of"
    + " finalApprovalBlocked like every other term this line has ever gained - see"
    + " tests/application-submission-gate.test.mjs for why this line is pinned whole elsewhere",
  );
});

/* THE HANDLER ITSELF: posts the documented route through api(), the app's existing authenticated
 * fetch helper (never a bare fetch), and does so exactly once. */
test("refreshResumeContact posts the documented route through the app's api() helper", () => {
  assert.match(handlerBody, /async function refreshResumeContact\(applicationId: string\) \{/);
  assert.match(
    handlerBody,
    /await api<\{ application_id: string; review: SubmissionResponse\["review"\] \}>\(\s*`\/applications\/\$\{applicationId\}\/resume\/contact-refresh`,\s*\{ method: "POST" \},\s*\)/,
    "POST /applications/:id/resume/contact-refresh, through api<T>() rather than a bare fetch",
  );
  const routeMentions = pageSource.match(/\/resume\/contact-refresh/g) ?? [];
  assert.equal(routeMentions.length, 1, "the route is named in exactly one place in this file");
});

test("refreshResumeContact guards against a second press landing mid-flight", () => {
  assert.match(handlerBody, /if \(resumeContactRefreshId\) return;/,
    "a second call while one is already in flight for some packet must be a no-op, the same guard"
    + " metadataRefreshRef and approveInFlight use elsewhere on this screen");
});

/* THE REDUCER. A successful response carries only `{ application_id, review }`, never a full
 * submission envelope (see the route's own doc comment on the backend), so it must be merged into
 * the latest known submission and reconciled through nextSubmissionState/publishSubmissionEnvelope -
 * the same two functions every other direct mutation on this screen installs its response through -
 * rather than cast straight into submissionResponseForDisplay, which would quarantine this packet's
 * submission authority as a side effect of a request that has nothing to do with it. */
test("a successful refresh is installed through the shared submission reducer", () => {
  assert.match(handlerBody, /review: result\.review,/, "the response's review replaces the stored one");
  assert.match(handlerBody, /resume_contact_stale: undefined,/,
    "cleared explicitly rather than left stale until the next poll - the request that just landed"
    + " is itself the proof the header is no longer stale");
  assert.match(handlerBody, /const reconciled = nextSubmissionState\(latestSubmission, refreshed\);/);
  assert.match(handlerBody, /publishSubmissionEnvelope\(submissionRef, reconciled, "direct"\)/);
  assert.doesNotMatch(handlerBody, /submissionResponseForDisplay/,
    "this route returns no submission_authority/submission_projection at all, so running its"
    + " response through the authority-quarantine path would misread silence as a rejection");
});

/* ROUND 2, SECOND HALF. volley-backend PR #945's round 2 makes the contact-refresh route move an
 * unclaimed, no-evidence ready_for_final_approval packet's status forward (the same
 * questions_ready/ready_to_submit move a resume edit's reopen leaves it at), so the packet no longer
 * belongs on the approval checklist it was just refreshed from. nextSubmissionState's own
 * status-mismatch branch already installs that new status regardless of `updated_at` - see
 * submission-state.ts - but `screen` is separate useState nothing here re-derives from `review.status`
 * on render, exactly like every other direct mutation in this file (saveReviewedAnswers,
 * completeHandoff, recordSelfSubmitted all call moveToScreen off their own published review). Without
 * this call the applicant would keep seeing the now-stale checklist for a packet the server has
 * already moved off it. */
test("a successful refresh routes the screen off a status it no longer applies to", () => {
  assert.match(
    handlerBody,
    /moveToScreen\(screenForStatus\(published\.review\.status, "portal"\)\)/,
    "the same screenForStatus(status, \"portal\") shape saveReviewedAnswers's direct flow already"
    + " uses to route the checklist screen off a review its own mutation moved",
  );
});

/* FINDING 1. Every other handler in this file that installs a new `review` also reconciles the
 * client's packet evidence off it (reconcilePacketEvidenceWithSubmission, ~5 call sites) - this one
 * did not, so after the backend regenerated the PDF the cached activePacketEvidence kept reporting
 * the OLD file as verified and acknowledged: the exact-packet panel kept showing the pre-refresh
 * digest and download link, and Send stayed enabled over a file nobody had reviewed.
 *
 * NOT reconcilePacketEvidenceWithSubmission, deliberately: that function diffs `review.packet_audit`,
 * and this route leaves `_review.packet_audit` untouched on the backend (see
 * reconcilePacketEvidenceAfterResumeRegeneration's own doc comment in packet-evidence-session.ts),
 * so handing it the response's `review.packet_audit` would compare the unchanged audit to itself and
 * report a match - code that compiles, reads plausibly, and keeps the exact bug this finding is
 * about. The doesNotMatch below pins that this handler does not silently regress onto it. */
test("a successful refresh invalidates cached packet evidence for this application", () => {
  assert.match(
    handlerBody,
    /const nextEvidence = reconcilePacketEvidenceAfterResumeRegeneration\(packetEvidenceRef\.current, applicationId\);/,
    "the one reconcile that actually clears a now-stale acknowledgement for this route - see its own"
    + " doc comment in packet-evidence-session.ts for why the identity-diffing reconcile cannot",
  );
  assert.match(handlerBody, /packetEvidenceRef\.current = nextEvidence;/);
  assert.match(handlerBody, /setPacketEvidence\(nextEvidence\);/);
  assert.doesNotMatch(
    handlerBody,
    /reconcilePacketEvidenceWithSubmission\(/,
    "this route leaves review.packet_audit unchanged, so the identity-diffing reconcile every other"
    + " handler uses would compare the unchanged audit to itself, report a match, and keep a"
    + " now-stale acknowledgement alive - the exact bug this finding closes",
  );
});

/* FINDING 3. `latestSubmission.application_id === applicationId` and
 * `selectedIdRef.current === applicationId` could each be deleted (or loosened to `if (true)`) and
 * every test above would still pass, because none of them checks that the guard actually WRAPS the
 * write it appears to gate - only that the guard's text and the write's text both exist somewhere in
 * the function. requiredIndex/assertOrdered close that: a guard that is deleted, or that survives
 * but moves to after the write it was meant to protect, fails this test either way. Mirrors the
 * precedent in tests/application-direct-answer-flow.test.mjs, which pins
 * "selectedIdRef.current === applicationId" the same way for saveReviewedAnswers's own refused-save
 * branch. */
test("the two id-matching guards actually wrap the writes they gate, not just decorate them", () => {
  const latestGuard = requiredIndex(
    handlerBody,
    "latestSubmission.application_id === applicationId",
    "latest-submission ownership guard",
  );
  const snapshotWrite = requiredIndex(
    handlerBody,
    "submissionSnapshotsRef.current.set(applicationId, reconciled)",
    "submission snapshot write",
    latestGuard,
  );
  const packetsWrite = requiredIndex(handlerBody, "setPackets((current)", "packet list write", latestGuard);
  const selectedGuard = requiredIndex(
    handlerBody,
    "selectedIdRef.current === applicationId",
    "selected-application ownership guard",
    Math.max(snapshotWrite, packetsWrite),
  );
  const evidenceWrite = requiredIndex(handlerBody, "setPacketEvidence(nextEvidence)", "packet evidence write", selectedGuard);
  const submissionWrite = requiredIndex(handlerBody, "setSubmission(published)", "visible submission write", evidenceWrite);
  // The round 2 screen-routing call: it reads `published`, so it must come from inside the same
  // selected-application guard as the write above, not merely somewhere in the function.
  const screenRoute = requiredIndex(
    handlerBody,
    "moveToScreen(screenForStatus(published.review.status, \"portal\"))",
    "screen-routing call",
    submissionWrite,
  );
  assertOrdered(
    [latestGuard, snapshotWrite, packetsWrite, selectedGuard, evidenceWrite, submissionWrite, screenRoute],
    "latest-submission ownership must wrap the snapshot/packet writes every caller gets, and"
    + " selected-application ownership must additionally wrap the writes only the visible screen"
    + " gets - deleting or reordering either guard must fail this test",
  );
});

test("a refusal renders through userFacingError, including the documented 409s", () => {
  assert.match(
    handlerBody,
    /message: userFacingError\(reason, "Litos could not update this resume's contact details\. Try again\."\)/,
    "CONTACT_REFRESH_NOT_AVAILABLE and resume_email_regeneration_required both arrive as an"
    + " ApiError whose message is the server's own sentence; userFacingError shows it verbatim and"
    + " only falls back for a technical-looking one",
  );
});

test("the packet screen wires the handler to the button it renders beside Edit resume", () => {
  assert.match(pageSource, /onRefresh=\{\(\) => void refreshResumeContact\(selected\.id\)\}/);
});

test("SubmissionScreen receives the handler and busy/error state as props, not as a data prop it re-derives", () => {
  assert.match(
    pageSource,
    /onOpenWithExtension, extensionFillBusy, extensionFillError, onRefreshResumeContact, resumeContactRefreshBusy, resumeContactRefreshError \}: \{/,
    "the three new props must be threaded through SubmissionScreen's own destructure",
  );
  assert.match(
    pageSource,
    /onRefreshResumeContact=\{\(\) => void refreshResumeContact\(selected\.id\)\}/,
  );
});

test("the send screen's checklist gates the notice to ready_for_final_approval, beside the other pre-send checks", () => {
  assert.match(
    pageSource,
    /review\.status === "ready_for_final_approval" && resumeContactStale && \(/,
    "rendered in the same checklist as the packetEvidenceReviewed and educationProfilePending"
    + " checks immediately above it, not as a standing banner on every status this screen renders",
  );
});
