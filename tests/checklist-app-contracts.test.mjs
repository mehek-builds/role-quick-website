import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("account deletion uses an accessible dialog and completion state", () => {
  const page = read("app/dashboard/settings/page.tsx");
  assert.doesNotMatch(page, /window\.prompt/);
  assert.match(page, /<dialog/);
  assert.match(page, /aria-labelledby="delete-title"/);
  assert.match(page, /Your Litos account was deleted/);
  assert.match(page, /Export data/);
  assert.match(page, /I am willingly deleting my account and I confirm that all of my history will be erased\./);
  assert.match(page, /deleteConfirmation === DELETE_CONFIRMATION_PHRASE/);
  assert.doesNotMatch(page, /deleteConfirmation\.trim\(\)\.toLowerCase\(\)/);
});

test("profile and resume saves remain disabled while pristine", () => {
  assert.match(read("app/dashboard/settings/page.tsx"), /disabled=\{saving \|\| !profileDirty\}/);
  assert.match(read("app/dashboard/resume/page.tsx"), /disabled=\{saving \|\| uploading \|\| bankRefreshing \|\| entries === null \|\| bankLoadError !== null \|\| !entriesDirty\}/);
});

test("billing exposes truthful failed and canceled return states", () => {
  const page = read("app/dashboard/settings/page.tsx");
  assert.match(page, /billingNotice === "success"/);
  assert.match(page, /billingNotice === "cancelled"/);
  assert.match(page, /Checkout was canceled\. Nothing was charged\. Your work is saved\./);
  assert.match(page, /Open secure billing portal/);
  assert.match(page, /isSafeBillingPortalUrl/);
  assert.match(page, /Payment method, receipts, invoices, discounts, and cancellation are managed there/);
});

test("loading and notices have shared accessible semantics", () => {
  const ui = read("components/app/ui.tsx");
  assert.match(ui, /aria-busy=\{state === "working"/);
  assert.match(ui, /aria-hidden="true" className="rq-shimmer/);
  assert.match(ui, /export function Notice/);
  assert.match(ui, /<span className="sr-only">\{notice\.label\}/);
});

test("resume upload supports drop, file limits, progress, and retry", () => {
  const page = read("app/dashboard/resume/page.tsx");
  assert.match(page, /onDrop=/);
  assert.match(page, /Maximum 10 MB/);
  assert.match(page, /Reading the PDF/);
  assert.match(page, />Retry</);
});

test("contact fields validate on blur and clear field errors on edit", () => {
  const page = read("app/contact/page.tsx");
  assert.match(page, /onBlur=\{\(\) => setTouched/);
  assert.match(page, /aria-invalid=\{Boolean\(fieldErrors\.email\)\}/);
  assert.match(page, /c-message-error/);
  assert.match(page, /name: false/);
});

test("signup names itself in the heading and adds no subheading under it", () => {
  /* THE CONTRACT CHANGED, on Mehek's call, and this test changed with it rather than being deleted.
     It used to require the line "Free to start, no card needed...", on the reasoning that signup
     should state the next step. That line was cut: the heading says what the screen is, and the two
     labelled controls under it say how, so naming them again in prose was the say-once rule broken
     against the product's own furniture.

     Null, not an empty string, is the half worth pinning. An empty subheading still renders a <p>
     carrying mt-2, which leaves the heading trailed by a gap holding nothing, and that is the shape
     this would silently regress into. */
  const page = read("app/login/page.tsx");
  assert.match(page, /\? "Create your account"/);
  assert.doesNotMatch(page, /Free to start, no card needed/);
  assert.match(page, /flow === "signup"\s*\n\s*\? null/);
  assert.match(page, /\{signupSubheading && \(/);
});

test("the address note is stated once, above whichever ways in the screen offers", () => {
  /* A Google signup never reaches the Email field, so the note has to sit above the button too,
     and it must not then be said twice on one small card. The two renders are mutually exclusive
     on `showGoogle`, which is what keeps a single #email-hint in the document and the
     aria-describedby on the input pointing at exactly one node. */
  const page = read("app/login/page.tsx");
  assert.match(page, /const showGoogle = Boolean\(googleClientId\) && !claimMode && \(flow === "signin" \|\| flow === "signup"\)/);
  assert.match(page, /const choosingAddress = flow === "signup" \|\| claimMode/);
  assert.match(page, /\{choosingAddress && showGoogle && \(/);
  assert.match(page, /\{choosingAddress && !showGoogle && \(/);
  assert.match(page, /aria-describedby=\{choosingAddress \? "email-hint" : undefined\}/);
  assert.equal(page.match(/id="email-hint"/g)?.length, 2, "one render per branch, and no third copy");
});
