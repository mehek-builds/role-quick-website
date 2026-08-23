import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const outreach = await readFile(new URL("../app/dashboard/outreach/page.tsx", import.meta.url), "utf8");

test("the outreach composer returns focus to the control that opened it", () => {
  assert.match(outreach, /const composerTriggerRef = useRef<HTMLElement \| null>\(null\)/);
  assert.match(outreach, /const trigger = document\.activeElement/);
  assert.match(outreach, /trigger instanceof HTMLElement && trigger !== document\.body/);
  assert.match(outreach, /composerTriggerRef\.current = trigger/);
  assert.match(outreach, /if \(trigger\?\.isConnected\) trigger\.focus\(\)/);
  assert.match(outreach, /else document\.getElementById\("outreach-start-button"\)\?\.focus\(\)/);
});

test("editing a saved draft uses the same trigger-aware composer path", () => {
  const start = outreach.indexOf("function editSavedDraft");
  const end = outreach.indexOf("async function saveEditedDraft", start);
  const editFlow = outreach.slice(start, end);

  assert.match(editFlow, /openComposer\("draft"\)/);
  assert.doesNotMatch(editFlow, /\.focus\(\)/);
});
