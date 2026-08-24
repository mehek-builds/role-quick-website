import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documents = await readFile(new URL("../app/dashboard/documents/page.tsx", import.meta.url), "utf8");
const applications = await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("Documents makes both directions of tab overflow deliberate on narrow screens", () => {
  assert.match(documents, /const \[showDocumentsTabLeftOverflowCue, setShowDocumentsTabLeftOverflowCue\] = useState\(false\)/);
  assert.match(documents, /setShowDocumentsTabLeftOverflowCue\(viewport\.scrollLeft > 2\)/);
  assert.match(documents, /\{showDocumentsTabLeftOverflowCue && \(/);
  assert.match(documents, /absolute inset-y-0 left-0[^"]*bg-gradient-to-r from-bg/);
  assert.match(documents, /const safeLeft = viewportRect\.left \+ \(hasLeftOverflow \? 48 : 0\)/);
  assert.match(documents, /selected\.scrollIntoView\(\{[\s\S]*?inline: "center"[\s\S]*?prefers-reduced-motion: reduce/);
  assert.match(documents, /\[scroll-padding-inline-start:3rem\][^\n]*\[scroll-padding-inline-end:3rem\]/);
  assert.match(documents, /snap-x snap-proximity/);
  assert.match(documents, /min-h-11 shrink-0 snap-start/);
});

test("Applications stacks task copy above its action and aligns actions beside tasks on wider screens", () => {
  const start = applications.indexOf("function ChecklistRow(");
  const end = applications.indexOf("\nfunction BlockerList(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const row = applications.slice(start, end);

  assert.match(row, /grid-cols-\[18px_minmax\(0,1fr\)\][^"]*sm:grid-cols-\[18px_minmax\(0,1fr\)_auto\]/);
  assert.match(row, /<span className="block min-w-0 sm:col-start-2">\s*<span className="block min-w-0 break-words">/);
  assert.match(row, /col-start-2 mt-2[^"\n]*sm:col-start-3 sm:row-start-1 sm:mt-0 sm:justify-self-end/);
  assert.match(applications, /const CHECKLIST_ACTION_CLASS = "[^"]*min-h-11[^"]*"/);
  assert.match(row, /<a href=\{control\.href\}[^>]*className=\{done \? CHECKLIST_SETTLED_ACTION_CLASS : CHECKLIST_ACTION_CLASS\}/);
});

test("Applications folds completed checks behind a readable disclosure while input is still needed", () => {
  assert.match(applications, /needsAttention && !awaitingUnverifiedSubmission \? \(\s*<details className="group mt-4 border-t border-border pt-4">/);
  assert.match(applications, /\{completedItems\.length\} \{completedItems\.length === 1 \? "check" : "checks"\} already complete/);
  assert.match(applications, /min-h-11 cursor-pointer/);
  assert.match(applications, /group-open:hidden">Show<\/span>/);
  assert.match(applications, /group-open:inline">Hide<\/span>/);
  assert.match(globals, /summary:focus-visible,\s*\n\[tabindex\]:not/);
});

test("Applications input tasks use the named Litos type, spacing, and control tokens", () => {
  const promptStart = applications.indexOf("function DirectApplicationQuestion(");
  const promptEnd = applications.indexOf("\nfunction SubmissionScreen(", promptStart);
  assert.notEqual(promptStart, -1);
  assert.notEqual(promptEnd, -1);
  const directPrompt = applications.slice(promptStart, promptEnd);

  assert.match(applications, /needsAttention && !awaitingUnverifiedSubmission \? "p-4 sm:p-6" : "p-7"/);
  assert.match(directPrompt, /font-mono text-label font-medium uppercase/);
  assert.match(directPrompt, /text-heading font-medium leading-tight/);
  assert.match(directPrompt, /rounded-inner border border-control-border/);
  assert.match(directPrompt, /<Button type="submit" block className="sm:w-auto"/);
  assert.match(directPrompt, /Save to application/);
  assert.match(directPrompt, /Saved to this application\./);
  assert.match(directPrompt, /Litos saves this answer to this application before showing the next one\./);
  assert.doesNotMatch(directPrompt, /bg-warn|border-warn|text-warn/);
  assert.doesNotMatch(directPrompt, /text-\[(?:10|11)px\]/);
});
