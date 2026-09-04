/* A CLOSED OR PAST-DEADLINE POSTING IS SAID BEFORE SHE SENDS.
 *
 * volley-backend's matching PR (fix/a-closed-posting-says-so-before-she-sends) adds posting_status
 * to GET /applications/:id/submission and GET /resume/history, and
 * POST /applications/:id/posting-status/confirm-open for the one thing that can turn a stated
 * deadline back on: her own word that the employer still accepts applications. This file pins the
 * client wiring - in the style of tests/resume-contact-refresh-control.test.mjs, the closest sibling
 * feature this repo already ships (same shape: a small POST action, busy/error state, a notice
 * rendered on two screens) - since the behaviour lives inside a large client component with no
 * render harness in this repo.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PAGE = new URL("../app/dashboard/applications/page.tsx", import.meta.url);
const API = new URL("../lib/api.ts", import.meta.url);
const FILTER = new URL("../features/applications/domain/application-filter.ts", import.meta.url);
const INDEX = new URL("../features/applications/index.ts", import.meta.url);

/* Comments stripped before every assertion, the same way resume-contact-refresh-control.test.mjs
   does it: this fix necessarily explains itself in prose that names the very identifiers being
   asserted on, and a bare grep would count the explanation as the code. */
function shippedCode(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

let pageSource;
let apiSource;
let filterSource;
let handlerBody;

test.before(async () => {
  pageSource = shippedCode(await readFile(PAGE, "utf8"));
  apiSource = shippedCode(await readFile(API, "utf8"));
  filterSource = shippedCode(await readFile(FILTER, "utf8"));
  const start = pageSource.indexOf("async function confirmPostingOpen");
  assert.ok(start > 0, "confirmPostingOpen must exist");
  const next = pageSource.slice(start + 1).search(/\n {2}(?:async )?function [A-Za-z]/);
  handlerBody = next === -1 ? pageSource.slice(start) : pageSource.slice(start, start + 1 + next);
});

test("the domain module is wired into the public feature index", async () => {
  const index = shippedCode(await readFile(INDEX, "utf8"));
  assert.match(index, /export \* from "\.\/domain\/application-filter"/,
    "postingStatusBlocksSend and postingStatusBadge must reach the dashboard through the same public API every other domain module uses");
});

test("lib/api.ts types posting_status and posting_confirmed_open_at on ApplicationReview", () => {
  assert.match(apiSource, /posting_status\?: \{/);
  assert.match(apiSource, /state: "closed" \| "deadline_passed";/);
  assert.match(apiSource, /reason: "monitor_inactive" \| "stated_deadline";/);
  assert.match(apiSource, /posting_confirmed_open_at\?: string;/);
  assert.match(apiSource, /"posting_closed"/, "the new attention category must be in the client's own copy of the union");
});

test("lib/api.ts exposes a typed client call for the confirm-open route", () => {
  assert.match(
    apiSource,
    /export function confirmPostingStillOpen\(applicationId: string\)/,
  );
  assert.match(
    apiSource,
    /api<\{ application_id: string; review: ApplicationReview; saved: boolean \}>\(\s*`\/applications\/\$\{applicationId\}\/posting-status\/confirm-open`,\s*\{ method: "POST" \},\s*\)/,
    "POST /applications/:id/posting-status/confirm-open, through api<T>() rather than a bare fetch",
  );
});

test("application-filter.ts adds the closed bucket and the posting_status predicates", () => {
  assert.match(filterSource, /"all" \| "action" \| "ready" \| "submitted" \| "closed"/);
  assert.match(filterSource, /export function postingStatusBlocksSend\(/);
  assert.match(filterSource, /export function postingStatusBadge\(/);
  assert.match(filterSource, /if \(filter === "closed"\) return reviewPostingClosed\(normalized\);/);
});

test("the Tracker's filter select offers the closed view", () => {
  assert.match(pageSource, /<option value="closed">Closed<\/option>/);
});

test("the notice component exists and renders on both screens a ready packet can be on", () => {
  assert.match(pageSource, /function PostingStatusNotice\(/);
  const renders = pageSource.match(/<PostingStatusNotice/g) ?? [];
  assert.equal(
    renders.length,
    2,
    "exactly one render in the default review screen (where a ready_to_submit/resume_ready/"
    + "questions_ready packet like the measured Mercari one is shown) and one inside SubmissionScreen"
    + " (needs_attention/ready_for_final_approval/awaiting_security_code) - a third copy, or a screen"
    + ` that inlines its own markup instead, is how the two notices drift apart; found ${renders.length}`,
  );
});

test("the notice names the two states in plain text and shows the backend's own sentence", () => {
  assert.match(pageSource, /This posting has closed\./);
  assert.match(pageSource, /This posting's stated deadline has passed\./);
  assert.match(pageSource, /\{review\.attention_reason && <p className="mt-1 text-ink">\{review\.attention_reason\}<\/p>\}/,
    "the exact sentence the backend derived, not a client-invented paraphrase");
});

test("a closed take-down renders no button; only an unconfirmed deadline does", () => {
  assert.match(
    pageSource,
    /const deadlinePassedUnconfirmed = status\?\.state === "deadline_passed" && !status\.confirmed_open_at;/,
  );
  assert.match(
    pageSource,
    /\{deadlinePassedUnconfirmed && \(\s*<Button type="button" onClick=\{onConfirmOpen\} disabled=\{busy\} size="sm" className="mt-3">/,
    "the confirm button is gated on the unconfirmed-deadline condition alone, never rendered for state 'closed'",
  );
});

test("the button names the action and disables while the request is in flight", () => {
  assert.match(pageSource, /The employer still accepts applications/);
});

test("both call sites feed a real busy/error signal scoped to the selected packet, not a constant", () => {
  assert.match(pageSource, /busy=\{confirmPostingOpenId === selected\.id\}/,
    "the review screen's busy flag, scoped to the selected packet");
  assert.match(pageSource, /busy=\{confirmPostingOpenBusy\}/,
    "SubmissionScreen's busy flag, passed down as a prop rather than re-derived");
  assert.match(pageSource, /error=\{confirmPostingOpenError\?\.applicationId === selected\.id \? confirmPostingOpenError\.message : null\}/);
});

test("SubmissionScreen receives the handler and busy/error state as props, not as a data prop it re-derives", () => {
  assert.match(
    pageSource,
    /onRefreshResumeContact, resumeContactRefreshBusy, resumeContactRefreshError, onConfirmPostingOpen, confirmPostingOpenBusy, confirmPostingOpenError \}: \{/,
    "the three new props must be threaded through SubmissionScreen's own destructure, right after the resume-contact-refresh trio it mirrors",
  );
  assert.match(pageSource, /onConfirmPostingOpen=\{\(\) => void confirmPostingOpen\(selected\.id\)\}/);
});

test("the send screen's checklist refuses a closed or unconfirmed-expired posting, and disables while confirming", () => {
  assert.match(
    pageSource,
    /const finalApprovalBlocked = [^;]*\|\| postingStatusBlocksSend\(review\) \|\| confirmPostingOpenBusy;/,
    "appended at the end of finalApprovalBlocked like every other term this line has ever gained",
  );
});

test("confirmPostingOpen posts through the typed client call and guards against a second press mid-flight", () => {
  assert.match(handlerBody, /async function confirmPostingOpen\(applicationId: string\) \{/);
  assert.match(handlerBody, /if \(confirmPostingOpenId\) return;/,
    "a second call while one is already in flight for some packet must be a no-op, the same guard refreshResumeContact uses");
  assert.match(handlerBody, /const result = await confirmPostingStillOpen\(applicationId\);/);
});

test("a successful confirmation is installed through the shared submission reducer", () => {
  assert.match(handlerBody, /review: result\.review,/, "the response's review, carrying the re-derived posting_status, replaces the stored one");
  assert.match(handlerBody, /const reconciled = nextSubmissionState\(latestSubmission, refreshed\);/);
  assert.match(handlerBody, /publishSubmissionEnvelope\(submissionRef, reconciled, "direct"\)/);
});

test("a refusal renders through userFacingError", () => {
  assert.match(
    handlerBody,
    /message: userFacingError\(reason, "Litos could not confirm this posting is still open\. Try again\."\)/,
  );
});
