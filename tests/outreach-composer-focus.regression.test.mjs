import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const outreach = await readFile(new URL("../app/dashboard/outreach/page.tsx", import.meta.url), "utf8");

test("the outreach composer returns focus to the control that opened it", () => {
  assert.match(outreach, /const composerTriggerRef = useRef<HTMLElement \| null>\(null\)/);
  assert.match(outreach, /const composerLogicalTriggerIdRef = useRef<string \| null>\(null\)/);
  assert.match(outreach, /const trigger = explicitTrigger \?\? document\.activeElement/);
  assert.match(outreach, /trigger instanceof HTMLElement && trigger !== document\.body/);
  assert.match(outreach, /composerTriggerRef\.current = trigger/);
  assert.match(outreach, /if \(trigger\?\.isConnected\) trigger\.focus\(\)/);
  assert.match(outreach, /const logicalTrigger = logicalTriggerId \? document\.getElementById\(logicalTriggerId\) : null/);
  assert.match(outreach, /if \(logicalTrigger\) logicalTrigger\.focus\(\)/);
  assert.match(outreach, /else document\.getElementById\("outreach-start-button"\)\?\.focus\(\)/);
});

test("the state-change trigger does not claim to control an unmounted composer", () => {
  const start = outreach.indexOf('id="outreach-start-button"');
  const end = outreach.indexOf("</Button>", start);
  const trigger = outreach.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.doesNotMatch(trigger, /aria-controls|aria-expanded/);
});

test("editing a saved draft uses the same trigger-aware composer path", () => {
  const start = outreach.indexOf("function editSavedDraft");
  const end = outreach.indexOf("async function saveEditedDraft", start);
  const editFlow = outreach.slice(start, end);

  assert.match(editFlow, /openComposer\("draft", trigger, outreachDraftEditTriggerId\(saved\.draft_id\)\)/);
  assert.doesNotMatch(editFlow, /\.focus\(\)/);
});

test("a refreshed saved draft exposes the stable logical Edit trigger used for focus return", () => {
  assert.match(outreach, /function outreachDraftEditTriggerId\(draftId: string\): string/);
  assert.match(outreach, /return `outreach-draft-edit-\$\{encodeURIComponent\(draftId\)\}`/);
  assert.match(outreach, /id=\{outreachDraftEditTriggerId\(e\.durableDraft\.draft_id\)\}/);
  assert.match(outreach, /composerLogicalTriggerIdRef\.current = logicalTriggerId/);
  assert.match(outreach, /const logicalTriggerId = composerLogicalTriggerIdRef\.current/);
  assert.match(outreach, /composerLogicalTriggerIdRef\.current = null/);
});

test("pointer activation passes the exact clicked controls into the focus path", () => {
  assert.match(outreach, /onClick=\{\(event\) => openComposer\("title", event\.currentTarget\)\}/);
  assert.match(outreach, /onClick=\{\(event\) => editSavedDraft\(e\.durableDraft!, event\.currentTarget\)\}/);
});

test("checkout restoration gives the reopened composer an intentional focus target", () => {
  const start = outreach.indexOf('has("checkout_action")');
  const end = outreach.indexOf("}, []);", start);
  const restore = outreach.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(restore, /focusDraftOnOpen\.current = restored\.editingDraftId !== null/);
  assert.match(restore, /focusComposerTitleOnOpen\.current = restored\.editingDraftId === null/);
  assert.match(restore, /setComposeOpen\(true\)/);
});
