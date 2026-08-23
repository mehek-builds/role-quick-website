import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documents = await readFile(new URL("../app/dashboard/documents/page.tsx", import.meta.url), "utf8");
const network = await readFile(new URL("../app/dashboard/network/page.tsx", import.meta.url), "utf8");

test("Network exposes one keyboard-operable tab interface", () => {
  assert.match(network, /role="tablist" aria-label="Network sections"/);
  assert.match(network, /role="tab"[\s\S]{0,180}?id=\{`network-tab-\$\{id\}`\}/);
  assert.match(network, /aria-selected=\{tab === id\}/);
  assert.match(network, /aria-controls=\{`network-panel-\$\{id\}`\}/);
  assert.match(network, /tabIndex=\{tab === id \? 0 : -1\}/);
  assert.match(network, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(network, /id=\{`network-panel-\$\{tab\}`\} role="tabpanel" aria-labelledby=\{`network-tab-\$\{tab\}`\}/);
  assert.doesNotMatch(network, /aria-current=\{tab ===/);
});

test("Documents exposes one keyboard-operable tab interface", () => {
  assert.match(documents, /role="tablist"\s+aria-label="Document sections"/);
  assert.match(documents, /role="tab"[\s\S]{0,180}?id=\{`documents-tab-\$\{value\}`\}/);
  assert.match(documents, /aria-selected=\{tab === value\}/);
  assert.match(documents, /aria-controls=\{`documents-panel-\$\{value\}`\}/);
  assert.match(documents, /tabIndex=\{tab === value \? 0 : -1\}/);
  assert.match(documents, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(documents, /id=\{`documents-panel-\$\{tab\}`\} role="tabpanel" aria-labelledby=\{`documents-tab-\$\{tab\}`\}/);
  assert.doesNotMatch(documents, /aria-current=\{tab ===/);
});

test("Documents exposes a truthful narrow-screen overflow cue", () => {
  assert.match(documents, /const \[documentsTabsViewport, setDocumentsTabsViewport\] = useState<HTMLDivElement \| null>\(null\)/);
  assert.match(documents, /ref=\{setDocumentsTabsViewport\}/);
  assert.match(documents, /viewport\.scrollWidth - viewport\.clientWidth - viewport\.scrollLeft/);
  assert.match(documents, /viewport\.addEventListener\("scroll", updateOverflowCue, \{ passive: true \}\)/);
  assert.match(documents, /new ResizeObserver\(updateOverflowCue\)/);
  assert.match(documents, /\{showDocumentsTabOverflowCue && \(/);
  assert.match(documents, /aria-hidden="true"[\s\S]{0,240}?sm:hidden/);
});
