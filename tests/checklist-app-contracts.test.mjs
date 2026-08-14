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
  assert.match(read("app/dashboard/resume/page.tsx"), /disabled=\{saving \|\| entries === null \|\| !entriesDirty\}/);
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

test("signup explicitly introduces account creation and the next step", () => {
  const page = read("app/login/page.tsx");
  assert.match(page, /\? "Create your account"/);
  assert.match(page, /Free to start, no card needed\. Choose a password, then verify your email/);
});
