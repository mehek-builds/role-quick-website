/**
 * The security-code control has to be a control.
 *
 * WHAT THIS IS FOR. A packet the employer is holding behind an emailed code is the only packet in
 * the product whose next step is typing. Greenhouse answers an unauthenticated submit by emailing an
 * 8-character code and rendering a code field, and files nothing until that code is entered and the
 * form is sent again. Three packets sat in exactly that condition on 2026-08-08 wearing status
 * "ready_for_final_approval" behind a green "Send it" button that could only have issued another
 * code.
 *
 * AND WHY IT IS A SOURCE-SHAPE TEST rather than a behavioural one. This repo has shipped controls
 * that looked right and were not: buttons rendered as <span> elements with nothing to bind to, which
 * is how 79 prepared resumes produced 0 sent applications. That defect class is invisible to a test
 * that reads copy and visible to one that reads the element. It is not a substitute for driving the
 * page - tests/e2e/dashboard-click-path.spec.mjs exists because source shape cannot catch behaviour
 * - but it is the cheapest thing that catches this particular way of shipping nothing.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
const buttonSource = readFileSync(new URL("../components/app/Button.tsx", import.meta.url), "utf8");
const card = source.slice(
  source.indexOf("function SecurityCodeCard"),
  source.indexOf("function SubmissionScreen"),
);

test("the card exists and is rendered for the state it is for", () => {
  assert.ok(card.length > 0, "SecurityCodeCard must exist");
  assert.match(source, /awaitingSecurityCode = review\.status === "awaiting_security_code"/);
  assert.match(source, /\{awaitingSecurityCode && \(\s*<SecurityCodeCard/);
});

test("the code goes into a real input, with a label bound to it", () => {
  // A <div contentEditable> or a styled <span> would read identically on screen and accept nothing
  // the browser can submit, autofill or announce.
  assert.match(card, /<input\b/, "the code field must be an <input>");
  assert.match(card, /id="security-code"/);
  assert.match(card, /<label htmlFor="security-code"/, "and it must have a label bound by htmlFor");
  // The browser's own name for a one-time code, so a code arriving by mail or SMS can be filled in
  // one tap rather than copied between apps.
  assert.match(card, /autoComplete="one-time-code"/);
});

test("the code keeps its case", () => {
  // Greenhouse's own example code is TPHJrFMJ, mixed case on purpose. An input that upper- or
  // lower-cases as you type destroys a valid code and produces a rejection nobody can explain.
  assert.match(card, /autoCapitalize="off"/);
  // Scoped to what happens to the VALUE. The card's own eyebrow carries a Tailwind `uppercase`
  // class, which styles a heading and touches nothing the applicant types.
  assert.doesNotMatch(card, /(code|value|cleaned)\s*\.\s*to(Upper|Lower)Case/);
  // And the field itself must not be styled into a case it does not have: `uppercase` on an input
  // changes what is rendered while the value keeps its real case, so the applicant is shown a code
  // that is not the code she typed.
  const inputTag = card.slice(card.indexOf("<input"), card.indexOf("placeholder="));
  assert.doesNotMatch(inputTag, /uppercase|lowercase|capitalize/);
});

test("the submit is a real button inside a real form", () => {
  assert.match(card, /<form\b[\s\S]*onSubmit=/, "the field must sit in a form with an onSubmit");
  assert.match(card, /<Button\s+type="submit"/, "the control must use the shared submit Button");
  assert.match(buttonSource, /return \(\s*<button type=\{type\}/, "the shared Button must render a native button");
  // Enter in the field has to work as well as the button. preventDefault is what stops the form
  // navigating instead of calling the handler.
  assert.match(card, /event\.preventDefault\(\)/);
  assert.match(card, /onSubmitCode\(cleaned\)/);
});

test("the button is not live until the code is the length the page asked for", () => {
  assert.match(card, /disabled=\{!ready \|\| submitting\}/);
  // Measured against the CONTROL's own field count, and only when the page reported one. A field
  // that insists on eight characters about a control that never said eight would refuse a valid
  // code.
  assert.match(card, /digits === 0 \? cleaned\.length >= 4 : cleaned\.length === digits/);
});

test("nothing here offers to send the application again", () => {
  // The failure being guarded is the one the three measured packets shipped: a green send button on
  // an application the employer already has. Pressing it issues another code and files nothing.
  assert.doesNotMatch(card, /Send it/);
  assert.doesNotMatch(card, /onApprove/);
});

test("the copy does not promise a filled page that no longer exists", () => {
  // The attended-handoff path in this same product says "Everything else is filled in" and then
  // opens a completely empty employer form, because the filled page lived in a browser session that
  // is gone. This card must not repeat that: the finishing run refills the form itself.
  assert.match(card, /fills the company form again/);
  assert.doesNotMatch(card, /still open|already filled in/);
});

test("a second press cannot start a second run at a real employer", () => {
  const handler = source.slice(
    source.indexOf("async function submitSecurityCode"),
    source.indexOf("async function retryPreparation"),
  );
  assert.ok(handler.length > 0, "submitSecurityCode must exist");
  // A ref, not state: a second Enter or click can land in the same tick, before any re-render.
  assert.match(handler, /securityCodeInFlight\.current === selected\.id/);
  assert.match(handler, /securityCodeInFlight\.current = requestedId/);
  assert.match(handler, /securityCodeInFlight\.current = null/);
  // And the answer is installed only if the applicant is still looking at the packet it came from.
  assert.match(handler, /selectedIdRef\.current !== requestedId/);
});

test("the endpoint it posts to is the only one that may move this state", () => {
  const handler = source.slice(
    source.indexOf("async function submitSecurityCode"),
    source.indexOf("async function retryPreparation"),
  );
  assert.match(handler, /\/applications\/\$\{requestedId\}\/security-code/);
  assert.match(handler, /method: "POST"/);
  assert.match(handler, /JSON\.stringify\(\{ code \}\)/);
});

test("a stale exact packet leaves security-code mode without rendering the server sentence", () => {
  const handler = source.slice(
    source.indexOf("async function submitSecurityCode"),
    source.indexOf("async function retryPreparation"),
  );
  const catchStart = handler.indexOf("} catch (reason) {");
  const catchBody = handler.slice(catchStart, handler.indexOf("} finally {", catchStart));
  assert.ok(catchStart >= 0, "the security-code request must retain an explicit refusal path");
  assert.match(catchBody, /selectedIdRef\.current !== requestedId/);
  assert.match(catchBody, /await recoverPacketAuditReview\(requestedId, reason\)/);
  assert.ok(
    catchBody.indexOf("recoverPacketAuditReview(requestedId, reason)") < catchBody.indexOf("setSecurityCodeError("),
    "packet recovery must consume the coded refusal before applicant-facing error state is written",
  );
});
