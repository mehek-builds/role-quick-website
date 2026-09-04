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
  assert.match(pageSource, /<Button type="button" onClick=\{onRefresh\} disabled=\{busy\}/,
    "the shared component's own button must disable on its `busy` prop");
  // Both call sites must feed a real busy signal, not a constant.
  assert.match(pageSource, /busy=\{resumeContactRefreshId === selected\.id\}/,
    "the packet review screen's busy flag, scoped to the selected packet");
  assert.match(pageSource, /busy=\{resumeContactRefreshBusy\}/,
    "SubmissionScreen's busy flag, passed down as a prop rather than re-derived");
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
