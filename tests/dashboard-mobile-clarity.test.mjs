import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documents = await readFile(new URL("../app/dashboard/documents/page.tsx", import.meta.url), "utf8");
const applications = await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

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

test("Applications stacks task copy above its action without shrinking the mobile target", () => {
  const start = applications.indexOf("function ChecklistRow(");
  const end = applications.indexOf("\nfunction BlockerList(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const row = applications.slice(start, end);

  assert.match(row, /<span className="block min-w-0">\s*<span className="block min-w-0 break-words">/);
  assert.match(applications, /const CHECKLIST_ACTION_CLASS = "[^"]*min-h-11[^"]*"/);
  assert.match(row, /<a href=\{control\.href\}[^>]*className=\{done \? CHECKLIST_SETTLED_ACTION_CLASS : CHECKLIST_ACTION_CLASS\}/);
});
